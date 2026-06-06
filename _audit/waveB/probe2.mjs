import { chromium } from 'playwright';
const URL = 'http://localhost:5099/wizard?template=driveway_paving';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// Dump preview calculator inner structure
const calc = await page.evaluate(() => {
  const root = document.querySelector('[data-testid="advanced-calculator"]');
  if (!root) return 'NO advanced-calculator';
  const testids = [];
  root.querySelectorAll('[data-testid]').forEach((e) => testids.push(e.getAttribute('data-testid')));
  // Result / total text
  const resultPanel = document.querySelector('[data-testid="advanced-result-panel"], [data-testid="advanced-result"], .qq-result-block');
  return {
    testids: [...new Set(testids)].slice(0, 80),
    resultText: resultPanel ? resultPanel.textContent.trim().slice(0, 300) : 'NO result panel',
    colspanCount: root.querySelectorAll('[data-colspan]').length,
  };
});
console.log(JSON.stringify(calc, null, 2));

// CTA, trust badges, tier presence
const spots = await page.evaluate(() => {
  const txt = (sel) => { const e = document.querySelector(sel); return e ? e.textContent.trim().slice(0,60) : null; };
  return {
    cta: txt('[data-testid="advanced-cta"]') || txt('button:has-text("Quote")') || 'check manually',
    hasTrust: !!document.querySelector('[data-testid*="trust"]'),
    hasTier: !!document.querySelector('[data-testid*="tier"]'),
  };
});
console.log('SPOTS', JSON.stringify(spots));
await browser.close();
