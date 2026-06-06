import { chromium } from 'playwright';
const URL = 'http://localhost:5099/wizard?template=driveway_paving';
const OUT = '_audit/waveB';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
const log = (...a) => console.log(...a);

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// Which desktop tab is active? read aria-selected on editor-tabs (topbar) buttons
async function activeTab() {
  return await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="editor-tabs"]');
    if (!bar) return null;
    const btns = [...bar.querySelectorAll('[data-testid^="editor-tab-"]')];
    const a = btns.find((b) => b.getAttribute('aria-selected') === 'true' || b.classList.contains('is-active') || b.getAttribute('data-active') !== null);
    return a ? a.getAttribute('data-testid').replace('editor-tab-','') : 'unknown';
  });
}
async function highlighted() {
  return await page.evaluate(() => {
    const el = document.querySelector('.qq-edit-highlight');
    return el ? (el.getAttribute('data-testid') || el.className) : null;
  });
}
// Dismiss any lead-capture modal the live CTA may have opened.
async function dismissModal() {
  const back = page.locator('[data-testid="lead-modal-backdrop"]');
  if (await back.count() && await back.isVisible().catch(()=>false)) {
    await page.keyboard.press('Escape').catch(()=>{});
    await page.waitForTimeout(250);
    if (await back.isVisible().catch(()=>false)) {
      // click a corner of the backdrop to close
      await back.click({ position: { x: 5, y: 5 } }).catch(()=>{});
      await page.waitForTimeout(250);
    }
  }
}
// Switch to a known tab first to make tab-changes observable
async function gotoTab(t) {
  await dismissModal();
  await page.locator(`[data-testid="editor-tabs"] [data-testid="editor-tab-${t}"]`).click();
  await page.waitForTimeout(400);
}

log('=== FEATURE 2 DESKTOP ===');
log('initial active tab:', await activeTab());

// CHECK 4 — click a FIELD (material combobox) in preview → Build tab + field-row-material highlight
await gotoTab('action'); // move away so the switch is observable
log('[4] moved to action; clicking material field in preview...');
const combo = page.locator('[data-testid="advanced-calculator"] [role="combobox"]').first();
await combo.click();
await page.waitForTimeout(150);
// close any opened listbox (Escape) so we just measure the edit jump
await page.keyboard.press('Escape').catch(()=>{});
await page.waitForTimeout(500);
const t4 = await activeTab();
const h4 = await highlighted();
log(`[4] active tab after field click: ${t4} (expect build)`);
log(`[4] highlighted el: ${h4} (expect field-row-material)`);
await page.screenshot({ path: `${OUT}/f2-04-field-click.png` });

// CHECK 5 — click the CTA "Get My Quote" → Action tab
await gotoTab('build');
log('[5] clicking CTA...');
await page.locator('[data-testid="advanced-cta"]').click();
await page.waitForTimeout(500);
const t5 = await activeTab();
log(`[5] active tab after CTA click: ${t5} (expect action)`);
await page.screenshot({ path: `${OUT}/f2-05-cta-click.png` });
await dismissModal();

// CHECK 6 — click trust-badges row → Style tab
await gotoTab('build');
log('[6] clicking trust badge row...');
await page.locator('[data-testid="trust-badge-row"]').click();
await page.waitForTimeout(500);
const t6 = await activeTab();
const h6 = await highlighted();
log(`[6] active tab after trust click: ${t6} (expect style)`);
log(`[6] highlighted: ${h6}`);
await page.screenshot({ path: `${OUT}/f2-06-trust-click.png` });

// CHECK 7 — click a pricing tier card → Build/Style pricing-tiers
await gotoTab('build');
log('[7] clicking tier card 1...');
await page.locator('[data-testid="tier-card-1"]').click();
await page.waitForTimeout(500);
const t7 = await activeTab();
const h7 = await highlighted();
log(`[7] active tab after tier click: ${t7} (expect style or build)`);
log(`[7] highlighted: ${h7}`);
await page.screenshot({ path: `${OUT}/f2-07-tier-click.png` });

// CHECK 4 highlight may have faded by screenshot — re-run field click & capture quickly
await gotoTab('action');
await combo.click(); await page.keyboard.press('Escape').catch(()=>{});
await page.waitForTimeout(120);
const h4b = await highlighted();
log(`[4-recheck] highlighted immediately after: ${h4b}`);
await page.screenshot({ path: `${OUT}/f2-04b-field-highlight.png` });

log('CONSOLE ERRORS:', JSON.stringify(errors));
await browser.close();
