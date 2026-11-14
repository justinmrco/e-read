const { randomUUID, createHash, timingSafeEqual } = require('node:crypto');
const midtrans = require('../utils/midtrans');
const User = require('../models/User');
const Book = require('../models/Book');
const Transaction = require('../models/Transaction');
const PaymentRecovery = require('../models/PaymentRecovery');
const rateLimit = require('../middleware/rate-limit');
const notificationLimit = rateLimit(120, 15 * 60 * 1000, req => 'order:' + req.midtransOrderId);
const { objectId } = require('../utils/validation');
const paidStatuses = ['settlement', 'capture'];
function orderResult(trx) {
  return { orderId: trx.orderId, order_id: trx.orderId, status: trx.transactionStatus, paid: paidStatuses.includes(trx.transactionStatus), amount: trx.amount, items: trx.items, checkoutState: trx.checkoutState, redirect_url: trx.activeCheckout && trx.checkoutState === 'ready' ? trx.checkoutUrl : undefined };
}

async function checkout(req, res, next, cart) {
  const submitted = cart ? req.body?.bookIds : [req.body?.bookId];
  const ids = Array.isArray(submitted) ? submitted.map(id => typeof id === 'string' ? id.toLowerCase() : id) : submitted;
  if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => !objectId(id)) || new Set(ids).size !== ids.length) return res.status(400).json({ message: 'Provide 1-50 unique valid book IDs.' });
  try {
    const active = await Transaction.findOne({ user: req.user.id, activeCheckout: true });
    if (active) return res.json({ ...orderResult(active), existing: true });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ message: 'Please log in again.' });
    if (ids.some(id => user.purchasedBooks.some(owned => owned.toString() === id))) return res.status(409).json({ message: 'Your library already contains one of these books. Remove it before checkout.' });
    if (await Transaction.exists({ user: req.user.id, transactionStatus: { $in: paidStatuses }, $or: [{ books: { $in: ids } }, { book: { $in: ids } }] })) return res.status(409).json({ message: 'A confirmed order already includes one of these books. Check your order history while library access is synchronized.' });
    const books = await Book.find({ _id: { $in: ids }, archived: { $ne: true } });
    if (books.length !== ids.length) return res.status(404).json({ message: 'One or more books are unavailable.' });
    if (books.some(book => !Number.isSafeInteger(book.price) || book.price <= 0)) return res.status(409).json({ message: 'One or more book prices are invalid.' });
    const amount = books.reduce((total, book) => total + book.price, 0);
    if (!Number.isSafeInteger(amount) || amount > 100000000) return res.status(400).json({ message: 'Order exceeds the sandbox checkout limit.' });
    const orderId = 'EREAD-' + randomUUID();
    let trx;
    try {
      trx = await Transaction.create({ user: req.user.id, books: ids, orderId, amount, activeCheckout: true, checkoutState: 'creating', items: books.map(book => ({ bookId: book.id, title: book.title, price: book.price })) });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const existing = await Transaction.findOne({ user: req.user.id, activeCheckout: true });
      if (!existing) throw error;
      return res.json({ ...orderResult(existing), existing: true });
    }
    try {
      const payment = await midtrans.createTransaction({
      transaction_details: { order_id: orderId, gross_amount: amount },
      customer_details: { first_name: user.username.slice(0, 50), email: user.email },
      item_details: books.map(book => ({ id: book.id, price: book.price, quantity: 1, name: book.title.slice(0, 50) })),
      callbacks: { finish: process.env.FRONTEND_URL + '/payment-success?order_id=' + encodeURIComponent(orderId) },
      });
      const destination = new URL(payment.redirect_url);
      if (destination.origin !== 'https://app.sandbox.midtrans.com' || destination.username || destination.password) throw new Error('Invalid sandbox payment destination');
      await Transaction.updateOne({ _id: trx._id }, { $set: { checkoutState: 'ready', checkoutUrl: destination.href } });
    } catch (error) {
      // Only explicit validation/auth rejection proves no payable checkout was created.
      const rejected = [400, 401, 403, 404, 422].includes(Number(error.httpStatusCode));
      try {
        await Transaction.updateOne({ _id: trx._id, transactionStatus: 'pending' }, rejected
          ? { $set: { checkoutState: 'failed', transactionStatus: 'failure', activeCheckout: false } }
          : { $set: { checkoutState: 'uncertain' } });
      } catch {
        // ponytail: preserve the locked order after DB failure; reconcile before another checkout.
        return res.status(202).json({ ...orderResult(trx), checkoutState: 'uncertain', message: 'Checkout confirmation is unavailable. Check this order before trying again.' });
      }
    }
    try { res.json(orderResult(await Transaction.findOne({ orderId }))); }
    catch { res.status(202).json({ ...orderResult(trx), checkoutState: 'uncertain', message: 'Checkout confirmation is unavailable. Check this order before trying again.' }); }
  } catch (error) { next(error); }
}

async function applyNotification(notification, expectedOrderId) {
  if (expectedOrderId !== undefined && notification.order_id !== expectedOrderId) throw new Error('Gateway order reference mismatch');
  const trx = await Transaction.findOne({ orderId: notification.order_id });
  if (!trx) { const error = new Error('Unknown order'); error.status = 404; throw error; }
  const amount = Number(notification.gross_amount);
  if (!Number.isSafeInteger(amount) || amount !== trx.amount || (notification.currency && notification.currency !== 'IDR')) { const error = new Error('Payment amount mismatch'); error.status = 400; throw error; }
  let status = notification.transaction_status;
  if (status === 'capture' && notification.fraud_status !== 'accept') status = notification.fraud_status === 'deny' ? 'deny' : 'pending';
  if (!['pending', ...paidStatuses, 'cancel', 'deny', 'expire', 'failure'].includes(status)) {
    // ponytail: sandbox purchases only; implement refund reconciliation before accepting real payments.
    return trx;
  }
  const success = paidStatuses.includes(status);
  const update = { transactionStatus: status };
  if (typeof notification.payment_type === 'string') update.paymentType = notification.payment_type;
  // Midtrans timestamps use Western Indonesian Time (UTC+07:00).
  for (const [field, value] of [['gatewayTransactionTime', notification.transaction_time], ['settledAt', notification.settlement_time]]) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
      const date = new Date(value.replace(' ', 'T') + '+07:00');
      if (Number.isFinite(date.getTime())) update[field] = date;
    }
  }
  if (status !== 'pending') update.activeCheckout = false;
  // Do not allow a delayed pending notification to replace a terminal state.
  const allowed = status === 'settlement' ? { $nin: ['settlement'] } : success ? { $nin: paidStatuses } : status === 'pending' ? 'pending' : { $nin: [...paidStatuses, 'cancel', 'deny', 'expire', 'failure'] };
  await Transaction.updateOne({ _id: trx._id, transactionStatus: allowed }, { $set: update });
  const current = await Transaction.findOne({ orderId: trx.orderId });
  if (paidStatuses.includes(current.transactionStatus)) {
    const books = current.books?.length ? current.books : current.book ? [current.book] : [];
    if (!books.length) throw new Error('Order has no books');
    // Idempotent and retry-safe even if a prior callback saved payment but failed to grant access.
    const result = await User.updateOne({ _id: current.user }, { $addToSet: { purchasedBooks: { $each: books } }, $pull: { cartBookIds: { $in: books } } });
    if (!result.matchedCount) throw new Error('Order user no longer exists');
  }
  return current;
}
async function reconcileOrder(orderId, expectedAttempt) {
  const recovery = expectedAttempt ? { attempt:expectedAttempt } : await PaymentRecovery.findOne({ orderId, pending:true });
  try {
    const verified = await midtrans.transaction.status(orderId);
    if (!['pending','capture','settlement','cancel','deny','expire','failure'].includes(verified?.transaction_status)) throw new Error('Unsupported gateway status; reconciliation required.');
    const current = await applyNotification(verified, orderId);
    if (recovery) await PaymentRecovery.updateOne({ orderId, attempt:recovery.attempt }, { $set:{ pending:false, httpStatus:null } });
    return { transaction:current, gateway:verified };
  } catch (error) {
    if (recovery) {
      try { await PaymentRecovery.updateOne({ orderId, attempt:recovery.attempt }, { $set:{ httpStatus:Number(error.httpStatusCode) || null } }); }
      catch { console.warn('Payment recovery record unavailable; inspect this order.', { orderId }); }
    }
    throw error;
  }
}
async function handleNotification(req, res) {
  let body;
  try { body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8')) : req.body; }
  catch { return res.status(400).json({ message: 'Invalid notification JSON.' }); }
  if (!body || typeof body.order_id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(body.order_id) || typeof body.status_code !== 'string' || !/^\d{3}$/.test(body.status_code) || typeof body.gross_amount !== 'string' || !/^\d{1,12}(?:\.\d{1,2})?$/.test(body.gross_amount) || typeof body.signature_key !== 'string' || !/^[a-f0-9]{128}$/i.test(body.signature_key)) return res.status(400).json({ message: 'Invalid notification.' });
  if (!process.env.MIDTRANS_SIGNATURE_KEY) return res.status(503).json({ message: 'Notification verification unavailable.' });
  const signatureInput = body.order_id + body.status_code + body.gross_amount;
  const expected = createHash('sha512').update(signatureInput + process.env.MIDTRANS_SIGNATURE_KEY, 'utf8').digest();
  if (!timingSafeEqual(expected, Buffer.from(body.signature_key, 'hex'))) {
    if (process.env.MIDTRANS_WEBHOOK_DEBUG === 'true') console.warn('Midtrans signature mismatch', { signatureInput:JSON.stringify(signatureInput), orderId:body.order_id, statusCode:body.status_code, grossAmount:body.gross_amount, expectedSignature:expected.toString('hex'), receivedSignature:body.signature_key });
    console.warn('Midtrans notification rejected: invalid signature.', { orderId:body.order_id });
    return res.status(403).json({ message: 'Invalid notification signature.' });
  }
  req.midtransOrderId = body.order_id;
  return notificationLimit(req, res, async () => {
    const attempt = randomUUID();
    try {
      await PaymentRecovery.updateOne({ orderId:body.order_id }, { $set:{ attempt, pending:true, httpStatus:null } }, { upsert:true });
    } catch {
      // Do not acknowledge work that could be lost before it reaches durable storage.
      return res.status(503).json({ message:'Notification recovery storage unavailable. Please retry.' });
    }
    try { await reconcileOrder(body.order_id, attempt); }
    catch (error) {
      const httpStatus = Number(error.httpStatusCode) || null;
      console.warn(httpStatus === 404 ? 'Signed Midtrans notification recorded; gateway transaction not found.' : 'Signed Midtrans notification recorded; reconciliation required.', { orderId:body.order_id, httpStatus });
    }
    return res.status(200).send('OK');
  });
}
async function getOrder(req, res, next) {
  if (!/^(?:EREAD-[a-f0-9-]{36}|PUSDIG-(?:CART-)?\d{10,16}-\d{1,3})$/.test(req.params.orderId)) return res.status(400).json({ message: 'Invalid order ID.' });
  try {
    let trx = await Transaction.findOne({ orderId: req.params.orderId, user: req.user.id });
    if (!trx) return res.status(404).json({ message: 'Order not found.' });
    // Refresh pending orders from the gateway, never from browser-supplied status.
    let warning;
    let libraryUpdated = false;
    const recovery = await PaymentRecovery.findOne({ orderId:trx.orderId, pending:true });
    if (trx.transactionStatus === 'pending' || trx.transactionStatus === 'capture' || recovery) {
      try { trx = (await reconcileOrder(trx.orderId)).transaction; }
      catch {
        warning = 'The gateway could not confirm an updated status. Do not start another payment while this order is unresolved.';
        trx = await Transaction.findOne({ orderId: req.params.orderId, user: req.user.id });
        if (!trx) return res.status(404).json({ message: 'Order not found.' });
      }
    }
    if (paidStatuses.includes(trx.transactionStatus)) {
      const books = trx.books?.length ? trx.books : [trx.book];
      try {
        const result = await User.updateOne({ _id: trx.user }, { $addToSet: { purchasedBooks: { $each: books } }, $pull: { cartBookIds: { $in: books } } });
        if (!result.matchedCount) throw new Error('Order user no longer exists');
        libraryUpdated = true;
      } catch { warning = 'Payment is confirmed, but library access could not be synchronized. Check again before purchasing anything else.'; }
    }
    res.json({ ...orderResult(trx), libraryUpdated, warning });
  } catch (error) { next(error); }
}
module.exports = { createTransaction: (req, res, next) => checkout(req, res, next, false), createCartTransaction: (req, res, next) => checkout(req, res, next, true), handleNotification, getOrder, applyNotification, reconcileOrder };
