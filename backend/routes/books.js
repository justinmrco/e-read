const router = require('express').Router();
const Book = require('../models/Book');
const Catalog = require('../models/Catalog');
const User = require('../models/User');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const valid = require('../utils/validation');

async function catalog() {
  const books = await Book.find({ archived: { $ne: true } }).sort({ order: 1, _id: 1 }).lean();
  let state = await Catalog.findById('main').lean();
  if (!state) {
    try { state = await Catalog.findOneAndUpdate({ _id: 'main' }, { $setOnInsert: { bookIds: books.map(book => book._id), revision: 0 } }, { upsert: true, new: true }).lean(); }
    catch (error) { if (error.code !== 11000) throw error; state = await Catalog.findById('main').lean(); }
  }
  const rank = new Map(state.bookIds.map((id, index) => [id.toString(), index]));
  books.sort((a, b) => (rank.get(a._id.toString()) ?? Infinity) - (rank.get(b._id.toString()) ?? Infinity));
  return { books: books.map((book, order) => { const { creationKey, ...publicBook } = book; return { ...publicBook, order }; }), revision: state.revision };
}
function details(body) {
  const { title, author, year, genre, description, imageUrl, price, hook, format, pages, publisher } = body || {};
  if ((format !== undefined && (typeof format !== 'string' || format.length > 100)) || (publisher !== undefined && (typeof publisher !== 'string' || publisher.length > 200)) || (pages !== undefined && pages !== null && (!Number.isInteger(pages) || pages < 1 || pages > 100000))) return null;
  if (hook !== undefined && (typeof hook !== 'string' || hook.length > 100)) return null;
  let safeImage = typeof imageUrl === 'string' && /^\/covers\/[a-z0-9][a-z0-9-]*\.(?:jpe?g|png|webp|avif)$/i.test(imageUrl);
  try { const url = new URL(imageUrl); safeImage ||= ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch {}
  if (!valid.text(title, 1, 200) || !valid.text(author, 1, 200) || !valid.text(description, 1, 5000) || typeof imageUrl !== 'string' || imageUrl.length > 2048 || !(safeImage || imageUrl === '/sample-cover.svg') || !Book.schema.path('genre').enumValues.includes(genre) || !Number.isInteger(year) || year < 1000 || year > 3000 || !Number.isSafeInteger(price) || price < 1 || price > 100000000) return null;
  return { title: title.trim(), author: author.trim(), year, genre, description: description.trim(), imageUrl, price, ...(format === undefined ? {} : {format:format.trim()}), ...(publisher === undefined ? {} : {publisher:publisher.trim()}), ...(pages === undefined ? {} : {pages}), ...(hook === undefined ? {} : { hook:hook.trim() }) };
}
router.get('/', async (req, res, next) => {
  try { res.json((await catalog()).books); } catch (error) { next(error); }
});
router.get('/admin/catalog', authMiddleware, adminOnly, async (req, res, next) => {
  try { res.json(await catalog()); } catch (error) { next(error); }
});
router.post('/', authMiddleware, adminOnly, async (req, res, next) => {
  const book = details(req.body);
  const requestId = req.get('Idempotency-Key');
  if (!book || typeof requestId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId)) return res.status(400).json({ message: 'Provide valid book details and a UUID save reference. Prices must be whole IDR, 1-100,000,000.' });
  const creationKey = req.user.id + ':' + requestId.toLowerCase();
  try {
    await catalog();
    let saved = await Book.findOne({ creationKey });
    if (!saved) {
      try { saved = await Book.create({ ...book, creationKey }); }
      catch (error) { if (error.code !== 11000) throw error; saved = await Book.findOne({ creationKey }); if (!saved) throw error; }
    }
    if (saved.archived) return res.status(409).json({ message: 'This book is no longer available in the catalog.' });
    if (Object.entries(book).some(([key, value]) => saved[key] !== value)) return res.status(409).json({ message: 'This save reference already created a different book. Reload the catalog before starting another addition.' });
    // ponytail: separate book/ordering writes; same-key retries repair interrupted appends. Use replica-set transactions for indivisible publication.
    await Catalog.updateOne({ _id: 'main', bookIds: { $ne: saved._id } }, { $addToSet: { bookIds: saved._id }, $inc: { revision: 1 } });
    const { creationKey: privateKey, ...result } = saved.toObject();
    res.status(201).json(result);
  } catch (error) { next(error); }
});
router.patch('/:id', authMiddleware, adminOnly, async (req, res, next) => {
  const book = details(req.body);
  const version = req.body?.version;
  if (!valid.objectId(req.params.id) || !book || !Number.isSafeInteger(version) || version < 0 || version === Number.MAX_SAFE_INTEGER) return res.status(400).json({ message: 'Provide valid book details and its current version.' });
  try {
    const saved = await Book.findOneAndUpdate({ _id: req.params.id, archived: { $ne: true }, __v: version === 0 ? { $in: [0, null] } : version }, { $set: { ...book, __v: version + 1 } }, { new: true, runValidators: true }).select('-creationKey');
    if (saved) return res.json(saved);
    const current = await Book.findOne({ _id: req.params.id, archived: { $ne: true } }).select('-creationKey');
    if (!current) return res.status(404).json({ message: 'Book not found.' });
    if (Object.entries(book).every(([key, value]) => current[key] === value)) return res.json(current);
    res.status(409).json({ message: 'Another administrator changed this book. Close the form and reload the catalog before editing again.' });
  } catch (error) { next(error); }
});
router.post('/reorder', authMiddleware, adminOnly, async (req, res, next) => {
  const { bookIds, revision } = req.body || {};
  if (!Array.isArray(bookIds) || !bookIds.length || bookIds.length > 1000 || bookIds.some(id => !valid.objectId(id)) || new Set(bookIds.map(id => id.toLowerCase())).size !== bookIds.length || !Number.isSafeInteger(revision) || revision < 0) return res.status(400).json({ message: 'Provide unique book IDs and the current catalog revision (maximum 1,000 books).' });
  try {
    await catalog();
    if (await Book.countDocuments({ _id: { $in: bookIds }, archived: { $ne: true } }) !== bookIds.length || await Book.countDocuments({ archived: { $ne: true } }) !== bookIds.length) return res.status(409).json({ message: 'Catalog changed. Reload before reordering.' });
    const saved = await Catalog.findOneAndUpdate({ _id: 'main', revision }, { $set: { bookIds }, $inc: { revision: 1 } }, { new: true });
    if (!saved) return res.status(409).json({ message: 'Another administrator changed the order. Reload before reordering.' });
    res.json({ message: 'Catalog order updated.', revision: saved.revision });
  } catch (error) { next(error); }
});
router.get('/read/:id', authMiddleware, async (req, res, next) => {
  if (!valid.objectId(req.params.id)) return res.status(400).json({ message: 'Invalid book ID.' });
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ message: 'Please log in again.' });
    if (!user.purchasedBooks.some(id => id.toString() === req.params.id.toLowerCase())) return res.status(403).json({ message: 'This book is not in your library.' });
    const book = await Book.findById(req.params.id).select('-creationKey');
    if (!book) return res.status(404).json({ message: 'Book not found.' });
    res.json({ book, readerMode: 'shared-sample' });
  } catch (error) { next(error); }
});
module.exports = router;
