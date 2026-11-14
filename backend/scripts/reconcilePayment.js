const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');

async function reconcilePayment(orderId, apply = false) {
  if (typeof orderId !== 'string' || !/^(?:EREAD-[a-f0-9-]{36}|PUSDIG-(?:CART-)?\d{10,16}-\d{1,3})$/.test(orderId)) throw new Error('Invalid order reference');
  const local = await Transaction.findOne({ orderId });
  if (!local) throw new Error('Order not found');
  const reconciled = apply ? await require('../controllers/midtransController').reconcileOrder(orderId) : null;
  const gateway = reconciled ? reconciled.gateway : await require('../utils/midtrans').transaction.status(orderId);
  if (gateway.order_id !== orderId || !Number.isSafeInteger(Number(gateway.gross_amount)) || Number(gateway.gross_amount) !== local.amount || (gateway.currency && gateway.currency !== 'IDR')) throw new Error('Gateway reference or amount mismatch');
  if (!['pending', 'capture', 'settlement', 'cancel', 'deny', 'expire', 'failure'].includes(gateway.transaction_status)) throw new Error('Unsupported gateway status; investigate separately');
  const before = { status:local.transactionStatus, checkoutState:local.checkoutState, activeCheckout:local.activeCheckout === true };
  const current = reconciled ? reconciled.transaction : local;
  return {
    orderId, amount:local.amount, applied:apply, before,
    gatewayStatus:gateway.transaction_status,
    fraudAccepted:gateway.transaction_status === 'capture' ? gateway.fraud_status === 'accept' : undefined,
    after:{ status:current.transactionStatus, checkoutState:current.checkoutState, activeCheckout:current.activeCheckout === true },
  };
}

async function main() {
  require('dotenv').config();
  const [orderId, flag, ...extra] = process.argv.slice(2);
  if (!orderId || (orderId === '--pending' ? flag !== undefined : (flag !== undefined && flag !== '--apply')) || extra.length) throw new Error('Usage: npm run reconcile-payment -- ORDER_ID [--apply] or --pending');
  if (!process.env.MONGODB_URI) throw new Error('Missing database configuration');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS:10000 });
  if (orderId === '--pending') {
    const PaymentRecovery = require('../models/PaymentRecovery');
    console.log(JSON.stringify({ total:await PaymentRecovery.countDocuments({pending:true}), orders:await PaymentRecovery.find({pending:true}).select('orderId httpStatus updatedAt -_id').sort({updatedAt:1}).limit(100) }, null, 2));
  } else console.log(JSON.stringify(await reconcilePayment(orderId, flag === '--apply'), null, 2));
}
if (require.main === module) main().catch(error => {
  console.error('Midtrans verification failed', { httpStatus: Number(error.httpStatusCode) || null, gatewayStatus: Number(error.ApiResponse?.status_code) || null, networkCode: ['EACCES','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ETIMEDOUT','ECONNABORTED','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(error.rawHttpClientData?.code) ? error.rawHttpClientData.code : null });
  console.error('Reconciliation failed. Check the order reference, local configuration and Midtrans sandbox status. No manual unlock was performed. If apply was attempted, preview again: payment may be saved even if library synchronization failed.');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
module.exports = { reconcilePayment };
