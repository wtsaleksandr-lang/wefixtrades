import { chromium } from 'playwright';
import fs from 'fs';

const OUT = 'C:\Users\Owner\.codex\wt-preview\_vr6';
const BASE = 'http://localhost:5099/templates/';

const PARTA = ['roof_repair','office_cleaning','water_damage_restoration','lawn_care_subscription','moving_service','home_inspection_quote'];

function parseRGB(s){
  const m = s.match(/rgba?\(([^)]+)\)/); if(!m) return null;
  const p = m[1].split(',').map(x=>parseFloat(x.trim()));
  return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};
}
function lum({r,g,b}){
  const f=c=>{c/=255; return c<=0.03928? c/12.92 : Math.pow((c+0.055)/1.055,2.4);};
  return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);
}
function ratio(fg,bg){
  const L1=lum(fg),L2=lum(bg);
  return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
}

// composite walk: function injected client-side returns layered bg stack; we composite in node
async function run(){
  const b = await chromium.launch();
  const results = {};
  for(const tpl of PARTA){
    const page = await b.newPage({ viewport:{width:1440,height:900} });
    const log = [];
    try{
      await page.goto(BASE+tpl, {waitUntil:'domcontentloaded', timeout:60000});
      await page.waitForSelector('[data-testid="advanced-calculator"]', {timeout:25000});
      await page.waitForTimeout(1800);
      // scope to largest widget
      const widgetHandle = await page.evaluateHandle(()=>{
        const els=[...document.querySelectorAll('[data-testid="advanced-calculator"]')];
        els.sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width);
        return els[0];
      });
      // Find radio groups: buttons that toggle. We'll detect option buttons by role=radio OR buttons in a group container with multiple siblings & no combobox role.
      // Strategy: collect candidate option buttons inside widget that are not comboboxes and have short text.
      const groups = await page.evaluate((widget)=>{
        function txt(e){return (e.textContent||'').trim();}
        const btns=[...widget.querySelectorAll('button')].filter(btn=>{
          const role=btn.getAttribute('role')||'';
          if(role==='combobox') return false;
          const t=txt(btn);
          if(!t || t.length>40) return false;
          return true;
        });
        // group by parent
        const byParent=new Map();
        for(const btn of btns){
          const par=btn.parentElement;
          if(!byParent.has(par)) byParent.set(par,[]);
          byParent.get(par).push(btn);
        }
        const grps=[];
        let gi=0;
        for(const [par,arr] of byParent){
          if(arr.length>=2){
            arr.forEach((btn,i)=>{ btn.setAttribute('data-vr6-grp',gi); btn.setAttribute('data-vr6-idx',i); });
            grps.push({gi, count:arr.length, labels:arr.map(txt)});
            gi++;
          }
        }
        return grps;
      }, widgetHandle);
      log.push({radioGroups: groups.length, groups: groups.map(g=>({n:g.count,labels:g.labels}))});

      const measured=[];
      for(const g of groups){
        // click the SECOND option (index 1) to force a selection change; if only relevant, click index 1
        const sel = `[data-vr6-grp="${g.gi}"][data-vr6-idx="1"]`;
        const target = `[data-vr6-grp="${g.gi}"][data-vr6-idx="1"]`;
        try{
          await page.click(target, {timeout:5000});
          await page.waitForTimeout(300);
        }catch(e){ log.push({grp:g.gi, clickErr:e.message.slice(0,60)}); continue; }
        // measure selected label color + composited bg
        const meas = await page.evaluate((selStr)=>{
          const el=document.querySelector(selStr);
          if(!el) return null;
          // the visible label: prefer innermost text node element
          let labelEl = el;
          // find deepest element containing direct text
          const walk=(n)=>{ for(const c of n.children){ if((c.textContent||'').trim()===(n.textContent||'').trim() && c.children.length<=1){ return walk(c);} } return n; };
          labelEl = walk(el);
          const cs=getComputedStyle(labelEl);
          const color=cs.color;
          // composite bg by walking up
          const stack=[];
          let cur=el;
          while(cur){
            const s=getComputedStyle(cur);
            const bg=s.backgroundColor;
            if(bg && bg!=='rgba(0, 0, 0, 0)' && bg!=='transparent') stack.push(bg);
            cur=cur.parentElement;
          }
          stack.push('rgb(255,255,255)'); // page default
          const r=el.getBoundingClientRect();
          return {color, bgStack:stack, text:(el.textContent||'').trim().slice(0,30), x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};
        }, target);
        if(!meas){ continue; }
        // composite stack front-to-back over white
        function compositeOver(fg,bg){
          const a=fg.a;
          return {r: fg.r*a+bg.r*(1-a), g: fg.g*a+bg.g*(1-a), b: fg.b*a+bg.b*(1-a), a:1};
        }
        let bg={r:255,g:255,b:255,a:1};
        for(let i=meas.bgStack.length-1;i>=0;i--){
          const c=parseRGB(meas.bgStack[i]); if(c) bg=compositeOver(c,bg);
        }
        const fg=parseRGB(meas.color);
        // if fg has alpha, composite over bg
        const fgc = fg.a<1? compositeOver(fg,bg): fg;
        const cr = ratio(fgc,bg);
        measured.push({grp:g.gi, label:meas.text, color:meas.color, compositedBg:`rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`, ratio:+cr.toFixed(2), pass: cr>=4.5});
      }
      log.push({measured});
      const fail = measured.some(m=>!m.pass);
      // screenshot the widget (desktop)
      const ss = `${OUT}\A_${tpl}_desktop.png`;
      await widgetHandle.screenshot({path: ss}).catch(async()=>{ await page.screenshot({path:ss}); });
      results[tpl]={pass:!fail && measured.length>0, measured, screenshot:ss, groups:groups.length};
      // mobile screenshot if fail
      if(fail){
        const mp = await b.newPage({ viewport:{width:375,height:812}, isMobile:true, hasTouch:true });
        await mp.goto(BASE+tpl, {waitUntil:'domcontentloaded', timeout:60000});
        await mp.waitForSelector('[data-testid="advanced-calculator"]', {timeout:25000}).catch(()=>{});
        await mp.waitForTimeout(1500);
        const mss=`${OUT}\A_${tpl}_mobile.png`;
        await mp.screenshot({path:mss, fullPage:true});
        results[tpl].mobileScreenshot=mss;
        await mp.close();
      }
    }catch(e){
      results[tpl]={error:e.message.slice(0,120)};
    }
    results[tpl] = results[tpl]||{};
    results[tpl].log = log;
    await page.close();
  }
  await b.close();
  fs.writeFileSync(`${OUT}\partA_results.json`, JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
}
run();
