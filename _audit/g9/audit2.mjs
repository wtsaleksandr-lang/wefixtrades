import { chromium } from 'playwright';
import fs from 'fs';

const OUT='C:/Users/Owner/.codex/wt-preview/_audit/g9';
const BASE='http://localhost:5099/templates';
const TEMPLATES=['appliance_repair','junk_removal_quote','window_replacement_quote','carpet_cleaning_quote','mold_remediation_quote'];
const VIEWPORTS={ desktop:{width:1440,height:900,isMobile:false,hasTouch:false}, mobile:{width:375,height:812,isMobile:true,hasTouch:true} };

function parseRGB(s){if(!s)return null;const m=s.match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(x=>parseFloat(x.trim()));return{r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};}
function lum({r,g,b}){const f=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);}
function ratio(fg,bg){const L1=lum(fg),L2=lum(bg);const hi=Math.max(L1,L2),lo=Math.min(L1,L2);return(hi+0.05)/(lo+0.05);}

// pick the LARGEST element matching widget classes (the live interactive widget, not mini preview cards)
const FIND_BOX=()=>{
  const cands=[...document.querySelectorAll('[class*="qq-widget"], [data-testid*="alculator"], [class*="alculator"]')];
  let best=null,bestA=0;
  for(const el of cands){const r=el.getBoundingClientRect();const a=r.width*r.height;if(a>bestA && r.width>250 && r.height>200){bestA=a;best=el;}}
  if(!best){ // fallback: any large element containing a $ price
    document.querySelectorAll('div,section').forEach(el=>{const t=el.textContent||'';if(/\$\d/.test(t)){const r=el.getBoundingClientRect();const a=r.width*r.height;if(a>bestA&&r.width>250&&r.width<1100&&r.height>200){bestA=a;best=el;}}});
  }
  if(!best)return null;
  best.setAttribute('data-audit-widget','1');
  const r=best.getBoundingClientRect();
  return {x:r.x,y:r.y,w:r.width,h:r.height};
};

const COLLECT=()=>{
  function effBg(el){let e=el;while(e){const cs=getComputedStyle(e);const m=cs.backgroundColor.match(/rgba?\(([^)]+)\)/);if(m){const p=m[1].split(',').map(x=>parseFloat(x.trim()));const a=p.length>3?p[3]:1;if(a>0.1)return cs.backgroundColor;}e=e.parentElement;}return 'rgb(255,255,255)';}
  const w=document.querySelector('[data-audit-widget="1"]')||document.body;
  const out=[];
  w.querySelectorAll('*').forEach(el=>{
    const txt=Array.from(el.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim();
    if(!txt)return;
    const r=el.getBoundingClientRect();if(r.width<2||r.height<2)return;
    const cs=getComputedStyle(el);
    if(cs.visibility==='hidden'||cs.display==='none'||parseFloat(cs.opacity)<0.1)return;
    out.push({tag:el.tagName.toLowerCase(),cls:(el.className&&el.className.toString().slice(0,50))||'',text:txt.slice(0,45),color:cs.color,bg:effBg(el),fontSize:parseFloat(cs.fontSize),fontWeight:cs.fontWeight,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)});
  });
  return out;
};

// detect overflow/clipping inside widget
const LAYOUT=()=>{
  const w=document.querySelector('[data-audit-widget="1"]');if(!w)return null;
  const wb=w.getBoundingClientRect();
  const issues=[];
  w.querySelectorAll('*').forEach(el=>{
    const r=el.getBoundingClientRect();const cs=getComputedStyle(el);
    if(r.width<1||r.height<1)return;
    // horizontal overflow beyond widget
    if(r.right>wb.right+2){const t=(el.textContent||'').trim().slice(0,30);if(t)issues.push({type:'overflow-right',text:t,right:Math.round(r.right),wRight:Math.round(wb.right),tag:el.tagName.toLowerCase()});}
    if(r.left<wb.left-2){const t=(el.textContent||'').trim().slice(0,30);if(t)issues.push({type:'overflow-left',text:t,left:Math.round(r.left),wLeft:Math.round(wb.left)});}
    // text clipped (scrollWidth > clientWidth with overflow hidden)
    if(el.scrollWidth>el.clientWidth+3 && /hidden|clip/.test(cs.overflowX) && el.children.length===0){const t=(el.textContent||'').trim().slice(0,30);if(t)issues.push({type:'text-clipped',text:t,scrollW:el.scrollWidth,clientW:el.clientWidth});}
  });
  // dedupe
  const seen=new Set();const ded=[];for(const i of issues){const k=i.type+i.text;if(!seen.has(k)){seen.add(k);ded.push(i);}}
  return {widget:{w:Math.round(wb.width),h:Math.round(wb.height)},issues:ded.slice(0,25)};
};

const report={};
const browser=await chromium.launch();
for(const id of TEMPLATES){
  report[id]={};
  for(const [vp,cfg] of Object.entries(VIEWPORTS)){
    const ctx=await browser.newContext({viewport:{width:cfg.width,height:cfg.height},isMobile:cfg.isMobile,hasTouch:cfg.hasTouch,deviceScaleFactor:1});
    const page=await ctx.newPage();
    const res={errors:[],shots:[],contrast:[],layout:null,widgetBox:null};
    page.on('console',m=>{if(m.type()==='error')res.errors.push(m.text().slice(0,100));});
    try{await page.goto(`${BASE}/${id}`,{waitUntil:'domcontentloaded',timeout:30000});}catch(e){res.errors.push('goto:'+e.message.slice(0,60));}
    await page.waitForTimeout(2200);
    await page.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=400){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,60));}window.scrollTo(0,0);});
    await page.waitForTimeout(900);
    let box=await page.evaluate(FIND_BOX);
    if(!box){res.blocker='widget not found';const fp=`${OUT}/v2_${id}_${vp}_FULLPAGE.png`;await page.screenshot({path:fp,fullPage:true}).catch(()=>{});res.shots.push(fp);report[id][vp]=res;await ctx.close();continue;}
    res.widgetBox=box;
    const wEl=await page.$('[data-audit-widget="1"]');
    await wEl.scrollIntoViewIfNeeded().catch(()=>{});
    await page.waitForTimeout(400);
    const s1=`${OUT}/v2_${id}_${vp}_01.png`;
    await wEl.screenshot({path:s1}).catch(async()=>{await page.screenshot({path:s1});});
    res.shots.push(s1);
    const data1=await page.evaluate(COLLECT);
    res.layout=await page.evaluate(LAYOUT);

    // step through: click options + next
    let n=2;
    for(let step=0;step<6;step++){
      let clicked=false;
      const opt=await page.$('[data-audit-widget="1"] [class*="option"]:not([aria-disabled="true"]), [data-audit-widget="1"] [role="radio"], [data-audit-widget="1"] button[class*="select"], [data-audit-widget="1"] label');
      if(opt){try{await opt.click({timeout:1200});clicked=true;}catch{}}
      const handles=await page.$$('[data-audit-widget="1"] button, [data-audit-widget="1"] [role="button"]');
      for(const h of handles){const t=(await h.innerText().catch(()=>''))||'';if(/next|continue|get|calculate|see|quote|result|start|begin|estimate/i.test(t)){const dis=await h.isDisabled().catch(()=>false);if(!dis){try{await h.click({timeout:1200});clicked=true;break;}catch{}}}}
      if(!clicked)break;
      await page.waitForTimeout(700);
      await page.evaluate(FIND_BOX); // re-tag in case DOM changed
      const t2=await page.$('[data-audit-widget="1"]');
      const sN=`${OUT}/v2_${id}_${vp}_0${n}.png`;
      if(t2){await t2.scrollIntoViewIfNeeded().catch(()=>{});await t2.screenshot({path:sN}).catch(async()=>{await page.screenshot({path:sN});});}else await page.screenshot({path:sN});
      res.shots.push(sN);n++;
    }
    const data2=await page.evaluate(COLLECT);
    const all=[...data1,...data2];const seen=new Set();
    for(const d of all){const k=d.text+'|'+d.color+'|'+d.bg;if(seen.has(k))continue;seen.add(k);const fg=parseRGB(d.color),bg=parseRGB(d.bg);if(!fg||!bg)continue;const rr=ratio(fg,bg);const big=d.fontSize>=18||(d.fontSize>=14&&parseInt(d.fontWeight)>=700);const th=big?3:4.5;if(rr<th){res.contrast.push({text:d.text,color:d.color,bg:d.bg,ratio:+rr.toFixed(2),thresh:th,fontSize:d.fontSize,weight:d.fontWeight,tag:d.tag});}}
    res.contrast.sort((a,b)=>a.ratio-b.ratio);
    report[id][vp]=res;
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(`${OUT}/report2.json`,JSON.stringify(report,null,2));
for(const id of TEMPLATES){console.log('\n===== '+id+' =====');for(const vp of ['desktop','mobile']){const r=report[id][vp];if(!r){console.log(vp+': NO DATA');continue;}if(r.blocker){console.log(vp+': BLOCKER - '+r.blocker);continue;}console.log(`${vp}: widget ${Math.round(r.widgetBox.w)}x${Math.round(r.widgetBox.h)} | shots ${r.shots.length} | contrast ${r.contrast.length} | layout ${r.layout?r.layout.issues.length:'?'} | errs ${r.errors.length}`);r.contrast.slice(0,15).forEach(c=>console.log(`   CONTRAST ${c.ratio}:1(need${c.thresh}) fs${c.fontSize}/${c.weight} "${c.text}" fg=${c.color} bg=${c.bg}`));if(r.layout)r.layout.issues.slice(0,12).forEach(i=>console.log(`   LAYOUT ${i.type} "${i.text||''}" ${JSON.stringify(i).slice(0,90)}`));}}
console.log('\nDONE');
