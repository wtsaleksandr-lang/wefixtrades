import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const BASE = 'http://localhost:5099';

const results = {};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on('console', m => { if (m.type() === 'error') console.log('PAGE ERR:', m.text()); });

await page.goto(`${BASE}/wizard`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// ---------- ITEM 1: Action icon in rail ----------
try {
  const rail = page.locator('[data-testid="editor-tabs"]');
  await rail.waitFor({ state: 'visible', timeout: 15000 });
  const actionBtn = page.locator('[data-testid="editor-tab-action"]');
  await actionBtn.waitFor({ state: 'visible', timeout: 10000 });

  const svgInfo = await actionBtn.evaluate(el => {
    const svg = el.querySelector('svg');
    if (!svg) return { found: false };
    const paths = Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d'));
    return {
      found: true,
      svgClass: svg.getAttribute('class') || '',
      svgOuter: svg.outerHTML.slice(0, 1200),
      pathCount: paths.length,
      paths,
    };
  });
  results.item1 = svgInfo;

  // zoomed screenshot of the rail
  await rail.scrollIntoViewIfNeeded();
  const railShot = path.join(OUT, 'item1-rail.png');
  await rail.screenshot({ path: railShot });
  results.item1.screenshot = railShot;

  // also a zoomed shot of just the action button
  const btnShot = path.join(OUT, 'item1-action-button.png');
  await actionBtn.screenshot({ path: btnShot });
  results.item1.buttonScreenshot = btnShot;
} catch (e) {
  results.item1 = { error: String(e) };
}

// ---------- ITEM 2: Publish button + modal ----------
try {
  const publishBtn = page.locator('[data-testid="quotequick-publish"]');
  const count = await publishBtn.count();
  let visibleInfo = [];
  for (let i = 0; i < count; i++) {
    const vis = await publishBtn.nth(i).isVisible();
    const box = await publishBtn.nth(i).boundingBox();
    visibleInfo.push({ i, visible: vis, box });
  }
  results.item2 = { publishButtonCount: count, visibleInfo };

  // pick the visible one (desktop top bar)
  const visibleIdx = visibleInfo.findIndex(v => v.visible);
  if (visibleIdx === -1) {
    results.item2.note = 'No visible publish button';
  } else {
    await publishBtn.nth(visibleIdx).click();
    const overlay = page.locator('[data-testid="editor-publish-overlay"]');
    await overlay.waitFor({ state: 'visible', timeout: 10000 });
    results.item2.overlayOpened = true;

    const overlayText = await overlay.innerText();
    results.item2.hasEmbedContent = /embed|install|hosted|link|<script|iframe/i.test(overlayText);
    results.item2.mentionsOneTime = /one[- ]?time/i.test(overlayText);
    results.item2.mentionsBilledMonthly = /billed monthly|per month|\/mo\b|monthly/i.test(overlayText);
    results.item2.overlayTextSnippet = overlayText.slice(0, 2000);

    const openShot = path.join(OUT, 'item2-publish-modal.png');
    await page.screenshot({ path: openShot, fullPage: false });
    results.item2.screenshot = openShot;

    // close
    const closeBtn = page.locator('[data-testid="editor-publish-close"]');
    await closeBtn.waitFor({ state: 'visible', timeout: 8000 });
    await closeBtn.click();
    await page.waitForTimeout(800);
    results.item2.overlayClosedCleanly = !(await overlay.isVisible().catch(() => false));
  }
} catch (e) {
  results.item2 = { ...(results.item2 || {}), error: String(e) };
}

console.log('=== RESULTS ===');
console.log(JSON.stringify(results, null, 2));

await browser.close();
