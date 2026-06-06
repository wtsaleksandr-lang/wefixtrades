import { chromium } from 'playwright';
const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const URL = 'http://localhost:5099/wizard?template=driveway_paving';

// ---- contrast helpers ----
function parseRGB(s){ const m=s.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(x=>parseFloat(x.trim())); return {r:p[0],g:p[1],b:p[2],a:p[3]===undefined?1:p[3]}; }
function lin(c){ c/=255; return c<=0.03928? c/12.92 : Math.pow((c+0.055)/1.055,2.4); }
function lum({r,g,b}){ return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b); }
function blend(fg,bg){ const a=fg.a; return {r:fg.r*a+bg.r*(1-a), g:fg.g*a+bg.g*(1-a), b:fg.b*a+bg.b*(1-a), a:1}; }
function ratio(fgStr,bgStr){ let fg=parseRGB(fgStr), bg=parseRGB(bgStr); if(!fg||!bg) return null; if(fg.a<1) fg=blend(fg,bg); const L1=lum(fg),L2=lum(bg); const hi=Math.max(L1,L2),lo=Math.min(L1,L2); return +((hi+0.05)/(lo+0.05)).toFixed(2); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
const page = await ctx.newPage();
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(2500);

const R = {};

// helper exposed in page
await page.addInitScript(()=>{});

async function geom(){
  return await page.evaluate(()=>{
    function rect(el){ if(!el) return null; const r=el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),right:Math.round(r.right),bottom:Math.round(r.bottom)}; }
    function findCard(name){
      let label=null;
      document.querySelectorAll('*').forEach(el=>{ const t=(el.innerText||'').trim(); if(t===name && (!label||el.innerText.length<label.innerText.length)) label=el; });
      let el=label;
      for(let i=0;i<8&&el;i++){ const txt=el.innerText||''; if(/\$[\d,]/.test(txt)&&/Core scope|Recommended|Top materials/i.test(txt)) return {card:el,label}; el=el.parentElement; }
      return {card:label?.parentElement,label};
    }
    function priceEl(card){ // find the big $range text inside card
      let best=null;
      card.querySelectorAll('*').forEach(el=>{ const t=(el.innerText||'').trim(); if(/^\$[\d,]+ ?[–-] ?\$[\d,]+$/.test(t) && el.children.length===0){ best=el; } });
      return best;
    }
    function tagEl(card){ let t=null; card.querySelectorAll('*').forEach(el=>{ const x=(el.innerText||'').trim(); if(/Core scope|Recommended for|Top materials/i.test(x)&&el.children.length===0) t=el; }); return t; }
    function nameEl(card,name){ let t=null; card.querySelectorAll('*').forEach(el=>{ if((el.innerText||'').trim()===name&&el.children.length===0) t=el; }); return t; }

    const out={cards:[]};
    ['ESSENTIAL','STANDARD','PREMIUM'].forEach(name=>{
      const {card,label}=findCard(name);
      if(!card){ out.cards.push({name,missing:true}); return; }
      const cs=getComputedStyle(card);
      const price=priceEl(card), tag=tagEl(card), ne=nameEl(card,name);
      out.cards.push({
        name, rect:rect(card), bg:cs.backgroundColor,
        nameColor: ne?getComputedStyle(ne).color:null,
        priceColor: price?getComputedStyle(price).color:null,
        priceText: price?price.innerText.trim():null,
        tagColor: tag?getComputedStyle(tag).color:null,
        tagText: tag?tag.innerText.trim():null,
      });
    });

    // most popular badge
    let badge=null; document.querySelectorAll('*').forEach(el=>{ if((el.innerText||'').trim()==='MOST POPULAR'&&el.children.length===0) badge=el; });
    out.badge = badge?{rect:rect(badge), parentRect: rect(badge.parentElement), color:getComputedStyle(badge).color, bg:getComputedStyle(badge).backgroundColor}:null;
    // badge clipped? compare badge top to its card top
    if(badge){ const c=findCard('STANDARD').card; out.badgeCardTop = c?Math.round(c.getBoundingClientRect().top):null; }

    // CTA
    let cta=null; document.querySelectorAll('button,a,[role=button]').forEach(el=>{ if(/get my quote/i.test((el.innerText||'').trim())&&(el.innerText||'').trim().length<30) cta=el; });
    out.cta = cta?{rect:rect(cta), bg:getComputedStyle(cta).backgroundColor}:null;

    // AI bubble - climb to actual bubble container (the visible round chip)
    let aiLabel=null; document.querySelectorAll('.qq-ai-bubble-label').forEach(el=>aiLabel=el);
    let aiBubble=aiLabel;
    for(let i=0;i<5&&aiBubble;i++){ const r=aiBubble.getBoundingClientRect(); if(r.width>=28&&r.height>=28) break; aiBubble=aiBubble.parentElement; }
    out.ai = aiBubble?{rect:rect(aiBubble), cls:aiBubble.className?.toString?.().slice(0,80)}:null;

    // trust row
    let trust=null; document.querySelectorAll('*').forEach(el=>{ const t=el.innerText||''; if(t.includes('Licensed & Insured')&&t.includes('BBB')&&(!trust||t.length<trust.innerText.length)) trust=el; });
    out.trust = trust?{rect:rect(trust), scrollW:trust.scrollWidth, clientW:trust.clientWidth, overflowX:getComputedStyle(trust).overflowX, maskImage:getComputedStyle(trust).maskImage, webkitMask:getComputedStyle(trust).webkitMaskImage, bgImage:getComputedStyle(trust).backgroundImage}:null;
    // check for fade hint on parent/pseudo
    if(trust){ const p=trust.parentElement; out.trustParent = p?{maskImage:getComputedStyle(p).maskImage, webkitMask:getComputedStyle(p).webkitMaskImage, bgImage:getComputedStyle(p).backgroundImage, pos:getComputedStyle(p).position}:null;
      // pseudo ::after on parent
      const after=getComputedStyle(p,'::after'); out.trustParentAfter={content:after.content, bgImage:after.backgroundImage, width:after.width}; }

    // option labels casing - gather field/group labels
    const labels=[];
    ['Driveway size (sqm)','Driveway size','Driveway surface material','Remove the existing surface','Add decorative edging'].forEach(name=>{
      let f=null; document.querySelectorAll('*').forEach(el=>{ const t=(el.innerText||'').trim(); if((t===name||t===name.replace(' (sqm)',''))&&el.children.length===0){ if(!f||el.innerText.length<f.innerText.length) f=el; } });
      if(f){ const cs=getComputedStyle(f); labels.push({name, scrollH:f.scrollHeight, clientH:f.clientHeight, lineHeight:cs.lineHeight, textTransform:cs.textTransform, raw:f.innerText.trim(), whiteSpace:cs.whiteSpace, w:Math.round(f.getBoundingClientRect().width)}); }
    });
    out.labels=labels;

    // white band check: sample background colors below the widget bottom up to bottom tab bar.
    // Find widget root (the preview phone mock) and bottom bar.
    out.docScrollW=document.documentElement.scrollWidth; out.innerW=window.innerWidth;
    return out;
  });
}

R.initial = await geom();

// contrast computations
for(const c of R.initial.cards){
  if(c.missing) continue;
  c.nameRatio = c.nameColor? ratio(c.nameColor,c.bg):null;
  c.priceRatio = c.priceColor? ratio(c.priceColor,c.bg):null;
  c.tagRatio = c.tagColor? ratio(c.tagColor,c.bg):null;
}

// screenshots - tier area, options, bottom
// tier full-screen mobile
await page.screenshot({path:`${OUT}/m-01-tiers-full.png`});
// scroll preview to tiers and screenshot just preview
try{
  await page.evaluate(()=>{ const el=[...document.querySelectorAll('*')].find(e=>(e.innerText||'').trim()==='STANDARD'); el?.scrollIntoView({block:'center'}); });
  await page.waitForTimeout(400);
  await page.screenshot({path:`${OUT}/m-01b-tiers-scrolled.png`});
}catch(e){}

// options area screenshot
try{
  await page.evaluate(()=>{ const el=[...document.querySelectorAll('*')].find(e=>(e.innerText||'').trim()==='Remove the existing surface'); el?.scrollIntoView({block:'center'}); });
  await page.waitForTimeout(400);
  await page.screenshot({path:`${OUT}/m-05-options.png`});
}catch(e){}

// trust badge area
try{
  await page.evaluate(()=>{ const el=[...document.querySelectorAll('*')].find(e=>(e.innerText||'').includes('Licensed & Insured')&&(e.innerText||'').includes('BBB')); el?.scrollIntoView({block:'center'}); });
  await page.waitForTimeout(400);
  await page.screenshot({path:`${OUT}/m-06-trust.png`});
}catch(e){}

// bottom of preview (white band check) - scroll to CTA / powered by
try{
  await page.evaluate(()=>{ const el=[...document.querySelectorAll('*')].find(e=>/powered by/i.test((e.innerText||'').trim())&&(e.innerText||'').trim().length<40); el?.scrollIntoView({block:'center'}); });
  await page.waitForTimeout(400);
  await page.screenshot({path:`${OUT}/m-08-bottom.png`});
}catch(e){}

// ---- White band pixel sampling: sample column of pixels at bottom of preview ----
R.whiteBand = await page.evaluate(()=>{
  // find "Powered by WeFixTrades" element & the widget container; sample background below it
  let pwr=null; document.querySelectorAll('*').forEach(el=>{ if(/powered by/i.test((el.innerText||'').trim())&&(el.innerText||'').trim().length<40&&el.children.length<3) pwr=el; });
  if(!pwr) return {error:'no powered-by'};
  // climb to the widget shell
  let shell=pwr;
  for(let i=0;i<10&&shell;i++){ const cs=getComputedStyle(shell); if(/rgb\(2[0-9]|rgb\(1[0-9]|rgb\(0|rgb\(3[0-5]/.test(cs.backgroundColor)) {} shell=shell.parentElement; }
  const r=pwr.getBoundingClientRect();
  return {poweredRect:{x:Math.round(r.x),y:Math.round(r.y),bottom:Math.round(r.bottom)}, poweredBg:getComputedStyle(pwr).backgroundColor, parentBg:getComputedStyle(pwr.parentElement).backgroundColor, gpBg:getComputedStyle(pwr.parentElement.parentElement).backgroundColor};
});

await browser.close();
console.log(JSON.stringify(R,null,2));
