const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:1440,height:900}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:5099/templates/kitchen_renovation',{waitUntil:'domcontentloaded',timeout:30000});
  await p.waitForTimeout(2500);
  const info=await p.evaluate(()=>{
    // element containing the big live estimate "$24,000.00" and form controls and "Powered by"
    const all=[...document.querySelectorAll('*')];
    const pw=all.find(e=>{const d=[...e.childNodes].some(n=>n.nodeType===3&&/Powered by/i.test(n.textContent));return d;});
    let cands=[];
    for(const el of all){
      const t=el.innerText||'';
      if(/YOUR .*ESTIMATE|YOUR .*QUOTE/i.test(t) && /Powered by/i.test(t) && el.querySelector('select,[role="radio"],input')){
        const r=el.getBoundingClientRect();
        cands.push({cls:(el.className||'').toString().slice(0,90),id:el.id,w:Math.round(r.width),h:Math.round(r.height),tag:el.tagName});
      }
    }
    // smallest width >400 is likely the true widget shell
    cands=cands.filter(c=>c.w>400).sort((a,b)=>a.w-b.w);
    return {poweredByCls:pw?(pw.className||'').toString().slice(0,90):null, cands:cands.slice(0,6)};
  });
  console.log(JSON.stringify(info,null,2));
  await b.close();
})();
