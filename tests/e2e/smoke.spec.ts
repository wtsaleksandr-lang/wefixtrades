import { test, expect } from '@playwright/test';

test('playwright smoke test - chromium launches and loads a page', async ({ page }) => {
  await page.goto('about:blank');
  const title = await page.title();
  expect(title).toBe('');
});
