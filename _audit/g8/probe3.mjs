import { chromium } from 'playwright';
const id = process.argv[2] || 'solar_panel_install';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`http://localhost:5099/templates/${id}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
const info = await page.evaluate(() => {
  const calcs = [...document.querySelectorAll('[data-testid="advanced-calculator"]')];
  const titleEl = [...document.querySelectorAll('[data-testid="advanced-title"]')];
  return {
    count: calcs.length,
    titles: titleEl.map(t => t.textContent.trim()),
    rects: calcs.map(c => { const r=c.getBoundingClientRect(); const cs=getComputedStyle(c); return { top:Math.round(r.top+window.scrollY), w:Math.round(r.width), h:Math.round(r.height), vis:cs.visibility, disp:cs.display, opacity:cs.opacity }; }),
    // is there a 'hero'/'preview' wrapper that holds THE active widget?
    heroPreview: [...document.querySelectorAll('[class*="hero" i],[class*="preview" i],[data-testid*="preview" i]')].map(e=>({t:e.tagName,c:(e.className||'').toString().slice(0,50),tid:e.getAttribute('data-testid')})).slice(0,20)
  };
});
console.log(JSON.stringify(info,null,2));
await browser.close();
