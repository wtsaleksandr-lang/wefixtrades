import { chromium } from 'playwright';

const base = 'http://localhost:5099';
const TEMPLATES = ['plumbing_service','electrical_work','ev_charger_install','lawn_care_subscription','concrete_driveway_replacement'];
const OUT = '_audit/g5';

// ---- contrast helpers ----
function parseRGB(s){
  if(!s) return null;
  const m = s.match(/rgba?\(([^)]+)\)/);
  if(!m) return null;
  const p = m[1].split(',').map(x=>parseFloat(x.trim()));
  return { r:p[0], g:p[1], b:p[2], a: p[3]===undefined?1:p[3] };
}
function lum({r,g,b}){
  const f = c => { c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); };
  return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);
}
function ratio(fg,bg){
  const L1=lum(fg), L2=lum(bg);
  const a=Math.max(L1,L2), b=Math.min(L1,L2);
  return (a+0.05)/(b+0.05);
}
function over(fg, bg){ // composite fg (with alpha) over bg(opaque)
  const a = fg.a;
  return { r: fg.r*a + bg.r*(1-a), g: fg.g*a + bg.g*(1-a), b: fg.b*a + bg.b*(1-a), a:1 };
}

const browser = await chromium.launch();
const report = {};

for (const id of TEMPLATES){
  report[id] = { desktop:{}, mobile:{} };
  for (const vp of [{name:'desktop',width:1440,height:900,mobile:false},{name:'mobile',width:375,height:812,mobile:true}]){
    const ctx = await browser.newContext({ viewport:{width:vp.width,height:vp.height}, isMobile:vp.mobile, hasTouch:vp.mobile, deviceScaleFactor: vp.mobile?2:1 });
    const page = await ctx.newPage();
    const r = report[id][vp.name];
    try{
      await page.goto(`${base}/templates/${id}`, { waitUntil:'domcontentloaded', timeout:45000 });
      await page.waitForTimeout(2800);
      await page.waitForSelector('.qq-widget-0', { timeout:15000 });

      // pick primary widget = widest qq-widget-0
      const handle = await page.evaluateHandle(()=>{
        const ws=[...document.querySelectorAll('.qq-widget-0')];
        let best=null,bw=-1;
        for(const w of ws){ const r=w.getBoundingClientRect(); if(r.width>bw){bw=r.width;best=w;} }
        if(best) best.setAttribute('data-audit-primary','1');
        return best;
      });
      const el = handle.asElement();
      if(!el){ r.blocker='no widget'; await ctx.close(); continue; }

      const box = await el.boundingBox();
      r.widget = box ? {w:Math.round(box.width),h:Math.round(box.height)} : null;
      r.rendered = !!box && box.width>50 && box.height>50;

      // scroll into view & screenshot widget
      await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const shot1 = `${OUT}/${id}-${vp.name}-1.png`;
      await el.screenshot({ path: shot1 }).catch(async()=>{ await page.screenshot({path:shot1}); });
      r.shots=[shot1];

      // ---- contrast scan: all text nodes inside primary widget ----
      const contrast = await page.evaluate(()=>{
        const root = document.querySelector('[data-audit-primary]');
        if(!root) return [];
        const findBg = (el)=>{
          let n=el;
          while(n){
            const c=getComputedStyle(n).backgroundColor;
            const m=c&&c.match(/rgba?\(([^)]+)\)/);
            if(m){ const p=m[1].split(',').map(x=>parseFloat(x)); const a=p[3]===undefined?1:p[3]; if(a>0.01) return {r:p[0],g:p[1],b:p[2],a}; }
            n=n.parentElement;
          }
          // fall to body bg
          const bc=getComputedStyle(document.body).backgroundColor;
          const bm=bc&&bc.match(/rgba?\(([^)]+)\)/);
          if(bm){const p=bm[1].split(',').map(x=>parseFloat(x));return {r:p[0],g:p[1],b:p[2],a:1};}
          return {r:255,g:255,b:255,a:1};
        };
        const out=[];
        const walker=document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const seen=new Set();
        let node;
        while(node=walker.nextNode()){
          const t=node.textContent.trim();
          if(!t || t.length<1) continue;
          const el=node.parentElement;
          if(!el) continue;
          const rect=el.getBoundingClientRect();
          if(rect.width<1||rect.height<1) continue;
          const cs=getComputedStyle(el);
          if(cs.visibility==='hidden'||cs.display==='none'||parseFloat(cs.opacity)===0) continue;
          const key=el.tagName+'|'+t.slice(0,30)+'|'+Math.round(rect.top);
          if(seen.has(key)) continue; seen.add(key);
          out.push({
            text: t.slice(0,45),
            color: cs.color,
            bg: findBg(el),
            fontSize: parseFloat(cs.fontSize),
            fontWeight: cs.fontWeight,
            tag: el.tagName
          });
        }
        return out;
      });

      // compute ratios
      const defects=[];
      for(const c of contrast){
        const fg=parseRGB(c.color); if(!fg) continue;
        let bg = c.bg;
        if(fg.a<1){ // composite text alpha over bg
          const comp = over(fg, bg);
          var R = ratio(comp, bg);
        } else {
          var R = ratio(fg, bg);
        }
        const big = c.fontSize>=24 || (c.fontSize>=18.66 && parseInt(c.fontWeight)>=700);
        const thresh = big?3:4.5;
        if(R < thresh){
          defects.push({ text:c.text, fg:c.color, bg:`rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`, ratio:+R.toFixed(2), size:c.fontSize, weight:c.fontWeight, thresh });
        }
      }
      r.contrast = defects;

      // ---- alignment / overflow scan ----
      const align = await page.evaluate(()=>{
        const root=document.querySelector('[data-audit-primary]');
        const rb=root.getBoundingClientRect();
        const issues=[];
        // overflow beyond widget bounds
        const all=root.querySelectorAll('*');
        let maxRight=0, minLeft=Infinity, overflowCount=0;
        for(const el of all){
          const r=el.getBoundingClientRect();
          if(r.width===0||r.height===0) continue;
          if(r.right > rb.right + 2){ overflowCount++; if(r.right>maxRight)maxRight=r.right; }
        }
        // horizontal scroll inside widget?
        issues.push({ scrollW: root.scrollWidth, clientW: Math.round(rb.width), hOverflow: root.scrollWidth - Math.round(rb.width) });
        if(overflowCount>0) issues.push({ overflowElems: overflowCount, maxRight:Math.round(maxRight), widgetRight:Math.round(rb.right) });
        return issues;
      });
      r.align = align;
      r.docScroll = await page.evaluate(()=>({ bodyScrollW: document.body.scrollWidth, winW: window.innerWidth }));

      // ---- interact: try clicking through to ensure result visible; capture a 2nd state ----
      // Most widgets are single-screen (fields + live result). Capture result panel separately if exists.
      const resHandle = await page.$('[data-audit-primary] [class$="-result"]');
      if(resHandle){
        const shot2 = `${OUT}/${id}-${vp.name}-result.png`;
        await resHandle.screenshot({path:shot2}).catch(()=>{});
        r.shots.push(shot2);
      }
      // try a couple of option clicks to surface selection-state contrast, then re-screenshot
      try{
        const opts = await page.$$('[data-audit-primary] button');
        if(opts.length>1){
          await opts[Math.min(2,opts.length-1)].click({timeout:2000}).catch(()=>{});
          await page.waitForTimeout(400);
          const shot3=`${OUT}/${id}-${vp.name}-2.png`;
          await el.screenshot({path:shot3}).catch(()=>{});
          r.shots.push(shot3);
        }
      }catch{}

    }catch(e){
      r.blocker = (e.message||String(e)).slice(0,160);
    }
    await ctx.close();
  }
}

console.log(JSON.stringify(report,null,2));
await browser.close();
