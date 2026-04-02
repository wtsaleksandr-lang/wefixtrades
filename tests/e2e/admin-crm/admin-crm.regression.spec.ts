/**
 * Admin CRM — Regression Tests (Tier 3)
 *
 * AI Copilot drawer, client edit via UI dialog.
 *
 * Tests removed from this tier and moved to manual:
 * - R2/R3: Mobile responsive (viewport checks don't prove layout quality)
 * - R5/R5b: Client search/filter (had no final assertions; fragile select interaction)
 * - R1b: Copilot per-page prompts (same prompt text appears on multiple pages)
 */

import { test, expect, testId, createTestClient } from "./fixtures";

/* ═══════════════════════════════════════════
   R1 — AI Copilot drawer opens with page-aware UI
   ═══════════════════════════════════════════ */

test.describe("Regression: AI Copilot", () => {
  test("R1 — should open Copilot drawer and show prompt chips + input", async ({
    adminPage,
  }) => {
    // Mock the REAL chat endpoint (AdminCopilot POSTs to /api/chat)
    await adminPage.route("**/api/chat**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: 'data: {"content":"Mock response."}\n\ndata: [DONE]\n\n',
      })
    );

    await adminPage.goto("/admin/crm");

    // Wait for layout to render
    const nav = adminPage.locator("nav");
    await expect(nav).toBeVisible({ timeout: 10000 });

    // Click the Copilot button (title="AI Copilot")
    const copilotBtn = adminPage.locator('button[title="AI Copilot"]');
    await expect(copilotBtn).toBeVisible({ timeout: 5000 });
    await copilotBtn.click();

    // The drawer must show a text input for chat
    const chatInput = adminPage.locator('input[placeholder*="Ask"], input[placeholder*="ask"], input[placeholder*="Type"]');
    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // At least one prompt chip should be visible
    const promptChip = adminPage.getByText("What should I focus on")
      .or(adminPage.getByText("Summarize this page"))
      .or(adminPage.getByText("What needs attention"));
    await expect(promptChip).toBeVisible({ timeout: 5000 });

    // Close the drawer
    await copilotBtn.click();

    // Input should no longer be visible (drawer closed)
    await expect(chatInput).not.toBeVisible({ timeout: 3000 });
  });
});

/* ═══════════════════════════════════════════
   R4 — Edit client via the Edit dialog in UI
   ═══════════════════════════════════════════ */

test.describe("Regression: Client Edit", () => {
  test("R4 — open edit dialog, change business name, save, verify update", async ({
    adminPage,
    apiContext,
  }) => {
    const client = await createTestClient(apiContext);
    const newName = `UpdatedBiz ${testId()}`;

    // Navigate to client detail
    await adminPage.goto(`/admin/crm/clients/${client.id}`);
    await expect(adminPage.getByText(client.business_name)).toBeVisible({ timeout: 10000 });

    // Click the Edit button (has Pencil icon + "Edit" text)
    const editBtn = adminPage.getByRole("button", { name: /edit/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 5000 });
    await editBtn.click();

    // Edit dialog must open
    const dialog = adminPage.locator("[role=dialog]");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText("Edit Client")).toBeVisible();

    // Clear and fill the Business Name input (first input in the edit dialog)
    const bizNameInput = dialog.locator("input").first();
    await bizNameInput.clear();
    await bizNameInput.fill(newName);

    // Click Save
    await dialog.getByRole("button", { name: /save/i }).click();

    // Toast must confirm update
    await expect(adminPage.getByText("Client updated")).toBeVisible({ timeout: 5000 });

    // The new name must appear on the page (dialog closed, detail refreshed)
    await expect(adminPage.getByText(newName)).toBeVisible({ timeout: 10000 });

    // Verify via API that the change persisted
    const res = await apiContext.get(`/api/admin/crm/clients/${client.id}`);
    const updated = await res.json();
    expect(updated.business_name).toBe(newName);
  });
});
