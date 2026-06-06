const fs=require('fs');const path=require('path');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'raw.json')));

function lin(c){c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
function lum(c){return 0.2126*lin(c.r)+0.7152*lin(c.g)+0.0722*lin(c.b);}
function ratio(fg,bg){const L1=lum(fg),L2=lum(bg);const a=Math.max(L1,L2),b=Math.min(L1,L2);return (a+0.05)/(b+0.05);}
function parse(str){if(!str)return null;const m=str.match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(s=>parseFloat(s.trim()));return{r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};}
function blend(fg,bg){const a=fg.a;return{r:fg.r*a+bg.r*(1-a),g:fg.g*a+bg.g*(1-a),b:fg.b*a+bg.b*(1-a),a:1};}

for(const tpl of Object.keys(data)){
  console.log('\n======== '+tpl+' ========');
  for(const vp of Object.keys(data[tpl])){
    const rec=data[tpl][vp];
    console.log(`\n  --- ${vp} --- widget=${rec.widget&&rec.widget.found} steps=${rec.steps.length} err=${rec.error||'none'}`);
    if(rec.overflow && rec.overflow.length){
      for(const o of rec.overflow){
        if(o.type==='horizontal-scroll') console.log(`    OVERFLOW: ${o.detail}`);
        else console.log(`    OVERFLOW: ${o.count} els past right edge. samples: `+o.samples.map(s=>`${s.tag}.${s.cls}(right=${s.right})`).slice(0,4).join(', '));
      }
    }
    // contrast: dedupe by text+color+bg, only fails
    const seen=new Set(); const fails=[];
    for(const it of rec.contrast){
      let fg=parse(it.color); let bg=it.bg;
      if(!fg||!bg) continue;
      if(fg.a<1) fg=blend(fg,bg);
      const rr=ratio(fg,bg);
      const big = it.fontSize>=24 || (it.fontSize>=18.66 && (it.fontWeight==='bold'||parseInt(it.fontWeight)>=700));
      const thr= big?3:4.5;
      if(rr<thr){
        const key=it.text+'|'+it.color+'|'+JSON.stringify(it.bg)+'|'+(it.step||1);
        if(seen.has(key))continue; seen.add(key);
        fails.push({...it,rr:rr.toFixed(2),thr,fg});
      }
    }
    fails.sort((a,b)=>a.rr-b.rr);
    if(fails.length===0){ console.log('    CONTRAST: none'); }
    else {
      console.log(`    CONTRAST FAILS: ${fails.length} unique`);
      for(const f of fails.slice(0,25)){
        const fgs=`rgb(${Math.round(f.fg.r)},${Math.round(f.fg.g)},${Math.round(f.fg.b)})`;
        const bgs=`rgb(${Math.round(f.bg.r)},${Math.round(f.bg.g)},${Math.round(f.bg.b)})`;
        console.log(`      [${f.rr} <${f.thr}] "${f.text}" ${f.tag}.${f.cls} fg=${fgs} bg=${bgs} ${f.fontSize}px/${f.fontWeight} step=${f.step||1}`);
      }
    }
  }
}
