import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'child_process';

/**
 * Audit config — accessibility (axe-core) + visual-regression checks.
 *
 * Runs against the built client served by `vite preview`, so it needs no
 * database, server or secrets. Used by `npm run audit` and the Audit CI
 * workflow. The product test suite keeps using playwright.config.ts.
 */
function findChromium(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  try {
    const p = execSync(
      'which chromium 2>/dev/null || which chromium-browser 2>/dev/null',
      { encoding: 'utf-8' },
    ).trim();
    if (p) return p;
  } catch {}
  return undefined; // fall back to Playwright's bundled browser (works in CI)
}
const chromiumPath = findChromium();

export default defineConfig({
  testDir: './tests/audit',
  fullyParallel: false,
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'audit-report' }]],
  use: {
    baseURL: 'http://localhost:5000',
    browserName: 'chromium',
    ...devices['Desktop Chrome'],
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
  /* Visual-regression tolerance — small anti-aliasing noise is ignored. */
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' },
  },
  /*
   * Serve the static client build. `reuseExistingServer` means a dev server
   * already on :5000 (e.g. on Replit) is used as-is.
   */
  webServer: {
    command: 'npx vite preview --port 5000 --strictPort',
    port: 5000,
    reuseExistingServer: true,
    timeout: 90_000,
  },
});
