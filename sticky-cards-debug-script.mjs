import { chromium, devices } from 'playwright';
import fs from 'fs';

const TARGET = 'http://localhost:5000';
const OUT_DIR = './sticky-cards-debug';
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
  await page.screenshot({ path: `${OUT_DIR}/${vp.name}-01-initial.png`, fullPage: false });

  // Scroll into the sticky section and capture each card stacking state
  const scrollSteps = [600, 1000, 1400, 1800, 2200, 2600, 3000, 3400];

  for (let i = 0; i < scrollSteps.length; i++) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), scrollSteps[i]);
    await page.waitForTimeout(600);
    await page.screenshot({
      path: `${OUT_DIR}/${vp.name}-scroll-${String(i + 1).padStart(2, '0')}-y${scrollSteps[i]}.png`,
      fullPage: false,
    });
  }

  // Check overflow
  const issues = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('[class]').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > window.innerWidth + 2 || rect.left < -2) {
        results.push({
          class: el.className?.toString().slice(0, 80),
          overflowRight: Math.round(rect.right - window.innerWidth),
          left: Math.round(rect.left),
        });
      }
    });
    return results;
  });

  if (issues.length) {
    console.warn(`\n⚠️  ${vp.name} — ${issues.length} overflow issues:`);
    issues.forEach(el => console.warn(`   .${el.class.split(' ')[0]} — overflows right by ${el.overflowRight}px`));
  } else {
    console.log(`✅ ${vp.name} — no overflow issues`);
  }

  await context.close();
}

await browser.close();
console.log(`\n📸 Screenshots saved to ./${OUT_DIR}/`);
