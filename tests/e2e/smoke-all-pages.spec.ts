/**
 * Comprehensive Smoke Test Suite — Every Page
 *
 * Navigates to every known page in the app, collects ALL errors
 * (console errors, network failures, crashes, blank pages), and
 * produces a consolidated JSON + text report in test-results/.
 *
 * Groups:
 *   1. Public marketing pages (no auth)
 *   2. Admin dashboard pages (requires admin auth)
 *   3. Client portal pages (requires client auth — skipped gracefully if no client exists)
 *   4. Public tool pages (no auth)
 *
 * Run:
 *   npx playwright test smoke-all-pages.spec.ts --project=chromium
 */

import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/* ─── Types ─── */

interface PageDef {
  url: string;
  name: string;
}

interface PageError {
  page: string;
  url: string;
  type: "console_error" | "network_error" | "crash" | "blank_page" | "response_5xx";
  message: string;
  timestamp: string;
}

/* ─── Shared state for report ─── */

const allErrors: PageError[] = [];
let pagesVisited = 0;
let pagesWithErrors = 0;

/* ─── Config ─── */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@wefixtrades.com";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "TestAdmin123!";
const PAGE_TIMEOUT = 30_000;

/** Console-error substrings that are harmless noise — skip them. */
const IGNORED_CONSOLE_PATTERNS = [
  "favicon",
  "CORS",
  "world-atlas",
  "net::ERR_BLOCKED_BY_CLIENT", // ad-blockers
  "ResizeObserver loop", // benign Chrome warning
];

function isIgnoredConsoleError(text: string): boolean {
  return IGNORED_CONSOLE_PATTERNS.some((p) => text.includes(p));
}

/* ─── Admin auth cookie cache ─── */

let adminCookies: any[] = [];

async function ensureAdminLogin(page: Page): Promise<boolean> {
  if (adminCookies.length > 0) {
    await page.context().addCookies(adminCookies);
    return true;
  }
  try {
    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT });
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/admin\/crm/, { timeout: 15_000 });
    adminCookies = await page.context().cookies();
    return true;
  } catch {
    return false;
  }
}

/* ─── Core smoke-check helper ─── */

async function smokePage(
  page: Page,
  def: PageDef,
  opts?: { expectRedirect?: RegExp }
): Promise<PageError[]> {
  const errors: PageError[] = [];
  const now = () => new Date().toISOString();

  // Collect console errors
  const consoleHandler = (msg: import("@playwright/test").ConsoleMessage) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!isIgnoredConsoleError(text)) {
        errors.push({
          page: def.name,
          url: def.url,
          type: "console_error",
          message: text.substring(0, 300),
          timestamp: now(),
        });
      }
    }
  };
  page.on("console", consoleHandler);

  // Collect network failures
  const requestFailedHandler = (req: import("@playwright/test").Request) => {
    const failure = req.failure();
    errors.push({
      page: def.name,
      url: def.url,
      type: "network_error",
      message: `${req.method()} ${req.url()} — ${failure?.errorText || "unknown"}`,
      timestamp: now(),
    });
  };
  page.on("requestfailed", requestFailedHandler);

  // Collect 5xx responses
  const responseHandler = (res: import("@playwright/test").Response) => {
    if (res.status() >= 500) {
      errors.push({
        page: def.name,
        url: def.url,
        type: "response_5xx",
        message: `${res.status()} ${res.url()}`,
        timestamp: now(),
      });
    }
  };
  page.on("response", responseHandler);

  try {
    await page.goto(def.url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT });

    // If we expect a redirect, just verify it and return
    if (opts?.expectRedirect) {
      await expect(page).toHaveURL(opts.expectRedirect, { timeout: 10_000 });
      return errors;
    }

    // Give the page a moment to settle (lazy-loaded content, API calls)
    await page.waitForTimeout(2_000);

    // Check for crash indicators in the body text
    const bodyText = await page.locator("body").textContent().catch(() => "");
    if (bodyText) {
      const lower = bodyText.toLowerCase();
      if (
        lower.includes("internal server error") ||
        lower.includes("something went wrong") ||
        lower.includes("application error") ||
        lower.includes("cannot read properties of") ||
        lower.includes("unhandled runtime error")
      ) {
        errors.push({
          page: def.name,
          url: def.url,
          type: "crash",
          message: `Page shows error state: "${bodyText.substring(0, 200).trim()}"`,
          timestamp: now(),
        });
      }
    }

    // Check the page is not blank
    const innerHTML = await page.locator("body").innerHTML().catch(() => "");
    if (innerHTML.trim().length < 100) {
      errors.push({
        page: def.name,
        url: def.url,
        type: "blank_page",
        message: `Page body is only ${innerHTML.trim().length} chars`,
        timestamp: now(),
      });
    }
  } catch (err: any) {
    errors.push({
      page: def.name,
      url: def.url,
      type: "crash",
      message: `Navigation failed: ${err.message?.substring(0, 300) || String(err)}`,
      timestamp: now(),
    });
  } finally {
    page.removeListener("console", consoleHandler);
    page.removeListener("requestfailed", requestFailedHandler);
    page.removeListener("response", responseHandler);
  }

  // Take screenshot on any error
  if (errors.length > 0) {
    const screenshotDir = path.resolve("test-results", "smoke-screenshots");
    fs.mkdirSync(screenshotDir, { recursive: true });
    const safeName = def.name.replace(/[^a-zA-Z0-9_-]/g, "-");
    await page
      .screenshot({ path: path.join(screenshotDir, `${safeName}.png`), fullPage: false })
      .catch(() => {
        /* screenshot best-effort */
      });
  }

  return errors;
}

/* ═══════════════════════════════════════════
   PAGE DEFINITIONS
   ═══════════════════════════════════════════ */

const PUBLIC_PAGES: PageDef[] = [
  { url: "/", name: "Homepage" },
  { url: "/products", name: "Products Index" },
  { url: "/products/tradeline", name: "TradeLine Product" },
  { url: "/products/quickquotepro", name: "QuoteQuick Product" },
  { url: "/products/mapguard", name: "MapGuard Product" },
  { url: "/products/reputationshield", name: "ReputationShield Product" },
  { url: "/products/socialsync", name: "SocialSync Product" },
  { url: "/products/rankflow", name: "RankFlow Product" },
  { url: "/products/sitelaunch", name: "SiteLaunch Product" },
  { url: "/products/webcare", name: "WebCare Product" },
  { url: "/products/webfix", name: "WebFix Product" },
  { url: "/products/contentflow", name: "ContentFlow Product" },
  { url: "/products/adflow", name: "AdFlow Product" },
  { url: "/products/bookflow", name: "BookFlow Product" },
  { url: "/pricing", name: "Pricing Page" },
  { url: "/plans", name: "Plans Page" },
  { url: "/about", name: "About Page" },
  { url: "/blog", name: "Blog Page" },
  { url: "/case-studies", name: "Case Studies" },
  { url: "/contact", name: "Contact Page" },
  { url: "/privacy", name: "Privacy Policy" },
  { url: "/terms", name: "Terms of Service" },
  { url: "/resources", name: "Resources" },
  { url: "/login", name: "Login Page" },
  { url: "/signup", name: "Signup Page" },
  { url: "/tools/free-audit", name: "Free Audit Tool" },
  { url: "/tools/quote-demo", name: "Quote Demo" },
  { url: "/tools/missed-call-calculator", name: "Missed Call Calculator" },
  { url: "/demos", name: "Demo Center" },
  { url: "/demos/socialsync", name: "SocialSync Demo" },
  { url: "/demos/rankflow", name: "RankFlow Demo" },
  { url: "/demos/reputationshield", name: "ReputationShield Demo" },
  { url: "/compare/tradeline", name: "Compare TradeLine" },
  { url: "/compare/mapguard", name: "Compare MapGuard" },
  { url: "/compare/reputationshield", name: "Compare ReputationShield" },
  { url: "/compare/socialsync", name: "Compare SocialSync" },
  { url: "/compare/rankflow", name: "Compare RankFlow" },
  { url: "/compare/sitelaunch", name: "Compare SiteLaunch" },
  { url: "/compare/webcare", name: "Compare WebCare" },
  { url: "/compare/webfix", name: "Compare WebFix" },
  { url: "/compare/quotequick", name: "Compare QuoteQuick" },
];

const ADMIN_PAGES: PageDef[] = [
  { url: "/admin/crm", name: "CRM Overview" },
  { url: "/admin/crm/clients", name: "Clients List" },
  { url: "/admin/crm/inbox", name: "Admin Inbox" },
  { url: "/admin/crm/billing", name: "Billing" },
  { url: "/admin/crm/services", name: "Services" },
  { url: "/admin/crm/suppliers", name: "Suppliers" },
  { url: "/admin/crm/support", name: "Support Inbox" },
  { url: "/admin/crm/mapguard", name: "MapGuard Dashboard" },
  { url: "/admin/crm/rankflow", name: "RankFlow Ops" },
  { url: "/admin/crm/reviews", name: "Reviews" },
  { url: "/admin/crm/socialsync", name: "SocialSync Ops" },
  { url: "/admin/crm/contentflow", name: "ContentFlow Queue" },
  { url: "/admin/crm/tradeline-ops", name: "TradeLine Ops" },
  { url: "/admin/crm/adflow", name: "AdFlow Ops" },
  { url: "/admin/crm/quotequick", name: "QuoteQuick Admin" },
  { url: "/admin/crm/sales", name: "Sales Pipeline" },
  { url: "/admin/crm/profile", name: "Admin Profile" },
  { url: "/admin/crm/settings", name: "Admin Settings" },
  { url: "/admin/crm/change-password", name: "Change Password" },
  { url: "/admin/ai", name: "AI Dashboard" },
  { url: "/admin/booking", name: "Booking Calendar" },
  { url: "/admin/system/jobs", name: "System Jobs" },
  { url: "/admin/system/workers", name: "System Workers" },
  { url: "/admin/system/alerts", name: "System Alerts" },
  { url: "/admin/outbound/prospects", name: "Outbound Prospects" },
  { url: "/admin/outbound/campaigns", name: "Outbound Campaigns" },
  { url: "/admin/outbound/pipeline", name: "Outbound Pipeline" },
  /* Cycles 16–21 admin additions */
  { url: "/admin/products/mapguard-setup", name: "Admin Product Editor (Q28)" },
  { url: "/admin/system/integrations", name: "Integration Health (Q29)" },
  { url: "/admin/crm/alerts", name: "System Alerts" },
  { url: "/admin/crm/audit-log", name: "Audit Log" },
];

const PORTAL_PAGES: PageDef[] = [
  { url: "/portal", name: "Portal Dashboard" },
  { url: "/portal/services", name: "Portal Services" },
  { url: "/portal/catalog", name: "Portal Catalog (Q16/Q28g2)" },
  { url: "/portal/billing", name: "Portal Billing" },
  { url: "/portal/settings", name: "Portal Settings" },
  { url: "/portal/help", name: "Portal Help" },
  { url: "/portal/reviews", name: "Portal Reviews" },
  { url: "/portal/reviews/widget", name: "Review Widget" },
  { url: "/portal/socialsync", name: "Portal SocialSync" },
  { url: "/portal/rankflow", name: "Portal RankFlow" },
  { url: "/portal/articles", name: "Portal Articles" },
  { url: "/portal/mapguard", name: "Portal MapGuard" },
  { url: "/portal/dispatch", name: "Portal Dispatch" },
  { url: "/portal/invoices", name: "Portal Invoices" },
  { url: "/portal/payment-methods", name: "Payment Methods" },
];

const TOOL_PAGES: PageDef[] = [
  { url: "/wizard", name: "QuoteQuick Wizard" },
  { url: "/demo", name: "Voice/Chat Demo" },
];

const TOTAL_PAGES =
  PUBLIC_PAGES.length + ADMIN_PAGES.length + PORTAL_PAGES.length + TOOL_PAGES.length;

/* ═══════════════════════════════════════════
   GROUP 1 — PUBLIC MARKETING PAGES
   ═══════════════════════════════════════════ */

test.describe("Group 1: Public Marketing Pages", () => {
  for (const def of PUBLIC_PAGES) {
    test(`${def.name} (${def.url})`, async ({ page }) => {
      const errors = await smokePage(page, def);
      pagesVisited++;
      if (errors.length > 0) {
        pagesWithErrors++;
        allErrors.push(...errors);
      }
      // Soft assert: log but don't fail the test — we collect everything in the report
      if (errors.length > 0) {
        console.warn(
          `[SMOKE] ${def.name} — ${errors.length} issue(s):`,
          errors.map((e) => e.message).join(" | ")
        );
      }
    });
  }
});

/* ═══════════════════════════════════════════
   GROUP 2 — ADMIN DASHBOARD PAGES
   ═══════════════════════════════════════════ */

test.describe.serial("Group 2: Admin Dashboard Pages", () => {
  test("Admin login", async ({ page }) => {
    const ok = await ensureAdminLogin(page);
    expect(ok, "Admin login must succeed for admin page tests").toBeTruthy();
    pagesVisited++;
  });

  for (const def of ADMIN_PAGES) {
    test(`${def.name} (${def.url})`, async ({ page }) => {
      await ensureAdminLogin(page);
      const errors = await smokePage(page, def);
      pagesVisited++;
      if (errors.length > 0) {
        pagesWithErrors++;
        allErrors.push(...errors);
        console.warn(
          `[SMOKE] ${def.name} — ${errors.length} issue(s):`,
          errors.map((e) => e.message).join(" | ")
        );
      }
    });
  }
});

/* ═══════════════════════════════════════════
   GROUP 3 — CLIENT PORTAL PAGES
   Portal pages require a client login. Without a
   seeded client user we verify they redirect to /login
   (which is still a valid smoke check — no crash).
   ═══════════════════════════════════════════ */

test.describe("Group 3: Client Portal Pages (redirect check)", () => {
  for (const def of PORTAL_PAGES) {
    test(`${def.name} (${def.url})`, async ({ page }) => {
      const errors: PageError[] = [];
      const now = () => new Date().toISOString();

      // Collect 5xx responses
      page.on("response", (res) => {
        if (res.status() >= 500) {
          errors.push({
            page: def.name,
            url: def.url,
            type: "response_5xx",
            message: `${res.status()} ${res.url()}`,
            timestamp: now(),
          });
        }
      });

      page.on("requestfailed", (req) => {
        errors.push({
          page: def.name,
          url: def.url,
          type: "network_error",
          message: `${req.method()} ${req.url()} — ${req.failure()?.errorText || "unknown"}`,
          timestamp: now(),
        });
      });

      try {
        await page.goto(def.url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT });
        await page.waitForTimeout(2_000);

        // Portal pages should either render (if somehow authed) or redirect to login
        const currentUrl = page.url();
        const bodyText = await page.locator("body").textContent().catch(() => "");

        if (bodyText) {
          const lower = bodyText.toLowerCase();
          if (
            lower.includes("internal server error") ||
            lower.includes("something went wrong") ||
            lower.includes("unhandled runtime error")
          ) {
            errors.push({
              page: def.name,
              url: def.url,
              type: "crash",
              message: `Page crash detected at ${currentUrl}`,
              timestamp: now(),
            });
          }
        }

        // The page should have some content (login form or portal content)
        const innerHTML = await page.locator("body").innerHTML().catch(() => "");
        if (innerHTML.trim().length < 50) {
          errors.push({
            page: def.name,
            url: def.url,
            type: "blank_page",
            message: `Page body is only ${innerHTML.trim().length} chars at ${currentUrl}`,
            timestamp: now(),
          });
        }
      } catch (err: any) {
        errors.push({
          page: def.name,
          url: def.url,
          type: "crash",
          message: `Navigation failed: ${err.message?.substring(0, 300) || String(err)}`,
          timestamp: now(),
        });
      }

      pagesVisited++;
      if (errors.length > 0) {
        pagesWithErrors++;
        allErrors.push(...errors);

        const screenshotDir = path.resolve("test-results", "smoke-screenshots");
        fs.mkdirSync(screenshotDir, { recursive: true });
        const safeName = def.name.replace(/[^a-zA-Z0-9_-]/g, "-");
        await page
          .screenshot({ path: path.join(screenshotDir, `${safeName}.png`), fullPage: false })
          .catch(() => {});

        console.warn(
          `[SMOKE] ${def.name} — ${errors.length} issue(s):`,
          errors.map((e) => e.message).join(" | ")
        );
      }
    });
  }
});

/* ═══════════════════════════════════════════
   GROUP 4 — PUBLIC TOOL PAGES
   ═══════════════════════════════════════════ */

test.describe("Group 4: Public Tool Pages", () => {
  for (const def of TOOL_PAGES) {
    test(`${def.name} (${def.url})`, async ({ page }) => {
      const errors = await smokePage(page, def);
      pagesVisited++;
      if (errors.length > 0) {
        pagesWithErrors++;
        allErrors.push(...errors);
        console.warn(
          `[SMOKE] ${def.name} — ${errors.length} issue(s):`,
          errors.map((e) => e.message).join(" | ")
        );
      }
    });
  }
});

/* ═══════════════════════════════════════════
   REPORT GENERATION
   ═══════════════════════════════════════════ */

test.afterAll(async () => {
  const reportDir = path.resolve("test-results");
  fs.mkdirSync(reportDir, { recursive: true });

  /* ── Error breakdown by type ── */
  const errorsByType: Record<string, number> = {};
  for (const err of allErrors) {
    errorsByType[err.type] = (errorsByType[err.type] || 0) + 1;
  }

  /* ── Error breakdown by page ── */
  const errorsByPage: Record<string, number> = {};
  for (const err of allErrors) {
    const key = `${err.page} (${err.url})`;
    errorsByPage[key] = (errorsByPage[key] || 0) + 1;
  }

  /* ── JSON report ── */
  const report = {
    timestamp: new Date().toISOString(),
    totalPagesDefined: TOTAL_PAGES,
    totalPagesVisited: pagesVisited,
    pagesWithErrors,
    totalErrors: allErrors.length,
    errorsByType,
    errorsByPage,
    errors: allErrors,
  };

  fs.writeFileSync(
    path.join(reportDir, "smoke-report.json"),
    JSON.stringify(report, null, 2)
  );

  /* ── Human-readable summary ── */
  const SEPARATOR = "=".repeat(70);
  let summary = "";
  summary += `SMOKE TEST REPORT\n${SEPARATOR}\n`;
  summary += `Run at:             ${report.timestamp}\n`;
  summary += `Pages defined:      ${report.totalPagesDefined}\n`;
  summary += `Pages visited:      ${report.totalPagesVisited}\n`;
  summary += `Pages with errors:  ${report.pagesWithErrors}\n`;
  summary += `Total errors:       ${report.totalErrors}\n`;
  summary += `\n`;

  if (Object.keys(errorsByType).length > 0) {
    summary += `ERRORS BY TYPE\n${"-".repeat(40)}\n`;
    for (const [type, count] of Object.entries(errorsByType)) {
      summary += `  ${type}: ${count}\n`;
    }
    summary += `\n`;
  }

  if (allErrors.length > 0) {
    summary += `ALL ERRORS\n${"-".repeat(40)}\n`;
    for (const err of allErrors) {
      summary += `[${err.type}] ${err.page} (${err.url})\n`;
      summary += `  ${err.message}\n`;
      summary += `  at ${err.timestamp}\n\n`;
    }
  } else {
    summary += `No errors found — all pages loaded cleanly.\n`;
  }

  fs.writeFileSync(path.join(reportDir, "smoke-report.txt"), summary);

  // Print summary to stdout so it shows in CI logs
  console.log(`\n${summary}`);
});
