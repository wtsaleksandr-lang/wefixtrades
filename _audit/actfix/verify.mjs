import { chromium } from 'playwright';

const BASE = 'http://localhost:5099';
const URL = `${BASE}/wizard?template=driveway_paving`;
const OUT = 'C:\\Users\\Owner\\.codex\\wt-preview\\_audit\\actfix';

const results = {};
const consoleErrors = [];

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();

p.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
p.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));

await p.goto(URL, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2000);

// ── 1. Open Action tab ─────────────────────────────────────────────
const actionTab = p.locator('[data-testid="editor-tab-action"]').first();
await actionTab.waitFor({ state: 'visible', timeout: 15000 });
await actionTab.click();
await p.waitForTimeout(800);

// Ensure mode = lead-form
const leadFormBtn = p.locator('[data-testid="action-mode-lead-form"]');
if (await leadFormBtn.count()) {
  const checked = await leadFormBtn.getAttribute('aria-checked');
  if (checked !== 'true') { await leadFormBtn.click(); await p.waitForTimeout(400); }
  results.modeLeadForm = (await leadFormBtn.getAttribute('aria-checked')) === 'true';
}

// Expand Advanced settings disclosure
const advToggle = p.locator('[data-testid="action-advanced"], [data-edit-key="action-advanced"]');
// AdvancedSection — try a button containing "Advanced settings"
const advBtn = p.getByRole('button', { name: /Advanced settings/i }).first();
if (await advBtn.count()) {
  // expand if collapsed
  const expanded = await advBtn.getAttribute('aria-expanded');
  if (expanded !== 'true') { await advBtn.click(); await p.waitForTimeout(500); }
}
// Make sure submit card is now in DOM
await p.locator('[data-testid="action-group-submit"]').first().waitFor({ state: 'attached', timeout: 8000 }).catch(()=>{});

// ── 2. Submit button card ──────────────────────────────────────────
{
  const card = p.locator('[data-testid="action-group-submit"]').first();
  const isCard = await card.count() > 0;
  // Confirm not a coming-soon row: check it has no "Coming soon" pill inside its head, and that the inputs exist
  const labelInput = p.locator('[data-testid="action-input-submit-label"]');
  const successInput = p.locator('[data-testid="action-input-submit-success"]');
  const hasLabel = await labelInput.count() > 0;
  const hasSuccess = await successInput.count() > 0;
  const comingSoonInside = await card.locator('text=Coming soon').count();

  // Type into both. label is a RichTextField — find its editable input/textarea/contenteditable
  let labelTyped = false, successTyped = false;
  try {
    // RichTextField: testid is on root; click the -preview button to expand,
    // then type into the contenteditable -editor.
    const preview = p.locator('[data-testid="action-input-submit-label-preview"]').first();
    await preview.scrollIntoViewIfNeeded().catch(()=>{});
    await preview.click();
    await p.waitForTimeout(400);
    const editor = p.locator('[data-testid="action-input-submit-label-editor"]').first();
    await editor.click();
    await p.keyboard.type('Get my paving quote');
    await p.waitForTimeout(200);
    // Commit via Done button
    const done = p.locator('[data-testid="action-input-submit-label-done"]').first();
    if (await done.count()) { await done.click(); await p.waitForTimeout(300); }
    labelTyped = true;
  } catch (e) { results.labelTypeErr = String(e).slice(0,200); }
  try {
    await successInput.click();
    await successInput.fill('Thanks! Our paving team will call you shortly.');
    successTyped = true;
  } catch (e) { results.successTypeErr = String(e).slice(0,200); }

  results.submit = {
    isRealCard: isCard,
    comingSoonInsideCard: comingSoonInside,
    hasLabelField: hasLabel,
    hasSuccessField: hasSuccess,
    labelTyped,
    successTyped,
    labelValue: await p.locator('[data-testid="action-input-submit-label-preview"] .qq-rtf-preview-text').first().innerText().catch(()=>null),
    successValue: await successInput.inputValue().catch(()=>null),
  };
}

// ── 3. Spam protection card ────────────────────────────────────────
{
  const card = p.locator('[data-testid="action-group-spam"]').first();
  const isCard = await card.count() > 0;
  const toggle = p.locator('[data-testid="action-spam-enabled"]');
  const hasToggle = await toggle.count() > 0;
  const defaultChecked = await toggle.isChecked().catch(()=>null);
  const comingSoonInside = await card.locator('text=Coming soon').count();
  // toggle off then on
  let offState = null, onState = null;
  try { await toggle.uncheck({ force: true }); offState = await toggle.isChecked(); } catch(e){ results.spamOffErr = String(e).slice(0,150); }
  await p.waitForTimeout(200);
  try { await toggle.check({ force: true }); onState = await toggle.isChecked(); } catch(e){ results.spamOnErr = String(e).slice(0,150); }
  await p.waitForTimeout(200);
  results.spam = {
    isRealCard: isCard,
    comingSoonInsideCard: comingSoonInside,
    hasToggle,
    defaultChecked,
    afterUncheck: offState,
    afterRecheck: onState,
  };
}

// ── 4. Integrations still coming-soon ──────────────────────────────
{
  const row = p.locator('[data-testid="action-row-integrations"]').first();
  const exists = await row.count() > 0;
  const txt = exists ? (await row.innerText()).replace(/\s+/g,' ').trim() : null;
  const ariaDisabled = exists ? await row.getAttribute('aria-disabled') : null;
  const hasComingSoon = exists ? (await row.locator('text=Coming soon').count()) > 0 : false;
  results.integrations = { exists, text: txt, ariaDisabled, hasComingSoon };
}

// Screenshot Action tab showing both new cards + integrations row
// Scroll the spam card into view first then screenshot the panel
const panel = p.locator('[data-testid="editor-tabpanel-action"]').first();
await p.locator('[data-testid="action-row-integrations"]').first().scrollIntoViewIfNeeded().catch(()=>{});
await p.waitForTimeout(300);
await p.screenshot({ path: `${OUT}\\action-tab-full.png`, fullPage: true });
// also a focused shot of the panel
try { await panel.screenshot({ path: `${OUT}\\action-tab-panel.png` }); } catch {}

// ── 5. Honeypot in live preview LeadModal ──────────────────────────
// Find the CTA in the preview canvas. Look in the widget iframe or main preview.
// The widget renders a "Get My Quote" style button. Search broadly.
let honeyResult = { triggered: false };
try {
  // The live preview widget exposes data-testid="advanced-cta" on the result
  // step; clicking it opens LeadModal. If the widget isn't on the result step,
  // walk it: click any "Next"/continue buttons until the CTA appears.
  const ctaSel = '[data-testid="advanced-cta"]';
  let clicked = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const cta = p.locator(ctaSel).first();
    if (await cta.count() && await cta.isVisible().catch(()=>false)) {
      await cta.scrollIntoViewIfNeeded().catch(()=>{});
      await cta.click().catch(()=>{});
      await p.waitForTimeout(700);
      clicked = true;
      break;
    }
    // advance the widget — click a forward/next/continue/quote button
    const next = p.locator(
      'button:has-text("Next"), button:has-text("Continue"), button:has-text("Get"), button:has-text("See"), [data-testid="advanced-next"], [data-testid="step-next"]'
    ).filter({ hasNot: p.locator('[disabled]') }).first();
    if (await next.count() && await next.isVisible().catch(()=>false)) {
      await next.scrollIntoViewIfNeeded().catch(()=>{});
      await next.click().catch(()=>{});
      await p.waitForTimeout(500);
    } else {
      break;
    }
  }
  honeyResult.ctaClicked = clicked;

  // If modal not open, try walking the widget to its result step is too heavy.
  // Many previews open LeadModal directly on CTA. Re-check.
  const modal = p.locator('[data-testid="lead-modal"]').first();
  const modalOpen = await modal.count() > 0;
  honeyResult.modalOpen = modalOpen;

  if (modalOpen) {
    const hp = p.locator('[data-testid="lead-modal-honeypot"]').first();
    const hpExists = await hp.count() > 0;
    honeyResult.honeypotExists = hpExists;
    if (hpExists) {
      const info = await hp.evaluate((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          name: el.getAttribute('name'),
          tabIndex: el.tabIndex,
          ariaHidden: el.getAttribute('aria-hidden'),
          autoComplete: el.getAttribute('autocomplete'),
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          position: cs.position,
          left: cs.left,
          width: cs.width,
          height: cs.height,
          pointerEvents: cs.pointerEvents,
          rectLeft: Math.round(r.left),
          rectTop: Math.round(r.top),
          inViewport: r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight,
        };
      });
      honeyResult.honeypot = info;
      // Tab-stop check: focus first field, tab through, ensure honeypot never focused
      const first = modal.locator('input:not([data-testid="lead-modal-honeypot"])').first();
      let tabReachedHoneypot = false;
      try {
        await first.focus();
        for (let i = 0; i < 8; i++) {
          await p.keyboard.press('Tab');
          const active = await p.evaluate(() => document.activeElement?.getAttribute?.('data-testid') || null);
          if (active === 'lead-modal-honeypot') { tabReachedHoneypot = true; break; }
        }
      } catch (e) { honeyResult.tabErr = String(e).slice(0,150); }
      honeyResult.tabReachedHoneypot = tabReachedHoneypot;
      // screenshot the modal
      try { await p.screenshot({ path: `${OUT}\\lead-modal.png` }); } catch {}
    }
  }
} catch (e) {
  honeyResult.error = String(e).slice(0, 300);
}
results.honeypot = honeyResult;

results.consoleErrors = consoleErrors;

console.log(JSON.stringify(results, null, 2));
await ctx.close();
await b.close();
