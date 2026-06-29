// fix8 real-GPU verification: Satellite⇄3D-model toggle must keep quote == rendered panels.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'C:/Users/Owner/claude-orchestrator/audits/fix8';
const URL = 'http://localhost:5329/';
const ADDR = '26 Plymouth Rd, Scarsdale NY';
const GPU_FLAGS = ['--ignore-gpu-blocklist','--enable-gpu','--enable-webgl','--use-angle=d3d11','--enable-accelerated-2d-canvas'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function readState(page){
  return await page.evaluate(() => ({
    quotePanels: window.__quotePanels,
    renderedPanels: window.__renderedPanels,
    panelsPlaced: window.__panelsPlaced,
    mode: window.__mode || window.mode,
    viewGen: window.__viewGen,
    roofReady: window.__roofReady,
  }));
}

async function readQuoteText(page){
  // Pull the headline panel count + price range text from the card if present.
  return await page.evaluate(() => {
    const t = (document.querySelector('#card') || document.body).innerText || '';
    const kw = (t.match(/([\d.]+)\s*kW/) || [])[1] || null;
    const dollars = (t.match(/\$[\d,]+(?:\s*[–-]\s*\$?[\d,]+)?/) || [])[0] || null;
    const panels = (t.match(/(\d+)\s*panel/i) || [])[1] || null;
    return { kw, dollars, panels };
  });
}

async function gpuInfo(page){
  return await page.evaluate(() => {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if(!gl) return { renderer:'NO-WEBGL', vendor:'' };
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      };
    } catch(e){ return { renderer:'ERR:'+e.message, vendor:'' }; }
  });
}

async function loadAddress(page){
  // The landing hero (#hero, z-index 25) covers #bar until a quote starts; type into the hero input.
  const input = page.locator('#addrHero');
  await input.click();
  await input.fill('');
  await input.pressSequentially(ADDR, { delay: 40 });
  await sleep(2000); // let Google Places autocomplete populate
  await input.press('Enter'); // picks the active suggestion → __leaveHero() + run(addr)
  await sleep(1500);
  // fallback: if the hero is still up (no autocomplete pick), click the CTA explicitly
  const heroUp = await page.evaluate(() => { const h=document.querySelector('#hero'); return h && getComputedStyle(h).display !== 'none'; }).catch(()=>false);
  if(heroUp){ await page.evaluate(() => { document.querySelector('#goHero')?.click(); }); }
  // poll roofReady up to ~75s
  let ready = false;
  for(let i=0;i<75;i++){
    ready = await page.evaluate(() => !!window.__roofReady).catch(()=>false);
    if(ready) break;
    await sleep(1000);
  }
  return ready;
}

async function clickToggle(page, which){ // 'model' | 'photo'
  await page.evaluate((w) => {
    const btn = document.querySelector('#viewToggle button[data-v="'+w+'"]');
    if(btn) btn.click();
  }, which);
}

async function runViewport(browser, label, viewport){
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(`[${label}] pageerror:`, e.message));
  const result = { label, gpu:null, ready:false, before:null, sat:null, after:null, pass:false, notes:[] };

  await page.goto(URL, { waitUntil:'domcontentloaded' });
  result.gpu = await gpuInfo(page);
  console.log(`[${label}] renderer: ${result.gpu.renderer} | vendor: ${result.gpu.vendor}`);

  result.ready = await loadAddress(page);
  if(!result.ready){ result.notes.push('roofReady never fired'); await ctx.close(); return result; }
  await sleep(16000); // let the model settle

  // BEFORE: on the model view
  result.before = { state: await readState(page), text: await readQuoteText(page) };
  await page.screenshot({ path:`${OUT}/${label}-1-model-before.png` });
  console.log(`[${label}] BEFORE model:`, JSON.stringify(result.before));

  // toggle Satellite
  await clickToggle(page, 'photo');
  await sleep(9000);
  result.sat = { state: await readState(page), text: await readQuoteText(page) };
  await page.screenshot({ path:`${OUT}/${label}-2-satellite.png` });
  console.log(`[${label}] SATELLITE:`, JSON.stringify(result.sat));

  // toggle back to 3D model
  await clickToggle(page, 'model');
  await sleep(6000);
  result.after = { state: await readState(page), text: await readQuoteText(page) };
  await page.screenshot({ path:`${OUT}/${label}-3-model-after.png` });
  console.log(`[${label}] AFTER model:`, JSON.stringify(result.after));
  const bppLog = await page.evaluate(() => window.__bppLog || []).catch(()=>[]);
  console.log(`[${label}] bppLog:`, JSON.stringify(bppLog));
  const rpLog = await page.evaluate(() => window.__rpLog || []).catch(()=>[]);
  console.log(`[${label}] rpLog:`, JSON.stringify(rpLog));

  // ASSERTIONS
  const b = result.before.state, a = result.after.state;
  const quoteUnchanged = (b.quotePanels === a.quotePanels);
  const quoteEqRendered = (a.quotePanels === a.renderedPanels);
  const renderedEqPlaced = (a.renderedPanels === a.panelsPlaced);
  result.pass = quoteUnchanged && quoteEqRendered && renderedEqPlaced;
  if(!quoteUnchanged) result.notes.push(`quotePanels changed ${b.quotePanels}→${a.quotePanels}`);
  if(!quoteEqRendered) result.notes.push(`quote(${a.quotePanels}) != rendered(${a.renderedPanels}) after toggle`);
  if(!renderedEqPlaced) result.notes.push(`rendered(${a.renderedPanels}) != engineered placed(${a.panelsPlaced})`);

  await ctx.close();
  return result;
}

(async () => {
  const browser = await chromium.launch({ headless:false, args: GPU_FLAGS });
  const out = [];
  out.push(await runViewport(browser, 'desktop', { width:1440, height:900 }));
  out.push(await runViewport(browser, 'mobile',  { width:375,  height:812 }));
  await browser.close();

  fs.writeFileSync(`${OUT}/result.json`, JSON.stringify(out, null, 2));
  console.log('\n===== SUMMARY =====');
  for(const r of out){
    console.log(`${r.label}: ${r.pass?'PASS':'FAIL'} | renderer=${r.gpu&&r.gpu.renderer}`);
    console.log(`   before quote=${r.before&&r.before.state.quotePanels} rendered=${r.before&&r.before.state.renderedPanels}`);
    console.log(`   sat    quote=${r.sat&&r.sat.state.quotePanels} rendered=${r.sat&&r.sat.state.renderedPanels}`);
    console.log(`   after  quote=${r.after&&r.after.state.quotePanels} rendered=${r.after&&r.after.state.renderedPanels} placed=${r.after&&r.after.state.panelsPlaced}`);
    if(r.notes.length) console.log('   notes:', r.notes.join(' | '));
  }
  const allPass = out.every(r=>r.pass);
  console.log(allPass ? '\nALL PASS' : '\nFAILURES PRESENT');
  process.exit(allPass?0:2);
})().catch(e => { console.error('FATAL', e); process.exit(3); });
