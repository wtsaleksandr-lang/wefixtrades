import { chromium } from 'playwright';
import fs from 'fs';

const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/g8';
const TEMPLATES = ['solar_panel_install','pool_service_quote','pest_control_quote','roof_replacement','garage_door_service'];
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'mobile', width: 375, height: 812, isMobile: true, hasTouch: true },
];

// --- contrast helpers ---
function parseColor(s) {
  if (!s) return null;
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map(x => parseFloat(x.trim()));
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}
function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(c) { return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b); }
function over(fg, bg) { // composite fg (with alpha) over bg(opaque)
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}
function ratio(fg, bg) {
  const L1 = lum(fg), L2 = lum(bg);
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

const report = {};

for (const id of TEMPLATES) {
  report[id] = {};
  for (const vp of VIEWPORTS) {
    const r = { rendered: false, contrast: [], alignment: [], shots: [], note: '' };
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    try {
      await page.goto(`http://localhost:5099/templates/${id}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3500);
      // The page renders several advanced-calculator nodes; the real interactive one
      // is the widest (others are small rail/background thumbnails). Pick widest.
      const all = page.locator('[data-testid="advanced-calculator"]');
      const n = await all.count();
      if (!n) { r.note = 'BLOCKER: no [data-testid=advanced-calculator] found'; report[id][vp.name] = r; await browser.close(); continue; }
      let bestIdx = 0, bestW = -1;
      for (let i = 0; i < n; i++) { const bb = await all.nth(i).boundingBox(); if (bb && bb.width > bestW) { bestW = bb.width; bestIdx = i; } }
      const widget = all.nth(bestIdx);
      r.note = `widget idx ${bestIdx}/${n} w=${Math.round(bestW)}`;
      const exists = 1;
      await widget.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      r.rendered = true;

      // screenshot widget
      const wshot = `${OUT}/${id}__${vp.name}__widget.png`;
      await widget.screenshot({ path: wshot }).catch(async () => { await page.screenshot({ path: wshot, fullPage: false }); });
      r.shots.push(wshot);

      // ---- contrast scan over text within widget ----
      const contrastData = await widget.evaluate((root) => {
        function parse(s){ if(!s) return null; const m=s.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(x=>parseFloat(x.trim())); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; }
        function effBg(el){
          let n = el;
          while(n){ const cs=getComputedStyle(n); const c=parse(cs.backgroundColor); if(c && c.a>0.01) return {color:c, from:n.getAttribute('data-testid')||n.className||n.tagName}; n=n.parentElement; }
          const bc=parse(getComputedStyle(document.body).backgroundColor); return {color: bc&&bc.a>0.01?bc:{r:255,g:255,b:255,a:1}, from:'body'};
        }
        const results = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const seen = new Set();
        let node;
        while((node = walker.nextNode())){
          const txt = node.textContent.trim();
          if(!txt || txt.length < 1) continue;
          const el = node.parentElement;
          if(!el) continue;
          const rect = el.getBoundingClientRect();
          if(rect.width<2 || rect.height<2) continue;
          const cs = getComputedStyle(el);
          if(cs.visibility==='hidden' || cs.display==='none' || parseFloat(cs.opacity)<0.05) continue;
          const key = el.getAttribute('data-testid')||'' ; const id2 = (key||el.className||el.tagName)+'|'+txt.slice(0,30);
          if(seen.has(id2)) continue; seen.add(id2);
          const fg = parse(cs.color); if(!fg) continue;
          const bgInfo = effBg(el);
          results.push({
            text: txt.slice(0,50),
            fg: cs.color, bg: bgInfo.from ? (typeof bgInfo.from==='string'?bgInfo.from:'') : '',
            fgRGBA: fg, bgRGBA: bgInfo.color, bgFrom: (''+bgInfo.from).slice(0,40),
            fontSize: parseFloat(cs.fontSize), fontWeight: cs.fontWeight,
            testid: key, tag: el.tagName
          });
        }
        return results;
      });
      for (const c of contrastData) {
        const fg = c.fgRGBA, bg = c.bgRGBA;
        const eff = fg.a < 1 ? over(fg, bg) : fg;
        const cr = ratio(eff, bg);
        const big = c.fontSize >= 24 || (c.fontSize >= 18.66 && (c.fontWeight === '700' || c.fontWeight === 'bold' || parseInt(c.fontWeight) >= 700));
        const thresh = big ? 3.0 : 4.5;
        if (cr < thresh) {
          r.contrast.push({ text: c.text, fg: c.fg, bg: `${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)} (${c.bgFrom})`, ratio: +cr.toFixed(2), thresh, fontSize: c.fontSize, weight: c.fontWeight, testid: c.testid });
        }
      }

      // ---- overflow / clipping scan within widget ----
      const overflow = await widget.evaluate((root) => {
        const rootRect = root.getBoundingClientRect();
        const issues = [];
        const els = root.querySelectorAll('*');
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // horizontal overflow beyond widget right edge by >2px
          if (r.right > rootRect.right + 2) {
            const t = (el.getAttribute('data-testid')||el.className||el.tagName)+'';
            issues.push({ kind:'overflow-x', el: t.slice(0,40), overBy: +(r.right - rootRect.right).toFixed(1) });
          }
        }
        // dedupe by el
        const seen = new Set(); const out=[];
        for(const i of issues){ if(seen.has(i.el)) continue; seen.add(i.el); out.push(i);}
        return { rootW: +rootRect.width.toFixed(1), scrollW: root.scrollWidth, clientW: root.clientWidth, issues: out.slice(0,15) };
      });
      if (overflow.scrollW > overflow.clientW + 2) r.alignment.push(`widget scrollWidth ${overflow.scrollW} > clientWidth ${overflow.clientW} (horizontal overflow)`);
      for (const i of overflow.issues) r.alignment.push(`${i.kind}: ${i.el} extends ${i.overBy}px past widget edge`);

      // try to interact: click first multiselect / option to reach result, screenshot result panel
      try {
        const resultPanel = widget.locator('[data-testid="advanced-result-panel"]').first();
        if (await resultPanel.count()) {
          await resultPanel.scrollIntoViewIfNeeded();
          await page.waitForTimeout(400);
          const rshot = `${OUT}/${id}__${vp.name}__result.png`;
          await resultPanel.screenshot({ path: rshot }).catch(()=>{});
          if (fs.existsSync(rshot)) r.shots.push(rshot);
          // contrast on result panel too
          const rc = await resultPanel.evaluate((root)=>{
            function parse(s){ if(!s) return null; const m=s.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(x=>parseFloat(x.trim())); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; }
            function effBg(el){ let n=el; while(n){ const c=parse(getComputedStyle(n).backgroundColor); if(c&&c.a>0.01) return c; n=n.parentElement;} return {r:255,g:255,b:255,a:1}; }
            const out=[]; const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT); let n; const seen=new Set();
            while((n=w.nextNode())){ const t=n.textContent.trim(); if(!t) continue; const el=n.parentElement; if(!el) continue; const cs=getComputedStyle(el); if(cs.visibility==='hidden'||cs.display==='none') continue; const r=el.getBoundingClientRect(); if(r.width<2) continue; const k=(el.getAttribute('data-testid')||el.className)+'|'+t.slice(0,20); if(seen.has(k)) continue; seen.add(k); out.push({text:t.slice(0,40), fg:cs.color, fgRGBA:parse(cs.color), bgRGBA:effBg(el), fontSize:parseFloat(cs.fontSize), weight:cs.fontWeight, testid:el.getAttribute('data-testid')||''}); }
            return out;
          });
          for(const c of rc){ if(!c.fgRGBA) continue; const eff=c.fgRGBA.a<1?over(c.fgRGBA,c.bgRGBA):c.fgRGBA; const cr=ratio(eff,c.bgRGBA); const big=c.fontSize>=24||(c.fontSize>=18.66&&parseInt(c.weight)>=700); const th=big?3:4.5; if(cr<th){ r.contrast.push({ text:c.text, fg:c.fg, bg:`${Math.round(c.bgRGBA.r)},${Math.round(c.bgRGBA.g)},${Math.round(c.bgRGBA.b)}`, ratio:+cr.toFixed(2), thresh:th, fontSize:c.fontSize, weight:c.weight, testid:c.testid, where:'result-panel' }); } }
        }
      } catch(e) { r.note += ' result-scan-err:'+e.message.slice(0,60); }

    } catch (e) {
      r.note = 'ERROR: ' + e.message.slice(0, 120);
    }
    report[id][vp.name] = r;
    await browser.close();
  }
}

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
