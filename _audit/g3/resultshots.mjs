import { chromium } from 'playwright';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/g3';
const ids=['house_renovation','deep_home_cleaning','move_out_cleaning','office_cleaning','window_cleaning_quote'];
const b=await chromium.launch();
for(const id of ids){
  const ctx=await b.newContext({viewport:{width:1440,height:900}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:5099/templates/'+id,{waitUntil:'domcontentloaded',timeout:25000});
  await p.waitForTimeout(2800);
  for(let s=0;s<6;s++){const acted=await p.evaluate(()=>{const cs=[...document.querySelectorAll('[data-testid="advanced-calculator"]')];let w=null;for(const el of cs){let ir=false,c=el;for(let k=0;k<8&&c;k++){const n=(c.className?.toString?.()||'')+(c.getAttribute?.('data-testid')||'');if(/rail|tpl-card/.test(n)){ir=true;break;}c=c.parentElement;}if(!ir){w=el;break;}}if(!w)return false;let d=false;const o=[...w.querySelectorAll('[data-testid^="adv-select-option"],[data-testid^="adv-multiselect-option"],[data-testid^="adv-option"]')].find(x=>x.getBoundingClientRect().width>0);if(o){o.click();d=true;}const u=[...w.querySelectorAll('[data-testid^="adv-number-step-up"]')].find(x=>x.getBoundingClientRect().width>0);if(u){u.click();d=true;}const bs=[...w.querySelectorAll('button')].find(b=>/next|continue|→|see|get|calculate/i.test((b.innerText||'').trim())&&b.getBoundingClientRect().width>0&&!/adv-number/.test(b.getAttribute('data-testid')||''));if(bs){bs.click();d=true;}return d;});await p.waitForTimeout(600);if(!acted)break;}
  await p.waitForTimeout(700);
  const box=await p.evaluate(()=>{const cs=[...document.querySelectorAll('[data-testid="advanced-result-panel"]')];for(const el of cs){let ir=false,c=el;for(let k=0;k<10&&c;k++){const n=(c.className?.toString?.()||'')+(c.getAttribute?.('data-testid')||'');if(/rail|tpl-card/.test(n)){ir=true;break;}c=c.parentElement;}if(!ir){el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:Math.max(0,r.x-4),y:Math.max(0,r.y-4),width:Math.min(1440,r.width+8),height:r.height+8};}}return null;});
  await p.waitForTimeout(400);
  if(box){await p.screenshot({path:`${OUT}/${id}_resultpanel.png`,clip:box});console.log(id,'result panel shot OK');}
  else console.log(id,'no result panel');
  await ctx.close();
}
await b.close();
