/**
 * Admin CRM — Smoke Tests (Tier 1)
 *
 * Fast confidence checks: login, routing, sidebar nav, route protection, logout.
 */

import { test, expect } from "./fixtures";
import { test as baseTest, expect as baseExpect } from "@playwright/test";

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@wefixtrades.com";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "TestAdmin123!";

/* ═══════════════════════════════════════════
   S1 — Login + CRM overview landing
   (merged former S1 + S2)
   ═══════════════════════════════════════════ */

baseTest.describe("Smoke: Auth", () => {
  baseTest("S1 — login with valid admin credentials and land on CRM overview", async ({ page }) => {
    await page.goto("/login");

    await baseExpect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();

    await page.getByRole("textbox", { name: /email/i }).fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should redirect to admin CRM overview
    await page.waitForURL("**/admin/crm**", { timeout: 15000 });
    await baseExpect(page).toHaveURL(/\/admin\/crm/);

    // Overview page content should be visible (proves the page actually rendered)
    const overviewContent = page.getByText("Total Clients")
      .or(page.getByText("Active Services"))
      .or(page.getByText("Overview"));
    await baseExpect(overviewContent).toBeVisible({ timeout: 10000 });
  });

  baseTest("S4 — unauthenticated user is redirected to /login", async ({ page }) => {
    await page.goto("/admin/crm/clients");

    await page.waitForURL("**/login**", { timeout: 10000 });
    await baseExpect(page).toHaveURL(/\/login/);
  });

  baseTest("S5 — login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill("WrongPassword999!");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Error message must appear — no silent pass
    const errorMsg = page.getByText(/login failed/i).or(page.getByText(/invalid/i));
    await baseExpect(errorMsg).toBeVisible({ timeout: 5000 });
    await baseExpect(page).toHaveURL(/\/login/);
  });
});

/* ═══════════════════════════════════════════
   Sidebar navigation + logout (requires auth)
   ═══════════════════════════════════════════ */

test.describe("Smoke: Navigation", () => {
  test("S3 — sidebar links navigate to correct pages", async ({ adminPage }) => {
    await adminPage.goto("/admin/crm");

    // Wait for sidebar nav to be present
    const nav = adminPage.locator("nav");
    await expect(nav).toBeVisible({ timeout: 10000 });

    const navChecks = [
      { label: "Clients", url: /\/admin\/crm\/clients/ },
      { label: "Inbox", url: /\/admin\/crm\/inbox/ },
      { label: "Billing", url: /\/admin\/crm\/billing/ },
      { label: "Services", url: /\/admin\/crm\/services/ },
    ];

    for (const { label, url } of navChecks) {
      const link = nav.getByText(label, { exact: true });
      // Every sidebar link MUST be visible — no silent skip
      await expect(link).toBeVisible({ timeout: 5000 });
      await link.click();
      await adminPage.waitForURL(url, { timeout: 10000 });
      await expect(adminPage).toHaveURL(url);
    }
  });

  test("S6 — logout returns user to /login", async ({ adminPage }) => {
    await adminPage.goto("/admin/crm");

    // Wait for page to fully load
    const nav = adminPage.locator("nav");
    await expect(nav).toBeVisible({ timeout: 10000 });

    // Open the user/account dropdown — the avatar is the round button with initials
    // It's the last button in the header area with a green background circle
    const accountMenu = adminPage.locator(
      'button:has(> span.text-white), button:has(span[class*="rounded-full"])'
    ).last();
    await expect(accountMenu).toBeVisible({ timeout: 5000 });
    await accountMenu.click();

    // Click Log Out — must be visible, no fallback
    const logoutBtn = adminPage.getByRole("menuitem", { name: /log out/i })
      .or(adminPage.getByText(/log out/i));
    await expect(logoutBtn).toBeVisible({ timeout: 3000 });
    await logoutBtn.click();

    // Must redirect to /login
    await adminPage.waitForURL("**/login**", { timeout: 10000 });
    await expect(adminPage).toHaveURL(/\/login/);
  });
});
