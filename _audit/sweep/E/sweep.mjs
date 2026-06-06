import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const BASE = 'http://localhost:5099';
const AXE = fs.readFileSync(path.join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8');

const ROUTES = [
  '/tools/local-serp-checker','/tools/map-snapshot','/tools/missed-call-calculator',
  '/tools/plumbing-ai-content-prompts','/tools/quote-demo','/tools/roofing-ai-content-prompts',
  '/wefixtrades-vs-housecall-pro','/wefixtrades-vs-jobber','/wefixtrades-vs-servicetitan',
  '/wizard','/contact','/login','/signup','/demos/rankflow','/design-showcase','/free-tools',
  '/citation-tracker','/docs/api','/products/quotequick','/pricing','/templates'
];
const HARD = new Set(['/wizard','/pricing','/templates','/products/quotequick']);

const VIEWPORTS = [
  { name:'DESKTOP', width:1440, height:900, isMobile:false, hasTouch:false },
  { name:'MOBILE',  width:375,  height:812, isMobile:true,  hasTouch:true  }
];

function isNetworkNoise(t){
  if(!t) return false;
  const s = t.toLowerCase();
  return s.includes('failed to fetch')||s.includes('networkerror')||s.includes('fetch')||
    s.includes('xhr')||s.includes('load resource')||s.includes('net::')||s.includes('err_')||
    s.includes('/api/')||s.includes('status of 4')||s.includes('status of 5')||
    s.includes('abort')||s.includes('econnrefused')||s.includes('the server responded')||
    s.includes('cors')||s.includes('429')||s.includes('500')||s.includes('404 ')||
    s.includes('axios')||s.includes('react query')||s.includes('queryfn')||
    s.includes('preload')||s.includes('was preloaded');
}
function safe(s){ return s.replace(/[^a-z0-9]/gi,'_'); }
const results = {};

const browser = await chromium.launch();
for (const vp of VIEWPORTS){
  const ctx = await browser.newContext({
    viewport:{width:vp.width,height:vp.height},
    isMobile:vp.isMobile, hasTouch:vp.hasTouch,
    userAgent: vp.isMobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' : undefined
  });
  for (const route of ROUTES){
    const key = route+'__'+vp.name;
    const defects = [];
    const page = await ctx.newPage();
    page.setDefaultTimeout(4000);

    page.on('pageerror', e => { defects.push(['JS-EXCEPTION', (e&&e.message)||String(e)]); });
    page.on('console', msg => {
      if(msg.type()==='error'){ const t = msg.text(); if(!isNetworkNoise(t)) defects.push(['CONSOLE', t]); }
    });

    // robust nav: domcontentloaded (won't hang on no-backend XHR), then bounded settle
    try { await page.goto(BASE+route, { waitUntil:'domcontentloaded', timeout:15000 }); } catch(e){}
    await page.waitForTimeout(1500);

    if(HARD.has(route)){
      // interaction probing — every action force-guarded with its own timeout, never blocks the run
      try {
        const toggles = await page.$$('[aria-label*="menu" i],[aria-label*="navigation" i],button[aria-expanded]');
        for(const t of toggles.slice(0,3)){ try{ await t.click({timeout:1200,force:true}); await page.waitForTimeout(250);}catch(e){} }
        const ctas = await page.$$('button:not([disabled])');
        let clicked=0;
        for(const c of ctas){
          if(clicked>=5) break;
          let txt='';
          try{ txt = (await c.innerText({timeout:800}))||''; }catch(e){ continue; }
          if(/get started|start|next|continue|select|choose|add|generate|create|build|try|demo|calculate|run/i.test(txt)){
            try{ await c.click({timeout:1200,force:true}); clicked++; await page.waitForTimeout(350);}catch(e){}
            // dismiss any overlay/modal that may now intercept (Escape)
            try{ await page.keyboard.press('Escape',{timeout:500}); }catch(e){}
          }
        }
      } catch(e){}
      await page.waitForTimeout(500);
    }

    // CRASH
    try {
      const bodyText = (await page.innerText('body').catch(()=>'')) || '';
      const lc = bodyText.toLowerCase();
      const visibleLen = bodyText.replace(/\s+/g,'').length;
      const rootHtml = await page.evaluate(()=>{ const r=document.querySelector('#root,#app,main')||document.body; return r?r.innerHTML.length:0; }).catch(()=>0);
      if(lc.includes('something went wrong')||lc.includes('error boundary')||(lc.includes('unexpected error')&&visibleLen<400)){
        defects.push(['CRASH','error-boundary text: "'+bodyText.slice(0,120).replace(/\n/g,' ')+'"']);
      } else if(visibleLen < 20 && rootHtml < 200){
        defects.push(['CRASH','blank/near-empty render (visibleChars='+visibleLen+', rootHtml='+rootHtml+')']);
      }
    } catch(e){}

    // BROKEN-IMG
    try {
      const broken = await page.evaluate(()=>{
        return [...document.querySelectorAll('img')].filter(i=>{
          if(i.naturalWidth!==0) return false;
          const s=i.currentSrc||i.src||'';
          if(!s) return false;
          if(s.startsWith('data:')&&s.length<50) return false;
          return i.complete;
        }).map(i=>i.currentSrc||i.src).slice(0,15);
      });
      for(const s of broken) defects.push(['BROKEN-IMG', s]);
    } catch(e){}

    // A11Y
    try {
      await page.evaluate(AXE);
      const ax = await page.evaluate(async ()=>{
        const r = await window.axe.run(document,{ resultTypes:['violations'] });
        return r.violations.filter(v=>v.impact==='critical'||v.impact==='serious').map(v=>({id:v.id,impact:v.impact,n:v.nodes.length}));
      });
      for(const v of ax) defects.push(['A11Y', v.id+' ('+v.impact+', '+v.n+' nodes)']);
    } catch(e){}

    // OVERFLOW
    try {
      const ov = await page.evaluate(()=>{
        const out=[]; const iw=window.innerWidth; const sw=document.documentElement.scrollWidth;
        if(sw>iw+2) out.push({detail:'doc scrollWidth '+sw+' > innerWidth '+iw+' (+'+(sw-iw)+'px)'});
        const els=document.querySelectorAll('body *'); let count=0;
        for(const el of els){
          if(count>=6) break;
          const cs=getComputedStyle(el);
          if(cs.overflowX==='auto'||cs.overflowX==='scroll') continue;
          if(cs.position==='fixed') continue;
          const r=el.getBoundingClientRect();
          if(r.width===0||r.height===0) continue;
          if(r.right>iw+2){
            const sel=el.tagName.toLowerCase()+(el.id?('#'+el.id):'')+(el.className&&typeof el.className==='string'?('.'+el.className.trim().split(/\s+/).slice(0,2).join('.')):'');
            out.push({detail:sel+' right='+Math.round(r.right)+' (+'+Math.round(r.right-iw)+'px)'}); count++;
          }
        }
        return out;
      });
      for(const o of ov) defects.push(['OVERFLOW', o.detail]);
    } catch(e){}

    const needShot = defects.some(d=>['CRASH','OVERFLOW','BROKEN-IMG'].includes(d[0]));
    if(needShot){
      const fn = path.join(OUT, safe(route)+'__'+vp.name+'.png');
      try{ await page.screenshot({path:fn, fullPage:true, timeout:8000}); defects.push(['_SHOT', fn]); }catch(e){}
    }

    results[key] = defects;
    await page.close();
    console.error('done '+key+' ('+defects.filter(d=>d[0]!=='_SHOT').length+' defects)');
  }
  await ctx.close();
}
await browser.close();

let lines = [];
for (const route of ROUTES){
  for (const vp of VIEWPORTS){
    const d = results[route+'__'+vp.name]||[];
    const real = d.filter(x=>x[0]!=='_SHOT');
    if(real.length===0){ lines.push(`ROUTE ${route} [${vp.name}]: OK`); }
    else {
      lines.push(`ROUTE ${route} [${vp.name}]:`);
      for(const x of d){ if(x[0]==='_SHOT') lines.push(`    shot: ${x[1]}`); else lines.push(`  - [${x[0]}] ${x[1]}`); }
    }
  }
}
const report = lines.join('\n');
fs.writeFileSync(path.join(OUT,'report.txt'), report);
console.log(report);
