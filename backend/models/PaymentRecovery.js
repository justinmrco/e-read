const mongoose = require('mongoose');
// ponytail: retries are receipt/operator-driven; add a worker for unattended recovery.
// One durable retry marker per signed order; no credentials or notification payloads.
const schema = new mongoose.Schema({
  orderId: { type:String, required:true, unique:true },
  attempt: { type:String, required:true },
  pending: { type:Boolean, default:true },
  httpStatus: Number,
}, { timestamps:true });
module.exports = mongoose.model('PaymentRecovery', schema);
