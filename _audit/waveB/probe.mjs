import { chromium } from 'playwright';

const URL = 'http://localhost:5099/wizard?template=driveway_paving';
const OUT = '_audit/waveB';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// Make sure Build tab active
await page.locator('[data-testid="editor-tab-build"]').first().click().catch(()=>{});
await page.waitForTimeout(800);

// Enumerate field rows
const rows = await page.locator('[data-testid^="field-row-"][data-testid$=""]').evaluateAll((els) => {
  return els
    .map((e) => e.getAttribute('data-testid'))
    .filter((t) => /^field-row-[^-]+$/.test(t) || (/^field-row-/.test(t) && !/(handle|toggle|type|label|body|input|width|options|add-option|divider)/.test(t)));
});
console.log('ROWS(raw):', JSON.stringify([...new Set(rows)], null, 2));

// Better: grab actual row containers
const rowIds = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('[data-testid^="field-row-"]').forEach((el) => {
    const t = el.getAttribute('data-testid');
    const m = t && t.match(/^field-row-([A-Za-z0-9_]+)$/);
    if (m) out.push({ id: m[1], type: el.querySelector('[data-testid^="field-row-type-"]')?.getAttribute('aria-label') || '', label: el.querySelector('[data-testid^="field-row-label-"]')?.textContent?.trim() || '' });
  });
  return out;
});
console.log('FIELDS:', JSON.stringify(rowIds, null, 2));

await page.screenshot({ path: `${OUT}/probe-build.png`, fullPage: false });
console.log('ERRORS:', JSON.stringify(errors));
await browser.close();
