import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'child_process';

// Auto-detect Nix-managed Chromium on Replit
function findChromium(): string | undefined {
  try {
    const path = execSync('which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (path) return path;
  } catch {}
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  return undefined;
}

const chromiumPath = findChromium();

export default defineConfig({
  testDir: './tests/e2e',

  /* Default timeout per test — audit generation can take 60-120s */
  timeout: 180_000,

  /* No retries by default — failures should be investigated */
  retries: 0,

  /* Reporter: stdout + HTML report for review */
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    browserName: 'chromium',
    headless: true,
    baseURL: 'http://localhost:5000',
    ...devices['Desktop Chrome'],

    /* Capture screenshots and traces on failure for debugging */
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',

    /* Replit: use nix-managed Chromium (system libs incompatible with PW bundled headless shell) */
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },

  /* Global setup for admin-crm: seeds admin user, services, and persists auth session */
  globalSetup: './tests/e2e/admin-crm/global-setup.ts',

  projects: [
    {
      name: 'chromium',
      testIgnore: '**/admin-crm/**',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'admin-crm',
      testDir: './tests/e2e/admin-crm',
      timeout: 60_000,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /*
   * Web server configuration.
   *
   * MODE 1 — Replit (recommended):
   *   Start the dev server from Replit Shell first (npm run dev),
   *   then run: npx playwright test
   *   The reuseExistingServer: true setting will use the running server.
   *
   * MODE 2 — Local / CI:
   *   Uncomment the webServer block below. Playwright will start the
   *   server automatically before running tests.
   *
   * Note: Replit injects secrets into processes started from its Shell.
   * Using webServer from Playwright may NOT have access to Replit Secrets.
   * Prefer MODE 1 when running on Replit.
   */
  webServer: {
    command: 'npm run dev',
    port: 5000,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
