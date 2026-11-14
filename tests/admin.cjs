// Real HTTP/catalog operations on standalone MongoDB in a disposable database.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const backendRequire = createRequire(path.resolve(__dirname, '../backend/package.json'));
const mongoose = backendRequire('mongoose');
const express = backendRequire('express');
const jwt = backendRequire('jsonwebtoken');
const User = backendRequire('./models/User');
const Book = backendRequire('./models/Book');
const Catalog = backendRequire('./models/Catalog');
const database = 'eread_admin_test_' + randomUUID().replaceAll('-', '');
process.env.JWT_SECRET = 'synthetic-admin-test-secret-with-32-bytes';
async function main() {
  let server;
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/' + database, { serverSelectionTimeoutMS: 3000 });
    await Promise.all([User.init(), Book.init(), Catalog.init()]);
    const admin = await User.create({ username: 'SyntheticAdmin', email: 'admin@example.com', password: 'synthetic-password', role: 'admin' });
    const customer = await User.create({ username: 'SyntheticCustomer', email: 'customer@example.com', password: 'synthetic-password' });
    const token = jwt.sign({ id: admin.id, tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const customerToken = jwt.sign({ id: customer.id, tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const app = express(); app.use(express.json()); app.use('/api/books', backendRequire('./routes/books'));
    app.use((error, req, res, next) => res.status(500).json({ message: 'Synthetic failure' }));
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    async function request(method, route, body, key, credential = token) {
      const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/books' + route, { method, headers: { ...(credential ? { Authorization: 'Bearer ' + credential } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
      return { status: response.status, data: await response.json() };
    }
    const draft = { title: 'Synthetic book', author: 'Demo', description: 'Synthetic test description', genre: 'Fiction', year: 2025, imageUrl: '/sample-cover.svg', price: 15000 };
    const original = await Book.create([{ ...draft, title: 'Legacy first', order: 0 }, { ...draft, title: 'Legacy second', order: 1 }]);
    const before = await Book.find().sort({ _id: 1 }).lean();
    const initial = await request('GET', '/admin/catalog');
    assert.deepEqual(initial.data.books.map(book => book.title), ['Legacy first', 'Legacy second']);
    assert.deepEqual(await Book.find().sort({ _id: 1 }).lean(), before);
    assert.equal((await request('GET', '/admin/catalog', null, null, customerToken)).status, 403);
    assert.equal((await request('POST', '/', draft, randomUUID(), null)).status, 401);
    assert.equal((await request('POST', '/', draft, randomUUID(), customerToken)).status, 403);
    assert.equal((await request('PATCH', '/' + original[0].id, { ...draft, version: 0 }, null, customerToken)).status, 403);
    assert.equal((await request('POST', '/reorder', { bookIds: original.map(book => book.id), revision: 0 }, null, customerToken)).status, 403);
    for (const invalid of [{ format: null }, { format: 'a'.repeat(101) }, { publisher: 'a'.repeat(201) }, { pages: 1.5 }, { pages: 0 }, { pages: 100001 }, { price: 1.5 }, { price: 0 }, { price: 100000001 }, { year: 2025.5 }, { title: 'a'.repeat(201) }, { description: 'a'.repeat(5001) }, { imageUrl: 'javascript:alert(1)' }, { imageUrl: 'https://name:password@example.com/cover.png' }]) assert.equal((await request('POST', '/', { ...draft, ...invalid }, randomUUID())).status, 400);
    const key = randomUUID();
    const repeated = await Promise.all(Array.from({ length: 6 }, () => request('POST', '/', draft, key)));
    assert(repeated.every(result => result.status === 201));
    assert.equal(new Set(repeated.map(result => result.data._id)).size, 1);
    assert.equal(await Book.countDocuments(), 3);
    assert(repeated.every(result => !Object.hasOwn(result.data, 'creationKey')));
    assert.equal((await request('POST', '/', { ...draft, title: 'Changed payload' }, key)).status, 409);
    await Promise.all([0, 1, 2].map(i => request('POST', '/', { ...draft, title: 'Concurrent ' + i }, randomUUID()).then(result => assert.equal(result.status, 201))));
    let snapshot = (await request('GET', '/admin/catalog')).data;
    assert.equal(snapshot.books.length, 6); assert.equal(new Set(snapshot.books.map(book => book._id)).size, 6);
    const reverse = snapshot.books.map(book => book._id).reverse();
    const forward = snapshot.books.map(book => book._id);
    const races = await Promise.all([request('POST', '/reorder', { bookIds: reverse, revision: snapshot.revision }), request('POST', '/reorder', { bookIds: forward, revision: snapshot.revision })]);
    assert.deepEqual(races.map(result => result.status).sort(), [200, 409]);
    const winner = races[0].status === 200 ? reverse : forward;
    assert.deepEqual((await request('GET', '/')).data.map(book => book._id), winner);
    assert.equal((await request('POST', '/reorder', { bookIds: forward, revision: snapshot.revision })).status, 409);
    assert.equal((await request('POST', '/reorder', { bookIds: [forward[0], forward[0].toUpperCase()], revision: 0 })).status, 400);
    const edit = { ...draft, title: 'Edited title', version: 0 };
    const updated = await request('PATCH', '/' + original[0].id, edit);
    assert.equal(updated.status, 200); assert.equal(updated.data.__v, 1);
    assert.equal((await request('PATCH', '/' + original[0].id, edit)).status, 200);
    assert.equal((await request('PATCH', '/' + original[0].id, { ...edit, title: 'Stale overwrite' })).status, 409);
    assert.equal((await request('PATCH', '/' + new mongoose.Types.ObjectId(), edit)).status, 404);
    assert.equal((await Book.findById(original[0].id)).order, 0);
    snapshot = (await request('GET', '/admin/catalog')).data;
    const concurrent = await Promise.all([request('POST', '/reorder', { bookIds: snapshot.books.map(book => book._id).reverse(), revision: snapshot.revision }), request('POST', '/', { ...draft, title: 'Added while reordering' }, randomUUID())]);
    assert([200, 409].includes(concurrent[0].status)); assert.equal(concurrent[1].status, 201);
    const all = (await request('GET', '/')).data;
    assert.equal(all.length, 7); assert.equal(new Set(all.map(book => book._id)).size, 7);
    const update = Catalog.updateOne;
    Catalog.updateOne = () => { throw Error('Simulated append failure'); };
    const retryKey = randomUUID();
    let failed;
    try { failed = await request('POST', '/', { ...draft, title: 'Recoverable addition' }, retryKey); }
    finally { Catalog.updateOne = update; }
    assert.equal(failed.status, 500);
    const count = await Book.countDocuments();
    assert.equal((await request('POST', '/', { ...draft, title: 'Recoverable addition' }, retryKey)).status, 201);
    assert.equal(await Book.countDocuments(), count);
    assert.equal((await Catalog.findById('main')).bookIds.length, count);
    const publicBooks = (await request('GET', '/')).data;
    assert(publicBooks.every(book => !Object.hasOwn(book, 'creationKey')));
    const hooked=await request('POST','/',{...draft,title:'Hook test',hook:'  A doorway to adventure.  ',format:' Hardcover ',pages:368,publisher:' Synthetic Press '},randomUUID());
    assert.equal(hooked.status,201);assert.equal(hooked.data.hook,'A doorway to adventure.');assert.equal(hooked.data.format,'Hardcover');assert.equal(hooked.data.pages,368);assert.equal(hooked.data.publisher,'Synthetic Press');
    for(const hook of [null,{},'x'.repeat(101)])assert.equal((await request('POST','/',{...draft,hook},randomUUID())).status,400);
    const hookEdit=await request('PATCH','/'+hooked.data._id,{...draft,title:'Hook test',hook:'A different adventure.',format:'Paperback',pages:null,publisher:'',version:0});
    assert.equal(hookEdit.status,200);assert.equal(hookEdit.data.hook,'A different adventure.');assert.equal(hookEdit.data.pages,null);assert.equal(hookEdit.data.format,'Paperback');
    assert.equal((await request('PATCH','/'+hooked.data._id,{...draft,title:'Hook test',hook:'A conflicting hook.',version:0})).status,409);
    const cleared=await request('PATCH','/'+hooked.data._id,{...draft,title:'Hook test',hook:'',version:1});assert.equal(cleared.data.hook,'');
    const legacyRetry=await request('PATCH','/'+hooked.data._id,{...draft,title:'Hook test',version:2});assert.equal(legacyRetry.status,200);
    console.log('Passed: admin authorization, validation, legacy order preservation, concurrent/idempotent creation, atomic reorder conflicts, versioned edits, and interrupted-save recovery.');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === database && /^eread_admin_test_[a-f0-9]{32}$/.test(database)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
