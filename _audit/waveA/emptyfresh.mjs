import { chromium } from 'playwright';
const BASE='http://localhost:5099';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/waveA';
const b=await chromium.launch();
// Context A: set up an empty-fields shell in localStorage, leave sessionStorage clean for the start key
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
const errs=[]; p.on('console',m=>m.type()==='error'&&errs.push(m.text())); p.on('pageerror',e=>errs.push('PE:'+e.message));
await p.goto(`${BASE}/wizard`,{waitUntil:'networkidle'});
await p.waitForTimeout(800);
// mutate localStorage shell to empty fields AND clear sessionStorage entirely
await p.evaluate(()=>{
  const k='qq_elfsight_shell';
  try{const v=JSON.parse(localStorage.getItem(k)); v.fields=[]; v.calculations=[]; localStorage.setItem(k,JSON.stringify(v));}catch(e){}
});
// Close & reopen a BRAND NEW context but persist storage state
const storage = await ctx.storageState();
await ctx.close();
// Strip sessionStorage origins (storageState only carries localStorage anyway; sessionStorage is per-context-fresh)
const ctx2=await b.newContext({viewport:{width:1440,height:900}, storageState:storage});
const p2=await ctx2.newPage();
const e2=[]; p2.on('console',m=>m.type()==='error'&&e2.push(m.text())); p2.on('pageerror',e=>e2.push('PE:'+e.message));
await p2.goto(`${BASE}/wizard`,{waitUntil:'networkidle'});
await p2.waitForTimeout(1200);
const startSec=await p2.$('[data-testid="advanced-section-build-start"]');
const out={
  calcRows: await p2.$$eval('[data-testid^="calc-row-"]',e=>e.length).catch(()=>0),
  startOpen: startSec? await startSec.getAttribute('data-open'):'NO_SECTION',
  aiCardVisible: await p2.isVisible('[data-testid="build-ai-card"]').catch(()=>false),
  sessionStartKey: await p2.evaluate(()=>sessionStorage.getItem('qq-adv-open-build-start')),
  errs:e2
};
await p2.screenshot({path:`${OUT}/1c-build-emptyfields-open-desktop.png`,fullPage:true});
console.log(JSON.stringify(out,null,2));
await b.close();
