import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/g1';
const BASE = 'http://localhost:5099';
const TEMPLATES = ['car_towing','driveway_paving','property_cleaning','energy_upgrade','landscaping'];

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  mobile: { width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

function parseColor(s){ if(!s) return null; const m=s.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(x=>parseFloat(x.trim())); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; }
function lum(c){ const f=v=>{v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}; return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); }
function over(fg,bg){ const a=fg.a; return {r:fg.r*a+bg.r*(1-a),g:fg.g*a+bg.g*(1-a),b:fg.b*a+bg.b*(1-a),a:1}; }
function ratio(fg,bg){ const L1=lum(fg),L2=lum(bg),hi=Math.max(L1,L2),lo=Math.min(L1,L2); return (hi+0.05)/(lo+0.05); }
function score(t){ const fg=parseColor(t.color),bgr=parseColor(t.bg); if(!fg||!bgr) return null; const white={r:255,g:255,b:255,a:1}; const bgc=bgr.a<1?over(bgr,white):bgr; const fgc=fg.a<1?over(fg,bgc):fg; const cr=ratio(fgc,bgc); const large=t.fontSize>=18||(t.fontSize>=14&&(t.fontWeight==='bold'||parseInt(t.fontWeight)>=700)); return {cr, threshold: large?3.0:4.5}; }

// pick the largest advanced-calculator (the real live widget) and mark it
const MARK = () => {
  const els=[...document.querySelectorAll('[data-testid="advanced-calculator"]')];
  let best=null,bw=0;
  for(const e of els){ const r=e.getBoundingClientRect(); if(r.width>bw){bw=r.width; best=e;} }
  if(best) best.setAttribute('data-audit-target','1');
  return bw;
};

const EXTRACT = () => {
  const root=document.querySelector('[data-audit-target="1"]');
  if(!root) return [];
  const res=[];
  function effBg(el){ let n=el; while(n){ const cs=getComputedStyle(n); const m=cs.backgroundColor&&cs.backgroundColor.match(/rgba?\(([^)]+)\)/); if(m){const p=m[1].split(',').map(x=>parseFloat(x.trim())); const a=p.length>3?p[3]:1; if(a>0.01) return cs.backgroundColor;} n=n.parentElement; } return 'rgb(255,255,255)'; }
  for(const el of root.querySelectorAll('*')){
    let txt=''; for(const n of el.childNodes) if(n.nodeType===3) txt+=n.textContent; txt=txt.trim();
    if(!txt) continue;
    if(txt.startsWith('/*')||txt.includes('Wave AC')) continue; // skip injected comments
    const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)<0.1) continue;
    const r=el.getBoundingClientRect(); if(r.width<1||r.height<1) continue;
    res.push({text:txt.slice(0,60),color:cs.color,bg:effBg(el),fontSize:parseFloat(cs.fontSize),fontWeight:cs.fontWeight,tag:el.tagName.toLowerCase(),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)});
  }
  return res;
};

const OVERFLOW = () => {
  const root=document.querySelector('[data-audit-target="1"]'); if(!root) return [];
  const rb=root.getBoundingClientRect(); const out=[];
  for(const el of root.querySelectorAll('*')){
    const r=el.getBoundingClientRect(); if(r.width===0||r.height===0) continue;
    if(r.right>rb.right+2||r.left<rb.left-2){ const t=(el.textContent||'').trim().slice(0,40); out.push({tag:el.tagName.toLowerCase(),cls:(el.className&&el.className.toString().slice(0,40))||'',elRight:Math.round(r.right),elLeft:Math.round(r.left),wRight:Math.round(rb.right),wLeft:Math.round(rb.left),text:t}); }
  }
  const seen=new Set();
  return out.filter(i=>{const k=i.tag+i.cls+i.elRight+i.elLeft; if(seen.has(k))return false; seen.add(k); return true;});
};

function dedup(arr){ const m=new Map(); for(const c of arr){ const k=c.text+'|'+c.color+'|'+c.bg+'|'+c.viewport; if(!m.has(k)) m.set(k,c);} return [...m.values()]; }

const report={};
const browser=await chromium.launch();
for(const tpl of TEMPLATES){
  report[tpl]={rendered:{},layout:{},contrast:[],overflow:[],notes:[]};
  for(const [vp,cfg] of Object.entries(VIEWPORTS)){
    const ctx=await browser.newContext({viewport:{width:cfg.width,height:cfg.height},isMobile:cfg.isMobile,hasTouch:cfg.hasTouch,deviceScaleFactor:cfg.deviceScaleFactor});
    const page=await ctx.newPage();
    await page.goto(`${BASE}/templates/${tpl}`,{waitUntil:'domcontentloaded',timeout:30000}).catch(e=>report[tpl].notes.push(`${vp}: goto ${e.message.slice(0,50)}`));
    let ok=false; try{ await page.waitForSelector('[data-testid="advanced-calculator"]',{timeout:15000,state:'attached'}); ok=true; }catch{}
    await page.waitForTimeout(2500);
    const bw=await page.evaluate(MARK);
    report[tpl].rendered[vp]= ok && bw>300;
    report[tpl].layout[vp]=`widget width ${Math.round(bw)}px`;
    if(!report[tpl].rendered[vp]){ await page.screenshot({path:path.join(OUT,`x_${tpl}_${vp}_BLOCKER.png`)}); await ctx.close(); continue; }

    const widget=await page.$('[data-audit-target="1"]');
    try{ await widget.scrollIntoViewIfNeeded(); }catch{}
    await page.waitForTimeout(500);
    // full widget screenshot
    try{ await widget.screenshot({path:path.join(OUT,`w_${tpl}_${vp}.png`)}); }
    catch(e){ const bb=await widget.boundingBox(); await page.screenshot({path:path.join(OUT,`w_${tpl}_${vp}.png`),clip:bb}); }

    // contrast + overflow
    const texts=await page.evaluate(EXTRACT);
    for(const t of texts){ const s=score(t); if(s&&s.cr<s.threshold) report[tpl].contrast.push({viewport:vp,text:t.text,color:t.color,bg:t.bg,ratio:Math.round(s.cr*100)/100,fontSize:t.fontSize,weight:t.fontWeight,threshold:s.threshold,tag:t.tag,screenshot:`w_${tpl}_${vp}.png`}); }
    const ov=await page.evaluate(OVERFLOW);
    for(const o of ov) report[tpl].overflow.push({viewport:vp,...o,screenshot:`w_${tpl}_${vp}.png`});

    await ctx.close();
  }
  report[tpl].contrast=dedup(report[tpl].contrast);
}
await browser.close();
fs.writeFileSync(path.join(OUT,'report3.json'),JSON.stringify(report,null,2));
for(const [t,d] of Object.entries(report)){
  console.log(`\n=== ${t} ===  rendered=${JSON.stringify(d.rendered)}  layout=${JSON.stringify(d.layout)}`);
  console.log('contrast:',d.contrast.length);
  for(const c of d.contrast) console.log(`  [${c.viewport}] "${c.text}" ${c.color} on ${c.bg} = ${c.ratio}:1 (need ${c.threshold}) ${c.fontSize}px/${c.weight}`);
  console.log('overflow:',d.overflow.length);
  for(const o of d.overflow) console.log(`  [${o.viewport}] <${o.tag} ${o.cls}> "${o.text}" elR=${o.elRight} wR=${o.wRight} elL=${o.elLeft} wL=${o.wLeft}`);
  if(d.notes.length) console.log('notes:',d.notes.join(' | '));
}
console.log('\nDONE');
