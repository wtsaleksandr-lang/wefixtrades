import { defineConfig, devices } from '@playwright/test';

/**
 * W-AS-1c — temporary audit config that targets an already-running vite
 * preview on port 5056. Mirrors audit.as1b.config.ts (different port so a
 * lingering AS-1b preview doesn't collide with this one).
 *
 * Run:
 *   npx playwright test tests/audit/wave-as1c-template-polish.spec.ts \
 *     --config audit.as1c.config.ts --reporter=line
 */
export default defineConfig({
  testDir: './tests/audit',
  testMatch: /wave-as1c-template-polish\.spec\.ts/,
  fullyParallel: false,
  timeout: 180_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5056',
    browserName: 'chromium',
    ...devices['Desktop Chrome'],
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' },
  },
  webServer: {
    command: 'npx vite preview --port 5056 --strictPort',
    port: 5056,
    reuseExistingServer: true,
    timeout: 90_000,
  },
});
