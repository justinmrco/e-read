// Evaluate the real pure frontend boundaries with optional browser-storage doubles.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
module.exports=function({window=new EventTarget(),sessionStorage}={}){
  const storage=new Map();
  sessionStorage ||= {getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  function load(file,names,bindings={}){
    const module={exports:{}};
    const source=fs.readFileSync(path.join(__dirname,'../frontend/lib',file),'utf8').replace(/^import .*;\r?$/gm,'').replaceAll('export ','');
    vm.runInNewContext(source+'\nmodule.exports={'+names+'};',{module,URL,Event,window,sessionStorage,...bindings});
    return module.exports;
  }
  const records=load('records.js','validId,validAmount,validOrderId,parseLibrary,parseHistory,parseReceipt');
  const catalog=load('catalog.js','parseCatalog');
  const adminSave=load('admin-save.js','readPendingSave,storePendingSave,clearPendingSave',{...records,...catalog});
  return{records,adminSave,catalog,sessionStorage};
};
