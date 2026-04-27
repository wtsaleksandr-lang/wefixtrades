/**
 * ContentFlow — Sprint 5 verification.
 *
 * Exercises the WordPress publish queue end-to-end:
 *   - enqueueDraft / bulkEnqueue / retryDraft endpoints
 *   - the cron worker (driven synchronously via __dev/wp-queue/run)
 *   - scheduling: drafts with future scheduled_for are not picked
 *   - retry: failed publishes retry up to MAX_ATTEMPTS = 3
 *   - duplicate-publish prevention: already-published drafts are refused
 *
 * Reuses the dev-only WP REST stub from Sprint 4
 * (POST /api/__dev/wp-mock/wp-json/wp/v2/posts) — no real WordPress
 * instance is contacted. Worker invocation in tests goes through
 * POST /api/admin/contentflow/__dev/wp-queue/run for deterministic
 * synchronous draining (production cron fires every 2 minutes).
 *
 * Auth: worker-scoped fixture using globalSetup's storageState — zero
 * fresh logins, so this spec adds nothing to the auth rate-limit budget.
 *
 * Cleanup: scoped afterAll cascade DELETE keyed on the spec's clientId.
 *
 * Requires ANTHROPIC_API_KEY (article body generation, ~10s per draft).
 */

import { test as baseTest, expect, type APIRequestContext } from "@playwright/test";
import { STORAGE_STATE_PATH } from "./global-setup";
import { pool } from "../../../server/db";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const WP_MOCK_BASE = `${BASE_URL}/api/__dev/wp-mock`;

type SuiteFixtures = {
  adminApi: APIRequestContext;
};

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
  niche: "electrician",
  location: "Phoenix, AZ",
  website_url: "https://example-test.invalid",
  cms_type: "wordpress",
  target_services: ["panel upgrade"],
  target_locations: ["Phoenix, AZ"],
  plan_tier: "starter",
  enabled: true,
};

const WP_CONFIG = {
  cms_url: WP_MOCK_BASE,
  cms_username: "wp-test-admin",
  cms_app_password: "queue-test-app-pw-1234",
  cms_default_status: "draft" as const,
};

function plusMonths(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 7);
}
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

/**
 * Provision an approved RankFlow article draft for the configured client,
 * scheduling for the requested month. Returns the draft id (already with
 * body generated and status='approved').
 */
async function provisionApprovedArticle(
  api: APIRequestContext,
  clientId: number,
  monthOffset: number,
  excludeIds: Set<number> = new Set(),
): Promise<number> {
  const month = nextOddMonth(monthOffset);
  const planRes = await api.post(`/api/rankflow/clients/${clientId}/generate-plan`, {
    data: { month },
  });
  expect(planRes.ok(), `generate-plan failed: ${await planRes.text()}`).toBeTruthy();

  const tasksRes = await api.get(`/api/rankflow/clients/${clientId}/tasks`);
  const tasks = await tasksRes.json();
  const pageCreate = tasks.find(
    (t: any) => t.type === "page_create" && t.content_draft_id && !excludeIds.has(t.content_draft_id),
  );
  expect(pageCreate, `plan for ${month} should produce a fresh page_create`).toBeTruthy();
  const draftId = pageCreate.content_draft_id;

  const regen = await api.post(`/api/admin/contentflow/drafts/${draftId}/regenerate-article`);
  expect(regen.ok(), `regenerate failed: ${await regen.text()}`).toBeTruthy();

  const approve = await api.post(`/api/admin/contentflow/drafts/${draftId}/approve`, {
    data: { notes: "Sprint 5 spec approve" },
  });
  expect(approve.ok(), `approve failed: ${await approve.text()}`).toBeTruthy();

  return draftId;
}

// Sprint 5 tests share state via the module-level `provisionedDraftIds`
// Set — each test depends on artefacts created by earlier ones. Force
// serial execution within this describe block so all tests run on a
// single Playwright worker and share that state. Without this, parallel
// workers each get an empty Set, and tests like P5-7 / P5-9 that read
// from the Set break with NaN draft ids.
test.describe.configure({ mode: "serial" });

test.describe("ContentFlow Sprint 5 — WordPress publish queue", () => {
  let clientId = 0;
  const provisionedDraftIds = new Set<number>();

  test.afterAll(async () => {
    if (!clientId) return;
    try {
      await pool.query(
        `DELETE FROM content_approvals WHERE draft_id IN (SELECT id FROM content_drafts WHERE client_id = $1)`,
        [clientId],
      );
      await pool.query(`DELETE FROM content_drafts WHERE client_id = $1`, [clientId]);
      await pool.query(
        `DELETE FROM rankflow_qa_checks WHERE task_id IN (SELECT id FROM rankflow_tasks WHERE client_id = $1)`,
        [clientId],
      );
      await pool.query(`DELETE FROM rankflow_tasks WHERE client_id = $1`, [clientId]);
      await pool.query(`DELETE FROM rankflow_monthly_plans WHERE client_id = $1`, [clientId]);
      await pool.query(`DELETE FROM rankflow_pages WHERE client_id = $1`, [clientId]);
      await pool.query(`DELETE FROM rankflow_keywords WHERE client_id = $1`, [clientId]);
      await pool.query(`DELETE FROM rankflow_signals WHERE client_id = $1`, [clientId]);
      await pool.query(`DELETE FROM rankflow_progress WHERE client_id = $1`, [clientId]);
      await pool.query(`DELETE FROM rankflow_profiles WHERE client_id = $1`, [clientId]);
      await pool.query(`DELETE FROM fulfillment_tasks WHERE client_id = $1`, [clientId]);
      await pool.query(`DELETE FROM client_payments WHERE client_id = $1`, [clientId]);
      await pool.query(`DELETE FROM onboarding_submissions WHERE client_id = $1`, [clientId]);
      await pool.query(`DELETE FROM client_services WHERE client_id = $1`, [clientId]);
      await pool.query(`DELETE FROM internal_notes WHERE client_id = $1`, [clientId]);
      await pool.query(`DELETE FROM orders WHERE client_id = $1`, [clientId]);
      await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
    } catch (err: any) {
      console.warn("[sprint5 afterAll] cleanup warning:", err.message);
    }
  });

  test("P5-1 — queue-publish endpoint sets queue_status='queued'", async ({ adminApi }) => {
    /* One-time setup: client + profile + cms-config. */
    const id = testId();
    const cRes = await adminApi.post("/api/admin/crm/clients", {
      data: {
        business_name: `WP Queue PW ${id}`,
        contact_name: "Queue Tester",
        contact_email: `test-${id}@example.com`,
        contact_phone: "416-555-0700",
        trade_type: "electrician",
        status: "lead",
        source: "manual",
      },
    });
    expect(cRes.ok()).toBeTruthy();
    clientId = (await cRes.json()).id;

    const pRes = await adminApi.put(`/api/rankflow/clients/${clientId}/profile`, { data: STARTER_PROFILE });
    expect(pRes.ok()).toBeTruthy();
    const cfgRes = await adminApi.put(`/api/rankflow/clients/${clientId}/cms-config`, { data: WP_CONFIG });
    expect(cfgRes.ok()).toBeTruthy();

    /* Provision an approved article draft. */
    const draftId = await provisionApprovedArticle(adminApi, clientId, 0);
    provisionedDraftIds.add(draftId);

    /* Queue it (no schedule). */
    const queueRes = await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/queue-publish`, {
      data: {},
    });
    expect(queueRes.ok(), `queue-publish failed: ${await queueRes.text()}`).toBeTruthy();
    const body = await queueRes.json();
    expect(body.ok).toBe(true);
    expect(body.queue_status).toBe("queued");
    expect(body.scheduled_for).toBeNull();

    /* Persisted on the draft. */
    const detail = await (await adminApi.get(`/api/admin/contentflow/drafts/${draftId}`)).json();
    expect(detail.draft.metadata?.wordpress?.queue_status).toBe("queued");
    expect(detail.draft.metadata?.wordpress?.attempts).toBe(0);
  });

  test("P5-2 — worker drains queued draft → published with metadata.wordpress populated", async ({ adminApi }) => {
    /* Run the queue worker synchronously via the dev endpoint. */
    const runRes = await adminApi.post("/api/admin/contentflow/__dev/wp-queue/run", {});
    expect(runRes.ok(), `worker run failed: ${await runRes.text()}`).toBeTruthy();
    const summary = await runRes.json();
    expect(summary.ok).toBe(true);
    expect(summary.published).toBeGreaterThanOrEqual(1);

    /* The P5-1 draft is now published. */
    const id = Array.from(provisionedDraftIds)[0];
    const detail = await (await adminApi.get(`/api/admin/contentflow/drafts/${id}`)).json();
    expect(detail.draft.status).toBe("published");
    expect(detail.draft.metadata?.wordpress?.queue_status).toBe("published");
    expect(detail.draft.metadata?.wordpress?.post_url).toMatch(/^https?:\/\//);
    expect(detail.draft.metadata?.wordpress?.post_id).toBeGreaterThan(0);
  });

  test("P5-3 — scheduled draft (future scheduled_for) is NOT picked; flips to picked after scheduled time elapses", async ({ adminApi }) => {
    const draftId = await provisionApprovedArticle(adminApi, clientId, 2, provisionedDraftIds);
    provisionedDraftIds.add(draftId);

    /* Queue with a 1-hour-future scheduled_for. */
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const queueRes = await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/queue-publish`, {
      data: { scheduled_for: future },
    });
    expect(queueRes.ok()).toBeTruthy();

    /* Worker run #1: this draft must NOT be picked. */
    const summary1 = await (await adminApi.post("/api/admin/contentflow/__dev/wp-queue/run", {})).json();
    const detail1 = await (await adminApi.get(`/api/admin/contentflow/drafts/${draftId}`)).json();
    expect(detail1.draft.metadata?.wordpress?.queue_status, "scheduled draft must stay queued").toBe("queued");
    expect(detail1.draft.status, "draft status must remain 'approved'").toBe("approved");

    /* Move scheduled_for into the past via direct SQL — simulates clock advance. */
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    await pool.query(
      `UPDATE content_drafts
         SET metadata = jsonb_set(metadata, '{wordpress,scheduled_for}', to_jsonb($2::text), true)
       WHERE id = $1`,
      [draftId, past],
    );

    /* Worker run #2: now eligible → publishes. */
    const summary2 = await (await adminApi.post("/api/admin/contentflow/__dev/wp-queue/run", {})).json();
    expect(summary2.published).toBeGreaterThanOrEqual(1);
    const detail2 = await (await adminApi.get(`/api/admin/contentflow/drafts/${draftId}`)).json();
    expect(detail2.draft.status).toBe("published");
    expect(detail2.draft.metadata?.wordpress?.queue_status).toBe("published");
  });

  test("P5-4 — failed publish retries up to MAX_ATTEMPTS=3 then transitions to 'failed'", async ({ adminApi }) => {
    const draftId = await provisionApprovedArticle(adminApi, clientId, 4, provisionedDraftIds);
    provisionedDraftIds.add(draftId);

    /* Force the WP mock to fail by prepending FAIL_WP_500 to the title. */
    await pool.query(
      `UPDATE content_drafts SET title = 'FAIL_WP_500 ' || COALESCE(title, '') WHERE id = $1`,
      [draftId],
    );

    /* Queue. */
    const queueRes = await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/queue-publish`, {
      data: {},
    });
    expect(queueRes.ok()).toBeTruthy();

    /* Run worker 3 times: attempts 1, 2, 3. After attempt 3 → status='failed'. */
    for (let i = 0; i < 3; i++) {
      const r = await (await adminApi.post("/api/admin/contentflow/__dev/wp-queue/run", {})).json();
      expect(r.ok).toBe(true);
    }
    const detail = await (await adminApi.get(`/api/admin/contentflow/drafts/${draftId}`)).json();
    expect(detail.draft.metadata?.wordpress?.queue_status).toBe("failed");
    expect(detail.draft.metadata?.wordpress?.attempts).toBe(3);
    expect(detail.draft.metadata?.wordpress?.last_error).toBeTruthy();
    /* Draft.status remains 'approved' so admin can fix + retry. */
    expect(detail.draft.status).toBe("approved");

    /* Admin retry resets attempts to 0 and flips back to queued. */
    const retryRes = await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/retry-publish`, { data: {} });
    expect(retryRes.ok()).toBeTruthy();
    const detail2 = await (await adminApi.get(`/api/admin/contentflow/drafts/${draftId}`)).json();
    expect(detail2.draft.metadata?.wordpress?.queue_status).toBe("queued");
    expect(detail2.draft.metadata?.wordpress?.attempts).toBe(0);
    expect(detail2.draft.metadata?.wordpress?.last_error).toBeNull();
  });

  test("P5-5 — bulk-queue accepts multiple draft ids in a single call", async ({ adminApi }) => {
    /* Provision a fresh approved draft to bulk-queue. */
    const newDraftId = await provisionApprovedArticle(adminApi, clientId, 6, provisionedDraftIds);
    provisionedDraftIds.add(newDraftId);

    /* Include the freshly-provisioned draft + a known-bad id (999999) so we exercise both paths. */
    const res = await adminApi.post("/api/admin/contentflow/bulk-queue", {
      data: { draft_ids: [newDraftId, 999999], status: "draft" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.succeeded).toBe(1);
    expect(body.failed).toBe(1);

    const okEntry = body.results.find((r: any) => r.draftId === newDraftId);
    expect(okEntry?.ok).toBe(true);
    const failEntry = body.results.find((r: any) => r.draftId === 999999);
    expect(failEntry?.ok).toBe(false);
    expect(failEntry?.reason).toBe("draft_not_found");
  });

  test("P5-6 — non-approved draft cannot be queued (returns 409)", async ({ adminApi }) => {
    /* Provision and immediately reject a draft. */
    const month = nextOddMonth(8);
    const planRes = await adminApi.post(`/api/rankflow/clients/${clientId}/generate-plan`, { data: { month } });
    expect(planRes.ok()).toBeTruthy();
    const tasks = await (await adminApi.get(`/api/rankflow/clients/${clientId}/tasks`)).json();
    const fresh = tasks.find(
      (t: any) =>
        t.type === "page_create" && t.content_draft_id && !provisionedDraftIds.has(t.content_draft_id),
    );
    expect(fresh).toBeTruthy();
    const draftId = fresh.content_draft_id;
    provisionedDraftIds.add(draftId);

    /* Generate body so reject is a real flow, then reject. */
    const regen = await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/regenerate-article`);
    expect(regen.ok()).toBeTruthy();
    const reject = await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/reject`, {
      data: { reason: "Sprint 5 P5-6 reject" },
    });
    expect(reject.ok()).toBeTruthy();

    const queueRes = await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/queue-publish`, { data: {} });
    expect(queueRes.status()).toBe(409);
    const body = await queueRes.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("not_approved");
  });

  test("P5-7 — already-published draft cannot be re-queued (no duplicate WP posts)", async ({ adminApi }) => {
    /* Use the P5-1 draft, which is now published. */
    const id = Array.from(provisionedDraftIds)[0];
    const before = await (await adminApi.get(`/api/admin/contentflow/drafts/${id}`)).json();
    expect(before.draft.status).toBe("published");
    const originalPostId = before.draft.metadata?.wordpress?.post_id;
    expect(originalPostId).toBeGreaterThan(0);

    /* Try to queue it again. */
    const queueRes = await adminApi.post(`/api/admin/contentflow/drafts/${id}/queue-publish`, { data: {} });
    expect(queueRes.status()).toBe(409);
    const body = await queueRes.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("already_published");

    /* Run the worker — must NOT publish a second time. */
    const summary = await (await adminApi.post("/api/admin/contentflow/__dev/wp-queue/run", {})).json();
    expect(summary.ok).toBe(true);

    /* post_id and post_url are unchanged — no duplicate WP post. */
    const after = await (await adminApi.get(`/api/admin/contentflow/drafts/${id}`)).json();
    expect(after.draft.metadata?.wordpress?.post_id).toBe(originalPostId);
  });

  test("P5-8 — worker run with empty queue is a clean no-op", async ({ adminApi }) => {
    /* Drain anything left over from prior tests first. */
    await adminApi.post("/api/admin/contentflow/__dev/wp-queue/run", {});

    /* Now an extra run should produce a 'scanned: 0' summary (nothing eligible). */
    const res = await adminApi.post("/api/admin/contentflow/__dev/wp-queue/run", {});
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.scanned).toBe(0);
    expect(body.published).toBe(0);
    expect(body.failed).toBe(0);
    expect(body.errors).toHaveLength(0);
  });

  test("P5-9 — retry-publish refuses non-failed drafts (409)", async ({ adminApi }) => {
    /* P5-1 draft is published — retry must refuse with reason 'not_failed'. */
    const id = Array.from(provisionedDraftIds)[0];
    const res = await adminApi.post(`/api/admin/contentflow/drafts/${id}/retry-publish`, { data: {} });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("not_failed");
  });
});
