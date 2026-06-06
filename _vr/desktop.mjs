import { chromium } from 'playwright';

const BASE = 'http://localhost:5099';
const DIR = 'C:\\Users\\Owner\\.codex\\wt-preview\\_vr\\';
const out = (n) => DIR + n;

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const note = (...a) => console.log(...a);

  await page.goto(BASE + '/wizard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('[data-testid="editor-tabs"]', { timeout: 20000 });
  await page.waitForTimeout(2000);

  // ---- AREA 2: tab set ----
  const tabIds = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="editor-tab-"]')).map(e => e.getAttribute('data-testid')));
  note('TAB IDS:', JSON.stringify(tabIds));
  const hasInstall = await page.evaluate(() =>
    !!Array.from(document.querySelectorAll('*')).find(e =>
      e.getAttribute && e.getAttribute('data-testid') === 'editor-tab-install'));
  note('HAS INSTALL TAB:', hasInstall);
  // any "Install" text label on a tab?
  const installText = await page.locator('[data-testid="editor-tabs"]').innerText().catch(()=>'');
  note('RAIL INNER TEXT:', JSON.stringify(installText));
  await page.locator('[data-testid="editor-tabs"]').screenshot({ path: out('d2-rail.png') });

  // Action tab icon check (svg inside action tab)
  const actionHasSvg = await page.locator('[data-testid="editor-tab-action"] svg').count();
  note('ACTION TAB SVG COUNT:', actionHasSvg);

  // ---- AREA 3: Action tab ----
  await page.locator('[data-testid="editor-tab-action"]').click();
  await page.waitForTimeout(1200);
  const panelCount = await page.locator('[data-testid="editor-tabpanel-action"]').count();
  note('ACTION PANEL COUNT:', panelCount);
  const modes = {};
  for (const m of ['redirect','lead-form','no-action']) {
    modes[m] = await page.locator(`[data-testid="action-mode-${m}"]`).count();
  }
  note('MODE TESTIDS:', JSON.stringify(modes));
  // which is selected by default
  const selInfo = await page.evaluate(() => {
    const get = id => document.querySelector(`[data-testid="action-mode-${id}"]`);
    return ['redirect','lead-form','no-action'].map(id => {
      const el = get(id); if(!el) return [id,'MISSING'];
      return [id, el.getAttribute('aria-pressed') || el.getAttribute('aria-selected') || el.getAttribute('data-selected') || el.className];
    });
  });
  note('MODE SELECTED STATE:', JSON.stringify(selInfo));
  const panelText = await page.locator('[data-testid="editor-tabpanel-action"]').innerText().catch(()=> '');
  note('ACTION PANEL TEXT (lead-form default):\n', panelText.slice(0, 900));
  await page.locator('[data-testid="editor-tabpanel-action"]').screenshot({ path: out('d3-action-leadform.png') }).catch(async()=>{
    await page.screenshot({ path: out('d3-action-leadform.png') });
  });

  // Advanced settings disclosure
  const advBtn = page.locator('[data-testid="editor-tabpanel-action"]').getByText(/Advanced settings/i).first();
  const advExists = await advBtn.count();
  note('ADVANCED SETTINGS PRESENT:', advExists);
  if (advExists) {
    await advBtn.click().catch(()=>{});
    await page.waitForTimeout(800);
    const advText = await page.locator('[data-testid="editor-tabpanel-action"]').innerText();
    note('AFTER ADVANCED EXPAND TEXT:\n', advText.slice(0,1200));
    await page.locator('[data-testid="editor-tabpanel-action"]').screenshot({ path: out('d3-action-advanced.png') }).catch(async()=>{
      await page.screenshot({ path: out('d3-action-advanced.png') });
    });
  }

  // Switch to Redirect
  await page.locator('[data-testid="action-mode-redirect"]').click().catch(()=>{});
  await page.waitForTimeout(700);
  const redirectText = await page.locator('[data-testid="editor-tabpanel-action"]').innerText();
  const hasUrlField = await page.locator('[data-testid="editor-tabpanel-action"] input').count();
  note('REDIRECT MODE -> contains "Redirect URL":', /redirect url/i.test(redirectText), 'input count:', hasUrlField);
  await page.locator('[data-testid="editor-tabpanel-action"]').screenshot({ path: out('d3-action-redirect.png') }).catch(()=>{});

  // Switch to No action
  await page.locator('[data-testid="action-mode-no-action"]').click().catch(()=>{});
  await page.waitForTimeout(700);
  const noActText = await page.locator('[data-testid="editor-tabpanel-action"]').innerText();
  note('NO-ACTION MODE TEXT:\n', noActText.slice(0,400));
  await page.locator('[data-testid="editor-tabpanel-action"]').screenshot({ path: out('d3-action-noaction.png') }).catch(()=>{});

  // back to lead-form for cleanliness
  await page.locator('[data-testid="action-mode-lead-form"]').click().catch(()=>{});
  await page.waitForTimeout(500);

  // ---- AREA 4: Publish modal ----
  // find publish button anywhere
  const pubCandidates = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    return btns.filter(b => /publish/i.test(b.innerText||'') || /publish/i.test(b.getAttribute('aria-label')||'') || /publish/i.test(b.getAttribute('data-testid')||''))
      .map(b => ({ text: (b.innerText||'').slice(0,30), testid: b.getAttribute('data-testid'), aria: b.getAttribute('aria-label') }));
  });
  note('PUBLISH BUTTON CANDIDATES:', JSON.stringify(pubCandidates));
  let publishOpened = false;
  const pubBtn = page.locator('button:has-text("Publish"), [data-testid*="publish" i]').first();
  if (await pubBtn.count()) {
    await pubBtn.click().catch(()=>{});
    await page.waitForTimeout(1000);
    publishOpened = await page.locator('[data-testid="editor-publish-overlay"]').count() > 0;
    note('PUBLISH OVERLAY OPENED:', publishOpened);
    if (publishOpened) {
      const ov = await page.locator('[data-testid="editor-publish-overlay"]').innerText();
      note('PUBLISH OVERLAY TEXT:\n', ov.slice(0,1200));
      note('CONTAINS "billed monthly":', /billed monthly/i.test(ov));
      await page.screenshot({ path: out('d4-publish-modal.png') });
      const closeBtn = page.locator('[data-testid="editor-publish-close"]');
      note('CLOSE BTN COUNT:', await closeBtn.count());
      await closeBtn.first().click().catch(()=>{});
      await page.waitForTimeout(800);
      const stillOpen = await page.locator('[data-testid="editor-publish-overlay"]').count();
      note('PUBLISH OVERLAY AFTER CLOSE (should be 0):', stillOpen);
    } else {
      await page.screenshot({ path: out('d4-publish-FAILED.png') });
    }
  } else {
    note('NO PUBLISH BUTTON FOUND');
    await page.screenshot({ path: out('d4-topbar.png') });
  }

  // full editor screenshot
  await page.locator('[data-testid="editor-tab-action"]').click().catch(()=>{});
  await page.waitForTimeout(500);
  await page.screenshot({ path: out('d-full-editor.png') });

  await browser.close();
  note('\nDESKTOP DONE');
};
run().catch(e => { console.error('FATAL', e); process.exit(1); });
