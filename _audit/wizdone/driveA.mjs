// Standalone Playwright driver — comprehensive functional audit of QuoteQuick wizard.
// Read-only. Captures console errors + screenshots. Continues past step failures.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/wizdone/A';
const URL = 'http://localhost:5099/wizard';
fs.mkdirSync(OUT, { recursive: true });

const log = [];
const consoleErrors = [];
const pageErrors = [];
function rec(step, status, note) {
  const line = `[${status}] ${step}${note ? ' :: ' + note : ''}`;
  log.push(line);
  console.log(line);
}

// noise filter: ignore backend fetch failures (no backend on preview)
function isNoise(t) {
  return /Failed to load resource|net::ERR|fetch|Failed to fetch|ECONNREFUSED|500 \(|404 \(|the server responded|Unexpected token '<'|<!DOCTYPE|status of 5|status of 4|NetworkError|AbortError|api\//i.test(t);
}

async function shot(page, name) {
  try { await page.screenshot({ path: path.join(OUT, name), fullPage: false }); }
  catch (e) { rec('screenshot ' + name, 'WARN', e.message); }
}

async function tryClick(page, sel, step, opts = {}) {
  try {
    const loc = typeof sel === 'string' ? page.locator(sel) : sel;
    await loc.first().click({ timeout: opts.timeout || 4000 });
    rec(step, 'OK');
    return true;
  } catch (e) {
    rec(step, 'FAIL', e.message.split('\n')[0]);
    return false;
  }
}

async function exists(page, sel) {
  try { return await page.locator(sel).first().isVisible({ timeout: 1500 }); }
  catch { return false; }
}

async function run() {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/Owner/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
    headless: true,
  });

  // ============ DESKTOP 1440 ============
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !isNoise(m.text())) consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => { if (!isNoise(e.message)) pageErrors.push(e.message.slice(0, 300)); });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3500);
  const shellUp = await exists(page, '[data-testid="quotequick-editor-shell"]');
  rec('shell loads (desktop)', shellUp ? 'OK' : 'FAIL', shellUp ? '' : 'editor shell not visible');
  await shot(page, 'd-00-initial.png');

  // ---- BUILD TAB ----
  await tryClick(page, '[data-testid="editor-tab-build"]', 'open Build tab');
  await page.waitForTimeout(600);
  await shot(page, 'd-01-build.png');

  // Add each field type via + add menu
  const fieldTypes = ['Slider', 'Number', 'Dropdown', 'Choice', 'Image choice', 'Heading'];
  for (const ft of fieldTypes) {
    const opened = await tryClick(page, '[data-testid="add-field-trigger"]', `open add-field menu for ${ft}`);
    if (opened) {
      await page.waitForTimeout(400);
      try {
        await page.locator('[data-testid="add-field-menu"]').getByText(ft, { exact: true }).first().click({ timeout: 3000 });
        rec(`add field: ${ft}`, 'OK');
      } catch (e) {
        rec(`add field: ${ft}`, 'FAIL', e.message.split('\n')[0]);
        await page.keyboard.press('Escape').catch(()=>{});
      }
      await page.waitForTimeout(500);
    }
  }
  await shot(page, 'd-02-fields-added.png');

  // Count field rows
  const fieldRows = await page.locator('[data-testid^="field-row-"]').count();
  rec('field rows present after adds', fieldRows > 0 ? 'OK' : 'FAIL', `count=${fieldRows}`);

  // Edit first field — click it to open editor
  try {
    await page.locator('[data-testid^="field-row-"]').first().click({ timeout: 3000 });
    await page.waitForTimeout(600);
    rec('open field editor (click row)', 'OK');
    await shot(page, 'd-03-field-edit.png');
  } catch (e) { rec('open field editor', 'FAIL', e.message.split('\n')[0]); }

  // Try delete via kebab
  const kebab = page.locator('[data-testid^="row-kebab"], [data-testid*="kebab"]').first();
  if (await exists(page, '[data-testid*="kebab"]')) {
    await tryClick(page, '[data-testid*="kebab"]', 'open row kebab menu');
    await page.waitForTimeout(400);
    await shot(page, 'd-04-kebab.png');
    await page.keyboard.press('Escape').catch(()=>{});
  } else {
    rec('row kebab menu', 'WARN', 'no kebab testid found on rows');
  }

  // AI Generate card
  if (await exists(page, '[data-testid="build-ai-card"]')) {
    rec('AI generate card present', 'OK');
    try {
      await page.locator('[data-testid="build-ai-prompt"]').fill('Quote for lawn mowing by area', { timeout: 3000 });
      rec('AI prompt input fillable', 'OK');
      await shot(page, 'd-05-ai-card.png');
    } catch (e) { rec('AI prompt input', 'FAIL', e.message.split('\n')[0]); }
  } else { rec('AI generate card', 'WARN', 'build-ai-card not visible'); }

  // Template gallery / Browse all
  if (await exists(page, '[data-testid="template-browse-all"]')) {
    await tryClick(page, '[data-testid="template-browse-all"]', 'open Browse all templates');
    await page.waitForTimeout(800);
    const grid = await exists(page, '[data-testid="template-browse-grid"]');
    rec('template browse modal grid', grid ? 'OK' : 'FAIL');
    await shot(page, 'd-06-template-browse.png');
    await tryClick(page, '[data-testid="template-browse-close"]', 'close template browse');
  } else { rec('template-browse-all', 'WARN', 'not visible'); }

  // Business name + logo
  if (await exists(page, '[data-testid="input-business-name"]')) {
    try { await page.locator('[data-testid="input-business-name"]').fill('Acme Test Co', { timeout: 3000 }); rec('business name input', 'OK'); }
    catch (e) { rec('business name input', 'FAIL', e.message.split('\n')[0]); }
  } else { rec('business name input', 'WARN', 'not visible'); }
  rec('logo upload control present', await exists(page, '[data-testid="editor-logo-upload"]') ? 'OK' : 'WARN');

  // Pricing / Calculations
  await page.waitForTimeout(300);
  const hasCalcPanel = await exists(page, '[data-testid="editor-calculations-panel"]');
  rec('calculations panel present', hasCalcPanel ? 'OK' : 'WARN');
  if (await exists(page, '[data-testid="add-calculation-trigger-empty"]') || await exists(page, '[data-testid="add-calculation-trigger"]')) {
    const t = (await exists(page, '[data-testid="add-calculation-trigger-empty"]')) ? '[data-testid="add-calculation-trigger-empty"]' : '[data-testid="add-calculation-trigger"]';
    await tryClick(page, t, 'add calculation');
    await page.waitForTimeout(700);
    await shot(page, 'd-07-calc-added.png');
    // Open FormulaEditor — look for formula-related testids/buttons
    const calcRows = await page.locator('[data-testid="editor-calculations-list"] >> *').count().catch(()=>0);
    rec('calculation row created', 'OK', `listChildren=${calcRows}`);
  } else { rec('add calculation trigger', 'WARN', 'not visible'); }

  // Header/Results panel
  rec('header/results panel', await exists(page, '[data-testid="editor-headerresults-panel"]') ? 'OK' : 'WARN');

  // ---- ACTION TAB ----
  await tryClick(page, '[data-testid="editor-tab-action"]', 'open Action tab');
  await page.waitForTimeout(600);
  await shot(page, 'd-10-action.png');
  rec('action mode segmented', await exists(page, '[data-testid="action-segmented-mode"]') ? 'OK' : 'WARN');
  // mode groups
  for (const g of ['redirect','cta','fields','submit','spam','payment','email','booking','soon']) {
    rec(`action group: ${g}`, await exists(page, `[data-testid="action-group-${g}"]`) ? 'present' : 'absent');
  }
  // spam toggle
  if (await exists(page, '[data-testid="action-spam-enabled"]')) await tryClick(page, '[data-testid="action-spam-enabled"]', 'toggle spam protection');

  // ---- STYLE TAB ----
  await tryClick(page, '[data-testid="editor-tab-style"]', 'open Style tab');
  await page.waitForTimeout(600);
  await shot(page, 'd-20-style.png');
  for (const g of ['theme','typography','colours','layout','shape','branding','brand-kit','brand-studio','trust-badges','floating-launcher']) {
    rec(`style group: ${g}`, await exists(page, `[data-testid="style-group-${g}"]`) ? 'present' : 'absent');
  }
  rec('theme presets', await exists(page, '[data-testid="style-theme-presets"]') ? 'OK' : 'WARN');
  rec('colour swatches', await exists(page, '[data-testid="style-swatches-row"]') ? 'OK' : 'WARN');

  // ---- SETTINGS TAB ----
  await tryClick(page, '[data-testid="editor-tab-settings"]', 'open Settings tab');
  await page.waitForTimeout(600);
  await shot(page, 'd-30-settings.png');
  for (const g of ['numberformat','pricing','deposit','scheduling','trade','business-profile','brand-badge']) {
    rec(`settings group: ${g}`, await exists(page, `[data-testid="settings-group-${g}"]`) ? 'present' : 'absent');
  }

  // ---- INSTALL/PUBLISH ----
  await tryClick(page, '[data-testid="editor-tab-install"]', 'open Install tab');
  await page.waitForTimeout(600);
  await shot(page, 'd-40-install.png');
  rec('install hosted section', await exists(page, '[data-testid="install-section-hosted"]') ? 'OK' : 'WARN');
  rec('install embed snippet', await exists(page, '[data-testid="install-embed-snippet"]') ? 'OK' : 'WARN');

  // Publish modal
  if (await exists(page, '[data-testid="quotequick-publish"]')) {
    await tryClick(page, '[data-testid="quotequick-publish"]', 'open Publish modal');
    await page.waitForTimeout(800);
    rec('publish overlay', await exists(page, '[data-testid="editor-publish-overlay"]') ? 'OK' : 'WARN');
    await shot(page, 'd-41-publish.png');
    await tryClick(page, '[data-testid="editor-publish-close"]', 'close Publish modal');
  } else { rec('publish button', 'WARN', 'not visible'); }

  // ---- Undo/redo, theme toggle, save draft, help ----
  rec('undo button', await exists(page, '[data-testid="editor-undo"]') ? 'OK' : 'WARN');
  rec('redo button', await exists(page, '[data-testid="editor-redo"]') ? 'OK' : 'WARN');
  if (await exists(page, '[data-testid="editor-undo"]')) await tryClick(page, '[data-testid="editor-undo"]', 'click undo');
  if (await exists(page, '[data-testid="editor-redo"]')) await tryClick(page, '[data-testid="editor-redo"]', 'click redo');
  if (await exists(page, '[data-testid="editor-theme-toggle"]')) { await tryClick(page, '[data-testid="editor-theme-toggle"]', 'toggle day/night'); await page.waitForTimeout(400); await shot(page, 'd-50-theme-toggle.png'); }
  if (await exists(page, '[data-testid="quotequick-save-draft"]')) await tryClick(page, '[data-testid="quotequick-save-draft"]', 'save draft');
  if (await exists(page, '[data-testid="editor-rail-help"]')) { await tryClick(page, '[data-testid="editor-rail-help"]', 'open help overlay'); await page.waitForTimeout(400); rec('help overlay', await exists(page, '[data-testid="editor-help-overlay"]') ? 'OK' : 'WARN'); await shot(page, 'd-51-help.png'); await page.keyboard.press('Escape').catch(()=>{}); }

  // ---- Live preview / empty state ----
  rec('preview pane', await exists(page, '[data-testid="editor-preview-pane"]') ? 'OK' : 'FAIL');
  // capture preview text to scan for NaN/undefined
  let previewText = '';
  try { previewText = await page.locator('[data-testid="editor-preview-pane"]').innerText({ timeout: 3000 }); } catch {}
  const badTokens = (previewText.match(/NaN|undefined|null|\[object Object\]/g) || []);
  rec('preview NaN/undefined scan', badTokens.length === 0 ? 'OK' : 'FAIL', badTokens.length ? `found: ${[...new Set(badTokens)].join(',')}` : 'clean');

  await shot(page, 'd-99-final.png');
  await ctx.close();

  // ============ MOBILE 390 ============
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = mctx.newPage ? await mctx.newPage() : null;
  const m = mp;
  m.on('console', (mm) => { if (mm.type() === 'error' && !isNoise(mm.text())) consoleErrors.push('[mobile] ' + mm.text().slice(0, 250)); });
  m.on('pageerror', (e) => { if (!isNoise(e.message)) pageErrors.push('[mobile] ' + e.message.slice(0, 250)); });
  await m.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await m.waitForTimeout(3500);
  rec('shell loads (mobile)', await exists(m, '[data-testid="quotequick-editor-shell"]') ? 'OK' : 'FAIL');
  await m.screenshot({ path: path.join(OUT, 'm-00-initial.png') });

  // bottom tab bar -> open a tab as sheet
  rec('mobile bottom tab bar', await exists(m, '[data-testid="editor-tabs"]') || await exists(m, '[data-testid*="bottom"]') ? 'present' : 'absent');
  // try opening build tab on mobile
  if (await exists(m, '[data-testid="editor-tab-build"]')) {
    await tryClick(m, '[data-testid="editor-tab-build"]', '[mobile] open Build tab');
    await m.waitForTimeout(700);
    rec('mobile bottom sheet opens', await exists(m, '[data-testid="wizard-bottom-sheet"]') ? 'OK' : 'WARN');
    await m.screenshot({ path: path.join(OUT, 'm-01-build-sheet.png') });
    // close sheet
    if (await exists(m, '[data-testid="wizard-sheet-close"]')) await tryClick(m, '[data-testid="wizard-sheet-close"]', '[mobile] close sheet');
    else if (await exists(m, '[data-testid="wizard-sheet-done"]')) await tryClick(m, '[data-testid="wizard-sheet-done"]', '[mobile] done sheet');
  }
  await m.screenshot({ path: path.join(OUT, 'm-99-final.png') });
  await mctx.close();

  await browser.close();

  // ---- write report ----
  const report = {
    timestamp: new Date().toISOString(),
    steps: log,
    consoleErrors: [...new Set(consoleErrors)],
    pageErrors: [...new Set(pageErrors)],
  };
  fs.writeFileSync(path.join(OUT, 'driveA-result.json'), JSON.stringify(report, null, 2));
  console.log('\n===== CONSOLE ERRORS (filtered) =====');
  console.log([...new Set(consoleErrors)].join('\n') || '(none)');
  console.log('\n===== PAGE ERRORS =====');
  console.log([...new Set(pageErrors)].join('\n') || '(none)');
}

run().catch((e) => { console.error('DRIVER CRASH:', e); process.exit(1); });
