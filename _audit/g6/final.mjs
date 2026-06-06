import { chromium } from 'playwright';
import fs from 'fs';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/g6';
const BASE='http://localhost:5099';
const TEMPLATES=['tree_service','pressure_washing_quote','mobile_car_detail','locksmith_service','water_damage_restoration'];

function lin(c){c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
function lum(c){return 0.2126*lin(c.r)+0.7152*lin(c.g)+0.0722*lin(c.b);}
function ratio(fg,bg){const l1=lum(fg),l2=lum(bg);const a=Math.max(l1,l2),b=Math.min(l1,l2);return (a+0.05)/(b+0.05);}

// pick the largest qq-widget-0 (the full-size live widget) and return a stable selector via index
async function fullWidget(page){
  const idx=await page.evaluate(()=>{
    const ws=Array.from(document.querySelectorAll('.qq-widget-0'));
    let bi=-1,ba=0;
    const minW=Math.min(300, window.innerWidth*0.6);
    ws.forEach((w,i)=>{const r=w.getBoundingClientRect();const a=r.width*r.height;if(r.width>=minW&&a>ba){ba=a;bi=i;}});
    if(bi>=0) ws[bi].setAttribute('data-audit-target','1');
    return bi;
  });
  if(idx<0) return null;
  return await page.$('[data-audit-target="1"]');
}

async function contrast(el,viewport){
  const data=await el.evaluate(root=>{
    function pc(s){const m=(s||'').match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(x=>parseFloat(x.trim()));return{r:p[0],g:p[1],b:p[2],a:p[3]===undefined?1:p[3]};}
    function effBg(node){let n=node,st=[];while(n){const c=pc(getComputedStyle(n).backgroundColor);if(c&&c.a>0){st.push(c);if(c.a>=1)break;}n=n.parentElement;}let b={r:255,g:255,b:255};for(let i=st.length-1;i>=0;i--){const c=st[i];b={r:c.r*c.a+b.r*(1-c.a),g:c.g*c.a+b.g*(1-c.a),b:c.b*c.a+b.b*(1-c.a)};}return b;}
    const out=[],seen=new Set();
    const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let tn;
    while(tn=w.nextNode()){
      const txt=(tn.textContent||'').trim();if(!txt)continue;
      const el=tn.parentElement;if(!el)continue;
      const cs=getComputedStyle(el);const r=el.getBoundingClientRect();
      if(r.width<=0||r.height<=0||cs.visibility==='hidden'||cs.display==='none'||parseFloat(cs.opacity)===0)continue;
      const fg=pc(cs.color);if(!fg)continue;
      let hasBgImg=false,n=el;while(n&&n!==root.parentElement){if(getComputedStyle(n).backgroundImage!=='none'){hasBgImg=true;break;}n=n.parentElement;}
      const bg=effBg(el);
      const fe=fg.a<1?{r:fg.r*fg.a+bg.r*(1-fg.a),g:fg.g*fg.a+bg.g*(1-fg.a),b:fg.b*fg.a+bg.b*(1-fg.a)}:fg;
      const key=txt.slice(0,40)+'|'+cs.color;if(seen.has(key))continue;seen.add(key);
      out.push({txt:txt.slice(0,55),fg:cs.color,bgR:bg.r,bgG:bg.g,bgB:bg.b,feR:fe.r,feG:fe.g,feB:fe.b,fontSize:parseFloat(cs.fontSize),fw:cs.fontWeight,hasBgImg});
    }
    return out;
  });
  const defects=[];
  for(const d of data){
    const r=ratio({r:d.feR,g:d.feG,b:d.feB},{r:d.bgR,g:d.bgG,b:d.bgB});
    const big=d.fontSize>=24||(d.fontSize>=18.66&&parseInt(d.fw)>=700);
    const thr=big?3.0:4.5;
    if(r<thr) defects.push({txt:d.txt,fg:d.fg,bg:`rgb(${Math.round(d.bgR)}, ${Math.round(d.bgG)}, ${Math.round(d.bgB)})`,ratio:+r.toFixed(2),threshold:thr,fontSize:d.fontSize,hasBgImg:d.hasBgImg,viewport});
  }
  return defects;
}

// alignment heuristics within widget
async function alignment(el,viewport,vw){
  return await el.evaluate((root,vw)=>{
    const issues=[];
    const rr=root.getBoundingClientRect();
    // overflow: any child extends beyond root by >2px
    root.querySelectorAll('*').forEach(c=>{
      const r=c.getBoundingClientRect();
      if(r.width===0||r.height===0)return;
      if(r.right>rr.right+2) issues.push(`overflow-right: <${c.tagName.toLowerCase()}> right=${Math.round(r.right)} vs widget right=${Math.round(rr.right)} (+${Math.round(r.right-rr.right)}px)`);
      if(r.left<rr.left-2 && r.width<rr.width) issues.push(`overflow-left: <${c.tagName.toLowerCase()}> left=${Math.round(r.left)} vs ${Math.round(rr.left)}`);
    });
    // horizontal scroll inside widget
    if(root.scrollWidth>root.clientWidth+2) issues.push(`h-scroll inside widget: scrollWidth=${root.scrollWidth} clientWidth=${root.clientWidth}`);
    return [...new Set(issues)].slice(0,15);
  },vw);
}

const browser=await chromium.launch();
const report={};
for(const tpl of TEMPLATES){
  report[tpl]={};
  for(const vp of [{n:'desktop',w:1440,h:900,m:false,dsr:1.5},{n:'mobile',w:375,h:812,m:true,dsr:2}]){
    const ctx=await browser.newContext({viewport:{width:vp.w,height:vp.h},isMobile:vp.m,hasTouch:vp.m,deviceScaleFactor:vp.dsr});
    const page=await ctx.newPage();
    const r={rendered:false,contrast:[],alignment:[],shots:[],notes:[]};
    try{
      await page.goto(`${BASE}/templates/${tpl}`,{waitUntil:'domcontentloaded',timeout:30000});
      await page.waitForTimeout(2800);
      const w=await fullWidget(page);
      if(!w){ r.notes.push('FULL widget not found'); report[tpl][vp.n]=r; await ctx.close(); continue; }
      r.rendered=true;
      await w.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
      const p1=`${OUT}/W_${tpl}_${vp.n}_initial.png`;
      await w.screenshot({path:p1}); r.shots.push(p1);
      r.contrast=await contrast(w,vp.n);
      r.alignment=await alignment(w,vp.n,vp.w);
      // interact: select options to populate result
      for(let s=0;s<6;s++){
        const opt=await page.$('[data-audit-target="1"] [role="radio"]:not([aria-checked="true"]), [data-audit-target="1"] input[type="radio"]:not(:checked), [data-audit-target="1"] button[aria-pressed="false"]');
        if(!opt) break;
        await opt.click({timeout:1500}).catch(()=>{}); await page.waitForTimeout(400);
      }
      // bump a slider if present
      const sl=await page.$('[data-audit-target="1"] [type="range"]');
      if(sl){ await sl.focus().catch(()=>{}); for(let i=0;i<5;i++){await page.keyboard.press('ArrowRight').catch(()=>{});} await page.waitForTimeout(400); }
      const w2=await page.$('[data-audit-target="1"]');
      if(w2){
        await w2.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
        const p2=`${OUT}/W_${tpl}_${vp.n}_filled.png`;
        await w2.screenshot({path:p2}); r.shots.push(p2);
        const c2=await contrast(w2,vp.n+'-filled');
        for(const d of c2){ if(!r.contrast.find(x=>x.txt===d.txt&&x.fg===d.fg)) r.contrast.push(d); }
        const a2=await alignment(w2,vp.n+'-filled',vp.w);
        for(const a of a2){ if(!r.alignment.includes(a)) r.alignment.push(a); }
      }
    }catch(e){ r.notes.push('ERR: '+e.message.slice(0,90)); }
    report[tpl][vp.n]=r;
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(`${OUT}/final.json`,JSON.stringify(report,null,2));
console.log('FINAL DONE');
