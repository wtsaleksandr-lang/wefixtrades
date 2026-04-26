/**
 * ContentFlow — Sprint 4 verification.
 *
 * Exercises the WordPress publishing pipeline end-to-end:
 *   client → RankFlow profile (with cms-config) → page_create plan → article
 *   draft → admin approve → POST publish → WP REST stub returns post_id+link
 *   → draft transitions to 'published' with metadata.wordpress populated.
 *
 * The "WordPress" side is a dev-only stub registered in contentflowRoutes
 * gated by NODE_ENV !== "production" — see __dev/wp-mock/wp-json/wp/v2/posts.
 * No real WordPress instance is contacted in tests.
 *
 * Auth: worker-scoped fixture using the storageState file written by
 * globalSetup, so this spec does not consume the auth-rate-limit budget.
 *
 * Cleanup: scoped afterAll cascade DELETE keyed on this spec's clientId.
 * Mirrors the Sprint 3 pattern — zero artefacts left behind.
 *
 * Requires ANTHROPIC_API_KEY at runtime — same as Sprint 3 (we generate
 * one article body via the existing regenerate-article endpoint).
 */

import { test as baseTest, expect, type APIRequestContext } from "@playwright/test";
import { STORAGE_STATE_PATH } from "./global-setup";
import { pool } from "../../../server/db";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const WP_MOCK_BASE = `${BASE_URL}/api/admin/contentflow/__dev/wp-mock`;

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
  niche: "plumbing",
  location: "Austin, TX",
  website_url: "https://example-test.invalid",
  cms_type: "wordpress",
  target_services: ["water heater repair"],
  target_locations: ["Austin, TX"],
  plan_tier: "starter",
  enabled: true,
};

const WP_CONFIG = {
  cms_url: WP_MOCK_BASE,
  cms_username: "wp-test-admin",
  cms_app_password: "abcd-efgh-ijkl-mnop-qrst-uvwx",
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

test.describe("ContentFlow Sprint 4 — WordPress publishing", () => {
  let clientId = 0;
  let articleDraftId = 0;
  let unconfiguredClientId = 0;
  let unconfiguredArticleDraftId = 0;

  test.afterAll(async () => {
    const ids = [clientId, unconfiguredClientId].filter((n) => n > 0);
    if (ids.length === 0) return;
    for (const id of ids) {
      try {
        await pool.query(
          `DELETE FROM content_approvals WHERE draft_id IN (SELECT id FROM content_drafts WHERE client_id = $1)`,
          [id],
        );
        await pool.query(`DELETE FROM content_drafts WHERE client_id = $1`, [id]);
        await pool.query(
          `DELETE FROM rankflow_qa_checks WHERE task_id IN (SELECT id FROM rankflow_tasks WHERE client_id = $1)`,
          [id],
        );
        await pool.query(`DELETE FROM rankflow_tasks WHERE client_id = $1`, [id]);
        await pool.query(`DELETE FROM rankflow_monthly_plans WHERE client_id = $1`, [id]);
        await pool.query(`DELETE FROM rankflow_pages WHERE client_id = $1`, [id]);
        await pool.query(`DELETE FROM rankflow_keywords WHERE client_id = $1`, [id]);
        await pool.query(`DELETE FROM rankflow_signals WHERE client_id = $1`, [id]);
        await pool.query(`DELETE FROM rankflow_progress WHERE client_id = $1`, [id]);
        await pool.query(`DELETE FROM rankflow_profiles WHERE client_id = $1`, [id]);
        await pool.query(`DELETE FROM fulfillment_tasks WHERE client_id = $1`, [id]);
        await pool.query(`DELETE FROM client_payments WHERE client_id = $1`, [id]);
        await pool.query(`DELETE FROM onboarding_submissions WHERE client_id = $1`, [id]);
        await pool.query(`DELETE FROM client_services WHERE client_id = $1`, [id]);
        await pool.query(`DELETE FROM internal_notes WHERE client_id = $1`, [id]);
        await pool.query(`DELETE FROM orders WHERE client_id = $1`, [id]);
        await pool.query(`DELETE FROM clients WHERE id = $1`, [id]);
      } catch (err: any) {
        console.warn(`[sprint4 afterAll] cleanup warning for client ${id}:`, err.message);
      }
    }
  });

  test("P4-1 — approved RankFlow article + configured WP creds → publish success", async ({ adminApi }) => {
    /* 1. Create a CRM client. */
    const id = testId();
    const cRes = await adminApi.post("/api/admin/crm/clients", {
      data: {
        business_name: `WP Publish PW ${id}`,
        contact_name: "PW Publish",
        contact_email: `test-${id}@example.com`,
        contact_phone: "416-555-0501",
        trade_type: "plumber",
        status: "lead",
        source: "manual",
      },
    });
    expect(cRes.ok()).toBeTruthy();
    clientId = (await cRes.json()).id;

    /* 2. Seed RankFlow profile (starter, enabled, cms_type=wordpress). */
    const pRes = await adminApi.put(`/api/rankflow/clients/${clientId}/profile`, { data: STARTER_PROFILE });
    expect(pRes.ok(), `profile PUT failed: ${await pRes.text()}`).toBeTruthy();

    /* 3. Save WP credentials via cms-config endpoint (encrypted at rest). */
    const cfgRes = await adminApi.put(`/api/rankflow/clients/${clientId}/cms-config`, { data: WP_CONFIG });
    expect(cfgRes.ok(), `cms-config failed: ${await cfgRes.text()}`).toBeTruthy();
    const cfgBody = await cfgRes.json();
    expect(cfgBody.ok).toBe(true);
    // Sensitive guard: server must NOT echo the password back.
    expect(JSON.stringify(cfgBody)).not.toContain(WP_CONFIG.cms_app_password);

    /* 4. Generate plan for the next odd month → starter rotation produces a page_create. */
    const planMonth = nextOddMonth(0);
    const planRes = await adminApi.post(`/api/rankflow/clients/${clientId}/generate-plan`, {
      data: { month: planMonth },
    });
    expect(planRes.ok(), `generate-plan failed: ${await planRes.text()}`).toBeTruthy();

    const tasksRes = await adminApi.get(`/api/rankflow/clients/${clientId}/tasks`);
    const tasks = await tasksRes.json();
    const pageCreate = tasks.find((t: any) => t.type === "page_create" && t.content_draft_id);
    expect(pageCreate, "starter plan should produce a page_create with a linked draft").toBeTruthy();
    articleDraftId = pageCreate.content_draft_id;

    /* 5. Generate article body synchronously. */
    const regen = await adminApi.post(`/api/admin/contentflow/drafts/${articleDraftId}/regenerate-article`);
    expect(regen.ok(), `regenerate failed: ${await regen.text()}`).toBeTruthy();

    /* 6. Approve. */
    const approve = await adminApi.post(`/api/admin/contentflow/drafts/${articleDraftId}/approve`, {
      data: { notes: "PW Sprint 4 approve" },
    });
    expect(approve.ok()).toBeTruthy();

    /* 7. Publish (defaults to WP status='draft'). */
    const pub = await adminApi.post(`/api/admin/contentflow/drafts/${articleDraftId}/publish`, {});
    expect(pub.ok(), `publish failed: ${await pub.text()}`).toBeTruthy();
    const pubBody = await pub.json();
    expect(pubBody.ok).toBe(true);
    expect(pubBody.post_id).toBeGreaterThan(0);
    expect(pubBody.post_url).toMatch(/^https?:\/\//);
    expect(pubBody.wp_status).toBe("draft");

    /* 8. Draft now status='published' with metadata.wordpress + target_url set. */
    const detail = await adminApi.get(`/api/admin/contentflow/drafts/${articleDraftId}`);
    expect(detail.ok()).toBeTruthy();
    const { draft } = await detail.json();
    expect(draft.status).toBe("published");
    expect(draft.target_url).toBe(pubBody.post_url);
    expect(draft.metadata?.wordpress?.post_id).toBe(pubBody.post_id);
    expect(draft.metadata?.wordpress?.post_url).toBe(pubBody.post_url);
    expect(draft.metadata?.wordpress?.published_at).toBeTruthy();
  });

  test("P4-2 — rejected draft cannot publish (returns 409)", async ({ adminApi }) => {
    /* Reuse the same client; generate a second plan in another odd month. */
    const secondMonth = nextOddMonth(2);
    const planRes = await adminApi.post(`/api/rankflow/clients/${clientId}/generate-plan`, {
      data: { month: secondMonth },
    });
    expect(planRes.ok(), `2nd plan failed: ${await planRes.text()}`).toBeTruthy();

    const tasksRes = await adminApi.get(`/api/rankflow/clients/${clientId}/tasks`);
    const tasks = await tasksRes.json();
    const second = tasks.find(
      (t: any) =>
        t.type === "page_create" &&
        t.content_draft_id &&
        t.content_draft_id !== articleDraftId,
    );
    expect(second, "second plan should produce a fresh draft").toBeTruthy();
    const secondDraftId = second.content_draft_id;

    /* Generate body, then reject it. */
    const regen = await adminApi.post(`/api/admin/contentflow/drafts/${secondDraftId}/regenerate-article`);
    expect(regen.ok()).toBeTruthy();
    const reject = await adminApi.post(`/api/admin/contentflow/drafts/${secondDraftId}/reject`, {
      data: { reason: "PW Sprint 4 reject for publish-block test" },
    });
    expect(reject.ok()).toBeTruthy();

    /* Publish must refuse with 409. */
    const pub = await adminApi.post(`/api/admin/contentflow/drafts/${secondDraftId}/publish`, {});
    expect(pub.status()).toBe(409);
    const body = await pub.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("not_approved");
  });

  test("P4-3 — missing WP credentials returns 422 graceful error", async ({ adminApi }) => {
    /* New client WITHOUT cms-config — only RankFlow profile with non-WP cms_type. */
    const id = testId();
    const cRes = await adminApi.post("/api/admin/crm/clients", {
      data: {
        business_name: `WP NoCreds PW ${id}`,
        contact_name: "PW NoCreds",
        contact_email: `test-${id}@example.com`,
        contact_phone: "416-555-0502",
        trade_type: "plumber",
        status: "lead",
        source: "manual",
      },
    });
    expect(cRes.ok()).toBeTruthy();
    unconfiguredClientId = (await cRes.json()).id;

    // Profile WITHOUT cms_type=wordpress + WITHOUT credentials.wordpress.
    const profile = { ...STARTER_PROFILE, cms_type: null };
    delete (profile as any).cms_type;
    const pRes = await adminApi.put(`/api/rankflow/clients/${unconfiguredClientId}/profile`, {
      data: { ...STARTER_PROFILE, cms_type: undefined },
    });
    expect(pRes.ok()).toBeTruthy();

    const planMonth = nextOddMonth(0);
    const planRes = await adminApi.post(`/api/rankflow/clients/${unconfiguredClientId}/generate-plan`, {
      data: { month: planMonth },
    });
    expect(planRes.ok()).toBeTruthy();

    const tasks = await (await adminApi.get(`/api/rankflow/clients/${unconfiguredClientId}/tasks`)).json();
    const pageCreate = tasks.find((t: any) => t.type === "page_create" && t.content_draft_id);
    expect(pageCreate).toBeTruthy();
    unconfiguredArticleDraftId = pageCreate.content_draft_id;

    /* Generate body + approve. */
    const regen = await adminApi.post(`/api/admin/contentflow/drafts/${unconfiguredArticleDraftId}/regenerate-article`);
    expect(regen.ok()).toBeTruthy();
    const approve = await adminApi.post(`/api/admin/contentflow/drafts/${unconfiguredArticleDraftId}/approve`, {
      data: { notes: "PW Sprint 4 approve no-creds" },
    });
    expect(approve.ok()).toBeTruthy();

    /* Publish must refuse with 422 (cms_type / missing creds). */
    const pub = await adminApi.post(`/api/admin/contentflow/drafts/${unconfiguredArticleDraftId}/publish`, {});
    expect(pub.status()).toBe(422);
    const body = await pub.json();
    expect(body.ok).toBe(false);
    // Must be one of the misconfiguration reasons — never wp_error / network_error.
    expect(["wrong_cms_type", "missing_credentials", "no_profile"]).toContain(body.reason);
  });

  test("P4-4 — publish-status endpoint reports 'published' for the published draft", async ({ adminApi }) => {
    const res = await adminApi.get(`/api/admin/contentflow/drafts/${articleDraftId}/publish-status`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.state).toBe("published");
    expect(body.post_url).toMatch(/^https?:\/\//);
    expect(body.post_id).toBeGreaterThan(0);

    /* Cross-check: the unconfigured draft reports 'not_configured'. */
    const res2 = await adminApi.get(`/api/admin/contentflow/drafts/${unconfiguredArticleDraftId}/publish-status`);
    expect(res2.ok()).toBeTruthy();
    const body2 = await res2.json();
    expect(body2.state).toBe("not_configured");
  });

  test("P4-5 — secret hygiene: cms_app_password is never returned, never present in any payload", async ({ adminApi }) => {
    /* GET profile → must not include the plaintext password anywhere. */
    const prof = await adminApi.get(`/api/rankflow/clients/${clientId}/profile`);
    expect(prof.ok()).toBeTruthy();
    const profText = await prof.text();
    expect(profText).not.toContain(WP_CONFIG.cms_app_password);

    /* GET draft detail → metadata must not include any password material. */
    const detail = await adminApi.get(`/api/admin/contentflow/drafts/${articleDraftId}`);
    expect(detail.ok()).toBeTruthy();
    const detailText = await detail.text();
    expect(detailText).not.toContain(WP_CONFIG.cms_app_password);

    /* GET publish-status → must not leak. */
    const status = await adminApi.get(`/api/admin/contentflow/drafts/${articleDraftId}/publish-status`);
    expect(status.ok()).toBeTruthy();
    const statusText = await status.text();
    expect(statusText).not.toContain(WP_CONFIG.cms_app_password);
  });

  test("P4-6 — WP error from upstream is surfaced as 502 and persisted on the draft", async ({ adminApi }) => {
    /* Force the WP mock to return 500 by setting the title prefix. We
     * cannot mutate the title via the publish endpoint, so we manipulate
     * the existing draft body via a regenerate step is not viable —
     * instead, set the draft.title to start with FAIL_WP_500 directly via
     * a fresh draft. Use the second-plan reject flow's draft (which has
     * a body but is rejected) — but rejected drafts can't publish, so
     * instead we use a NEW client + approved + retitle via direct DB.
     *
     * Simplest path: temporarily monkey-patch this draft's title in DB
     * to start with the failure trigger, fire publish, assert 502.
     *
     * Note: this DB write only flips a tiny title on a test-owned row.
     */
    /* Find the rejected draft from P4-2 — we'll re-approve it for this test. */
    // Actually use P4-1's published draft? No — that's terminal. We need
    // an approved draft. Generate a third plan.
    const thirdMonth = nextOddMonth(4);
    const planRes = await adminApi.post(`/api/rankflow/clients/${clientId}/generate-plan`, {
      data: { month: thirdMonth },
    });
    expect(planRes.ok(), `3rd plan failed: ${await planRes.text()}`).toBeTruthy();
    const tasks = await (await adminApi.get(`/api/rankflow/clients/${clientId}/tasks`)).json();
    const fresh = tasks.find(
      (t: any) =>
        t.type === "page_create" &&
        t.content_draft_id &&
        t.content_draft_id !== articleDraftId,
    );
    // The reject-test draft from P4-2 will also match unless we filter by status.
    // Find the most recent page_create whose draft is in 'draft' state.
    const queue = await (await adminApi.get(
      `/api/admin/contentflow/queue?client_id=${clientId}&surface=rankflow&kind=article&status=draft`,
    )).json();
    const target = queue.drafts.find((d: any) => d.id !== articleDraftId);
    expect(target, "should have a fresh draft draft to manipulate").toBeTruthy();
    const errDraftId = target.id;

    await pool.query(
      `UPDATE content_drafts SET title = 'FAIL_WP_500 ' || COALESCE(title, ''), status = 'approved' WHERE id = $1`,
      [errDraftId],
    );

    const pub = await adminApi.post(`/api/admin/contentflow/drafts/${errDraftId}/publish`, {});
    expect(pub.status(), `expected 502, got body: ${await pub.text()}`).toBe(502);
    const body = await pub.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("wp_error");

    /* Failure persisted on the draft; status remains 'approved' so retry works. */
    const after = await (await adminApi.get(`/api/admin/contentflow/drafts/${errDraftId}`)).json();
    expect(after.draft.status).toBe("approved");
    expect(after.draft.metadata?.wordpress?.error).toBeTruthy();
  });
});
