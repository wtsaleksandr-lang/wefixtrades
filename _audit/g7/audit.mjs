import { chromium } from 'playwright';
import fs from 'fs';

const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/g7';
const BASE = 'http://localhost:5099';
const TEMPLATES = ['emergency_hvac','web_design_quote','photography_package','moving_service','home_inspection_quote'];

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  mobile:  { width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

// ---- Contrast analysis (runs in page). Restricted to a given root element via a marker id. ----
const CONTRAST_SCRIPT = (rootId) => {
  function parse(s){if(!s)return null;const m=s.match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(x=>parseFloat(x.trim()));return {r:p[0],g:p[1],b:p[2],a:p[3]===undefined?1:p[3]};}
  function blend(fg,bg){const a=fg.a;return {r:fg.r*a+bg.r*(1-a),g:fg.g*a+bg.g*(1-a),b:fg.b*a+bg.b*(1-a),a:1};}
  function effBg(el){
    let node=el; let acc=null;
    while(node && node.nodeType===1){
      const cs=getComputedStyle(node);
      const bg=parse(cs.backgroundColor);
      if(bg && bg.a>0.02){
        if(bg.a>=0.999) return {color:bg, desc:node.tagName+'.'+String(node.className||'').slice(0,30)};
      }
      node=node.parentElement;
    }
    return {color:{r:255,g:255,b:255,a:1}, desc:'root-default-white'};
  }
  function visible(el){
    const r=el.getBoundingClientRect();
    if(r.width<3||r.height<3) return false;
    const cs=getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)<0.1) return false;
    // must be within viewport-ish (rendered)
    return true;
  }
  function hasOwnText(el){for(const n of el.childNodes){if(n.nodeType===3 && n.textContent.trim().length>0)return true;}return false;}
  function srgb(c){c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
  function L(x){return 0.2126*srgb(x.r)+0.7152*srgb(x.g)+0.0722*srgb(x.b);}
  const root=document.getElementById(rootId);
  if(!root) return [];
  const results=[];
  for(const el of root.querySelectorAll('*')){
    if(!hasOwnText(el))continue;
    if(!visible(el))continue;
    const cs=getComputedStyle(el);
    let fg=parse(cs.color); if(!fg)continue;
    const bgInfo=effBg(el);
    let bg=bgInfo.color;
    if(fg.a<1) fg=blend(fg,bg);
    const l1=L(fg),l2=L(bg);
    const ra=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
    const fontSize=parseFloat(cs.fontSize);
    const bold=(parseInt(cs.fontWeight)||400)>=700;
    const large=fontSize>=24||(fontSize>=18.66&&bold);
    const threshold=large?3.0:4.5;
    if(ra<threshold){
      const r=el.getBoundingClientRect();
      results.push({
        text:(el.textContent||'').trim().slice(0,55),
        tag:el.tagName, cls:String(el.className||'').slice(0,40),
        fg:`rgb(${Math.round(fg.r)},${Math.round(fg.g)},${Math.round(fg.b)})`,
        bg:`rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,
        bgFrom:bgInfo.desc, ratio:Math.round(ra*100)/100,
        fontSize, bold, threshold,
        rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}
      });
    }
  }
  const seen=new Set();const out=[];
  for(const r of results){const k=r.text+'|'+r.ratio+'|'+r.tag+'|'+r.fg;if(seen.has(k))continue;seen.add(k);out.push(r);}
  return out;
};

const ALIGN_SCRIPT = (rootId) => {
  const root=document.getElementById(rootId); if(!root)return null;
  const rr=root.getBoundingClientRect();
  const out=[];
  for(const el of root.querySelectorAll('*')){
    const cs=getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden')continue;
    const r=el.getBoundingClientRect();
    if(r.width<2||r.height<2)continue;
    // overflow past widget right edge
    if(r.right>rr.right+1.5){
      out.push({type:'overflow-past-widget-right', tag:el.tagName, cls:String(el.className||'').slice(0,40), right:Math.round(r.right), widgetRight:Math.round(rr.right), text:(el.textContent||'').trim().slice(0,35)});
    }
    // internal horizontal clip
    if(el.scrollWidth>el.clientWidth+2 && el.clientWidth>0 && (cs.overflowX==='hidden'||cs.overflowX==='clip') && el!==root){
      out.push({type:'clipped-x', tag:el.tagName, cls:String(el.className||'').slice(0,40), scrollW:el.scrollWidth, clientW:el.clientWidth, text:(el.textContent||'').trim().slice(0,35)});
    }
  }
  const seen=new Set();const ded=[];for(const o of out){const k=JSON.stringify(o);if(seen.has(k))continue;seen.add(k);ded.push(o);}
  // capture grid/columns: option groups
  return {widgetRect:{x:Math.round(rr.x),y:Math.round(rr.y),w:Math.round(rr.width),h:Math.round(rr.height)}, defects:ded.slice(0,40)};
};

// pick the largest qq-width-scope (the live interactive widget), tag it with an id
const SELECT_WIDGET = () => {
  const scopes=[...document.querySelectorAll('[data-qq-width-scope]')];
  if(!scopes.length) return {found:false};
  let best=null,bestW=0;
  for(const s of scopes){const r=s.getBoundingClientRect(); if(r.width>bestW){bestW=r.width;best=s;}}
  if(!best) return {found:false};
  best.id='__g7_widget__';
  const r=best.getBoundingClientRect();
  return {found:true, w:Math.round(r.width), h:Math.round(r.height), title:(best.querySelector('[data-component-type=title]')||{}).textContent, nButtons:best.querySelectorAll('button').length, nInputs:best.querySelectorAll('input').length, scopeCount:scopes.length};
};

async function settleScroll(page){
  await page.evaluate(async ()=>{await new Promise(r=>{let y=0;const t=setInterval(()=>{window.scrollBy(0,500);y+=500;if(y>document.body.scrollHeight+1500){clearInterval(t);r();}},50);});});
  await page.waitForTimeout(700);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.waitForTimeout(300);
}

const summary={};
const browser=await chromium.launch();

for(const tpl of TEMPLATES){
  summary[tpl]={};
  for(const [vp,cfg] of Object.entries(VIEWPORTS)){
    const ctx=await browser.newContext({viewport:{width:cfg.width,height:cfg.height},isMobile:cfg.isMobile,hasTouch:cfg.hasTouch,deviceScaleFactor:cfg.deviceScaleFactor});
    const page=await ctx.newPage();
    const rec={rendered:false, widget:null, contrast:[], align:null, shots:[], notes:[]};
    try{
      await page.goto(`${BASE}/templates/${tpl}`,{waitUntil:'domcontentloaded',timeout:30000});
      await page.waitForTimeout(2500);
      await settleScroll(page);
      const w=await page.evaluate(SELECT_WIDGET);
      rec.widget=w;
      rec.rendered = w.found && (w.nButtons>0 || w.nInputs>0);
      if(rec.rendered){
        const sel='#__g7_widget__';
        await page.locator(sel).scrollIntoViewIfNeeded({timeout:4000}).catch(()=>{});
        await page.waitForTimeout(400);
        // widget screenshot (initial)
        const fpw=`${OUT}/${tpl}_${vp}_widget.png`;
        await page.locator(sel).screenshot({path:fpw}).catch(e=>rec.notes.push('shot:'+e.message.slice(0,50)));
        if(fs.existsSync(fpw)) rec.shots.push(fpw);
        // contrast + align on initial state
        rec.contrast=await page.evaluate(CONTRAST_SCRIPT,'__g7_widget__');
        rec.align=await page.evaluate(ALIGN_SCRIPT,'__g7_widget__');

        // step through: click option buttons + CTA, capture result
        for(let step=0; step<2; step++){
          // click first few non-CTA option buttons to fill selections
          const acted = await page.evaluate(()=>{
            const root=document.getElementById('__g7_widget__'); if(!root)return false;
            const btns=[...root.querySelectorAll('button')];
            let did=false;
            for(const b of btns){
              const t=(b.innerText||'').toLowerCase();
              if(/contact|dispatch|get|quote|submit|→|book|call|estimate/.test(t))continue;
              const ap=b.getAttribute('aria-pressed');
              if(ap==='true')continue;
              b.click(); did=true; break;
            }
            return did;
          });
          await page.waitForTimeout(500);
        }
        // adjust a slider if present
        await page.evaluate(()=>{const root=document.getElementById('__g7_widget__');const s=root&&root.querySelector('input[type=range]');if(s){s.value=Math.round((+s.max+ +s.min)/2);s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));}});
        await page.waitForTimeout(500);
        const fps=`${OUT}/${tpl}_${vp}_filled.png`;
        await page.locator(sel).screenshot({path:fps}).catch(()=>{});
        if(fs.existsSync(fps)) rec.shots.push(fps);
        // re-run contrast (result/price now visible), merge
        const c2=await page.evaluate(CONTRAST_SCRIPT,'__g7_widget__');
        for(const c of c2){ if(!rec.contrast.find(x=>x.text===c.text&&x.ratio===c.ratio&&x.fg===c.fg)) rec.contrast.push({...c,state:'filled'}); }
        const a2=await page.evaluate(ALIGN_SCRIPT,'__g7_widget__');
        if(a2&&a2.defects){ for(const d of a2.defects){ if(!rec.align.defects.find(x=>JSON.stringify(x)===JSON.stringify(d))) rec.align.defects.push({...d,state:'filled'}); } }
      }
    }catch(e){ rec.notes.push('ERR:'+e.message.slice(0,120)); }
    summary[tpl][vp]=rec;
    console.log(`== ${tpl} [${vp}] rendered=${rec.rendered} w=${rec.widget&&rec.widget.w} title="${(rec.widget&&rec.widget.title||'').slice(0,40)}" contrast=${rec.contrast.length} align=${rec.align?rec.align.defects.length:'-'}`);
    await ctx.close();
  }
}
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(summary,null,2));
await browser.close();
console.log('DONE');
