/**
 * ContentFlow — Sprint 3 verification.
 *
 * Exercises the full RankFlow → ContentFlow article pipeline end-to-end
 * using real production endpoints (no dev-only article helper). The flow:
 *
 *   1. Create a CRM client.
 *   2. PUT a starter-tier RankFlow profile via /api/rankflow/clients/:id/profile.
 *   3. POST /api/rankflow/clients/:id/generate-plan?month=YYYY-MM — same
 *      endpoint admins use in production. Starter tier emits one
 *      page_create task per plan, which fires the article hook to create
 *      a content_drafts row (kind='article', surface='rankflow').
 *   4. Synchronously trigger AI generation via the regenerate-article admin
 *      endpoint. (Background generation also fires from the hook, but we
 *      regenerate to get deterministic completion within the test window.)
 *   5. Assert the draft body / title / excerpt are non-empty.
 *   6. Verify queue listing surfaces the article.
 *   7. Approve, reject (using a second draft), and exercise both export endpoints.
 *
 * Auth: worker-scoped fixture (one login per spec) — avoids hitting the
 * /api/auth/login rate limiter (10/15min) when run alongside the other
 * three spec files in a single session.
 *
 * Cleanup: relies on the global cleanup-test-data.ts script which now
 * sweeps rankflow + content rows scoped to test-pw_*@example.com clients
 * at the start of every test session. No in-test cascade endpoint required.
 *
 * Requires ANTHROPIC_API_KEY at runtime — generation step calls real Claude
 * Haiku 4.5. Test budget: ~2 article generations per run, ~3-8 seconds each.
 */

import { test as baseTest, expect, type APIRequestContext } from "@playwright/test";
import { STORAGE_STATE_PATH } from "./global-setup";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

type SuiteFixtures = {
  adminApi: APIRequestContext;
};

// Worker-scoped admin API context. Loads the persisted session cookies that
// globalSetup wrote after a browser login — no fresh /api/auth/login call,
// so this spec adds zero login attempts to the auth rate-limit budget.
const test = baseTest.extend<{}, SuiteFixtures>({
  adminApi: [
    async ({ playwright }, use) => {
      const ctx = await playwright.request.newContext({
        baseURL: BASE_URL,
        storageState: STORAGE_STATE_PATH,
      });
      await use(ctx);
      await ctx.dispose();
    },
    { scope: "worker" },
  ],
});

const STARTER_PROFILE = {
  niche: "plumbing",
  location: "Dallas, TX",
  website_url: "https://example-test.com",
  cms_type: "wordpress",
  target_services: ["water heater repair", "drain cleaning"],
  target_locations: ["Dallas, TX", "Fort Worth, TX"],
  plan_tier: "starter",
  enabled: true,
};

function plusMonths(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 7);
}

/**
 * Starter-tier rotation alternates page_create (odd months) with
 * citation_build (even months). Pick the next odd-numbered month so the
 * plan reliably contains a page_create task we can hook into.
 */
function nextOddMonth(offset = 0): string {
  let n = 1 + offset;
  for (let i = 0; i < 24; i++) {
    const candidate = plusMonths(n);
    const mm = parseInt(candidate.split("-")[1] || "0", 10);
    if (mm % 2 === 1) return candidate;
    n++;
  }
  return plusMonths(1);
}

function testId() {
  return `pw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

test.describe("ContentFlow Sprint 3 — RankFlow article pipeline", () => {
  let clientId = 0;
  let pageCreateTaskId = 0;
  let articleDraftId = 0;

  test("CF3-1 — generate-plan creates a linked article draft for the page_create task", async ({ adminApi }) => {
    const id = testId();
    const clientRes = await adminApi.post("/api/admin/crm/clients", {
      data: {
        business_name: `RankFlow PW ${id}`,
        contact_name: "PW Test",
        contact_email: `test-${id}@example.com`,
        contact_phone: "416-555-0101",
        trade_type: "plumber",
        status: "lead",
        source: "manual",
      },
    });
    expect(clientRes.ok(), `client create failed: ${await clientRes.text()}`).toBeTruthy();
    const client = await clientRes.json();
    clientId = client.id;
    expect(clientId).toBeTruthy();

    // Seed RankFlow profile (starter tier => 1 page_create per month).
    const profileRes = await adminApi.put(`/api/rankflow/clients/${clientId}/profile`, {
      data: STARTER_PROFILE,
    });
    expect(profileRes.ok(), `profile PUT failed: ${await profileRes.text()}`).toBeTruthy();

    // Trigger plan generation — this exercises the production hook.
    // Use the next odd-numbered month (starter rotation phase A = page_create).
    const planMonth = nextOddMonth(0);
    const planRes = await adminApi.post(
      `/api/rankflow/clients/${clientId}/generate-plan`,
      { data: { month: planMonth } },
    );
    expect(planRes.ok(), `generate-plan failed: ${await planRes.text()}`).toBeTruthy();
    const planBody = await planRes.json();
    expect(planBody.tasksCreated).toBeGreaterThan(0);

    // Find the page_create task on this client.
    const tasksRes = await adminApi.get(`/api/rankflow/clients/${clientId}/tasks`);
    expect(tasksRes.ok()).toBeTruthy();
    const tasks = await tasksRes.json();
    const pageCreate = tasks.find((t: any) => t.type === "page_create");
    expect(pageCreate, "starter plan should include at least one page_create task").toBeTruthy();
    pageCreateTaskId = pageCreate.id;

    // Article hook should have populated content_draft_id on the task.
    expect(pageCreate.content_draft_id, "rankflow_tasks.content_draft_id should be set by the hook").toBeTruthy();
    articleDraftId = pageCreate.content_draft_id;

    // Re-fetch the draft to confirm shape.
    const draftRes = await adminApi.get(`/api/admin/contentflow/drafts/${articleDraftId}`);
    expect(draftRes.ok()).toBeTruthy();
    const { draft, linkedTask } = await draftRes.json();
    expect(draft.kind).toBe("article");
    expect(draft.surface).toBe("rankflow");
    expect(draft.linked_task_id).toBe(pageCreateTaskId);
    expect(linkedTask?.id).toBe(pageCreateTaskId);
  });

  test("CF3-2 — synchronous regenerate populates body / title / excerpt", async ({ adminApi }) => {
    expect(articleDraftId, "CF3-1 should have established the draft id").toBeTruthy();

    const regenRes = await adminApi.post(
      `/api/admin/contentflow/drafts/${articleDraftId}/regenerate-article`,
    );
    expect(regenRes.ok(), `regenerate failed: ${await regenRes.text()}`).toBeTruthy();
    const { draft } = await regenRes.json();
    expect(draft.title?.length, "title must be non-empty").toBeGreaterThan(10);
    expect(draft.excerpt?.length, "excerpt must be non-empty").toBeGreaterThan(40);
    expect(draft.body?.length, "body must be substantial").toBeGreaterThan(300);
    expect(draft.metadata?.generation_status).toBe("completed");
  });

  test("CF3-3 — article appears in /api/admin/contentflow/queue with surface=rankflow&kind=article", async ({ adminApi }) => {
    const res = await adminApi.get(
      `/api/admin/contentflow/queue?surface=rankflow&kind=article&client_id=${clientId}`,
    );
    expect(res.ok()).toBeTruthy();
    const { drafts } = await res.json();
    const found = drafts.find((d: any) => d.id === articleDraftId);
    expect(found, "newly created article should appear under surface=rankflow filter").toBeTruthy();
    expect(found.kind).toBe("article");
    expect(found.surface).toBe("rankflow");
  });

  test("CF3-4 — admin approve transitions the article to status=approved", async ({ adminApi }) => {
    const res = await adminApi.post(`/api/admin/contentflow/drafts/${articleDraftId}/approve`, {
      data: { notes: "PW Sprint 3 approve test" },
    });
    expect(res.ok(), `approve failed: ${await res.text()}`).toBeTruthy();
    const { draft } = await res.json();
    expect(draft.status).toBe("approved");

    // Approval audit row exists with actor_type='admin', action='approved'.
    const detailRes = await adminApi.get(`/api/admin/contentflow/drafts/${articleDraftId}`);
    const { approvals } = await detailRes.json();
    const adminApproval = approvals.find((a: any) => a.actor_type === "admin" && a.action === "approved");
    expect(adminApproval, "admin approval row should be appended").toBeTruthy();
  });

  test("CF3-5 — export.md returns 200 with frontmatter + body", async ({ adminApi }) => {
    const res = await adminApi.get(`/api/admin/contentflow/drafts/${articleDraftId}/export.md`);
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-type"]).toContain("text/markdown");
    const md = await res.text();
    expect(md).toContain("---");
    expect(md).toContain(`draft_id: ${articleDraftId}`);
    expect(md.length).toBeGreaterThan(300);
  });

  test("CF3-6 — export.html returns 200 with <h1>, <h2>, escaped body", async ({ adminApi }) => {
    const res = await adminApi.get(`/api/admin/contentflow/drafts/${articleDraftId}/export.html`);
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-type"]).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<h1>");
    expect(html).toMatch(/<h2>.+<\/h2>/);
  });

  test("CF3-7 — admin reject on a second article transitions it to status=rejected", async ({ adminApi }) => {
    // Generate a second plan (different month) to get a fresh article draft
    // we can reject without un-doing CF3-4.
    // Pick the *next* odd-numbered month after CF3-1's plan so the second
    // plan also lands in starter rotation phase A and contains a page_create.
    const secondMonth = nextOddMonth(2);
    const planRes = await adminApi.post(
      `/api/rankflow/clients/${clientId}/generate-plan`,
      { data: { month: secondMonth } },
    );
    expect(planRes.ok(), `second plan generate failed: ${await planRes.text()}`).toBeTruthy();

    const tasksRes = await adminApi.get(`/api/rankflow/clients/${clientId}/tasks`);
    const tasks = await tasksRes.json();
    const second = tasks.find(
      (t: any) => t.type === "page_create" && t.id !== pageCreateTaskId && t.content_draft_id,
    );
    expect(second, "second plan should produce a fresh page_create + draft").toBeTruthy();

    const rejectRes = await adminApi.post(
      `/api/admin/contentflow/drafts/${second.content_draft_id}/reject`,
      { data: { reason: "PW Sprint 3 reject test" } },
    );
    expect(rejectRes.ok(), `reject failed: ${await rejectRes.text()}`).toBeTruthy();
    const { draft } = await rejectRes.json();
    expect(draft.status).toBe("rejected");
  });
});

export { expect };
