import { defineConfig, devices } from '@playwright/test';

/**
 * W-AP-3 — temporary audit config that targets an already-running vite
 * preview on port 5055 instead of the default 5000. The shared :5000 on
 * this dev host is occupied by a DelayPredict server that responds 401 to
 * /wizard, which blocks the regular audit.config.ts.
 *
 * Bring up the preview yourself first:
 *   npx vite preview --port 5055 --strictPort
 *
 * Then:
 *   npx playwright test tests/audit/wave-ap3-template-gallery.spec.ts \
 *     --config audit.ap3.config.ts --reporter=line
 *
 * This file is for the WAP-3 capture spec only and can be removed once the
 * audit is merged.
 */
export default defineConfig({
  testDir: './tests/audit',
  testMatch: /wave-ap3-template-gallery\.spec\.ts/,
  fullyParallel: false,
  timeout: 180_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5055',
    browserName: 'chromium',
    ...devices['Desktop Chrome'],
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' },
  },
  webServer: {
    command: 'npx vite preview --port 5055 --strictPort',
    port: 5055,
    reuseExistingServer: true,
    timeout: 90_000,
  },
});
