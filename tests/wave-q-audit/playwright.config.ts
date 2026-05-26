/**
 * Wave Q — Final visual audit Playwright config.
 *
 * Targets the LOCAL dev server. Port 5000 is squatted by an unrelated
 * project on this host, so Wave Q uses port 5555 (caller starts the
 * server externally; we never auto-start to avoid colliding with the
 * hobby project on 5000).
 */
import { defineConfig, devices } from '@playwright/test';

const BASE = process.env.WAVE_Q_BASE_URL || 'http://127.0.0.1:5555';

export default defineConfig({
  testDir: '.',
  testMatch: process.env.WAVE_Q_TEST || '**/audit.spec.ts',
  timeout: 1_800_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list']],
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: BASE,
    headless: true,
    screenshot: 'on',
    trace: 'off',
    actionTimeout: 8_000,
    navigationTimeout: 30_000,
    ...devices['Desktop Chrome'],
  },
});
