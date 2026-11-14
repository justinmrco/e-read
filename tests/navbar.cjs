// Run: node tests/navbar.cjs. Real navigation handlers, isolated from network/browser.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),requireFrontend=createRequire(path.join(root,'frontend/package.json'));
function find(node,test){if(!node||typeof node!=='object')return;if(Array.isArray(node)){for(const child of node){const result=find(child,test);if(result)return result;}}else return test(node)?node:find(node.props?.children,test);}
(async()=>{
 const {code}=await requireFrontend('next/dist/build/swc').transform(fs.readFileSync(path.join(root,'frontend/components/Navbar.js'),'utf8'),{filename:'Navbar.js',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
 const window=new EventTarget(),document=new EventTarget();window.scrollY=0;
 const slots=[],pending=[],cleanups=[];let cursor=0,login=0,logout=0,focus=0,toggleFocus=0,selected;
 const react={useState(initial){const i=cursor++;slots[i]??=initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((value,index)=>value!==slots[i][index])){slots[i]=deps;pending.push(fn);}}};
 const jsx=(type,props)=>({type,props}),module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,window,document,require(name){if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='lucide-react')return{Search:'search',X:'x',ChevronDown:'chevron',ShoppingBag:'bag'};if(name.includes('use-session'))return{useSession:()=>({user:{username:'Justin Marco'}})};if(name.includes('use-cart'))return{useCart:()=>({items:[{},{}]})};return name;}});
 const props={isLoggedIn:true,search:'',genre:'Fantasy',onSearch:(...args)=>selected=args,onLoginClick:()=>login++,onLogoutClick:()=>logout++};
 const details={open:true,contains:()=>false};
 function render(){cursor=0;const tree=module.exports.default(props);tree.props.ref.current={querySelectorAll:()=>[details]};find(tree,node=>node.props?.id==='catalog-search').props.ref.current={focus:()=>focus++};find(tree,node=>node.props?.className==='nav-icon nav-search-toggle').props.ref.current={focus:()=>toggleFocus++};for(const effect of pending.splice(0)){const cleanup=effect();if(cleanup)cleanups.push(cleanup);}return tree;}
 let tree=render();assert.equal(tree.props['data-scrolled'],false);
 assert.equal(find(tree,node=>node.props?.className==='profile-trigger').props.children,'JM');
 find(tree,node=>node.props?.id==='catalog-search').props.onChange({target:{value:'Hazel'}});assert.deepEqual(selected,['Hazel','Fantasy']);
 find(tree,node=>node.props?.className==='nav-icon nav-search-toggle').props.onClick();tree=render();assert.equal(find(tree,node=>node.props?.role==='search').props['data-expanded'],true);assert.equal(focus,1);
 find(tree,node=>node.props?.role==='search').props.onKeyDown({key:'Escape',preventDefault(){}});tree=render();assert.equal(find(tree,node=>node.props?.role==='search').props['data-expanded'],false);assert.equal(toggleFocus,1);
 let returned=0;const menu={open:true,querySelector:()=>({focus:()=>returned++})};
 const genre=find(tree,node=>node.type==='button'&&node.props.children==='Romance');genre.props.onClick({currentTarget:{closest:()=>menu}});assert.deepEqual(selected,['','Romance']);assert.equal(menu.open,false);assert.equal(returned,1);
 menu.open=true;find(tree,node=>node.props?.className==='nav-genres nav-dropdown').props.onKeyDown({key:'Escape',preventDefault(){},currentTarget:menu});assert.equal(menu.open,false);
 document.dispatchEvent(new Event('pointerdown'));assert.equal(details.open,false);
 window.scrollY=40;window.dispatchEvent(new Event('scroll'));tree=render();assert.equal(tree.props['data-scrolled'],true);
 for(const href of ['/profile#account','/profile#purchased-books','/profile#transaction-history','/profile#settings'])assert(find(tree,node=>node.props?.href===href));
 find(tree,node=>node.type==='button'&&node.props.children==='Log out').props.onClick({currentTarget:{closest:()=>menu}});assert.equal(logout,1);
 find(tree,node=>node.props?.['aria-label']==='Cart, 2 books').props.onClick();tree=render();assert(find(tree,node=>node.type==='./CartModal'));
 props.isLoggedIn=false;tree=render();find(tree,node=>node.props?.['aria-label']==='Cart, 2 books').props.onClick();assert.equal(login,1);
 props.sessionUnavailable=true;tree=render();assert(find(tree,node=>node.props?.role==='status'&&node.props.children==='Session unavailable'));
 for(const cleanup of cleanups)cleanup();details.open=true;document.dispatchEvent(new Event('pointerdown'));assert.equal(details.open,true,'outside listeners removed');
 console.log('Passed: navigation search, mobile expansion/focus, genres, menu dismissal, scroll state, account destinations, cart/login and listener cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
