import { chromium } from 'playwright';

const BASE = 'http://localhost:5099';

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => logs.push(`[console.${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));

  for (const route of ['/wizard', '/']) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2500);
      const url = page.url();
      const hasTabs = await page.locator('[data-testid="editor-tabs"]').count();
      const tabIds = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-testid^="editor-tab"]')).map(e => e.getAttribute('data-testid'))
      );
      const publishBtn = await page.locator('button:has-text("Publish")').count();
      const bodyText = (await page.locator('body').innerText()).slice(0, 300).replace(/\n+/g, ' | ');
      console.log(`\n=== ROUTE ${route} -> ${url}`);
      console.log(`editor-tabs count: ${hasTabs}, publishBtn: ${publishBtn}`);
      console.log(`tab testids: ${JSON.stringify(tabIds)}`);
      console.log(`body: ${bodyText}`);
    } catch (e) {
      console.log(`\n=== ROUTE ${route} ERROR: ${e.message}`);
    }
  }
  console.log('\n--- logs ---\n' + logs.slice(0, 20).join('\n'));
  await browser.close();
};
run();
