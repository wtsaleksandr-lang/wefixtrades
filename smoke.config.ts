/**
 * Deploy Safety Wave 2 — Playwright config for the critical-paths smoke
 * suite. Separate from playwright.config.ts so:
 *   - tests/smoke/* don't get picked up by the main e2e runner
 *   - no globalSetup (no admin seeding — smoke runs against prod)
 *   - no webServer block (we always target a remote URL via SMOKE_BASE_URL)
 *   - a shorter per-test timeout enforces the <10 s / test budget
 *
 * Usage:
 *   SMOKE_BASE_URL=https://wefixtrades.com npx playwright test --config=smoke.config.ts
 */

import { defineConfig, devices } from "@playwright/test";
import { execSync } from "node:child_process";

function findChromium(): string | undefined {
  try {
    const path = execSync(
      "which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null",
      { encoding: "utf-8" },
    ).trim();
    if (path) return path;
  } catch {}
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  return undefined;
}

const chromiumPath = findChromium();
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:5000";

export default defineConfig({
  testDir: "./tests/smoke",
  /* Each smoke check has its own <10s budget; cap the test at 12s. */
  timeout: 12_000,
  /* Total suite target <60s — run in parallel. */
  fullyParallel: true,
  /* One retry only — flaky prod blips shouldn't block a deploy verdict. */
  retries: 1,
  reporter: [["list"], ["json", { outputFile: "tests/smoke/results.json" }]],
  use: {
    baseURL: BASE,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
});
