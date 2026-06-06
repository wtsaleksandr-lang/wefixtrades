import { chromium } from 'playwright';
const BASE='http://localhost:5099';
const run=async()=>{
  const b=await chromium.launch();
  const c=await b.newContext({viewport:{width:1440,height:900}});
  const p=await c.newPage();
  await p.goto(BASE+'/wizard',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('[data-testid="editor-tab-action"]');
  await p.waitForTimeout(1500);
  const info=await p.evaluate(()=>{
    const out={};
    const tabsEls=document.querySelectorAll('[data-testid="editor-tabs"]');
    out.tabsCount=tabsEls.length;
    const a=document.querySelector('[data-testid="editor-tab-action"]');
    out.actionHTML=a? a.outerHTML.slice(0,500):'MISSING';
    // svg path data of action icon
    const svg=a&&a.querySelector('svg');
    out.actionPaths=svg? Array.from(svg.querySelectorAll('path,polyline,line,rect,circle')).map(e=>e.tagName+':'+(e.getAttribute('d')||e.getAttribute('points')||'')).slice(0,8):[];
    out.actionClass = a? a.className:'';
    // which testid is the icon-rail one? compare build tab html
    const bu=document.querySelector('[data-testid="editor-tab-build"]');
    out.buildHTML=bu?bu.outerHTML.slice(0,300):'';
    return out;
  });
  console.log(JSON.stringify(info,null,2));
  await b.close();
};
run();
