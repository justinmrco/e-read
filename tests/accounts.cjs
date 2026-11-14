// Run: node tests/accounts.cjs. Real HTTP/auth/password flow in a disposable local database.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const backendRequire = createRequire(path.resolve(__dirname, '../backend/package.json'));
const mongoose = backendRequire('mongoose');
const express = backendRequire('express');
const jwt = backendRequire('jsonwebtoken');
const User = backendRequire('./models/User');
backendRequire('./models/Book'); backendRequire('./models/Transaction');
const database = 'eread_account_test_' + randomUUID().replaceAll('-', '');
process.env.JWT_SECRET = 'synthetic-test-only-secret-with-32-bytes';
async function main() {
  let server;
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/' + database, { serverSelectionTimeoutMS: 3000 });
    await User.init();
    const app = express(); app.use(express.json());
    app.use('/api/auth', backendRequire('./routes/auth'));
    app.use('/api/user', backendRequire('./routes/user'));
    app.use((error, req, res, next) => { res.status(500).json({ message: 'Test request failed' }); });
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const origin = 'http://127.0.0.1:' + server.address().port;
    async function request(route, token, body, method) {
      const response = await fetch(origin + route, { method: method || (body ? 'POST' : 'GET'), headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
      return { status: response.status, data: await response.json() };
    }
    const password = 'synthetic-password';
    for (const username of ['CustomerA', 'CustomerB']) assert.equal((await request('/api/auth/register', null, { username, email: username.toLowerCase() + '@example.com', password })).status, 201);
    await User.create({ username: 'Administrator', email: 'administrator@example.com', password, role: 'admin' });
    const login = async (username, secret = password) => request('/api/auth/login', null, { username, password: secret });
    const a = (await login('CustomerA')).data.token;
    const b = (await login('CustomerB')).data.token;
    const admin = (await login('Administrator')).data.token;
    const status = await request('/api/user/status', a);
    assert.equal(status.status, 200); assert.equal(status.data.user.username, 'CustomerA'); assert.equal(status.data.user.role, 'user');
    assert.equal(status.data.expiresAt, jwt.verify(a, process.env.JWT_SECRET).exp * 1000); assert(status.data.expiresAt > Date.now());
    assert(!Object.hasOwn(status.data.user, 'password'));
    const Book=backendRequire('./models/Book');
    const books=await Book.create([1,2].map(n=>({title:'Synthetic '+n,author:'Author',description:'Test only',imageUrl:'/sample-cover.svg',genre:'Fiction',year:2025,price:1000*n})));
    assert.equal((await request('/api/user/cart',null)).status,401);
    assert.equal((await request('/api/user/cart/items',a,{bookId:{$ne:null}})).status,400);
    await Promise.all(books.map(book=>request('/api/user/cart/items',a,{bookId:book.id})));
    assert.equal((await request('/api/user/cart',a)).data.items.length,2);
    assert.equal((await request('/api/user/cart',b)).data.items.length,0);
    await request('/api/user/cart/items',a,{bookId:books[0].id});
    assert.equal((await request('/api/user/cart',a)).data.items.length,2);
    await request('/api/user/cart/items/'+books[0].id,b,null,'DELETE');
    assert.equal((await request('/api/user/cart',a)).data.items.length,2);
    await request('/api/user/cart/items/'+books[0].id,a,null,'DELETE');
    assert.equal((await request('/api/user/cart',a)).data.total,2000);
    const missing=new mongoose.Types.ObjectId();await User.updateOne({username:'CustomerA'},{$addToSet:{cartBookIds:missing}});
    const omitted=await request('/api/user/cart',a);assert.equal(omitted.data.omitted,1);assert.equal(omitted.data.items.length,1);
    const full=await User.create({username:'FullCart',email:'full@example.com',password,cartBookIds:Array.from({length:49},()=>new mongoose.Types.ObjectId())});
    const fullToken=(await login('FullCart')).data.token;
    const lastSlot=await Promise.all(books.map(book=>request('/api/user/cart/items',fullToken,{bookId:book.id})));
    assert.deepEqual(lastSlot.map(result=>result.status).sort(),[200,409]);assert.equal((await User.findById(full.id)).cartBookIds.length,50);

    await User.updateOne({username:'CustomerA'},{$addToSet:{purchasedBooks:books[0]._id}});
    assert.equal((await request('/api/user/cart/items',a,{bookId:books[0].id})).status,409);
    assert.equal((await request('/api/user/profile',b,{username:'CustomerB',email:'updated@example.com',currentPassword:'wrong'},'PATCH')).status,400);
    assert.equal((await request('/api/user/profile',b,{username:'CustomerA',email:'updated@example.com',currentPassword:password},'PATCH')).status,409);
    const profile=await request('/api/user/profile',b,{username:'CustomerB',email:'UPDATED@example.com',currentPassword:password,role:'admin',cartBookIds:[]},'PATCH');
    assert.equal(profile.status,200);assert.equal(profile.data.user.email,'updated@example.com');assert.equal(profile.data.user.role,'user');assert(!('password' in profile.data.user));
    assert.equal((await request('/api/user/status',b)).status,200);
    assert.equal((await request('/api/user/change-password', a, { oldPassword: password, newPassword: 'synthetic-new-password' })).status, 200);
    assert.equal((await request('/api/user/status', a)).status, 401);
    assert.equal((await request('/api/user/status', b)).status, 200);
    assert.equal((await request('/api/user/status', admin)).data.user.role, 'admin');
    assert.equal((await login('CustomerA')).status, 401);
    assert.equal((await login('CustomerA', 'synthetic-new-password')).status, 200);
    const unchanged = await User.findOne({ username:'CustomerB' });
    assert.equal((await request('/api/user/change-password', b, { oldPassword:'incorrect', newPassword:'synthetic-new-password' })).status, 400);
    for (const invalid of ['short', '\u00e9'.repeat(37)]) assert.equal((await request('/api/user/change-password', b, { oldPassword:password, newPassword:invalid })).status, 400);
    const afterInvalid = await User.findById(unchanged._id);
    assert.equal(afterInvalid.password, unchanged.password); assert.equal(afterInvalid.tokenVersion, unchanged.tokenVersion);

    const racer = await User.create({ username:'Concurrent', email:'concurrent@example.com', password });
    const racingToken = (await login('Concurrent')).data.token;
    const originalCompare = User.prototype.comparePassword;
    let arrivals = 0, release;
    const barrier = new Promise(resolve => { release = resolve; });
    let raced;
    try {
      User.prototype.comparePassword = async function(candidate) {
        const matches = await originalCompare.call(this, candidate);
        if (this.id === racer.id && candidate === password) {
          if (++arrivals === 2) release();
          // A deadline prevents a broken test from hanging server shutdown.
          let timer;
          try { await Promise.race([barrier, new Promise((resolve,reject) => { timer = setTimeout(() => reject(Error('Password concurrency barrier timed out')), 3000); })]); }
          finally { clearTimeout(timer); }
        }
        return matches;
      };
      raced = await Promise.all(['first-password','second-password'].map(newPassword => request('/api/user/change-password', racingToken, { oldPassword:password, newPassword })));
    } finally { User.prototype.comparePassword = originalCompare; }
    assert.equal(arrivals,2);
    assert.deepEqual(raced.map(result => result.status).sort(),[200,409]);
    const winning = raced[0].status === 200 ? 'first-password' : 'second-password';
    const losing = winning === 'first-password' ? 'second-password' : 'first-password';
    const changed = await User.findById(racer._id);
    assert.equal(changed.tokenVersion,1);
    assert(await changed.comparePassword(winning)); assert(!(await changed.comparePassword(losing)));
    assert.equal((await request('/api/user/status', racingToken)).status,401);
    assert.equal((await login('Concurrent')).status,401);
    assert.equal((await login('Concurrent',losing)).status,401);
    const fresh = await login('Concurrent',winning); assert.equal(fresh.status,200);
    assert.equal((await request('/api/user/change-password',fresh.data.token,{oldPassword:winning,newPassword:'third-password'})).status,200);
    assert.equal((await User.findById(racer._id)).tokenVersion,2);
    assert.equal((await request('/api/user/status',fresh.data.token)).status,401);

    const legacy = await User.create({username:'Legacy',email:'legacy@example.com',password});
    await User.collection.updateOne({_id:legacy._id},{$unset:{tokenVersion:''}});
    const legacyToken = (await login('Legacy')).data.token;
    assert.equal((await request('/api/user/change-password',legacyToken,{oldPassword:password,newPassword:'legacy-new-password'})).status,200);
    assert.equal((await User.findById(legacy._id)).tokenVersion,1);
    assert.equal((await request('/api/user/status',legacyToken)).status,401);
    assert.equal((await login('Legacy','legacy-new-password')).status,200);
    assert.equal((await request('/api/user/status', b)).status,200);
    assert.equal((await request('/api/user/status', admin)).data.user.role,'admin');
    const identity = jwt.verify(b, process.env.JWT_SECRET);
    const expired = jwt.sign({ id: identity.id, tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: -1 });
    assert.equal((await request('/api/user/status', expired)).status, 401);
    await User.updateOne({ username: 'Administrator' }, { $set: { role: 'user' } });
    assert.equal((await request('/api/user/status', admin)).data.user.role, 'user');
    console.log('Passed: account-owned atomic carts, capacity concurrency, omitted books, authenticated profile edits, unique identity checks, real registration/login, safe session metadata, password persistence/revocation, unrelated account/admin isolation, expiry, atomic concurrent password changes, legacy versions, password validation, and current database roles.');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === database && /^eread_account_test_[a-f0-9]{32}$/.test(database)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
