import { chromium } from 'playwright';
import fs from 'fs';
const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/g3';
const ids = ['house_renovation', 'deep_home_cleaning', 'move_out_cleaning', 'office_cleaning', 'window_cleaning_quote'];
const VIEWS = {
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false },
  mobile: { width: 375, height: 812, isMobile: true, hasTouch: true },
};
function lin(c){c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
function lum(c){return 0.2126*lin(c.r)+0.7152*lin(c.g)+0.0722*lin(c.b);}
function ratio(fg,bg){const L1=lum(fg),L2=lum(bg);const a=Math.max(L1,L2),b=Math.min(L1,L2);return (a+0.05)/(b+0.05);}

const browser = await chromium.launch();
const out = {};
for (const id of ids){
  out[id]={};
  for (const [vname,vp] of Object.entries(VIEWS)){
    const ctx = await browser.newContext({viewport:{width:vp.width,height:vp.height},isMobile:vp.isMobile,hasTouch:vp.hasTouch});
    const p = await ctx.newPage();
    await p.goto('http://localhost:5099/templates/'+id,{waitUntil:'domcontentloaded',timeout:25000});
    await p.waitForTimeout(2800);
    // interact to reveal result (same as audit)
    for(let s=0;s<6;s++){
      const acted=await p.evaluate(()=>{const cs=[...document.querySelectorAll('[data-testid="advanced-calculator"]')];let w=null;for(const el of cs){let ir=false,c=el;for(let k=0;k<8&&c;k++){const n=(c.className?.toString?.()||'')+(c.getAttribute?.('data-testid')||'');if(/rail|tpl-card/.test(n)){ir=true;break;}c=c.parentElement;}if(!ir){w=el;break;}}if(!w)return false;let d=false;const o=[...w.querySelectorAll('[data-testid^="adv-select-option"],[data-testid^="adv-multiselect-option"],[data-testid^="adv-option"]')].find(x=>x.getBoundingClientRect().width>0);if(o){o.click();d=true;}const u=[...w.querySelectorAll('[data-testid^="adv-number-step-up"]')].find(x=>x.getBoundingClientRect().width>0);if(u){u.click();d=true;}const bs=[...w.querySelectorAll('button')].find(b=>/next|continue|→|see|get|calculate/i.test((b.innerText||'').trim())&&b.getBoundingClientRect().width>0&&!/adv-number/.test(b.getAttribute('data-testid')||''));if(bs){bs.click();d=true;}return d;});
      await p.waitForTimeout(600);
      if(!acted)break;
    }
    await p.waitForTimeout(700);

    const flags = await p.evaluate(()=>{
      function lin(c){c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
      function lum(c){return 0.2126*lin(c.r)+0.7152*lin(c.g)+0.0722*lin(c.b);}
      function rat(fg,bg){const L1=lum(fg),L2=lum(bg),a=Math.max(L1,L2),b=Math.min(L1,L2);return (a+0.05)/(b+0.05);}
      function pc(s){const m=s&&s.match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(x=>parseFloat(x));return{r:p[0],g:p[1],b:p[2],a:p[3]===undefined?1:p[3]};}
      function over(f,b){const a=f.a;return{r:f.r*a+b.r*(1-a),g:f.g*a+b.g*(1-a),b:f.b*a+b.b*(1-a),a:1};}
      // resolve true opaque bg by compositing the stack of ancestor backgrounds
      function resolveBg(el){
        const layers=[];let cur=el;
        while(cur){const cs=getComputedStyle(cur);const c=pc(cs.backgroundColor);if(c&&c.a>0)layers.push(c);if(c&&c.a>=1)break;cur=cur.parentElement;}
        layers.push({r:255,g:255,b:255,a:1}); // page base white
        // composite from bottom up
        let base=layers[layers.length-1];
        for(let i=layers.length-2;i>=0;i--){base=over(layers[i],base);}
        return base;
      }
      const cs=[...document.querySelectorAll('[data-testid="advanced-calculator"]')];let w=null;
      for(const el of cs){let ir=false,c=el;for(let k=0;k<8&&c;k++){const n=(c.className?.toString?.()||'')+(c.getAttribute?.('data-testid')||'');if(/rail|tpl-card/.test(n)){ir=true;break;}c=c.parentElement;}if(!ir){w=el;break;}}
      if(!w)return [];
      const res=[];const seen=new Set();
      const walk=document.createTreeWalker(w,NodeFilter.SHOW_TEXT,null);let n;
      while((n=walk.nextNode())){
        const t=(n.textContent||'').trim();if(!t)continue;const el=n.parentElement;if(!el)continue;
        const st=getComputedStyle(el);if(st.visibility==='hidden'||st.display==='none'||parseFloat(st.opacity)===0)continue;
        const r=el.getBoundingClientRect();if(r.width===0||r.height===0)continue;
        let fg=pc(st.color);if(!fg)continue;const bg=resolveBg(el);if(fg.a<1)fg=over(fg,bg);
        const cr=rat(fg,bg);const fsz=parseFloat(st.fontSize);const fw=parseInt(st.fontWeight)||400;
        const large=fsz>=24||(fsz>=18.66&&fw>=700);const need=large?3.0:4.5;
        if(cr<need){
          const key=t.slice(0,30)+'|'+Math.round(r.top)+'|'+(el.getAttribute('data-testid')||'');
          if(seen.has(key))continue;seen.add(key);
          res.push({text:t.slice(0,50),testid:el.getAttribute('data-testid')||(el.className?.toString?.()||'').slice(0,28),fg:`rgb(${Math.round(fg.r)},${Math.round(fg.g)},${Math.round(fg.b)})`,bg:`rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,ratio:+cr.toFixed(2),need,fontSize:fsz,weight:fw});
        }
      }
      return res;
    });
    out[id][vname]=flags;
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(`${OUT}/verify.json`,JSON.stringify(out,null,2));
for(const id of ids){for(const v of Object.keys(out[id])){console.log('==',id,v,'=>',out[id][v].length,'real flags');for(const f of out[id][v]){console.log('   ',f.ratio,'/'+f.need,JSON.stringify(f.text),f.fg,'on',f.bg,`${f.fontSize}px/${f.weight}`,f.testid);}}}
