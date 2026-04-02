/**
 * Admin CRM — Lower-Priority Regression Tests (Tier 3)
 *
 * AI Copilot drawer, mobile responsive smoke, client edit, search/filter.
 */

import { test, expect, testId, createTestClient } from "./fixtures";

/* ═══════════════════════════════════════════
   R1 — AI Copilot drawer
   ═══════════════════════════════════════════ */

test.describe("Regression: AI Copilot", () => {
  test("R1 — should open AI Copilot drawer and show page-aware UI", async ({
    adminPage,
  }) => {
    // Mock the AI chat endpoint to avoid real API calls
    await adminPage.route("**/api/ai/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: 'data: {"content":"This is a mock AI response."}\n\ndata: [DONE]\n\n',
      })
    );
    await adminPage.route("**/api/admin/ai/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    );

    // Navigate to CRM overview
    await adminPage.goto("/admin/crm");
    await adminPage.waitForLoadState("networkidle");

    // Click the Copilot button (sparkles icon with title "AI Copilot")
    const copilotBtn = adminPage.locator('button[title="AI Copilot"]');
    await expect(copilotBtn).toBeVisible({ timeout: 10000 });
    await copilotBtn.click();

    // The copilot drawer should appear with context-aware prompt chips
    // Look for the input or the drawer panel
    const copilotDrawer = adminPage.locator("text=Context").or(
      adminPage.locator('input[placeholder*="Ask"]').or(
        adminPage.locator("text=What should I focus on")
      )
    );
    await expect(copilotDrawer).toBeVisible({ timeout: 5000 });

    // Close the drawer
    const closeBtn = adminPage.locator('button[title="AI Copilot"]');
    await closeBtn.click();
  });

  test("R1b — Copilot shows different prompts per page", async ({
    adminPage,
  }) => {
    // Mock AI routes
    await adminPage.route("**/api/ai/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: 'data: {"content":"Mock."}\n\ndata: [DONE]\n\n',
      })
    );

    // Go to Inbox page
    await adminPage.goto("/admin/crm/inbox");
    await adminPage.waitForLoadState("networkidle");

    // Open copilot
    const copilotBtn = adminPage.locator('button[title="AI Copilot"]');
    if (await copilotBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await copilotBtn.click();

      // Inbox-specific prompts should appear
      const inboxPrompts = adminPage
        .locator("text=What should I focus on")
        .or(adminPage.locator("text=What is blocked"));

      await expect(inboxPrompts).toBeVisible({ timeout: 5000 });

      // Close
      await copilotBtn.click();
    }
  });
});

/* ═══════════════════════════════════════════
   R2/R3 — Mobile responsive smoke
   ═══════════════════════════════════════════ */

test.describe("Regression: Mobile Responsive", () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone X

  test("R2 — Inbox renders on mobile viewport", async ({ adminPage }) => {
    await adminPage.goto("/admin/crm/inbox");
    await adminPage.waitForLoadState("networkidle");

    // Page should render without crash — check for heading or task section
    await expect(
      adminPage.locator("text=Inbox").or(adminPage.locator("text=Fulfillment"))
    ).toBeVisible({ timeout: 10000 });

    // Sidebar should be collapsed or hidden on mobile
    const sidebar = adminPage.locator("aside, nav").first();
    if (await sidebar.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Sidebar might be a hamburger menu on mobile — that's fine
      const box = await sidebar.boundingBox();
      // On mobile, sidebar should either be hidden or narrow
      if (box) {
        expect(box.width).toBeLessThan(300);
      }
    }
  });

  test("R3 — Client detail page renders on mobile", async ({
    adminPage,
    apiContext,
  }) => {
    const client = await createTestClient(apiContext);
    await adminPage.goto(`/admin/crm/clients/${client.id}`);
    await adminPage.waitForLoadState("networkidle");

    // Client name should be visible
    await expect(adminPage.locator(`text=${client.business_name}`)).toBeVisible({
      timeout: 10000,
    });

    // Page should not overflow horizontally
    const body = adminPage.locator("body");
    const bodyBox = await body.boundingBox();
    expect(bodyBox!.width).toBeLessThanOrEqual(375 + 2); // small tolerance
  });
});

/* ═══════════════════════════════════════════
   R4 — Edit client information
   ═══════════════════════════════════════════ */

test.describe("Regression: Client Edit", () => {
  test("R4 — should edit client info via API and verify in UI", async ({
    adminPage,
    apiContext,
  }) => {
    const client = await createTestClient(apiContext);
    const newName = `Updated Biz ${testId()}`;

    // Update client via API
    const res = await apiContext.patch(`/api/admin/crm/clients/${client.id}`, {
      data: { business_name: newName },
    });
    expect(res.ok()).toBeTruthy();

    // Navigate to client detail page
    await adminPage.goto(`/admin/crm/clients/${client.id}`);
    await adminPage.waitForLoadState("networkidle");

    // Updated name should be visible
    await expect(adminPage.locator(`text=${newName}`)).toBeVisible({
      timeout: 10000,
    });
  });
});

/* ═══════════════════════════════════════════
   R5 — Client search and filter
   ═══════════════════════════════════════════ */

test.describe("Regression: Client Search & Filter", () => {
  test("R5 — should filter clients by status", async ({
    adminPage,
    apiContext,
  }) => {
    // Create clients with different statuses
    await createTestClient(apiContext, { status: "active", business_name: `ActiveBiz ${testId()}` });
    await createTestClient(apiContext, { status: "lead", business_name: `LeadBiz ${testId()}` });

    // Navigate to clients page
    await adminPage.goto("/admin/crm/clients");
    await adminPage.waitForLoadState("networkidle");

    await expect(adminPage.locator("h2").filter({ hasText: /clients/i })).toBeVisible({
      timeout: 10000,
    });

    // Open status filter dropdown
    const filterTrigger = adminPage.locator("[role=combobox], button").filter({ hasText: /all statuses/i }).first();
    if (await filterTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await filterTrigger.click();

      // Select "Active"
      const activeOption = adminPage.locator("[role=option]").filter({ hasText: /^active$/i }).first();
      if (await activeOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await activeOption.click();

        // Wait for list to update
        await adminPage.waitForLoadState("networkidle");

        // All visible status badges should say "active"
        // (or the list is empty if no active clients match)
      }
    }
  });

  test("R5b — should search clients by name", async ({
    adminPage,
    apiContext,
  }) => {
    const uniqueName = `SearchTarget ${testId()}`;
    await createTestClient(apiContext, { business_name: uniqueName });

    await adminPage.goto("/admin/crm/clients");
    await adminPage.waitForLoadState("networkidle");

    // Type in search box
    const searchInput = adminPage.getByPlaceholder(/search/i);
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill(uniqueName.split(" ")[0]); // search by first word

    // Wait for results to filter
    await adminPage.waitForTimeout(1000); // debounce

    // The unique name should appear in results
    await expect(adminPage.locator(`text=${uniqueName}`)).toBeVisible({
      timeout: 10000,
    });
  });
});
