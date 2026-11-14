// Run: node tests/payments.cjs. Uses a disposable local MongoDB database and a fake gateway.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(root, 'backend/package.json'));
const mongoose = backendRequire('mongoose');
const User = backendRequire('./models/User');
const Book = backendRequire('./models/Book');
const Transaction = backendRequire('./models/Transaction');
const PaymentRecovery = backendRequire('./models/PaymentRecovery');
const database = 'eread_checkout_test_' + randomUUID().replaceAll('-', '');
let gatewayCalls = 0;let statusCalls=0;
let mode = 'ready';
let gate;
let entered;
let notification;let statusFailure;
const gateway = {
  async createTransaction() {
    gatewayCalls++;
    if (gate) { entered(); await gate; }
    if (mode === 'timeout') throw new Error('Gateway timeout');
    if (mode === 'reject') throw Object.assign(new Error('Invalid configuration'), { httpStatusCode: 401 });
    if (mode === 'db-failure') {
      const original = Transaction.updateOne;
      Transaction.updateOne = () => { Transaction.updateOne = original; throw new Error('Temporary DB failure after gateway success'); };
    }
    return { redirect_url: 'https://app.sandbox.midtrans.com/snap/v2/test-only' };
  },
  transaction: { async status() { statusCalls++; if(statusFailure)throw statusFailure; if (!notification) throw new Error('Status unavailable'); return notification; } },
};
const controllerModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'backend/controllers/midtransController.js'), 'utf8'), {
  module: controllerModule, exports: controllerModule.exports, URL, Date, Buffer, console:{warn(){}}, process: { env: { FRONTEND_URL: 'http://localhost:3001', MIDTRANS_SIGNATURE_KEY:'synthetic-hook-key' } },
  require(name) { return name === '../utils/midtrans' ? gateway : backendRequire(name.startsWith('../') ? './' + name.slice(3) : name); },
});
const controller = controllerModule.exports;
async function invoke(handler, req) {
  const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.data = value; return this; }, send(value){this.data=value;return this;}, set(){return this;} };
  await handler(req, res, error => { throw error; });
  return res;
}
async function main() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/' + database, { serverSelectionTimeoutMS: 3000 });
    await Promise.all([User.init(), Book.init(), Transaction.init(), PaymentRecovery.init()]);
    await Transaction.createIndexes();
    const user = await User.create({ username: 'Synthetic', email: 'synthetic@example.com', password: 'synthetic-password' });
    const books = await Book.create([0, 1].map(i => ({ title: 'Synthetic ' + i, author: 'Test', year: 2025, genre: 'Fiction', description: 'Test', imageUrl: '/sample-cover.svg', price: 15000 + i, order: i })));
    const req = { user: { id: user.id }, body: { bookId: books[0].id } };
    let release;
    gate = new Promise(resolve => { release = resolve; });
    const reachedGateway = new Promise(resolve => { entered = resolve; });
    const attempts = Array.from({ length: 9 }, () => invoke(controller.createTransaction, req));
    await reachedGateway;
    assert.equal(gatewayCalls, 1);
    release(); gate = null;
    const results = await Promise.all(attempts);
    assert.equal(results.filter(result => !result.data.existing).length, 1);
    const result = results.find(result => !result.data.existing);
    const orderId = result.data.order_id;
    assert(results.every(result => result.data.order_id === orderId)); assert.equal(gatewayCalls, 1);
    assert.equal(await Transaction.countDocuments({ activeCheckout: true }), 1);
    assert.equal(result.data.checkoutState, 'ready');
    const signed={order_id:orderId,status_code:'200',gross_amount:'15000.00'};
    signed.signature_key=createHash('sha512').update(signed.order_id+signed.status_code+signed.gross_amount+'synthetic-hook-key').digest('hex');
    statusFailure=Object.assign(Error('Gateway not found'),{httpStatusCode:404});
    const acknowledged=await invoke(controller.handleNotification,{body:Buffer.from(JSON.stringify(signed))});
    assert.equal(acknowledged.statusCode,200);assert.equal(acknowledged.data,'OK');
    const persistedRecovery=await PaymentRecovery.findOne({orderId}).lean();
    assert.equal(persistedRecovery.pending,true);assert.equal(persistedRecovery.httpStatus,404);
    assert.equal((await Transaction.findOne({orderId})).transactionStatus,'pending');
    statusFailure=null;
    await assert.rejects(Transaction.create({ user: user.id, books: [books[1].id], orderId: 'conflict', amount: 1, activeCheckout: true }), error => error.code === 11000);
    const changedCart = await invoke(controller.createTransaction, { ...req, body: { bookId: books[1].id } });
    assert.equal(changedCart.data.order_id, orderId); assert.equal(changedCart.data.amount, 15000);
    assert.equal((await invoke(controller.getOrder, { user: { id: new mongoose.Types.ObjectId().toString() }, params: { orderId } })).statusCode, 404);
    const uncertainStatus = await invoke(controller.getOrder, { user: req.user, params: { orderId } });
    assert(uncertainStatus.data.warning); assert.equal(uncertainStatus.data.status, 'pending');
    await User.updateOne({_id:user.id},{$set:{cartBookIds:books.map(book=>book._id)}});
    notification = { order_id: orderId, gross_amount: '15000.00', currency: 'IDR', transaction_status: 'capture', fraud_status: 'accept' };
    await controller.applyNotification(notification);
    notification.transaction_status = 'settlement'; notification.settlement_time = '2026-11-12 12:01:00';
    await Promise.all([controller.applyNotification(notification), controller.applyNotification(notification)]);
    notification.transaction_status = 'pending'; await controller.applyNotification(notification);
    const paid = await Transaction.findOne({ orderId });
    assert.equal(paid.transactionStatus, 'settlement'); assert.equal(paid.activeCheckout, false);
    assert.equal(paid.settledAt.toISOString(), '2026-11-12T05:01:00.000Z');
    assert.equal((await User.findById(user.id)).purchasedBooks.length, 1);
    assert.deepEqual((await User.findById(user.id)).cartBookIds.map(String),[books[1].id]);
    await User.updateOne({ _id: user.id }, { $set: { purchasedBooks: [] } });
    const callsBeforeRepair = gatewayCalls;
    assert.equal((await invoke(controller.createTransaction, req)).statusCode, 409);
    assert.equal(gatewayCalls, callsBeforeRepair);
    const updateUser = User.updateOne;
    User.updateOne = async () => { throw new Error('Entitlement database unavailable'); };
    let repair;
    try { repair = await invoke(controller.getOrder, { user: req.user, params: { orderId } }); }
    finally { User.updateOne = updateUser; }
    assert.equal(repair.data.paid, true); assert.equal(repair.data.libraryUpdated, false); assert(repair.data.warning);
    assert.equal((await invoke(controller.getOrder, { user: req.user, params: { orderId } })).data.libraryUpdated, true);
    for (const failureMode of ['reject', 'timeout', 'db-failure']) {
      mode = failureMode;
      const failure = await invoke(controller.createTransaction, { ...req, body: { bookId: books[1].id } });
      assert.equal(failure.data.checkoutState, mode === 'reject' ? 'failed' : 'uncertain');
      const row = await Transaction.findOne({ orderId: failure.data.order_id });
      assert.equal(row.activeCheckout, mode !== 'reject');
      assert.equal(failure.data.redirect_url, undefined);
      if (mode !== 'reject') {
        const calls = gatewayCalls;
        assert.equal((await invoke(controller.createTransaction, req)).data.order_id, row.orderId);
        assert.equal(gatewayCalls, calls);
        // Verified cancellation releases the slot; a clock timeout never does.
        await controller.applyNotification({ order_id: row.orderId, gross_amount: row.amount, transaction_status: 'cancel' });
      }
    }
    // Operator recovery is preview-only by default and never fabricates an unlock.
    const recoveryModule = { exports:{} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'backend/scripts/reconcilePayment.js'), 'utf8'), {
      module:recoveryModule, exports:recoveryModule.exports,
      require(name) {
        if (name === '../utils/midtrans') return gateway;
        if (name === '../controllers/midtransController') return controller;
        return backendRequire(name.startsWith('../') ? './' + name.slice(3) : name);
      },
    });
    const { reconcilePayment } = recoveryModule.exports;
    const recovery = await Transaction.create({ user:user.id, books:[books[1].id], orderId:'EREAD-' + randomUUID(), amount:books[1].price, activeCheckout:true, checkoutState:'uncertain' });
    const snapshot = JSON.stringify(await Transaction.findById(recovery.id));
    notification = { order_id:recovery.orderId, gross_amount:recovery.amount, currency:'IDR', transaction_status:'cancel' };
    await PaymentRecovery.create({orderId:recovery.orderId,attempt:'initial-attempt',pending:true});
    const beforePreviewCalls=statusCalls;
    const preview = await reconcilePayment(recovery.orderId);
    assert.equal(statusCalls-beforePreviewCalls,1);
    assert.equal((await PaymentRecovery.findOne({orderId:recovery.orderId})).pending,true);
    assert.equal(preview.applied, false);assert.equal(preview.after.activeCheckout, true);
    assert.equal(JSON.stringify(await Transaction.findById(recovery.id)), snapshot);
    const validNotification = { ...notification };
    for (const invalid of [undefined, { ...validNotification, order_id:orderId }, { ...validNotification, gross_amount:1 }, { ...validNotification, currency:'USD' }, { ...validNotification, transaction_status:'refund' }]) {
      notification = invalid;
      await assert.rejects(reconcilePayment(recovery.orderId, true));
      assert.equal(JSON.stringify(await Transaction.findById(recovery.id)), snapshot);
    }
    await assert.rejects(reconcilePayment('../invalid', true), /Invalid order/);
    // A status response for another order must not mutate that order through owner lookup.
    notification = { ...validNotification, order_id:orderId, gross_amount:15000, transaction_status:'cancel' };
    const mismatched = await invoke(controller.getOrder, { user:req.user, params:{ orderId:recovery.orderId } });
    assert(mismatched.data.warning);assert.equal(mismatched.data.status, 'pending');
    assert.equal((await Transaction.findOne({ orderId })).transactionStatus, 'settlement');
    notification = validNotification;
    // An older completion must not clear a newer notification's durable work.
    const originalStatus=gateway.transaction.status;
    gateway.transaction.status=async()=>{await PaymentRecovery.updateOne({orderId:recovery.orderId},{$set:{attempt:'newer-attempt',pending:true}});return notification;};
    try {await controller.reconcileOrder(recovery.orderId);} finally {gateway.transaction.status=originalStatus;}
    assert.equal((await PaymentRecovery.findOne({orderId:recovery.orderId})).pending,true);
    const beforeApplyCalls=statusCalls;
    const cancelled = await reconcilePayment(recovery.orderId, true);
    assert.equal(statusCalls-beforeApplyCalls,1);
    assert.equal(cancelled.gatewayStatus,cancelled.after.status);
    assert.equal((await PaymentRecovery.findOne({orderId:recovery.orderId})).pending,false);
    assert.equal(cancelled.after.status, 'cancel');assert.equal(cancelled.after.activeCheckout, false);
    assert.equal((await reconcilePayment(recovery.orderId, true)).after.activeCheckout, false);
    const paidRecovery = await Transaction.create({ user:user.id, books:[books[1].id], orderId:'EREAD-' + randomUUID(), amount:books[1].price, activeCheckout:true, checkoutState:'uncertain' });
    notification = { ...validNotification, order_id:paidRecovery.orderId, transaction_status:'settlement' };
    await PaymentRecovery.create({orderId:paidRecovery.orderId,attempt:'grant-attempt',pending:true});
    const grant = User.updateOne;
    User.updateOne = async () => { throw new Error('Synthetic library failure'); };
    try { await assert.rejects(reconcilePayment(paidRecovery.orderId, true), /library failure/); }
    finally { User.updateOne = grant; }
    assert.equal((await Transaction.findById(paidRecovery.id)).transactionStatus, 'settlement');
    assert.equal((await PaymentRecovery.findOne({orderId:paidRecovery.orderId})).pending,true);
    await reconcilePayment(paidRecovery.orderId, true);await reconcilePayment(paidRecovery.orderId, true);
    assert.equal((await PaymentRecovery.findOne({orderId:paidRecovery.orderId})).pending,false);
    assert.equal((await User.findById(user.id)).purchasedBooks.filter(id => id.toString() === books[1].id).length, 1);
    const legacy = await Transaction.create({ user: user.id, books: [books[0].id], orderId: 'PUSDIG-CART-1700000000000-123', amount: 15000, transactionStatus: 'settlement' });
    assert.equal((await invoke(controller.getOrder, { user: req.user, params: { orderId: legacy.orderId } })).data.paid, true);
    await Transaction.collection.dropIndex('one_active_checkout_per_user');
    await Transaction.create({ user: user.id, books: [books[0].id], orderId: 'PUSDIG-1700000000000-124', amount: 15000 });
    const beforeStartup = await Transaction.countDocuments();
    const startup = spawnSync(process.execPath, ['server.js'], { cwd: path.join(root, 'backend'), timeout: 15000, encoding: 'utf8', env: { ...process.env, MONGODB_URI: 'mongodb://127.0.0.1:27017/' + database, JWT_SECRET: 'test-only-secret-with-at-least-32-bytes', FRONTEND_URL: 'http://localhost:3001', MIDTRANS_SERVER_KEY: 'test-only', MIDTRANS_SIGNATURE_KEY: 'test-signature-only', MIDTRANS_CLIENT_KEY: 'test-only' } });
    assert.equal(startup.status, 1); assert(startup.stderr.includes('Legacy pending orders require reconciliation'));
    assert.equal(await Transaction.countDocuments(), beforeStartup);
    assert(!(await Transaction.collection.indexes()).some(index => index.name === 'one_active_checkout_per_user'));
    console.log('Passed: MongoDB unique active checkout, concurrent requests, changed carts, snapshots, ownership, gateway failures, reconciliation, status ordering, entitlement retries, and legacy orders.');
  } finally {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === database && /^eread_checkout_test_[a-f0-9]{32}$/.test(database)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
