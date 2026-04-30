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
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ESM-compatible __dirname (Playwright runs spec files as ES modules).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

/* Sprint 8: tests share `clientId` / `articleDraftId` via module-scope
 * `let`s set in P4-1 and consumed by P4-4..P4-9. Serial mode pins them
 * all to the same worker so state survives across the suite. Without
 * this, Playwright's worker distribution (more aggressive once total
 * test count crossed ~60) split Sprint 4 across processes — each
 * worker started with clientId=0 → cascade of P4-* failures. */
test.describe.configure({ mode: "serial" });

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

    // Generate body so the publisher gets past the missing_body short-circuit
    // and actually reaches the WP mock — only then can we exercise wp_error.
    const regen = await adminApi.post(`/api/admin/contentflow/drafts/${errDraftId}/regenerate-article`);
    expect(regen.ok(), `regenerate failed for err draft: ${await regen.text()}`).toBeTruthy();

    // Flip title to the failure-trigger prefix and approve in one step.
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

  test("P4-7 — dev WP mock requires Authorization header (401 on anonymous)", async ({ playwright }) => {
    /* The mock is mounted at /api/__dev/wp-mock — no admin gate (the
     * publisher hits it with WP HTTP Basic Auth, not an admin session
     * cookie). The mock must still reject anonymous callers, so a real
     * WP-imitator can't be exercised by random visitors in dev. */
    const anon = await playwright.request.newContext({ baseURL: BASE_URL });
    const res = await anon.post("/api/__dev/wp-mock/wp-json/wp/v2/posts", {
      data: { title: "anon", content: "x", status: "draft" },
    });
    expect(res.status(), "anonymous POST must return 401").toBe(401);
    const body = await res.json();
    expect(body.code).toBe("rest_not_logged_in");
    await anon.dispose();
  });

  test("P4-9 — race: late-arriving generateArticleBody does NOT wipe metadata.wordpress written by publish", async ({ adminApi }) => {
    /* Reproduces the Sprint 4 race condition surfaced during integration:
     *   1. Plan generation fires background generateArticleBody (~10s).
     *   2. Admin approves + publishes — metadata.wordpress is written.
     *   3. The late-arriving generation finishes and writes back metadata
     *      from a stale snapshot, wiping the wordpress key.
     *
     * This test simulates step 3 explicitly by calling regenerate-article
     * AFTER the publish has populated metadata.wordpress. The fixed
     * generateArticleBody must re-read fresh metadata immediately before
     * its UPDATE, preserving the wordpress key (and any other concurrent
     * write). It must also NOT downgrade an already-published draft back
     * to status='draft'. */
    expect(articleDraftId, "P4-1 should have established a published draft").toBeTruthy();

    /* Confirm starting state: draft is published with metadata.wordpress set. */
    const before = await (await adminApi.get(`/api/admin/contentflow/drafts/${articleDraftId}`)).json();
    expect(before.draft.status).toBe("published");
    expect(before.draft.metadata?.wordpress?.post_url).toBeTruthy();
    const wpBefore = before.draft.metadata.wordpress;

    /* Run another generateArticleBody pass — this stand-in for the late-
     * arriving background gen reads metadata, calls Anthropic (~10s), and
     * writes metadata back. The fix re-reads metadata at write time. */
    const regen = await adminApi.post(
      `/api/admin/contentflow/drafts/${articleDraftId}/regenerate-article`,
    );
    expect(regen.ok(), `regenerate after publish failed: ${await regen.text()}`).toBeTruthy();

    /* metadata.wordpress MUST still be present. If the fix is missing,
     * the regenerate would have clobbered the wordpress key. */
    const after = await (await adminApi.get(`/api/admin/contentflow/drafts/${articleDraftId}`)).json();
    expect(after.draft.metadata?.wordpress?.post_url, "wordpress.post_url must survive a concurrent generateArticleBody").toBe(wpBefore.post_url);
    expect(after.draft.metadata?.wordpress?.post_id).toBe(wpBefore.post_id);
    /* Status must NOT downgrade from 'published' back to 'draft'. */
    expect(after.draft.status, "regenerate must not downgrade an already-published draft").toBe("published");
  });

  test("P4-8 — static guarantee: dev WP mock is registered ONLY inside the triple-gated dev block", async () => {
    /* This is a structural assertion against the source file, not a
     * runtime check. Spinning up a real production-mode server in CI is
     * heavy; instead we lock in the lexical invariant that the mock route
     * appears AFTER the single dev-gate `if` and BEFORE its closing brace.
     * Sprint 8: the gate became `if (DEV_ROUTES_ENABLED) {` where the
     * constant is defined to require BOTH NODE_ENV !== "production" AND
     * DEV_TOOLS_ENABLED === "1". This test verifies both invariants. */
    const filePath = resolve(__dirname, "../../../server/routes/contentflowRoutes.ts");
    const src = readFileSync(filePath, "utf8");
    const lines = src.split("\n");

    // Sprint 8 — DEV_ROUTES_ENABLED definition must AND both gates.
    const defLine = lines.find((l) => l.includes("const DEV_ROUTES_ENABLED ="));
    const defBody =
      defLine && lines.slice(lines.indexOf(defLine), lines.indexOf(defLine) + 3).join(" ");
    expect(defBody, "DEV_ROUTES_ENABLED definition not found").toBeTruthy();
    expect(defBody!.includes('process.env.NODE_ENV !== "production"'), "DEV_ROUTES_ENABLED must check NODE_ENV").toBe(true);
    expect(defBody!.includes('process.env.DEV_TOOLS_ENABLED === "1"'), "DEV_ROUTES_ENABLED must require DEV_TOOLS_ENABLED=1").toBe(true);

    // Find the single dev gate.
    const gateIndices: number[] = [];
    lines.forEach((line, i) => {
      if (line.includes("if (DEV_ROUTES_ENABLED) {")) gateIndices.push(i);
    });
    expect(gateIndices.length, "expected exactly ONE DEV_ROUTES_ENABLED dev gate in contentflowRoutes.ts").toBe(1);
    const gateLine = gateIndices[0];

    // Walk forward, tracking brace depth from the gate's `{` to its matching `}`.
    let depth = 0;
    let started = false;
    let closeLine = -1;
    for (let i = gateLine; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === "{") {
          depth++;
          started = true;
        } else if (ch === "}") {
          depth--;
          if (started && depth === 0) {
            closeLine = i;
            break;
          }
        }
      }
      if (closeLine !== -1) break;
    }
    expect(closeLine, "could not locate matching `}` for the dev gate").toBeGreaterThan(gateLine);

    // Find the WP mock route registration line.
    const mockLineIndex = lines.findIndex((line) =>
      line.includes(`"/api/__dev/wp-mock/wp-json/wp/v2/posts"`),
    );
    expect(mockLineIndex, "WP mock route registration not found in source").toBeGreaterThan(-1);

    // The mock MUST be lexically inside the dev gate block.
    expect(mockLineIndex).toBeGreaterThan(gateLine);
    expect(mockLineIndex).toBeLessThan(closeLine);

    // Belt + braces: there should be exactly one occurrence of the mock
    // route path in the source (no second registration outside the gate).
    const occurrences = src.split(`"/api/__dev/wp-mock/wp-json/wp/v2/posts"`).length - 1;
    expect(occurrences, "WP mock path must appear exactly once in contentflowRoutes.ts").toBe(1);
  });
});
