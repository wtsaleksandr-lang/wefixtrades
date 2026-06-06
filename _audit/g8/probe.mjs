import { chromium } from 'playwright';

const id = process.argv[2] || 'solar_panel_install';
const url = `http://localhost:5099/templates/${id}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

// Dump high-level structure: headings, buttons, inputs, and any element with "calc"/"quote"/"widget" in class
const info = await page.evaluate(() => {
  const out = {};
  out.title = document.title;
  out.h = [...document.querySelectorAll('h1,h2,h3')].map(e => e.textContent.trim()).slice(0, 30);
  out.buttons = [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 40);
  out.inputs = [...document.querySelectorAll('input,select,textarea')].map(e => e.tagName + ':' + (e.type||'') + ':' + (e.name||e.id||'')).slice(0, 40);
  // candidate widget containers
  const cands = [...document.querySelectorAll('[class*="calc" i],[class*="widget" i],[class*="quote" i],[data-testid]')]
    .map(e => ({ tag: e.tagName, cls: (e.className||'').toString().slice(0,80), testid: e.getAttribute('data-testid') }))
    .slice(0, 40);
  out.cands = cands;
  return out;
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
