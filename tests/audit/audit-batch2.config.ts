/**
 * Standalone Playwright config for the batch-2 product pages audit.
 * Hits the LIVE prod site (https://wefixtrades.com) — no local server.
 *
 * Run with:
 *   npx playwright test --config tests/audit/audit-batch2.config.ts
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'visual-audit-batch2.spec.ts',
  // Per-test budget: 90s per route per the audit brief.
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
