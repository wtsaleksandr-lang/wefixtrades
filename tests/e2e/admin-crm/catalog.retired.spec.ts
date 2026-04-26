/**
 * Stripe catalog cleanup — Phase 2 verification.
 *
 * Confirms that the six soft-retired service_catalog rows are blocked from
 * public checkout but still visible to admins, and that the public marketing
 * surface still loads. Reads only — does NOT mutate the DB or Stripe.
 *
 * Retire list (matches server/scripts/retire-duplicate-services.sql):
 *   quotequick, socialsync, mapguard-ongoing, reputationshield,
 *   tradeline, tradeline-complete
 *
 * Run:
 *   npx playwright test --project=admin-crm tests/e2e/admin-crm/catalog.retired.spec.ts
 */

import { test, expect } from "./fixtures";

const RETIRED_IDS = [
  "quotequick",
  "socialsync",
  "mapguard-ongoing",
  "reputationshield",
  "tradeline",
  "tradeline-complete",
] as const;

const ACTIVE_TIER_ID = "tradeline-starter";

const VALID_INTAKE = {
  business_name: "Catalog Retire PW Test",
  contact_name: "PW Tester",
  contact_email: `catalog-retire-${Date.now()}@example.com`,
  contact_phone: "416-555-0199",
};

test.describe("Stripe catalog Phase 2 — soft-retire verification", () => {
  test("R-1 — public checkout rejects each retired product with 'not available'", async ({ playwright }) => {
    const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
    const anon = await playwright.request.newContext({ baseURL: BASE_URL });

    for (const id of RETIRED_IDS) {
      const res = await anon.post("/api/public/checkout", {
        data: { ...VALID_INTAKE, items: [id] },
      });
      expect(res.status(), `expected 400 for retired id "${id}"`).toBe(400);
      const body = await res.json();
      expect(
        String(body?.error || "").toLowerCase(),
        `expected "not available" error for retired id "${id}", got: ${JSON.stringify(body)}`
      ).toContain("not available");
    }

    await anon.dispose();
  });

  test("R-2 — public checkout still accepts an active tier product (is_active gate passes)", async ({ playwright }) => {
    const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
    const anon = await playwright.request.newContext({ baseURL: BASE_URL });

    const res = await anon.post("/api/public/checkout", {
      data: { ...VALID_INTAKE, items: [ACTIVE_TIER_ID] },
    });

    // Either checkout proceeds (200 with checkout_url) or fails for some other
    // reason (e.g. Stripe sandbox quirk). What MUST NOT happen is the is_active
    // gate rejecting it with "not available" — that would mean the soft-retire
    // SQL hit an active tier by mistake.
    if (res.status() === 400) {
      const body = await res.json();
      expect(
        String(body?.error || "").toLowerCase(),
        `active tier "${ACTIVE_TIER_ID}" must NOT be blocked by is_active gate; got: ${JSON.stringify(body)}`
      ).not.toContain("not available");
    } else {
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("checkout_url");
    }

    await anon.dispose();
  });

  test("R-3 — admin /api/admin/crm/services still lists all six retired IDs as is_active=false", async ({ apiContext }) => {
    const res = await apiContext.get("/api/admin/crm/services");
    expect(res.ok()).toBeTruthy();
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);

    for (const id of RETIRED_IDS) {
      const row = rows.find((r: any) => r.id === id);
      expect(row, `admin catalog should still expose retired id "${id}"`).toBeTruthy();
      expect(row.is_active, `retired id "${id}" must be is_active=false`).toBe(false);
    }

    // Sanity: an active tier ladder member is still active
    const active = rows.find((r: any) => r.id === ACTIVE_TIER_ID);
    expect(active, `active tier "${ACTIVE_TIER_ID}" should still appear in admin catalog`).toBeTruthy();
    expect(active.is_active).toBe(true);
  });

  test("R-4 — public marketing pages still load (no static-config regression)", async ({ playwright }) => {
    const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
    const anon = await playwright.request.newContext({ baseURL: BASE_URL });

    // /pricing — static React shell; expect 200 and a non-empty HTML body.
    const pricing = await anon.get("/pricing");
    expect(pricing.status(), "/pricing must return 200").toBe(200);
    const pricingHtml = await pricing.text();
    expect(pricingHtml.length).toBeGreaterThan(500);

    // /products/quotequick — slug page; the parent wrapper is still a marketing
    // page even though the bare 'quotequick' DB row is now is_active=false. The
    // page itself must still render (it doesn't post to the retired DB row).
    const quotequick = await anon.get("/products/quotequick");
    expect(quotequick.status(), "/products/quotequick must return 200").toBe(200);

    // /products/tradeline — same, still a marketing page for the tier ladder.
    const tradeline = await anon.get("/products/tradeline");
    expect(tradeline.status(), "/products/tradeline must return 200").toBe(200);

    await anon.dispose();
  });
});
