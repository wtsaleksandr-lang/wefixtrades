/**
 * Dedicated Playwright config for the Google OAuth verification
 * demo recording. Separate from the project's main playwright.config.ts
 * because:
 *
 *   - Must run HEADED so reviewers see the URL bar (Google requires
 *     the client_id to be visible in the address bar of the consent
 *     screen).
 *   - Must record video continuously.
 *   - Per-test timeout is much longer (15 min) to accommodate the
 *     manual Google-login pause.
 *   - Disables retries — a re-run would produce two videos and
 *     confuse the operator.
 *
 * Run via the `npm run record:google-verification` script.
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /record-demo\.spec\.ts$/,
  timeout: 15 * 60 * 1000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    browserName: "chromium",
    headless: false,
    viewport: { width: 1280, height: 800 },
    // Record video for every test, full size — no scaling artefacts.
    video: {
      mode: "on",
      size: { width: 1280, height: 800 },
    },
    // Show the URL bar fullscreen so client_id is legible in the
    // consent-screen frames.
    launchOptions: {
      args: ["--start-maximized"],
    },
    // Slow each action down ~250ms so each click is visible to viewers
    // and Google's reviewers can follow along.
    actionTimeout: 30_000,
  },
  outputDir: "../../test-results/google-verification",
});
