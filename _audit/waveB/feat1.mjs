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

async function readPreview() {
  return await page.evaluate(() => {
    const txt = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; };
    const breakdown = {};
    document.querySelectorAll('[data-testid^="advanced-breakdown-"]').forEach((e) => {
      breakdown[e.getAttribute('data-testid').replace('advanced-breakdown-','')] = e.textContent.trim();
    });
    const cells = [...document.querySelectorAll('[data-testid="advanced-calculator"] [data-colspan]')]
      .map((c) => (c.textContent || '').trim().slice(0, 45));
    return {
      tier0: txt('[data-testid="tier-card-0-price"]'),
      tier1: txt('[data-testid="tier-card-1-price"]'),
      tier2: txt('[data-testid="tier-card-2-price"]'),
      breakdown, cellCount: cells.length, cells,
    };
  });
}
async function edgingVisible() {
  return await page.evaluate(() => {
    const cal = document.querySelector('[data-testid="advanced-calculator"]');
    return !!cal && /decorative edging/i.test(cal.textContent || '');
  });
}
// Set the preview material combobox to an option by visible text
async function setMaterial(text) {
  const combo = page.locator('[data-testid="advanced-calculator"] [role="combobox"]').first();
  await combo.scrollIntoViewIfNeeded();
  await combo.click();
  await page.waitForTimeout(300);
  await page.locator('[role="option"]', { hasText: new RegExp('^' + text + '$', 'i') }).first().click();
  await page.waitForTimeout(700);
}

log('=== FEATURE 1: Conditional show_if ===');
const before = await readPreview();
log('BEFORE rule:', JSON.stringify(before));

const fieldId = 'edging', ctrlId = 'material';
await page.locator(`[data-testid="field-row-toggle-${fieldId}"]`).scrollIntoViewIfNeeded();
await page.locator(`[data-testid="field-row-toggle-${fieldId}"]`).click();
await page.waitForTimeout(400);

const condBtn = page.locator(`[data-testid="field-showif-conditional-${fieldId}"]`);
await condBtn.scrollIntoViewIfNeeded();
log('always present:', await page.locator(`[data-testid="field-showif-always-${fieldId}"]`).count() > 0);
log('conditional present:', await condBtn.count() > 0, 'disabled:', await condBtn.isDisabled());
await condBtn.click();
await page.waitForTimeout(400);

const fieldSel = page.locator(`[data-testid="field-showif-field-${fieldId}"]`);
const opSel = page.locator(`[data-testid="field-showif-op-${fieldId}"]`);
const valSel = page.locator(`[data-testid="field-showif-value-${fieldId}"]`);
log('rule visible:', await page.locator(`[data-testid="field-showif-rule-${fieldId}"]`).count() > 0);
log('FIELD opts:', JSON.stringify(await fieldSel.locator('option').allTextContents()));
log('OP opts:', JSON.stringify(await opSel.locator('option').allTextContents()));
await fieldSel.selectOption({ value: ctrlId });
await page.waitForTimeout(300);
await opSel.selectOption({ value: 'eq' });
await page.waitForTimeout(300);
const valValues = await valSel.locator('option').evaluateAll((os)=>os.map(o=>o.value));
const valLabels = await valSel.locator('option').allTextContents();
log('VALUE opts labels:', JSON.stringify(valLabels), 'values:', JSON.stringify(valValues));
const matchVal = valValues[0], matchLabel = valLabels[0];      // Asphalt
const nonMatchLabel = valLabels[1];                            // Concrete
await valSel.selectOption({ value: matchVal });
await page.waitForTimeout(400);
log(`RULE SET: edging shows WHEN material is "${matchLabel}"`);
await page.screenshot({ path: `${OUT}/f1-01-rule-set.png` });

// Preview default material = Asphalt = match → edging should be visible
log('--- preview behavior ---');
log('edging visible @ default(match=Asphalt):', await edgingVisible(), '(expect TRUE)');

// Switch to NON-match (Concrete) → edging should disappear
await setMaterial(nonMatchLabel);
const visNon = await edgingVisible();
const pvNon = await readPreview();
log(`edging visible @ NON-match(${nonMatchLabel}): ${visNon} (expect FALSE); cells=${pvNon.cellCount}`);
await page.screenshot({ path: `${OUT}/f1-02-field-hidden.png` });

// Switch back to MATCH (Asphalt) → reappears
await setMaterial(matchLabel);
const visMatch = await edgingVisible();
const pvMatch = await readPreview();
log(`edging visible @ MATCH(${matchLabel}): ${visMatch} (expect TRUE); cells=${pvMatch.cellCount}`);
await page.screenshot({ path: `${OUT}/f1-03-field-shown.png` });

// --- Hidden field excluded from total ---
log('--- hidden-field total exclusion ---');
// Turn ON edging toggle in preview (cell idx 3) so it contributes to total.
async function clickEdgingToggle() {
  return await page.evaluate(() => {
    const cal = document.querySelector('[data-testid="advanced-calculator"]');
    const cell = [...cal.querySelectorAll('[data-colspan]')].find((c)=>/decorative edging/i.test(c.textContent||''));
    if (!cell) return 'no-cell';
    const btn = cell.querySelector('button');
    if (!btn) return 'no-btn';
    btn.click(); return 'clicked';
  });
}
log('toggle edging ON:', await clickEdgingToggle());
await page.waitForTimeout(700);
const withEdge = await readPreview();
log(`WITH edging on: tier1=${withEdge.tier1} finishing=${withEdge.breakdown.finishing_touches}`);

// Hide edging by switching material to non-match
await setMaterial(nonMatchLabel);
const hidden = await readPreview();
log(`AFTER hide (material=${nonMatchLabel}): tier1=${hidden.tier1} finishing=${hidden.breakdown.finishing_touches}`);
const changed = withEdge.tier1 !== hidden.tier1 || withEdge.breakdown.finishing_touches !== hidden.breakdown.finishing_touches;
const anyNaN = /NaN|undefined/.test(JSON.stringify(hidden));
log(`total changed when field hidden: ${changed}`);
log(`NaN/undefined present: ${anyNaN} (expect FALSE)`);
await page.screenshot({ path: `${OUT}/f1-04-hidden-total.png` });

log('CONSOLE ERRORS:', JSON.stringify(errors));
await browser.close();
