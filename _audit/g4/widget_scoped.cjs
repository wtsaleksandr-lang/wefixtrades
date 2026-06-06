const { chromium } = require('playwright');
const path=require('path');
const BASE='http://localhost:5099';
const TEMPLATES=['kitchen_renovation','bathroom_renovation','basement_finishing','interior_painting_pro','hvac_installation'];
const VPS={desktop:{width:1440,height:900,isMobile:false,hasTouch:false},mobile:{width:375,height:812,isMobile:true,hasTouch:true}};

(async()=>{
  const b=await chromium.launch();
  for(const tpl of TEMPLATES){
    for(const [vn,vp] of Object.entries(VPS)){
      const ctx=await b.newContext({viewport:{width:vp.width,height:vp.height},isMobile:vp.isMobile,hasTouch:vp.hasTouch});
      const page=await ctx.newPage();
      try{
        await page.goto(`${BASE}/templates/${tpl}`,{waitUntil:'domcontentloaded',timeout:30000});
        await page.waitForSelector('[class*="calculator" i],[class*="widget" i]',{timeout:20000}).catch(()=>{});
        await page.waitForTimeout(1500);
        const out=await page.evaluate(()=>{
          // find the actual interactive widget container (the calculator iframe-less embed)
          function lin(c){c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
          function lum(c){return 0.2126*lin(c.r)+0.7152*lin(c.g)+0.0722*lin(c.b);}
          function rat(f,g){const a=Math.max(lum(f),lum(g)),b=Math.min(lum(f),lum(g));return (a+0.05)/(b+0.05);}
          function pc(s){const m=s&&s.match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(x=>parseFloat(x.trim()));return{r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};}
          function effbg(el){let c=el;while(c){const bg=pc(getComputedStyle(c).backgroundColor);if(bg&&bg.a>0.5)return bg;c=c.parentElement;}return{r:255,g:255,b:255,a:1};}
          // The LIVE interactive widget = the WIDEST element that has form controls + estimate text + "Powered by".
          let root=null, bestW=0;
          const all=[...document.querySelectorAll('div,section')];
          for(const el of all){
            const t=el.innerText||'';
            if(/YOUR .*ESTIMATE|YOUR .*QUOTE/i.test(t) && /Powered by/i.test(t) && el.querySelector('select,input,[role="radio"]')){
              const w=el.getBoundingClientRect().width;
              if(w>400 && w>bestW){bestW=w;root=el;}
            }
          }
          if(!root) return {rootClass:'NOT-FOUND',rootW:0,rootRight:0,fails:[],cardSets:[]};
          // descend to the tightest container still holding both estimate and Powered by, to drop outer page wrappers
          let inner=root;
          for(const c of root.querySelectorAll('div')){
            const t=c.innerText||'';
            if(/YOUR .*ESTIMATE|YOUR .*QUOTE/i.test(t)&&/Powered by/i.test(t)){
              if(c.getBoundingClientRect().width>=400 && c.getBoundingClientRect().width<=root.getBoundingClientRect().width){inner=c;break;}
            }
          }
          root=inner;
          const fails=[];
          const seen=new Set();
          for(const el of root.querySelectorAll('h1,h2,h3,h4,h5,h6,label,span,p,button,a,legend,li,div,small,strong')){
            let direct=false;for(const n of el.childNodes){if(n.nodeType===3&&n.textContent.trim()){direct=true;break;}}
            if(!direct)continue;
            const txt=(el.innerText||'').trim();if(!txt)continue;
            const r=el.getBoundingClientRect();if(r.width===0||r.height===0)continue;
            const cs=getComputedStyle(el);
            if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0)continue;
            // skip gradient/clip text (false positives)
            if(cs.webkitTextFillColor==='rgba(0, 0, 0, 0)'||cs.backgroundClip==='text'||cs.webkitBackgroundClip==='text')continue;
            let fg=pc(cs.color);const bg=effbg(el);if(!fg)continue;
            if(fg.a<1)fg={r:fg.r*fg.a+bg.r*(1-fg.a),g:fg.g*fg.a+bg.g*(1-fg.a),b:fg.b*fg.a+bg.b*(1-fg.a),a:1};
            const rr=rat(fg,bg);const fs=parseFloat(cs.fontSize);const big=fs>=24||(fs>=18.66&&+cs.fontWeight>=700);
            const thr=big?3:4.5;
            if(rr<thr){
              const k=txt.slice(0,40)+cs.color+JSON.stringify(bg);if(seen.has(k))continue;seen.add(k);
              fails.push({text:txt.slice(0,45),tag:el.tagName.toLowerCase(),fg:`${Math.round(fg.r)},${Math.round(fg.g)},${Math.round(fg.b)}`,bg:`${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)}`,ratio:+rr.toFixed(2),fs,fw:cs.fontWeight});
            }
          }
          // card height uniformity for option-card groups
          const cardSets=[];
          for(const grp of root.querySelectorAll('div')){
            const kids=[...grp.children].filter(c=>c.tagName==='DIV'||c.tagName==='BUTTON'||c.tagName==='LABEL');
            if(kids.length>=2 && kids.length<=6){
              const cs=getComputedStyle(grp);
              if(cs.display==='grid'||cs.display==='flex'){
                const hs=kids.map(k=>Math.round(k.getBoundingClientRect().height)).filter(h=>h>20);
                if(hs.length>=2){
                  const mn=Math.min(...hs),mx=Math.max(...hs);
                  if(mx-mn>=24){cardSets.push({label:(kids[0].innerText||'').trim().slice(0,30),count:hs.length,heights:hs,disp:cs.display});}
                }
              }
            }
          }
          const rb=root.getBoundingClientRect();
          return {rootClass:(root.className||'').toString().slice(0,80),rootW:Math.round(rb.width),rootRight:Math.round(rb.right),fails,cardSets:cardSets.slice(0,6)};
        });
        console.log(`\n### ${tpl} [${vn}] root=.${out.rootClass} w=${out.rootW} right=${out.rootRight}`);
        if(out.fails.length===0)console.log('  CONTRAST(widget): none');
        else{out.fails.sort((a,b)=>a.ratio-b.ratio);for(const f of out.fails)console.log(`  CONTRAST [${f.ratio}] "${f.text}" ${f.tag} fg=${f.fg} bg=${f.bg} ${f.fs}px/${f.fw}`);}
        if(out.cardSets.length){for(const c of out.cardSets)console.log(`  CARDS uneven (${c.disp}) near "${c.label}": heights=[${c.heights.join(',')}] Δ=${Math.max(...c.heights)-Math.min(...c.heights)}`);}
        else console.log('  CARDS: uniform');
      }catch(e){console.log(`\n### ${tpl} [${vn}] ERROR ${e.message}`);}
      await ctx.close();
    }
  }
  await b.close();
})();
