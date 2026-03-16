import { chromium, devices } from 'playwright';
import fs from 'fs';

const TARGET = 'http://localhost:5000';
const OUT_DIR = './bento-debug';
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

  // Screenshot before scroll
  await page.screenshot({ path: `${OUT_DIR}/${vp.name}-01-before-scroll.png`, fullPage: false });

  // Slowly scroll through to trigger entrance animations
  for (let y = 0; y <= 6000; y += 250) {
    await page.evaluate((scrollY) => window.scrollTo({ top: scrollY, behavior: 'instant' }), y);
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(800);

  // Full-page screenshot after all cards animated in
  await page.screenshot({ path: `${OUT_DIR}/${vp.name}-02-after-scroll.png`, fullPage: true });

  // Scroll to bento section specifically and capture
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="bento-grid"]');
    if (el) el.scrollIntoView({ behavior: 'instant' });
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT_DIR}/${vp.name}-03-bento-section.png`, fullPage: false });

  // Check horizontal overflow
  const overflowIssues = await page.evaluate(() => {
    const issues = [];
    document.querySelectorAll('[class]').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > window.innerWidth + 2) {
        issues.push({
          class: el.className?.toString().slice(0, 80),
          overflowBy: Math.round(rect.right - window.innerWidth),
        });
      }
    });
    return issues;
  });

  // Count visible Rive canvases inside the bento section
  const riveInfo = await page.evaluate(() => {
    const section = document.querySelector('[data-testid="bento-grid"]');
    if (!section) return { canvasCount: 0, visibleCanvases: 0 };
    const canvases = section.querySelectorAll('canvas');
    const visible = Array.from(canvases).filter(c => {
      const cs = window.getComputedStyle(c);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    });
    return { canvasCount: canvases.length, visibleCanvases: visible.length };
  });

  // Filter out known-intentional overflows (HeroTradeDivider marquee)
  const bentoOverflows = overflowIssues.filter(
    el => !el.class.includes('htd-scroll') && !el.class.includes('pointer-events-none')
  );

  if (bentoOverflows.length) {
    console.warn(`\n⚠️  ${vp.name} — ${bentoOverflows.length} overflow issues:`);
    bentoOverflows.forEach(el => console.warn(`   .${el.class.split(' ')[0]} overflows by ${el.overflowBy}px`));
  } else {
    console.log(`✅ ${vp.name} — no overflow`);
  }

  const expectedCanvases = vp.mobile ? 0 : 6;
  const canvasOk = riveInfo.visibleCanvases === expectedCanvases;
  console.log(`   Rive canvases visible: ${riveInfo.visibleCanvases}/${riveInfo.canvasCount} (expected ${expectedCanvases}) ${canvasOk ? '✅' : '⚠️'}`);

  await context.close();
}

await browser.close();
console.log(`\n📸 Screenshots saved to ./${OUT_DIR}/`);
