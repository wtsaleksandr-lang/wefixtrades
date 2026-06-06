import { chromium } from 'playwright';
function lum({r,g,b}){const a=[r,g,b].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];}
function parse(s){const m=s&&s.match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(x=>parseFloat(x.trim()));return{r:p[0],g:p[1],b:p[2],a:p[3]===undefined?1:p[3]};}
function ratio(f,b){const fg=parse(f),bg=parse(b);if(!fg||!bg)return null;const l1=lum(fg),l2=lum(bg);return Math.round(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05))*100)/100;}

const browser = await chromium.launch();
async function probe(id, matchTexts){
  const ctx = await browser.newContext({ viewport:{width:1440,height:900}});
  const p = await ctx.newPage();
  await p.goto('http://localhost:5099/templates/'+id,{waitUntil:'domcontentloaded',timeout:45000});
  await p.waitForFunction(()=>{const roots=[...document.querySelectorAll('[class^="advcalc-"]')].filter(el=>/^advcalc-[a-z0-9]+$/.test((el.className||'').toString().trim()));return roots.some(el=>{const r=el.getBoundingClientRect();return r.width*r.height>100000;});},{timeout:25000});
  await p.waitForTimeout(1500);
  const res = await p.evaluate((texts)=>{
    function realBg(el){ // climb but report the FIRST opaque-ish bg AND list each layer
      const layers=[]; let n=el;
      while(n){ const s=getComputedStyle(n); layers.push(s.backgroundColor); n=n.parentElement; if(layers.length>6)break;}
      return layers;
    }
    const roots=[...document.querySelectorAll('[class^="advcalc-"]')].filter(el=>/^advcalc-[a-z0-9]+$/.test((el.className||'').toString().trim()));
    roots.sort((a,b)=>{const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();return rb.width*rb.height-ra.width*ra.height;});
    const root=roots[0];
    const out=[];
    for(const el of root.querySelectorAll('*')){
      const own=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join('').trim();
      if(!own)continue;
      if(!texts.some(t=>own.includes(t)))continue;
      const s=getComputedStyle(el);
      out.push({text:own.slice(0,40),color:s.color,bgLayers:realBg(el),fs:parseFloat(s.fontSize),fw:s.fontWeight});
    }
    return out;
  }, matchTexts);
  await ctx.close();
  return res;
}

const roof = await probe('roof_repair', ['Low Slope','Medium Slope']);
console.log('=== ROOF selected radio ===');
roof.forEach(x=>console.log(JSON.stringify(x)));

const paint = await probe('interior_painting', ['Includes premium paint','YOUR PAINTING QUOTE','Per-room Prep']);
console.log('=== PAINTING result text ===');
paint.forEach(x=>console.log(JSON.stringify(x)));

// compute ratios against first NON-transparent layer
function firstOpaque(layers){for(const l of layers){const c=parse(l);if(c&&c.a>0.5)return l;}return 'rgb(255,255,255)';}
console.log('--- ratios ---');
[...roof,...paint].forEach(x=>{const bg=firstOpaque(x.bgLayers);console.log(ratio(x.color,bg),'| color',x.color,'on',bg,'| fs',x.fs,'fw',x.fw,'| "'+x.text+'"');});
await browser.close();
