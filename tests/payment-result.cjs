// Exercise the real page's effect/render with React, API, and storage doubles; no browser/gateway.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const frontendRequire = createRequire(path.join(root, 'frontend/package.json'));
async function main() {
  const {records}=require('./frontend-modules.cjs')();
  const source = fs.readFileSync(path.join(root, 'frontend/app/payment-success/page.js'), 'utf8');
  const { code } = await frontendRequire('next/dist/build/swc').transform(source, { filename: 'page.js', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' } });
  for (const failure of ['library', 'storage', 'login', 'uncertain', 'pending', 'cancelled']) {
    const state = []; let cursor = 0; const effects = []; let renders = false;
    const react = { Suspense: 'suspense', useState(value) { const index = cursor++; if (!(index in state)) state[index] = value; return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }]; }, useEffect(callback) { if (!renders) effects.push(callback); } };
    const jsx = (type, props) => ({ type, props });
    const apiRequest = async route => {
      if (failure === 'login') throw Object.assign(new Error('Please log in.'), { status: 401 });
      if (route === '/api/user/books') { if (failure === 'library') throw Error('Library offline'); return { books: [] }; }
      return { orderId: 'EREAD-00000000-0000-4000-8000-000000000001', paid: !['uncertain','pending','cancelled'].includes(failure), status: failure === 'cancelled' ? 'cancel' : ['uncertain','pending'].includes(failure) ? 'pending' : 'settlement', checkoutState:failure === 'uncertain' ? 'uncertain' : 'ready', amount: 15000 };
    };
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, URL, window: new EventTarget(), localStorage: { getItem:()=> 'synthetic', setItem() { throw Error('Storage unavailable'); } }, require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name === 'next/navigation') return { useSearchParams: () => new URLSearchParams('order_id=EREAD-00000000-0000-4000-8000-000000000001') };
      if (name === 'next/link') return 'link';
      if (name.includes('LoginModal')) return 'login-modal';
      if (name.includes('/lib/records')) return records;
      if (name.includes('/lib/api')) return { apiRequest, signalCart: () => { throw Error('Storage unavailable'); } };
      throw Error('Unexpected dependency ' + name);
    } });
    const wrapper = module.exports.default();
    const page = wrapper.props.children.type;
    page(); const cleanups = effects.map(effect => effect());
    for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve));
    cursor = 0; renders = true;
    const tree = page();
    const text = JSON.stringify(tree);
    if (failure === 'login') {
      assert.equal(state[5], true);
      assert(text.includes('Log in to check this order'));
      assert(text.includes('EREAD-00000000-0000-4000-8000-000000000001'));
    } else if (['uncertain','pending','cancelled'].includes(failure)) {
      assert.equal(state[0].paid, false); assert.equal(text.includes('Recover this checkout'), failure !== 'cancelled');
      if (failure !== 'cancelled') { assert(text.includes('missing gateway status does not prove')); assert(text.includes('Keep the order reference')); }
    } else {
      assert.equal(state[0].paid, true); assert.equal(state[1], ''); assert.equal(state[2], false);
      assert(text.includes('Payment confirmed.'));
      assert(text.includes('Payment remains confirmed.'));
    }
    cleanups.forEach(cleanup => cleanup?.());
  }
  console.log('Passed: confirmed payment survives library/storage failures; expired login keeps the order reference.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
