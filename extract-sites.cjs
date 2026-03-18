const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const SITES = [
  { name: 'greptile',   url: 'https://www.greptile.com' },
  { name: 'doss',       url: 'https://www.doss.com' },
  { name: 'ventriloc',  url: 'https://ventriloc.ca/en' },
  { name: 'supersonik', url: 'https://supersonik.ai' },
];

const OUT = 'C:/WebAssets';

const download = (url, dest) => new Promise((resolve) => {
  try {
    const file = fs.createWriteStream(dest);
    https.get(url, res => res.pipe(file).on('finish', resolve))
      .on('error', resolve);
  } catch(e) { resolve(); }
});

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const site of SITES) {
    console.log(`\nProcessing ${site.name}...`);
    const dir = {
      root:   `${OUT}/${site.name}`,
      svg:    `${OUT}/${site.name}/svg`,
      css:    `${OUT}/${site.name}/css`,
      fonts:  `${OUT}/${site.name}/fonts`,
      frames: `${OUT}/${site.name}/frames`,
      data:   `${OUT}/${site.name}/data`,
    };
    Object.values(dir).forEach(d => fs.mkdirSync(d, { recursive: true }));

    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    // Intercept CSS and font files
    const cssFiles = [];
    const fontFiles = [];
    page.on('response', async (response) => {
      const url = response.url();
      const type = response.request().resourceType();
      try {
        if (type === 'stylesheet') {
          const text = await response.text();
          const fname = url.split('/').pop().split('?')[0] || 'style.css';
          fs.writeFileSync(`${dir.css}/${fname}`, text);
          cssFiles.push(fname);
        }
        if (type === 'font') {
          const fname = url.split('/').pop().split('?')[0];
          if (fname) fontFiles.push({ url, fname });
        }
      } catch(e) {}
    });

    try {
      await page.goto(site.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(4000);
    } catch(e) {
      console.log(`  Warning: ${site.name} load issue — continuing`);
    }

    // Download fonts
    for (const f of fontFiles) {
      await download(f.url, `${dir.fonts}/${f.fname}`);
    }
    console.log(`  Fonts: ${fontFiles.length}`);

    // Full page screenshot
    await page.screenshot({
      path: `${dir.frames}/01-full-page.png`,
      fullPage: true
    });

    // Scroll screenshots
    const height = await page.evaluate(() => document.body.scrollHeight);
    const steps = Math.ceil(height / 900);
    for (let i = 0; i < Math.min(steps, 8); i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * 900);
      await page.waitForTimeout(800);
      await page.screenshot({
        path: `${dir.frames}/scroll-${i}.png`
      });
    }

    // Extract all SVGs
    const svgs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('svg')).map((svg, i) => ({
        i,
        w: Math.round(svg.getBoundingClientRect().width),
        h: Math.round(svg.getBoundingClientRect().height),
        html: svg.outerHTML.substring(0, 10000),
        classes: svg.className?.baseVal?.substring(0, 60) || '',
      }));
    });

    svgs.forEach(s => {
      if (s.html && s.w > 8) {
        fs.writeFileSync(`${dir.svg}/svg-${s.i}-${s.w}x${s.h}.svg`, s.html);
      }
    });
    console.log(`  SVGs: ${svgs.filter(s => s.w > 8).length}`);

    // Extract all CSS animations and keyframes
    const animations = await page.evaluate(() => {
      const results = [];
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            const text = rule.cssText || '';
            if (
              text.includes('@keyframes') ||
              text.includes('animation') ||
              text.includes('transition') ||
              text.includes('transform') ||
              text.includes('cubic-bezier') ||
              (rule instanceof CSSKeyframesRule)
            ) {
              results.push(text.substring(0, 600));
            }
          }
        } catch(e) {}
      }
      return results;
    });
    fs.writeFileSync(
      `${dir.data}/animations.txt`,
      animations.join('\n\n---\n\n')
    );
    console.log(`  Animation rules: ${animations.length}`);

    // Extract design tokens
    const tokens = await page.evaluate(() => {
      const vars = {};
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText === ':root' || rule.selectorText === 'html') {
              for (const m of (rule.cssText || '').matchAll(/--([\w-]+)\s*:\s*([^;]+)/g)) {
                vars[`--${m[1]}`] = m[2].trim();
              }
            }
          }
        } catch(e) {}
      }
      const colors = {}, fonts = {}, radii = {};
      document.querySelectorAll('*').forEach(el => {
        const s = window.getComputedStyle(el);
        [s.backgroundColor, s.color].forEach(c => {
          if (c && c !== 'rgba(0, 0, 0, 0)') colors[c] = (colors[c]||0)+1;
        });
        if (s.borderRadius && s.borderRadius !== '0px')
          radii[s.borderRadius] = (radii[s.borderRadius]||0)+1;
        if (s.fontFamily)
          fonts[s.fontFamily] = (fonts[s.fontFamily]||0)+1;
      });
      return {
        cssVars: vars,
        topColors: Object.entries(colors).sort((a,b)=>b[1]-a[1]).slice(0,20),
        topFonts:  Object.entries(fonts).sort((a,b)=>b[1]-a[1]).slice(0,6),
        topRadii:  Object.entries(radii).sort((a,b)=>b[1]-a[1]).slice(0,10),
        bodyBg:    window.getComputedStyle(document.body).backgroundColor,
        bodyFont:  window.getComputedStyle(document.body).fontFamily,
      };
    });
    fs.writeFileSync(`${dir.data}/tokens.json`, JSON.stringify(tokens, null, 2));

    // External SVG/image URLs worth saving
    const externalAssets = await page.evaluate(() => {
      const assets = [];
      document.querySelectorAll('img[src*=".svg"], img[src*=".png"], img[src*=".webp"]').forEach(img => {
        if (img.src) assets.push({ type: 'img', src: img.src, alt: img.alt });
      });
      document.querySelectorAll('[style*="background-image"]').forEach(el => {
        const bg = window.getComputedStyle(el).backgroundImage;
        if (bg && bg !== 'none') assets.push({ type: 'bg', value: bg });
      });
      return assets;
    });
    fs.writeFileSync(
      `${dir.data}/external-assets.json`,
      JSON.stringify(externalAssets, null, 2)
    );

    // Hover over interactive elements and capture states
    const interactive = await page.$$('a, button, [class*="card"], [class*="btn"]');
    let hoverCount = 0;
    for (const el of interactive.slice(0, 6)) {
      try {
        const visible = await el.isVisible();
        if (!visible) continue;
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await el.hover();
        await page.waitForTimeout(400);
        await page.screenshot({
          path: `${dir.frames}/hover-${hoverCount}.png`
        });
        hoverCount++;
      } catch(e) {}
    }
    console.log(`  Hover frames: ${hoverCount}`);

    // Summary file
    const summary = {
      site: site.name,
      url: site.url,
      extractedAt: new Date().toISOString(),
      svgCount: svgs.filter(s => s.w > 8).length,
      cssFiles: cssFiles.length,
      fontFiles: fontFiles.length,
      animationRules: animations.length,
      hoverFrames: hoverCount,
      bodyBackground: tokens.bodyBg,
      bodyFont: tokens.bodyFont,
      topColors: tokens.topColors.slice(0, 5),
    };
    fs.writeFileSync(`${dir.root}/SUMMARY.json`, JSON.stringify(summary, null, 2));
    console.log(`  Done — ${site.name}`);

    await page.close();
  }

  await browser.close();
  console.log('\n✅ ALL DONE — check C:/WebAssets/');
  console.log('Folders: greptile / doss / ventriloc / supersonik');
  console.log('Each contains: svg/ css/ fonts/ frames/ data/ SUMMARY.json');
})();
