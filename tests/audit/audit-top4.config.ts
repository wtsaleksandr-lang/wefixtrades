/**
 * Standalone Playwright config for the top-4 marketing audit.
 * Hits the LIVE prod site (https://wefixtrades.com) — no local server.
 *
 * Run with:
 *   npx playwright test --config tests/audit/audit-top4.config.ts
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'visual-audit-top4.spec.ts',
  // Per-test budget: route must complete inside 2 min per the audit brief.
  timeout: 120_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    headless: true,
    ignoreHTTPSErrors: true,
  },
});
