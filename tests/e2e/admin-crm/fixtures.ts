/**
 * Shared Playwright fixtures for Admin CRM tests.
 *
 * Provides:
 * - `adminPage`: a Page already logged in as an admin user
 * - `apiContext`: an APIRequestContext with admin session cookies
 * - helper functions for creating test data via API
 */

import { test as base, expect, type Page, type APIRequestContext } from "@playwright/test";

/* ─── Configuration ─── */

/** Admin credentials — must match a seeded admin user in the test DB */
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@wefixtrades.com";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "TestAdmin123!";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

/* ─── Unique suffix for test isolation ─── */
export function testId() {
  return `pw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/* ─── Login helper ─── */
async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("textbox", { name: /email/i }).fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Wait for redirect to admin CRM
  await page.waitForURL("**/admin/crm**", { timeout: 15000 });
}

/* ─── Extended test fixture ─── */

type AdminFixtures = {
  adminPage: Page;
  apiContext: APIRequestContext;
};

export const test = base.extend<AdminFixtures>({
  adminPage: async ({ page }, use) => {
    await loginAsAdmin(page);
    await use(page);
  },

  apiContext: async ({ playwright }, use) => {
    // Create a request context with admin session
    const ctx = await playwright.request.newContext({
      baseURL: BASE_URL,
    });

    // Login via API to get session cookie
    const loginRes = await ctx.post("/api/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();

    await use(ctx);
    await ctx.dispose();
  },
});

export { expect };

/* ─── API helpers for test data setup ─── */

export async function createTestClient(
  apiContext: APIRequestContext,
  overrides: Record<string, unknown> = {}
) {
  const id = testId();
  const res = await apiContext.post("/api/admin/crm/clients", {
    data: {
      business_name: `Test Plumbing ${id}`,
      contact_name: "PW Test Contact",
      contact_email: `test-${id}@example.com`,
      contact_phone: "416-555-0100",
      trade_type: "plumber",
      status: "lead",
      source: "manual",
      ...overrides,
    },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function provisionService(
  apiContext: APIRequestContext,
  clientId: number,
  serviceId: string = "mapguard-setup"
) {
  const res = await apiContext.post(`/api/admin/crm/clients/${clientId}/provision`, {
    data: { service_id: serviceId },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function listFulfillmentTasks(
  apiContext: APIRequestContext,
  clientId: number
) {
  const res = await apiContext.get(`/api/admin/crm/clients/${clientId}/fulfillment`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function listClientPayments(
  apiContext: APIRequestContext,
  clientId: number
) {
  const res = await apiContext.get(`/api/admin/crm/clients/${clientId}/payments`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function updateTaskStatus(
  apiContext: APIRequestContext,
  taskId: number,
  status: string
) {
  const res = await apiContext.patch(`/api/admin/crm/fulfillment/${taskId}`, {
    data: { status },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function updatePaymentStatus(
  apiContext: APIRequestContext,
  paymentId: number,
  status: string
) {
  const res = await apiContext.patch(`/api/admin/crm/payments/${paymentId}`, {
    data: { status },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function generateMonthlyTasks(
  apiContext: APIRequestContext,
  clientServiceId: number,
  month?: string
) {
  const res = await apiContext.post(
    `/api/admin/crm/client-services/${clientServiceId}/generate-tasks`,
    { data: { month } }
  );
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function getServiceCatalog(apiContext: APIRequestContext) {
  const res = await apiContext.get("/api/admin/crm/services");
  expect(res.ok()).toBeTruthy();
  return res.json();
}
