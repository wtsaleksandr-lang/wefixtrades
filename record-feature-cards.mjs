// ============================================================
// EFFORTEL.COM — OVERLAPPING FEATURE CARDS RECORDER
// Targets the "Intuitive Interface" section with stacking cards
// Run: node record-feature-cards.mjs
// ============================================================

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const TARGET = 'https://www.effortel.com';
const OUT_DIR = './feature-cards-recording';
const FRAMES_DIR = path.join(OUT_DIR, 'frames');
const DATA_DIR = path.join(OUT_DIR, 'data');

fs.mkdirSync(FRAMES_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: '/nix/store/97i48clxaw4l9g4klvfp3l6xks7zyl3v-playwright-chromium/chrome-linux/chrome',
  args: ['--window-size=1440,900', '--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// — INTERCEPT ANIMATION FILES ————————————————————————————————
const savedFiles = [];
page.on('response', async (res) => {
  const url = res.url();
  const type = res.request().resourceType();
  if (!['stylesheet', 'script'].includes(type)) return;
  try {
    const body = await res.text();
    const hit = ['ScrollTrigger', 'gsap', 'scrub', 'pin', 'stagger', 'lenis'].some(k =>
      body.includes(k)
    );
    if (hit) {
      const fname = url.split('/').pop().split('?')[0] || `file-${savedFiles.length}.js`;
      fs.writeFileSync(path.join(DATA_DIR, fname), body);
      savedFiles.push(url);
    }
  } catch {}
});

console.log('🔴 Loading effortel.com...');
await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

// — FIND THE FEATURE CARDS SECTION ——————————————————————————
const sectionInfo = await page.evaluate(() => {
  const candidates = [
    document.querySelector('.section-overlapping'),
    document.querySelector('[class*="overlapping"]'),
    document.querySelector('[class*="feature"]'),
    ...[...document.querySelectorAll('section')].filter(s =>
      s.textContent.includes('Intuitive Interface') ||
      s.textContent.includes('Self-Management') ||
      s.textContent.includes('Powerful') ||
      s.textContent.includes('Self-Service')
    ),
  ].filter(Boolean);

  return candidates.map(el => ({
    tag:       el.tagName,
    class:     el.className?.toString().slice(0, 120),
    id:        el.id,
    offsetTop: Math.round(el.getBoundingClientRect().top + window.scrollY),
    height:    Math.round(el.offsetHeight),
    children:  el.children.length,
    html:      el.outerHTML.slice(0, 3000),
  }));
});

fs.writeFileSync(
  path.join(DATA_DIR, 'section-info.json'),
  JSON.stringify(sectionInfo, null, 2)
);
console.log(`\n🔍 Feature section candidates found: ${sectionInfo.length}`);
sectionInfo.forEach(s => console.log(`   .${s.class.split(' ')[0]} — offsetTop: ${s.offsetTop}px, height: ${s.height}px`));

// — EXTRACT FULL HTML OF THE SECTION ————————————————————————
const sectionHTML = await page.evaluate(() => {
  const el =
    document.querySelector('.section-overlapping') ||
    document.querySelector('[class*="overlapping"]') ||
    [...document.querySelectorAll('section')].find(s =>
      s.textContent.includes('Intuitive Interface') ||
      s.textContent.includes('Self-Service Tools')
    );
  if (!el) return null;
  return {
    outerHTML:   el.outerHTML,
    innerText:   el.innerText,
    classList:   [...el.classList],
    parentClass: el.parentElement?.className?.toString(),
  };
});

if (sectionHTML) {
  fs.writeFileSync(path.join(DATA_DIR, 'section-full.html'), sectionHTML.outerHTML);
  fs.writeFileSync(path.join(DATA_DIR, 'section-text-content.txt'), sectionHTML.innerText);
  console.log('\n✅ Full section HTML saved → data/section-full.html');
  console.log('✅ Text content saved     → data/section-text-content.txt');
}

// — EXTRACT EACH CARD'S CONTENT + STYLES ————————————————————
const cardsData = await page.evaluate(() => {
  const section =
    document.querySelector('.section-overlapping') ||
    document.querySelector('[class*="overlapping"]') ||
    [...document.querySelectorAll('section')].find(s =>
      s.textContent.includes('Intuitive Interface')
    );
  if (!section) return [];

  const cardPairs = [];
  const allCards = section.querySelectorAll('[class*="card"], [class*="sticky"], aside, .container-small');

  allCards.forEach((card, i) => {
    const cs = window.getComputedStyle(card);
    const rect = card.getBoundingClientRect();
    cardPairs.push({
      index:          i,
      class:          card.className?.toString().slice(0, 120),
      tag:            card.tagName,
      innerText:      card.innerText?.slice(0, 500),
      position:       cs.position,
      top:            cs.top,
      zIndex:         cs.zIndex,
      background:     cs.backgroundColor,
      borderRadius:   cs.borderRadius,
      transform:      cs.transform,
      opacity:        cs.opacity,
      offsetTop:      Math.round(card.getBoundingClientRect().top + window.scrollY),
      width:          Math.round(rect.width),
      height:         Math.round(rect.height),
      hasImage:       !!card.querySelector('img'),
      hasCanvas:      !!card.querySelector('canvas'),
      dataTrigger:    card.getAttribute('data-trigger'),
      dataAnimation:  card.getAttribute('data-animation-type'),
      children: [...card.children].map(c => ({
        tag:   c.tagName,
        class: c.className?.toString().slice(0, 60),
        text:  c.innerText?.slice(0, 100),
      })),
    });
  });

  return cardPairs;
});

fs.writeFileSync(
  path.join(DATA_DIR, 'cards-data.json'),
  JSON.stringify(cardsData, null, 2)
);
console.log(`\n🃏 Cards extracted: ${cardsData.length}`);

// — EXTRACT GSAP SCROLLTRIGGER FOR THIS SECTION ——————————————
const scrollTriggers = await page.evaluate(() => {
  if (typeof ScrollTrigger === 'undefined') return { error: 'ScrollTrigger not found' };
  return ScrollTrigger.getAll().map(st => {
    const trigger = st.vars?.trigger;
    let animVars = null;
    if (st.animation) {
      try {
        const v = st.animation.vars || {};
        // Extract only primitive values to avoid circular refs
        animVars = JSON.stringify(Object.fromEntries(
          Object.entries(v).filter(([,val]) => {
            const t = typeof val;
            return t === 'string' || t === 'number' || t === 'boolean' || val === null;
          })
        )).slice(0, 300);
      } catch(e) { animVars = 'parse-error'; }
    }
    return {
      triggerClass:  trigger?.className?.toString().slice(0, 80) || String(trigger),
      triggerTag:    trigger?.tagName,
      start:         typeof st.vars?.start === 'string' ? st.vars.start : null,
      end:           typeof st.vars?.end === 'string' ? st.vars.end : null,
      scrub:         st.vars?.scrub,
      pin:           !!st.vars?.pin,
      pinSpacing:    st.vars?.pinSpacing,
      anticipatePin: st.vars?.anticipatePin,
      toggleActions: st.vars?.toggleActions,
      markers:       st.vars?.markers,
      progressNow:   st.progress,
      animVars,
    };
  });
});

fs.writeFileSync(
  path.join(DATA_DIR, 'scroll-triggers.json'),
  JSON.stringify(scrollTriggers, null, 2)
);
console.log(`🎬 ScrollTrigger instances: ${Array.isArray(scrollTriggers) ? scrollTriggers.length : 0}`);

// — EXTRACT LENIS CONFIG —————————————————————————————————————
const lenisConfig = await page.evaluate(() => {
  if (typeof window.lenis === 'undefined' && typeof window.Lenis === 'undefined') return null;
  const l = window.lenis || window.__lenis;
  if (!l) return { detected: true, config: 'instance not on window' };
  return {
    duration:  l.duration,
    easing:    l.easing?.toString().slice(0, 100),
    smooth:    l.smooth,
    direction: l.direction,
    smoothWheel: l.smoothWheel,
  };
});
fs.writeFileSync(path.join(DATA_DIR, 'lenis-config.json'), JSON.stringify(lenisConfig, null, 2));

// — SCROLL TO SECTION + SLOW RECORD —————————————————————————
const sectionTop = sectionInfo[0]?.offsetTop || 1000;
const sectionHeight = sectionInfo[0]?.height || 2000;

console.log(`\n🎬 Recording section at offsetTop: ${sectionTop}px, height: ${sectionHeight}px`);

const startY = Math.max(0, sectionTop - 200);
const endY = sectionTop + sectionHeight + 400;

await page.evaluate((y) => window.scrollTo(0, y), startY);
await page.waitForTimeout(1500);

await page.screenshot({ path: path.join(FRAMES_DIR, 'frame-000-before-section.png') });

const STEP = 30;
const PAUSE = 80;

let frameCount = 1;
let lastScreenshotY = startY - 999;

console.log('   Scrolling...');
for (let y = startY; y <= endY; y += STEP) {
  await page.evaluate((scrollY) => window.scrollTo({ top: scrollY, behavior: 'instant' }), y);
  await page.waitForTimeout(PAUSE);

  if (y - lastScreenshotY >= 60) {
    const num = String(frameCount).padStart(3, '0');
    await page.screenshot({
      path: path.join(FRAMES_DIR, `frame-${num}-y${y}.png`),
    });

    const liveState = await page.evaluate((currentY) => {
      const cards = document.querySelectorAll(
        '.section-overlapping [class*="card"], .section-overlapping aside, [class*="sticky-card"]'
      );
      return {
        scrollY: currentY,
        cards: [...cards].map(c => {
          const cs = window.getComputedStyle(c);
          return {
            class:     c.className?.toString().slice(0, 60),
            transform: cs.transform,
            opacity:   cs.opacity,
            zIndex:    cs.zIndex,
            rectTop:   Math.round(c.getBoundingClientRect().top),
          };
        }),
      };
    }, y);

    fs.appendFileSync(
      path.join(DATA_DIR, 'live-scroll-states.jsonl'),
      JSON.stringify(liveState) + '\n'
    );

    lastScreenshotY = y;
    frameCount++;
    process.stdout.write(`\r   Y: ${y}px → frame ${frameCount}`);
  }
}

console.log(`\n✅ Recorded ${frameCount} frames through section`);

// — CAPTURE KEY SCROLL MOMENTS ———————————————————————————————
console.log('\n📸 Capturing key transition moments...');
const keyMoments = [0, 0.25, 0.5, 0.75, 1.0];
for (const progress of keyMoments) {
  const y = Math.round(startY + (endY - startY) * progress);
  await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(FRAMES_DIR, `KEY-${Math.round(progress*100)}pct-y${y}.png`),
  });
}

// — EXTRACT CSS FOR THIS SECTION —————————————————————————————
const sectionCSS = await page.evaluate(() => {
  const relevantRules = [];
  const KEYWORDS = [
    'overlapping', 'sticky', 'card', 'feature',
    'section-0', 'padding-section',
  ];
  Array.from(document.styleSheets).forEach(sheet => {
    try {
      Array.from(sheet.cssRules || []).forEach(rule => {
        if (rule instanceof CSSStyleRule) {
          const sel = rule.selectorText || '';
          if (KEYWORDS.some(k => sel.toLowerCase().includes(k))) {
            relevantRules.push({
              selector: sel,
              css: rule.cssText.slice(0, 400),
            });
          }
        }
        if (rule instanceof CSSKeyframesRule) {
          relevantRules.push({
            keyframe: rule.name,
            css: rule.cssText.slice(0, 500),
          });
        }
      });
    } catch {}
  });
  return relevantRules;
});

fs.writeFileSync(
  path.join(DATA_DIR, 'section-css.json'),
  JSON.stringify(sectionCSS, null, 2)
);
console.log(`\n🎨 CSS rules extracted for section: ${sectionCSS.length}`);

// — EXTRACT ALL TEXT CONTENT PER CARD ————————————————————————
const cardTextContent = await page.evaluate(() => {
  const section =
    document.querySelector('.section-overlapping') ||
    [...document.querySelectorAll('section')].find(s =>
      s.textContent.includes('Intuitive Interface')
    );
  if (!section) return [];

  const numbered = [...section.querySelectorAll('*')].filter(el =>
    /^0[1-9]$/.test(el.textContent?.trim())
  );

  const results = [];
  numbered.forEach(numEl => {
    let card = numEl;
    for (let i = 0; i < 5; i++) {
      if (card.parentElement) card = card.parentElement;
      if (card.offsetHeight > 200) break;
    }
    results.push({
      number:    numEl.textContent?.trim(),
      cardClass: card.className?.toString().slice(0, 80),
      fullText:  card.innerText?.slice(0, 600),
      html:      card.outerHTML.slice(0, 1500),
    });
  });
  return results;
});

fs.writeFileSync(
  path.join(DATA_DIR, 'card-text-content.json'),
  JSON.stringify(cardTextContent, null, 2)
);

// — SUMMARY ——————————————————————————————————————————————————
const summary = {
  recordedAt:       new Date().toISOString(),
  sectionOffsetTop: sectionTop,
  sectionHeight:    sectionHeight,
  framesRecorded:   frameCount,
  scrollTriggers:   Array.isArray(scrollTriggers) ? scrollTriggers.length : 0,
  cardsFound:       cardsData.length,
  cssRules:         sectionCSS.length,
  savedJsFiles:     savedFiles,
  outputs: {
    frames:         'frames/ — scroll through animation frame by frame',
    sectionHTML:    'data/section-full.html — full markup of the section',
    sectionText:    'data/section-text-content.txt — all copy/text',
    scrollTriggers: 'data/scroll-triggers.json — GSAP ScrollTrigger config',
    liveStates:     'data/live-scroll-states.jsonl — transform/opacity at each scroll position',
    cardContent:    'data/card-text-content.json — per-card text and HTML',
    css:            'data/section-css.json — extracted CSS rules',
    lenis:          'data/lenis-config.json — smooth scroll config',
  },
};
fs.writeFileSync(path.join(OUT_DIR, 'SUMMARY.json'), JSON.stringify(summary, null, 2));

console.log('\n');
console.log('─────────────────────────────────────────────────────');
console.log('  FEATURE CARDS RECORDING COMPLETE');
console.log('─────────────────────────────────────────────────────');
console.log(`  📁 Output:    ./${OUT_DIR}/`);
console.log(`  🖼️  Frames:    ${frameCount} screenshots (frames/)`);
console.log(`  📄 Section HTML:   data/section-full.html`);
console.log(`  📝 Text content:   data/section-text-content.txt`);
console.log(`  🎬 Scroll config:  data/scroll-triggers.json`);
console.log(`  📊 Live states:    data/live-scroll-states.jsonl`);
console.log(`  🃏 Card content:   data/card-text-content.json`);
console.log('─────────────────────────────────────────────────────');

await browser.close();
