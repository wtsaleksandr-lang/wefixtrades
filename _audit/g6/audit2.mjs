import { chromium } from 'playwright';
import fs from 'fs';

const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/g6';
const BASE = 'http://localhost:5099';
const TEMPLATES = ['tree_service', 'pressure_washing_quote', 'mobile_car_detail', 'locksmith_service', 'water_damage_restoration'];

function parseColor(str){const m=(str||'').match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(s=>parseFloat(s.trim()));return {r:p[0],g:p[1],b:p[2],a:p[3]===undefined?1:p[3]};}
function lin(c){c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
function lum(c){return 0.2126*lin(c.r)+0.7152*lin(c.g)+0.0722*lin(c.b);}
function ratio(fg,bg){const l1=lum(fg),l2=lum(bg);const a=Math.max(l1,l2),b=Math.min(l1,l2);return (a+0.05)/(b+0.05);}
function blend(fg,bg){const a=fg.a;return {r:fg.r*a+bg.r*(1-a),g:fg.g*a+bg.g*(1-a),b:fg.b*a+bg.b*(1-a),a:1};}

// scoped contrast: only inside widget element, only real text nodes
async function auditContrast(widget, viewport){
  const data = await widget.evaluate(root => {
    function pc(str){const m=(str||'').match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(s=>parseFloat(s.trim()));return {r:p[0],g:p[1],b:p[2],a:p[3]===undefined?1:p[3]};}
    function effBg(node){
      let n=node, stack=[];
      while(n){const cs=getComputedStyle(n);const c=pc(cs.backgroundColor);if(c&&c.a>0){stack.push(c);if(c.a>=1)break;}
        // also account for bg image gradients -> mark
        n=n.parentElement;}
      let base={r:255,g:255,b:255,a:1};
      for(let i=stack.length-1;i>=0;i--){const c=stack[i];base={r:c.r*c.a+base.r*(1-c.a),g:c.g*c.a+base.g*(1-c.a),b:c.b*c.a+base.b*(1-c.a),a:1};}
      return base;
    }
    const out=[];
    const walker=document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let tn;
    const seen=new Set();
    while(tn=walker.nextNode()){
      const txt=(tn.textContent||'').trim();
      if(!txt) continue;
      const el=tn.parentElement;
      if(!el) continue;
      const cs=getComputedStyle(el);
      const rect=el.getBoundingClientRect();
      if(rect.width<=0||rect.height<=0||cs.visibility==='hidden'||cs.display==='none'||parseFloat(cs.opacity)===0) continue;
      const fg=pc(cs.color); if(!fg) continue;
      // detect background image (gradient/photo) on chain -> skip ratio (unreliable) but note
      let hasBgImg=false, n=el;
      while(n && n!==root.parentElement){ if(getComputedStyle(n).backgroundImage!=='none'){hasBgImg=true;break;} n=n.parentElement; }
      const bg=effBg(el);
      const fgEff=fg.a<1?{r:fg.r*fg.a+bg.r*(1-fg.a),g:fg.g*fg.a+bg.g*(1-fg.a),b:fg.b*fg.a+bg.b*(1-fg.a),a:1}:fg;
      const key=txt.slice(0,40)+'|'+cs.color;
      if(seen.has(key)) continue; seen.add(key);
      out.push({txt:txt.slice(0,50), fg:cs.color, bg:`rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`, fontSize:parseFloat(cs.fontSize), fontWeight:cs.fontWeight, hasBgImg, fgR:fgEff.r, fgG:fgEff.g, fgB:fgEff.b, bgR:bg.r, bgG:bg.g, bgB:bg.b});
    }
    return out;
  });
  const defects=[];
  for(const d of data){
    const r=ratio({r:d.fgR,g:d.fgG,b:d.fgB},{r:d.bgR,g:d.bgG,b:d.bgB});
    const big=d.fontSize>=24||(d.fontSize>=18.66&&parseInt(d.fontWeight)>=700);
    const thr=big?3.0:4.5;
    if(r<thr){ defects.push({txt:d.txt, fg:d.fg, bg:d.bg, ratio:r.toFixed(2), threshold:thr, fontSize:d.fontSize, hasBgImg:d.hasBgImg, viewport}); }
  }
  return defects;
}

async function findWidget(page){
  // wait for calculator-ish container
  const sel = '[class*="alculator"]';
  try{ await page.waitForSelector(sel, {timeout:8000}); }catch(e){}
  let h = await page.$(sel);
  if(h) return h;
  // fallback: smallest container with >=3 controls
  const handle = await page.evaluateHandle(()=>{
    const cands=Array.from(document.querySelectorAll('form,section,div'));
    let best=null,bestArea=Infinity;
    for(const c of cands){
      const ctrls=c.querySelectorAll('input,select,button,[role="radio"],[type="range"],[role="slider"]').length;
      const rect=c.getBoundingClientRect();
      if(ctrls>=3 && rect.width>250 && rect.height>150){const area=rect.width*rect.height; if(area<bestArea){bestArea=area;best=c;}}
    }
    return best;
  });
  return handle.asElement();
}

async function run(){
  const browser=await chromium.launch();
  const report={};
  for(const tpl of TEMPLATES){
    report[tpl]={};
    for(const vp of [{name:'desktop',w:1440,h:900,m:false},{name:'mobile',w:375,h:812,m:true}]){
      const ctx=await browser.newContext({viewport:{width:vp.w,height:vp.h},isMobile:vp.m,hasTouch:vp.m,deviceScaleFactor:1});
      const page=await ctx.newPage();
      const r={rendered:false,contrast:[],notes:[],shots:[]};
      try{
        await page.goto(`${BASE}/templates/${tpl}`,{waitUntil:'domcontentloaded',timeout:30000});
        await page.waitForTimeout(2500);
        const fp=`${OUT}/${tpl}_${vp.name}_full.png`;
        await page.screenshot({path:fp,fullPage:true}).catch(e=>r.notes.push('full shot fail:'+e.message));
        if(fs.existsSync(fp)) r.shots.push(fp);

        const w=await findWidget(page);
        if(w){
          r.rendered=true;
          await w.scrollIntoViewIfNeeded().catch(()=>{});
          await page.waitForTimeout(500);
          const wp=`${OUT}/${tpl}_${vp.name}_widget.png`;
          await w.screenshot({path:wp}).catch(e=>r.notes.push('widget shot fail:'+e.message));
          if(fs.existsSync(wp)) r.shots.push(wp);
          r.contrast=await auditContrast(w,vp.name);

          // step through: click options + advance to result
          for(let step=0;step<5;step++){
            const next=await page.$('button:has-text("Next"), button:has-text("Continue"), button:has-text("See"), button:has-text("Get my"), [aria-label*="next" i]');
            const opt=await page.$('[role="radio"]:not([aria-checked="true"]), input[type="radio"]:not(:checked)');
            const tgt=opt||next;
            if(!tgt) break;
            await tgt.click({timeout:1500}).catch(()=>{});
            await page.waitForTimeout(500);
          }
          // try to reach result
          const getBtn=await page.$('button:has-text("Get"), button:has-text("See my"), button:has-text("Quote"), button:has-text("estimate")');
          if(getBtn){ await getBtn.click({timeout:1500}).catch(()=>{}); await page.waitForTimeout(900); }
          const w2=await findWidget(page);
          if(w2){
            const wp2=`${OUT}/${tpl}_${vp.name}_result.png`;
            await w2.screenshot({path:wp2}).catch(()=>{});
            if(fs.existsSync(wp2)) r.shots.push(wp2);
            const c2=await auditContrast(w2,vp.name+'-result');
            for(const d of c2){ if(!r.contrast.find(x=>x.txt===d.txt&&x.fg===d.fg)) r.contrast.push(d); }
          }
        } else {
          const ic=await page.$$eval('input,select,button,[role="radio"],[type="range"]',e=>e.length);
          r.notes.push('NO widget container found; control count='+ic);
        }
      }catch(e){ r.notes.push('LOAD ERROR: '+e.message.slice(0,80)); }
      report[tpl][vp.name]=r;
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/report2.json`, JSON.stringify(report,null,2));
  console.log('done');
}
run().catch(e=>{console.error(e);process.exit(1);});
