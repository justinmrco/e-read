const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book' },
  books: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
  orderId: { type: String, required: true, unique: true },
  amount: { type: Number, required: true, min: 1 },
  items: [{ _id: false, bookId: String, title: String, price: Number }],
  activeCheckout: Boolean,
  checkoutState: { type: String, enum: ['creating', 'ready', 'uncertain', 'failed'] },
  checkoutUrl: String,
  gatewayTransactionTime: Date,
  settledAt: Date,
  paymentType: String,
  transactionStatus: { type: String, enum: ['pending', 'capture', 'settlement', 'cancel', 'deny', 'expire', 'failure'], default: 'pending' },
  transactionTime: { type: Date, default: Date.now },
}, { timestamps: true, autoIndex: false });
schema.index({ user: 1 }, { unique: true, partialFilterExpression: { activeCheckout: true }, name: 'one_active_checkout_per_user' });
module.exports = mongoose.model('Transaction', schema);
