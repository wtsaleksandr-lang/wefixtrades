/**
 * BUTTON VERIFICATION SCRIPT
 * Run: node verify-buttons.cjs
 * Tests all 3 states: normal → hover-mid → hover-complete
 * Saves cropped screenshots for comparison
 */

const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs');

const TARGET = 'http://localhost:3000';
const OUT = './btn-verify';

const CYAN = 'rgb(0, 212, 200)';
const DARK = 'rgb(24, 29, 28)';

;(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log(`Loading ${TARGET}...`);
  await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  // ── Full page normal state ──────────────────────────────────────
  await page.screenshot({ path: `${OUT}/00-full-normal.png` });
  console.log('✅ Full page screenshot saved');

  // ── Find all candidate buttons ──────────────────────────────────
  const selectors = [
    '.effortel-btn',
    '[class*="NavButton"]',
    '[class*="nav-btn"]',
    '[class*="ArrowButton"]',
    'a[class*="button"]',
    'button[class*="arrow"]',
  ];

  let buttons = [];
  for (const sel of selectors) {
    const found = await page.$$(sel);
    if (found.length > 0) {
      console.log(`Found ${found.length} buttons with selector: ${sel}`);
      buttons = found;
      break;
    }
  }

  if (buttons.length === 0) {
    // Fallback: find visible buttons in the hero area
    buttons = await page.$$('a, button');
    buttons = buttons.filter(async b => {
      const box = await b.boundingBox();
      return box && box.y < 600; // only near top of page
    });
    console.log(`⚠️ Using fallback — found ${buttons.length} links/buttons near hero`);
  }

  console.log(`\nTesting ${Math.min(buttons.length, 6)} buttons...\n`);

  const issues = [];

  for (let i = 0; i < Math.min(buttons.length, 6); i++) {
    const btn = buttons[i];

    try {
      const visible = await btn.isVisible();
      if (!visible) { console.log(`Button ${i}: not visible, skipping`); continue; }

      const box = await btn.boundingBox();
      if (!box || box.width < 10) { console.log(`Button ${i}: too small, skipping`); continue; }

      const PAD = 24;
      const clip = {
        x: Math.max(0, box.x - PAD),
        y: Math.max(0, box.y - PAD),
        width: box.width + PAD * 3,
        height: box.height + PAD * 2,
      };

      // ── 1. Normal state ──────────────────────────────────────────
      await page.mouse.move(0, 500); // ensure no hover
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/btn${i}-1-NORMAL.png`, clip });

      const normalData = await page.evaluate((el) => {
        const s = window.getComputedStyle(el);
        const before = window.getComputedStyle(el, '::before');
        const textEl = el.querySelector('span, [class*="text"]');
        const arrowEl = el.querySelector('[class*="arrow"], [class*="square"]');
        const arrowS = arrowEl ? window.getComputedStyle(arrowEl) : null;

        return {
          text: el.textContent?.trim().substring(0, 30),
          bg: s.backgroundColor,
          opacity: s.opacity,
          height: s.height,
          borderRadius: s.borderRadius,
          border: s.border,
          beforeBg: before.backgroundColor,
          beforeWidth: before.width,
          textColor: textEl ? window.getComputedStyle(textEl).color : null,
          arrowBg: arrowS?.backgroundColor,
          arrowW: arrowS?.width,
          arrowH: arrowS?.height,
        };
      }, btn);

      console.log(`── Button ${i}: "${normalData.text}" ──`);
      console.log(`   Height:        ${normalData.height}  ${normalData.height === '46px' ? '✅' : `⚠️  expected 46px`}`);
      console.log(`   BG:            ${normalData.bg}  ${normalData.bg.includes('0, 0, 0, 0') ? '❌ TRANSPARENT' : '✅ solid'}`);
      console.log(`   Opacity:       ${normalData.opacity}  ${parseFloat(normalData.opacity) < 1 ? '⚠️  not 1.0' : '✅'}`);
      console.log(`   Border-radius: ${normalData.borderRadius}`);
      console.log(`   Before bg:     ${normalData.beforeBg}  (should be cyan = ${CYAN})`);
      console.log(`   Before width:  ${normalData.beforeWidth}  (normal = ~36px, hover = 100%)`);
      console.log(`   Arrow area:    ${normalData.arrowBg}  ${normalData.arrowW}×${normalData.arrowH}`);

      if (normalData.bg.includes('0, 0, 0, 0')) issues.push(`Button ${i}: transparent background`);
      if (normalData.height !== '46px') issues.push(`Button ${i}: height is ${normalData.height}, not 46px`);

      // ── 2. Hover mid-animation ───────────────────────────────────
      await btn.hover();
      await page.waitForTimeout(180); // capture mid-animation
      await page.screenshot({ path: `${OUT}/btn${i}-2-HOVER-MID.png`, clip });

      // ── 3. Hover complete ────────────────────────────────────────
      await page.waitForTimeout(400); // let animation finish
      await page.screenshot({ path: `${OUT}/btn${i}-3-HOVER-DONE.png`, clip });

      const hoverData = await page.evaluate((el) => {
        const s = window.getComputedStyle(el);
        const textEl = el.querySelector('span, [class*="text"]');
        return {
          bg: s.backgroundColor,
          textColor: textEl ? window.getComputedStyle(textEl).color : null,
          border: s.border,
        };
      }, btn);

      console.log(`   [Hover] BG:    ${hoverData.bg}  ${hoverData.bg === CYAN ? '✅ cyan' : `⚠️  expected ${CYAN}`}`);
      console.log(`   [Hover] Text:  ${hoverData.textColor}  (should be dark ~rgb(13, 21, 20))`);

      if (hoverData.bg !== CYAN && !hoverData.bg.includes('212, 200')) {
        issues.push(`Button ${i}: hover bg is ${hoverData.bg}, not cyan`);
      }

      // ── Reset ────────────────────────────────────────────────────
      await page.mouse.move(100, 700);
      await page.waitForTimeout(400);
      console.log();

    } catch (err) {
      console.log(`Button ${i}: error — ${err.message}`);
    }
  }

  // ── Check headline color matches button cyan ────────────────────
  console.log('── Color match check ──');
  const headlineCyan = await page.evaluate(() => {
    const allEls = document.querySelectorAll('h1 *, h2 *, [class*="hero"] *');
    for (const el of allEls) {
      const color = window.getComputedStyle(el).color;
      if (color.includes('212') || color.includes('turquoise') || color.includes('0, 180')) {
        return { tag: el.tagName, class: el.className, color };
      }
    }
    return null;
  });

  if (headlineCyan) {
    console.log(`Headline cyan: ${headlineCyan.color} on <${headlineCyan.tag}>`);
    if (headlineCyan.color === CYAN) {
      console.log('✅ Headline cyan matches button cyan');
    } else {
      console.log(`⚠️  Colors differ — headline: ${headlineCyan.color}  button: ${CYAN}`);
      issues.push(`Color mismatch: headline=${headlineCyan.color} vs button=${CYAN}`);
    }
  } else {
    console.log('⚠️  No cyan headline color found');
  }

  // ── Full page hover state ────────────────────────────────────────
  if (buttons.length > 0) {
    await buttons[0].hover();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/00-full-hover.png` });
    await page.mouse.move(0, 0);
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════');
  console.log('SUMMARY');
  console.log('════════════════════════════════════');
  if (issues.length === 0) {
    console.log('✅ All checks passed!');
  } else {
    console.log(`❌ ${issues.length} issue(s) found:`);
    issues.forEach(issue => console.log(`   • ${issue}`));
  }
  console.log(`\nScreenshots in: ${OUT}/`);
  console.log('For each button, check:');
  console.log('  btn0-1-NORMAL.png  — dark bg, cyan square with dark arrow');
  console.log('  btn0-2-HOVER-MID   — cyan expanding from right');
  console.log('  btn0-3-HOVER-DONE  — full cyan, dark text, arrow on right');
  console.log('════════════════════════════════════\n');

  await browser.close();
})();
