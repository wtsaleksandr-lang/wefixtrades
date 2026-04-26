/**
 * ContentFlow — Sprint 2 verification (admin queue UI).
 *
 * Drives the full UI:
 *   - logs in as admin (storageState for browser; one shared
 *     APIRequestContext for backend setup/cleanup so the suite stays
 *     under the auth rate limiter — 10 attempts / 15 min)
 *   - navigates to /admin/contentflow
 *   - exercises filters, drawer, approve, reject
 *   - asserts approval timeline updates
 *   - listens for browser console errors and pageerror events
 *
 * Test data is created via the Sprint 1 dev simulate endpoint
 * (/__dev/simulate-generation) and torn down via /__dev/cleanup.
 *
 * Requires NODE_ENV !== "production".
 *
 * Playwright pattern note: page.waitForResponse only catches events
 * after it is registered. For events triggered by an action (click,
 * goto), we always register the wait BEFORE the action — either via a
 * pre-declared promise or Promise.all([waitForResponse, action]).
 */

import { test as baseTest, expect } from "@playwright/test";
import type { APIRequestContext, Page, ConsoleMessage, Response as PWResponse } from "@playwright/test";
import { STORAGE_STATE_PATH } from "./global-setup";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@wefixtrades.com";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "TestAdmin123!";

type SuiteFixtures = {
  adminApi: APIRequestContext;
  adminPage: Page;
};

const test = baseTest.extend<{}, SuiteFixtures>({
  adminApi: [
    async ({ playwright }, use) => {
      const ctx = await playwright.request.newContext({ baseURL: BASE_URL });
      const loginRes = await ctx.post("/api/auth/login", {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      expect(loginRes.ok()).toBeTruthy();
      await use(ctx);
      await ctx.dispose();
    },
    { scope: "worker" },
  ],
  adminPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
      const page = await context.newPage();
      await use(page);
      await context.close();
    },
    { scope: "worker" },
  ],
});

interface SimulateResponse {
  post_id: number;
  draft_id: number;
  post_status: string;
  post_content_draft_id: number | null;
  draft_status: string;
  auto_approved: boolean;
}

async function createTestDraft(
  api: APIRequestContext,
  clientId: number,
  opts: { qualityScore?: number; autoApprove?: boolean } = {},
): Promise<SimulateResponse> {
  const { qualityScore = 88, autoApprove = true } = opts;
  const res = await api.post(
    "/api/admin/contentflow/__dev/simulate-generation",
    { data: { client_id: clientId, platform: "facebook", quality_score: qualityScore, auto_approve: autoApprove } },
  );
  expect(res.ok(), `simulate-generation failed: ${res.status()}`).toBeTruthy();
  return res.json();
}

async function cleanupDraft(
  api: APIRequestContext,
  draftId: number,
  postId: number,
): Promise<void> {
  await api
    .post("/api/admin/contentflow/__dev/cleanup", { data: { draft_id: draftId, post_id: postId } })
    .catch(() => {});
}

function attachConsoleSink(page: Page): { errors: string[]; pageErrors: string[] } {
  const errors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/\[vite\]|hot module|webSocket|favicon\.ico|__vite_ping|Download the React DevTools|THREE\.Clock/i.test(text)) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });
  return { errors, pageErrors };
}

interface QueueCall {
  url: string;
  status: number;
  search: string;
}

/**
 * Persistent response collector for /api/admin/contentflow/queue calls.
 * Attached for the lifetime of the page — captures every queue request
 * regardless of when in a test it fires.
 */
function attachQueueSink(page: Page): QueueCall[] {
  const calls: QueueCall[] = [];
  page.on("response", (resp: PWResponse) => {
    const u = resp.url();
    if (u.includes("/api/admin/contentflow/queue") && resp.request().method() === "GET") {
      calls.push({ url: u, status: resp.status(), search: new URL(u).search });
    }
  });
  return calls;
}

/** Wait until the persistent collector observes a queue call matching predicate. */
async function waitForQueueCall(
  calls: QueueCall[],
  predicate: (c: QueueCall) => boolean,
  timeoutMs = 10_000,
): Promise<QueueCall> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = calls.find(predicate);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `Timeout (${timeoutMs}ms) waiting for matching /queue call. Saw ${calls.length} calls: ${
      calls.map((c) => `${c.status} ${c.search}`).join(" | ") || "(none)"
    }`,
  );
}

test.describe.configure({ mode: "serial" });

test.describe("ContentFlow Sprint 2 — admin queue UI", () => {
  let testClientId: number;
  let testClientName: string;
  const created: Array<{ draft_id: number; post_id: number }> = [];

  test.beforeAll(async ({ adminApi }) => {
    const id = `pw_s2_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const res = await adminApi.post("/api/admin/crm/clients", {
      data: {
        business_name: `ContentFlow PW S2 ${id}`,
        contact_name: "PW S2 Contact",
        contact_email: `s2-${id}@example.com`,
        contact_phone: "416-555-0200",
        trade_type: "plumber",
        status: "lead",
        source: "manual",
      },
    });
    expect(res.ok()).toBeTruthy();
    const client = await res.json();
    testClientId = client.id;
    testClientName = client.business_name;
  });

  test.afterAll(async ({ adminApi }) => {
    for (const a of created) {
      await cleanupDraft(adminApi, a.draft_id, a.post_id);
    }
  });

  /* ──────────────────────────────────────────────────────────────────────
     S2-1 — page loads, sidebar shows ContentFlow, queue API populated,
            no console errors
     ──────────────────────────────────────────────────────────────────── */
  test("S2-1 — /admin/contentflow loads with data when authenticated as admin", async ({
    adminPage, adminApi,
  }) => {
    const sim = await createTestDraft(adminApi, testClientId);
    created.push({ draft_id: sim.draft_id, post_id: sim.post_id });

    const sink = attachConsoleSink(adminPage);
    const queueCalls = attachQueueSink(adminPage);

    await adminPage.goto("/admin/contentflow");
    await expect(adminPage.getByRole("main").getByRole("heading", { name: /^ContentFlow$/ }))
      .toBeVisible({ timeout: 15_000 });
    await expect(adminPage.getByRole("link", { name: /^ContentFlow$/ }).first()).toBeVisible();

    // The seeded row appearing is the strongest UI-level proof the queue
    // call landed AND its body was rendered.
    await expect(adminPage.locator(`[data-testid="contentflow-row-${sim.draft_id}"]`))
      .toBeVisible({ timeout: 15_000 });

    expect(sink.pageErrors).toEqual([]);
    expect(sink.errors).toEqual([]);
    expect(queueCalls.length).toBeGreaterThan(0);
    expect(queueCalls.every((c) => c.status === 200)).toBe(true);
  });

  /* ──────────────────────────────────────────────────────────────────────
     S2-2 — filters: status, surface, kind, client
     ──────────────────────────────────────────────────────────────────── */
  test("S2-2 — filters narrow the queue server-side", async ({ adminPage, adminApi }) => {
    let lastDraftId: number;
    if (created.length === 0) {
      const sim = await createTestDraft(adminApi, testClientId);
      created.push({ draft_id: sim.draft_id, post_id: sim.post_id });
      lastDraftId = sim.draft_id;
    } else {
      lastDraftId = created[created.length - 1].draft_id;
    }

    const queueCalls = attachQueueSink(adminPage);

    await adminPage.goto("/admin/contentflow");
    await expect(adminPage.getByRole("main").getByRole("heading", { name: /^ContentFlow$/ })).toBeVisible();
    await waitForQueueCall(queueCalls, (c) => c.status === 200, 15_000);

    // ── Status filter: pick "Approved" ──
    const statusTrigger = adminPage.locator("label:has-text('Status')").locator("..").getByRole("combobox");
    const beforeStatus = queueCalls.length;
    await statusTrigger.click();
    await adminPage.getByRole("option", { name: "Approved" }).click();
    await waitForQueueCall(
      queueCalls,
      (c, i) => i >= beforeStatus && c.search.includes("status=approved") && c.status === 200,
      10_000,
    );

    // ── Surface filter: rankflow → empty for our socialsync test draft ──
    const surfaceTrigger = adminPage.locator("label:has-text('Surface')").locator("..").getByRole("combobox");
    const beforeSurfaceRf = queueCalls.length;
    await surfaceTrigger.click();
    await adminPage.getByRole("option", { name: "rankflow" }).click();
    await waitForQueueCall(
      queueCalls,
      (c, i) => i >= beforeSurfaceRf && c.search.includes("surface=rankflow") && c.status === 200,
      10_000,
    );
    await expect(adminPage.locator(`[data-testid="contentflow-row-${lastDraftId}"]`)).toHaveCount(0);

    // Reset to socialsync.
    const beforeSurfaceSs = queueCalls.length;
    await surfaceTrigger.click();
    await adminPage.getByRole("option", { name: "socialsync" }).click();
    await waitForQueueCall(
      queueCalls,
      (c, i) => i >= beforeSurfaceSs && c.search.includes("surface=socialsync") && c.status === 200,
      10_000,
    );
    await expect(adminPage.locator(`[data-testid="contentflow-row-${lastDraftId}"]`)).toBeVisible({ timeout: 10_000 });

    // ── Kind filter ──
    const kindTrigger = adminPage.locator("label:has-text('Kind')").locator("..").getByRole("combobox");
    const beforeKind = queueCalls.length;
    await kindTrigger.click();
    await adminPage.getByRole("option", { name: "social post" }).click();
    await waitForQueueCall(
      queueCalls,
      (c, i) => i >= beforeKind && c.search.includes("kind=social_post") && c.status === 200,
      10_000,
    );
    await expect(adminPage.locator(`[data-testid="contentflow-row-${lastDraftId}"]`)).toBeVisible();

    // ── Client filter ──
    const clientTrigger = adminPage.locator("label:has-text('Client')").locator("..").getByRole("combobox");
    const beforeClient = queueCalls.length;
    await clientTrigger.click();
    await adminPage.getByRole("option", { name: new RegExp(testClientName) }).click();
    await waitForQueueCall(
      queueCalls,
      (c, i) => i >= beforeClient && c.search.includes(`client_id=${testClientId}`) && c.status === 200,
      10_000,
    );
    await expect(adminPage.locator(`[data-testid="contentflow-row-${lastDraftId}"]`)).toBeVisible();

    // Sanity: every captured call was 200.
    expect(queueCalls.every((c) => c.status === 200)).toBe(true);
  });

  /* ──────────────────────────────────────────────────────────────────────
     S2-3 — row click opens drawer; draft detail returns draft + approvals
     ──────────────────────────────────────────────────────────────────── */
  test("S2-3 — row click opens drawer with draft detail and approval trail", async ({
    adminPage, adminApi,
  }) => {
    const sim = await createTestDraft(adminApi, testClientId);
    created.push({ draft_id: sim.draft_id, post_id: sim.post_id });

    const queueCalls = attachQueueSink(adminPage);
    const detailUrl = `/api/admin/contentflow/drafts/${sim.draft_id}`;
    let detailHits = 0;
    adminPage.on("response", (r) => {
      if (
        r.url().includes(detailUrl) &&
        !r.url().includes("/approve") && !r.url().includes("/reject") &&
        r.request().method() === "GET" && r.status() === 200
      ) detailHits++;
    });

    await adminPage.goto("/admin/contentflow");
    await waitForQueueCall(queueCalls, (c) => c.status === 200, 15_000);
    await expect(adminPage.locator(`[data-testid="contentflow-row-${sim.draft_id}"]`)).toBeVisible({ timeout: 10_000 });

    // Listener for the detail GET registered BEFORE the click that triggers it.
    const detailPromise = adminPage.waitForResponse(
      (r) => r.url().includes(detailUrl) && r.request().method() === "GET" && r.status() === 200,
      { timeout: 10_000 },
    );
    await adminPage.locator(`[data-testid="contentflow-row-${sim.draft_id}"]`).click();
    await detailPromise;

    await expect(adminPage.getByRole("heading", { name: new RegExp(`Draft #${sim.draft_id}`) }))
      .toBeVisible({ timeout: 10_000 });
    expect(detailHits).toBeGreaterThan(0);

    await expect(adminPage.getByText(/auto_approved/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(adminPage.getByText(/DEV SIMULATION/).first()).toBeVisible({ timeout: 5_000 });

    // No explicit close — the next test goto's /admin/contentflow which
    // unmounts the sheet. Avoiding the close click sidesteps the strict-
    // mode collision between Radix Sheet's built-in X close (aria-label
    // "Close") and our footer "Close" button.
  });

  /* ──────────────────────────────────────────────────────────────────────
     S2-4 — Approve action
     ──────────────────────────────────────────────────────────────────── */
  test("S2-4 — Approve adds an admin approval row and updates the timeline", async ({
    adminPage, adminApi,
  }) => {
    // Create a draft that has NOT been auto-approved — admin button is
    // only enabled when status !== 'approved'. Sprint 1 tests use the
    // auto_approve=true default; Sprint 2 admin-action tests need this off.
    const sim = await createTestDraft(adminApi, testClientId, { qualityScore: 80, autoApprove: false });
    expect(sim.draft_status).toBe("draft");
    expect(sim.auto_approved).toBe(false);
    created.push({ draft_id: sim.draft_id, post_id: sim.post_id });

    const sink = attachConsoleSink(adminPage);
    const queueCalls = attachQueueSink(adminPage);

    await adminPage.goto("/admin/contentflow");
    await waitForQueueCall(queueCalls, (c) => c.status === 200, 15_000);
    await expect(adminPage.locator(`[data-testid="contentflow-row-${sim.draft_id}"]`)).toBeVisible({ timeout: 10_000 });

    // Open drawer (detail GET registered BEFORE click).
    const detailPromise = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/admin/contentflow/drafts/${sim.draft_id}`) &&
             r.request().method() === "GET" && r.status() === 200,
      { timeout: 10_000 },
    );
    await adminPage.locator(`[data-testid="contentflow-row-${sim.draft_id}"]`).click();
    await detailPromise;
    await expect(adminPage.getByRole("heading", { name: new RegExp(`Draft #${sim.draft_id}`) })).toBeVisible();

    // Click Approve — register the response wait BEFORE the click.
    const approvePromise = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/admin/contentflow/drafts/${sim.draft_id}/approve`) &&
             r.request().method() === "POST",
      { timeout: 10_000 },
    );
    await adminPage.getByRole("button", { name: /^Approve$/ }).click();
    const approveRes = await approvePromise;

    expect(approveRes.status()).toBe(200);
    const approveBody = await approveRes.json();
    expect(approveBody.ok).toBe(true);
    expect(approveBody.draft.status).toBe("approved");
    expect(approveBody.draft.auto_approved).toBe(false);

    // API-level audit assertion via the same shared adminApi context.
    const detail = await adminApi
      .get(`/api/admin/contentflow/drafts/${sim.draft_id}`)
      .then((r) => r.json());
    const actions = detail.approvals.map((a: any) => a.action);
    expect(actions).toContain("approved");
    const adminApproval = detail.approvals.find((a: any) => a.action === "approved");
    expect(adminApproval.actor_type).toBe("admin");
    expect(typeof adminApproval.actor_id).toBe("number");

    expect(sink.pageErrors).toEqual([]);
    expect(sink.errors).toEqual([]);
  });

  /* ──────────────────────────────────────────────────────────────────────
     S2-5 — Reject action
     ──────────────────────────────────────────────────────────────────── */
  test("S2-5 — Reject adds an admin rejection with reason and updates the timeline", async ({
    adminPage, adminApi,
  }) => {
    // Same rationale as S2-4: non-auto-approved draft so the Reject
    // button (also disabled on terminal/already-rejected drafts) is enabled.
    const sim = await createTestDraft(adminApi, testClientId, { qualityScore: 50, autoApprove: false });
    expect(sim.draft_status).toBe("draft");
    created.push({ draft_id: sim.draft_id, post_id: sim.post_id });

    const sink = attachConsoleSink(adminPage);
    const queueCalls = attachQueueSink(adminPage);

    await adminPage.goto("/admin/contentflow");
    await waitForQueueCall(queueCalls, (c) => c.status === 200, 15_000);
    await expect(adminPage.locator(`[data-testid="contentflow-row-${sim.draft_id}"]`)).toBeVisible({ timeout: 10_000 });

    const detailPromise = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/admin/contentflow/drafts/${sim.draft_id}`) &&
             r.request().method() === "GET" && r.status() === 200,
      { timeout: 10_000 },
    );
    await adminPage.locator(`[data-testid="contentflow-row-${sim.draft_id}"]`).click();
    await detailPromise;
    await expect(adminPage.getByRole("heading", { name: new RegExp(`Draft #${sim.draft_id}`) })).toBeVisible();

    await adminPage.getByRole("button", { name: /^Reject$/ }).click();
    const reason = "PW S2 verification — rejecting draft for test purposes";
    await adminPage.locator("textarea").last().fill(reason);

    const rejectPromise = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/admin/contentflow/drafts/${sim.draft_id}/reject`) &&
             r.request().method() === "POST",
      { timeout: 10_000 },
    );
    await adminPage.getByRole("button", { name: /^Confirm reject$/ }).click();
    const rejectRes = await rejectPromise;

    expect(rejectRes.status()).toBe(200);
    const rejectBody = await rejectRes.json();
    expect(rejectBody.ok).toBe(true);
    expect(rejectBody.draft.status).toBe("rejected");
    expect(rejectBody.draft.rejection_reason).toBe(reason);

    const detail = await adminApi
      .get(`/api/admin/contentflow/drafts/${sim.draft_id}`)
      .then((r) => r.json());
    const actions = detail.approvals.map((a: any) => a.action);
    expect(actions).toContain("rejected");
    const rejection = detail.approvals.find((a: any) => a.action === "rejected");
    expect(rejection.actor_type).toBe("admin");
    expect(rejection.notes).toBe(reason);

    expect(sink.pageErrors).toEqual([]);
    expect(sink.errors).toEqual([]);
  });

  /* ──────────────────────────────────────────────────────────────────────
     S2-6 — Refresh button re-fetches the queue
     ──────────────────────────────────────────────────────────────────── */
  test("S2-6 — Refresh button triggers a queue re-fetch", async ({ adminPage }) => {
    const queueCalls = attachQueueSink(adminPage);

    await adminPage.goto("/admin/contentflow");
    await waitForQueueCall(queueCalls, (c) => c.status === 200, 15_000);
    const before = queueCalls.length;

    const refreshPromise = adminPage.waitForResponse(
      (r) => r.url().includes("/api/admin/contentflow/queue") && r.request().method() === "GET" && r.status() === 200,
      { timeout: 10_000 },
    );
    await adminPage.locator('[data-testid="contentflow-refresh"]').click();
    await refreshPromise;

    expect(queueCalls.length).toBeGreaterThan(before);
  });
});
