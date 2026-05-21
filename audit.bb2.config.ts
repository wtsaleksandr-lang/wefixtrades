import { defineConfig, devices } from '@playwright/test';

/**
 * W-BB-2 — temporary audit config that targets a local vite preview on
 * port 5057. Mirrors audit.as1c.config.ts (different port so a lingering
 * AS-1c preview doesn't collide).
 *
 * Run:
 *   npx playwright test tests/audit/wave-bb2-variety-screenshot.spec.ts \
 *     --config audit.bb2.config.ts --reporter=line
 */
export default defineConfig({
  testDir: './tests/audit',
  testMatch: /wave-bb2-variety-screenshot\.spec\.ts/,
  fullyParallel: false,
  timeout: 180_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5057',
    browserName: 'chromium',
    ...devices['Desktop Chrome'],
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' },
  },
  webServer: {
    command: 'npx vite preview --port 5057 --strictPort',
    port: 5057,
    reuseExistingServer: true,
    timeout: 90_000,
  },
});
