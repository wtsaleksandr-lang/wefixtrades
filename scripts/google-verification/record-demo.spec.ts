/**
 * Google OAuth verification — demo video recording script.
 *
 * Records a single .webm/.mp4 demonstrating the full WeFixTrades
 * MapGuard OAuth flow end-to-end. Google's verification reviewers
 * require this video as part of approval for the
 *   https://www.googleapis.com/auth/business.manage
 * scope. The video must show:
 *
 *   1. The application's homepage + a description of what it does.
 *   2. The user landing on the consent flow surface inside the app.
 *   3. The Google OAuth consent screen with the app name + scopes
 *      visible AND the URL bar showing the correct client_id.
 *   4. The post-consent experience demonstrating how the scope is
 *      actually used (posting to GBP, viewing posts in admin).
 *
 * Why this is a Playwright test and not a pure script:
 *   Playwright's `recordVideo` only works inside a BrowserContext
 *   created via the test fixture or `browser.newContext()`. Wiring
 *   this as a @playwright/test spec gives us free video output,
 *   trace files, and reuse of the project's existing config.
 *
 * Hand-off pattern (semi-automated):
 *   The script auto-drives the WeFixTrades parts. When it reaches
 *   accounts.google.com, it calls `page.pause()` to give the human
 *   operator (Alex) browser control to log in to the demo Google
 *   account. Recording continues during the manual section. The
 *   script resumes automatically when Alex closes the inspector and
 *   completes the consent.
 *
 * Run with:
 *   npm run record:google-verification
 *
 * Output:
 *   test-results/.../video.webm — convert to .mp4 with ffmpeg if
 *   YouTube prefers (it accepts webm but mp4 is more reliable).
 *
 * Pre-requisites:
 *   1. A demo Google account that:
 *      - Owns at least one Google Business Profile (so reviewers see
 *        a realistic flow, not a "no businesses found" error).
 *      - Is NOT a personal email you mind showing on screen briefly.
 *   2. A WeFixTrades portal account on prod with an active MapGuard
 *      subscription. Set creds via env vars below.
 *   3. The OAuth client's authorized redirect URI includes the prod
 *      callback (already true if MapGuard is shipping).
 *
 * Env vars:
 *   DEMO_APP_URL                 — defaults to https://wefixtrades.com
 *   DEMO_PORTAL_EMAIL            — login email for the portal account
 *   DEMO_PORTAL_PASSWORD         — password for that account
 *
 * NOTE: do not commit credentials. Set them in your shell before
 * running, e.g.:
 *   DEMO_PORTAL_EMAIL=test@demo.com DEMO_PORTAL_PASSWORD=... \
 *     npm run record:google-verification
 */
import { test, expect } from "@playwright/test";

const APP_URL = process.env.DEMO_APP_URL || "https://wefixtrades.com";
const PORTAL_EMAIL = process.env.DEMO_PORTAL_EMAIL || "";
const PORTAL_PASSWORD = process.env.DEMO_PORTAL_PASSWORD || "";

// Use a longer per-step timeout — reviewers need time to read the
// screen, and the manual Google-login pause section can take a
// minute or two for the operator to complete.
test.setTimeout(15 * 60 * 1000);

test("Google verification — MapGuard OAuth demo recording", async ({ page, context }, testInfo) => {
  test.skip(!PORTAL_EMAIL || !PORTAL_PASSWORD,
    "Set DEMO_PORTAL_EMAIL and DEMO_PORTAL_PASSWORD before running.");

  console.log("\n=== Google verification demo recording ===");
  console.log(`App: ${APP_URL}`);
  console.log(`Recording to: ${testInfo.outputDir}`);
  console.log("Stay watching — the script will pause for you to log in to Google.\n");

  /* ─── 1. Homepage — establishes the brand ─── */
  await page.goto(APP_URL);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(4000); // let reviewer see the brand

  /* ─── 2. MapGuard product page — explains what the app does ─── */
  await page.goto(`${APP_URL}/products/mapguard`);
  await page.waitForLoadState("networkidle");
  // Scroll slowly to surface the "What we do" + "How it works" sections.
  await scrollSlowly(page);
  await page.waitForTimeout(3000);

  /* ─── 3. Help docs — shows the documented scope usage ─── */
  await page.goto(`${APP_URL}/docs/mapguard`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  // Scroll to "What we actually do each week" — this is where
  // we describe Google Business posts + review responses.
  await page.locator("text=What we actually do each week").scrollIntoViewIfNeeded();
  await page.waitForTimeout(5000);

  /* ─── 4. Privacy policy — required by Google ─── */
  await page.goto(`${APP_URL}/privacy`);
  await page.waitForLoadState("networkidle");
  await page.locator("text=Google API Services").scrollIntoViewIfNeeded();
  await page.waitForTimeout(5000); // Limited Use disclosure must be readable

  /* ─── 5. Log in to the WeFixTrades portal ─── */
  await page.goto(`${APP_URL}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', PORTAL_EMAIL);
  await page.fill('input[type="password"]', PORTAL_PASSWORD);
  await page.click('button[type="submit"]');
  // Wait for redirect into the portal.
  await page.waitForURL(/\/portal/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");

  /* ─── 6. Open MapGuard portal — shows the Connect surface ─── */
  await page.goto(`${APP_URL}/portal/mapguard`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);

  // Make the connect banner the focal point.
  const banner = page.locator("text=Connect your Google Business Profile").first();
  await expect(banner).toBeVisible({ timeout: 10_000 });
  await banner.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000);

  // Show the consent text being read.
  await page.locator("text=I authorise WeFixTrades to act as a Manager").scrollIntoViewIfNeeded();
  await page.waitForTimeout(5000);

  /* ─── 7. Check consent and click Connect ─── */
  const consentBox = page.locator('input[type="checkbox"]').filter({
    has: page.locator("xpath=ancestor::label[contains(., 'authorise WeFixTrades')]"),
  }).first();
  // Fallback locator if structural lookup fails (component may be wrapped).
  const fallbackBox = page.locator('input[type="checkbox"]').first();
  const cb = (await consentBox.count()) > 0 ? consentBox : fallbackBox;
  await cb.check();
  await page.waitForTimeout(2000);

  await page.click("text=Connect Google Business");
  // Wait for the redirect to Google's consent host.
  await page.waitForURL(/accounts\.google\.com/, { timeout: 30_000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000); // let the URL bar settle so reviewers can read client_id

  /* ─── 8. MANUAL PAUSE — operator drives Google login ───
   *
   * Recording continues during the pause. The operator should:
   *   a. Sign in with the demo Google account.
   *   b. On the consent screen: pause for 4–5 seconds with the
   *      scopes visible, then click "Allow / Continue".
   *   c. Wait for the redirect back to /portal/mapguard.
   *   d. Close the Playwright Inspector to resume the script.
   */
  console.log("\n=== MANUAL STEP ===");
  console.log("Log in to your demo Google account, then click Allow on the consent screen.");
  console.log("Wait for the page to redirect back to /portal/mapguard.");
  console.log("Then close the Playwright Inspector window to resume.\n");
  await page.pause();

  /* ─── 9. Resume — back on portal, GBP now connected ─── */
  // Be tolerant: the inspector may have been closed before the
  // redirect fully completed. Wait for either the connected state
  // or a longer timeout.
  await page.waitForURL(/\/portal\/mapguard/, { timeout: 120_000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(4000);

  /* ─── 10. Demonstrate scope usage — admin dashboard ─── */
  // Log out of customer and into an admin account is overkill for
  // the demo video. Instead, visit any page that demonstrates the
  // scope's user-visible effect — the portal will already show the
  // "connected" state and (over time) the post calendar.
  await page.goto(`${APP_URL}/portal/mapguard`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(6000); // let reviewer absorb the connected dashboard

  console.log("\n=== Recording complete ===");
  console.log(`Video saved under: ${testInfo.outputDir}`);
  console.log("Convert to .mp4 (optional but YouTube-friendly):");
  console.log("  ffmpeg -i <video.webm> -c:v libx264 -preset slow -crf 22 demo.mp4");
  console.log("Then upload as Unlisted to YouTube and paste the URL in the verification form.\n");
});

/** Smooth-scrolls a page to the bottom over ~8 seconds so reviewers
 * can read sections without abrupt jumps that hurt video clarity. */
async function scrollSlowly(page: any) {
  await page.evaluate(async () => {
    const totalScroll = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const steps = 40;
    const step = totalScroll / steps;
    for (let i = 0; i < steps; i++) {
      window.scrollBy(0, step);
      await new Promise((r) => setTimeout(r, 200));
    }
    window.scrollTo(0, 0);
  });
}
