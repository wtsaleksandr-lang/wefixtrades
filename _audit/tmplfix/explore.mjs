import { chromium, devices } from 'playwright';

const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const URL = 'http://localhost:5099/wizard?template=driveway_paving';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

await page.screenshot({ path: `${OUT}/explore-full.png`, fullPage: false });

// Dump text to confirm template loaded
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1200));
console.log('=== BODY TEXT (first 1200) ===');
console.log(bodyText);

// Look for "Driveway" anywhere
const hasDriveway = await page.evaluate(() => document.body.innerText.toLowerCase().includes('driveway'));
console.log('\nhasDriveway:', hasDriveway);

// Find tier-related elements
const tierInfo = await page.evaluate(() => {
  const out = [];
  const all = document.querySelectorAll('*');
  for (const el of all) {
    const t = (el.innerText || '').trim();
    if (/most popular/i.test(t) && t.length < 40) {
      out.push({ tag: el.tagName, cls: el.className?.toString?.().slice(0,80), text: t.slice(0,30) });
    }
  }
  return out.slice(0, 10);
});
console.log('\n=== "most popular" matches ===');
console.log(JSON.stringify(tierInfo, null, 2));

// pencil
const pencils = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('button, svg, [role="button"]').forEach(el => {
    const al = (el.getAttribute('aria-label')||'') + ' ' + (el.getAttribute('title')||'');
    if (/pencil|edit/i.test(al)) out.push({tag:el.tagName, al:al.trim(), cls:el.className?.toString?.().slice(0,60)});
  });
  return out.slice(0,10);
});
console.log('\n=== pencil/edit candidates ===');
console.log(JSON.stringify(pencils, null, 2));

await browser.close();
