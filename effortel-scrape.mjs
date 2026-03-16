import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const TARGET = 'https://effortel.com';
const OUT_DIR = './effortel-extracted';

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome',
});
const page = await browser.newPage();

// Capture all network requests (JS + CSS)
const resources = [];

page.on('response', async (response) => {
  const url = response.url();
  const type = response.request().resourceType();
  if (['stylesheet', 'script'].includes(type)) {
    try {
      const body = await response.text();
      resources.push({ url, type, body });
    } catch {}
  }
});

await page.goto(TARGET, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000); // let animations initialize

// --- Extract computed CSS from animated elements ---
const animationData = await page.evaluate(() => {
  const ANIM_KEYWORDS = ['gsap', 'ScrollTrigger', 'animation', 'transition', 'transform', 'motion', 'lottie', 'framer'];

  // Get all elements with animation/transition styles
  const allElements = document.querySelectorAll('*');
  const animatedElements = [];

  allElements.forEach((el) => {
    const computed = window.getComputedStyle(el);
    const animation = computed.animation;
    const transition = computed.transition;
    const transform = computed.transform;

    if (
      (animation && animation !== 'none') ||
      (transition && transition !== 'all 0s ease 0s') ||
      (transform && transform !== 'none')
    ) {
      animatedElements.push({
        tag: el.tagName,
        class: el.className,
        id: el.id,
        animation,
        transition,
        transform,
        innerHTML: el.innerHTML.slice(0, 200)
      });
    }
  });

  // Detect which animation libraries are loaded
  const libs = {
    gsap: typeof window.gsap !== 'undefined',
    ScrollTrigger: typeof window.ScrollTrigger !== 'undefined',
    lottie: typeof window.lottie !== 'undefined',
    framerMotion: typeof window.motion !== 'undefined',
    anime: typeof window.anime !== 'undefined',
    AOS: typeof window.AOS !== 'undefined',
  };

  // Extract all CSS keyframes from stylesheets
  const keyframes = [];
  Array.from(document.styleSheets).forEach((sheet) => {
    try {
      Array.from(sheet.cssRules || []).forEach((rule) => {
        if (rule instanceof CSSKeyframesRule) {
          keyframes.push(rule.cssText);
        }
      });
    } catch {}
  });

  return { animatedElements, libs, keyframes };
});

// --- Filter JS files for animation keywords ---
const ANIM_JS_KEYWORDS = ['gsap', 'ScrollTrigger', 'lottie', 'anime', 'motion', 'keyframe', 'timeline', 'tween'];

const animationScripts = resources.filter(({ body, type }) => {
  if (type !== 'script') return false;
  return ANIM_JS_KEYWORDS.some(kw => body.toLowerCase().includes(kw));
});

const allCSS = resources.filter(r => r.type === 'stylesheet');

// --- Save outputs ---
fs.writeFileSync(
  path.join(OUT_DIR, 'animation-data.json'),
  JSON.stringify(animationData, null, 2)
);

fs.writeFileSync(
  path.join(OUT_DIR, 'detected-libraries.json'),
  JSON.stringify(animationData.libs, null, 2)
);

animationScripts.forEach((s, i) => {
  const name = new URL(s.url).pathname.split('/').pop() || `script-${i}.js`;
  fs.writeFileSync(path.join(OUT_DIR, name), s.body);
});

allCSS.forEach((s, i) => {
  const name = new URL(s.url).pathname.split('/').pop() || `style-${i}.css`;
  fs.writeFileSync(path.join(OUT_DIR, name), s.body);
});

// Save full rendered HTML
const html = await page.content();
fs.writeFileSync(path.join(OUT_DIR, 'rendered.html'), html);

console.log('✅ Done. Libraries detected:', animationData.libs);
console.log('📁 Files saved to:', OUT_DIR);

await browser.close();
