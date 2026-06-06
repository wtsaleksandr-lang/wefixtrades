import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type()==='error') errs.push(m.text().slice(0,160)); });
page.on('pageerror', e => errs.push('PAGEERR: '+e.message.slice(0,160)));
await page.goto('http://localhost:5099/templates/gutter_cleaning', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
const info = await page.evaluate(() => {
  const all = [...document.querySelectorAll('*')];
  // classes containing calc/widget/quote
  const hits = new Set();
  for (const el of all) {
    const c = (el.className||'').toString();
    if (/calc|widget|quote|advanced/i.test(c)) hits.add(el.tagName.toLowerCase()+'.'+c.split(' ').filter(x=>/calc|widget|quote|advanced/i.test(x)).join('.'));
  }
  return {
    title: document.title,
    bodyLen: document.body.innerText.length,
    bodyStart: document.body.innerText.slice(0,200),
    formsCount: document.querySelectorAll('form').length,
    inputsCount: document.querySelectorAll('input,select,textarea,button').length,
    iframes: document.querySelectorAll('iframe').length,
    hits: [...hits].slice(0,40)
  };
});
console.log('ERRORS:', JSON.stringify(errs,null,2));
console.log('INFO:', JSON.stringify(info,null,2));
await page.screenshot({path:'C:/Users/Owner/.codex/wt-preview/_audit/g2/probe_full.png', fullPage:true});
await browser.close();
