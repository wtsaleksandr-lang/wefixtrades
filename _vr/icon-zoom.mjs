import { chromium } from 'playwright';
const BASE='http://localhost:5099';
const DIR='C:\\Users\\Owner\\.codex\\wt-preview\\_vr\\';
const run=async()=>{
  const b=await chromium.launch();
  const c=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:3});
  const p=await c.newPage();
  await p.goto(BASE+'/wizard',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('[data-testid="editor-tab-action"]');
  await p.waitForTimeout(1500);
  const svg=p.locator('[data-testid="editor-tab-action"]');
  await svg.screenshot({path:DIR+'d2-action-icon-zoom.png'});
  // also check help tab presence on rail
  const help=await p.locator('[data-testid="editor-tab-help"]').count();
  console.log('editor-tab-help count:',help);
  await b.close();
};
run();
