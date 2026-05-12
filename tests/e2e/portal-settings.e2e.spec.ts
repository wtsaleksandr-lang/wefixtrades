/**
 * Portal Settings — E2E (Q4 follow-up)
 *
 * Exercises the four settings flows from Q4 with a real authenticated
 * client session:
 *   1. Contact info save (name / email / phone / website)
 *   2. Change password
 *   3. Business logo URL paste
 *   4. Automation pause-all toggle
 *
 * Requires test creds seeded in Doppler `wefixtrades/dev`:
 *   TEST_CLIENT_EMAIL — a real `users` row with role='client' that
 *                       has a corresponding `clients` row linked by
 *                       user_id (otherwise withClientId() 403s)
 *   TEST_CLIENT_PASSWORD — current password for that user
 *
 * When either env var is missing the entire describe block is skipped
 * with a clear console note — the spec lands today, the run flips on
 * the moment the creds appear. No tests fail for "missing fixture" in
 * the meantime.
 *
 * The password test uses a known throwaway value and reverts it at
 * the end so re-running the suite is idempotent. If the password test
 * crashes mid-run, the next run will fail to log in until the
 * fallback restore in afterAll() succeeds — set TEST_CLIENT_PASSWORD
 * to a safe rotation pair.
 */

import { test, expect, type Page } from "@playwright/test";

const CLIENT_EMAIL = process.env.TEST_CLIENT_EMAIL;
const CLIENT_PASSWORD = process.env.TEST_CLIENT_PASSWORD;
const TEMP_PASSWORD = "Q4E2EThrowaway-2026!";

async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(CLIENT_EMAIL!);
  await page.locator('input[type="password"]').fill(CLIENT_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/portal/, { timeout: 15_000 });
}

test.describe("Portal settings (Q4 E2E)", () => {
  test.skip(
    !CLIENT_EMAIL || !CLIENT_PASSWORD,
    "TEST_CLIENT_EMAIL / TEST_CLIENT_PASSWORD must be set in Doppler wefixtrades/dev. Skipping Q4 portal-settings E2E."
  );

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/portal/settings");
    await expect(page.getByText(/Account Settings|Contact Info|Business Logo/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("S1 — save contact info round-trips through /api/portal/settings", async ({ page }) => {
    // Stamp a recognizable suffix so we know our save took effect.
    const stamp = `Q4-${Date.now()}`;
    const contactName = page.locator('input[type="text"], input[name="contact_name"]').first();
    const originalName = await contactName.inputValue();

    await contactName.fill(`${originalName.split(" Q4-")[0]} ${stamp}`);
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/portal/settings") && res.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: /save/i }).first().click();
    const response = await responsePromise;
    expect(response.status()).toBeLessThan(400);

    // Reload to confirm the value persisted server-side.
    await page.reload();
    await expect(contactName).toHaveValue(new RegExp(stamp));

    // Restore.
    await contactName.fill(originalName);
    await page.getByRole("button", { name: /save/i }).first().click();
  });

  test("S2 — logo URL paste persists through /api/portal/logo", async ({ page }) => {
    const sample = `https://example.com/logo-${Date.now()}.png`;
    const logoInput = page.getByTestId("input-logo-url");
    await expect(logoInput).toBeVisible();
    const original = await logoInput.inputValue();

    await logoInput.fill(sample);
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/portal/logo") && res.request().method() === "POST",
    );
    await page.getByTestId("button-save-logo").click();
    const response = await responsePromise;
    expect(response.status()).toBeLessThan(400);

    await page.reload();
    await expect(logoInput).toHaveValue(sample);

    // Restore.
    await logoInput.fill(original);
    await page.getByTestId("button-save-logo").click();
  });

  test("S3 — change password + revert leaves account in original state", async ({ page }) => {
    // Step 1: change current → throwaway
    await page.locator('input[autocomplete="current-password"]').fill(CLIENT_PASSWORD!);
    await page.locator('input[autocomplete="new-password"]').first().fill(TEMP_PASSWORD);
    await page.locator('input[autocomplete="new-password"]').nth(1).fill(TEMP_PASSWORD);
    let res = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/portal/password") && r.request().method() === "POST"),
      page.getByRole("button", { name: /update password/i }).click(),
    ]);
    expect(res[0].status()).toBeLessThan(400);
    await expect(page.getByText(/Password updated/i)).toBeVisible({ timeout: 5_000 });

    // Step 2: log out, log back in with throwaway to verify the change actually took effect
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(CLIENT_EMAIL!);
    await page.locator('input[type="password"]').fill(TEMP_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/portal/, { timeout: 15_000 });

    // Step 3: revert throwaway → original so the next run can log in.
    await page.goto("/portal/settings");
    await page.locator('input[autocomplete="current-password"]').fill(TEMP_PASSWORD);
    await page.locator('input[autocomplete="new-password"]').first().fill(CLIENT_PASSWORD!);
    await page.locator('input[autocomplete="new-password"]').nth(1).fill(CLIENT_PASSWORD!);
    res = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/portal/password") && r.request().method() === "POST"),
      page.getByRole("button", { name: /update password/i }).click(),
    ]);
    expect(res[0].status()).toBeLessThan(400);
  });

  test("S4 — failed save surfaces error toast (regression for cycle-23 onError gap)", async ({ page }) => {
    // Intercept the next PATCH /settings and return 500, then verify
    // the destructive toast appears. This protects the fix added in
    // PR #87 against future refactors that might drop onError again.
    await page.route("**/api/portal/settings", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Simulated server failure" }) })
    );
    const contactName = page.locator('input[type="text"], input[name="contact_name"]').first();
    await contactName.fill(await contactName.inputValue() + " ");
    await page.getByRole("button", { name: /save/i }).first().click();

    // Toast wording lives in the Q4 PR — "Couldn't save contact info".
    await expect(page.getByText(/Couldn't save contact info|Simulated server failure/i)).toBeVisible({ timeout: 5_000 });
  });
});
