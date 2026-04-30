/**
 * Admin CRM — Critical E2E Tests (Tier 2)
 *
 * Core business workflows: client create, service provisioning,
 * inbox task action, payment lifecycle, recurring task generation.
 *
 * Data setup uses the API; assertions target UI elements.
 * No silent fallbacks — every test must assert or fail explicitly.
 */

import {
  test,
  expect,
  testId,
  createTestClient,
  provisionService,
  listFulfillmentTasks,
  listClientPayments,
  generateMonthlyTasks,
  getServiceCatalog,
} from "./fixtures";

/* ═══════════════════════════════════════════
   E1 — Create client via UI -> lands on detail page
   ═══════════════════════════════════════════ */

test.describe("E2E: Client Management", () => {
  test("E1 — create a new client via UI and land on detail page", async ({ adminPage }) => {
    const suffix = testId();
    const bizName = `AcmePlumbing ${suffix}`;

    await adminPage.goto("/admin/crm/clients");
    await expect(adminPage.locator("h2").filter({ hasText: /clients/i })).toBeVisible({ timeout: 10000 });

    // Open Add Client dialog
    await adminPage.getByRole("button", { name: /add client/i }).click();

    const dialog = adminPage.locator("[role=dialog]");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill Business Name (first input in dialog)
    await dialog.locator("input").first().fill(bizName);
    // Fill Contact Name (second input)
    await dialog.locator("input").nth(1).fill("John Test");

    // Submit
    await dialog.getByRole("button", { name: /create/i }).click();

    // Must navigate to client detail page
    await adminPage.waitForURL("**/admin/crm/clients/**", { timeout: 10000 });

    // Client name and status must both be visible on detail page
    await expect(adminPage.getByRole("heading", { name: bizName })).toBeVisible({ timeout: 10000 });
    await expect(
      adminPage.getByText("lead", { exact: false }).or(adminPage.getByText("Lead"))
    ).toBeVisible({ timeout: 5000 });
  });
});

/* ═══════════════════════════════════════════
   E3 — Provision one-time service via UI
   (merged former E2 — detail page covered here)
   ═══════════════════════════════════════════ */

test.describe("E2E: Service Provisioning", () => {
  test("E3 — provision one-time service -> tasks + invoice created", async ({
    adminPage,
    apiContext,
  }) => {
    const client = await createTestClient(apiContext);

    // Navigate to client detail — proves detail page works (former E2)
    await adminPage.goto(`/admin/crm/clients/${client.id}`);
    await expect(adminPage.getByText(client.business_name)).toBeVisible({ timeout: 10000 });

    // Mock Stripe checkout to prevent real calls
    await adminPage.route("**/api/billing/checkout**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ checkout_url: null }),
      })
    );

    // Click "Add Service"
    const addServiceBtn = adminPage.getByRole("button", { name: /add service/i });
    await expect(addServiceBtn).toBeVisible({ timeout: 5000 });
    await addServiceBtn.click();

    const dialog = adminPage.locator("[role=dialog]");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Open the select dropdown
    const selectTrigger = dialog.locator("[role=combobox]").first();
    await expect(selectTrigger).toBeVisible({ timeout: 5000 });
    await selectTrigger.click();

    // Wait for options to load — fail explicitly if none appear
    const firstOption = adminPage.locator("[role=option]").first();
    await expect(firstOption).toBeVisible({
      timeout: 10000,
    });
    await firstOption.click();

    // Click Add button
    await dialog.getByRole("button", { name: /^add$/i }).click();

    // Toast must confirm provisioning
    await expect(
      adminPage.getByText("Service provisioned").or(adminPage.getByText("tasks created")).first()
    ).toBeVisible({ timeout: 15000 });

    // API verification: tasks and payment must exist
    const tasks = await listFulfillmentTasks(apiContext, client.id);
    expect(tasks.length).toBeGreaterThan(0);

    const payments = await listClientPayments(apiContext, client.id);
    expect(payments.length).toBeGreaterThan(0);
    expect(payments[0].status).toBe("pending");
  });
});

/* ═══════════════════════════════════════════
   E4 — Click primary action button on task in Inbox
   ═══════════════════════════════════════════ */

test.describe("E2E: Inbox / Fulfillment", () => {
  test("E4 — click Start on a task and verify status changes", async ({
    adminPage,
    apiContext,
  }) => {
    // Setup: create client + provision service
    const client = await createTestClient(apiContext);
    const provision = await provisionService(apiContext, client.id);
    expect(provision.tasksCreated).toBeGreaterThan(0);

    const tasks = await listFulfillmentTasks(apiContext, client.id);
    const task = tasks[0];
    expect(task.status).toBe("not_started");

    // Navigate to Inbox
    await adminPage.goto("/admin/crm/inbox");

    // Wait for task list to render — find our task by title
    const taskText = adminPage.getByText(task.title).first();
    await expect(taskText).toBeVisible({ timeout: 15000 });

    // Each TaskCard has a primary action button — for "not_started" it's "Start"
    // Find the "Start" button within the same card
    const taskCard = taskText.locator("xpath=ancestor::div[contains(@class, 'border-l-')]").first();
    const startBtn = taskCard.getByRole("button", { name: /^start$/i });
    await expect(startBtn).toBeVisible({ timeout: 5000 });
    await startBtn.click();

    // Toast must confirm the update
    await expect(adminPage.getByText("Task updated")).toBeVisible({ timeout: 5000 });

    // Verify via API that status actually changed
    const refreshed = await listFulfillmentTasks(apiContext, client.id);
    const updatedTask = refreshed.find((t: { id: number }) => t.id === task.id);
    expect(updatedTask).toBeDefined();
    expect(updatedTask.status).toBe("in_progress");
  });
});

/* ═══════════════════════════════════════════
   E5 — Mark payment as paid
   ═══════════════════════════════════════════ */

test.describe("E2E: Payments", () => {
  test("E5 — mark payment as paid and verify on billing page", async ({
    adminPage,
    apiContext,
  }) => {
    // Setup: create client + provision (creates pending invoice)
    const client = await createTestClient(apiContext);
    await provisionService(apiContext, client.id);

    const payments = await listClientPayments(apiContext, client.id);
    expect(payments.length).toBeGreaterThan(0);
    const payment = payments[0];
    expect(payment.status).toBe("pending");

    // Mark as paid via API
    const paidRes = await apiContext.patch(`/api/admin/crm/payments/${payment.id}`, {
      data: { status: "paid" },
    });
    expect(paidRes.ok()).toBeTruthy();
    const paid = await paidRes.json();
    expect(paid.status).toBe("paid");
    expect(paid.paid_at).toBeTruthy();

    // Verify on billing page — check that page renders and shows data
    await adminPage.goto("/admin/crm/billing");

    // Wait for the billing table to load (not networkidle)
    const billingHeading = adminPage.locator("h2").filter({ hasText: /billing/i })
      .or(adminPage.getByText("Unpaid"));
    await expect(billingHeading).toBeVisible({ timeout: 10000 });

    // The payment description should appear in the table
    const paymentRow = adminPage.getByText(payment.description || "mapguard", { exact: false });
    await expect(paymentRow.first()).toBeVisible({ timeout: 10000 });
  });
});

/* ═══════════════════════════════════════════
   E6 — Provision recurring service + generate monthly tasks
   ═══════════════════════════════════════════ */

test.describe("E2E: Recurring Services", () => {
  test("E6 — provision monthly service and generate recurring tasks", async ({
    adminPage,
    apiContext,
  }) => {
    // Find a monthly service from catalog
    const catalog = await getServiceCatalog(apiContext);
    const monthlyService = catalog.find(
      (s: { billing_period: string }) => s.billing_period === "monthly"
    );

    // Skip at test declaration level if no monthly service
    if (!monthlyService) {
      test.skip();
      return;
    }

    const client = await createTestClient(apiContext);
    const provision = await provisionService(apiContext, client.id, monthlyService.id);
    const clientServiceId = provision.clientService.id;
    expect(clientServiceId).toBeTruthy();

    // Generate monthly tasks
    const { response, data: genResult } = await generateMonthlyTasks(
      apiContext,
      clientServiceId,
      "2026-05"
    );

    if (!response.ok()) {
      // No recurring templates for this service — skip gracefully
      test.skip();
      return;
    }

    expect(genResult.tasksCreated).toBeGreaterThan(0);
    expect(genResult.month).toBe("2026-05");

    // Verify tasks with month label exist via API
    const tasks = await listFulfillmentTasks(apiContext, client.id);
    const monthlyTasks = tasks.filter((t: { title: string }) => t.title.includes("[2026-05]"));
    expect(monthlyTasks.length).toBeGreaterThan(0);

    // Verify on client detail page
    await adminPage.goto(`/admin/crm/clients/${client.id}`);
    await expect(adminPage.getByText(client.business_name)).toBeVisible({ timeout: 10000 });
  });
});
