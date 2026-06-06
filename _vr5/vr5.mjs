import { chromium } from 'playwright';
import fs from 'fs';

const OUT = 'C:/Users/Owner/.codex/wt-preview/_vr5';
const BASE = 'http://localhost:5099';
const log = (...a) => console.log(...a);

function contrastRatio(rgb1, rgb2) {
  const lum = (rgb) => {
    const a = rgb.map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  };
  const l1 = lum(rgb1), l2 = lum(rgb2);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
function parseRGB(s) {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map((x) => parseFloat(x.trim()));
  return { rgb: [parts[0], parts[1], parts[2]], a: parts.length > 3 ? parts[3] : 1 };
}

// resolve effective background by walking up ancestors for a non-transparent bg
async function effBg(loc) {
  return await loc.evaluate((el) => {
    let n = el;
    while (n) {
      const c = getComputedStyle(n).backgroundColor;
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const p = m[1].split(',').map((x) => parseFloat(x.trim()));
        const a = p.length > 3 ? p[3] : 1;
        if (a > 0.01) return c;
      }
      n = n.parentElement;
    }
    return 'rgb(255,255,255)';
  });
}

async function checkContrast(scope, sel, label, results, opts = {}) {
  const loc = scope.locator(sel).first();
  if (await loc.count() === 0) { results.push(`MISSING: ${label} (${sel})`); return; }
  const usePlaceholder = opts.placeholder;
  const color = usePlaceholder
    ? await loc.evaluate((el) => {
        // try ::placeholder color
        const cs = getComputedStyle(el, '::placeholder').color;
        return cs && cs !== 'rgba(0, 0, 0, 0)' ? cs : getComputedStyle(el).color;
      })
    : await loc.evaluate((el) => getComputedStyle(el).color);
  const bg = await effBg(loc);
  const fg = parseRGB(color), bgc = parseRGB(bg);
  if (!fg || !bgc) { results.push(`UNPARSEABLE: ${label} color=${color} bg=${bg}`); return; }
  // blend fg alpha over bg
  let r = fg.rgb;
  if (fg.a < 1) r = r.map((v, i) => v * fg.a + bgc.rgb[i] * (1 - fg.a));
  const ratio = contrastRatio(r, bgc.rgb);
  const verdict = ratio >= 4.5 ? 'OK' : ratio >= 3 ? 'LOW(AA-large only)' : 'FAIL';
  results.push(`${verdict} ${ratio.toFixed(2)}:1  ${label}  fg=${color} bg=${bg}`);
}

async function ensureBuildTab(page, mobile) {
  // try desktop rail tab
  const railTab = page.locator('[data-testid="editor-tab-build"]').first();
  if (await railTab.count() > 0 && await railTab.isVisible()) {
    await railTab.click().catch(() => {});
    return;
  }
  // mobile bottom bar - look for any element with build testid that's visible
  const anyBuild = page.locator('[data-testid="editor-tab-build"]');
  const n = await anyBuild.count();
  for (let i = 0; i < n; i++) {
    const el = anyBuild.nth(i);
    if (await el.isVisible()) { await el.click().catch(() => {}); return; }
  }
}

async function run(name, viewport, mobile) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport,
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
  });
  const page = await ctx.newPage();
  const R = { name, results: [], checks: {} };
  page.on('pageerror', (e) => R.results.push(`PAGEERROR: ${e.message}`));

  await page.goto(`${BASE}/wizard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await ensureBuildTab(page, mobile);
  await page.waitForTimeout(600);

  const card = page.locator('[data-testid="build-ai-card"]').first();
  R.checks.cardExists = await card.count() > 0 && await card.isVisible();

  // Is it the first thing in the build panel / above the template strip?
  let aboveTemplate = null;
  if (R.checks.cardExists) {
    const cardBox = await card.boundingBox();
    // find template strip heading text "Start from a template"
    const tmpl = page.getByText(/Start from a template/i).first();
    if (await tmpl.count() > 0) {
      const tBox = await tmpl.boundingBox();
      if (cardBox && tBox) aboveTemplate = cardBox.y < tBox.y;
    }
    R.checks.aboveTemplate = aboveTemplate;
    R.checks.cardBox = cardBox;
  }

  // sub-elements present
  for (const tid of ['build-ai-prompt', 'build-ai-chip-0', 'build-ai-chip-1', 'build-ai-chip-2', 'build-ai-generate']) {
    R.checks[tid] = await page.locator(`[data-testid="${tid}"]`).count() > 0;
  }
  // sparkles icon + title text
  R.checks.titleText = await card.count() ? (await card.innerText().catch(() => '')) : '';

  // screenshot the card
  if (R.checks.cardExists) {
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    await card.screenshot({ path: `${OUT}/${name}-card.png` }).catch(async () => {
      await page.screenshot({ path: `${OUT}/${name}-card-full.png` });
    });
  }
  await page.screenshot({ path: `${OUT}/${name}-buildtab-full.png`, fullPage: false });

  // CONTRAST checks
  const cr = [];
  if (R.checks.cardExists) {
    // title - find heading inside card
    await checkContrast(card, 'h1,h2,h3,h4,.title,[class*="title"]', 'card title', cr);
    await checkContrast(card, '[data-testid="build-ai-prompt"]', 'textarea placeholder', cr, { placeholder: true });
    await checkContrast(card, '[data-testid="build-ai-chip-0"]', 'chip-0 label', cr);
    await checkContrast(card, '[data-testid="build-ai-generate"]', 'generate button label', cr);
    // subtitle: paragraph in card
    await checkContrast(card, 'p', 'subtitle (first p)', cr);
  }
  R.checks.contrast = cr;

  // chip bg vs fill check (subtle vs bright)
  if (R.checks['build-ai-chip-0']) {
    R.checks.chipStyle = await page.locator('[data-testid="build-ai-chip-0"]').first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, border: cs.borderColor, borderWidth: cs.borderWidth, color: cs.color };
    });
  }
  if (R.checks['build-ai-generate']) {
    R.checks.btnStyle = await page.locator('[data-testid="build-ai-generate"]').first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, color: cs.color, disabled: el.disabled, ariaDisabled: el.getAttribute('aria-disabled') };
    });
  }

  // overflow check on card
  if (R.checks.cardExists) {
    R.checks.overflow = await card.evaluate((el) => ({
      scrollW: el.scrollWidth, clientW: el.clientWidth,
      overflowsX: el.scrollWidth > el.clientWidth + 1,
    }));
  }

  // Generate disabled when empty?
  const genBtn = page.locator('[data-testid="build-ai-generate"]').first();
  await page.locator('[data-testid="build-ai-prompt"]').first().fill('').catch(() => {});
  await page.waitForTimeout(200);
  R.checks.genDisabledWhenEmpty = await genBtn.evaluate((el) => el.disabled || el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled')).catch(() => null);

  // 3. chip click fills prompt
  const chip0 = page.locator('[data-testid="build-ai-chip-0"]').first();
  const chip0Text = (await chip0.innerText().catch(() => '')).trim();
  await chip0.click().catch(() => {});
  await page.waitForTimeout(300);
  const promptVal = await page.locator('[data-testid="build-ai-prompt"]').first().inputValue().catch(() => '');
  R.checks.chip0Text = chip0Text;
  R.checks.promptAfterChip = promptVal;
  R.checks.chipFillsPrompt = promptVal.trim().length > 0 && (promptVal.trim() === chip0Text || promptVal.includes(chip0Text) || chip0Text.includes(promptVal.trim()));

  // now generate should be enabled
  R.checks.genEnabledAfterFill = await genBtn.evaluate((el) => !(el.disabled || el.getAttribute('aria-disabled') === 'true')).catch(() => null);

  // 4. Generate opens assistant
  // ensure something is in the textarea
  if (!promptVal.trim()) {
    await page.locator('[data-testid="build-ai-prompt"]').first().fill('Build me a roofing landing page').catch(() => {});
  }
  await page.waitForTimeout(200);
  await genBtn.click().catch((e) => R.results.push('GEN CLICK ERR: ' + e.message));
  await page.waitForTimeout(1500);
  const aiPanel = page.locator('[data-testid="aibubble-panel"]').first();
  R.checks.assistantOpened = await aiPanel.count() > 0 && await aiPanel.isVisible();
  // capture any user message / panel text
  if (R.checks.assistantOpened) {
    R.checks.panelText = (await aiPanel.innerText().catch(() => '')).slice(0, 400);
    await page.screenshot({ path: `${OUT}/${name}-assistant-open.png` });
  } else {
    await page.screenshot({ path: `${OUT}/${name}-assistant-NOTopen.png` });
  }

  await browser.close();
  return R;
}

const out = {};
out.desktop = await run('desktop', { width: 1440, height: 900 }, false);
out.mobile = await run('mobile', { width: 412, height: 915 }, true);
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(out, null, 2));
log(JSON.stringify(out, null, 2));
