import { chromium } from 'playwright';

const base = 'http://localhost:5099';
const id = process.argv[2] || 'plumbing_service';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${base}/templates/${id}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// Dump structure: look for widget-ish containers
const info = await page.evaluate(() => {
  const out = {};
  out.title = document.title;
  out.h1 = [...document.querySelectorAll('h1,h2')].slice(0,8).map(e=>e.textContent.trim());
  // find inputs/selects/buttons
  out.inputs = document.querySelectorAll('input').length;
  out.selects = document.querySelectorAll('select').length;
  out.buttons = [...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(Boolean).slice(0,30);
  // candidate widget roots
  const cands = [...document.querySelectorAll('[class*="calc" i],[class*="widget" i],[class*="quote" i],[id*="calc" i],[id*="widget" i]')];
  out.candidates = cands.slice(0,15).map(c=>({tag:c.tagName, cls:(c.className||'').toString().slice(0,80), id:c.id}));
  return out;
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
