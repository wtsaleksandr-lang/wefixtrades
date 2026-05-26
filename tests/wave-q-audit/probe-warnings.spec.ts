/** Wave Q — collect all warnings for a single URL. */
import { test, expect } from '@playwright/test';

const URL = process.env.WAVE_Q_URL || '/';

test('probe warnings', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const all: string[] = [];
  page.on('console', m => {
    const loc = m.location();
    all.push(`[${m.type()}] ${m.text()} @ ${loc.url}:${loc.lineNumber}`);
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  console.log(`=== ALL CONSOLE for ${URL} ===`);
  for (const x of all) console.log(x);
  expect(true).toBe(true);
});
