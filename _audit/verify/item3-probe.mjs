import { chromium } from 'playwright';
const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
try { await p.goto('http://localhost:5099/services', { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch {}
await p.waitForTimeout(2000);
const info = await p.evaluate(() => {
  // find smallest element whose text contains RankFlow
  const els = [...document.querySelectorAll('*')].filter(el => /RankFlow/.test(el.textContent || ''));
  if (!els.length) return { present: false, bodyHasRankflow: /RankFlow/.test(document.body.innerText) };
  els.sort((a,b)=>a.textContent.length-b.textContent.length);
  const leaf = els[0];
  const card = leaf.closest('[class*=card],[class*=Card],article,li,a,[class*=Service]') || leaf.parentElement;
  const imgs = [...card.querySelectorAll('img')];
  return {
    present: true,
    leafTag: leaf.tagName, leafText: leaf.textContent.slice(0,40),
    cardTag: card.tagName, cardCls: (card.className||'').toString().slice(0,80),
    imgCount: imgs.length,
    imgs: imgs.map(i=>({src:(i.getAttribute('src')||'').slice(0,40), nw:i.naturalWidth})),
    svgCount: card.querySelectorAll('svg').length,
    svgViz: [...card.querySelectorAll('svg')].map(s=>{const r=s.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)};}).slice(0,3)
  };
});
console.log(JSON.stringify(info, null, 2));
await br.close();
