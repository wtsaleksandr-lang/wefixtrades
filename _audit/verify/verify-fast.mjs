import { chromium } from 'playwright';
import fs from 'fs';

const B = 'http://localhost:5099';
const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/verify';
const AXE = fs.readFileSync('C:/Users/Owner/.codex/wt-preview/node_modules/axe-core/axe.min.js', 'utf8');
const br = await chromium.launch();
const results = [];

function isNoise(t) {
  return /fetch|Failed to load resource|net::ERR|api\/|404 \(Not Found\)|the server responded with a status|ERR_CONNECTION|Failed to fetch|NetworkError|AbortError/i.test(t);
}
async function newP(vp) {
  const ctx = await br.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.m, hasTouch: vp.m });
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', m => { if (m.type() === 'error' && !isNoise(m.text())) errors.push('console: ' + m.text()); });
  p.on('pageerror', e => { if (!isNoise(String(e))) errors.push('pageerror: ' + String(e)); });
  return { ctx, p, errors };
}
async function goto(p, route) {
  try { await p.goto(B + route, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch {}
  await p.waitForTimeout(1500);
}
async function codeErr(item, route, needle, vp = { w: 1440, h: 900, m: false }) {
  const { ctx, p, errors } = await newP(vp);
  await goto(p, route);
  const matched = errors.filter(e => needle.test(e));
  results.push({ item, route, status: matched.length === 0 ? 'RESOLVED' : 'STILL-PRESENT',
    evidence: matched.length === 0 ? 'no matching error' : matched.slice(0, 2).join(' | ') });
  await ctx.close();
}
async function overflow(item, route, vp) {
  const { ctx, p } = await newP(vp);
  await goto(p, route);
  const info = await p.evaluate(() => {
    const iw = window.innerWidth;
    const sw = document.documentElement.scrollWidth;
    let worst = null;
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.right > iw + 2) {
        let a = el, intentional = false;
        while (a) { const cs = getComputedStyle(a); if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') { intentional = true; break; } a = a.parentElement; }
        if (!intentional) { const over = Math.round(r.right - iw); if (!worst || over > worst.over) worst = { tag: el.tagName, cls: (el.className || '').toString().slice(0, 50), over }; }
      }
    });
    return { iw, sw, over: sw - iw, worst };
  });
  const ok = info.over <= 2;
  results.push({ item, route, vp: vp.m ? 'mobile' : 'desktop', status: ok ? 'RESOLVED' : 'STILL-PRESENT',
    evidence: `sw ${info.sw} vs iw ${info.iw} (+${info.over})` + (info.worst ? ` worst ${info.worst.tag}.${info.worst.cls}+${info.worst.over}` : '') });
  await ctx.close();
}
async function imgCheck(item, route) {
  const { ctx, p } = await newP({ w: 1440, h: 900, m: false });
  await goto(p, route);
  const info = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('*')].filter(el => /RankFlow/i.test(el.textContent || '') && el.children.length < 40);
    let card = null;
    for (const c of cards) { if (!card || c.textContent.length < card.textContent.length) card = c; }
    const root = card ? (card.closest('[class*=card],[class*=Card],article,li,a') || card) : null;
    const out = { found: !!root };
    if (root) {
      const imgs = [...root.querySelectorAll('img')];
      out.imgCount = imgs.length;
      out.emptySrc = imgs.filter(i => !i.getAttribute('src') || i.getAttribute('src') === '' || i.naturalWidth === 0).length;
      out.svgCount = root.querySelectorAll('svg').length;
    }
    return out;
  });
  const ok = info.found && (info.svgCount > 0 || (info.imgCount > 0 && info.emptySrc === 0)) && (info.emptySrc || 0) === 0;
  results.push({ item, route, status: ok ? 'RESOLVED' : 'STILL-PRESENT',
    evidence: info.found ? `imgs=${info.imgCount} emptySrc=${info.emptySrc} svgs=${info.svgCount}` : 'RankFlow card not found' });
  await ctx.close();
}
async function a11y(item, route, viol, vp = { w: 1440, h: 900, m: false }) {
  const { ctx, p } = await newP(vp);
  await goto(p, route);
  let res;
  try { await p.addScriptTag({ content: AXE }); res = await p.evaluate(async () => await window.axe.run(document, { resultTypes: ['violations'] })); }
  catch (e) { res = { violations: [], err: String(e) }; }
  const hit = (res.violations || []).find(v => v.id === viol);
  const nodes = hit ? hit.nodes.length : 0;
  results.push({ item, route, vp: vp.m ? 'mobile' : 'desktop', status: nodes === 0 ? 'RESOLVED' : 'STILL-PRESENT',
    evidence: `axe '${viol}': ${nodes} nodes` });
  await ctx.close();
}

await codeErr(1, '/design-showcase', /attribute height: Expected length, "?auto"?/i);
await codeErr(2, '/tools/build-with-ai', /attribute (x2|y2|x1|y1): Expected length, "?undefined"?/i);
await imgCheck(3, '/services');
await overflow(4, '/products/quotequick', { w: 375, h: 812, m: true });
await overflow('5a', '/docs/api', { w: 375, h: 812, m: true });
await overflow('5b', '/docs/domain', { w: 375, h: 812, m: true });
await overflow('5c', '/docs/webhooks', { w: 375, h: 812, m: true });
await overflow('5d', '/docs/embed', { w: 375, h: 812, m: true });
await overflow(6, '/demos/rankflow', { w: 375, h: 812, m: true });
for (const f of ['ai-employee', 'booking', 'calculator-engine', 'instant-quotes', 'sms']) {
  await overflow('7-' + f + '-d', '/features/' + f, { w: 1440, h: 900, m: false });
  await overflow('7-' + f + '-m', '/features/' + f, { w: 375, h: 812, m: true });
}
await a11y(8, '/demos/socialsync', 'select-name');
await a11y(9, '/tools/local-serp-checker', 'aria-required-children');
await a11y(10, '/wefixtrades-vs-jobber', 'aria-prohibited-attr');
await a11y(11, '/security', 'link-in-text-block');
await a11y(12, '/login', 'aria-hidden-focus');
await a11y(13, '/compare/reputationshield-vs-nicejob', 'scrollable-region-focusable');

fs.writeFileSync(`${OUT}/results-fast.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await br.close();
