import { chromium } from 'playwright';
const BASE='http://localhost:5099';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/waveA';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
const errs=[]; p.on('console',m=>m.type()==='error'&&errs.push(m.text())); p.on('pageerror',e=>errs.push('PE:'+e.message));
await p.goto(`${BASE}/wizard`,{waitUntil:'domcontentloaded'});
await p.evaluate(()=>{try{localStorage.clear();sessionStorage.clear();}catch(e){}});
// Inject an empty-fields shell state directly into localStorage key, then reload.
// Find the storage key used by the wizard.
await p.goto(`${BASE}/wizard`,{waitUntil:'networkidle'});
await p.waitForTimeout(1000);
const keys = await p.evaluate(()=>Object.keys(localStorage));
console.log('LS keys:', JSON.stringify(keys));
// Mutate any shell-state key to fields:[] calculations:[]
const mutated = await p.evaluate(()=>{
  let did=[];
  for(const k of Object.keys(localStorage)){
    try{
      const v=JSON.parse(localStorage.getItem(k));
      if(v && (Array.isArray(v.fields)||Array.isArray(v.calculations))){
        if(Array.isArray(v.fields)) v.fields=[];
        if(Array.isArray(v.calculations)) v.calculations=[];
        localStorage.setItem(k, JSON.stringify(v));
        did.push(k);
      }
    }catch(e){}
  }
  return did;
});
console.log('Mutated keys:', JSON.stringify(mutated));
await p.goto(`${BASE}/wizard`,{waitUntil:'networkidle'});
await p.waitForTimeout(1200);
const startSec=await p.$('[data-testid="advanced-section-build-start"]');
const out={
  mutatedKeys:mutated,
  calcRows: await p.$$eval('[data-testid^="calc-row-"]',e=>e.length).catch(()=>0),
  startOpen: startSec? await startSec.getAttribute('data-open'):'NO_SECTION',
  aiCardVisible: await p.isVisible('[data-testid="build-ai-card"]').catch(()=>false),
  errs
};
await p.screenshot({path:`${OUT}/1c-build-emptyfields-open-desktop.png`,fullPage:true});
console.log(JSON.stringify(out,null,2));
await b.close();
