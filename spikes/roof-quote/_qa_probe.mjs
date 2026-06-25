import { chromium } from 'playwright';

const FLAGS = ['--ignore-gpu-blocklist','--enable-gpu','--enable-webgl','--use-angle=d3d11','--enable-accelerated-2d-canvas'];

const browser = await chromium.launch({ headless: false, args: FLAGS });
const ctx = await browser.newContext({ viewport: { width: 1320, height: 900 } });
const page = await ctx.newPage();

const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[PAGEERROR] ${e.message}`));

await page.goto('http://localhost:5320/roof3d', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// GPU renderer assertion
const renderer = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
  if (!gl) return 'NO-WEBGL';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'no-ext';
});
console.log('RENDERER:', renderer);

// Dump key elements present
const probe = await page.evaluate(() => {
  const ids = ['addrHero','goHero','srContinue','dotDone','branchChoice','bcSolar','bcRoof','solarGrid','sgView2d','sgView3d','sgBill','roofDesign','rdMats','rdCols'];
  const found = {};
  ids.forEach(id => { found[id] = !!document.getElementById(id); });
  return { found, ready: window.__roofReady, title: document.title, barText: document.body.innerText.slice(0,300) };
});
console.log('PROBE:', JSON.stringify(probe, null, 2));
console.log('LOGS:', logs.slice(0,30).join('\n'));

await page.screenshot({ path: 'C:/Users/Owner/claude-orchestrator/audits/qa-sweep/_probe-hero.png' });
await browser.close();
