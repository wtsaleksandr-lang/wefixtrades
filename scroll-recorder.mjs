// ============================================================
// EFFORTEL.COM — FULL SCROLL EXPERIENCE RECORDER
// Captures screenshots + animation data at every scroll position
// Run: node scroll-recorder.mjs
// ============================================================

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const TARGET = 'https://www.effortel.com';
const OUT_DIR = './scroll-recording';
const SCREENSHOT_DIR = path.join(OUT_DIR, 'frames');
const DATA_DIR = path.join(OUT_DIR, 'data');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: '/nix/store/97i48clxaw4l9g4klvfp3l6xks7zyl3v-playwright-chromium/chrome-linux/chrome',
  args: ['--window-size=1440,900', '--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// — 1. INTERCEPT AND SAVE ALL CSS/JS FILES —
const animationResources = [];
page.on('response', async (response) => {
  const url = response.url();
  const type = response.request().resourceType();
  if (['stylesheet', 'script'].includes(type)) {
    try {
      const body = await response.text();
      const ANIM_KEYWORDS = [
        'gsap', 'ScrollTrigger', 'scrolltrigger', 'animation',
        'keyframe', 'translate', 'transform', 'opacity', 'scale',
        'stagger', 'timeline', 'tween', 'ease', 'scrub', 'pin',
        'fromTo', 'from(', 'to(', 'IntersectionObserver'
      ];
      const relevanceScore = ANIM_KEYWORDS.filter(kw =>
        body.toLowerCase().includes(kw.toLowerCase())
      ).length;

      if (relevanceScore >= 3) {
        animationResources.push({ url, type, relevanceScore, bodyLength: body.length });
        const filename = url.split('/').pop().split('?')[0] || `resource-${animationResources.length}`;
        fs.writeFileSync(path.join(DATA_DIR, filename), body);
      }
    } catch {}
  }
});

console.log('Loading effortel.com...');
await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

// — 2. DETECT ANIMATION LIBRARIES —
const libs = await page.evaluate(() => ({
  gsap:            typeof window.gsap !== 'undefined',
  ScrollTrigger:   typeof window.ScrollTrigger !== 'undefined',
  lottie:          typeof window.lottie !== 'undefined',
  rive:            typeof window.rive !== 'undefined' || typeof window.Rive !== 'undefined',
  framerMotion:    typeof window.motion !== 'undefined',
  anime:           typeof window.anime !== 'undefined',
  AOS:             typeof window.AOS !== 'undefined',
  locomotive:      typeof window.LocomotiveScroll !== 'undefined',
  barba:           typeof window.barba !== 'undefined',
  intersectionObs: typeof window.IntersectionObserver !== 'undefined',
  jQuery:          typeof window.jQuery !== 'undefined',
}));

console.log('\nAnimation libraries detected:');
Object.entries(libs).forEach(([lib, found]) => {
  if (found) console.log(`   ✓ ${lib}`);
});
fs.writeFileSync(path.join(DATA_DIR, 'detected-libraries.json'), JSON.stringify(libs, null, 2));

// — 3. EXTRACT ALL GSAP SCROLLTRIGGER INSTANCES —
const scrollTriggerData = await page.evaluate(() => {
  if (typeof window.ScrollTrigger === 'undefined') return [];
  try {
    return ScrollTrigger.getAll().map(st => ({
      trigger:   st.vars?.trigger?.className || st.vars?.trigger?.tagName || String(st.vars?.trigger),
      start:     st.vars?.start,
      end:       st.vars?.end,
      scrub:     st.vars?.scrub,
      pin:       st.vars?.pin,
      markers:   st.vars?.markers,
      animation: st.animation ? {
        targets:   st.animation.targets?.map ? st.animation.targets.map(t => t.className || t.tagName).slice(0,3) : null,
        duration:  st.animation.duration?.(),
        vars:      JSON.stringify(st.animation.vars || {}).slice(0, 200),
      } : null,
    }));
  } catch (e) {
    return [{ error: e.message }];
  }
});

fs.writeFileSync(
  path.join(DATA_DIR, 'gsap-scroll-triggers.json'),
  JSON.stringify(scrollTriggerData, null, 2)
);
console.log(`\nGSAP ScrollTrigger instances found: ${scrollTriggerData.length}`);

// — 4. MAP ALL ANIMATED ELEMENTS ON PAGE —
const allAnimatedElements = await page.evaluate(() => {
  const results = [];
  document.querySelectorAll('*').forEach(el => {
    const cs = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const hasAnim =
      (cs.animation && cs.animation !== 'none 0s ease 0s 1 normal none running') ||
      (cs.transition && cs.transition !== 'all 0s ease 0s') ||
      el.hasAttribute('data-trigger') ||
      el.hasAttribute('letters-slide-up') ||
      el.hasAttribute('line-slide-up') ||
      el.hasAttribute('split-words') ||
      el.hasAttribute('data-rive-url') ||
      el.hasAttribute('data-animation-type');

    if (hasAnim && rect.width > 0) {
      results.push({
        tag:       el.tagName,
        id:        el.id || null,
        class:     el.className?.toString().slice(0, 100),
        dataTrigger:     el.getAttribute('data-trigger'),
        dataAnimation:   el.getAttribute('data-animation-type'),
        riveUrl:         el.getAttribute('data-rive-url'),
        animation:       cs.animation?.slice(0, 100),
        transition:      cs.transition?.slice(0, 100),
        offsetTop:       Math.round(el.getBoundingClientRect().top + window.scrollY),
        height:          Math.round(rect.height),
        width:           Math.round(rect.width),
      });
    }
  });
  return results.sort((a, b) => a.offsetTop - b.offsetTop);
});

fs.writeFileSync(
  path.join(DATA_DIR, 'animated-elements-map.json'),
  JSON.stringify(allAnimatedElements, null, 2)
);
console.log(`Animated elements mapped: ${allAnimatedElements.length}`);

// — 5. GET FULL PAGE HEIGHT —
const pageHeight = await page.evaluate(() => document.body.scrollHeight);
console.log(`\nFull page height: ${pageHeight}px`);

// — 6. SLOW SCROLL + SCREENSHOT AT EVERY MEANINGFUL POSITION —
const SCROLL_STEP = 80;
const PAUSE_PER_STEP = 120;
const SCREENSHOT_EVERY = 200;

console.log(`\nStarting slow scroll recording...`);
console.log(`   Steps: every ${SCROLL_STEP}px | Screenshots: every ${SCREENSHOT_EVERY}px`);
console.log(`   Estimated frames: ~${Math.ceil(pageHeight / SCREENSHOT_EVERY)}`);

let lastScreenshotY = -1;
const scrollLog = [];

for (let y = 0; y <= pageHeight; y += SCROLL_STEP) {
  await page.evaluate((scrollY) => {
    window.scrollTo({ top: scrollY, behavior: 'instant' });
  }, y);

  await page.waitForTimeout(PAUSE_PER_STEP);

  if (y === 0 || y - lastScreenshotY >= SCREENSHOT_EVERY) {
    const frameNum = String(Math.floor(y / SCREENSHOT_EVERY)).padStart(4, '0');
    const screenshotPath = path.join(SCREENSHOT_DIR, `frame-${frameNum}-y${y}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    lastScreenshotY = y;

    const currentState = await page.evaluate((currentY) => {
      const viewportElements = [];
      document.querySelectorAll('[data-trigger], [letters-slide-up], [line-slide-up], [class*="sticky"], [class*="gsap"]').forEach(el => {
        const rect = el.getBoundingClientRect();
        const cs = window.getComputedStyle(el);
        if (rect.bottom > -100 && rect.top < window.innerHeight + 100) {
          viewportElements.push({
            class:     el.className?.toString().slice(0, 80),
            transform: cs.transform,
            opacity:   cs.opacity,
            rectTop:   Math.round(rect.top),
          });
        }
      });
      return { scrollY: currentY, viewportElements };
    }, y);

    scrollLog.push(currentState);
    process.stdout.write(`\r   Progress: ${Math.min(y, pageHeight)}/${pageHeight}px (${Math.round(Math.min(y,pageHeight)/pageHeight*100)}%)`);
  }
}

console.log('\nScroll recording complete');

// — 7. EXTRACT CSS KEYFRAMES —
const keyframes = await page.evaluate(() => {
  const kfs = [];
  Array.from(document.styleSheets).forEach(sheet => {
    try {
      Array.from(sheet.cssRules || []).forEach(rule => {
        if (rule instanceof CSSKeyframesRule) {
          kfs.push({ name: rule.name, css: rule.cssText.slice(0, 500) });
        }
        if (rule instanceof CSSStyleRule) {
          const text = rule.cssText;
          if (text.includes('animation') || text.includes('transition') || text.includes('@keyframes')) {
            kfs.push({ selector: rule.selectorText, css: text.slice(0, 300) });
          }
        }
      });
    } catch {}
  });
  return kfs;
});

fs.writeFileSync(
  path.join(DATA_DIR, 'css-keyframes.json'),
  JSON.stringify(keyframes, null, 2)
);
console.log(`\nCSS keyframe rules extracted: ${keyframes.length}`);

// — 8. EXTRACT SECTION MAP —
const sectionMap = await page.evaluate(() => {
  const sections = document.querySelectorAll('section, [class*="section"], aside, [class*="padding-section"]');
  return Array.from(sections).map(s => ({
    tag:       s.tagName,
    class:     s.className?.toString().slice(0, 80),
    offsetTop: Math.round(s.getBoundingClientRect().top + window.scrollY),
    height:    Math.round(s.offsetHeight),
    bg:        window.getComputedStyle(s).backgroundColor,
    borderRadius: window.getComputedStyle(s).borderRadius,
  }));
});

fs.writeFileSync(
  path.join(DATA_DIR, 'section-map.json'),
  JSON.stringify(sectionMap, null, 2)
);

// — 9. SAVE SCROLL LOG —
fs.writeFileSync(
  path.join(DATA_DIR, 'scroll-animation-log.json'),
  JSON.stringify(scrollLog, null, 2)
);

// — 10. GENERATE SUMMARY REPORT —
const report = {
  recordedAt:        new Date().toISOString(),
  targetUrl:         TARGET,
  pageHeightPx:      pageHeight,
  totalFrames:       scrollLog.length,
  librariesDetected: Object.entries(libs).filter(([,v]) => v).map(([k]) => k),
  scrollTriggers:    scrollTriggerData.length,
  animatedElements:  allAnimatedElements.length,
  cssKeyframes:      keyframes.length,
  sections:          sectionMap.length,
  resourceFiles:     animationResources.map(r => ({
    url:       r.url,
    type:      r.type,
    relevance: r.relevanceScore,
    sizeKb:    Math.round(r.bodyLength / 1024),
  })).sort((a,b) => b.relevance - a.relevance),
};

fs.writeFileSync(
  path.join(OUT_DIR, 'SUMMARY.json'),
  JSON.stringify(report, null, 2)
);

console.log('\n');
console.log('─────────────────────────────────────────');
console.log('  SCROLL RECORDING COMPLETE');
console.log('─────────────────────────────────────────');
console.log(`  Output folder:     ./${OUT_DIR}/`);
console.log(`  Screenshot frames: ${scrollLog.length} (in /frames/)`);
console.log(`  GSAP ScrollTriggers: ${scrollTriggerData.length}`);
console.log(`  Animated elements:   ${allAnimatedElements.length}`);
console.log(`  CSS keyframes:       ${keyframes.length}`);
console.log(`  Sections mapped:     ${sectionMap.length}`);
console.log('─────────────────────────────────────────');

await browser.close();
