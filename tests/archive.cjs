// Run: node tests/archive.cjs. Uses only a disposable local database and a fake gateway.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../backend/package.json'));
const mongoose = req('mongoose'), express = req('express'), jwt = req('jsonwebtoken');
const Book = req('./models/Book'), User = req('./models/User'), Catalog = req('./models/Catalog'), Transaction = req('./models/Transaction');
const database = 'eread_archive_test_' + randomUUID().replaceAll('-', '');
process.env.JWT_SECRET = 'synthetic-archive-test-secret-with-32-bytes';
let gatewayCalls = 0;
const controllerModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../backend/controllers/midtransController.js'), 'utf8'), {
  module: controllerModule, exports: controllerModule.exports, process, Buffer, URL, console,
  require(name) {
    if (name === '../utils/midtrans') return { createTransaction() { gatewayCalls++; throw Error('Unexpected gateway call'); } };
    return req(name.startsWith('../') ? './' + name.slice(3) : name);
  },
});
async function main() {
  let server;
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/' + database, { serverSelectionTimeoutMS: 3000 });
    await Promise.all([User.init(), Book.init(), Catalog.init()]);
    const draft = { title: 'Test book', author: 'Author', description: 'Synthetic fixture', imageUrl: '/sample-cover.svg', genre: 'Fiction', year: 2025, price: 1000 };
    const archived = await Book.create({ ...draft, title: 'Archived book', archived: true });
    const live = await Book.create({ ...draft, title: 'Available book' });
    const legacyId = new mongoose.Types.ObjectId();
    await Book.collection.insertOne({ ...draft, _id: legacyId, title: 'Legacy available book', order: 1 });
    const owner = await User.create({ username: 'ArchiveOwner', email: 'owner@example.com', password: 'synthetic-password', purchasedBooks: [archived._id] });
    const buyer = await User.create({ username: 'ArchiveBuyer', email: 'buyer@example.com', password: 'synthetic-password', cartBookIds: [archived._id, live._id] });
    const admin = await User.create({ username: 'ArchiveAdmin', email: 'admin@example.com', password: 'synthetic-password', role: 'admin' });
    await Transaction.create({ user: owner._id, books: [archived._id], orderId: 'paid-archived', amount: 1000, transactionStatus: 'settlement', items: [{ bookId: archived.id, title: archived.title, price: 1000 }] });
    const app = express(); app.use(express.json());
    app.use('/api/books', req('./routes/books')); app.use('/api/user', req('./routes/user'));
    app.use((error, request, response, next) => response.status(500).json({ message: 'Synthetic failure' }));
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    async function request(route, user, body, method = body ? 'POST' : 'GET') {
      const token = user ? jwt.sign({ id: user.id, tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' }) : null;
      const r = await fetch('http://127.0.0.1:' + server.address().port + route, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
      return { status: r.status, data: await r.json() };
    }
    const publicCatalog = await request('/api/books');
    assert.deepEqual(publicCatalog.data.map(b => b.title), ['Available book', 'Legacy available book']);
    const catalog = await request('/api/books/admin/catalog', admin);
    assert.equal(catalog.data.books.length, 2);
    assert.equal((await request('/api/books/reorder', admin, { bookIds: [String(legacyId), live.id], revision: catalog.data.revision })).status, 200);
    assert.equal((await request('/api/books/reorder', admin, { bookIds: [String(legacyId), live.id, archived.id], revision: catalog.data.revision + 1 })).status, 409);
    assert.equal((await request('/api/books/' + archived.id, admin, { ...draft, version: 0 }, 'PATCH')).status, 404);
    assert.equal((await request('/api/user/cart/items', buyer, { bookId: archived.id })).status, 404);
    const cart = await request('/api/user/cart', buyer);
    assert.equal(cart.data.omitted, 1); assert.deepEqual(cart.data.items.map(b => b._id), [live.id]);
    assert.deepEqual((await User.findById(buyer.id)).cartBookIds.map(String), [live.id]);
    assert.equal((await request('/api/user/books', owner)).data.books[0]._id, archived.id);
    assert.equal((await request('/api/books/read/' + archived.id, owner)).status, 200);
    assert.equal((await request('/api/books/read/' + archived.id, buyer)).status, 403);
    assert.equal((await request('/api/user/transactions', owner)).data.transactions[0].title, archived.title);
    async function checkout(handler, body) {
      const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
      await handler({ user: { id: buyer.id }, body }, response, error => { throw error; });
      return response;
    }
    const controller = controllerModule.exports;
    assert.equal((await checkout(controller.createTransaction, { bookId: archived.id })).statusCode, 404);
    assert.equal((await checkout(controller.createCartTransaction, { bookIds: [live.id, archived.id] })).statusCode, 404);
    assert.equal(gatewayCalls, 0);
    assert.equal(await Transaction.countDocuments(), 1);
    await Transaction.create({ user: buyer._id, books: [archived._id], orderId: 'existing-archived', amount: 1000, transactionStatus: 'pending', activeCheckout: true, checkoutState: 'uncertain' });
    assert.equal((await checkout(controller.createTransaction, { bookId: live.id })).data.orderId, 'existing-archived');
    await controller.applyNotification({ order_id: 'existing-archived', gross_amount: '1000.00', currency: 'IDR', transaction_status: 'settlement' });
    assert((await User.findById(buyer.id)).purchasedBooks.some(id => String(id) === archived.id));
    assert.equal((await request('/api/books/read/' + archived.id, buyer)).status, 200);
    console.log('Passed: archived catalog exclusion, legacy visibility, active-only admin ordering, blocked edits/cart/checkout, preserved ownership/history/reader, and existing-order settlement.');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === database && /^eread_archive_test_[a-f0-9]{32}$/.test(database)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
