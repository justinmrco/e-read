// Run: node tests/catalog.cjs. Catalog boundary and actual landing-page recovery.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),frontendRequire=createRequire(path.join(root,'frontend/package.json'));
const parser={exports:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'frontend/lib/catalog.js'),'utf8').replace('export function','function')+'\nmodule.exports={parseCatalog};',{module:parser,URL});
const {parseCatalog}=parser.exports;
const book={_id:'abcdefabcdefabcdefabcdef',title:' Test title ',author:'Demo',description:'Demo description',genre:'Fiction',year:2026,price:15000,imageUrl:'https://example.com/cover.jpg'};
function find(node,predicate){if(!node||typeof node!=='object')return;if(Array.isArray(node))return node.map(child=>find(child,predicate)).find(Boolean);return predicate(node)?node:find(node.props?.children,predicate);}
async function main(){
  assert.equal(parseCatalog([book]).books[0].title,'Test title');
  for(const imageUrl of [null,{},'javascript:alert(1)','data:image/svg+xml,test','https://user:password@example.com/cover','/missing.png']) assert.equal(parseCatalog([{...book,imageUrl}]).books[0].imageUrl,'/sample-cover.svg');
  assert.equal(parseCatalog([{...book,imageUrl:'/sample-cover.svg'}]).books[0].imageUrl,'/sample-cover.svg');
  for (const imageUrl of ['/covers/furthermore.jpg','/covers/the-hazel-wood.avif']) assert.equal(parseCatalog([{...book,imageUrl}]).books[0].imageUrl,imageUrl);
  for (const imageUrl of ['/covers/../secret.jpg','//example.com/cover.jpg','/covers/%2e%2e.jpg','/covers/book.svg']) assert.equal(parseCatalog([{...book,imageUrl}]).books[0].imageUrl,'/sample-cover.svg');
  const {records}=require('./frontend-modules.cjs')();
  assert.equal(records.parseLibrary({books:[{...book,imageUrl:'/covers/the-hazel-wood.avif'}]}).books[0].imageUrl,'/covers/the-hazel-wood.avif');
  assert.equal(parseCatalog([{...book,hook:'  A magical journey.  '}]).books[0].hook,'A magical journey.');
  for(const hook of [undefined,null,{},'x'.repeat(101)]) { const result=parseCatalog([{...book,hook}]);assert.equal(result.books.length,1);assert.equal(result.books[0].hook,''); }
  const edition=parseCatalog([{...book,format:' Hardcover ',pages:320,publisher:' Example Press '}]).books[0];assert.equal(edition.format,'Hardcover');assert.equal(edition.pages,320);assert.equal(edition.publisher,'Example Press');
  for(const pages of [undefined,null,0,-1,1.5,100001,'320',{}]) assert.equal(parseCatalog([{...book,pages}]).books[0].pages,null);
  for(const [field,max] of [['format',100],['publisher',200]]) for(const value of [undefined,null,{},'x'.repeat(max+1)]) assert.equal(parseCatalog([{...book,[field]:value}]).books[0][field],'');
  const invalid=[null,{},42,{...book,_id:'bad'},...['title','author','description','genre'].map(field=>({...book,[field]:{bad:true}})),...['15000',0,-1,NaN,Infinity,1.5,100000001].map(price=>({...book,price})),{...book,year:'2026'},{...book,year:999}];
  for(const entry of invalid){const result=parseCatalog([book,{...entry,_id:entry?._id===book._id?'bbbbbbbbbbbbbbbbbbbbbbbb':entry?._id}]);assert.equal(result.books.length,1);assert.equal(result.unavailable,1);}
  const duplicates=parseCatalog([book,{...book,_id:book._id.toUpperCase()},{...book,_id:'bbbbbbbbbbbbbbbbbbbbbbbb'}]);assert.equal(duplicates.books.length,1);assert.equal(duplicates.unavailable,2);
  for(const input of [{books:[book]},null,'bad',[null]])assert.throws(()=>parseCatalog(input),/unavailable/);
  assert.equal(parseCatalog([]).books.length,0);
  const {code}=await frontendRequire('next/dist/build/swc').transform(fs.readFileSync(path.join(root,'frontend/app/page.js'),'utf8'),{filename:'page.js',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
  for(const scenario of ['mixed','invalid','empty','failed','stale','collection']){
    const slots=[],effects=[];let cursor=0,dirty=false,tree,calls=0,resolveOld;
    const react={useMemo(callback,deps){const i=cursor++;if(!slots[i]||deps.some((value,j)=>!Object.is(value,slots[i].deps[j])))slots[i]={deps,value:callback()};return slots[i].value;},useState(initial){const i=cursor++;if(!(i in slots))slots[i]={value:initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;dirty=true;}];},useEffect(callback,deps){const i=cursor++;if(!slots[i]||deps.some((value,j)=>!Object.is(value,slots[i].deps[j]))){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>slots[i].cleanup=callback());}}};
    const jsx=(type,props)=>({type,props}),module={exports:{}};
    vm.runInNewContext(code,{module,exports:module.exports,require(name){
      if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'fragment'};
      if(name==='lucide-react')return{BookOpen:'icon'};
      if(name.includes('use-session'))return{useSession:()=>({user:null})};
      if(name.includes('/lib/catalog'))return{parseCatalog};
      if(name.includes('/lib/api'))return{apiRequest:async()=>{calls++;if(calls>1)return[book];if(scenario==='failed')throw Error('Catalog offline');if(scenario==='stale')return new Promise(resolve=>resolveOld=resolve);return scenario==='collection'?Array.from({length:12},(_,index)=>({...book,_id:(index+1).toString(16).padStart(24,'0')})):scenario==='mixed'?[book,null]:scenario==='invalid'?[null]:[];}};
      return name;
    }});
    function render(){cursor=0;dirty=false;tree=module.exports.default();for(const effect of effects.splice(0))effect();}
    async function settle(){for(let i=0;i<8;i++){if(dirty)render();await new Promise(resolve=>setImmediate(resolve));}return tree;}
    render();await settle();let text=JSON.stringify(tree);
    if(scenario==='mixed'){
      assert(text.includes('temporarily unavailable'));assert.equal(find(tree,node=>String(node.type).includes('BookSection')).props.books.length,1);
      find(tree,node=>node.props?.children==='Refresh catalog').props.onClick();await settle();assert.equal(calls,2);assert(!JSON.stringify(tree).includes('temporarily unavailable'));
    }
    if(scenario==='collection'){const featured=find(tree,node=>String(node.type).endsWith('/BookSection')),collection=find(tree,node=>String(node.type).endsWith('/BookCollection'));assert.equal(featured.props.books.length,7);assert.equal(collection.props.books.length,5);assert.equal(collection.props.books[0]._id,'000000000000000000000008');assert.equal(collection.props.books[1]._id,'000000000000000000000009');assert.equal(collection.props.books[2]._id,'00000000000000000000000a');assert.equal(collection.props.books[3]._id,'00000000000000000000000b');assert.equal(collection.props.books[4]._id,'00000000000000000000000c');assert(collection.props.books.every(item=>!featured.props.books.some(book=>book._id===item._id)));}
    if(scenario==='empty'){assert(text.includes('No books are available yet.'));const navbar=find(tree,node=>String(node.type).endsWith('/Navbar'));navbar.props.onSearch('missing','');await settle();assert(JSON.stringify(tree).includes('No books match this selection.'));}
    if(scenario==='invalid'||scenario==='failed'){
      assert(find(tree,node=>node.props?.role==='alert'));assert(!text.includes('No books are available yet.'));
      find(tree,node=>node.props?.children==='Try again').props.onClick();await settle();assert.equal(calls,2);assert(find(tree,node=>String(node.type).includes('BookSection')));
    }
    for(const slot of slots)slot?.cleanup?.();
    if(scenario==='stale'){dirty=false;resolveOld([book]);await settle();assert.equal(dirty,false);assert(!JSON.stringify(tree).includes('Test title'));}
  }
  console.log('Passed: malformed catalog isolation, invalid prices/types/IDs, duplicate IDs, safe covers, partial availability, empty/search states, targeted refresh and stale-response cleanup.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
