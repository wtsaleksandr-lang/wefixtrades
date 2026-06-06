import { chromium } from 'playwright';
const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const URL = 'http://localhost:5099/wizard?template=driveway_paving';
const PNG = await import('pngjs').then(m=>m.PNG).catch(()=>null);

function parseRGB(s){ const m=s.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(x=>parseFloat(x.trim())); return {r:p[0],g:p[1],b:p[2],a:p[3]===undefined?1:p[3]}; }
function lin(c){ c/=255; return c<=0.03928? c/12.92 : Math.pow((c+0.055)/1.055,2.4); }
function lum({r,g,b}){ return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b); }
function blend(fg,bg){ const a=fg.a; return {r:fg.r*a+bg.r*(1-a), g:fg.g*a+bg.g*(1-a), b:fg.b*a+bg.b*(1-a), a:1}; }
function ratio(fgStr,bgStr){ let fg=parseRGB(fgStr),bg=parseRGB(bgStr); if(!fg||!bg) return null; if(fg.a<1) fg=blend(fg,bg); const L1=lum(fg),L2=lum(bg),hi=Math.max(L1,L2),lo=Math.min(L1,L2); return +((hi+0.05)/(lo+0.05)).toFixed(2); }

const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(2500);
const OUTOBJ={};
try{

// ---- FIX 3: price color inside STANDARD (selected) card ----
OUTOBJ.price = await page.evaluate(()=>{
  function findCard(name){ let label=null; document.querySelectorAll('*').forEach(el=>{const t=(el.innerText||'').trim(); if(t===name&&(!label||el.innerText.length<label.innerText.length)) label=el;}); let el=label; for(let i=0;i<8&&el;i++){const txt=el.innerText||''; if(/\$[\d,]/.test(txt)&&/Recommended/i.test(txt)) return el; el=el.parentElement;} return label?.parentElement; }
  const card=findCard('STANDARD');
  const cs=getComputedStyle(card);
  // find deepest element whose text is the $ range
  let priceEl=null;
  card.querySelectorAll('*').forEach(el=>{ const t=(el.innerText||'').trim(); if(/\$[\d,]+/.test(t)){ if(el.children.length===0) priceEl=el; } });
  return { cardBg:cs.backgroundColor, priceText:priceEl?priceEl.innerText.trim():null, priceColor:priceEl?getComputedStyle(priceEl).color:null, priceFontSize:priceEl?getComputedStyle(priceEl).fontSize:null };
});
if(OUTOBJ.price.priceColor) OUTOBJ.price.ratio=ratio(OUTOBJ.price.priceColor, OUTOBJ.price.cardBg);

// ---- FIX 8: white band - sample actual rendered pixels at bottom of preview ----
// Take a full screenshot, then read pixel rows near bottom of the widget preview region.
// First locate the preview phone-mock bounding box.
const previewBox = await page.evaluate(()=>{
  // The preview mock is the central area. Find element containing 'Powered by WeFixTrades' then climb to phone frame.
  let pwr=null; document.querySelectorAll('*').forEach(el=>{ if(/powered by/i.test((el.innerText||'').trim())&&(el.innerText||'').trim().length<40) pwr=el; });
  // climb to a reasonably large container that is the widget canvas
  let node=pwr, frame=pwr;
  for(let i=0;i<12&&node;i++){ const r=node.getBoundingClientRect(); if(r.height>500&&r.width>300){ frame=node; break;} node=node.parentElement; }
  const r=frame.getBoundingClientRect();
  return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),bottom:Math.round(r.bottom)};
});
OUTOBJ.previewBox=previewBox;
const shotPath=`${OUT}/m-08-bottomband.png`;
await page.screenshot({path:shotPath});
// read pixels along the bottom region of the preview using pngjs if available
if(PNG){
  const fs=await import('fs');
  const buf=fs.readFileSync(shotPath);
  const png=PNG.sync ? PNG.sync.read(buf) : await new Promise((res,rej)=>{ const p=new PNG(); p.parse(buf,(e,d)=>e?rej(e):res(d)); });
  const dpr=2;
  // sample a vertical strip near horizontal center of preview, from previewBox.bottom-60 down to bottom
  const cx=Math.round((previewBox.x+previewBox.w/2)*dpr);
  const samples=[];
  for(let yCss=previewBox.bottom-50; yCss<=previewBox.bottom+5 && yCss*dpr<png.height; yCss+=6){
    const py=Math.round(yCss*dpr);
    const idx=(png.width*py + cx)*4;
    samples.push({yCss, rgb:`rgb(${png.data[idx]}, ${png.data[idx+1]}, ${png.data[idx+2]})`});
  }
  OUTOBJ.bottomPixels=samples;
}

// ---- FIX 6: Trust toggle in Style tab ----
async function clickTab(name){
  const tab=page.locator(`text="${name}"`).first();
  try{ await tab.click({timeout:3000}); await page.waitForTimeout(600); return true; }catch(e){ return false; }
}
// count trust presence
async function trustPresent(){
  return await page.evaluate(()=>{ let f=false; document.querySelectorAll('*').forEach(el=>{ const t=el.innerText||''; if(t.includes('Licensed & Insured')&&t.includes('BBB')) f=true; }); return f; });
}
OUTOBJ.trustToggle={};
OUTOBJ.trustToggle.beforePresent = await trustPresent();
// open Style tab
await clickTab('Style');
await page.waitForTimeout(800);
// find Show trust badges toggle
const toggleInfo = await page.evaluate(()=>{
  let target=null;
  document.querySelectorAll('*').forEach(el=>{ const t=(el.innerText||'').trim(); if(/show trust badges/i.test(t)&&t.length<40&&!target) target=el; });
  if(!target) return {found:false};
  // find associated switch/checkbox: nearest button/input role switch within the row
  let row=target; for(let i=0;i<4&&row;i++){ row=row.parentElement; if(row && row.querySelector('[role="switch"],input[type=checkbox],button')) break; }
  const sw=row?.querySelector('[role="switch"],input[type=checkbox],button');
  if(sw){ const r=sw.getBoundingClientRect(); return {found:true, swTag:sw.tagName, role:sw.getAttribute('role'), checked:sw.getAttribute('aria-checked')??sw.checked, x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)}; }
  const r=target.getBoundingClientRect(); return {found:true, noSwitch:true, x:Math.round(r.x),y:Math.round(r.y)};
});
OUTOBJ.trustToggle.toggleInfo=toggleInfo;
await page.screenshot({path:`${OUT}/m-06b-style-tab.png`});
if(toggleInfo.found && toggleInfo.x){
  // ensure visible
  await page.mouse.click(toggleInfo.x, toggleInfo.y);
  await page.waitForTimeout(900);
  OUTOBJ.trustToggle.afterOffPresent = await trustPresent();
  await page.screenshot({path:`${OUT}/m-06c-trust-off.png`});
  // toggle back on
  await page.mouse.click(toggleInfo.x, toggleInfo.y);
  await page.waitForTimeout(900);
  OUTOBJ.trustToggle.afterOnPresent = await trustPresent();
  await page.screenshot({path:`${OUT}/m-06d-trust-on.png`});
}

// ---- FIX 9: pencil inline-edit on header title ----
OUTOBJ.pencil={};
// reload to clean state (Build tab)
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(2000);
const titleBefore = await page.evaluate(()=>{
  let btn=document.querySelector('button[aria-label^="Title"]');
  return btn?btn.innerText.trim():null;
});
OUTOBJ.pencil.titleBefore=titleBefore;
// click the title edit button (the pencil/title affordance)
const clicked = await page.evaluate(()=>{
  const btn=document.querySelector('button[aria-label^="Title"]');
  if(!btn) return false; btn.scrollIntoView({block:'center'}); return true;
});
if(clicked){
  const btn=page.locator('button[aria-label^="Title"]').first();
  try{ await btn.click({force:true, timeout:5000}); }
  catch(e){ // fallback: dispatch click in-page
    await page.evaluate(()=>{ const b=document.querySelector('button[aria-label^="Title"]'); b?.click(); });
  }
  await page.waitForTimeout(600);
  // now check for an editable element (input/textarea/contenteditable) focused
  const editState=await page.evaluate(()=>{
    const ae=document.activeElement;
    return { activeTag:ae?.tagName, editable: ae?.isContentEditable||/INPUT|TEXTAREA/.test(ae?.tagName||''), ariaLabel:ae?.getAttribute?.('aria-label'), value: ae?.value??ae?.innerText };
  });
  OUTOBJ.pencil.editState=editState;
  await page.screenshot({path:`${OUT}/m-09a-edit-open.png`});
  // type new title
  const newTitle='AUDIT TEST TITLE 9X';
  try{
    await page.keyboard.press('Control+A');
    await page.keyboard.type(newTitle, {delay:20});
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
  }catch(e){ OUTOBJ.pencil.typeErr=String(e); }
  const titleAfter=await page.evaluate(()=>{
    // look in preview header for the new text
    const all=document.body.innerText;
    let btn=document.querySelector('button[aria-label^="Title"]');
    return { btnText: btn?btn.innerText.trim():null, bodyHas: all.includes('AUDIT TEST TITLE 9X') };
  });
  OUTOBJ.pencil.titleAfter=titleAfter;
  await page.screenshot({path:`${OUT}/m-09b-edit-after.png`});
}

}catch(err){ OUTOBJ.fatalError=String(err); }
await browser.close();
console.log(JSON.stringify(OUTOBJ,null,2));
