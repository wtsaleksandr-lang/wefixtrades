import { chromium } from 'playwright';
const URL = 'http://localhost:5099/wizard?template=driveway_paving';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
async function dismiss(){ const b=page.locator('[data-testid="lead-modal-backdrop"]'); if(await b.count()&&await b.isVisible().catch(()=>false)){await page.keyboard.press('Escape');await page.waitForTimeout(200);} }
async function tab(t){await dismiss();await page.locator(`[data-testid="editor-tabs"] [data-testid="editor-tab-${t}"]`).click();await page.waitForTimeout(500);}

await tab('style');
const keys = await page.evaluate(()=> [...document.querySelectorAll('[data-edit-key]')].map(e=>e.getAttribute('data-edit-key')));
console.log('STYLE tab data-edit-keys:', JSON.stringify(keys));
// Does StyleTab carry trust-badges/tiered sections at all? search by testid
const sects = await page.evaluate(()=> [...document.querySelectorAll('[data-testid*="trust"],[data-testid*="tier"],[data-testid*="pricing"]')].map(e=>e.getAttribute('data-testid')).slice(0,30));
console.log('style trust/tier testids:', JSON.stringify(sects));
await browser.close();
