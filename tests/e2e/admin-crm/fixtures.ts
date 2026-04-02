/**
 * Shared Playwright fixtures for Admin CRM tests.
 *
 * - `adminPage`: a Page with pre-authenticated storageState (no per-test login)
 * - `apiContext`: an APIRequestContext with admin session cookies
 * - Helper functions for deterministic test data setup via API
 */

import { test as base, expect, type Page, type APIRequestContext } from "@playwright/test";
import { STORAGE_STATE_PATH } from "./global-setup";

/* ─── Configuration ─── */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@wefixtrades.com";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "TestAdmin123!";
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

/* ─── Unique suffix for test isolation ─── */
export function testId() {
  return `pw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/* ─── Extended test fixture ─── */

type AdminFixtures = {
  adminPage: Page;
  apiContext: APIRequestContext;
};

export const test = base.extend<AdminFixtures>({
  // Reuse persisted auth — no per-test login
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  apiContext: async ({ playwright }, use) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE_URL });

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

export async function generateMonthlyTasks(
  apiContext: APIRequestContext,
  clientServiceId: number,
  month?: string
) {
  const res = await apiContext.post(
    `/api/admin/crm/client-services/${clientServiceId}/generate-tasks`,
    { data: { month } }
  );
  // May return 400 if no recurring templates — caller handles
  return { response: res, data: res.ok() ? await res.json() : null };
}

export async function getServiceCatalog(apiContext: APIRequestContext) {
  const res = await apiContext.get("/api/admin/crm/services");
  expect(res.ok()).toBeTruthy();
  return res.json();
}
