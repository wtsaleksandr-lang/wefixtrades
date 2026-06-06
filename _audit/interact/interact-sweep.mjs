// Read-only Playwright INTERACTION error sweep against http://localhost:5099
// Built SPA, NO API backend -> suppress network/fetch/XHR/api noise + empty-data states.
// Drives clicks/typing/toggles and records uncaught JS errors that only fire on interaction.
// Does NOT modify project files. Writes screenshots + results.json under this dir.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5099';
const SHOT = __dirname;

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

// ---- network/no-backend noise suppression -------------------------------
// We only care about real JS exceptions / console.error that are NOT caused by
// the missing API backend. Filter out anything that smells like a network/fetch
// failure, a 4xx/5xx, aborted requests, or empty-data placeholders.
const NETWORK_NOISE = [
  /failed to fetch/i,
  /networkerror/i,
  /load failed/i,
  /fetch/i,
  /xhr/i,
  /\/api\//i,
  /net::err/i,
  /\b(4\d\d|5\d\d)\b.*(error|status)/i,
  /status (code )?(4\d\d|5\d\d)/i,
  /err_connection/i,
  /the user aborted a request/i,
  /aborterror/i,
  /loading chunk \d+ failed/i,
  /err_aborted/i,
  /react query|tanstack/i,
  /downloadable font/i,
  /preload/i,
  /favicon/i,
  /service worker/i,
  /websocket/i,
  /\bws:\/\//i,
  /quotaexceeded/i,        // storage in headless
  /unrecognized feature/i, // permissions-policy console warnings
];

function isNoise(msg) {
  if (!msg) return true;
  return NETWORK_NOISE.some((re) => re.test(msg));
}

const results = []; // { surface, viewport, step, tag, message }
let shotCounter = 0;

function rec(surface, viewport, step, tag, message) {
  results.push({ surface, viewport, step, tag, message: String(message).slice(0, 600) });
  console.log(`[${tag}] (${surface} / ${viewport}) @ "${step}" :: ${String(message).slice(0, 200)}`);
}

async function shot(page, name) {
  const file = join(SHOT, `${String(++shotCounter).padStart(2, '0')}-${name}.png`);
  try { await page.screenshot({ path: file, fullPage: false }); } catch {}
  return file;
}

// Attach error listeners that ignore network/no-backend noise.
function attach(page, getCtx) {
  page.on('pageerror', (err) => {
    const m = err?.message || String(err);
    if (isNoise(m)) return;
    const { surface, viewport, step } = getCtx();
    rec(surface, viewport, step(), 'JS-EXCEPTION', m);
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const m = msg.text();
    if (isNoise(m)) return;
    const { surface, viewport, step } = getCtx();
    rec(surface, viewport, step(), 'CONSOLE', m);
  });
  page.on('crash', () => {
    const { surface, viewport, step } = getCtx();
    rec(surface, viewport, step(), 'CRASH', 'page crashed');
  });
}

// also catch unhandledrejection / window.onerror inside the page (non-network)
const INIT_SCRIPT = `
  window.__interactErrors = [];
  window.addEventListener('error', (e) => {
    const m = (e && (e.message || (e.error && e.error.message))) || '';
    window.__interactErrors.push({ kind: 'window.error', message: String(m) });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    const m = (r && (r.message || r)) || '';
    window.__interactErrors.push({ kind: 'unhandledrejection', message: String(m) });
  });
`;

async function drainPageErrors(page, surface, viewport, stepLabel) {
  let arr = [];
  try { arr = await page.evaluate(() => { const a = window.__interactErrors || []; window.__interactErrors = []; return a; }); } catch {}
  for (const e of arr) {
    if (isNoise(e.message)) continue;
    rec(surface, viewport, stepLabel, e.kind === 'unhandledrejection' ? 'JS-EXCEPTION' : 'CONSOLE', `${e.kind}: ${e.message}`);
  }
}

// generic helpers ---------------------------------------------------------
async function clickIfVisible(scope, locator, timeout = 1500) {
  try {
    const el = typeof locator === 'string' ? scope.locator(locator).first() : locator.first();
    if (await el.isVisible({ timeout })) { await el.click({ timeout: 2500 }); return true; }
  } catch {}
  return false;
}

async function settle(page, ms = 350) { try { await page.waitForTimeout(ms); } catch {} }

// ========================================================================
// 1. /wizard editor (desktop + mobile)
// ========================================================================
async function auditWizard(browser, viewport, vpName) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(INIT_SCRIPT);
  const page = await ctx.newPage();
  const surface = `/wizard editor`;
  let curStep = 'load';
  attach(page, () => ({ surface, viewport: vpName, step: () => curStep }));

  let interactions = 0;
  const isMobile = viewport.width < 560;
  const tabPanelTestid = isMobile ? null : null; // tabs share editor-tab-${id} both views

  try {
    curStep = 'navigate /wizard';
    await page.goto(`${BASE}/wizard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await settle(page, 1200);
    await drainPageErrors(page, surface, vpName, curStep);

    // Desktop rail: tabs build/action/style/settings (help is the topbar
    // editor-help button). Mobile bottom bar: build/action/style/settings + an
    // editor-tab-help button. Help is handled in its own step below.
    const tabs = ['build', 'action', 'style', 'settings'];
    if (isMobile) tabs.push('help');
    for (const id of tabs) {
      curStep = `click tab ${id} (${vpName})`;
      // An open panel sheet can overlap the bottom bar on mobile; use force +
      // scrollIntoView so we test the tab itself, not z-index layering.
      let ok = false;
      try {
        const el = page.locator(`[data-testid="editor-tab-${id}"]`).first();
        if (await el.count()) {
          await el.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
          // bottom bar stays visible per design; normal click verifies real actionability
          await el.click({ timeout: 2500 });
          ok = true;
        }
      } catch (e) {
        rec(surface, vpName, curStep, 'BROKEN-BEHAVIOR', `tab "${id}" click failed: ${e.message}`);
      }
      interactions++;
      await settle(page, 450);
      await drainPageErrors(page, surface, vpName, curStep);
      if (!ok) rec(surface, vpName, curStep, 'BROKEN-BEHAVIOR', `tab "${id}" not present`);
    }

    // BUILD tab interactions — on mobile the tab opens a bottom sheet that
    // contains the AI controls; a normal click mounts it.
    curStep = 'open Build tab';
    try { await page.locator('[data-testid="editor-tab-build"]').first().click({ timeout: 2500 }); } catch {}
    await settle(page, 500);
    interactions++;

    curStep = 'type build-ai-prompt';
    try {
      const prompt = page.locator('[data-testid="build-ai-prompt"]').first();
      if (await prompt.isVisible({ timeout: 2500 })) {
        await prompt.click();
        await prompt.fill('A pricing calculator for window cleaning');
        interactions++;
        await drainPageErrors(page, surface, vpName, curStep);
      } else {
        rec(surface, vpName, curStep, 'BROKEN-BEHAVIOR', 'build-ai-prompt not visible on Build tab');
      }
    } catch (e) { rec(surface, vpName, curStep, 'JS-EXCEPTION', e.message); }

    curStep = 'click build-ai-chip-0';
    if (await clickIfVisible(page, `[data-testid="build-ai-chip-0"]`, 2000)) interactions++;
    await drainPageErrors(page, surface, vpName, curStep);

    curStep = 'click build-ai-generate';
    if (await clickIfVisible(page, `[data-testid="build-ai-generate"]`, 2000)) {
      interactions++;
      await settle(page, 900);
      await drainPageErrors(page, surface, vpName, curStep);
    } else {
      rec(surface, vpName, curStep, 'BROKEN-BEHAVIOR', 'build-ai-generate not clickable');
    }
    await shot(page, `wizard-${vpName}-build-ai`);

    // ACTION tab
    curStep = 'open Action tab';
    await clickIfVisible(page, `[data-testid="editor-tab-action"]`, 2500);
    await settle(page, 400); interactions++;
    await drainPageErrors(page, surface, vpName, curStep);

    // segmented mode buttons: Redirect / Lead form / No action
    for (const label of ['Redirect', 'Lead form', 'No action', 'Lead form']) {
      curStep = `action mode: ${label}`;
      const btn = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
      if (await clickIfVisible(page, btn, 1500)) { interactions++; await settle(page, 300); }
      await drainPageErrors(page, surface, vpName, curStep);
    }
    // Advanced settings expander
    curStep = 'action: expand Advanced settings';
    if (await clickIfVisible(page, page.getByText(/Advanced settings/i), 1500)) { interactions++; await settle(page, 350); }
    await drainPageErrors(page, surface, vpName, curStep);
    // Payment + Booking switches
    curStep = 'action: toggle switches (Payment/Booking)';
    const switches = page.locator('[role="switch"], button[role="switch"]');
    const sc = await switches.count().catch(() => 0);
    for (let i = 0; i < Math.min(sc, 4); i++) {
      try { if (await switches.nth(i).isVisible()) { await switches.nth(i).click({ timeout: 1500 }); interactions++; await settle(page, 200); } } catch {}
    }
    await drainPageErrors(page, surface, vpName, curStep);
    await shot(page, `wizard-${vpName}-action`);

    // STYLE tab
    curStep = 'open Style tab';
    await clickIfVisible(page, `[data-testid="editor-tab-style"]`, 2500);
    await settle(page, 400); interactions++;
    await drainPageErrors(page, surface, vpName, curStep);
    curStep = 'style: expand Advanced settings';
    await clickIfVisible(page, page.getByText(/Advanced settings/i), 1500);
    await settle(page, 350); interactions++;
    await drainPageErrors(page, surface, vpName, curStep);
    // theme/skin swatch — try common swatch testids/roles
    curStep = 'style: click a theme/skin swatch';
    const swatch = page.locator('[data-testid^="style-combo-"], [data-testid^="theme-combo-"], [data-testid^="skin-"], [aria-label*="theme" i] button, [data-testid^="style-swatch"]').first();
    if (await clickIfVisible(page, swatch, 1500)) { interactions++; await settle(page, 300); }
    await drainPageErrors(page, surface, vpName, curStep);
    // font/weight change — select dropdowns
    curStep = 'style: change font/weight';
    const selects = page.locator('select');
    const selCount = await selects.count().catch(() => 0);
    for (let i = 0; i < Math.min(selCount, 2); i++) {
      try {
        const s = selects.nth(i);
        if (await s.isVisible()) {
          const opts = await s.locator('option').count();
          if (opts > 1) { await s.selectOption({ index: Math.min(1, opts - 1) }); interactions++; await settle(page, 250); }
        }
      } catch {}
    }
    await drainPageErrors(page, surface, vpName, curStep);
    await shot(page, `wizard-${vpName}-style`);

    // SETTINGS tab
    curStep = 'open Settings tab';
    await clickIfVisible(page, `[data-testid="editor-tab-settings"]`, 2500);
    await settle(page, 400); interactions++;
    await drainPageErrors(page, surface, vpName, curStep);
    curStep = 'settings: expand Advanced settings';
    await clickIfVisible(page, page.getByText(/Advanced settings/i), 1500);
    await settle(page, 350); interactions++;
    await drainPageErrors(page, surface, vpName, curStep);
    await shot(page, `wizard-${vpName}-settings`);

    // PUBLISH modal — force-click the visible publish button (there can be a
    // compact + full variant in the DOM; pick the visible one).
    curStep = 'click Publish (quotequick-publish)';
    let pubClicked = false;
    try {
      const pubs = page.locator('[data-testid="quotequick-publish"]');
      const pn = await pubs.count();
      for (let i = 0; i < pn; i++) {
        const pb = pubs.nth(i);
        if (await pb.isVisible().catch(() => false)) {
          await pb.click({ timeout: 2500 });
          pubClicked = true; break;
        }
      }
    } catch (e) { rec(surface, vpName, curStep, 'JS-EXCEPTION', e.message); }
    if (pubClicked) {
      interactions++;
      await settle(page, 600);
      const overlay = page.locator('[data-testid="editor-publish-overlay"]').first();
      const open = await overlay.isVisible({ timeout: 2500 }).catch(() => false);
      if (!open) rec(surface, vpName, curStep, 'BROKEN-BEHAVIOR', 'Publish modal (editor-publish-overlay) did not open');
      await drainPageErrors(page, surface, vpName, curStep);
      await shot(page, `wizard-${vpName}-publish`);
      curStep = 'close Publish modal (editor-publish-close)';
      const closed = await clickIfVisible(page, `[data-testid="editor-publish-close"]`, 2500);
      await settle(page, 400);
      if (closed) {
        const still = await overlay.isVisible({ timeout: 1000 }).catch(() => false);
        if (still) rec(surface, vpName, curStep, 'BROKEN-BEHAVIOR', 'Publish modal did not close');
      } else {
        rec(surface, vpName, curStep, 'BROKEN-BEHAVIOR', 'editor-publish-close not clickable');
      }
      await drainPageErrors(page, surface, vpName, curStep);
    } else {
      rec(surface, vpName, curStep, 'BROKEN-BEHAVIOR', 'quotequick-publish not clickable');
    }

    // HELP overlay — desktop: topbar editor-help button; mobile: editor-tab-help.
    curStep = 'open Help overlay';
    const helpSel = isMobile ? '[data-testid="editor-tab-help"]' : '[data-testid="editor-help"]';
    let helpClicked = false;
    try {
      const helpBtns = page.locator(helpSel);
      const hn = await helpBtns.count();
      for (let i = 0; i < hn; i++) {
        const hb = helpBtns.nth(i);
        if (await hb.isVisible().catch(() => false)) { await hb.click({ timeout: 2500 }); helpClicked = true; break; }
      }
    } catch (e) { rec(surface, vpName, curStep, 'JS-EXCEPTION', e.message); }
    if (helpClicked) {
      interactions++;
      await settle(page, 500);
      const helpOverlay = page.locator('[data-testid="editor-help-overlay"]').first();
      const hOpen = await helpOverlay.isVisible({ timeout: 2500 }).catch(() => false);
      if (!hOpen) rec(surface, vpName, curStep, 'BROKEN-BEHAVIOR', 'Help overlay did not open');
      await drainPageErrors(page, surface, vpName, curStep);
      curStep = 'close Help overlay';
      // close via Got it / close button / Escape
      let closed = await clickIfVisible(page, page.getByRole('button', { name: /got it|close|done/i }), 1500);
      if (!closed) { try { await page.keyboard.press('Escape'); closed = true; } catch {} }
      await settle(page, 400);
      const stillH = await helpOverlay.isVisible({ timeout: 1000 }).catch(() => false);
      if (stillH) rec(surface, vpName, curStep, 'BROKEN-BEHAVIOR', 'Help overlay did not close');
      await drainPageErrors(page, surface, vpName, curStep);
    } else {
      rec(surface, vpName, curStep, 'BROKEN-BEHAVIOR', `help control (${helpSel}) not clickable`);
    }

    // Undo / redo / theme toggle
    curStep = 'undo / redo';
    if (await clickIfVisible(page, `[data-testid="editor-undo"]`, 1500)) { interactions++; await settle(page, 250); }
    if (await clickIfVisible(page, `[data-testid="editor-redo"]`, 1500)) { interactions++; await settle(page, 250); }
    await drainPageErrors(page, surface, vpName, curStep);
    curStep = 'theme toggle (day/night)';
    if (await clickIfVisible(page, `[data-testid="editor-theme-toggle"]`, 1500)) { interactions++; await settle(page, 300); }
    if (await clickIfVisible(page, `[data-testid="editor-theme-toggle"]`, 1500)) { interactions++; await settle(page, 300); }
    await drainPageErrors(page, surface, vpName, curStep);

  } catch (e) {
    rec(surface, vpName, curStep, 'JS-EXCEPTION', `harness: ${e.message}`);
    await shot(page, `wizard-${vpName}-harness-error`);
  } finally {
    rec(surface, vpName, `TOTAL`, 'INFO', `${interactions} interactions performed`);
    await ctx.close();
  }
}

// ========================================================================
// 2. Quote widget on /templates/<id>
// ========================================================================
async function auditWidget(browser, slug, viewport, vpName) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(INIT_SCRIPT);
  const page = await ctx.newPage();
  const surface = `widget /templates/${slug}`;
  let curStep = 'load';
  attach(page, () => ({ surface, viewport: vpName, step: () => curStep }));
  let interactions = 0;
  let nanSeen = false;

  // Scope to the live widget. The marketing page renders a preview calculator;
  // target the calculator container, falling back to main content.
  try {
    curStep = `navigate /templates/${slug}`;
    await page.goto(`${BASE}/templates/${slug}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await settle(page, 1400);
    await drainPageErrors(page, surface, vpName, curStep);

    // find a widget scope — the live preview widget is data-testid=advanced-calculator
    const scopeCandidates = [
      '[data-testid="advanced-calculator"]',
      '[data-testid="calculator-renderer"]',
      '[data-testid="quotequick-widget"]',
    ];
    let scope = page;
    for (const sel of scopeCandidates) {
      const l = page.locator(sel).first();
      if (await l.count() && await l.isVisible().catch(() => false)) { scope = l; break; }
    }
    if (scope === page) rec(surface, vpName, curStep, 'BROKEN-BEHAVIOR', 'widget scope (advanced-calculator) not found — using page');

    const root = scope === page ? page.locator('main') : scope;

    async function checkNaN(label) {
      // scan the RESULT panel + whole widget text for NaN/undefined/$NaN
      try {
        const resultLoc = page.locator('[data-testid="advanced-result"]');
        const resultTxt = (await resultLoc.count()) ? await resultLoc.first().innerText({ timeout: 1500 }).catch(() => '') : '';
        const txt = await (scope === page ? page.locator('body') : scope).innerText({ timeout: 2000 });
        const combined = resultTxt + '\n' + txt;
        if (/\bNaN\b|\$NaN|\bundefined\b|\$undefined/.test(combined)) {
          nanSeen = true;
          rec(surface, vpName, label, 'BROKEN-BEHAVIOR', `Result contains NaN/undefined: result="${resultTxt}" ctx="${(combined.match(/.{0,30}(NaN|undefined).{0,20}/) || [''])[0]}"`);
          await shot(page, `widget-${slug}-${vpName}-NaN`);
        }
      } catch {}
    }

    // selects
    curStep = 'change selects';
    const selects = root.locator('select');
    const selN = await selects.count().catch(() => 0);
    for (let i = 0; i < selN; i++) {
      try {
        const s = selects.nth(i);
        if (!(await s.isVisible())) continue;
        const opts = await s.locator('option').count();
        if (opts > 1) { await s.selectOption({ index: opts - 1 }); interactions++; await settle(page, 250); await checkNaN(curStep); }
      } catch {}
    }
    await drainPageErrors(page, surface, vpName, curStep);

    // radio / option buttons (segmented select options often rendered as buttons)
    curStep = 'click option/radio buttons';
    const optButtons = root.locator('button[role="radio"], [role="radio"], button[aria-pressed], [data-testid^="opt-"], [data-testid^="adv-multiselect-option-"], [data-testid^="adv-select-option-"], button[data-value]');
    const obN = Math.min(await optButtons.count().catch(() => 0), 24);
    for (let i = 0; i < obN; i++) {
      try { const b = optButtons.nth(i); if (await b.isVisible()) { await b.click({ timeout: 1200 }); interactions++; await settle(page, 150); } } catch {}
    }
    if (obN) { await checkNaN(curStep); await drainPageErrors(page, surface, vpName, curStep); }

    // sliders
    curStep = 'drag sliders';
    const sliders = root.locator('input[type="range"], [role="slider"]');
    const slN = await sliders.count().catch(() => 0);
    for (let i = 0; i < slN; i++) {
      try {
        const sl = sliders.nth(i);
        if (!(await sl.isVisible())) continue;
        await sl.focus();
        for (let k = 0; k < 6; k++) { await page.keyboard.press('ArrowRight'); }
        await page.keyboard.press('End');
        await page.keyboard.press('Home');
        for (let k = 0; k < 4; k++) { await page.keyboard.press('ArrowRight'); }
        interactions++; await settle(page, 200); await checkNaN(curStep);
      } catch {}
    }
    await drainPageErrors(page, surface, vpName, curStep);

    // multi-select / checkboxes / toggles inside widget
    curStep = 'toggle checkboxes/multiselect/switches';
    const toggles = root.locator('input[type="checkbox"], [role="checkbox"], [role="switch"]');
    const tN = Math.min(await toggles.count().catch(() => 0), 12);
    for (let i = 0; i < tN; i++) {
      try { const t = toggles.nth(i); if (await t.isVisible()) { await t.click({ timeout: 1200 }); interactions++; await settle(page, 150); } } catch {}
    }
    if (tN) { await checkNaN(curStep); await drainPageErrors(page, surface, vpName, curStep); }

    // number / text inputs (quantity etc.)
    curStep = 'fill number/text inputs';
    const numInputs = root.locator('input[type="number"], input[inputmode="numeric"]');
    const niN = Math.min(await numInputs.count().catch(() => 0), 6);
    for (let i = 0; i < niN; i++) {
      try { const n = numInputs.nth(i); if (await n.isVisible()) { await n.fill('5'); interactions++; await settle(page, 200); } } catch {}
    }
    if (niN) { await checkNaN(curStep); await drainPageErrors(page, surface, vpName, curStep); }

    // recompute / final NaN scan
    curStep = 'final result scan';
    await settle(page, 400);
    await checkNaN(curStep);

    // CTA / lead form
    curStep = 'click CTA / open lead form';
    const cta = root.locator('[data-testid^="advanced-cta"], [data-testid="calc-cta"], button:has-text("Get"), button:has-text("Quote"), button:has-text("Continue"), button:has-text("Book"), a:has-text("Get my")').first();
    if (await clickIfVisible(page, cta, 1500)) { interactions++; await settle(page, 500); await checkNaN(curStep); }
    await drainPageErrors(page, surface, vpName, curStep);
    await shot(page, `widget-${slug}-${vpName}-final`);

  } catch (e) {
    rec(surface, vpName, curStep, 'JS-EXCEPTION', `harness: ${e.message}`);
    await shot(page, `widget-${slug}-${vpName}-harness-error`);
  } finally {
    rec(surface, vpName, `TOTAL`, 'INFO', `${interactions} interactions performed; NaN/undefined seen=${nanSeen}`);
    await ctx.close();
  }
  return nanSeen;
}

// ========================================================================
// 3. /pricing
// ========================================================================
async function auditPricing(browser, viewport, vpName) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(INIT_SCRIPT);
  const page = await ctx.newPage();
  const surface = '/pricing';
  let curStep = 'load';
  attach(page, () => ({ surface, viewport: vpName, step: () => curStep }));
  let interactions = 0;
  try {
    curStep = 'navigate /pricing';
    await page.goto(`${BASE}/pricing`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await settle(page, 1200);
    await drainPageErrors(page, surface, vpName, curStep);

    // Monthly/Yearly toggle
    curStep = 'toggle Monthly/Yearly';
    for (const label of ['Yearly', 'Annual', 'Monthly', 'Yearly']) {
      const b = page.getByRole('button', { name: new RegExp(`^${label}`, 'i') }).first();
      if (await clickIfVisible(page, b, 1200)) { interactions++; await settle(page, 300); }
    }
    // also a switch-style toggle
    const sw = page.locator('[role="switch"]').first();
    if (await clickIfVisible(page, sw, 1000)) { interactions++; await settle(page, 300); }
    await drainPageErrors(page, surface, vpName, curStep);

    // info / learn more modals
    curStep = 'open info / learn more modal';
    const info = page.getByRole('button', { name: /learn more|details|info|compare|what's included|whats included/i }).first();
    if (await clickIfVisible(page, info, 1200)) {
      interactions++; await settle(page, 400);
      // close
      let closed = await clickIfVisible(page, page.getByRole('button', { name: /close|got it|done|×/i }), 1200);
      if (!closed) { try { await page.keyboard.press('Escape'); } catch {} }
      await settle(page, 300);
    }
    await drainPageErrors(page, surface, vpName, curStep);

    // accordions (FAQ)
    curStep = 'expand/collapse accordions';
    const acc = page.locator('button[aria-expanded], [role="button"][aria-expanded], summary');
    const aN = Math.min(await acc.count().catch(() => 0), 8);
    for (let i = 0; i < aN; i++) {
      try { const a = acc.nth(i); if (await a.isVisible()) { await a.click({ timeout: 1000 }); interactions++; await settle(page, 150); } } catch {}
    }
    await drainPageErrors(page, surface, vpName, curStep);

    // plan CTA (do not complete checkout) — click, capture errors, then go back if navigated
    curStep = 'click a plan CTA (no checkout completion)';
    const before = page.url();
    const planCta = page.getByRole('link', { name: /get started|choose|start|select plan|subscribe|buy/i }).first();
    const planCtaBtn = page.getByRole('button', { name: /get started|choose|start|select plan|subscribe|buy/i }).first();
    let target = (await planCta.count()) ? planCta : planCtaBtn;
    try {
      if (await target.first().isVisible({ timeout: 1500 })) {
        await target.first().click({ timeout: 2500 }).catch(() => {});
        interactions++;
        await settle(page, 800);
        await drainPageErrors(page, surface, vpName, curStep);
        if (page.url() !== before) {
          // navigated to checkout/stripe — confirm no error, then leave
          await page.goto(`${BASE}/pricing`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        }
      }
    } catch (e) { rec(surface, vpName, curStep, 'JS-EXCEPTION', e.message); }
    await shot(page, `pricing-${vpName}-final`);
    await drainPageErrors(page, surface, vpName, curStep);
  } catch (e) {
    rec(surface, vpName, curStep, 'JS-EXCEPTION', `harness: ${e.message}`);
    await shot(page, `pricing-${vpName}-harness-error`);
  } finally {
    rec(surface, vpName, `TOTAL`, 'INFO', `${interactions} interactions performed`);
    await ctx.close();
  }
}

// ========================================================================
// 4. /products/* (desktop)
// ========================================================================
async function auditProduct(browser, path, viewport, vpName) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(INIT_SCRIPT);
  const page = await ctx.newPage();
  const surface = path;
  let curStep = 'load';
  attach(page, () => ({ surface, viewport: vpName, step: () => curStep }));
  let interactions = 0;
  try {
    curStep = `navigate ${path}`;
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await settle(page, 1200);
    await drainPageErrors(page, surface, vpName, curStep);

    // open modals/carousels
    curStep = 'click modal/carousel/tab triggers';
    const triggers = page.locator('button[aria-expanded], button[aria-controls], [role="tab"], button:has-text("Learn"), button:has-text("See"), button:has-text("Watch"), [aria-label*="next" i], [aria-label*="prev" i], button:has-text("Demo")');
    const trN = Math.min(await triggers.count().catch(() => 0), 12);
    for (let i = 0; i < trN; i++) {
      try {
        const t = triggers.nth(i);
        if (await t.isVisible()) {
          const before = page.url();
          await t.click({ timeout: 1200 }).catch(() => {});
          interactions++; await settle(page, 250);
          if (page.url() !== before) { await page.goBack().catch(() => {}); await settle(page, 400); }
        }
      } catch {}
    }
    await drainPageErrors(page, surface, vpName, curStep);

    // close any opened modal
    curStep = 'close modal';
    let closed = await clickIfVisible(page, page.getByRole('button', { name: /close|got it|done|×/i }), 1000);
    if (!closed) { try { await page.keyboard.press('Escape'); } catch {} }
    await settle(page, 300);
    await drainPageErrors(page, surface, vpName, curStep);
    await shot(page, `product-${path.replace(/\W+/g, '_')}-${vpName}-final`);
  } catch (e) {
    rec(surface, vpName, curStep, 'JS-EXCEPTION', `harness: ${e.message}`);
  } finally {
    rec(surface, vpName, `TOTAL`, 'INFO', `${interactions} interactions performed`);
    await ctx.close();
  }
}

// ========================================================================
async function main() {
  const browser = await chromium.launch({ headless: true });

  // 1. wizard editor desktop + mobile
  await auditWizard(browser, DESKTOP, 'desktop');
  await auditWizard(browser, MOBILE, 'mobile');

  // 2. widgets
  for (const slug of ['car_towing', 'plumbing_service', 'mobile_car_detail']) {
    await auditWidget(browser, slug, DESKTOP, 'desktop');
    await auditWidget(browser, slug, MOBILE, 'mobile');
  }

  // 3. pricing
  await auditPricing(browser, DESKTOP, 'desktop');
  await auditPricing(browser, MOBILE, 'mobile');

  // 4. products (desktop)
  await auditProduct(browser, '/products/quotequick', DESKTOP, 'desktop');
  await auditProduct(browser, '/products/tradeline-complete', DESKTOP, 'desktop');

  await browser.close();

  writeFileSync(join(SHOT, 'results.json'), JSON.stringify(results, null, 2));

  // print summary
  console.log('\n================ SUMMARY ================');
  const bugs = results.filter((r) => r.tag !== 'INFO');
  if (!bugs.length) console.log('No non-network errors recorded across all surfaces.');
  for (const b of bugs) console.log(`[${b.tag}] ${b.surface} (${b.viewport}) @ ${b.step} :: ${b.message}`);
  console.log('\n--- INFO (interaction counts) ---');
  for (const r of results.filter((r) => r.tag === 'INFO')) console.log(`${r.surface} (${r.viewport}): ${r.message}`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
