import { chromium, devices } from 'playwright';

const BASE = 'http://localhost:5099';
const OUT = 'C:/Users/Owner/.codex/wt-preview/_vr4';

const results = { desktop: {}, mobile: {} };

function logErr(ctx, page) {
  page.on('pageerror', (e) => console.log(`[${ctx}] pageerror:`, e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[${ctx}] console.error:`, m.text()); });
}

async function inspectOverlay(page, ctx) {
  const r = {};
  const overlay = page.locator('[data-testid="editor-help-overlay"]');
  r.overlayVisible = await overlay.isVisible().catch(() => false);

  const get = page.locator('[data-testid="help-action-get-help"]');
  const feat = page.locator('[data-testid="help-action-request-feature"]');

  r.getHelpExists = (await get.count()) > 0;
  r.featExists = (await feat.count()) > 0;
  r.getHelpVisible = await get.isVisible().catch(() => false);
  r.featVisible = await feat.isVisible().catch(() => false);

  r.getHelpTag = await get.evaluate(el => el.tagName).catch(() => null);
  r.featTag = await feat.evaluate(el => el.tagName).catch(() => null);
  r.getHelpHref = await get.getAttribute('href').catch(() => null);
  r.featHref = await feat.getAttribute('href').catch(() => null);

  r.getHelpText = (await get.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  r.featText = (await feat.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

  // icon presence (svg or img inside card)
  r.getHelpHasIcon = (await get.locator('svg, img').count().catch(() => 0)) > 0;
  r.featHasIcon = (await feat.locator('svg, img').count().catch(() => 0)) > 0;

  // header text inside overlay
  r.overlayText = (await overlay.innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 300);

  // clipping check: overlay bounding box within viewport
  const vp = page.viewportSize();
  const box = await overlay.boundingBox().catch(() => null);
  if (box && vp) {
    r.clipped = box.x < -1 || box.y < -1 || (box.x + box.width) > vp.width + 1 || (box.y + box.height) > vp.height + 1;
    r.box = { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height), vp };
  }

  // contrast: sample bg vs text color of a card
  r.colors = await get.evaluate(el => {
    const cs = getComputedStyle(el);
    return { color: cs.color, bg: cs.backgroundColor };
  }).catch(() => null);

  return r;
}

// ---------------- DESKTOP ----------------
async function runDesktop() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  logErr('desktop', page);
  await page.goto(`${BASE}/wizard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Try the top-bar help button first
  const r = { open: {} };
  const helpBtn = page.locator('[data-testid="editor-help"]');
  const railHelp = page.locator('[data-testid="editor-tab-help"]');
  r.open.topHelpExists = (await helpBtn.count()) > 0;
  r.open.railHelpExists = (await railHelp.count()) > 0;

  let opened = false;
  if (await helpBtn.count() > 0 && await helpBtn.isVisible().catch(() => false)) {
    await helpBtn.click();
    await page.waitForTimeout(600);
    opened = await page.locator('[data-testid="editor-help-overlay"]').isVisible().catch(() => false);
    r.open.via = 'editor-help (top bar)';
  }
  if (!opened && await railHelp.count() > 0) {
    await railHelp.click({ force: true }).catch(() => {});
    await page.waitForTimeout(600);
    opened = await page.locator('[data-testid="editor-help-overlay"]').isVisible().catch(() => false);
    r.open.via = 'editor-tab-help (rail)';
  }
  r.open.opened = opened;

  Object.assign(r, await inspectOverlay(page, 'desktop'));
  await page.screenshot({ path: `${OUT}/desktop-help.png`, fullPage: false });

  // Close via Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  let closed = !(await page.locator('[data-testid="editor-help-overlay"]').isVisible().catch(() => false));
  r.closedViaEscape = closed;

  // If escape didn't close, try a close/got-it button
  if (!closed) {
    const btn = page.getByRole('button', { name: /got it|close|done/i }).first();
    if (await btn.count() > 0) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(400);
      r.closedViaButton = !(await page.locator('[data-testid="editor-help-overlay"]').isVisible().catch(() => false));
    }
  }

  results.desktop = r;
  await browser.close();
}

// ---------------- MOBILE ----------------
async function runMobile() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    userAgent: devices['Pixel 7']?.userAgent || 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  });
  const page = await context.newPage();
  logErr('mobile', page);
  await page.goto(`${BASE}/wizard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const r = { open: {} };
  const tabHelp = page.locator('[data-testid="editor-tab-help"]');
  r.open.tabHelpCount = await tabHelp.count();

  let opened = false;
  if (await tabHelp.count() > 0) {
    await tabHelp.last().tap().catch(async () => { await tabHelp.last().click({ force: true }); });
    await page.waitForTimeout(700);
    opened = await page.locator('[data-testid="editor-help-overlay"]').isVisible().catch(() => false);
  }
  r.open.opened = opened;

  Object.assign(r, await inspectOverlay(page, 'mobile'));
  await page.screenshot({ path: `${OUT}/mobile-help.png`, fullPage: false });

  // Close
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  let closed = !(await page.locator('[data-testid="editor-help-overlay"]').isVisible().catch(() => false));
  if (!closed) {
    const btn = page.getByRole('button', { name: /got it|close|done/i }).first();
    if (await btn.count() > 0) { await btn.tap().catch(() => btn.click({ force: true })); await page.waitForTimeout(400); }
    closed = !(await page.locator('[data-testid="editor-help-overlay"]').isVisible().catch(() => false));
  }
  r.closed = closed;

  results.mobile = r;
  await browser.close();
}

await runDesktop();
await runMobile();
console.log('=== RESULTS ===');
console.log(JSON.stringify(results, null, 2));
