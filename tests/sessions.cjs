// Run: node tests/sessions.cjs. Real browser helpers/hooks with deterministic network/event/timer doubles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const frontendRequire = createRequire(path.join(root, 'frontend/package.json'));
const storage = new Map();
const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
const window = new EventTarget();
const {records,adminSave}=require('./frontend-modules.cjs')({window});
const timers = new Map(); let nextTimer = 0; let requests = 0; let respond;
const apiModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'frontend/lib/api.js'), 'utf8').replaceAll('export ', '') + '\nmodule.exports = { apiRequest, saveSession, clearSession };', {
  module: apiModule, process: { env: {} }, localStorage, window, Event, AbortSignal,
  fetch: async () => { requests++; return respond(); },
});
const reply = (username, role = 'user') => ({ ok: true, json: async () => ({ loggedIn: true, user: { username, role }, expiresAt: Date.now() + 60000 }) });
function changed(key) { window.dispatchEvent(Object.assign(new Event('storage'), { key })); }
function hooks() {
  const slots = []; let cursor = 0; let dirty = false; let output; let render; const pending = [];
  const react = {
    useCallback(callback, deps) { const index = cursor++; const old=slots[index]; if (!old || deps.some((value,i)=>!Object.is(value,old.deps[i]))) slots[index]={deps,callback}; return slots[index].callback; },
    useRef(value) { const index = cursor++; slots[index] ??= { current:value }; return slots[index]; },
    useState(value) { const index = cursor++; slots[index] ??= { value: typeof value === 'function' ? value() : value }; return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; dirty = true; }]; },
    useEffect(callback, deps) { const index = cursor++; const old = slots[index]; if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) { old?.cleanup?.(); slots[index] = { deps }; pending.push(() => { slots[index].cleanup = callback(); }); } },
  };
  return { react,
    mount(component) { render = () => { cursor = 0; dirty = false; output = component(); for (const effect of pending.splice(0)) effect(); }; render(); },
    rerender() { render(); },
    async settle() { for (let i = 0; i < 12; i++) { if (dirty) render(); await new Promise(resolve => setImmediate(resolve)); } return output; },
    dispose() { for (const slot of slots) slot?.cleanup?.(); },
  };
}
async function main() {
  const { code } = await frontendRequire('next/dist/build/swc').transform(fs.readFileSync(path.join(root, 'frontend/lib/use-session.js'), 'utf8'), { filename: 'use-session.js', jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' } });
  function load(harness) {
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, localStorage, window, Date, setTimeout: callback => { const id = ++nextTimer; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id), require(name) { if(name.includes('/lib/records'))return records;if(name.includes('/lib/admin-save'))return adminSave;
    if (name === 'react') return harness.react; if (name === './api') return apiModule.exports; throw Error(name); } });
    return module.exports.useSession;
  }
  let oldReply; let newReply;
  respond = () => new Promise(resolve => { if (!oldReply) oldReply = resolve; else newReply = resolve; });
  storage.set('token', 'account-A'); storage.set('admin_token', 'unrelated-admin');
  let harness = hooks(); let useSession = load(harness);
  harness.mount(() => useSession());
  let session = await harness.settle(); assert.equal(session.user, null); assert.equal(session.checking, true);
  storage.set('token', 'account-B'); changed('token'); await harness.settle();
  newReply(reply('Account B')); session = await harness.settle(); assert.equal(session.user.username, 'Account B');
  oldReply(reply('Account A')); session = await harness.settle(); assert.equal(session.user.username, 'Account B');
  const count = requests; changed('cart'); await harness.settle(); assert.equal(requests, count);
  const verifiedUser = session.user;
  respond = async () => reply('Account B'); window.dispatchEvent(new Event('focus'));
  session = await harness.settle(); assert.equal(session.user, verifiedUser); assert.equal(session.checking, false); assert(requests > count);
  respond = async () => { throw Error('Synthetic offline connection'); }; window.dispatchEvent(new Event('focus'));
  session = await harness.settle(); assert.equal(session.user,verifiedUser); assert.equal(session.unavailable,true); assert.equal(session.checking,false); assert.equal(timers.size,1); assert.equal(storage.get('token'),'account-B');
  respond = async () => reply('Account B'); session.retry(); session=await harness.settle(); assert.equal(session.user,verifiedUser);assert.equal(session.unavailable,false);assert.equal(session.error,'');
  respond = async () => ({ ok: false, status: 401, json: async () => ({ message: 'Expired' }) });
  assert.equal(timers.size, 1); [...timers.values()][0]();
  session = await harness.settle(); assert.equal(session.user, null); assert.equal(session.checking, false); assert(!storage.has('token'));
  assert.equal(storage.get('admin_token'), 'unrelated-admin');
  harness.dispose(); assert.equal(timers.size, 0);
  respond = async () => reply('Customer', 'user'); storage.set('token', 'customer');
  harness = hooks(); useSession = load(harness); harness.mount(() => useSession(true));
  session = await harness.settle(); assert.equal(session.user, null); assert(!storage.has('admin_token')); assert.equal(storage.get('token'), 'customer');
  harness.dispose();
  respond = async () => reply('Customer'); harness = hooks(); useSession = load(harness); harness.mount(() => useSession());
  session = await harness.settle(); assert.equal(session.user.username, 'Customer');
  storage.clear(); changed(null); session = await harness.settle(); assert.equal(session.user, null); assert.equal(session.checking, false);
  harness.dispose();
  storage.set('token','unverified');respond=async()=>{throw Error('Connection unavailable');};
  harness=hooks();useSession=load(harness);harness.mount(()=>useSession());session=await harness.settle();
  assert.equal(session.user,null);assert.equal(session.unavailable,true);assert.equal(session.checking,false);assert.equal(storage.get('token'),'unverified');
  respond=async()=>reply('Recovered');session.retry();session=await harness.settle();assert.equal(session.user.username,'Recovered');assert.equal(session.unavailable,false);
  respond=async()=>{throw Error('Offline at expiry');};window.dispatchEvent(new Event('focus'));session=await harness.settle();assert.equal(session.user.username,'Recovered');
  [...timers.values()][0]();session=await harness.settle();assert.equal(session.user,null);assert.equal(session.unavailable,true);harness.dispose();
  // Cached administrator identity must not clear its open editor on temporary failure/recovery.
  const adminCode=await frontendRequire('next/dist/build/swc').transform(fs.readFileSync(path.join(root,'frontend/app/admin/page.js'),'utf8'),{filename:'admin.js',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
  harness=hooks();const adminModule={exports:{}};const adminUser={_id:'aaaaaaaaaaaaaaaaaaaaaaaa',username:'Synthetic admin',role:'admin'};let catalogRequests=0,retries=0;
  let adminSession={token:'synthetic-admin',user:adminUser,checking:false,unavailable:false,retry:()=>retries++};
  const adminJsx=(type,props)=>({type,props});
  vm.runInNewContext(adminCode.code,{module:adminModule,exports:adminModule.exports,window,require(name){
    if(name.includes('/lib/records'))return records;if(name.includes('/lib/admin-save'))return adminSave;
    if(name==='react')return harness.react;if(name==='react/jsx-runtime')return{jsx:adminJsx,jsxs:adminJsx,Fragment:'fragment'};
    if(name==='@dnd-kit/core')return{useSensors:()=>[],useSensor:()=>({}),DndContext:'dnd'};
    if(name==='@dnd-kit/sortable')return{SortableContext:'sortable'};
    if(name.includes('use-session'))return{useSession:()=>adminSession};
    if(name.includes('/lib/api'))return{apiRequest:async()=>{catalogRequests++;return{books:[{_id:'synthetic-book',title:'Synthetic'}],revision:1};}};
    return name;
  }});
  harness.mount(adminModule.exports.default);let adminTree=await harness.settle();
  function locate(node,predicate){if(!node||typeof node!=='object')return;if(Array.isArray(node))return node.map(child=>locate(child,predicate)).find(Boolean);return predicate(node)?node:locate(node.props?.children,predicate);}
  locate(adminTree,node=>node.type==='button'&&node.props.children==='Add book').props.onClick();adminTree=await harness.settle();
  assert(locate(adminTree,node=>String(node.type).includes('AddBookModal')));
  adminSession={...adminSession,unavailable:true,error:'Offline'};harness.rerender();adminTree=await harness.settle();
  const preserved=locate(adminTree,node=>String(node.type).includes('AddBookModal'));assert(preserved);assert.equal(preserved.props.connectionUnavailable,true);preserved.props.onRetryConnection();assert.equal(retries,1);
  assert.equal(catalogRequests,1);adminSession={...adminSession,unavailable:false,error:''};harness.rerender();adminTree=await harness.settle();assert(locate(adminTree,node=>String(node.type).includes('AddBookModal')));assert.equal(catalogRequests,1);harness.dispose();
  // Old catalog loads cannot restore another account's data or end a newer loading state.
  harness=hooks();const catalogModule={exports:{}};const catalogPending=[];
  adminSession={token:'admin-A',user:{_id:'aaaaaaaaaaaaaaaaaaaaaaaa',username:'A'},checking:false,unavailable:false};
  vm.runInNewContext(adminCode.code,{module:catalogModule,exports:catalogModule.exports,window,require(name){
    if(name.includes('/lib/records'))return records;if(name.includes('/lib/admin-save'))return adminSave;
    if(name==='react')return harness.react;
    if(name==='react/jsx-runtime')return{jsx:adminJsx,jsxs:adminJsx,Fragment:'fragment'};
    if(name==='@dnd-kit/core')return{useSensors:()=>[],useSensor:()=>({}),DndContext:'dnd'};
    if(name==='@dnd-kit/sortable')return{SortableContext:'sortable'};
    if(name.includes('use-session'))return{useSession:()=>adminSession};
    if(name.includes('/lib/api'))return{apiRequest:()=>new Promise(resolve=>catalogPending.push(resolve))};
    return name;
  }});
  harness.mount(catalogModule.exports.default);await harness.settle();
  adminSession={...adminSession,token:'admin-B',user:{_id:'bbbbbbbbbbbbbbbbbbbbbbbb',username:'B'}};harness.rerender();await harness.settle();
  catalogPending[0]({books:[{_id:'old-admin-book',title:'Old account catalog'}],revision:1});
  let catalogTree=await harness.settle();assert(!JSON.stringify(catalogTree).includes('Old account catalog'));
  assert.equal(locate(catalogTree,node=>node.props?.children==='Reload catalog').props.disabled,true);
  catalogPending[1]({books:[{_id:'new-admin-book',title:'Current account catalog'}],revision:2});
  catalogTree=await harness.settle();assert(JSON.stringify(catalogTree).includes('Current account catalog'));
  assert.equal(locate(catalogTree,node=>node.props?.children==='Reload catalog').props.disabled,false);harness.dispose();
  // Delayed administrator login must not survive navigation, logout or account changes.
  for (const scenario of ['success','failure','unmount','logout','logout-failure','switch','roundtrip','storage-clear','unrelated-storage']) {
    harness=hooks();const instance={exports:{}};let resolveLogin,rejectLogin,submissions=0,saves=0;
    storage.delete('admin_token');
    vm.runInNewContext(adminCode.code,{module:instance,exports:instance.exports,window,localStorage,require(name){
      if(name.includes('/lib/records'))return records;if(name.includes('/lib/admin-save'))return adminSave;
    if(name==='react')return harness.react;
      if(name==='react/jsx-runtime')return{jsx:adminJsx,jsxs:adminJsx,Fragment:'fragment'};
      if(name==='@dnd-kit/core')return{useSensors:()=>[],useSensor:()=>({}),DndContext:'dnd'};
      if(name==='@dnd-kit/sortable')return{SortableContext:'sortable'};
      if(name.includes('use-session'))return{useSession:()=>({user:null,checking:false,unavailable:false})};
      if(name.includes('/lib/api'))return{saveSession:data=>{saves++;apiModule.exports.saveSession(data);},apiRequest:()=>{submissions++;return new Promise((resolve,reject)=>{resolveLogin=resolve;rejectLogin=reject;});}};
      return name;
    }});
    harness.mount(instance.exports.default);let tree=await harness.settle();
    const form=locate(tree,node=>node.type==='form');const pendingLogin=form.props.onSubmit({preventDefault(){}});
    await form.props.onSubmit({preventDefault(){}});assert.equal(submissions,1);
    if(scenario==='unmount')harness.dispose();
    if(scenario==='logout'||scenario==='logout-failure')apiModule.exports.clearSession(true);
    if(scenario==='switch'){storage.set('admin_token','other-admin');changed('admin_token');}
    if(scenario==='roundtrip'){storage.set('admin_token','other-admin');changed('admin_token');storage.delete('admin_token');changed('admin_token');}
    if(scenario==='storage-clear')changed(null);
    if(scenario==='unrelated-storage')changed('cart');
    if(scenario==='failure'||scenario==='logout-failure')rejectLogin(Error('Synthetic invalid credentials'));
    else resolveLogin({token:'synthetic-login',role:'admin'});
    await pendingLogin;tree=await harness.settle();
    assert.equal(saves,['success','unrelated-storage'].includes(scenario)?1:0,scenario);
    assert.equal(JSON.stringify(tree).includes('Synthetic invalid credentials'),scenario==='failure');
    if(scenario==='switch')assert.equal(storage.get('admin_token'),'other-admin');
    if(scenario!=='unmount')harness.dispose();
  }
  // Ownership failures block purchases; retries and account changes must recover safely.
  const artModule={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'frontend/lib/book-detail-art.js'),'utf8').replace('export const bookDetailArt =','module.exports ='),{module:artModule});
  assert.equal(Object.keys(artModule.exports).length,12);
  for(const [cover,art] of Object.entries(artModule.exports)) { assert(fs.existsSync(path.join(root,'frontend/public',cover)));assert(fs.existsSync(path.join(root,'frontend/public/covers/decorations',art.motif+'.png'))); }
  const book={_id:'aaaaaaaaaaaaaaaaaaaaaaaa',title:'Synthetic',price:1000};
  const detailCode=await frontendRequire('next/dist/build/swc').transform(fs.readFileSync(path.join(root,'frontend/components/BookDetailModal.js'),'utf8'),{filename:'detail.js',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
  harness=hooks();const detailModule={exports:{}};let libraryReply=async()=>{throw Error('Library offline');},purchases=0;
  let customerSession={token:'A',user:{_id:'aaaaaaaaaaaaaaaaaaaaaaaa',username:'A'},checking:false,unavailable:false};
  const detailJsx=(type,props)=>({type,props:typeof props?.children==='function'?{...props,children:props.children(()=>{})}:props});
  vm.runInNewContext(detailCode.code,{module:detailModule,exports:detailModule.exports,window,localStorage,require(name){
    if(name.includes('/lib/records'))return records;if(name.includes('/lib/admin-save'))return adminSave;
    if(name==='react')return harness.react;
    if(name==='react/jsx-runtime')return{jsx:detailJsx,jsxs:detailJsx,Fragment:'fragment'};
    if(name==='lucide-react')return{Check:'check',X:'x',ArrowUpRight:'arrow',ShoppingCart:'cart'};
    if(name.includes('book-detail-art'))return{bookDetailArt:artModule.exports};
    if(name.includes('cover-accent'))return{imageHue:image=>image.hue};
    if(name.includes('use-session'))return{useSession:()=>customerSession};
    if(name.includes('/lib/api'))return{apiRequest:()=>libraryReply()};
    if(name.includes('checkout'))return{checkout:async()=>purchases++};
    return name;
  }});
  let themeColor;
  harness.mount(()=>detailModule.exports.default({book,themeColor,onClose(){}}));let detailTree=await harness.settle();
  const themeValue=()=>locate(detailTree,node=>node.props?.className==='book-detail text-white relative').props.style['--book-theme-color'];
  assert.equal(themeValue(),'#c9c3b8');
  book.imageUrl='/covers/any-new-book.jpg';harness.rerender();detailTree=await harness.settle();
  locate(detailTree,node=>node.props?.className==='detail-cover').props.children.props.onImageLoad({hue:280});
  detailTree=await harness.settle();assert.equal(themeValue(),'hsl(280 45% 65%)');
  themeColor='#ff0033';harness.rerender();detailTree=await harness.settle();assert.equal(themeValue(),themeColor);
  themeColor='url(invalid)';harness.rerender();detailTree=await harness.settle();assert.equal(themeValue(),'hsl(280 45% 65%)');
  themeColor=undefined;book.imageUrl='/covers/changed.jpg';harness.rerender();detailTree=await harness.settle();assert.equal(themeValue(),'#c9c3b8');
  locate(detailTree,node=>node.props?.className==='detail-cover').props.children.props.onImageError();
  detailTree=await harness.settle();assert.equal(themeValue(),'#c9c3b8');
  book.format='Hardcover';book.pages=320;book.publisher='Synthetic Press';harness.rerender();detailTree=await harness.settle();
  const specs=locate(detailTree,node=>node.props?.className==='detail-specs');assert.equal(specs.props.children.length,3);
  assert.equal(specs.props.children[1].props.children[1].props.children,320);
  delete book.pages;harness.rerender();detailTree=await harness.settle();
  assert.equal(locate(detailTree,node=>node.props?.className==='detail-specs').props.children[1].props.children[1].props.children,'Not specified');
  for(const [cover,art] of Object.entries(artModule.exports)) {
    book.imageUrl=cover;harness.rerender();detailTree=await harness.settle();
    assert(locate(detailTree,node=>node.props?.['data-art']===art.id));
    const scenery=locate(detailTree,node=>node.props?.className==='detail-cover-scenery');assert.equal(scenery.props['aria-hidden'],'true');
    scenery.props.children[1].props.onError();detailTree=await harness.settle();
    assert(!locate(detailTree,node=>node.props?.className==='detail-cover-scenery'));
  }
  book.imageUrl='/covers/new-book.jpg';harness.rerender();detailTree=await harness.settle();
  for(const hook of ['Where fairy tales turn dangerous.','Two words','Solo','A very long opening phrase with enough words to wrap naturally into several readable lines.']) {
    book.hook=hook;harness.rerender();detailTree=await harness.settle();
    const closing=locate(detailTree,node=>node.props?.className==='detail-hook');
    const watermark=locate(detailTree,node=>node.props?.className==='detail-watermark');assert.equal(watermark.props['aria-hidden'],'true');
    assert.equal(watermark.props.children[1].length,5);
    assert.equal(closing.props.children[0].props.className,'sr-only');
    assert.equal(closing.props.children[0].props.children,hook);
    assert.equal(closing.props.children[1].props['aria-hidden'],'true');
    assert.equal(locate(closing,node=>node.props?.className==='detail-hook-turn').props.children,hook.split(/\s+/).slice(-2).join(' '));
  }
  delete book.hook;harness.rerender();detailTree=await harness.settle();
  assert(!locate(detailTree,node=>node.props?.className==='detail-closing'),'no empty hook slot');
  let purchase=locate(detailTree,node=>node.type==='button'&&node.props.className==='detail-buy');
  assert.equal(purchase.props.disabled,true);await purchase.props.onClick();assert.equal(purchases,0);
  libraryReply=async()=>({books:[book]});locate(detailTree,node=>node.props?.children==='Retry library check').props.onClick();detailTree=await harness.settle();assert(JSON.stringify(detailTree).includes('In your purchased library'));
  let staleResolve;libraryReply=()=>new Promise(resolve=>staleResolve=resolve);customerSession={...customerSession,token:'B',user:{_id:'bbbbbbbbbbbbbbbbbbbbbbbb',username:'B'}};harness.rerender();await harness.settle();
  libraryReply=async()=>({books:[]});customerSession={...customerSession,token:'C',user:{username:'C'}};harness.rerender();detailTree=await harness.settle();
  staleResolve({books:[book]});detailTree=await harness.settle();assert(!JSON.stringify(detailTree).includes('In your purchased library'));
  purchase=locate(detailTree,node=>node.type==='button'&&node.props.className==='detail-buy');assert.equal(purchase.props.disabled,false);harness.dispose();
  // Real cart hook rejects late results after account switches and logout.
  const cartHookCode=await frontendRequire('next/dist/build/swc').transform(fs.readFileSync(path.join(root,'frontend/lib/use-cart.js'),'utf8'),{filename:'use-cart.js',jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}});
  harness=hooks();const cartHookModule={exports:{}};const cartReplies=[];
  customerSession={token:'A',user:{_id:'account-a'},checking:false,unavailable:false};storage.set('token','A');
  vm.runInNewContext(cartHookCode.code,{module:cartHookModule,exports:cartHookModule.exports,window,localStorage,require(name){if(name==='react')return harness.react;if(name==='./api')return{apiRequest:()=>new Promise(resolve=>cartReplies.push(resolve)),signalCart(){}};throw Error(name);}});
  harness.mount(()=>cartHookModule.exports.useCart(customerSession));await harness.settle();
  customerSession={...customerSession,token:'B',user:{_id:'account-b'}};storage.set('token','B');harness.rerender();await harness.settle();
  cartReplies[0]({items:[book]});assert.equal((await harness.settle()).items.length,0);
  cartReplies[1]({items:[{...book,title:'Account B cart'}],omitted:1});assert.equal((await harness.settle()).items[0].title,'Account B cart');
  changed('eread-cart-change:account-a');await harness.settle();assert.equal(cartReplies.length,2);
  changed('eread-cart-change:account-b');await harness.settle();assert.equal(cartReplies.length,3);
  customerSession={token:null,user:null,checking:false};harness.rerender();assert.equal((await harness.settle()).items.length,0);
  cartReplies[2]({items:[book]});assert.equal((await harness.settle()).items.length,0);harness.dispose();
  // Checkout fetches the latest account cart, never the rendered snapshot.
  const cartCode=await frontendRequire('next/dist/build/swc').transform(fs.readFileSync(path.join(root,'frontend/components/CartModal.js'),'utf8'),{filename:'cart.js',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
  for(const scenario of ['guest','owned','changed','failure','switch','closed','success']) {
    harness=hooks();const instance={exports:{}};let cart=[book],checkouts=0;
    customerSession={token:scenario==='guest'?null:'A',user:scenario==='guest'?null:{username:'A'},checking:false,unavailable:false};storage.set('token','A');
    vm.runInNewContext(cartCode.code,{module:instance,exports:instance.exports,window,localStorage,require(name){
      if(name.includes('/lib/records'))return records;if(name.includes('/lib/admin-save'))return adminSave;
    if(name==='react')return harness.react;
      if(name==='react/jsx-runtime')return{jsx:detailJsx,jsxs:detailJsx,Fragment:'fragment'};
      if(name==='lucide-react')return{X:'x'};
      if(name.includes('use-session'))return{useSession:()=>customerSession};
      if(name.includes('use-cart'))return{useCart:()=>({items:[book],changed(){},refresh(){},loading:false})};
      if(name.includes('/lib/api'))return{apiRequest:async()=>{if(scenario==='failure')throw Error('Cart offline');if(scenario==='switch'){storage.set('token','B');throw Error('Account changed');}return{items:scenario==='owned'?[]:cart};}};
      if(name.includes('checkout'))return{checkout:async()=>checkouts++};
      return name;
    }});
    harness.mount(()=>instance.exports.default({onClose(){}}));let cartTree=await harness.settle();
    if(scenario==='changed')cart=[book,{...book,_id:'bbbbbbbbbbbbbbbbbbbbbbbb'}];
    const payButton=locate(cartTree,node=>node.type==='button'&&['Sandbox checkout','Log in to view your cart'].includes(node.props.children));
    const paying=payButton.props.onClick();if(scenario==='closed')harness.dispose();await paying;cartTree=await harness.settle();assert.equal(checkouts,scenario==='success'?1:0,scenario);
    if(scenario==='guest')assert(locate(cartTree,node=>String(node.type).includes('LoginModal')));
    if(scenario==='owned')assert.equal(checkouts,0);
    if(scenario==='changed')assert.equal(cart.length,2);
    if(scenario==='switch'||scenario==='failure')assert.equal(cart.length,1);
    harness.dispose();
  }
  // The actual profile must ignore the previous account's delayed books/history.
  const profileCode = await frontendRequire('next/dist/build/swc').transform(fs.readFileSync(path.join(root, 'frontend/app/profile/page.js'), 'utf8'), { filename: 'profile.js', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' } });
  harness = hooks(); const profileModule = { exports: {} }; const pending = [];
  let profileSession = { token: 'A', user: { username: 'Account A', email: 'a@example.com' }, checking: false };
  const jsx = (type, props) => ({ type, props: typeof props?.children === 'function' ? { ...props, children:props.children(props.onClose) } : props });
  let anchorScrolls=0;
  vm.runInNewContext(profileCode.code, { module: profileModule, exports: profileModule.exports, localStorage, window:{location:{hash:'#purchased-books'}}, document:{getElementById(id){assert.equal(id,'purchased-books');return{scrollIntoView(){anchorScrolls++;}};}}, require(name) {
    if(name.includes('/lib/records'))return records;if(name.includes('/lib/admin-save'))return adminSave;
    if (name === 'react') return harness.react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
    if (name === 'next/link' || name.includes('Modal') || name.includes('BookCover') || name.includes('Reveal') || name.includes('BookSkeleton') || name.includes('SessionNotice')) return name;
    if (name.includes('use-session')) return { useSession: () => profileSession };
    if (name.includes('/lib/api')) return { clearSession: apiModule.exports.clearSession, apiRequest: route => route.includes('change-password') ? Promise.resolve({ message: 'Password changed' }) : new Promise(resolve => pending.push({ route, resolve })) };
    throw Error(name);
  } });
  harness.mount(profileModule.exports.default); await harness.settle();assert.equal(anchorScrolls,1,'profile anchors scroll after account sections appear');
  profileSession = { token: 'B', user: { username: 'Account B', email: 'b@example.com' }, checking: false };
  harness.rerender(); await harness.settle();
  for (const request of pending.slice(2)) request.resolve(request.route.endsWith('books') ? { books: [] } : { transactions: [] });
  let tree = await harness.settle(); assert(JSON.stringify(tree).includes('Account B'));
  for (const request of pending.slice(0, 2)) request.resolve(request.route.endsWith('books') ? { books: [{ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', title: 'Private A book' }] } : { transactions: [] });
  tree = await harness.settle(); assert(!JSON.stringify(tree).includes('Private A book')); assert(!JSON.stringify(tree).includes('Account A'));
  function find(node, predicate) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { for (const child of node) { const result = find(child, predicate); if (result) return result; } } else { if (predicate(node)) return node; return find(node.props?.children, predicate); } }
  find(tree, node => node.type === 'button' && node.props.children === 'Change password').props.onClick();
  tree = await harness.settle();
  storage.set('token', 'B'); storage.set('admin_token', 'unrelated-admin');
  await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert(!storage.has('token')); assert.equal(storage.get('admin_token'), 'unrelated-admin');
  profileSession = { token: null, user: null, checking: false }; harness.rerender();
  tree = await harness.settle(); assert(!JSON.stringify(tree).includes('Account B'));
  assert(JSON.stringify(tree).includes('Password changed'));
  harness.dispose();
  // Each profile section settles and retries without waiting for or reloading its sibling.
  for (const scenario of ['books','transactions','slow-books','slow-transactions','invalid-books','invalid-transactions']) {
    harness=hooks();const instance={exports:{}};const counts={books:0,transactions:0};let recover=false,resolveSlow;
    const failed=scenario.includes('transactions')?'transactions':'books';
    const customer={token:'section-test',user:{username:'Independent account',email:'synthetic@example.com'},checking:false,unavailable:false};
    vm.runInNewContext(profileCode.code,{module:instance,exports:instance.exports,localStorage,window:{location:{hash:''}},require(name){
      if(name.includes('/lib/records'))return records;if(name.includes('/lib/admin-save'))return adminSave;
    if(name==='react')return harness.react;
      if(name==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'fragment'};
      if(name.includes('use-session'))return{useSession:()=>customer};
      if(name.includes('/lib/api'))return{apiRequest:async route=>{
        const resource=route.endsWith('/books')?'books':'transactions';counts[resource]++;
        if(resource===failed&&!recover){
          if(scenario.startsWith('slow-'))return new Promise(resolve=>resolveSlow=resolve);
          if(scenario.startsWith('invalid-'))return{};
          throw Error('Synthetic '+resource+' outage');
        }
        return resource==='books'?{books:[{_id:'aaaaaaaaaaaaaaaaaaaaaaaa',title:'Independent title'}]}:{transactions:[{id:'bbbbbbbbbbbbbbbbbbbbbbbb',title:'Independent order',date:'2026-11-13',amount:1000,status:'pending'}]};
      }};
      return name;
    }});
    harness.mount(instance.exports.default);let sectionTree=await harness.settle();let text=JSON.stringify(sectionTree);
    assert(text.includes('Independent account'));assert(find(sectionTree,node=>node.props?.children==='Change password'));
    assert(text.includes(failed==='books'?'Independent order':'Independent title'),scenario);
    assert(!text.includes(failed==='books'?'No purchased books yet.':'No transactions yet.'),scenario);
    if(scenario.startsWith('slow-')){
      assert(text.includes(failed==='books'?'BookSkeleton':'Loading transaction history...'));
      resolveSlow(failed==='books'?{books:[]}:{transactions:[]});sectionTree=await harness.settle();
    }else{
      const retry=find(sectionTree,node=>node.type==='button'&&node.props.children===(failed==='books'?'Retry library':'Retry history'));assert(retry,scenario);
      recover=true;retry.props.onClick();sectionTree=await harness.settle();
      assert.equal(counts[failed],2);assert.equal(counts[failed==='books'?'transactions':'books'],1);
      text=JSON.stringify(sectionTree);assert(text.includes('Independent title'));assert(text.includes('Independent order'));assert(!find(sectionTree,node=>node.props?.children==='Retry library'));assert(!find(sectionTree,node=>node.props?.children==='Retry history'));
    }
    harness.dispose();
  }
  for (const scenario of ['validation','network','conflict','account-switch']) {
    storage.set('token','B'); storage.set('admin_token','unrelated-admin');
    harness = hooks(); const instance = {exports:{}}; let rejectChange, submissions=0;
    const userSession={token:'B',user:{username:'Account B',email:'b@example.com'},checking:false};
    vm.runInNewContext(profileCode.code,{module:instance,exports:instance.exports,localStorage,window:{location:{hash:''}},require(name){
      if(name.includes('/lib/records'))return records;if(name.includes('/lib/admin-save'))return adminSave;
    if(name==='react')return harness.react;
      if(name==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'fragment'};
      if(name==='next/link'||name.includes('Modal')||name.includes('BookCover')||name.includes('Reveal')||name.includes('BookSkeleton') || name.includes('SessionNotice'))return name;
      if(name.includes('use-session'))return{useSession:()=>userSession};
      if(name.includes('/lib/api'))return{clearSession:apiModule.exports.clearSession,apiRequest:route=>{
        if(route.includes('change-password')){submissions++;return new Promise((resolve,reject)=>{rejectChange=reject;});}
        return Promise.resolve(route.endsWith('/books')?{books:[]}:{transactions:[]});
      }};
      throw Error(name);
    }});
    harness.mount(instance.exports.default);tree=await harness.settle();
    find(tree,node=>node.type==='button'&&node.props.children==='Change password').props.onClick();tree=await harness.settle();
    find(tree,node=>node.type==='input'&&node.props.autoComplete==='current-password').props.onChange({target:{value:'synthetic-current'}});
    find(tree,node=>node.type==='input'&&node.props.autoComplete==='new-password').props.onChange({target:{value:'synthetic-next'}});
    tree=await harness.settle();const form=find(tree,node=>node.type==='form');
    const submitting=form.props.onSubmit({preventDefault(){}});
    await form.props.onSubmit({preventDefault(){}});assert.equal(submissions,1);
    tree=await harness.settle();
    assert.equal(find(tree,node=>node.type==='fieldset').props.disabled,true);
    assert.equal(find(tree,node=>typeof node.type==='string'&&node.type.endsWith('/Modal')).props.canClose(),false);
    if(scenario==='account-switch')storage.set('token','C');
    rejectChange(scenario==='validation'?Object.assign(Error('Incorrect current password'),{status:400}):scenario==='conflict'?Object.assign(Error('Changed by another request. Please sign in again.'),{status:409}):Error('Connection unavailable'));
    await submitting;tree=await harness.settle();
    assert.equal(storage.get('admin_token'),'unrelated-admin');
    if(scenario==='conflict'){
      assert(!storage.has('token'));assert(!find(tree,node=>node.type==='form'));assert(JSON.stringify(tree).includes('Please sign in again'));
    }else{
      assert.equal(storage.get('token'),scenario==='account-switch'?'C':'B');
      assert.equal(find(tree,node=>node.type==='fieldset').props.disabled,false);
      assert.equal(find(tree,node=>typeof node.type==='string'&&node.type.endsWith('/Modal')).props.canClose(),true);
      assert.equal(find(tree,node=>node.type==='input'&&node.props.autoComplete==='new-password').props.value,'synthetic-next');
      assert.equal(JSON.stringify(tree).includes('could not be confirmed'),scenario==='network');
      if(scenario==='validation')assert(JSON.stringify(tree).includes('Incorrect current password'));
    }
    harness.dispose();
  }
  console.log('Passed: server-verified login, account-switch races, cross-tab logout, focus refresh, expiry, admin roles, listener/timer cleanup, duplicate password submissions, guarded dismissal, conflict logout, uncertain-response recovery, offline identity retention/retry/expiry, and preserving open admin editors.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
