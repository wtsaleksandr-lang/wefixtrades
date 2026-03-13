import { chromium, devices } from 'playwright';
import fs from 'fs';

const TARGET = 'http://localhost:5000';
const OUT_DIR = './mobile-debug';
fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome',
});

const viewports = [
  { name: 'desktop',      width: 1440, height: 900,  mobile: false },
  { name: 'tablet',       width: 768,  height: 1024, mobile: false },
  { name: 'mobile-large', width: 430,  height: 932,  mobile: true  },
  { name: 'mobile-small', width: 375,  height: 812,  mobile: true  },
];

for (const vp of viewports) {
  const ctxOptions = vp.mobile
    ? { ...devices['iPhone 14 Pro'], viewport: { width: vp.width, height: vp.height } }
    : { viewport: { width: vp.width, height: vp.height } };
  const context = await browser.newContext(ctxOptions);
  const page = await context.newPage();
  await page.goto(TARGET, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    window.scrollBy(0, 400);
    await new Promise(r => setTimeout(r, 500));
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT_DIR}/${vp.name}-full.png`, fullPage: true });

  // Click each tab in the CapabilitiesShowcase component
  const tabs = await page.$$('.cs-button-outter');
  for (let i = 0; i < tabs.length; i++) {
    await tabs[i].click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT_DIR}/${vp.name}-tab-${i + 1}.png`, fullPage: true });
  }

  const animData = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('[class]').forEach((el) => {
      const cs = window.getComputedStyle(el);
      const hasAnim =
        (cs.animation && cs.animation !== 'none') ||
        (cs.transform && cs.transform !== 'none') ||
        cs.position === 'absolute' ||
        cs.position === 'fixed';
      if (hasAnim) {
        const rect = el.getBoundingClientRect();
        results.push({
          tag: el.tagName,
          class: el.className?.toString().slice(0, 80),
          position: cs.position,
          transform: cs.transform,
          animation: cs.animation,
          width: cs.width,
          height: cs.height,
          overflowsViewport: rect.right > window.innerWidth || rect.left < 0,
          rect: {
            top:    Math.round(rect.top),
            left:   Math.round(rect.left),
            right:  Math.round(rect.right),
            bottom: Math.round(rect.bottom),
          },
        });
      }
    });
    return results;
  });

  const overflowing = animData.filter(el => el.overflowsViewport);
  fs.writeFileSync(
    `${OUT_DIR}/${vp.name}-animated-elements.json`,
    JSON.stringify(animData, null, 2)
  );

  if (overflowing.length) {
    console.warn(`⚠️  ${vp.name}: ${overflowing.length} elements overflow the viewport:`);
    overflowing.forEach(el =>
      console.warn(`   → .${el.class.split(' ')[0]} rect:`, el.rect)
    );
  } else {
    console.log(`✅ ${vp.name}: No overflow issues detected`);
  }

  await context.close();
}

await browser.close();
