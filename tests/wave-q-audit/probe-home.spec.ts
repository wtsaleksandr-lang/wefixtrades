/** Wave Q — diagnose the dev error overlay on `/`. */
import { test, expect } from '@playwright/test';

test('probe home dev error', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const pageErrors: string[] = [];
  const consoles: string[] = [];
  page.on('pageerror', e => pageErrors.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
  page.on('console', m => {
    if (m.type() === 'error') consoles.push(`[console.${m.type()}] ${m.text()}`);
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  // Grab overlay text
  const overlayText = await page.locator('vite-error-overlay').first().evaluate(el => {
    const sr = (el as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot;
    if (!sr) return '(no shadow root) ' + ((el as HTMLElement).innerText || '').slice(0, 2000);
    // Pull only the message + stack DOM elements, not the <style>.
    const message = sr.querySelector('.message')?.textContent || '';
    const messageBody = sr.querySelector('.message-body')?.textContent || '';
    const file = sr.querySelector('.file')?.textContent || '';
    const frame = sr.querySelector('.frame')?.textContent || '';
    const stack = sr.querySelector('.stack')?.textContent || '';
    return JSON.stringify({ message, messageBody, file, frame, stack }, null, 2);
  }).catch(() => '(no overlay element)');
  console.log('=== pageerror ===');
  for (const e of pageErrors) console.log(e);
  console.log('=== console.error ===');
  for (const c of consoles) console.log(c);
  console.log('=== overlay text ===');
  console.log(overlayText);
  expect(true).toBe(true);
});
