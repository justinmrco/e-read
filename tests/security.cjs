// Run with node tests/security.cjs. Source handlers run against in-memory DB/gateway doubles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const id = '000000000000000000000001';
const other = '000000000000000000000002';
function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    module, exports: module.exports, require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name.startsWith('node:')) return require(name);
      throw Error('Unexpected dependency: ' + name);
    }, process: { env: { JWT_SECRET: 'test-only-placeholder', MIDTRANS_SERVER_KEY:'synthetic-api-key', MIDTRANS_SIGNATURE_KEY:'synthetic-signature-key', MIDTRANS_WEBHOOK_DEBUG:'true', FRONTEND_URL: 'http://localhost:3001' } }, Buffer, URL, console, ...globals,
  }, { filename: file });
  return module.exports;
}
function response() {
  return { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; }, send(data) { this.data = data; return this; }, set(key, value) { this.headers[key] = value; } };
}
function routerDouble() {
  const routes = [];
  const router = { post(url, ...handlers) { routes.push({ method: 'POST', url, handlers }); }, patch(url, ...handlers) { routes.push({ method: 'PATCH', url, handlers }); }, get(url, ...handlers) { routes.push({ method: 'GET', url, handlers }); }, use() {} };
  return { routes, Router: () => router };
}
async function invoke(handler, req) {
  const res = response();
  await handler(req, res, error => { if (error) throw error; res.next = true; });
  return res;
}
async function main() {
  const valid = load('backend/utils/validation.js', { mongoose: { Types: { ObjectId: { isValid: () => true } } } });
  assert(valid.objectId(id)); assert(!valid.objectId({ $ne: null })); assert(!valid.password('short')); assert(!valid.password(String.fromCodePoint(0x1f600).repeat(20))); assert(valid.email('demo@example.com')); assert(!valid.text({ $ne: '' }));
  let current = { id, role: 'user', tokenVersion: 0 };
  const auth = load('backend/middleware/auth.js', {
    jsonwebtoken: { verify(token, secret, options) { assert.equal(options.algorithms[0], 'HS256'); if (token === 'bad') throw Error('bad signature'); return { id, tokenVersion: token === 'revoked' ? 1 : 0, role: 'admin' }; } },
    '../models/User': { findById() { return { select: async () => current }; } },
  });
  assert.equal((await invoke(auth.authMiddleware, { headers: {} })).statusCode, 401);
  assert.equal((await invoke(auth.authMiddleware, { headers: { authorization: 'Bearer bad' } })).statusCode, 401);
  const req = { headers: { authorization: 'Bearer valid' } };
  assert((await invoke(auth.authMiddleware, req)).next); assert.equal(req.user.role, 'user');
  assert.equal((await invoke(auth.adminOnly, req)).statusCode, 403);
  assert.equal((await invoke(auth.authMiddleware, { headers: { authorization: 'Bearer revoked' } })).statusCode, 401);
  current = { id, role: 'admin', tokenVersion: 0 };
  await invoke(auth.authMiddleware, req); assert((await invoke(auth.adminOnly, req)).next);
  current = null; assert.equal((await invoke(auth.authMiddleware, req)).statusCode, 401);
  let now = 0;
  const limit = load('backend/middleware/rate-limit.js', {}, { Date: { now: () => now } })(1, 100);
  assert((await invoke(limit, { ip: 'test' })).next);
  assert.equal((await invoke(limit, { ip: 'test' })).statusCode, 429);
  now = 101; assert((await invoke(limit, { ip: 'test' })).next);
  const userLimit=load('backend/middleware/rate-limit.js')(1);
  assert((await invoke(userLimit,{ip:'same-tunnel',user:{id}})).next);
  assert((await invoke(userLimit,{ip:'same-tunnel',user:{id:other}})).next);
  assert.equal((await invoke(userLimit,{ip:'same-tunnel',user:{id}})).statusCode,429);
  const express = routerDouble();
  load('backend/routes/books.js', { express, '../models/Book': {}, '../models/Catalog': {}, '../models/User': {}, '../middleware/auth': auth, '../utils/validation': valid });
  for (const route of express.routes.filter(route => route.method !== 'GET' || route.url === '/admin/catalog')) assert(route.handlers.includes(auth.adminOnly), 'Catalog administration must require admin');
  const authRouter = routerDouble(); let queried = false; let created;
  load('backend/routes/auth.js', { express: authRouter, jsonwebtoken: { sign: () => 'test-token' }, '../models/User': { findOne: async () => { queried = true; return null; }, create: async data => { created = data; } }, '../utils/validation': valid, '../middleware/rate-limit': () => (req, res, next) => next() });
  const login = authRouter.routes.find(route => route.url === '/login').handlers.at(-1);
  assert.equal((await invoke(login, { body: { username: { $ne: '' }, password: 'password' } })).statusCode, 400); assert(!queried);
  assert.equal((await invoke(login, { body: { username: 'unknown', password: 'password' } })).statusCode, 401);
  const register = authRouter.routes.find(route => route.url === '/register').handlers.at(-1);
  assert.equal((await invoke(register, { body: { username: ' Demo ', email: 'DEMO@EXAMPLE.COM', password: 'password123', role: 'admin' } })).statusCode, 201);
  assert.equal(created.role, 'user'); assert.equal(created.email, 'demo@example.com'); assert.equal(created.username, 'Demo');
  const orders = new Map(); const owned = new Set(); let gatewayCalls = 0; let grantFails = false; let notification; let gatewayFailure;
  const user = { id, username: 'Demo', email: 'demo@example.com', get purchasedBooks() { return [...owned]; } };
  const book = { id: other, _id: other, title: 'Synthetic book', price: 27000 };
  const Transaction = {
    async exists() { return false; },
    async create(data) { assert(!orders.has(data.orderId)); if (data.activeCheckout && [...orders.values()].some(row => row.user === data.user && row.activeCheckout)) throw Object.assign(new Error('Duplicate active checkout'), { code: 11000 }); const row = { _id: String(orders.size), transactionStatus: 'pending', ...data }; orders.set(data.orderId, row); return row; },
    async findOne(filter) { return [...orders.values()].find(row => Object.entries(filter).every(([key, value]) => row[key] === value)); },
    async updateOne(filter, update) { const row = [...orders.values()].find(row => row._id === filter._id); const condition = filter.transactionStatus; if (!condition || (typeof condition === 'string' ? row.transactionStatus === condition : !condition.$nin.includes(row.transactionStatus))) Object.assign(row, update.$set); },
  };
  // The SDK must authenticate outbound calls with the API key, not the signing key.
  load('backend/utils/midtrans.js',{
    dotenv:{config(){}},'midtrans-client':{Snap:class {constructor(options){assert.equal(options.serverKey,'synthetic-api-key');assert.notEqual(options.serverKey,'synthetic-signature-key');this.httpClient={http_client:{defaults:{}}};}}},
  },{process:{env:{MIDTRANS_SERVER_KEY:'synthetic-api-key',MIDTRANS_SIGNATURE_KEY:'synthetic-signature-key',MIDTRANS_CLIENT_KEY:'synthetic-client-key'}}});
  const recoveryRows = new Map();let recoveryStorageFails=false;
  const PaymentRecovery={
    async findOne(filter){const row=recoveryRows.get(filter.orderId);return row&&(!filter.pending||row.pending)?{...row}:null;},
    async updateOne(filter,update,options){if(recoveryStorageFails)throw Error('Recovery DB unavailable');const row=recoveryRows.get(filter.orderId);if(row&&(!filter.attempt||row.attempt===filter.attempt))Object.assign(row,update.$set);else if(!row&&options?.upsert)recoveryRows.set(filter.orderId,{orderId:filter.orderId,...update.$set});},
  };
  const notificationLogs = [];
  const paymentDependencies = {
    '../utils/midtrans': { createTransaction: async params => { gatewayCalls++; assert.equal(params.transaction_details.gross_amount, 27000); assert.equal(params.item_details[0].price, 27000); assert(params.callbacks.finish.startsWith('http://localhost:3001/payment-success?')); return { token: 'sandbox-token', redirect_url: 'https://app.sandbox.midtrans.com/snap/v2/example' }; }, transaction: { notification: async () => notification, status: async () => { gatewayCalls++; if(gatewayFailure) throw gatewayFailure; return notification; } } },
    '../models/User': { findById: async () => user, updateOne: async (filter, update) => { if (grantFails) throw Error('DB temporarily unavailable'); for (const item of update.$addToSet.purchasedBooks.$each) owned.add(item); return { matchedCount: 1 }; } },
    '../models/Book': { find: async filter => filter._id.$in.includes(other) ? [book] : [] },
    '../models/Transaction': Transaction, '../utils/validation': valid, '../models/PaymentRecovery':PaymentRecovery, '../middleware/rate-limit':load('backend/middleware/rate-limit.js'),
  };
  const controller = load('backend/controllers/midtransController.js', paymentDependencies, {console:{...console,warn(...args){notificationLogs.push(args);}}});
  let result = await invoke(controller.createTransaction, { user: { id }, body: { bookId: other, amount: 1 } });
  assert.equal(result.data.amount, 27000); assert.equal(gatewayCalls, 1);
  const orderId = result.data.order_id; assert.match(orderId, /^EREAD-[a-f0-9-]{36}$/);
  assert.equal(result.data.checkoutState, 'ready'); assert.equal(result.data.items[0].price, 27000);
  result = await invoke(controller.createTransaction, { user: { id }, body: { bookId: id } });
  assert.equal(result.data.order_id, orderId); assert.equal(result.data.existing, true); assert.equal(gatewayCalls, 1);
  assert.equal((await invoke(controller.createCartTransaction, { user: { id }, body: { bookIds: [other, other] } })).statusCode, 400);
  assert.equal((await invoke(controller.createTransaction, { user: { id }, body: { bookId: { $ne: '' } } })).statusCode, 400);
  notification = { order_id: orderId, transaction_status: 'settlement', gross_amount: '1.00', currency: 'IDR' };
  await assert.rejects(controller.applyNotification(notification), /mismatch/); assert.equal(owned.size, 0);
  notification.gross_amount = '27000.00'; notification.currency = 'USD';
  await assert.rejects(controller.applyNotification(notification), /mismatch/); notification.currency = 'IDR';
  notification.transaction_status = 'capture'; notification.fraud_status = 'challenge';
  await controller.applyNotification(notification); assert.equal(owned.size, 0); assert.equal(orders.get(orderId).transactionStatus, 'pending');
  notification.fraud_status = 'accept'; grantFails = true;
  await assert.rejects(controller.applyNotification(notification), /temporarily/); assert.equal(orders.get(orderId).transactionStatus, 'capture');
  grantFails = false;
  await Promise.all([controller.applyNotification(notification), controller.applyNotification(notification)]);
  assert.equal(owned.size, 1);
  notification.transaction_status = 'pending'; await controller.applyNotification(notification); assert.equal(orders.get(orderId).transactionStatus, 'capture');
  notification.transaction_status = 'expire'; await controller.applyNotification(notification); assert.equal(orders.get(orderId).transactionStatus, 'capture');
  notification.transaction_status = 'settlement'; notification.transaction_time = '2026-11-12 12:00:00'; notification.settlement_time = '2026-11-12 12:01:00';
  await controller.applyNotification(notification); assert.equal(orders.get(orderId).transactionStatus, 'settlement'); assert.equal(orders.get(orderId).activeCheckout, false);
  assert.equal(orders.get(orderId).gatewayTransactionTime.toISOString(), '2026-11-12T05:00:00.000Z');
  assert.equal(orders.get(orderId).settledAt.toISOString(), '2026-11-12T05:01:00.000Z');
  notification.transaction_status = 'capture'; await controller.applyNotification(notification); assert.equal(orders.get(orderId).transactionStatus, 'settlement');
  const callsBefore = gatewayCalls;
  assert.equal((await invoke(controller.getOrder, { user: { id: other }, params: { orderId } })).statusCode, 404); assert.equal(gatewayCalls, callsBefore);
  result = await invoke(controller.getOrder, { user: { id }, params: { orderId } }); assert.equal(result.data.paid, true);
  assert.equal((await invoke(controller.createTransaction, { user: { id }, body: { bookId: other } })).statusCode, 409);
  assert.equal((await invoke(controller.createTransaction, { user: { id }, body: { bookId: id } })).statusCode, 404);
  assert.equal((await invoke(controller.handleNotification, { body: { transaction_id: '../invalid' } })).statusCode, 400);
  const signed={order_id:orderId,status_code:'200',gross_amount:'27000.00',transaction_status:'settlement'};
  signed.signature_key=require('node:crypto').createHash('sha512').update(signed.order_id+signed.status_code+signed.gross_amount+'synthetic-signature-key').digest('hex');
  const apiSigned={...signed,signature_key:require('node:crypto').createHash('sha512').update(signed.order_id+signed.status_code+signed.gross_amount+'synthetic-api-key').digest('hex')};
  assert.equal((await invoke(controller.handleNotification,{body:apiSigned})).statusCode,403);
  const beforeUnsigned=gatewayCalls;
  assert.equal((await invoke(controller.handleNotification,{body:{...signed,signature_key:'0'.repeat(128)}})).statusCode,403);
  assert.equal((await invoke(controller.handleNotification,{body:{...signed,gross_amount:'1.00'}})).statusCode,403);
  assert.equal((await invoke(controller.handleNotification,{body:{...signed,signature_key:'bad'}})).statusCode,400);
  assert.equal(gatewayCalls,beforeUnsigned);
  assert.equal((await invoke(controller.handleNotification,{body:signed})).data,'OK');
  // Raw JSON preserves the original amount string, including decimal zeroes.
  assert.equal((await invoke(controller.handleNotification,{body:Buffer.from(JSON.stringify(signed))})).data,'OK');
  assert.equal((await invoke(controller.handleNotification,{body:Buffer.from('{bad json')})).statusCode,400);
  const wrongDecimals={...signed,gross_amount:'27000'};
  assert.equal((await invoke(controller.handleNotification,{body:Buffer.from(JSON.stringify(wrongDecimals))})).statusCode,403);
  assert.equal((await invoke(controller.handleNotification,{body:{...signed,gross_amount:27000}})).statusCode,400);
  const beforeMissing=JSON.stringify([...orders.values()]);const ownedBefore=owned.size;
  gatewayFailure=Object.assign(Error('Not found'),{httpStatusCode:404});
  result=await invoke(controller.handleNotification,{body:signed});assert.equal(result.statusCode,200);assert.equal(result.data,'OK');
  assert.equal(JSON.stringify([...orders.values()]),beforeMissing);assert.equal(owned.size,ownedBefore);
  assert.equal(recoveryRows.get(orderId).pending,true);assert.equal(recoveryRows.get(orderId).httpStatus,404);
  { // Exercise server.js middleware order over HTTP, without application DB/gateway access.
  const express=require('node:module').createRequire(path.join(root,'backend/package.json'))('express');
  let sawRaw=false;const router=express.Router();
  router.post('/notification',(req,res)=>{sawRaw=Buffer.isBuffer(req.body);return controller.handleNotification(req,res);});
  router.post('/create-transaction',(req,res)=>res.json({parsed:!Buffer.isBuffer(req.body),amount:req.body.amount}));
  function testExpress(){const app=express();const listen=app.listen.bind(app);app.listen=()=>listen(0,'127.0.0.1');return app;}
  Object.assign(testExpress,express);
  const model={init:async()=>{},countDocuments:async()=>0,createIndexes:async()=>{}};
  const serverModule=load('backend/server.js',{
    dotenv:{config(){}},express:testExpress,mongoose:{connect:async()=>{},disconnect:async()=>{}},cors:()=>((req,res,next)=>next()),
    './routes/auth':express.Router(),'./routes/books':express.Router(),'./routes/user':express.Router(),'./routes/midtrans':router,
    './models/User':model,'./models/Book':model,'./models/Transaction':model,'./models/PaymentRecovery':model,
  },{process:{env:{MONGODB_URI:'test-only',JWT_SECRET:'x'.repeat(32),FRONTEND_URL:'http://localhost:3001',MIDTRANS_SERVER_KEY:'synthetic-api-key', MIDTRANS_SIGNATURE_KEY:'synthetic-signature-key',MIDTRANS_CLIENT_KEY:'test-only'}},console:{...console,log(){}}});
  const server=await serverModule.start();
  try {
    if(!server.listening)await require('node:events').once(server,'listening');
    const base='http://127.0.0.1:'+server.address().port+'/api/midtrans';
    const post=(url,body)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body});
    const decimal={...signed,gross_amount:'105000.00'};
    decimal.signature_key=require('node:crypto').createHash('sha512').update(decimal.order_id+decimal.status_code+decimal.gross_amount+'synthetic-signature-key').digest('hex');
    let response=await post('/notification',JSON.stringify(decimal));assert.equal(response.status,200);assert.equal(await response.text(),'OK');assert(sawRaw);
    response=await post('/notification',JSON.stringify({...decimal,gross_amount:'105000'}));assert.equal(response.status,403);
    const mismatch=notificationLogs.findLast(([message])=>message==='Midtrans signature mismatch')[1];
    assert.equal(mismatch.signatureInput,JSON.stringify(decimal.order_id+'200105000'));
    assert.equal(mismatch.receivedSignature,decimal.signature_key);assert.match(mismatch.expectedSignature,/^[a-f0-9]{128}$/);
    assert(!JSON.stringify(notificationLogs).includes('synthetic-signature-key'));
    assert(!JSON.stringify(notificationLogs).includes('synthetic-api-key'));
    assert.equal((await post('/notification',JSON.stringify({...decimal,gross_amount:105000}))).status,400);
    assert.equal((await post('/notification','{invalid')).status,400);
    assert.equal((await post('/notification','x'.repeat(102401))).status,413);
    response=await post('/create-transaction',JSON.stringify({amount:105000}));assert.deepEqual(await response.json(),{parsed:true,amount:105000});
    assert.equal(JSON.stringify([...orders.values()]),beforeMissing);assert.equal(owned.size,ownedBefore);
  } finally {await new Promise(resolve=>server.close(resolve));}
  }

  gatewayFailure=Object.assign(Error('Unavailable'),{httpStatusCode:503});
  assert.equal((await invoke(controller.handleNotification,{body:signed})).statusCode,200);
  gatewayFailure=null;
  grantFails=true;assert.equal((await invoke(controller.handleNotification,{body:signed})).statusCode,200);grantFails=false;
  assert.equal(recoveryRows.get(orderId).pending,true);
  await controller.reconcileOrder(orderId);assert.equal(recoveryRows.get(orderId).pending,false);
  recoveryStorageFails=true;assert.equal((await invoke(controller.handleNotification,{body:signed})).statusCode,503);recoveryStorageFails=false;

  const normalLogs=[];
  const standardController=load('backend/controllers/midtransController.js',paymentDependencies,{process:{env:{MIDTRANS_SIGNATURE_KEY:'synthetic-api-key'}},console:{...console,warn(...args){normalLogs.push(args);}}});
  assert.equal((await invoke(standardController.handleNotification,{body:apiSigned})).statusCode,200);
  assert.equal((await invoke(standardController.handleNotification,{body:signed})).statusCode,403);
  assert(!JSON.stringify(normalLogs).includes('expectedSignature'));assert(!JSON.stringify(normalLogs).includes('receivedSignature'));
  assert(!JSON.stringify(normalLogs).includes('synthetic-api-key'));
  const pendingOrder = 'EREAD-00000000-0000-4000-8000-000000000001';
  await Transaction.create({ user: id, books: [other], orderId: pendingOrder, amount: 27000 });
  notification = { ...notification, order_id: pendingOrder, transaction_status: 'expire' };
  await controller.applyNotification(notification); notification.transaction_status = 'pending'; await controller.applyNotification(notification);
  assert.equal(orders.get(pendingOrder).transactionStatus, 'expire');
  // Public source hygiene: no private env/PDF/build/dependency assets in the publication file list.
  function walk(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => ['node_modules', '.next', '.git'].includes(entry.name) ? [] : entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]); }
  const files = walk(root);
  assert(fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split('\n').includes('.env'));
  assert(fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split('\n').includes('!.env.example'));
  assert(!files.some(file => file.endsWith('.pdf')));
  assert(!fs.existsSync(path.join(root, 'frontend/components/PurchaseBookModal.js')));
  assert(!files.filter(file => /\.(js|mjs|cjs)$/.test(file) && !file.includes(path.sep + 'tests' + path.sep)).some(file => fs.readFileSync(file, 'utf8').includes('/payment-pending')));

  // Exercise the actual browser helpers with storage/network doubles, without React or third-party modules.
  const storage = new Map(); let fetchResponse; let fetchOptions; let requested; let redirected;
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const window = { dispatchEvent() {}, location: { assign: url => { redirected = url; } } };
  let source = fs.readFileSync(path.join(root, 'frontend/lib/api.js'), 'utf8').replaceAll('export ', '');
  const apiModule = { exports: {} };
  vm.runInNewContext(source + '\nmodule.exports = { apiRequest, signalCart, clearSession, saveSession };', { module: apiModule, process: { env: { NEXT_PUBLIC_API_URL: 'http://localhost:5000/' } }, localStorage, window, AbortSignal, Event, fetch: async (url, options) => { requested = url; fetchOptions = options; return fetchResponse; } });
  storage.set('admin_token', 'administrator'); storage.set('token', 'customer');
  fetchResponse = { ok: true, json: async () => ({ books: [] }) };
  await apiModule.exports.apiRequest('/api/books', { admin: true }); assert.equal(fetchOptions.headers.Authorization, 'Bearer administrator'); assert.equal(requested, 'http://localhost:5000/api/books');
  fetchResponse = { ok: false, status: 401, json: async () => ({ message: 'Expired' }) };
  await assert.rejects(apiModule.exports.apiRequest('/api/books', { admin: true }), /Expired/); assert(!storage.has('admin_token')); assert.equal(storage.get('token'), 'customer');
  for (const ok of [true, false]) {
    let complete;
    fetchResponse = new Promise(resolve => { complete = resolve; });
    const old = apiModule.exports.apiRequest('/api/user/status');
    storage.set('token', 'new-customer');
    complete({ ok, status: ok ? 200 : 401, json: async () => ({ message: 'Old session', user: { username: 'Previous account' } }) });
    await assert.rejects(old, error => error.name === 'AbortError');
    assert.equal(storage.get('token'), 'new-customer');
    storage.set('token', 'customer');
  }
  apiModule.exports.saveSession({ token: 'administrator', role: 'admin' });
  assert.equal(apiModule.exports.clearSession(false, 'old-customer'), false);
  assert.equal(storage.get('token'), 'customer');
  assert.equal(apiModule.exports.clearSession(false, 'customer'), true);
  assert(!storage.has('token')); assert.equal(storage.get('admin_token'), 'administrator');
  let checkoutBody; let checkoutResponse = { redirect_url: 'https://app.sandbox.midtrans.com/snap/v2/example' };
  source = fs.readFileSync(path.join(root, 'frontend/lib/checkout.js'), 'utf8').replace(/^import .*;\r?\n/, '').replaceAll('export ', '');
  const checkoutModule = { exports: {} };
  vm.runInNewContext(source + '\nmodule.exports = { checkout };', { module: checkoutModule, URL, window, localStorage:{getItem:key=>storage.get(key)??null}, apiRequest: async (url, options) => { checkoutBody = JSON.parse(options.body); return checkoutResponse; } });
  assert.equal(await checkoutModule.exports.checkout([other]), 'redirecting'); assert.equal(checkoutBody.bookId, other); assert(!Object.hasOwn(checkoutBody, 'amount')); assert.equal(redirected, checkoutResponse.redirect_url);
  await checkoutModule.exports.checkout([other], true); assert.equal(checkoutBody.bookIds[0], other);
  checkoutResponse = { existing: true, order_id: orderId, items:[{bookId:other}], redirect_url: 'https://app.sandbox.midtrans.com/snap/v2/example' };
  await checkoutModule.exports.checkout([other]); assert.equal(redirected, checkoutResponse.redirect_url);
  await checkoutModule.exports.checkout([other],true); assert.equal(redirected, checkoutResponse.redirect_url);
  checkoutResponse = {existing:true,order_id:orderId,items:[{bookId:id}],redirect_url:'https://app.sandbox.midtrans.com/snap/v2/previous'};
  await checkoutModule.exports.checkout([other]);assert.equal(redirected,'/payment-success?order_id='+orderId+'&review=1');
  checkoutResponse = { existing:true, order_id:orderId };
  await checkoutModule.exports.checkout([other]); assert.equal(redirected, '/payment-success?order_id=' + orderId+'&review=1');
  checkoutResponse = { checkoutState: 'uncertain', order_id: orderId };
  await checkoutModule.exports.checkout([other]); assert.equal(redirected, '/payment-success?order_id=' + orderId);
  checkoutResponse = { redirect_url: 'https://example.com/payment' }; await assert.rejects(checkoutModule.exports.checkout([other]), /Invalid/);
  checkoutResponse = { redirect_url: 'javascript:alert(1)' }; await assert.rejects(checkoutModule.exports.checkout([other]), /Invalid/);
  checkoutResponse = { existing:true, items:[{bookId:other}], redirect_url:'https://example.com/payment' }; await assert.rejects(checkoutModule.exports.checkout([other]), /Invalid/);
  checkoutResponse = { redirect_url:'https://user:pass@app.sandbox.midtrans.com/snap/v2/example' }; await assert.rejects(checkoutModule.exports.checkout([other]), /Invalid/);
  let resolveAccount;const beforeAccountRedirect=redirected;
  storage.set('token','original-customer');checkoutResponse=new Promise(resolve=>resolveAccount=resolve);
  const accountCheckout=checkoutModule.exports.checkout([other],false,'original-customer');
  storage.set('token','other-customer');resolveAccount({redirect_url:'https://app.sandbox.midtrans.com/snap/v2/account'});
  await assert.rejects(accountCheckout,/Account changed/);assert.equal(redirected,beforeAccountRedirect);
  let resolveLate, active=true;const beforeRedirect=redirected;
  checkoutResponse=new Promise(resolve=>resolveLate=resolve);
  const dismissedCheckout=checkoutModule.exports.checkout([other],false,undefined,()=>active);
  active=false;resolveLate({redirect_url:'https://app.sandbox.midtrans.com/snap/v2/late'});
  assert.equal(await dismissedCheckout,'dismissed');assert.equal(redirected,beforeRedirect);

  console.log('Passed: validation, auth/admin roles, revocation, rate limits, server pricing, cart checks, verified notifications, fraud handling, concurrent retries, monotonic payment status, ownership, and publication hygiene.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
