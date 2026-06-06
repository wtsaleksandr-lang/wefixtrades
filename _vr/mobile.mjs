import { chromium } from 'playwright';
const BASE = 'http://localhost:5099';
const DIR = 'C:\\Users\\Owner\\.codex\\wt-preview\\_vr\\';
const out = n => DIR + n;

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
  });
  const page = await ctx.newPage();
  const note = (...a)=>console.log(...a);
  await page.goto(BASE + '/wizard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // bottom tab bar
  const tabIds = await page.evaluate(()=>Array.from(document.querySelectorAll('[data-testid^="editor-tab-"]')).map(e=>e.getAttribute('data-testid')));
  note('MOBILE TAB IDS:', JSON.stringify(tabIds));
  const hasInstall = tabIds.includes('editor-tab-install');
  note('HAS INSTALL TAB:', hasInstall);
  // bottom bar position
  const barBox = await page.locator('[data-testid="editor-tabs"]').boundingBox().catch(()=>null);
  note('BOTTOM BAR BOX:', JSON.stringify(barBox), 'viewportH=915');
  const barBg = await page.locator('[data-testid="editor-tabs"]').evaluate(el=>getComputedStyle(el).backgroundColor).catch(()=>'n/a');
  note('BOTTOM BAR BG:', barBg);
  await page.screenshot({ path: out('m2-fullscreen.png') });

  // Publish button (mobile)
  const pubBtn = page.locator('button:has-text("Publish")');
  note('MOBILE PUBLISH BTN COUNT:', await pubBtn.count());

  // Action tab -> bottom sheet
  await page.locator('[data-testid="editor-tab-action"]').click();
  await page.waitForTimeout(1200);
  const apanel = page.locator('[data-testid="editor-tabpanel-action"]');
  note('ACTION PANEL COUNT (mobile):', await apanel.count());
  const apBox = await apanel.boundingBox().catch(()=>null);
  note('ACTION PANEL BOX:', JSON.stringify(apBox));
  // is it clipped below viewport? check bottom edge
  if (apBox) note('ACTION PANEL bottom edge:', Math.round(apBox.y+apBox.height), '(viewport 915)');
  const modes = {};
  for (const m of ['redirect','lead-form','no-action']) modes[m]=await page.locator(`[data-testid="action-mode-${m}"]`).count();
  note('MOBILE MODE TESTIDS:', JSON.stringify(modes));
  await page.screenshot({ path: out('m3-action-sheet.png') });

  // scroll within sheet & expand advanced
  const adv = apanel.getByText(/Advanced settings/i).first();
  if (await adv.count()) { await adv.scrollIntoViewIfNeeded().catch(()=>{}); await adv.click().catch(()=>{}); await page.waitForTimeout(700);
    await page.screenshot({ path: out('m3-action-advanced.png') }); }

  // Publish flow on mobile
  // need to close sheet / find publish in top bar
  const pub = page.locator('button:has-text("Publish")').first();
  if (await pub.count()) {
    await pub.click().catch(()=>{});
    await page.waitForTimeout(1200);
    const overlay = page.locator('[data-testid="editor-publish-overlay"]');
    const opened = await overlay.count() > 0;
    note('MOBILE PUBLISH OVERLAY OPENED:', opened);
    if (opened) {
      const txt = await overlay.innerText();
      note('PUBLISH OVERLAY TEXT:\n', txt.slice(0,1400));
      note('CONTAINS "billed monthly":', /billed monthly/i.test(txt));
      note('CONTAINS "one-time"/"one time":', /one[- ]time/i.test(txt));
      await page.screenshot({ path: out('m4-publish-modal.png') });
      const close = page.locator('[data-testid="editor-publish-close"]');
      note('CLOSE BTN COUNT:', await close.count());
      await close.first().click().catch(()=>{});
      await page.waitForTimeout(700);
      note('OVERLAY AFTER CLOSE (0=good):', await overlay.count());
    } else {
      await page.screenshot({ path: out('m4-publish-FAILED.png') });
    }
  } else { note('NO MOBILE PUBLISH BUTTON'); }

  await browser.close();
  note('\nMOBILE DONE');
};
run().catch(e=>{console.error('FATAL',e);process.exit(1);});
