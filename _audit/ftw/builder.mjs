import { chromium } from 'playwright';
import path from 'path';
const DIR = 'C:/Users/Owner/.codex/wt-preview/_audit/ftw';
const BASE = 'http://localhost:5099';

(async () => {
  const browser = await chromium.launch();
  for (const [route, name, snip] of [
    ['/portal/free-tools/before-after', 'builder-ba', 'ba-snippet'],
    ['/portal/free-tools/stats', 'builder-stats', 'stats-snippet'],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 20000 });
    // wait for SPA to settle
    await page.waitForTimeout(3000);
    const finalUrl = page.url();
    const h1 = (await page.locator('h1').first().textContent().catch(()=> '')) || '';
    const bodyText = (await page.locator('body').textContent().catch(()=> '')) || '';
    const hasSnippet = await page.locator(`[data-testid="${snip}"]`).count();
    const isLogin = /sign in|log in|login|password/i.test(bodyText) && finalUrl.toLowerCase().includes('login');
    let snippetText = '';
    if (hasSnippet) snippetText = (await page.locator(`[data-testid="${snip}"]`).textContent().catch(()=> '')) || '';
    console.log(`\n[${name}] route=${route}`);
    console.log('   finalUrl=', finalUrl);
    console.log('   h1=', JSON.stringify(h1.trim()));
    console.log('   redirectedToLogin=', finalUrl.toLowerCase().includes('login'), ' loginUI=', isLogin);
    console.log('   builderSnippetEl=', hasSnippet, ' snippetLen=', snippetText.length);
    console.log('   snippetHead=', JSON.stringify(snippetText.slice(0, 80)));
    console.log('   consoleErrors=', JSON.stringify(errs.slice(0,5)));
    await page.screenshot({ path: path.join(DIR, `${name}.png`), fullPage: true });
    await ctx.close();
  }
  await browser.close();
  console.log('\n=== builder done ===');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
