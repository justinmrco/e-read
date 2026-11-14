const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname,'..');
const frontendRequire = createRequire(path.join(root,'frontend/package.json'));
async function load(file, globals = {}) {
  const module = { exports:{} };
  const { code } = await frontendRequire('next/dist/build/swc').transform(fs.readFileSync(path.join(root,'frontend',file),'utf8'), { filename:file, jsc:{ parser:{ syntax:'ecmascript',jsx:true }, transform:{ react:{ runtime:'automatic' } } }, module:{ type:'commonjs' } });
  vm.runInNewContext(code,{ module,exports:module.exports, ...globals });
  return module.exports;
}
(async () => {
  const media = new EventTarget(); media.matches = false;
  const window = new EventTarget(); window.matchMedia = () => media;
  const {records}=require('./frontend-modules.cjs')({window});
  let closes = 0, allowed = true, animation, cancelled = 0;
  const dialog = { animate() { animation = { cancel() { cancelled++; }, onfinish:null }; return animation; } };
  const { dialogMotion } = await load('lib/dialog-motion.js',{ window });
  let lifecycle = dialogMotion(dialog,()=>closes++,()=>allowed);
  allowed=false; lifecycle.requestClose(); assert.equal(animation,undefined);
  allowed=true; lifecycle.requestClose(); const first=animation;
  lifecycle.requestClose(); assert.equal(animation,first); assert.equal(closes,0);
  allowed=false; animation.onfinish(); assert.equal(closes,0); assert.equal(cancelled,1);
  allowed=true; lifecycle.requestClose(); animation.onfinish(); assert.equal(closes,1);
  lifecycle.requestClose(); const late=animation.onfinish; lifecycle.dispose(); late(); assert.equal(closes,1);
  lifecycle=dialogMotion(dialog,()=>closes++);
  lifecycle.requestClose(); media.matches=true; media.dispatchEvent(new Event('change')); assert.equal(closes,1); animation.onfinish(); assert.equal(closes,2);
  lifecycle.dispose();
  lifecycle=dialogMotion(dialog,()=>closes++); lifecycle.requestClose(); assert.equal(closes,2); animation.onfinish(); assert.equal(closes,3); lifecycle.dispose();
  media.matches=false; lifecycle=dialogMotion({},()=>closes++); lifecycle.requestClose(); assert.equal(closes,4); lifecycle.dispose();
  lifecycle=dialogMotion({animate(){throw Error('Animation unavailable');}},()=>closes++);lifecycle.requestClose();assert.equal(closes,5);lifecycle.dispose();
  lifecycle=dialogMotion(dialog,()=>closes++);lifecycle.requestClose();const interrupted=animation.oncancel;interrupted();interrupted();assert.equal(closes,6);lifecycle.dispose();
  lifecycle=dialogMotion(dialog,()=>closes++);lifecycle.requestClose();const cancelledAfterCleanup=animation.oncancel;lifecycle.dispose();cancelledAfterCleanup();assert.equal(closes,6);
  let events=0; const signals=new Map();
  window.addEventListener('cart-change',()=>events++);
  const localStorage={getItem:key=>signals.get(key),setItem:(key,value)=>signals.set(key,value)};
  const api=await load('lib/api.js',{window,localStorage,Event,process:{env:{}}});
  api.signalCart('account-a'); assert.equal(events,1); assert(signals.has('eread-cart-change:account-a')); assert(!signals.has('cart'));
  const book={_id:'000000000000000000000001',title:'Synthetic',price:15000};
  const jsx=(type,props)=>({type,props:typeof props?.children==='function'?{...props,children:props.children(props.onClose)}:props});
  const find=(node,predicate)=>!node||typeof node!=='object'?undefined:Array.isArray(node)?node.map(child=>find(child,predicate)).find(Boolean):predicate(node)?node:find(node.props?.children,predicate);
  const document={activeElement:null};
  function trigger(){return{isConnected:true,closest:()=>false,focus(){document.activeElement=this;}};}
  async function mountModal(opener) {
    document.activeElement=opener;
    const state=[],pending=[];let cursor=0,tree;
    const native={focus(options){assert.equal(options.preventScroll,true);document.activeElement=native;},showModal(){document.activeElement=native;},close(){},animate:dialog.animate};
    const hooks={useRef(value){const i=cursor++;return(state[i]??={current:value});},useState(value){const i=cursor++;if(!(i in state))state[i]=value;return[state[i],value=>{state[i]=value;}];},useEffect(fn,deps){const i=cursor++;const previous=state[i];if(!previous||deps.some((value,index)=>value!==previous.deps[index])){pending.push(()=>{previous?.cleanup?.();state[i]={deps,cleanup:fn()};});}}};
    const jsx=(type,props)=>{if(type==='dialog')props.ref.current=native;return{type,props};};
    const component=await load('components/Modal.js',{window,document,require(name){if(name.includes('/lib/records'))return records;if(name==='react')return hooks;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='react-dom')return{createPortal:node=>node};if(name.includes('dialog-motion'))return{dialogMotion};throw Error(name);}});
    const props={title:'Synthetic dialog',onClose(){},children:close=>({type:'button',props:{onClick:close}})};
    for(let i=0;i<2;i++){cursor=0;tree=component.default(props);while(pending.length)pending.shift()();}
    return{tree,native,dispose(){state.forEach(value=>value?.cleanup?.());}};
  }
  const opener=trigger();const parent=await mountModal(opener);assert.equal(document.activeElement,parent.native);
  assert.equal(parent.tree.props.tabIndex,-1);assert.equal(parent.tree.props.autoFocus,true);
  const innerTrigger=trigger();const child=await mountModal(innerTrigger);assert.equal(document.activeElement,child.native);
  child.dispose();assert.equal(document.activeElement,innerTrigger);
  parent.dispose();assert.equal(document.activeElement,opener);
  const shelf=new EventTarget();Object.assign(shelf,{scrollLeft:0,clientWidth:400});
  let now=0,raf,hover=false,width=1000,loopChange,intersection,resize,observerDisposals=0;
  const focusedCard={matches:()=>true};
  const shelfDocument=new EventTarget();shelfDocument.activeElement=null;shelfDocument.hidden=false;
  const shelfSection=new EventTarget();shelfSection.contains=target=>target===focusedCard;shelfSection.matches=()=>hover;
  const original={contains:target=>target===focusedCard,getBoundingClientRect:()=>({width})};
  const {shelfMotion}=await load('lib/shelf-motion.js',{setTimeout,clearTimeout,window,document:shelfDocument,performance:{now:()=>now},getComputedStyle:()=>({columnGap:'16px',paddingLeft:'12px',paddingRight:'12px'}),requestAnimationFrame:fn=>{raf=fn;return 1;},cancelAnimationFrame:()=>{raf=null;},ResizeObserver:class{constructor(fn){resize=fn;}observe(){}disconnect(){observerDisposals++;}},IntersectionObserver:class{constructor(fn){intersection=fn;}observe(){}disconnect(){observerDisposals++;}}});
  const controller=shelfMotion(shelfSection,shelf,original,true,value=>{loopChange=value;});
  function advance(ms){const end=now+ms;while(now<end){now=Math.min(end,now+20);raf(now);}}
  raf(now);advance(1000);assert.equal(shelf.scrollLeft,1046,'30px per second');
  shelf.scrollLeft=2034;shelf.dispatchEvent(new Event('scroll'));assert.equal(shelf.scrollLeft,1018,'forward seam');
  shelf.scrollLeft=1010;shelf.dispatchEvent(new Event('scroll'));assert.equal(shelf.scrollLeft,2026,'backward seam');shelf.scrollLeft=1100;
  hover=true;shelfSection.dispatchEvent(new Event('pointerenter'));let stopped=shelf.scrollLeft;advance(1000);assert.equal(shelf.scrollLeft,stopped+30,'hover alone must not pause');
  hover=false;shelfSection.dispatchEvent(new Event('pointerleave'));stopped=shelf.scrollLeft;advance(1000);assert.equal(shelf.scrollLeft,stopped+30,'leaving hover must not delay autoplay');
  shelfDocument.activeElement=focusedCard;shelfSection.dispatchEvent(new Event('focusin'));stopped=shelf.scrollLeft;advance(1000);assert.equal(shelf.scrollLeft,stopped+30,'keyboard focus does not stop autoplay');
  shelfDocument.activeElement=null;
  for(const name of ['wheel','keydown','pointerdown','pointerup','click']){
    if(name==='wheel')shelf.dispatchEvent(Object.assign(new Event('wheel',{cancelable:true}),{deltaX:35,deltaY:0}));else shelfSection.dispatchEvent(new Event(name));
    stopped=shelf.scrollLeft;advance(1000);assert(Math.abs(shelf.scrollLeft-stopped-(name==='wheel'?65:30))<=1,name+' does not pause or delay autoplay');
  }
  intersection([{isIntersecting:false}]);stopped=shelf.scrollLeft;advance(6000);assert.equal(shelf.scrollLeft,stopped);intersection([{isIntersecting:true}]);advance(1000);assert(shelf.scrollLeft>stopped);
  shelfDocument.hidden=true;shelfDocument.dispatchEvent(new Event('visibilitychange'));stopped=shelf.scrollLeft;advance(6000);assert.equal(shelf.scrollLeft,stopped);shelfDocument.hidden=false;shelfDocument.dispatchEvent(new Event('visibilitychange'));advance(1000);assert(shelf.scrollLeft-stopped<=30);
  shelf.scrollLeft=2100;shelf.dispatchEvent(new Event('scroll'));assert.equal(shelf.scrollLeft,1084,'manual scroll wraps immediately while autoplay remains active');shelf.dispatchEvent(new Event('scrollend'));assert.equal(shelf.scrollLeft,1084);
  shelfDocument.activeElement=focusedCard;
  function wheel(deltaX,deltaY,deltaMode=0,ctrlKey=false){const event=Object.assign(new Event('wheel',{cancelable:true}),{deltaX,deltaY,deltaMode,ctrlKey});shelf.dispatchEvent(event);return event;}
  for(const delta of [120,-120,8000,-8000]){
    for(let i=0;i<40;i++){
      const before=shelf.scrollLeft,expected=1016+((before+delta+36-1016)%1016+1016)%1016;
      assert.equal(wheel(delta,0).defaultPrevented,true);assert.equal(shelf.scrollLeft,before,'wheel input does not jump immediately');
      advance(1200);assert(Math.min(Math.abs(shelf.scrollLeft-expected),1016-Math.abs(shelf.scrollLeft-expected))<=1,'eased wheel loops repeatedly in both directions, including large gestures');
    }
  }
  let before=shelf.scrollLeft;wheel(0,6,1);advance(1200);assert(Math.abs(shelf.scrollLeft-(1016+((before+96+36-1016)%1016+1016)%1016))<=1,'vertical mouse wheel and line units');
  before=shelf.scrollLeft;wheel(0,-2,2);advance(1200);assert(Math.abs(shelf.scrollLeft-(1016+((before-800+36-1016)%1016+1016)%1016))<=1,'page wheel units');
  before=shelf.scrollLeft;assert.equal(wheel(0,120,0,true).defaultPrevented,false);assert.equal(shelf.scrollLeft,before,'Ctrl+wheel retains browser zoom');
  shelf.scrollLeft=1400;wheel(120,0);advance(20);assert(shelf.scrollLeft>1400 && shelf.scrollLeft<1430,'first frame glides instead of jumping');
  advance(80);before=shelf.scrollLeft;wheel(-120,0);advance(20);assert(shelf.scrollLeft<before,'opposite wheel input reverses promptly');
  shelf.dispatchEvent(new Event('pointerdown'));before=shelf.scrollLeft;advance(1000);assert(Math.abs(shelf.scrollLeft-before-30)<=1,'native touch takeover clears pending wheel momentum');
  wheel(120,0);intersection([{isIntersecting:false}]);advance(1000);intersection([{isIntersecting:true}]);before=shelf.scrollLeft;advance(1000);assert(Math.abs(shelf.scrollLeft-before-30)<=1,'offscreen momentum does not replay');
  shelfDocument.activeElement=null;
  width=200;resize();assert.equal(loopChange,false,'no looping when books fit');controller.dispose();assert.equal(raf,null);assert.equal(observerDisposals,2);
  shelf.scrollLeft=0;shelf.dispatchEvent(new Event('scroll'));assert.equal(shelf.scrollLeft,0,'scroll listener removed');
  let stateCursor=0;const sectionRefs=[];
  const shelfHooks={useRef:()=>{const ref={current:null};sectionRefs.push(ref);return ref;},useState:()=>[stateCursor++===0,()=>{}],useEffect(){}};
  const section=await load('components/BookSection.js',{require(name){if(name==='react')return shelfHooks;if(name.includes('shelf-motion'))return{shelfMotion};if(name==='react/jsx-runtime')return{jsx:(type,props,key)=>({type,props,key}),jsxs:(type,props,key)=>({type,props,key})};return name;}});
  const other={...book,_id:'000000000000000000000002'};
  const grid=section.default({books:[other],title:'Search results',onBookClick(){}});
  assert.equal(grid.props.children[1].props.children.length,1);assert.equal(grid.props.children[1].props.children[0].key,other._id);
  stateCursor=0;sectionRefs.length=0;let clicked;
  const rail=section.default({books:[book,other],title:'Featured books',layout:'scroll',onBookClick:value=>{clicked=value;}});
  assert.equal(rail.props.children[1].props.role,'region');assert.equal(rail.props.children[1].props.tabIndex,0);
  const sets=rail.props.children[1].props.children.props.children;
  assert.equal(sets.length,3);assert.equal(sets[0].props['aria-hidden'],'true');assert.equal(sets[2].props['aria-hidden'],'true');assert.equal(sets[1].props['aria-hidden'],undefined);
  assert.equal(sets[0].props.children[0].props.duplicate,true);assert.equal(sets[1].props.children[0].props.duplicate,false);
  let restored=false;sectionRefs[1].current={scrollLeft:20};sectionRefs[2].current={offsetLeft:1016,children:[{focus(options){restored=options.preventScroll;}}]};
  sets[0].props.children[0].props.onClick({currentTarget:{parentElement:{offsetLeft:0}}});assert.equal(clicked,book);assert.equal(restored,true);assert.equal(sectionRefs[1].current.scrollLeft,1036);
  assert(!find(rail,node=>node.type==='button'),'no shelf control buttons');
  assert(find(rail,node=>node.props?.className==='shelf-hint'),'desktop scrolling hint');
  assert(!find(grid,node=>node.props?.className==='shelf-hint'),'no hint on static grid');
  let collectionGenre='';
  const collection=await load('components/BookCollection.js',{require(name){if(name==='react')return{useState:()=>[collectionGenre,next=>{collectionGenre=next;}]};if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};return name;}});
  const fable={...book,title:'Fable for the End of the World',author:'Ava Reid',genre:'Sci-Fi',imageUrl:'/covers/fableworld.jpg'},romance={...other,author:'Demo Author',genre:'Romance'};let openedCollectionBook;const openBook=value=>{openedCollectionBook=value;};
  assert.equal(collection.default({books:[],onBookClick:openBook}),null);
  let collectionTree=collection.default({books:[fable,romance],onBookClick:openBook});
  const filters=find(collectionTree,node=>node.props?.role==='group').props.children;
  assert.equal(filters.length,3,'only populated genres plus All books');assert.equal(filters[0].props['aria-pressed'],true);
  filters[2].props.onClick();collectionTree=collection.default({books:[fable,romance],onBookClick:openBook});
  let collectionShelf=find(collectionTree,node=>node.props?.className==='catalog-grid collection-grid');assert.equal(collectionShelf.props.children.length,1);let collectionCard=collectionShelf.props.children[0];collectionCard.props.onClick();assert.equal(openedCollectionBook,romance);assert(String(collectionCard.type).includes('CollectionCard'));assert.equal(collectionCard.props.book,romance);
  collectionTree=collection.default({books:[fable],onBookClick:openBook});collectionShelf=find(collectionTree,node=>node.props?.className==='catalog-grid collection-grid');collectionCard=collectionShelf.props.children[0];assert.equal(collectionCard.props.book,fable,'removed genre falls back to all books');assert(!find(collectionTree,node=>String(node.type).includes('BookSection')),'collection does not use decorated shelf cards');
  const styles=fs.readFileSync(path.join(root,'frontend/app/globals.css'),'utf8');
  assert(styles.includes('object-fit:contain'));assert(styles.includes('.book-detail-title { font-family:var(--font-display)'));
  for(const genre of ['Fantasy','Romance','Historical','Mystery','Thriller','Action','Sci-Fi'])assert(styles.includes('[data-genre="'+genre+'"]'));
  const loginSlots=[],loginEffects=[];let loginCursor=0,resolveLogin,savedSessions=0,loginRequests=0;
  const loginReact={useState(value){const i=loginCursor++;if(!(i in loginSlots))loginSlots[i]=value;return[loginSlots[i],value=>{loginSlots[i]=value;}];},useRef(value){const i=loginCursor++;return loginSlots[i]??={current:value};},useEffect(fn){loginEffects.push(fn);}};
  const loginComponent=await load('components/LoginModal.js',{window,localStorage:{getItem:()=>null},require(name){if(name.includes('/lib/records'))return records;if(name==='react')return loginReact;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='next/navigation')return{useRouter:()=>({push(){}})};if(name==='lucide-react')return{X:'icon'};if(name==='./Modal')return'modal';if(name.includes('/lib/api'))return{apiRequest:()=>{loginRequests++;return new Promise(resolve=>{resolveLogin=resolve;});},saveSession(){savedSessions++;}};throw Error(name);}});
  const loginTree=loginComponent.default({onClose(){},onLoginSuccess(){}});const loginCleanups=loginEffects.map(fn=>fn());
  const pendingLogin=find(loginTree,node=>node.type==='form').props.onSubmit({preventDefault(){}});
  const loginExit=dialogMotion(dialog,()=>{},()=>true,loginTree.props.onClosing);loginExit.requestClose();
  resolveLogin({token:'synthetic',role:'user'});await pendingLogin;assert.equal(savedSessions,0);loginExit.dispose();loginCleanups.forEach(fn=>fn?.());
  for(const scenario of ['auth-change','token','admin_token','clear','cart','unmount']){
    loginSlots.length=0;loginEffects.length=0;loginCursor=0;savedSessions=0;loginRequests=0;
    const tree=loginComponent.default({onClose(){}});const cleanup=loginEffects.map(fn=>fn());const submit=find(tree,node=>node.type==='form').props.onSubmit;
    const pending=submit({preventDefault(){}});await submit({preventDefault(){}});assert.equal(loginRequests,1);
    if(scenario==='auth-change')window.dispatchEvent(new Event('auth-change'));
    else if(scenario==='unmount')cleanup.forEach(fn=>fn?.());
    else window.dispatchEvent(Object.assign(new Event('storage'),{key:scenario==='clear'?null:scenario}));
    resolveLogin({token:'late',role:'user'});await pending;assert.equal(savedSessions,scenario==='cart'?1:0,scenario);
    if(scenario!=='unmount')cleanup.forEach(fn=>fn?.());
  }
  console.log('Passed: guarded/duplicate/interrupted dialog exits, full motion with reduced OS motion, animation fallback, account-scoped cart signals, nested-dialog focus restoration, initial dialog focus, loop speed/seams, smooth wheel/trackpad glide, prompt reversal, momentum cleanup, unlimited manual scrolling in both directions, hover without pausing, uninterrupted keyboard/pointer/wheel autoplay, no playback control, visibility, resize, repeated-card focus restoration, rail keyboard access and stable filtered keys, and ignoring login responses during dismissal.');
})().catch(error=>{console.error(error);process.exitCode=1;});
