/**
 * Global setup for Admin CRM Playwright tests.
 *
 * Runs once before all tests to:
 * 1. Seed the admin user (if not already present)
 * 2. Seed the service catalog (if not already present)
 * 3. Login as admin and save storageState for reuse
 */

import { chromium, type FullConfig } from "@playwright/test";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@wefixtrades.com";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "TestAdmin123!";

export const STORAGE_STATE_PATH = path.join(
  __dirname,
  ".auth",
  "admin-session.json"
);

async function globalSetup(_config: FullConfig) {
  /* ── 0. Clean up stale test data from previous runs ── */
  const root = path.resolve(__dirname, "../../..");
  try {
    execSync("npx tsx tests/e2e/admin-crm/cleanup-test-data.ts", {
      cwd: root,
      stdio: "pipe",
      timeout: 15_000,
    });
  } catch (e: any) {
    console.warn("[global-setup] cleanup warning:", e.stderr?.toString().trim() || e.message);
  }

  /* ── 1. Seed admin user + service catalog ── */
  try {
    execSync(
      `npx tsx server/scripts/seed-admin.ts "${ADMIN_EMAIL}" "${ADMIN_PASSWORD}" "PW Admin"`,
      { cwd: root, stdio: "pipe", timeout: 30_000 }
    );
  } catch (e: any) {
    console.warn("[global-setup] seed-admin warning:", e.stderr?.toString().trim() || e.message);
  }

  try {
    execSync("npx tsx server/scripts/seed-services.ts", {
      cwd: root,
      stdio: "pipe",
      timeout: 30_000,
    });
  } catch (e: any) {
    console.warn("[global-setup] seed-services warning:", e.stderr?.toString().trim() || e.message);
  }

  /* ── 2. Login via browser and persist session ── */
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/admin/crm**", { timeout: 20_000 });

  // Save authenticated session
  await context.storageState({ path: STORAGE_STATE_PATH });

  await browser.close();
}

export default globalSetup;
