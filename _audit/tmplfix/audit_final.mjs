import { chromium } from 'playwright';
const URL='http://localhost:5099/wizard?template=driveway_paving';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(2500);
const O={};

// ---- Badge clip check: badge bounding box fully within viewport & not cut by its card's overflow ----
O.badge=await page.evaluate(()=>{
  function rect(el){ const r=el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top),bottom:Math.round(r.bottom)}; }
  let badge=null; document.querySelectorAll('*').forEach(el=>{ if((el.innerText||'').trim()==='MOST POPULAR'&&el.children.length===0) badge=el; });
  if(!badge) return null;
  const br=rect(badge);
  // card = STANDARD card
  let label=null; document.querySelectorAll('*').forEach(el=>{ if((el.innerText||'').trim()==='STANDARD'&&el.children.length===0) label=el; });
  let card=label; for(let i=0;i<8&&card;i++){ if(/\$[\d,]/.test(card.innerText||'')&&/Recommended/i.test(card.innerText||'')) break; card=card.parentElement; }
  const cr=rect(card);
  const cs=getComputedStyle(card);
  // is badge top clipped? badge fully visible if its top >= 0 and it's not hidden by card overflow:hidden when badge.top<card.top
  return { badgeRect:br, cardRect:cr, cardOverflow:cs.overflow+'/'+cs.overflowY, badgeAboveCardTop: br.top < cr.top, badgeTopVisible: br.top>=0, badgeFullyOnScreen: br.top>=0 && br.bottom<=844 };
});

// ---- Fix5: re-measure ALL option labels for wrapping (scrollHeight > lineHeight*1.3 == wrapped) ----
O.optionWrap=await page.evaluate(()=>{
  const names=['Driveway size (sqm)','Driveway surface material','Remove the existing surface','Add decorative edging'];
  const out=[];
  names.forEach(n=>{
    let f=null; document.querySelectorAll('*').forEach(el=>{ const t=(el.innerText||'').trim(); if(t===n&&el.children.length===0){ if(!f||el.innerText.length<f.innerText.length) f=el; }});
    if(!f) { out.push({name:n, found:false}); return; }
    const cs=getComputedStyle(f); const lh=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.2;
    const lines=Math.round(f.scrollHeight/lh);
    out.push({name:n, scrollH:f.scrollHeight, clientH:f.clientHeight, lineHeight:cs.lineHeight, fontSize:cs.fontSize, estLines:lines, wrapped: f.scrollHeight > lh*1.4});
  });
  return out;
});

// ---- Label casing: collect the FIELD/GROUP labels (not section heads) ----
O.casing=await page.evaluate(()=>{
  const fieldLabels=['Driveway size (sqm)','Driveway surface material','Remove the existing surface','Add decorative edging'];
  const out=[];
  fieldLabels.forEach(n=>{ let f=null; document.querySelectorAll('*').forEach(el=>{ if((el.innerText||'').trim()===n&&el.children.length===0) f=el; }); if(f){ const t=f.innerText.trim(); out.push({text:t, allCaps: t===t.toUpperCase()&&/[A-Z]/.test(t), sentence: /^[A-Z][a-z]/.test(t), textTransform:getComputedStyle(f).textTransform}); }});
  // the estimate heading + tier names (these are intentionally uppercase via design)
  return out;
});

// clean tier screenshot (scroll tiers into view, full mobile)
await page.evaluate(()=>{ const el=[...document.querySelectorAll('*')].find(e=>(e.innerText||'').trim()==='ESSENTIAL'); el?.scrollIntoView({block:'center'}); });
await page.waitForTimeout(400);
await page.screenshot({path:`${OUT}/m-01-tiers-clean.png`});

// options field area screenshot
await page.evaluate(()=>{ const el=[...document.querySelectorAll('*')].find(e=>(e.innerText||'').trim()==='Driveway size (sqm)'); el?.scrollIntoView({block:'start'}); });
await page.waitForTimeout(400);
await page.screenshot({path:`${OUT}/m-05-options-clean.png`});

await browser.close();
console.log(JSON.stringify(O,null,2));
