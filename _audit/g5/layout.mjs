import { chromium } from 'playwright';
const base = 'http://localhost:5099';
const id = process.argv[2] || 'plumbing_service';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${base}/templates/${id}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.evaluate(()=>window.scrollTo(0,0));
await page.screenshot({ path: `_audit/g5/_layout-${id}.png`, fullPage: true });

// detailed dump of each widget's field labels / option text
const info = await page.evaluate(() => {
  const widgets = [...document.querySelectorAll('.qq-widget-0')];
  return widgets.map((w, i) => {
    const r = w.getBoundingClientRect();
    const adv = w.querySelector('[class^="advcalc-"]');
    const fields = adv?.querySelector('[class$="-fields"]');
    const result = adv?.querySelector('[class$="-result"]');
    const txt = (el)=> el ? el.innerText.replace(/\s+/g,' ').trim().slice(0,200) : null;
    return { i, top: Math.round(r.top + window.scrollY), h: Math.round(r.height), w: Math.round(r.width),
      fieldsTxt: txt(fields), resultTxt: txt(result) };
  });
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
