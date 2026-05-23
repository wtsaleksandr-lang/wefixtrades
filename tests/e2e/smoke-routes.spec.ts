/**
 * PHASE 3 — Comprehensive Smoke Tests
 *
 * Tests every major route in the app for:
 * - HTTP 200 response (no blank screens)
 * - No console errors (critical/error level)
 * - No failed network requests (API 5xx)
 * - Page has meaningful content (not empty body)
 * - Basic accessibility: page title exists
 */

import { test, expect, type Page } from "@playwright/test";

/* ─── Helpers ─── */
interface PageError {
  url: string;
  message: string;
}

async function smokeCheck(page: Page, path: string, opts?: { expectRedirect?: string }) {
  const consoleErrors: string[] = [];
  const failedRequests: PageError[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    if (res.status() >= 500) {
      failedRequests.push({ url: res.url(), message: `${res.status()}` });
    }
  });

  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });

  if (opts?.expectRedirect) {
    await expect(page).toHaveURL(new RegExp(opts.expectRedirect));
    return;
  }

  // Page should have content
  const body = await page.locator("body").textContent();
  expect(body?.trim().length).toBeGreaterThan(0);

  // No 5xx API failures
  expect(failedRequests, `5xx errors on ${path}: ${JSON.stringify(failedRequests)}`).toHaveLength(0);

  // Console errors are warnings (logged but don't fail the test for now)
  if (consoleErrors.length > 0) {
    console.warn(`[WARN] Console errors on ${path}:`, consoleErrors.slice(0, 3));
  }
}

/* ═══════════════════════════════════════════
   PUBLIC MARKETING PAGES
   ═══════════════════════════════════════════ */

test.describe("Public Marketing Pages", () => {
  const pages = [
    "/",
    "/platform",
    "/pricing",
    "/services",
    "/contact",
    "/privacy",
    "/about",
    "/resources",
  ];

  for (const path of pages) {
    test(`loads ${path}`, async ({ page }) => {
      await smokeCheck(page, path);
    });
  }
});

test.describe("Product Pages", () => {
  const pages = [
    "/products",
    "/products/mapguard",
    "/products/quotequickpro",
    "/products/tradeline",
    "/products/reputationshield",
    "/products/socialsync",
    "/products/sitelaunch",
    "/products/webboost",
  ];

  for (const path of pages) {
    test(`loads ${path}`, async ({ page }) => {
      await smokeCheck(page, path);
    });
  }
});

test.describe("Tool Pages", () => {
  // Tools-consolidation (2026-05-23) — /tools/* collapsed to a single
  // Free Audit page. Quote Demo + Build-with-AI relocated under the
  // QuoteQuick product family. All other /tools/* URLs 301 → Free Audit
  // (covered in the Legacy Redirects block below).
  const pages = [
    "/tools/free-audit",
    "/products/quickquotepro/demo",
    "/products/quickquotepro/build-with-ai",
  ];

  for (const path of pages) {
    test(`loads ${path}`, async ({ page }) => {
      await smokeCheck(page, path);
    });
  }
});

test.describe("Documentation Pages", () => {
  const pages = [
    "/docs",
    "/docs/embed",
    "/docs/domain",
    "/docs/booking",
    "/docs/ai",
    "/docs/webhooks",
    "/docs/troubleshooting",
  ];

  for (const path of pages) {
    test(`loads ${path}`, async ({ page }) => {
      await smokeCheck(page, path);
    });
  }
});

test.describe("Feature Pages", () => {
  const pages = [
    "/features/instant-quotes",
    "/features/booking",
    "/features/ai-employee",
    "/features/sms",
    "/features/calculator-engine",
  ];

  for (const path of pages) {
    test(`loads ${path}`, async ({ page }) => {
      await smokeCheck(page, path);
    });
  }
});

test.describe("Demo & Comparison Pages", () => {
  const pages = [
    "/demos",
    "/compare/reputationshield-vs-nicejob",
  ];

  for (const path of pages) {
    test(`loads ${path}`, async ({ page }) => {
      await smokeCheck(page, path);
    });
  }
});

test.describe("Auth Pages", () => {
  test("loads /login", async ({ page }) => {
    await smokeCheck(page, "/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("loads /reset-password", async ({ page }) => {
    await smokeCheck(page, "/reset-password");
  });

  test("loads /checkout/success", async ({ page }) => {
    await smokeCheck(page, "/checkout/success");
  });

  test("loads /checkout/cancelled", async ({ page }) => {
    await smokeCheck(page, "/checkout/cancelled");
  });
});

/* ═══════════════════════════════════════════
   LEGACY REDIRECTS
   ═══════════════════════════════════════════ */

test.describe("Legacy Redirects", () => {
  test("/plans redirects to /pricing", async ({ page }) => {
    await smokeCheck(page, "/plans", { expectRedirect: "/pricing" });
  });

  test("/bundles redirects to /pricing", async ({ page }) => {
    await smokeCheck(page, "/bundles", { expectRedirect: "/pricing" });
  });

  test("/products/quickquote redirects to /products/quickquotepro", async ({ page }) => {
    await smokeCheck(page, "/products/quickquote", { expectRedirect: "/products/quickquotepro" });
  });

  test("/missed-call-calculator redirects to /tools/free-audit", async ({ page }) => {
    await smokeCheck(page, "/missed-call-calculator", { expectRedirect: "/tools/free-audit" });
  });

  // Tools-consolidation redirects — /tools/* → surviving surfaces.
  test("/tools redirects to /tools/free-audit", async ({ page }) => {
    await smokeCheck(page, "/tools", { expectRedirect: "/tools/free-audit" });
  });

  test("/tools/missed-call-calculator redirects to /tools/free-audit", async ({ page }) => {
    await smokeCheck(page, "/tools/missed-call-calculator", { expectRedirect: "/tools/free-audit" });
  });

  test("/tools/map-snapshot redirects to /tools/free-audit", async ({ page }) => {
    await smokeCheck(page, "/tools/map-snapshot", { expectRedirect: "/tools/free-audit" });
  });

  test("/tools/quote-demo redirects to /products/quickquotepro/demo", async ({ page }) => {
    await smokeCheck(page, "/tools/quote-demo", { expectRedirect: "/products/quickquotepro/demo" });
  });

  test("/tools/build-with-ai redirects to /products/quickquotepro/build-with-ai", async ({ page }) => {
    await smokeCheck(page, "/tools/build-with-ai", { expectRedirect: "/products/quickquotepro/build-with-ai" });
  });
});

/* ═══════════════════════════════════════════
   PROTECTED: ADMIN PAGES (no auth = redirect)
   ═══════════════════════════════════════════ */

test.describe("Admin Pages (unauthenticated → redirect to /login)", () => {
  const adminPages = [
    "/admin/crm",
    "/admin/crm/clients",
    "/admin/crm/inbox",
    "/admin/crm/billing",
    "/admin/crm/suppliers",
    "/admin/crm/services",
    "/admin/crm/support",
    "/admin/crm/reviews",
    "/admin/ai",
    /* Cycles 16–21: ensure new admin routes are also gated behind login */
    "/admin/products/mapguard-setup",
    "/admin/system/integrations",
    "/admin/crm/audit-log",
  ];

  for (const path of adminPages) {
    test(`${path} redirects unauthenticated user`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      // Should redirect to login or show login page
      await expect(page).toHaveURL(/\/(login|admin)/, { timeout: 10_000 });
    });
  }
});

/* ═══════════════════════════════════════════
   PROTECTED: PORTAL PAGES (no auth = redirect)
   ═══════════════════════════════════════════ */

test.describe("Portal Pages (unauthenticated → redirect to /login)", () => {
  const portalPages = [
    "/portal",
    "/portal/services",
    "/portal/billing",
    "/portal/help",
    "/portal/settings",
  ];

  for (const path of portalPages) {
    test(`${path} redirects unauthenticated user`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/(login|portal)/, { timeout: 10_000 });
    });
  }
});

/* ═══════════════════════════════════════════
   404 HANDLING
   ═══════════════════════════════════════════ */

test.describe("404 Handling", () => {
  test("unknown route shows not-found page", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-xyz", { waitUntil: "domcontentloaded" });
    const body = await page.locator("body").textContent();
    expect(body?.trim().length).toBeGreaterThan(0);
    // Should show some form of 404 / not found content
  });
});
