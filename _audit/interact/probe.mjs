import { chromium } from 'playwright';
const BASE = 'http://localhost:5099';
const b = await chromium.launch({ headless: true });

async function probe(path, vp, label) {
  const ctx = await b.newContext({ viewport: vp });
  const p = await ctx.newPage();
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => {
    const out = {};
    const ids = ['editor-tab-build','editor-tab-action','editor-tab-style','editor-tab-settings','editor-tab-help','quotequick-publish','editor-help','editor-tabs'];
    for (const id of ids) {
      const els = [...document.querySelectorAll(`[data-testid="${id}"]`)];
      out[id] = els.map(e => {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return { vis: r.width>0 && r.height>0 && cs.display!=='none' && cs.visibility!=='hidden', w: Math.round(r.width), h: Math.round(r.height), disp: cs.display, vy: Math.round(r.y) };
      });
    }
    return out;
  });
  console.log(`\n=== ${label} (${path} @ ${vp.width}x${vp.height}) ===`);
  console.log(JSON.stringify(info, null, 1));
  await ctx.close();
}

async function probeWidget(slug, vp) {
  const ctx = await b.newContext({ viewport: vp });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/templates/${slug}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1600);
  const info = await p.evaluate(() => {
    const counts = {
      selects: document.querySelectorAll('main select').length,
      ranges: document.querySelectorAll('main input[type=range]').length,
      roleSlider: document.querySelectorAll('main [role=slider]').length,
      checkboxes: document.querySelectorAll('main input[type=checkbox]').length,
      radios: document.querySelectorAll('main [role=radio]').length,
      ariaPressed: document.querySelectorAll('main button[aria-pressed]').length,
      buttons: document.querySelectorAll('main button').length,
    };
    // find likely widget container testids
    const tids = [...document.querySelectorAll('[data-testid]')].map(e=>e.getAttribute('data-testid'));
    const calcLike = [...new Set(tids)].filter(t => /calc|widget|quote|preview|field|option|slider|result|cta/i.test(t));
    return { counts, calcLike: calcLike.slice(0,40) };
  });
  console.log(`\n### WIDGET ${slug} @ ${vp.width}x${vp.height}`);
  console.log(JSON.stringify(info, null, 1));
  await ctx.close();
}

await probe('/wizard', { width: 390, height: 844 }, 'WIZARD MOBILE');
await probe('/wizard', { width: 1440, height: 900 }, 'WIZARD DESKTOP');
await probeWidget('car_towing', { width: 1440, height: 900 });
await b.close();
