import { chromium } from 'playwright';
const URL = 'http://localhost:5099/wizard?template=driveway_paving';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
async function dismiss(){ const b=page.locator('[data-testid="lead-modal-backdrop"]'); if(await b.count()&&await b.isVisible().catch(()=>false)){await page.keyboard.press('Escape');await page.waitForTimeout(200);} }
async function tab(t){await dismiss();await page.locator(`[data-testid="editor-tabs"] [data-testid="editor-tab-${t}"]`).click();await page.waitForTimeout(300);}
// poll for highlight appearing within 600ms
async function pollHL(){ for(let i=0;i<12;i++){ const h=await page.evaluate(()=>{const e=document.querySelector('.qq-edit-highlight');return e?(e.getAttribute('data-testid')||e.getAttribute('data-edit-key')||e.className):null;}); if(h)return h; await page.waitForTimeout(50);} return null; }

await tab('build');
await page.locator('[data-testid="trust-badge-row"]').click();
console.log('trust highlight:', await pollHL());
await tab('build');
await page.locator('[data-testid="tier-card-1"]').click();
console.log('tier highlight:', await pollHL());
await browser.close();
