import { defineConfig, devices } from '@playwright/test';

/**
 * W-AS-1b — temporary audit config that targets an already-running vite
 * preview on port 5055. Mirrors audit.ap3.config.ts (avoids the DelayPredict
 * squat that holds :5000 on this dev host).
 *
 * Boot the preview yourself first (`npx vite build` then
 * `npx vite preview --port 5055 --strictPort`) or let the webServer block
 * here spawn it.
 *
 * Run:
 *   npx playwright test tests/audit/wave-as1b-template-identity.spec.ts \
 *     --config audit.as1b.config.ts --reporter=line
 */
export default defineConfig({
  testDir: './tests/audit',
  testMatch: /wave-as1b-template-identity\.spec\.ts/,
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
