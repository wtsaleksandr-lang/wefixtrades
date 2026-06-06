import { chromium } from 'playwright';

const id = process.argv[2] || 'solar_panel_install';
const url = `http://localhost:5099/templates/${id}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

const info = await page.evaluate(() => {
  // find the calculator widget by locating an adv-field input and walking up
  const f = document.querySelector('[id^="adv-field-"]');
  let widget = null;
  if (f) {
    let n = f;
    for (let i = 0; i < 12 && n; i++) {
      n = n.parentElement;
      if (n && /preview|calc|widget|adv|embed/i.test((n.className||'').toString())) { widget = n; break; }
    }
  }
  const wsel = widget ? (widget.tagName + '.' + (widget.className||'').toString().split(' ').join('.')) : null;
  // all testids on the page that look widget-ish
  const tids = [...document.querySelectorAll('[data-testid]')]
    .map(e => e.getAttribute('data-testid'))
    .filter(t => /calc|widget|preview|adv|result|price|field|step|quote-/i.test(t));
  // labels associated to adv-fields
  const labels = [...document.querySelectorAll('label')].map(l => l.textContent.trim()).filter(Boolean).slice(0,40);
  return { wsel, widgetClass: widget ? (widget.className||'').toString() : null, tids: [...new Set(tids)].slice(0,40), labels };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
