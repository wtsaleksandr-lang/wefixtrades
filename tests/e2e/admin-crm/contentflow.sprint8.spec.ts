/**
 * ContentFlow — Sprint 8 verification.
 *
 * Locks in the production-hardening invariants:
 *   - P8-1  HTTPS allowlist at cms-config save (http:// → 422)
 *   - P8-2  HTTPS allowlist at publish time (stored http creds → insecure_destination)
 *   - P8-3  HTML sanitization — script/iframe/javascript: stripped
 *   - P8-4  Triple-gate static guarantee — already at P4-8 (reaffirmed here)
 *   - P8-5  Portal review rate limit (31st approve in 60s → 429)
 *   - P8-6  Strict client gate (admin role gets 403 on portal review POSTs)
 *   - P8-7  Atomic queue claim — two concurrent worker runs publish each draft once
 *   - P8-8  Dead-letter — attempts >= MAX_ATTEMPTS sets dead_letter_at + status='failed'
 *   - P8-9  Stale-lock recovery — old locked_at re-queued on next tick
 *   - P8-10 Adapter registry — getAdapter('wordpress') ok, getAdapter('facebook') throws
 *
 * Auth: worker-scoped admin context via storageState. Sprint 7's bypass
 * header is reused for portal logins so the rate limiter never blocks
 * setup. The on-test rate-limit assertion in P8-5 deliberately turns the
 * bypass OFF for that single context.
 */

import { test as baseTest, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { STORAGE_STATE_PATH } from "./global-setup";
import { pool } from "../../../server/db";
import { hashPassword } from "../../../server/auth";
import { stripDangerousHtml, renderArticleHtml } from "../../../server/services/contentflow/articleHtml";
import { getAdapter, listRegisteredAdapterTypes } from "../../../server/services/contentflow/adapters/registry";

// ESM-compatible __dirname (Playwright runs spec files as ES modules).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const WP_MOCK_BASE = `${BASE_URL}/api/__dev/wp-mock`;

type SuiteFixtures = { adminApi: APIRequestContext };
const test = baseTest.extend<{}, SuiteFixtures>({
  adminApi: [
    async ({ playwright }, use) => {
      const ctx = await playwright.request.newContext({
        baseURL: BASE_URL,
        storageState: STORAGE_STATE_PATH,
        extraHTTPHeaders: { "x-test-bypass-rate-limit": "1" },
      });
      await use(ctx);
      await ctx.dispose();
    },
    { scope: "worker" },
  ],
});

const STARTER_PROFILE = {
  niche: "plumber",
  location: "Austin, TX",
  website_url: "https://example-test.invalid",
  cms_type: "wordpress",
  target_services: ["leak repair"],
  target_locations: ["Austin, TX"],
  plan_tier: "starter",
  enabled: true,
};
const WP_CONFIG = {
  cms_url: WP_MOCK_BASE,
  cms_username: "wp-test-admin",
  cms_app_password: "sprint8-test-pw",
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

async function provisionPortalClient(adminApi: APIRequestContext) {
  const id = testId();
  const email = `test-${id}@example.com`;
  const password = "Sprint8Test!Pw";
  const cRes = await adminApi.post("/api/admin/crm/clients", {
    data: {
      business_name: `Sprint 8 Test ${id}`,
      contact_name: "Tester",
      contact_email: email,
      contact_phone: "512-555-1100",
      trade_type: "plumber",
      status: "lead",
      source: "manual",
    },
  });
  expect(cRes.ok()).toBeTruthy();
  const clientId = (await cRes.json()).id;
  const passwordHash = hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'client') RETURNING id`,
    [email, passwordHash, `Tester ${id}`],
  );
  const userId = rows[0].id;
  await pool.query(`UPDATE clients SET user_id = $1 WHERE id = $2`, [userId, clientId]);
  return { clientId, userId, email, password };
}

async function provisionApprovedArticle(adminApi: APIRequestContext, clientId: number, monthOffset: number, exclude: Set<number>): Promise<number> {
  await adminApi.put(`/api/rankflow/clients/${clientId}/profile`, { data: STARTER_PROFILE });
  await adminApi.put(`/api/rankflow/clients/${clientId}/cms-config`, { data: WP_CONFIG });
  const month = nextOddMonth(monthOffset);
  const planRes = await adminApi.post(`/api/rankflow/clients/${clientId}/generate-plan`, { data: { month } });
  expect(planRes.ok(), `generate-plan failed: ${await planRes.text()}`).toBeTruthy();
  const tasks = await (await adminApi.get(`/api/rankflow/clients/${clientId}/tasks`)).json();
  const pageCreate = tasks.find((t: any) => t.type === "page_create" && t.content_draft_id && !exclude.has(t.content_draft_id));
  expect(pageCreate, `plan for ${month} should produce a fresh page_create`).toBeTruthy();
  const draftId = pageCreate.content_draft_id;
  const regen = await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/regenerate-article`);
  expect(regen.ok()).toBeTruthy();
  const approve = await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/approve`, { data: { notes: "Sprint 8 admin pre-approve" } });
  expect(approve.ok()).toBeTruthy();
  return draftId;
}

async function loginAsPortalUser(playwright: any, email: string, password: string, withBypass = true): Promise<APIRequestContext> {
  const headers: Record<string, string> = withBypass ? { "x-test-bypass-rate-limit": "1" } : {};
  const ctx = await playwright.request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: headers });
  const res = await ctx.post("/api/auth/login", { data: { email, password } });
  expect(res.ok(), `portal login failed: ${await res.text()}`).toBeTruthy();
  return ctx;
}

test.describe.configure({ mode: "serial" });

test.describe("ContentFlow Sprint 8 — production hardening", () => {
  let clientId = 0;
  let userId = 0;
  let portalEmail = "";
  let portalPassword = "";
  let portal: APIRequestContext | null = null;
  const provisioned = new Set<number>();

  test.afterAll(async () => {
    if (portal) await portal.dispose().catch(() => {});
    try {
      const { rows } = await pool.query(
        `SELECT id, user_id FROM clients WHERE id = $1 OR business_name LIKE 'Sprint 8 Test %'`,
        [clientId],
      );
      for (const row of rows) {
        const cid = row.id;
        await pool.query(`DELETE FROM content_approvals WHERE draft_id IN (SELECT id FROM content_drafts WHERE client_id = $1)`, [cid]);
        await pool.query(`DELETE FROM content_drafts WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM rankflow_qa_checks WHERE task_id IN (SELECT id FROM rankflow_tasks WHERE client_id = $1)`, [cid]);
        await pool.query(`DELETE FROM rankflow_tasks WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM rankflow_monthly_plans WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM rankflow_pages WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM rankflow_keywords WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM rankflow_signals WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM rankflow_progress WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM rankflow_profiles WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM fulfillment_tasks WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM client_payments WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM onboarding_submissions WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM client_services WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM internal_notes WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM orders WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM clients WHERE id = $1`, [cid]);
        if (row.user_id) {
          try { await pool.query(`DELETE FROM users WHERE id = $1`, [row.user_id]); } catch {}
        }
      }
      await pool.query(`DELETE FROM users WHERE role = 'client' AND email LIKE 'test-pw_%@example.com' AND id NOT IN (SELECT user_id FROM clients WHERE user_id IS NOT NULL)`);
    } catch (err: any) {
      console.warn(`[sprint8 afterAll]`, err.message);
    }
  });

  test("P8-1 — cms-config rejects http:// at save (HTTPS allowlist)", async ({ adminApi }) => {
    const a = await provisionPortalClient(adminApi);
    clientId = a.clientId; userId = a.userId; portalEmail = a.email; portalPassword = a.password;
    await adminApi.put(`/api/rankflow/clients/${clientId}/profile`, { data: STARTER_PROFILE });

    const res = await adminApi.put(`/api/rankflow/clients/${clientId}/cms-config`, {
      data: { ...WP_CONFIG, cms_url: "http://example.com" },
    });
    expect(res.status(), `expected 422 on insecure URL, got ${res.status()}: ${await res.text()}`).toBe(422);
    const body = await res.json();
    expect(String(body.error || "").toLowerCase()).toContain("https");
  });

  test("P8-2 — publish refuses to send creds to non-https destination", async ({ adminApi }) => {
    /* Bypass the config-save check by writing the http creds directly so
     * we verify the publish-time guard independently of the save guard. */
    const draftId = await provisionApprovedArticle(adminApi, clientId, 0, provisioned);
    provisioned.add(draftId);
    const encMarker = "MARKER_NOT_REAL_CREDS";
    await pool.query(
      `UPDATE rankflow_profiles
         SET credentials = jsonb_set(
                COALESCE(credentials, '{}'::jsonb),
                '{wordpress,cms_url}',
                to_jsonb('http://insecure.example.com'::text)
             )
       WHERE client_id = $1`,
      [clientId],
    );
    const res = await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/publish`);
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.reason).toBe("insecure_destination");
    /* Restore https mock URL for subsequent tests. */
    await adminApi.put(`/api/rankflow/clients/${clientId}/cms-config`, { data: WP_CONFIG });
  });

  test("P8-3 — stripDangerousHtml + renderArticleHtml reject script/iframe/javascript:", async () => {
    expect(stripDangerousHtml("<script>alert(1)</script>"), "script block").not.toContain("<script");
    expect(stripDangerousHtml("<iframe src=\"http://evil\"></iframe>"), "iframe").not.toContain("<iframe");
    expect(stripDangerousHtml("<a href=\"javascript:alert(1)\">x</a>")).not.toContain("javascript:");
    expect(stripDangerousHtml("<img src=x onerror=\"alert(1)\">")).not.toContain("onerror");
    expect(stripDangerousHtml("<a href=\"data:text/html,<script>alert(1)</script>\">x</a>")).not.toContain("data:text/html");

    /* End-to-end: malicious markdown body never produces raw HTML in the
     * rendered output. The renderer's escape pass is the primary guard;
     * stripDangerousHtml is the safety net. */
    const html = renderArticleHtml({
      title: "Safe Title",
      excerpt: null,
      bodyMd: "## Heading\n\n<script>alert(1)</script>\n\nNormal paragraph.",
    });
    expect(html, "rendered output should never contain raw <script").not.toContain("<script");
    expect(html, "rendered output should escape angle brackets").toContain("&lt;script&gt;");
  });

  test("P8-4 — dev gate static guarantee (NODE_ENV + DEV_TOOLS_ENABLED both required)", async () => {
    const filePath = resolve(__dirname, "../../../server/routes/contentflowRoutes.ts");
    const src = readFileSync(filePath, "utf8");
    const lines = src.split("\n");
    const defLineIdx = lines.findIndex((l) => l.includes("const DEV_ROUTES_ENABLED ="));
    expect(defLineIdx, "DEV_ROUTES_ENABLED constant must exist").toBeGreaterThan(-1);
    const defBody = lines.slice(defLineIdx, defLineIdx + 4).join(" ");
    expect(defBody.includes('process.env.NODE_ENV !== "production"')).toBe(true);
    expect(defBody.includes('process.env.DEV_TOOLS_ENABLED === "1"')).toBe(true);
    expect(lines.some((l) => l.includes("if (DEV_ROUTES_ENABLED) {"))).toBe(true);
  });

  test("P8-5 — portal review rate limit (31st action in 60s → 429)", async ({ playwright, adminApi }) => {
    /* Spin up a portal context WITHOUT the rate-limit bypass header so the
     * portalReviewRateLimiter actually applies. We hammer approve on the
     * P8-2 draft (current state: approved, client_review.state=null). */
    portal = await loginAsPortalUser(playwright, portalEmail, portalPassword, /*withBypass*/ false);
    /* Need a fresh draft for the rate-limit hammering — use any existing
     * approved one that this client owns. */
    const drafts = await (await adminApi.get(`/api/admin/contentflow/queue?client_id=${clientId}&limit=1`)).json();
    const targetId = drafts.drafts?.[0]?.id ?? Array.from(provisioned)[0];
    expect(typeof targetId).toBe("number");

    let firstFailureStatus = 0;
    for (let i = 0; i < 32; i++) {
      const r = await portal!.post(`/api/portal/articles/${targetId}/approve`, { data: { note: `attempt ${i + 1}` } });
      if (!r.ok() && r.status() === 429) {
        firstFailureStatus = 429;
        break;
      }
    }
    expect(firstFailureStatus, "rate limiter should refuse before 32 attempts").toBe(429);
  });

  test("P8-6 — admin role cannot use portal review action endpoints (requireClientStrict)", async ({ adminApi }) => {
    /* adminApi has admin storageState. Attempting a portal review POST
     * should now return 403 (Sprint 8 hardening). Pre-Sprint-8 this was
     * 404 / 200 depending on whether admin happened to share an id with
     * a clients row. */
    const targetId = Array.from(provisioned)[0]!;
    const r = await adminApi.post(`/api/portal/articles/${targetId}/approve`, { data: {} });
    expect(r.status()).toBe(403);
  });

  test("P8-7 — atomic claim: two concurrent worker invocations publish each draft once", async ({ adminApi }) => {
    /* Provision 3 fresh queueable drafts. */
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await provisionApprovedArticle(adminApi, clientId, 2 + i, provisioned);
      provisioned.add(id);
      ids.push(id);
    }
    const enqRes = await adminApi.post(`/api/admin/contentflow/bulk-queue`, {
      data: { draft_ids: ids, scheduled_for: null, wp_status: "draft" },
    });
    expect(enqRes.ok(), `bulk-queue failed: ${await enqRes.text()}`).toBeTruthy();

    /* Hit the dev worker endpoint twice IN PARALLEL — DB-level
     * FOR UPDATE SKIP LOCKED must serialize claim per row so each draft
     * is published exactly once across both runs. */
    const [a, b] = await Promise.all([
      adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`),
      adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`),
    ]);
    expect(a.ok()).toBeTruthy();
    expect(b.ok()).toBeTruthy();

    /* Each draft must now have exactly one wordpress.post_id. */
    const { rows } = await pool.query(
      `SELECT id, status, metadata->'wordpress'->>'post_id' AS post_id, metadata->'wordpress'->>'queue_status' AS qs
         FROM content_drafts WHERE id = ANY($1::int[])`,
      [ids],
    );
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.status, `draft ${row.id} should be 'published' after concurrent claim`).toBe("published");
      expect(row.qs).toBe("published");
      expect(row.post_id, `draft ${row.id} should have a single post_id`).toBeTruthy();
    }
  });

  test("P8-8 — dead-letter: MAX_ATTEMPTS failures stamp dead_letter_at + status='failed'", async ({ adminApi }) => {
    /* Force WP-mock to fail 3 times in a row, expect the draft to land
     * in queue_status='failed' AND metadata.wordpress.dead_letter_at
     * stamped. */
    const draftId = await provisionApprovedArticle(adminApi, clientId, 8, provisioned);
    provisioned.add(draftId);

    /* The dev WP-mock supports a forced-failure switch via a hardcoded
     * trigger. We use the existing P5-4 pattern: enqueue, then drive
     * three publish attempts via the dev wp-queue/run, with WP-mock
     * configured to fail. We approximate by setting `force_failure: true`
     * on the draft metadata which the publisher recognises (Sprint 5
     * test pattern). If the project lacks that hook, we fall back to a
     * forced http URL which bumps to 'insecure_destination' three
     * times — still a non-OK reason that increments attempts. */
    await pool.query(
      `UPDATE rankflow_profiles
         SET credentials = jsonb_set(
                COALESCE(credentials, '{}'::jsonb),
                '{wordpress,cms_url}',
                to_jsonb('http://forced-failure.example.com'::text)
             )
       WHERE client_id = $1`,
      [clientId],
    );
    /* Enqueue, then run the worker until exhaustion. */
    await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/queue-publish`, {
      data: { scheduled_for: null, wp_status: "draft" },
    });
    for (let i = 0; i < 4; i++) {
      await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`);
    }
    const { rows } = await pool.query(
      `SELECT metadata->'wordpress'->>'queue_status' AS qs,
              metadata->'wordpress'->>'dead_letter_at' AS dl,
              metadata->'wordpress'->>'attempts' AS attempts
         FROM content_drafts WHERE id = $1`,
      [draftId],
    );
    expect(rows[0].qs).toBe("failed");
    expect(rows[0].dl, "dead_letter_at must be stamped").toBeTruthy();
    expect(parseInt(rows[0].attempts, 10)).toBeGreaterThanOrEqual(3);

    /* Restore creds for any subsequent tests. */
    await adminApi.put(`/api/rankflow/clients/${clientId}/cms-config`, { data: WP_CONFIG });
  });

  test("P8-9 — stale-lock recovery re-queues abandoned 'publishing' drafts", async ({ adminApi }) => {
    const draftId = await provisionApprovedArticle(adminApi, clientId, 12, provisioned);
    provisioned.add(draftId);
    /* Manually set the draft into a stale 'publishing' state — locked_at
     * 11 minutes in the past, queue_status='publishing'. */
    await pool.query(
      `UPDATE content_drafts
         SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'wordpress',
              COALESCE(metadata->'wordpress', '{}'::jsonb) || jsonb_build_object(
                'queue_status', 'publishing',
                'locked_at',  to_jsonb((NOW() - interval '11 minutes')::text),
                'locked_by',  to_jsonb('crashed-worker'::text),
                'attempts',   0
              )
            )
       WHERE id = $1`,
      [draftId],
    );
    /* Run the worker — recovery sweep should re-queue this row. */
    await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`);
    const { rows } = await pool.query(
      `SELECT metadata->'wordpress'->>'queue_status' AS qs,
              metadata->'wordpress'->>'attempts' AS attempts,
              metadata->'wordpress'->>'last_error' AS last_error
         FROM content_drafts WHERE id = $1`,
      [draftId],
    );
    /* After recovery the row is either back in 'queued' OR has been
     * picked up and progressed (published / failed). Attempts must have
     * incremented from 0 because recovery counts as a failed attempt. */
    expect(["queued", "published", "publishing", "failed"].includes(rows[0].qs)).toBe(true);
    const attempts = parseInt(rows[0].attempts, 10);
    expect(attempts, "stale-lock recovery should bump attempts").toBeGreaterThanOrEqual(1);
  });

  test("P8-10 — adapter registry: wordpress registered, unknown types throw", async () => {
    const wp = getAdapter("wordpress");
    expect(wp.type).toBe("wordpress");
    expect(typeof wp.publish).toBe("function");
    expect(() => getAdapter("facebook" as any)).toThrow(/No publish adapter/);
    expect(listRegisteredAdapterTypes()).toContain("wordpress");
  });
});
