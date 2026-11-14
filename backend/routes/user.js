const router = require('express').Router();
const User = require('../models/User');
const Book = require('../models/Book');
const bcrypt = require('bcrypt');
const Transaction = require('../models/Transaction');
const { authMiddleware } = require('../middleware/auth');
const valid = require('../utils/validation');
const rateLimit = require('../middleware/rate-limit');
router.use(authMiddleware);
router.get('/cart', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ message:'Please log in again.' });
    const owned = new Set(user.purchasedBooks.map(String));
    const ids = (user.cartBookIds || []).filter(id => !owned.has(String(id)));
    const available = await Book.find({ _id:{ $in:ids }, archived:{ $ne:true } }).select('_id title price');
    const byId = new Map(available.map(book => [String(book._id), book]));
    const items = ids.map(id => byId.get(String(id))).filter(Boolean);
    const omittedIds = (user.cartBookIds || []).filter(id => owned.has(String(id)) || !byId.has(String(id)));
    // Prune only this snapshot's unavailable IDs; concurrent additions stay intact.
    if (omittedIds.length) await User.updateOne({ _id:user._id }, { $pull:{ cartBookIds:{ $in:omittedIds } } });
    res.json({ items, total:items.reduce((sum, book) => sum + book.price, 0), omitted:(user.cartBookIds || []).length - items.length });
  } catch (error) { next(error); }
});
router.post('/cart/items', rateLimit(60), async (req, res, next) => {
  const { bookId } = req.body || {};
  if (!valid.objectId(bookId)) return res.status(400).json({ message:'Invalid book.' });
  try {
    if (!await Book.exists({ _id:bookId, archived:{ $ne:true } })) return res.status(404).json({ message:'Book is unavailable.' });
    const result = await User.updateOne({ _id:req.user.id, purchasedBooks:{ $ne:bookId }, $or:[{ cartBookIds:bookId }, { 'cartBookIds.49':{ $exists:false } }] }, { $addToSet:{ cartBookIds:bookId } });
    if (!result.matchedCount) return res.status(409).json({ message:'This book is already purchased or your cart is full. Refresh your library and cart.' });
    res.json({ message:'Added to cart.' });
  } catch (error) { next(error); }
});
router.delete('/cart/items/:bookId', async (req, res, next) => {
  if (!valid.objectId(req.params.bookId)) return res.status(400).json({ message:'Invalid book.' });
  try {
    await User.updateOne({ _id:req.user.id }, { $pull:{ cartBookIds:req.params.bookId } });
    res.json({ message:'Removed from cart.' });
  } catch (error) { next(error); }
});
router.patch('/profile', rateLimit(10), async (req, res, next) => {
  const { username, email, currentPassword } = req.body || {};
  if (!valid.text(username, 3, 50) || !valid.email(email) || typeof currentPassword !== 'string' || !currentPassword.length || Buffer.byteLength(currentPassword) > 72) return res.status(400).json({ message:'Enter a username (3–50 characters), valid email and current password.' });
  try {
    const user = await User.findById(req.user.id);
    if (!user || !await user.comparePassword(currentPassword)) return res.status(400).json({ message:'Unable to update profile with those details.' });
    const version = user.tokenVersion ?? 0;
    const updated = await User.findOneAndUpdate({ _id:user._id, password:user.password, tokenVersion:version === 0 ? { $in:[0,null] } : version }, { $set:{ username:username.trim(), email:email.trim().toLowerCase() } }, { new:true, runValidators:true }).select('username email role');
    if (!updated) return res.status(409).json({ message:'Account credentials changed. Please sign in again.' });
    res.json({ user:updated, message:'Profile updated. Use your updated username next time you sign in.' });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message:'Username or email is already in use.' });
    next(error);
  }
});
router.get('/books', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).populate('purchasedBooks');
    if (!user) return res.status(401).json({ message: 'Please log in again.' });
    res.json({ books: user.purchasedBooks });
  } catch (error) { next(error); }
});
router.get('/status', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('username email role');
    if (!user) return res.status(401).json({ message: 'Please log in again.' });
    res.json({ loggedIn: true, user, expiresAt: req.user.expiresAt });
  } catch (error) { next(error); }
});
router.get('/transactions', async (req, res, next) => {
  try {
    const transactions = await Transaction.find({ user: req.user.id }).sort({ transactionTime: -1 }).populate('book').populate('books');
    res.json({ transactions: transactions.map(tx => ({ id: tx.id, orderId: tx.orderId, title: tx.items?.length ? tx.items.map(item => item.title).join(', ') : tx.book?.title || tx.books.filter(Boolean).map(book => book.title).join(', ') || 'Unavailable book', amount: tx.amount, status: tx.transactionStatus, date: tx.settledAt || tx.gatewayTransactionTime || tx.transactionTime })) });
  } catch (error) { next(error); }
});
router.post('/change-password', rateLimit(10), async (req, res, next) => {
  const { oldPassword, newPassword } = req.body || {};
  if (typeof oldPassword !== 'string' || !oldPassword.length || Buffer.byteLength(oldPassword) > 72 || !valid.password(newPassword)) return res.status(400).json({ message: 'New passwords need at least 8 characters and at most 72 UTF-8 bytes.' });
  try {
    const user = await User.findById(req.user.id);
    if (!user || !(await user.comparePassword(oldPassword))) return res.status(400).json({ message: 'Unable to change password with those details.' });
    const version = user.tokenVersion ?? 0;
    if (!Number.isSafeInteger(version) || version < 0 || version >= Number.MAX_SAFE_INTEGER) throw new Error('Invalid account version');
    // updateOne bypasses save middleware: hash once, then atomically replace only this credential snapshot.
    const password = await bcrypt.hash(newPassword, 10);
    const result = await User.updateOne({ _id:user._id, password:user.password, tokenVersion:version === 0 ? { $in:[0,null] } : version }, { $set:{ password, tokenVersion:version + 1 } }, { runValidators:true });
    if (!result.matchedCount) return res.status(409).json({ message:'Your password was changed by another request. Please sign in again.' });
    res.json({ message: 'Password changed. Please log in again on all devices.' });
  } catch (error) { next(error); }
});
module.exports = router;
