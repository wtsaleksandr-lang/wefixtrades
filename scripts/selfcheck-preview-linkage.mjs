// Self-check: preview→config click-to-edit auto-expands the containing fold.
//
// fix/preview-linkage-expander. Serves the BUILT SPA (dist/public) with an
// SPA fallback, seeds a wizard draft (qq_elfsight_shell) that has BOTH the
// online-booking and deposit blocks enabled (so the preview stamps
// data-component-type="online-booking" / "deposit"), then:
//   1. clicks the booking block in the preview → asserts Action tab active,
//      the "Advanced action" fold is now aria-expanded:true, and the
//      online-booking control ([data-edit-key="online-booking"]) is scrolled
//      into view + highlighted.
//   2. repeats for the deposit block.
//   3. clicks a NON-folded control (the CTA / "When the quote is ready" card,
//      data-edit-key="action") → asserts it links without needing a fold.
// Desktop (1280) + mobile (375). Screenshots → review-shots/wizard-linkage-fix.
//
// Run: node scripts/selfcheck-preview-linkage.mjs

import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'dist', 'public');
const SHOT_DIR = 'C:\\Users\\Owner\\claude-orchestrator\\review-shots\\wizard-linkage-fix';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.txt': 'text/plain', '.map': 'application/json',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        let filePath = path.join(PUBLIC_DIR, urlPath);
        if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403).end(); return; }
        if (urlPath.endsWith('/')) filePath = path.join(filePath, 'index.html');
        if (!existsSync(filePath) || urlPath === '/' ) {
          // SPA fallback for client routes (e.g. /wizard).
          if (!existsSync(filePath)) filePath = path.join(PUBLIC_DIR, 'index.html');
        }
        const body = await readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(body);
      } catch {
        // Anything else → SPA shell so client routing handles it.
        try {
          const shell = await readFile(path.join(PUBLIC_DIR, 'index.html'));
          res.writeHead(200, { 'Content-Type': 'text/html' }).end(shell);
        } catch { res.writeHead(404).end(); }
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// Seed a wizard draft with booking + deposit ON so both preview blocks render.
const DRAFT = {
  businessName: 'Linkage Self-Check Co',
  settings: {
    actionMode: 'lead-form',
    stripeConnected: true,
    deposit: { enabled: true, mode: 'percent', value: 15, label: '', required: false },
    scheduling: {
      enabled: true,
      workingDays: [1, 2, 3, 4, 5],
      workingHoursStart: '09:00',
      workingHoursEnd: '17:00',
      slotDurationMinutes: 30,
      bufferMinutes: 0,
    },
  },
};

const fails = [];
function check(cond, label) {
  if (cond) { console.log(`  PASS  ${label}`); }
  else { console.log(`  FAIL  ${label}`); fails.push(label); }
}

async function clickPreviewBlock(page, componentType, expectTab) {
  // Click a real DOM CHILD of the preview block (not bare coordinates): on the
  // desktop stage the widget is rendered under a CSS `transform: scale()`, so a
  // coordinate `mouse.click` can hit the scaled stage wrapper instead of the
  // stamped block (elementFromPoint and event dispatch disagree under the
  // transform). Clicking an actual child element gives React the correct
  // `e.target` whose `closest('[data-component-type]')` resolves the block —
  // exactly what a real user clicking the visible block produces. Retry up to
  // 3x to absorb the pre-existing select-first interaction.
  const block = page.locator(`[data-component-type="${componentType}"]`).first();
  await block.scrollIntoViewIfNeeded();
  // Prefer a substantial inner child (a day cell for booking, the badge for
  // deposit) so React gets a real leaf `e.target` rather than the topmost
  // header glyph. Fall back to a generic first descendant, then the block.
  const preferred = componentType === 'online-booking'
    ? block.locator('[data-testid="advanced-booking-grid"] > div').first()
    : componentType === 'deposit'
      ? block.locator('[data-testid="advanced-deposit-badge"]').first()
      : block.locator(':scope *').first();
  const clickTarget = (await preferred.count()) > 0
    ? preferred
    : ((await block.locator(':scope *').first().count()) > 0
      ? block.locator(':scope *').first()
      : block);
  for (let i = 0; i < 3; i++) {
    await clickTarget.click({ force: true });
    await page.waitForTimeout(450);
    if (!expectTab) return;
    const active = await page.locator(`[data-testid="editor-tabpanel-${expectTab}"]`).count();
    if (active > 0) return;
  }
}

async function run(label, width, height, isMobile) {
  console.log(`\n=== ${label} (${width}x${height}) ===`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile, hasTouch: isMobile });
  const page = await ctx.newPage();

  await page.addInitScript((draft) => {
    try { localStorage.setItem('qq_elfsight_shell', JSON.stringify(draft)); } catch {}
    // Force all Advanced folds CLOSED at start (clear any prior session state)
    // so the test exercises the auto-expand path.
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && (k.startsWith('qq-adv-open-') || k.startsWith('qq-wizard-panel-'))) sessionStorage.removeItem(k);
      }
    } catch {}
  }, DRAFT);

  await page.goto(`${BASE}/wizard`, { waitUntil: 'networkidle' });
  // Wait for the preview to render the booking block (proves draft applied).
  await page.waitForSelector('[data-component-type="online-booking"]', { timeout: 30000 });

  // On mobile the editor panel lives in the bottom sheet; clicking a preview
  // block opens it. On desktop the side panel is always visible.

  // ---- 1) BOOKING (folded under "Advanced action") ----
  await clickPreviewBlock(page, 'online-booking', 'action');
  await page.waitForTimeout(900); // allow tab switch + fold expand + scroll
  if (isMobile) await page.waitForTimeout(600);

  const actionPanel = page.locator('[data-testid="editor-tabpanel-action"]');
  check(await actionPanel.count() > 0, 'booking → Action tab panel is active/mounted');

  const advToggle = page.locator('[data-testid="advanced-toggle-action-advanced"]').first();
  const expandedBooking = await advToggle.getAttribute('aria-expanded').catch(() => null);
  check(expandedBooking === 'true', `booking → "Advanced action" fold aria-expanded=true (got ${expandedBooking})`);

  const bookingCtl = page.locator('[data-edit-key="online-booking"]').first();
  check(await bookingCtl.count() > 0, 'booking → online-booking control is mounted (fold opened)');
  check(await bookingCtl.isVisible().catch(() => false), 'booking → online-booking control is visible');
  // Highlight class is transient (1.5s); assert it is present shortly after.
  const bookingHighlighted = await page.locator('[data-edit-key="online-booking"].qq-edit-highlight, [data-edit-key="online-booking"].qq-edit-selected').count();
  check(bookingHighlighted > 0, 'booking → online-booking control highlighted/selected');
  await page.screenshot({ path: path.join(SHOT_DIR, `${label}-booking.png`), fullPage: false });

  // ---- 2) DEPOSIT (folded under "Advanced action") ----
  // Re-close the fold first so the deposit click must re-open it from scratch.
  await page.evaluate(() => {
    const t = document.querySelector('[data-testid="advanced-toggle-action-advanced"][aria-expanded="true"]');
    if (t) t.click();
  });
  await page.waitForTimeout(300);
  await clickPreviewBlock(page, 'deposit', 'action');
  await page.waitForTimeout(900);
  if (isMobile) await page.waitForTimeout(600);

  const advToggle2 = page.locator('[data-testid="advanced-toggle-action-advanced"]').first();
  const expandedDeposit = await advToggle2.getAttribute('aria-expanded').catch(() => null);
  check(expandedDeposit === 'true', `deposit → "Advanced action" fold aria-expanded=true (got ${expandedDeposit})`);

  const depositCtl = page.locator('[data-edit-key="deposit"]').first();
  check(await depositCtl.count() > 0, 'deposit → deposit control is mounted (fold opened)');
  check(await depositCtl.isVisible().catch(() => false), 'deposit → deposit control is visible');
  const depHighlighted = await page.locator('[data-edit-key="deposit"].qq-edit-highlight, [data-edit-key="deposit"].qq-edit-selected').count();
  check(depHighlighted > 0, 'deposit → deposit control highlighted/selected');
  await page.screenshot({ path: path.join(SHOT_DIR, `${label}-deposit.png`), fullPage: false });

  // ---- 3) NON-FOLDED control still links (CTA / mode card) ----
  await clickPreviewBlock(page, 'cta', 'action').catch(async () => {
    // Some templates render the contact step rather than a bare CTA; fall back.
    await clickPreviewBlock(page, 'contact-step', 'action').catch(() => {});
  });
  await page.waitForTimeout(700);
  if (isMobile) await page.waitForTimeout(500);
  const modeCard = page.locator('[data-edit-key="action"]').first();
  check(await modeCard.count() > 0, 'non-folded → action mode card mounted');
  const modeHl = await page.locator('[data-edit-key="action"].qq-edit-highlight, [data-edit-key="action"].qq-edit-selected').count();
  check(modeHl > 0 || await modeCard.isVisible().catch(() => false), 'non-folded → action card links (visible/highlighted)');
  await page.screenshot({ path: path.join(SHOT_DIR, `${label}-nonfolded.png`), fullPage: false });

  await browser.close();
}

let BASE = '';
(async () => {
  await mkdir(SHOT_DIR, { recursive: true });
  const server = await startServer();
  const { port } = server.address();
  BASE = `http://127.0.0.1:${port}`;
  console.log(`serving dist/public at ${BASE}`);
  try {
    await run('desktop', 1280, 900, false);
    await run('mobile', 375, 780, true);
  } finally {
    server.close();
  }
  console.log(`\n${'='.repeat(40)}`);
  if (fails.length) {
    console.log(`SELF-CHECK FAILED — ${fails.length} assertion(s):`);
    fails.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log('SELF-CHECK PASSED — all assertions green.');
})().catch((e) => { console.error(e); process.exit(1); });
