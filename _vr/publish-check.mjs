import { chromium } from 'playwright';
const BASE = 'http://localhost:5099';
const DIR = 'C:\\Users\\Owner\\.codex\\wt-preview\\_vr\\';
const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/wizard', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="editor-tabs"]');
  await page.waitForTimeout(1500);

  const scanPublish = async (label) => {
    const cands = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a, [role="button"]'));
      return btns.filter(b => /publish/i.test((b.innerText||'')+(b.getAttribute('aria-label')||'')+(b.getAttribute('data-testid')||'')))
        .map(b => ({ text:(b.innerText||'').slice(0,30), testid:b.getAttribute('data-testid'), aria:b.getAttribute('aria-label')}));
    });
    console.log(`[${label}] publish candidates:`, JSON.stringify(cands));
    return cands;
  };

  await scanPublish('initial (template picker)');

  // select a template to enter builder
  await page.locator('[data-testid="template-strip-card-driveway_paving"]').click().catch(()=>{});
  await page.waitForTimeout(2000);
  // there may be a confirm/use button
  const useBtn = await page.evaluate(()=>{
    const b = Array.from(document.querySelectorAll('button')).find(x=>/use template|use this|start|continue|customi/i.test(x.innerText||''));
    return b ? {text:b.innerText.slice(0,30), testid:b.getAttribute('data-testid')} : null;
  });
  console.log('USE-TEMPLATE BUTTON:', JSON.stringify(useBtn));
  await page.waitForTimeout(1000);
  await scanPublish('after template select');
  await page.screenshot({ path: DIR + 'd-after-template-select.png' });

  // dump entire top bar region testids again
  const ids = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid]'))
    .map(e=>e.getAttribute('data-testid'))
    .filter(t=>/publish|install|embed|share|export|done|deploy|hosted|launch/i.test(t)));
  console.log('NOW PUBLISH-RELATED TESTIDS:', JSON.stringify(ids));

  await browser.close();
};
run().catch(e=>{console.error(e);process.exit(1);});
