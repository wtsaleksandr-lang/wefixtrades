/**
 * Standalone Playwright config for the a11y batch-3 audit (2026-05-24).
 * Hits the LIVE prod site (https://wefixtrades.com) — no local server.
 *
 * Run with:
 *   npx playwright test --config tests/audit/audit-batch3.config.ts
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'a11y-batch3.spec.ts',
  timeout: 90_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    headless: true,
    ignoreHTTPSErrors: true,
  },
});
