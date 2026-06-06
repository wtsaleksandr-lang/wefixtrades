import { chromium } from 'playwright';
const BASE='http://localhost:5099';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/waveA';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
const errs=[]; p.on('console',m=>m.type()==='error'&&errs.push(m.text())); p.on('pageerror',e=>errs.push('PE:'+e.message));
// Clear storage first by visiting then wiping then reloading clean
await p.goto(`${BASE}/wizard`,{waitUntil:'domcontentloaded'});
await p.evaluate(()=>{ try{localStorage.clear();sessionStorage.clear();}catch(e){} });
await p.goto(`${BASE}/wizard`,{waitUntil:'networkidle'});
await p.waitForTimeout(1500);
const startSec=await p.$('[data-testid="advanced-section-build-start"]');
const fields=await p.$$eval('[data-testid^="calc-row-"]',e=>e.length).catch(()=>0);
const fieldRows=await p.$$eval('[data-testid^="field-row-"]',e=>e.length).catch(()=>0);
const out={
  startPresent:!!startSec,
  startOpen: startSec? await startSec.getAttribute('data-open'):null,
  aiCardVisible: await p.isVisible('[data-testid="build-ai-card"]').catch(()=>false),
  calcRows:fields, fieldRows,
  errs
};
await p.screenshot({path:`${OUT}/1b-build-blank-cleared-desktop.png`,fullPage:true});
console.log(JSON.stringify(out,null,2));
await b.close();
