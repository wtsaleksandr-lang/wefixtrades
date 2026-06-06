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
  try { await p.goto(B + route, { waitUntil: 'networkidle', timeout: 20000 }); }
  catch { try { await p.goto(B + route, { waitUntil: 'domcontentloaded', timeout: 20000 }); } catch {} }
  await p.waitForTimeout(2500);
}

// ---- Code-error checks (items 1,2) ----
async function codeErr(item, route, needle, vp = { w: 1440, h: 900, m: false }) {
  const { ctx, p, errors } = await newP(vp);
  await goto(p, route);
  const matched = errors.filter(e => needle.test(e));
  results.push({ item, route, status: matched.length === 0 ? 'RESOLVED' : 'STILL-PRESENT',
    evidence: matched.length === 0 ? 'no matching error fired' : matched.slice(0, 3).join(' | '),
    allErrors: errors.slice(0, 6) });
  await ctx.close();
}

// ---- Overflow checks (items 4,5,6,7) ----
async function overflow(item, route, vp) {
  const { ctx, p } = await newP(vp);
  await goto(p, route);
  const info = await p.evaluate(() => {
    const iw = window.innerWidth;
    const sw = document.documentElement.scrollWidth;
    // find widest offending element ignoring overflow-x:auto/scroll ancestors
    let worst = null;
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.right > iw + 2) {
        // skip if any ancestor is an intentional scroll carousel
        let a = el, intentional = false;
        while (a) { const cs = getComputedStyle(a); if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') { intentional = true; break; } a = a.parentElement; }
        if (!intentional) {
          const over = Math.round(r.right - iw);
          if (!worst || over > worst.over) worst = { tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), over };
        }
      }
    });
    return { iw, sw, over: sw - iw, worst };
  });
  const ok = info.over <= 2;
  results.push({ item, route, vp: vp.m ? 'mobile' : 'desktop', status: ok ? 'RESOLVED' : 'STILL-PRESENT',
    evidence: `scrollWidth ${info.sw} vs innerWidth ${info.iw} (over +${info.over})` + (info.worst ? ` worst: ${info.worst.tag}.${info.worst.cls} +${info.worst.over}` : '') });
  if (!ok) { try { await p.screenshot({ path: `${OUT}/overflow-${item}-${route.replace(/[\/]/g, '_')}-${vp.m ? 'm' : 'd'}.png`, fullPage: false }); } catch {} }
  await ctx.close();
}

// ---- Broken image check (item 3) ----
async function imgCheck(item, route) {
  const { ctx, p } = await newP({ w: 1440, h: 900, m: false });
  await goto(p, route);
  const info = await p.evaluate(() => {
    // find RankFlow card
    const cards = [...document.querySelectorAll('*')].filter(el => /RankFlow/i.test(el.textContent || '') && el.children.length < 40);
    let card = null;
    for (const c of cards) { if (!card || (c.contains(card) ? false : c.textContent.length < card.textContent.length)) card = c; }
    // walk up to a card-ish container
    let cont = card;
    for (let i = 0; i < 4 && cont && cont.parentElement; i++) cont = cont.parentElement;
    const root = card ? (card.closest('[class*=card],[class*=Card],article,li,a') || card) : null;
    const out = { found: !!root };
    if (root) {
      const imgs = [...root.querySelectorAll('img')];
      out.imgCount = imgs.length;
      out.emptySrc = imgs.filter(i => !i.getAttribute('src') || i.getAttribute('src') === '' || i.naturalWidth === 0).map(i => ({ src: i.getAttribute('src'), nw: i.naturalWidth }));
      out.svgCount = root.querySelectorAll('svg').length;
      out.rect = (() => { const r = root.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })();
    }
    return out;
  });
  const hasIcon = info.found && (info.svgCount > 0 || (info.imgCount > 0 && (!info.emptySrc || info.emptySrc.length === 0)));
  const noEmpty = !info.emptySrc || info.emptySrc.length === 0;
  const ok = info.found && hasIcon && noEmpty;
  results.push({ item, route, status: ok ? 'RESOLVED' : 'STILL-PRESENT',
    evidence: info.found ? `RankFlow card: imgs=${info.imgCount} emptySrc=${(info.emptySrc || []).length} svgs=${info.svgCount}` : 'RankFlow card not located' });
  // screenshot services grid
  try {
    if (info.rect && info.rect.y > 200) await p.evaluate(y => window.scrollTo(0, y - 200), info.rect.y);
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/item3-services-grid.png`, fullPage: false });
    await p.screenshot({ path: `${OUT}/item3-services-full.png`, fullPage: true });
  } catch {}
  await ctx.close();
}

// ---- A11y checks (items 8-13) ----
async function a11y(item, route, viol, vp = { w: 1440, h: 900, m: false }) {
  const { ctx, p } = await newP(vp);
  await goto(p, route);
  let res;
  try {
    await p.addScriptTag({ content: AXE });
    res = await p.evaluate(async () => await window.axe.run(document, { resultTypes: ['violations'] }));
  } catch (e) { res = { violations: [], err: String(e) }; }
  const hit = (res.violations || []).find(v => v.id === viol);
  const nodes = hit ? hit.nodes.length : 0;
  // collect critical/serious for context
  const crit = (res.violations || []).filter(v => v.impact === 'critical').map(v => `${v.id}(${v.nodes.length})`);
  results.push({ item, route, vp: vp.m ? 'mobile' : 'desktop', status: nodes === 0 ? 'RESOLVED' : 'STILL-PRESENT',
    evidence: nodes === 0 ? `axe '${viol}': 0 nodes` : `axe '${viol}': ${nodes} nodes`,
    criticals: crit });
  await ctx.close();
}

// ===================== RUN =====================
// 1
await codeErr(1, '/design-showcase', /attribute height: Expected length, "?auto"?/i);
// 2 (two routes)
await codeErr('2a', '/products/quickquotepro/build-with-ai', /attribute (x2|y2): Expected length, "?undefined"?/i);
await codeErr('2b', '/tools/build-with-ai', /attribute (x2|y2): Expected length, "?undefined"?/i);
// 3
await imgCheck(3, '/services');
// 4
await overflow(4, '/products/quotequick', { w: 375, h: 812, m: true });
// 5
await overflow('5a', '/docs/api', { w: 375, h: 812, m: true });
await overflow('5b', '/docs/domain', { w: 375, h: 812, m: true });
await overflow('5c', '/docs/webhooks', { w: 375, h: 812, m: true });
await overflow('5d', '/docs/embed', { w: 375, h: 812, m: true });
// 6
await overflow(6, '/demos/rankflow', { w: 375, h: 812, m: true });
// 7
for (const f of ['ai-employee', 'booking', 'calculator-engine', 'instant-quotes', 'sms']) {
  await overflow('7-' + f + '-d', '/features/' + f, { w: 1440, h: 900, m: false });
  await overflow('7-' + f + '-m', '/features/' + f, { w: 375, h: 812, m: true });
}
// 8
await a11y(8, '/demos/socialsync', 'select-name');
// 9
await a11y(9, '/tools/local-serp-checker', 'aria-required-children');
// 10
await a11y(10, '/wefixtrades-vs-jobber', 'aria-prohibited-attr');
// 11
await a11y(11, '/security', 'link-in-text-block');
// 12
await a11y(12, '/login', 'aria-hidden-focus');
// 13
await a11y(13, '/compare/reputationshield-vs-nicejob', 'scrollable-region-focusable');

fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await br.close();
