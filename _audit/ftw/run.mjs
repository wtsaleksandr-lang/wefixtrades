import { chromium } from 'playwright';
import { pathToFileURL } from 'url';
import path from 'path';

const DIR = 'C:/Users/Owner/.codex/wt-preview/_audit/ftw';
const BASE = 'http://localhost:5099';
const fileUrl = (f) => pathToFileURL(path.join(DIR, f)).href;
const DESK = { width: 1440, height: 900 };
const MOB = { width: 390, height: 844 };
const log = (...a) => console.log(...a);
const results = {};

function attachConsole(page, key) {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  results[key] = errs;
  return errs;
}

(async () => {
  const browser = await chromium.launch();

  // ---------- STEP 1: Builder routes ----------
  for (const [route, name] of [
    ['/portal/free-tools/before-after', 'builder-ba'],
    ['/portal/free-tools/stats', 'builder-stats'],
  ]) {
    const ctx = await browser.newContext({ viewport: DESK });
    const page = await ctx.newPage();
    attachConsole(page, name);
    let finalUrl = '', rendered = false, h1 = '';
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1200);
      finalUrl = page.url();
      h1 = (await page.locator('h1').first().textContent().catch(() => '')) || '';
      // Builder is rendered if the snippet <pre> testid exists
      const snipSel = name === 'builder-ba' ? '[data-testid="ba-snippet"]' : '[data-testid="stats-snippet"]';
      rendered = await page.locator(snipSel).count() > 0;
    } catch (e) { finalUrl = 'ERROR: ' + e.message; }
    log(`\n[${name}] route=${route}`);
    log(`   finalUrl=${finalUrl}`);
    log(`   h1="${h1.trim()}"  builderRendered=${rendered}`);
    await page.screenshot({ path: path.join(DIR, `${name}-desktop.png`), fullPage: true });
    results[name + '_meta'] = { finalUrl, rendered, h1: h1.trim() };
    await ctx.close();
  }

  // ---------- STEP 2a: BA embed (local images, offline) ----------
  {
    const ctx = await browser.newContext({ viewport: DESK });
    const page = await ctx.newPage();
    const errs = attachConsole(page, 'ba-embed');
    await page.goto(fileUrl('ba-embed-local.html'), { waitUntil: 'load' });
    await page.waitForTimeout(400);
    // both images present + loaded
    const imgInfo = await page.$$eval('.wft-ba__img', els =>
      els.map(i => ({ src: i.getAttribute('src'), complete: i.complete, w: i.naturalWidth })));
    const labels = await page.$$eval('.wft-ba__tag', els => els.map(e => e.textContent));
    const startVar = await page.$eval('.wft-ba', el => el.style.getPropertyValue('--ba-start'));
    await page.screenshot({ path: path.join(DIR, 'ba-embed-pos50.png') });

    // Drag the divider via pointer to ~20%
    const frame = await page.$('.wft-ba__frame');
    const box = await frame.boundingBox();
    const handle = await page.$('.wft-ba__handle');
    const hb = await handle.boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const afterDrag = await page.$eval('.wft-ba', el => el.style.getPropertyValue('--ba-start'));
    const ariaDrag = await page.$eval('.wft-ba__handle', el => el.getAttribute('aria-valuenow'));
    await page.screenshot({ path: path.join(DIR, 'ba-embed-drag20.png') });

    // Keyboard: focus handle, ArrowRight x3 (should increase by 12)
    await page.$eval('.wft-ba__handle', el => el.focus());
    const beforeKeys = parseFloat(afterDrag);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    const afterKeys = await page.$eval('.wft-ba', el => el.style.getPropertyValue('--ba-start'));
    const ariaKeys = await page.$eval('.wft-ba__handle', el => el.getAttribute('aria-valuenow'));
    await page.keyboard.press('Home');
    await page.waitForTimeout(60);
    const afterHome = await page.$eval('.wft-ba', el => el.style.getPropertyValue('--ba-start'));
    await page.screenshot({ path: path.join(DIR, 'ba-embed-keyboard.png') });

    // mobile screenshot
    await page.setViewportSize(MOB);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(DIR, 'ba-embed-mobile.png') });

    log('\n[ba-embed]');
    log('   images=', JSON.stringify(imgInfo));
    log('   labels=', JSON.stringify(labels));
    log('   startVar=', startVar);
    log('   afterPointerDrag=', afterDrag, ' aria=', ariaDrag);
    log('   afterArrowRightx3=', afterKeys, ' aria=', ariaKeys, ' (was ' + beforeKeys + ')');
    log('   afterHome=', afterHome);
    log('   consoleErrors=', JSON.stringify(errs));
    results['ba_embed_meta'] = { imgInfo, labels, startVar, afterDrag, ariaDrag, afterKeys, ariaKeys, afterHome };
    await ctx.close();
  }

  // ---------- STEP 2a-network: BA embed with real unsplash URLs (self-contained check) ----------
  {
    const ctx = await browser.newContext({ viewport: DESK });
    const page = await ctx.newPage();
    const errs = attachConsole(page, 'ba-embed-net');
    const reqs = [];
    page.on('request', r => reqs.push(r.url()));
    await page.goto(fileUrl('ba-embed.html'), { waitUntil: 'load', timeout: 25000 }).catch(()=>{});
    await page.waitForTimeout(1500);
    // external requests (exclude the file:// doc itself)
    const ext = reqs.filter(u => !u.startsWith('file:'));
    log('\n[ba-embed-net] external requests (should be ONLY the user image URLs):');
    ext.forEach(u => log('   ' + u));
    results['ba_net_ext'] = ext;
    await ctx.close();
  }

  // ---------- STEP 2b: Stats embed (normal motion, count-up on scroll) ----------
  {
    const ctx = await browser.newContext({ viewport: DESK });
    const page = await ctx.newPage();
    const errs = attachConsole(page, 'stats-embed');
    const reqs = [];
    page.on('request', r => reqs.push(r.url()));
    await page.goto(fileUrl('stats-embed.html'), { waitUntil: 'load' });
    // before scroll, value should still be initial literal "15"/"600+"/"24/7" (IO not fired)
    const beforeScroll = await page.$$eval('.wft-stats__value', els => els.map(e => e.textContent));
    // scroll into view
    await page.$eval('.wft-stats', el => el.scrollIntoView());
    // capture mid-animation
    await page.waitForTimeout(250);
    const mid = await page.$$eval('.wft-stats__value', els => els.map(e => e.textContent));
    await page.screenshot({ path: path.join(DIR, 'stats-embed-mid.png') });
    await page.waitForTimeout(1400);
    const fin = await page.$$eval('.wft-stats__value', els => els.map(e => e.textContent));
    const labels = await page.$$eval('.wft-stats__label', els => els.map(e => e.textContent));
    await page.screenshot({ path: path.join(DIR, 'stats-embed-final.png') });
    const ext = reqs.filter(u => !u.startsWith('file:'));
    // mobile
    await page.setViewportSize(MOB);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(DIR, 'stats-embed-mobile.png') });
    log('\n[stats-embed]');
    log('   beforeScroll=', JSON.stringify(beforeScroll));
    log('   mid=', JSON.stringify(mid));
    log('   final=', JSON.stringify(fin));
    log('   labels=', JSON.stringify(labels));
    log('   externalRequests=', JSON.stringify(ext));
    log('   consoleErrors=', JSON.stringify(errs));
    results['stats_meta'] = { beforeScroll, mid, fin, labels, ext };
    await ctx.close();
  }

  // ---------- STEP 2c: Stats embed with reduced-motion ----------
  {
    const ctx = await browser.newContext({ viewport: DESK, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errs = attachConsole(page, 'stats-reduced');
    await page.goto(fileUrl('stats-embed.html'), { waitUntil: 'load' });
    await page.$eval('.wft-stats', el => el.scrollIntoView());
    // With reduced motion, run() sets final value immediately (no animation frames of partial numbers)
    await page.waitForTimeout(120);
    const v1 = await page.$$eval('.wft-stats__value', els => els.map(e => e.textContent));
    await page.waitForTimeout(400);
    const v2 = await page.$$eval('.wft-stats__value', els => els.map(e => e.textContent));
    await page.screenshot({ path: path.join(DIR, 'stats-embed-reduced.png') });
    log('\n[stats-reduced]');
    log('   shortlyAfterScroll=', JSON.stringify(v1));
    log('   later=', JSON.stringify(v2));
    log('   consoleErrors=', JSON.stringify(errs));
    results['stats_reduced_meta'] = { v1, v2 };
    await ctx.close();
  }

  await browser.close();
  log('\n=== DONE ===');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
