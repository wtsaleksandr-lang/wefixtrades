const { chromium } = require('playwright');
const BASE='http://localhost:5099';
const T=['kitchen_renovation','bathroom_renovation','basement_finishing','interior_painting_pro','hvac_installation'];
const VPS={desktop:{width:1440,height:900,isMobile:false,hasTouch:false},mobile:{width:375,height:812,isMobile:true,hasTouch:true}};
(async()=>{
  const b=await chromium.launch();
  for(const tpl of T){
    for(const [vn,vp] of Object.entries(VPS)){
      const ctx=await b.newContext({viewport:{width:vp.width,height:vp.height},isMobile:vp.isMobile,hasTouch:vp.hasTouch});
      const p=await ctx.newPage();
      try{
        await p.goto(`${BASE}/templates/${tpl}`,{waitUntil:'domcontentloaded',timeout:30000});
        await p.waitForSelector('.qq-widget-0',{timeout:20000}).catch(()=>{});
        await p.waitForTimeout(1800);
        const r=await p.evaluate(()=>{
          function lin(c){c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
          function lum(c){return 0.2126*lin(c.r)+0.7152*lin(c.g)+0.0722*lin(c.b);}
          function rt(f,g){const a=Math.max(lum(f),lum(g)),b=Math.min(lum(f),lum(g));return (a+0.05)/(b+0.05);}
          function pc(s){const m=s&&s.match(/rgba?\(([^)]+)\)/);if(!m)return null;const x=m[1].split(',').map(v=>parseFloat(v.trim()));return{r:x[0],g:x[1],b:x[2],a:x.length>3?x[3]:1};}
          function eb(el){let c=el;while(c){const bg=pc(getComputedStyle(c).backgroundColor);if(bg&&bg.a>0.5)return bg;c=c.parentElement;}return{r:255,g:255,b:255,a:1};}
          // the LIVE widget = widest .qq-widget-0
          let w=null,bw=0;
          for(const e of document.querySelectorAll('.qq-widget-0')){const ww=e.getBoundingClientRect().width;if(ww>bw){bw=ww;w=e;}}
          if(!w)return{none:true,w:0};
          const rb=w.getBoundingClientRect();
          const fails=[];const seen=new Set();
          for(const el of w.querySelectorAll('h1,h2,h3,h4,h5,h6,label,span,p,button,a,legend,li,div,small,strong,option')){
            let d=false;for(const n of el.childNodes){if(n.nodeType===3&&n.textContent.trim()){d=true;break;}}
            if(!d)continue;
            const t=(el.innerText||'').trim();if(!t)continue;
            const bb=el.getBoundingClientRect();if(bb.width===0||bb.height===0)continue;
            const cs=getComputedStyle(el);
            if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0)continue;
            if(cs.webkitTextFillColor==='rgba(0, 0, 0, 0)')continue;
            let fg=pc(cs.color);const bg=eb(el);if(!fg)continue;
            if(fg.a<1)fg={r:fg.r*fg.a+bg.r*(1-fg.a),g:fg.g*fg.a+bg.g*(1-fg.a),b:fg.b*fg.a+bg.b*(1-fg.a)};
            const rr=rt(fg,bg);const fs=parseFloat(cs.fontSize);const big=fs>=24||(fs>=18.66&&+cs.fontWeight>=700);
            const thr=big?3:4.5;
            if(rr<thr){const k=t.slice(0,40)+cs.color+JSON.stringify(bg);if(seen.has(k))continue;seen.add(k);
              fails.push({t:t.slice(0,42),tag:el.tagName.toLowerCase(),fg:`${Math.round(fg.r)},${Math.round(fg.g)},${Math.round(fg.b)}`,bg:`${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)}`,rr:+rr.toFixed(2),fs,fw:cs.fontWeight});}
          }
          // overflow within widget
          let oflow=0;const osamp=[];
          for(const el of w.querySelectorAll('*')){const x=el.getBoundingClientRect();if(x.width&&x.right>rb.right+3){oflow++;if(osamp.length<5)osamp.push({tag:el.tagName.toLowerCase(),cls:(el.className||'').toString().slice(0,40),over:Math.round(x.right-rb.right)});}}
          return{w:Math.round(rb.width),h:Math.round(rb.height),fails,oflow,osamp};
        });
        if(r.none){console.log(`\n### ${tpl}[${vn}] WIDGET NOT FOUND`);}
        else{
          console.log(`\n### ${tpl}[${vn}] widget ${r.w}x${r.h}px`);
          if(!r.fails.length)console.log('  CONTRAST: none');
          else{r.fails.sort((a,b)=>a.rr-b.rr);for(const f of r.fails)console.log(`  [${f.rr}] "${f.t}" ${f.tag} fg=${f.fg} bg=${f.bg} ${f.fs}px/${f.fw}`);}
          if(r.oflow)console.log(`  WIDGET-OVERFLOW: ${r.oflow} els past widget right; `+r.osamp.map(s=>`${s.tag}.${s.cls}(+${s.over}px)`).join(', '));
          else console.log('  WIDGET-OVERFLOW: none');
        }
      }catch(e){console.log(`\n### ${tpl}[${vn}] ERR ${e.message}`);}
      await ctx.close();
    }
  }
  await b.close();
})();
