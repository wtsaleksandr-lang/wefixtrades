import { chromium } from 'playwright';
const BASE = 'http://localhost:5099';
const DIR = 'C:\\Users\\Owner\\.codex\\wt-preview\\_vr\\';
const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/wizard', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="editor-tabs"]');
  await page.waitForTimeout(2000);

  // list ALL buttons/links with text + testid in top region (y < 120)
  const top = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    return all.map(b => {
      const r = b.getBoundingClientRect();
      return { text: (b.innerText||'').replace(/\n/g,' ').trim().slice(0,40),
               testid: b.getAttribute('data-testid'),
               aria: b.getAttribute('aria-label'),
               y: Math.round(r.top), x: Math.round(r.left), w: Math.round(r.width) };
    }).filter(b => b.y < 130 && b.w > 0);
  });
  console.log('TOP-REGION CLICKABLES:');
  top.forEach(b => console.log(JSON.stringify(b)));

  // anything with testid containing publish/install/embed/share anywhere
  const ids = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid]'))
    .map(e=>e.getAttribute('data-testid'))
    .filter(t=>/publish|install|embed|share|export|done/i.test(t)));
  console.log('PUBLISH/INSTALL-RELATED TESTIDS IN DOM:', JSON.stringify(ids));

  await page.screenshot({ path: DIR + 'd-topbar-crop.png', clip: { x: 0, y: 0, width: 1440, height: 130 } });
  await browser.close();
};
run().catch(e=>{console.error(e);process.exit(1);});
