import { chromium } from 'playwright';
const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const URL = 'http://localhost:5099/wizard?template=driveway_paving';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const info = await page.evaluate(() => {
  function rect(el){ if(!el) return null; const r = el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}; }
  function findByText(re, maxLen=60){
    const out=[];
    document.querySelectorAll('*').forEach(el=>{
      const t=(el.innerText||'').trim();
      if(re.test(t) && t.length<maxLen){ out.push(el); }
    });
    return out;
  }
  // ESSENTIAL/STANDARD/PREMIUM cards - find the tier container
  const popular = findByText(/^MOST POPULAR$/i)[0];
  let tierCard = popular;
  // climb to card
  let card = popular;
  for(let i=0;i<6 && card;i++){ card = card.parentElement; }
  // Find all 3 tier labels
  const tierLabels = ['ESSENTIAL','STANDARD','PREMIUM'].map(name=>{
    const els = findByText(new RegExp('^'+name+'$'),20);
    return els[0];
  });
  // For each tier label, climb to a card-like ancestor (has both label and price)
  function cardFor(labelEl){
    let el = labelEl;
    for(let i=0;i<8 && el;i++){
      const txt = el.innerText||'';
      if(/\$[\d,]/.test(txt) && /Core scope|Recommended|Top materials/i.test(txt)){ return el; }
      el = el.parentElement;
    }
    return labelEl?.parentElement;
  }
  const cards = tierLabels.map(l=>cardFor(l));
  const cardData = cards.map((c,i)=>({
    name:['ESSENTIAL','STANDARD','PREMIUM'][i],
    rect: rect(c),
    cls: c?.className?.toString?.().slice(0,90),
    bg: c?getComputedStyle(c).backgroundColor:null,
  }));

  // CTA button "Get My Quote"
  let cta=null;
  document.querySelectorAll('button, a, [role=button]').forEach(el=>{
    if(/get my quote/i.test((el.innerText||'').trim()) && (el.innerText||'').trim().length<30) cta=el;
  });
  const ctaData = { rect: rect(cta), bg: cta?getComputedStyle(cta).backgroundColor:null, cls: cta?.className?.toString?.().slice(0,90) };

  // AI bubble
  let ai=null;
  document.querySelectorAll('*').forEach(el=>{
    const t=(el.innerText||'').trim();
    const al=(el.getAttribute('aria-label')||'');
    if((/^AI$/i.test(t)||/\bAI\b/i.test(al)) && el.children.length<3){ const r=el.getBoundingClientRect(); if(r.width>10&&r.width<120&&r.height<120) ai=el; }
  });
  const aiData = { rect: rect(ai), cls: ai?.className?.toString?.().slice(0,80), al: ai?.getAttribute('aria-label') };

  // option labels
  const optLabels=[];
  ['Remove the existing surface','Add decorative edging','Driveway surface material','Driveway size'].forEach(name=>{
    let found=null;
    document.querySelectorAll('*').forEach(el=>{
      const t=(el.innerText||'').trim();
      if(t===name || t.startsWith(name)){ if(!found || el.innerText.length<found.innerText.length) found=el; }
    });
    if(found){ const cs=getComputedStyle(found); optLabels.push({name, rect:rect(found), lineHeight:cs.lineHeight, fontSize:cs.fontSize, scrollH:found.scrollHeight, clientH:found.clientHeight, whiteSpace:cs.whiteSpace, textTransform:cs.textTransform, cls:found.className?.toString?.().slice(0,60)}); }
  });

  // trust badge row container
  let trust=null;
  ['Licensed & Insured'].forEach(name=>{
    document.querySelectorAll('*').forEach(el=>{
      if((el.innerText||'').includes('Licensed & Insured') && (el.innerText||'').includes('BBB')){ if(!trust || (el.innerText.length<trust.innerText.length)) trust=el; }
    });
  });
  const trustData = trust?{ rect:rect(trust), scrollW:trust.scrollWidth, clientW:trust.clientWidth, overflowX:getComputedStyle(trust).overflowX, cls:trust.className?.toString?.().slice(0,80)}:null;

  return { cardData, ctaData, aiData, optLabels, trustData,
    docScrollW: document.documentElement.scrollWidth, innerW: window.innerWidth };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
