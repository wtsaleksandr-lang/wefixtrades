import { chromium } from 'playwright';
import fs from 'fs';

const OUT = String.raw`C:\Users\Owner\.codex\wt-preview\_vr7`;
const BASE = 'http://localhost:5099/templates/';

const TEMPLATES = [
  'window_replacement_quote',
  'plumbing_service',
  'bathroom_renovation',
  'solar_panel_install',
  'deep_home_cleaning',
  'pressure_washing_quote',
];

function parseRGB(s){
  if(!s) return null;
  const m = s.match(/rgba?\(([^)]+)\)/); if(!m) return null;
  const p = m[1].split(',').map(x=>parseFloat(x.trim()));
  return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};
}
function lum({r,g,b}){
  const f=c=>{c/=255; return c<=0.03928? c/12.92 : Math.pow((c+0.055)/1.055,2.4);};
  return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);
}
function ratio(fg,bg){
  const L1=lum(fg),L2=lum(bg);
  return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
}
function compositeOver(fg,bg){
  const a=fg.a;
  return {r: fg.r*a+bg.r*(1-a), g: fg.g*a+bg.g*(1-a), b: fg.b*a+bg.b*(1-a), a:1};
}
function toHex({r,g,b}){
  const h=n=>Math.round(n).toString(16).padStart(2,'0');
  return '#'+h(r)+h(g)+h(b);
}
function isDark(c){ return lum(c) < 0.5; } // luminance<0.5 -> dark bg -> expect white text

async function fillToPopulate(page, widget){
  // Click option buttons (radio-like groups) and set sliders/numbers/selects
  // to force the result panel to populate. We do this generically.
  await page.evaluate((w)=>{
    // 1) radio-like button groups: click 2nd option in each group of >=2 short buttons
    const btns=[...w.querySelectorAll('button')].filter(b=>{
      const role=b.getAttribute('role')||'';
      if(role==='combobox') return false;
      const tid=b.getAttribute('data-testid')||'';
      if(tid.startsWith('advanced-cta')) return false;
      const t=(b.textContent||'').trim();
      return t && t.length<=40;
    });
    const byParent=new Map();
    for(const b of btns){ const p=b.parentElement; if(!byParent.has(p)) byParent.set(p,[]); byParent.get(p).push(b); }
    for(const [,arr] of byParent){ if(arr.length>=2){ arr[0].click(); } }
  }, widget);
  await page.waitForTimeout(200);

  // 2) number inputs & range sliders
  const inputs = await widget.$$('input');
  for(const inp of inputs){
    try{
      const type = await inp.getAttribute('type');
      if(type==='range'){
        const max = await inp.getAttribute('max');
        const min = await inp.getAttribute('min');
        const val = max ? String(Math.round((parseFloat(min||'0')+parseFloat(max))/2)) : '5';
        await inp.evaluate((el,v)=>{ const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; setter.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }, val);
      } else if(type==='number' || type==='text'){
        const tid = (await inp.getAttribute('data-testid'))||'';
        if(tid.startsWith('advanced-cta')) continue;
        if(type==='number'){
          await inp.evaluate((el)=>{ const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; setter.call(el,'10'); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); });
        }
      }
    }catch(e){}
  }
  await page.waitForTimeout(300);

  // 3) native selects: pick a non-empty option
  const selects = await widget.$$('select');
  for(const s of selects){
    try{
      await s.evaluate(el=>{ for(const o of el.options){ if(o.value){ el.value=o.value; el.dispatchEvent(new Event('change',{bubbles:true})); break; } } });
    }catch(e){}
  }
  await page.waitForTimeout(400);

  // 4) click any "Calculate"/"Get"/"See" submit-ish button (not CTA) if present to advance to result
  await page.evaluate((w)=>{
    const btns=[...w.querySelectorAll('button')];
    const re=/calculate|get .*quote|see .*estimate|view .*result|continue|next|estimate/i;
    for(const b of btns){
      const tid=b.getAttribute('data-testid')||'';
      if(tid.startsWith('advanced-cta')) continue;
      if(re.test((b.textContent||''))){ b.click(); return; }
    }
  }, widget);
  await page.waitForTimeout(800);
}

// Walk every text-bearing leaf element inside the panel; measure color vs composited bg.
async function measurePanel(page, panelSel){
  return await page.evaluate((sel)=>{
    function parseRGB(s){ if(!s) return null; const m=s.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(x=>parseFloat(x.trim())); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; }
    const panel=document.querySelector(sel);
    if(!panel) return {error:'no panel'};
    // composited panel bg: walk up stacking transparent layers over white
    function compositedBgOf(el){
      const stack=[]; let cur=el;
      while(cur){ const s=getComputedStyle(cur); const bg=s.backgroundColor; if(bg && bg!=='rgba(0, 0, 0, 0)' && bg!=='transparent'){ const c=parseRGB(bg); if(c) stack.push(c);} cur=cur.parentElement; }
      let out={r:255,g:255,b:255,a:1};
      for(let i=stack.length-1;i>=0;i--){ const f=stack[i]; const a=f.a; out={r:f.r*a+out.r*(1-a),g:f.g*a+out.g*(1-a),b:f.b*a+out.b*(1-a),a:1}; }
      return out;
    }
    const panelBg = compositedBgOf(panel);
    // collect text leaves: elements with a direct non-empty text node
    const nodes=[];
    const all=panel.querySelectorAll('*');
    function directText(el){
      let t='';
      for(const n of el.childNodes){ if(n.nodeType===3) t+=n.textContent; }
      return t.trim();
    }
    function describe(el){
      // role label
      const tid = el.getAttribute('data-testid')||'';
      const tag = el.tagName.toLowerCase();
      return tid || tag;
    }
    const seen=[];
    for(const el of all){
      const t = directText(el);
      if(!t) continue;
      const r=el.getBoundingClientRect();
      if(r.width===0||r.height===0) continue;
      const cs=getComputedStyle(el);
      if(cs.visibility==='hidden'||cs.display==='none') continue;
      // is it inside the CTA button? still measure but tag it
      const inCta = !!el.closest('[data-testid^="advanced-cta"]');
      const fontSize=parseFloat(cs.fontSize);
      const fontWeight=parseInt(cs.fontWeight)||400;
      // bg for THIS element (composite up) — captures inner pills/badges
      const bg=compositedBgOf(el);
      seen.push({
        role: describe(el),
        inCta,
        text: t.slice(0,40),
        color: cs.color,
        fontSize, fontWeight,
        bg: {r:Math.round(bg.r),g:Math.round(bg.g),b:Math.round(bg.b)},
      });
    }
    return { panelBg:{r:Math.round(panelBg.r),g:Math.round(panelBg.g),b:Math.round(panelBg.b)}, nodes:seen };
  }, panelSel);
}

async function run(){
  const browser = await chromium.launch();
  const results = {};
  for(const tpl of TEMPLATES){
    const page = await browser.newPage({ viewport:{width:1440,height:900} });
    const res = { template: tpl };
    try{
      await page.goto(BASE+tpl, {waitUntil:'domcontentloaded', timeout:60000});
      await page.waitForSelector('[data-testid="advanced-calculator"]', {timeout:25000});
      await page.waitForTimeout(1500);
      // scope to largest widget; tag it
      await page.evaluate(()=>{
        const els=[...document.querySelectorAll('[data-testid="advanced-calculator"]')];
        els.sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width);
        els.forEach((e,i)=> e.setAttribute('data-vr7-widget', i===0?'real':'thumb'));
      });
      const widget = await page.$('[data-vr7-widget="real"]');
      const wbox = await widget.boundingBox();
      res.widgetWidth = wbox ? Math.round(wbox.width) : null;

      // fill
      await fillToPopulate(page, widget);

      // wait for result panel within the real widget
      const panelSel = '[data-vr7-widget="real"] [data-testid="advanced-result-panel"]';
      let panelExists = await page.$(panelSel);
      if(!panelExists){
        // try again with more aggressive fill
        await fillToPopulate(page, widget);
        await page.waitForTimeout(600);
        panelExists = await page.$(panelSel);
      }
      if(!panelExists){
        res.error = 'result panel did not populate';
        results[tpl]=res; await page.close(); continue;
      }
      await page.waitForTimeout(700); // allow count-up animation to settle

      const meas = await measurePanel(page, panelSel);
      if(meas.error){ res.error=meas.error; results[tpl]=res; await page.close(); continue; }

      const panelBgC = meas.panelBg;
      res.panelBgHex = toHex(panelBgC);
      res.panelIsDark = isDark(panelBgC);

      // evaluate each node
      const evalNode = (n)=>{
        const fg = parseRGB(n.color);
        const bg = n.bg; // already composited for this node
        const fgc = fg.a<1 ? compositeOver(fg,bg) : fg;
        const cr = ratio(fgc, bg);
        const large = (n.fontSize>=24) || (n.fontSize>=18.66 && n.fontWeight>=700);
        const isBigPrice = n.role==='advanced-result' && n.fontSize>=24;
        const threshold = isBigPrice ? 3.0 : (large ? 3.0 : 4.5);
        // For strict reporting we record both
        return {
          role:n.role, inCta:n.inCta, text:n.text,
          color:n.color, fontSize:n.fontSize, fontWeight:n.fontWeight,
          bgHex: toHex(bg),
          fgIsWhiteish: (fgc.r>200&&fgc.g>200&&fgc.b>200),
          ratio:+cr.toFixed(2), large, isBigPrice, threshold,
          pass: cr>=threshold,
          passStrict: cr>=4.5,
        };
      };
      const panelNodes = meas.nodes.filter(n=>!n.inCta).map(evalNode);
      const ctaNodes = meas.nodes.filter(n=>n.inCta).map(evalNode);

      res.panelNodes = panelNodes;
      res.ctaNodes = ctaNodes;

      // min ratio among panel text nodes
      const minPanel = panelNodes.length ? Math.min(...panelNodes.map(n=>n.ratio)) : null;
      res.minPanelRatio = minPanel;
      const panelFails = panelNodes.filter(n=>!n.pass);
      res.panelPass = panelFails.length===0 && panelNodes.length>0;
      res.panelFailures = panelFails.map(n=>({role:n.role,text:n.text,ratio:n.ratio,thr:n.threshold,color:n.color,bg:n.bgHex}));

      // are panel texts white-ish?
      const whiteCount = panelNodes.filter(n=>n.fgIsWhiteish).length;
      res.whiteTextPreserved = whiteCount > 0 && (whiteCount >= panelNodes.length*0.5);

      // CTA
      const ctaBtn = await page.$('[data-vr7-widget="real"] [data-testid="advanced-cta"]');
      if(ctaBtn){
        const ctaInfo = await ctaBtn.evaluate((el)=>{
          function parseRGB(s){ if(!s) return null; const m=s.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(x=>parseFloat(x.trim())); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; }
          function compositedBgOf(el){ const stack=[]; let cur=el; while(cur){ const s=getComputedStyle(cur); const bg=s.backgroundColor; if(bg && bg!=='rgba(0, 0, 0, 0)' && bg!=='transparent'){ const c=parseRGB(bg); if(c) stack.push(c);} cur=cur.parentElement; } let out={r:255,g:255,b:255,a:1}; for(let i=stack.length-1;i>=0;i--){ const f=stack[i]; const a=f.a; out={r:f.r*a+out.r*(1-a),g:f.g*a+out.g*(1-a),b:f.b*a+out.b*(1-a),a:1}; } return out; }
          const cs=getComputedStyle(el);
          const bg=compositedBgOf(el);
          return { color:cs.color, bg:{r:Math.round(bg.r),g:Math.round(bg.g),b:Math.round(bg.b)}, fontSize:parseFloat(cs.fontSize), fontWeight:parseInt(cs.fontWeight)||400, text:(el.textContent||'').trim().slice(0,30), bgImage: cs.backgroundImage };
        });
        const fg=parseRGB(ctaInfo.color);
        const bg=ctaInfo.bg;
        const fgc=fg.a<1?compositeOver(fg,bg):fg;
        const cr=ratio(fgc,bg);
        const large=(ctaInfo.fontSize>=24)||(ctaInfo.fontSize>=18.66&&ctaInfo.fontWeight>=700);
        const thr=large?3.0:4.5;
        res.cta={ text:ctaInfo.text, color:ctaInfo.color, bgHex:toHex(bg), ratio:+cr.toFixed(2), fontSize:ctaInfo.fontSize, fontWeight:ctaInfo.fontWeight, large, threshold:thr, pass:cr>=thr, bgImage: ctaInfo.bgImage!=='none'? 'gradient':'solid' };
      } else {
        res.cta={ note:'no CTA button rendered' };
      }

      res.overallPass = res.panelPass && (res.cta?res.cta.pass!==false:true);

      // screenshot panel (desktop)
      const panel = await page.$(panelSel);
      const dShot = `${OUT}\\${tpl}_panel_desktop.png`;
      await panel.screenshot({path:dShot}).catch(async()=>{ await page.screenshot({path:dShot}); });
      res.screenshots=[dShot];

      // mobile shot if any failure
      if(!res.overallPass){
        const mp = await browser.newPage({ viewport:{width:375,height:812}, isMobile:true, hasTouch:true });
        await mp.goto(BASE+tpl, {waitUntil:'domcontentloaded', timeout:60000});
        await mp.waitForSelector('[data-testid="advanced-calculator"]', {timeout:25000}).catch(()=>{});
        await mp.waitForTimeout(1500);
        await mp.evaluate(()=>{ const els=[...document.querySelectorAll('[data-testid="advanced-calculator"]')]; els.sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width); els.forEach((e,i)=> e.setAttribute('data-vr7-widget', i===0?'real':'thumb')); });
        const mw = await mp.$('[data-vr7-widget="real"]');
        if(mw){ await fillToPopulate(mp, mw); }
        await mp.waitForTimeout(700);
        const mPanel = await mp.$('[data-vr7-widget="real"] [data-testid="advanced-result-panel"]');
        const mShot = `${OUT}\\${tpl}_panel_mobile.png`;
        if(mPanel){ await mPanel.screenshot({path:mShot}).catch(async()=>{ await mp.screenshot({path:mShot,fullPage:true}); }); }
        else { await mp.screenshot({path:mShot,fullPage:true}); }
        res.screenshots.push(mShot);
        await mp.close();
      }
    }catch(e){
      res.error = (e.message||String(e)).slice(0,200);
    }
    results[tpl]=res;
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(`${OUT}\\results.json`, JSON.stringify(results,null,2));

  // concise console summary
  for(const tpl of TEMPLATES){
    const r=results[tpl];
    if(r.error){ console.log(`\n${tpl}: ERROR — ${r.error}`); continue; }
    console.log(`\n${tpl}: ${r.overallPass?'PASS':'FAIL'}`);
    console.log(`  panelBg=${r.panelBgHex} dark=${r.panelIsDark} whiteText=${r.whiteTextPreserved}`);
    console.log(`  minPanelRatio=${r.minPanelRatio}  panelPass=${r.panelPass}`);
    if(r.panelFailures && r.panelFailures.length){ console.log(`  FAILURES: ${JSON.stringify(r.panelFailures)}`); }
    if(r.cta){ console.log(`  CTA: bg=${r.cta.bgHex} ratio=${r.cta.ratio} pass=${r.cta.pass} (${r.cta.bgImage||''})`); }
  }
}
run().catch(e=>{ console.error('FATAL', e); process.exit(1); });
