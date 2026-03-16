const { chromium } = require('./node_modules/playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log('Loading effortel.com...');
  await page.goto('https://effortel.com', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);

  fs.mkdirSync('./effortel-ref', { recursive: true });
  await page.screenshot({ path: './effortel-ref/00-full.png' });
  console.log('Full screenshot saved');

  // Find all visible buttons/links near the hero area
  const candidates = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('a, button'));
    return els.map((el, i) => {
      const box = el.getBoundingClientRect();
      return {
        i, tag: el.tagName, text: el.textContent.trim().substring(0, 50),
        x: box.x, y: box.y, w: box.width, h: box.height,
        cls: el.className.substring(0, 80),
      };
    }).filter(b => b.y > 30 && b.y < 600 && b.w > 60 && b.w < 500 && b.h > 20);
  });

  console.log('Candidates:');
  candidates.forEach(c => console.log(' #' + c.i, c.tag, '"' + c.text + '"', 'y=' + Math.round(c.y), 'w=' + Math.round(c.w) + 'x' + Math.round(c.h), c.cls));

  // Target just the hero CTA buttons (likely indices near middle of page)
  const heroCandidates = candidates.filter(c => c.w > 100 && c.h > 35 && c.h < 80);
  console.log('\nHero button candidates:', heroCandidates.length);

  for (let j = 0; j < Math.min(heroCandidates.length, 6); j++) {
    const c = heroCandidates[j];
    const PAD = 20;
    const clip = {
      x: Math.max(0, c.x - PAD),
      y: Math.max(0, c.y - PAD),
      width: c.w + PAD * 3,
      height: c.h + PAD * 2,
    };

    // Normal state
    await page.mouse.move(50, 700);
    await page.waitForTimeout(400);
    await page.screenshot({ path: './effortel-ref/btn' + j + '-1-normal.png', clip });

    // Get computed styles at rest
    const normalS = await page.evaluate((idx) => {
      const els = Array.from(document.querySelectorAll('a, button'));
      const el = els[idx];
      if (!el) return null;
      const s = window.getComputedStyle(el);
      const spans = el.querySelectorAll('span');
      const spanStyles = Array.from(spans).map(sp => {
        const ss = window.getComputedStyle(sp);
        return { text: sp.textContent.trim().substring(0,20), bg: ss.backgroundColor, color: ss.color, w: ss.width, h: ss.height, br: ss.borderRadius, fw: ss.fontWeight, fs: ss.fontSize };
      });
      return {
        bg: s.backgroundColor, border: s.border, h: s.height,
        br: s.borderRadius, p: s.padding, fw: s.fontWeight,
        fs: s.fontSize, ls: s.letterSpacing, tt: s.textTransform,
        color: s.color, spans: spanStyles,
      };
    }, c.i);
    console.log('\nbtn' + j + ' "' + c.text + '" NORMAL:', JSON.stringify(normalS, null, 2));

    // Hover mid
    const handle = await page.$('a:nth-of-type(' + (j+1) + '), button:nth-of-type(' + (j+1) + ')');
    await page.mouse.move(c.x + c.w/2, c.y + c.h/2);
    await page.waitForTimeout(180);
    await page.screenshot({ path: './effortel-ref/btn' + j + '-2-hover-mid.png', clip });

    await page.waitForTimeout(400);
    await page.screenshot({ path: './effortel-ref/btn' + j + '-3-hover-done.png', clip });

    // Get hover styles
    const hoverS = await page.evaluate((idx) => {
      const els = Array.from(document.querySelectorAll('a, button'));
      const el = els[idx];
      if (!el) return null;
      const s = window.getComputedStyle(el);
      const spans = el.querySelectorAll('span');
      const spanStyles = Array.from(spans).map(sp => {
        const ss = window.getComputedStyle(sp);
        return { text: sp.textContent.trim().substring(0,20), bg: ss.backgroundColor, color: ss.color, w: ss.width };
      });
      return { bg: s.backgroundColor, color: s.color, spans: spanStyles };
    }, c.i);
    console.log('btn' + j + ' HOVER:', JSON.stringify(hoverS, null, 2));

    await page.mouse.move(50, 700);
    await page.waitForTimeout(500);
  }

  await browser.close();
  console.log('\nDone. Check ./effortel-ref/');
})().catch(e => { console.error(e); process.exit(1); });
