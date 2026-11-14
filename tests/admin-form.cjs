// Real form handlers with hook/API doubles; no browser or database required.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const frontendRequire = createRequire(path.join(root, 'frontend/package.json'));
function find(node, predicate) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found; } }
  else { if (predicate(node)) return node; return find(node.props?.children, predicate); }
}
async function main() {
  const { code } = await frontendRequire('next/dist/build/swc').transform(fs.readFileSync(path.join(root, 'frontend/components/admin/AddBookModal.js'), 'utf8'), { filename: 'form.js', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' } });
  const book = { _id: '000000000000000000000001', __v: 3, title: 'Synthetic book', hook:'Synthetic hook',format:'Hardcover',pages:320,publisher:'Synthetic Press', author: 'Demo', year: 2025, genre: 'Fiction', description: 'Synthetic', imageUrl: '/sample-cover.svg', price: 15000 };
  for (const scenario of ['refresh-failure', 'retry', 'edit', 'edit-retry', 'edit-conflict', 'edit-review-failure', 'invalid-response', 'validation', 'fractional', 'offline', 'storage-denied', 'resume', 'edit-resume']) {
    const {adminSave}=require('./frontend-modules.cjs')(scenario==='storage-denied'?{sessionStorage:{getItem(){throw Error('Denied');}}}:{});
    const slots = []; let cursor = 0; let calls = 0; let finish; let closed = 0; const headers = []; const bodies=[];
    const react = {
      useState(value) { const index = cursor++; if (!(index in slots)) slots[index] = value; return [slots[index], next => { slots[index] = next; }]; },
      useRef(value) { const index = cursor++; slots[index] ??= { current: value }; return slots[index]; },
    };
    const module = { exports: {} }; const jsx = (type, props) => ({ type, props: typeof props?.children === 'function' ? { ...props, children:props.children(props.onClose) } : props });
    vm.runInNewContext(code, { module, exports: module.exports, URL, crypto: { randomUUID }, require(name) {
      if(name.includes('/lib/admin-save'))return adminSave;
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'lucide-react') return { X: 'icon' };
      if (name === '../Modal') return 'modal';
      if (name.includes('/lib/api')) return { apiRequest: async (route, options) => {
        calls++; headers.push(options.headers?.['Idempotency-Key']);
        bodies.push(options.body);
        if (options.body) { const payload=JSON.parse(options.body);assert.equal(payload.hook,'Synthetic hook');assert.equal(payload.format,'Hardcover');assert.equal(payload.pages,320);assert.equal(payload.publisher,'Synthetic Press'); }
        if (scenario.startsWith('edit')) {
          if (options.method === undefined) { if (scenario === 'edit-review-failure') throw Error('Catalog offline'); return { books:[{ ...book, title:'Competing saved title', __v:5 }] }; }
          assert.equal(route, '/api/books/' + book._id); assert.equal(options.method, 'PATCH');
          assert.equal(JSON.parse(options.body).version, calls === 3 ? 5 : 3);
          if (calls === 1 && scenario === 'edit-retry') throw Error('Timeout');
          if (calls === 1 && (scenario.includes('conflict') || scenario === 'edit-review-failure')) throw Object.assign(Error('Conflict'), { status:409 });
          return book;
        }
        assert.equal(options.method, 'POST');
        if (scenario === 'invalid-response') return {};
        if (scenario === 'validation') throw Object.assign(Error('Invalid details'), { status:400 });
        if (scenario === 'retry' && calls === 1) throw Error('Timeout');
        if (scenario === 'refresh-failure') return new Promise(resolve => { finish = resolve; });
        return book;
      } };
      throw Error(name);
    } });
    const props = { ownerId:'aaaaaaaaaaaaaaaaaaaaaaaa', isOpen: true, book: scenario.startsWith('edit') ? book : null, onClose: () => closed++, onSubmit: async () => { if (scenario === 'refresh-failure') throw Error('Refresh unavailable'); } };
    if(scenario.includes('resume')) {
      const pending={bookId:scenario.startsWith('edit')?book._id:null,requestId:scenario.startsWith('edit')?null:randomUUID(),payload:{...book},version:3,state:'uncertain'};
      adminSave.storePendingSave(props.ownerId,pending);props.recoverySave=adminSave.readPendingSave(props.ownerId);
    }
    function render() { cursor = 0; return module.exports.default(props); }
    let tree = render();
    if (!scenario.startsWith('edit') && !scenario.includes('resume')) {
      const fields = { 0: book.title, 1: book.genre, 2: book.author, 3: book.year, 4: scenario === 'fractional' ? '1.5' : book.price, 5: book.description };
      for (const [field, value] of Object.entries(fields)) find(tree, node => node.props?.id === 'add-book-' + field).props.onChange({ target: { value } });
      find(tree,node=>node.props?.id==='book-hook').props.onChange({target:{value:book.hook}});
      for(const field of ['format','pages','publisher']) find(tree,node=>node.props?.id==='book-'+field).props.onChange({target:{value:book[field]}});
      tree = render();
    }
    assert.equal(find(tree,node=>node.props?.id==='book-hook').props.maxLength,100);
    const submit = () => find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    if (scenario === 'offline') {
      let retries=0;props.connectionUnavailable=true;props.onRetryConnection=()=>retries++;tree=render();
      assert.equal(find(tree,node=>node.type==='fieldset').props.disabled,true);
      assert.equal(find(tree,node=>node.props?.id==='add-book-0').props.value,book.title);
      await submit();assert.equal(calls,0);
      find(tree,node=>node.type==='button'&&node.props.children==='Retry connection').props.onClick();assert.equal(retries,1);
      props.connectionUnavailable=false;tree=render();assert.equal(find(tree,node=>node.props?.id==='add-book-0').props.value,book.title);
      await submit();assert.equal(calls,1);continue;
    }
    if(scenario.includes('resume')) {
      assert.equal(find(tree,node=>node.type==='fieldset').props.disabled,true);
      await find(tree,node=>node.props?.children==='Retry same save').props.onClick({preventDefault(){}});
      assert.equal(calls,1);assert.equal(adminSave.readPendingSave(props.ownerId),null);
      assert.equal(JSON.parse(bodies[0]).title,book.title);continue;
    }
    if(scenario==='storage-denied') {await submit();assert.equal(calls,0);assert(JSON.stringify(render()).includes('No save request was sent'));continue;}
    const pending = submit();
    if (scenario === 'refresh-failure') {
      await submit(); assert.equal(calls, 1);
      tree.props.onClose(); assert.equal(closed, 0);
      finish(book); await pending; tree = render();
      assert(JSON.stringify(tree).includes('The book was saved.'));
      await submit(); assert.equal(calls, 1);
      tree.props.onClose(); assert.equal(closed, 1);
    } else {
      await pending;
      if (scenario === 'retry' || scenario === 'edit-retry') {
        tree = render();assert.equal(find(tree,node=>node.type==='fieldset').props.disabled,true);
        find(tree,node=>node.props?.id==='add-book-0').props.onChange({target:{value:'Changed after timeout'}});tree=render();
        await find(tree,node=>node.props?.children==='Retry same save').props.onClick({preventDefault(){}});
        assert.equal(calls, 2); assert.equal(headers[0], headers[1]);assert.equal(bodies[0],bodies[1]);
      }
      if (scenario === 'edit-conflict' || scenario === 'edit-review-failure') {
        tree=render();assert.equal(find(tree,node=>node.type==='fieldset').props.disabled,true);await submit();assert.equal(calls,1);
        await find(tree,node=>node.props?.children==='Review latest saved details').props.onClick();tree=render();
        assert.equal(find(tree,node=>node.props?.id==='add-book-0').props.value,book.title);
        if(scenario==='edit-conflict'){
          assert(JSON.stringify(tree).includes('Competing saved title'));
          find(tree,node=>node.props?.children==='Keep my draft with this reviewed version').props.onClick();tree=render();
          assert.equal(find(tree,node=>node.type==='fieldset').props.disabled,false);await submit();assert.equal(calls,3);
          assert.equal(JSON.parse(bodies[2]).title,book.title);
        }else{assert(JSON.stringify(tree).includes('Catalog offline'));assert.equal(find(tree,node=>node.type==='fieldset').props.disabled,true);}
      }
      if (scenario === 'invalid-response') { tree=render();assert(JSON.stringify(tree).includes('Save outcome unconfirmed'));assert.equal(find(tree,node=>node.type==='fieldset').props.disabled,true); }
      if (scenario === 'validation') { tree=render();assert(JSON.stringify(tree).includes('Invalid details'));assert.equal(find(tree,node=>node.type==='fieldset').props.disabled,false); }
      if (scenario === 'edit') assert.equal(calls, 1);
      if (scenario === 'fractional') { assert.equal(calls, 0); assert(JSON.stringify(render()).includes('whole-IDR')); }
    }
  }
  console.log('Passed: duplicate submit guard, save-vs-refresh failure, retry key reuse, local cover input, versioned edits, fractional-price rejection, and keeping offline drafts with a retry action.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
