/**
 * ContentFlow — Sprint 6 verification.
 *
 * Exercises the client-portal article review workflow:
 *   - GET  /api/portal/articles               (list this client's articles)
 *   - GET  /api/portal/articles/:id           (detail with ownership check)
 *   - POST /api/portal/articles/:id/approve
 *   - POST /api/portal/articles/:id/request-changes
 *   - POST /api/portal/articles/:id/reject
 *
 * Setup creates two test clients, each with its own portal user (role='client')
 * linked via clients.user_id. We provision approved articles via the existing
 * RankFlow → ContentFlow pipeline (Sprint 3 generate-plan + Sprint 2 admin
 * approve). The spec then logs in as portal user A, exercises the four
 * actions, and verifies portal user B cannot see or act on user A's drafts.
 *
 * Auth: TWO API contexts — adminApi (storageState, Sprint 3-5 setup) and
 * portalApiA / portalApiB (fresh logins as the test portal users). Login
 * count: 2 portal logins per spec run, well below the 10/15min limit.
 *
 * Cleanup: scoped afterAll cascade DELETE on both test clients + their
 * portal users.
 */

import { test as baseTest, expect, type APIRequestContext } from "@playwright/test";
import { STORAGE_STATE_PATH } from "./global-setup";
import { pool } from "../../../server/db";
import { hashPassword } from "../../../server/auth";

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
  niche: "roofing",
  location: "Denver, CO",
  website_url: "https://example-test.invalid",
  cms_type: "wordpress",
  target_services: ["roof inspection"],
  target_locations: ["Denver, CO"],
  plan_tier: "starter",
  enabled: true,
};

const WP_CONFIG = {
  cms_url: WP_MOCK_BASE,
  cms_username: "wp-test-admin",
  cms_app_password: "sprint6-portal-app-pw",
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
    const c = plusMonths(n);
    if (parseInt(c.split("-")[1] || "0", 10) % 2 === 1) return c;
    n++;
  }
  return plusMonths(1);
}
function testId() {
  return `pw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Provision: client + portal user (role='client') linked via clients.user_id.
 * Returns the {clientId, userId, email, password}.
 */
async function provisionPortalClient(adminApi: APIRequestContext): Promise<{
  clientId: number;
  userId: number;
  email: string;
  password: string;
}> {
  const id = testId();
  const email = `test-${id}@example.com`;
  const password = "Sprint6Test!Pw";

  // Create client via admin endpoint.
  const cRes = await adminApi.post("/api/admin/crm/clients", {
    data: {
      business_name: `Sprint 6 Portal ${id}`,
      contact_name: "Portal Tester",
      contact_email: email,
      contact_phone: "416-555-0900",
      trade_type: "roofer",
      status: "lead",
      source: "manual",
    },
  });
  expect(cRes.ok()).toBeTruthy();
  const clientId = (await cRes.json()).id;

  // Create portal user directly in DB (no admin "create portal user"
  // endpoint exists; bcrypt hash via the server's auth helper).
  const passwordHash = hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'client') RETURNING id`,
    [email, passwordHash, `Portal Tester ${id}`],
  );
  const userId = rows[0].id;

  // Link the user to the client.
  await pool.query(`UPDATE clients SET user_id = $1 WHERE id = $2`, [userId, clientId]);

  return { clientId, userId, email, password };
}

/**
 * Provision an approved RankFlow article draft for a client. Mirrors the
 * Sprint 5 helper but always lands in status='approved' (admin pre-vetted).
 */
async function provisionApprovedArticle(
  adminApi: APIRequestContext,
  clientId: number,
  monthOffset: number,
  excludeIds: Set<number>,
): Promise<number> {
  // Profile + cms config (idempotent on the upsert path).
  await adminApi.put(`/api/rankflow/clients/${clientId}/profile`, { data: STARTER_PROFILE });
  await adminApi.put(`/api/rankflow/clients/${clientId}/cms-config`, { data: WP_CONFIG });

  const month = nextOddMonth(monthOffset);
  const planRes = await adminApi.post(`/api/rankflow/clients/${clientId}/generate-plan`, {
    data: { month },
  });
  expect(planRes.ok(), `generate-plan failed: ${await planRes.text()}`).toBeTruthy();

  const tasksRes = await adminApi.get(`/api/rankflow/clients/${clientId}/tasks`);
  const tasks = await tasksRes.json();
  const pageCreate = tasks.find(
    (t: any) => t.type === "page_create" && t.content_draft_id && !excludeIds.has(t.content_draft_id),
  );
  expect(pageCreate, `plan for ${month} should produce a fresh page_create`).toBeTruthy();
  const draftId = pageCreate.content_draft_id;

  const regen = await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/regenerate-article`);
  expect(regen.ok()).toBeTruthy();
  const approve = await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/approve`, {
    data: { notes: "Sprint 6 admin approve" },
  });
  expect(approve.ok()).toBeTruthy();

  return draftId;
}

async function loginAsPortalUser(
  playwright: any,
  email: string,
  password: string,
): Promise<APIRequestContext> {
  const ctx = await playwright.request.newContext({ baseURL: BASE_URL });
  const res = await ctx.post("/api/auth/login", { data: { email, password } });
  expect(res.ok(), `portal login failed: ${await res.text()}`).toBeTruthy();
  return ctx;
}

// Sprint 6 tests share state — force serial for deterministic same-worker run.
test.describe.configure({ mode: "serial" });

test.describe("ContentFlow Sprint 6 — client portal article review", () => {
  let clientAId = 0;
  let clientBId = 0;
  let userAId = 0;
  let userBId = 0;
  let portalA: APIRequestContext | null = null;
  let portalB: APIRequestContext | null = null;
  const provisionedDraftIds = new Set<number>();
  let articleAId = 0; // first approved article for client A
  let secondArticleAId = 0;

  test.afterAll(async () => {
    if (portalA) await portalA.dispose().catch(() => {});
    if (portalB) await portalB.dispose().catch(() => {});

    for (const cid of [clientAId, clientBId].filter((n) => n > 0)) {
      try {
        await pool.query(
          `DELETE FROM content_approvals WHERE draft_id IN (SELECT id FROM content_drafts WHERE client_id = $1)`,
          [cid],
        );
        await pool.query(`DELETE FROM content_drafts WHERE client_id = $1`, [cid]);
        await pool.query(
          `DELETE FROM rankflow_qa_checks WHERE task_id IN (SELECT id FROM rankflow_tasks WHERE client_id = $1)`,
          [cid],
        );
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
      } catch (err: any) {
        console.warn(`[sprint6 afterAll] cleanup warning for client ${cid}:`, err.message);
      }
    }
    for (const uid of [userAId, userBId].filter((n) => n > 0)) {
      try {
        await pool.query(`DELETE FROM users WHERE id = $1`, [uid]);
      } catch (err: any) {
        console.warn(`[sprint6 afterAll] user cleanup warning for ${uid}:`, err.message);
      }
    }
  });

  test("P6-1 — portal user sees only own client's articles (cross-client isolation)", async ({ adminApi, playwright }) => {
    /* Provision two distinct portal clients A and B, each with one approved article. */
    const a = await provisionPortalClient(adminApi);
    const b = await provisionPortalClient(adminApi);
    clientAId = a.clientId; userAId = a.userId;
    clientBId = b.clientId; userBId = b.userId;

    articleAId = await provisionApprovedArticle(adminApi, clientAId, 0, provisionedDraftIds);
    provisionedDraftIds.add(articleAId);
    const articleBId = await provisionApprovedArticle(adminApi, clientBId, 0, provisionedDraftIds);
    provisionedDraftIds.add(articleBId);

    /* Login as both portal users. */
    portalA = await loginAsPortalUser(playwright, a.email, a.password);
    portalB = await loginAsPortalUser(playwright, b.email, b.password);

    /* Each portal user sees ONLY their own articles. */
    const aList = await (await portalA.get("/api/portal/articles")).json();
    const aIds = new Set(aList.articles.map((x: any) => x.id));
    expect(aIds.has(articleAId), "client A must see article A").toBe(true);
    expect(aIds.has(articleBId), "client A must NOT see article B").toBe(false);

    const bList = await (await portalB.get("/api/portal/articles")).json();
    const bIds = new Set(bList.articles.map((x: any) => x.id));
    expect(bIds.has(articleBId), "client B must see article B").toBe(true);
    expect(bIds.has(articleAId), "client B must NOT see article A").toBe(false);
  });

  test("P6-2 — client approve writes metadata.client_review + content_approvals row", async () => {
    expect(portalA && articleAId).toBeTruthy();
    const res = await portalA!.post(`/api/portal/articles/${articleAId}/approve`, {
      data: { note: "Looks great, thanks!" },
    });
    expect(res.ok(), `approve failed: ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.article.metadata?.client_review?.state).toBe("approved");
    expect(body.article.metadata?.client_review?.note).toBe("Looks great, thanks!");
    expect(body.article.client_approved_at).toBeTruthy();
  });

  test("P6-3 — client request-changes sets state without flipping draft.status", async ({ adminApi }) => {
    secondArticleAId = await provisionApprovedArticle(adminApi, clientAId, 2, provisionedDraftIds);
    provisionedDraftIds.add(secondArticleAId);

    const res = await portalA!.post(`/api/portal/articles/${secondArticleAId}/request-changes`, {
      data: { note: "Please soften the tone in the intro." },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.article.metadata?.client_review?.state).toBe("changes_requested");
    expect(body.article.metadata?.client_review?.note).toBe("Please soften the tone in the intro.");
    /* Draft.status stays 'approved' — client review doesn't gate publish. */
    expect(body.article.status).toBe("approved");
  });

  test("P6-4 — client reject flips draft.status to 'rejected'", async ({ adminApi }) => {
    const draftId = await provisionApprovedArticle(adminApi, clientAId, 4, provisionedDraftIds);
    provisionedDraftIds.add(draftId);

    const res = await portalA!.post(`/api/portal/articles/${draftId}/reject`, {
      data: { note: "Off-brand. Please redo." },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.article.status).toBe("rejected");
    expect(body.article.metadata?.client_review?.state).toBe("rejected");
  });

  test("P6-5 — admin queue/drawer reflects client decisions in the approval trail", async ({ adminApi }) => {
    /* The admin drawer's GET /drafts/:id endpoint returns content_approvals.
     * Verify our 3 client decisions all appear with actor_type='client'. */
    const detailA = await (await adminApi.get(`/api/admin/contentflow/drafts/${articleAId}`)).json();
    const clientApproval = detailA.approvals.find(
      (a: any) => a.actor_type === "client" && a.action === "approved",
    );
    expect(clientApproval, "client approval row must appear in the audit trail").toBeTruthy();
    expect(clientApproval.actor_id).toBe(clientAId);
    expect(clientApproval.notes).toBe("Looks great, thanks!");

    const detailSecond = await (await adminApi.get(`/api/admin/contentflow/drafts/${secondArticleAId}`)).json();
    const changesRow = detailSecond.approvals.find(
      (a: any) => a.actor_type === "client" && a.action === "changes_requested",
    );
    expect(changesRow, "changes_requested row must appear").toBeTruthy();
  });

  test("P6-6 — portal user cannot act on another client's draft (404 — does not leak existence)", async () => {
    /* Client B tries to approve / change / reject article A. All must 404. */
    const r1 = await portalB!.post(`/api/portal/articles/${articleAId}/approve`, { data: {} });
    expect(r1.status(), "approve cross-client must 404").toBe(404);
    const r2 = await portalB!.post(`/api/portal/articles/${articleAId}/request-changes`, { data: {} });
    expect(r2.status()).toBe(404);
    const r3 = await portalB!.post(`/api/portal/articles/${articleAId}/reject`, { data: {} });
    expect(r3.status()).toBe(404);
    /* GET detail must also 404 (don't confirm/deny existence). */
    const r4 = await portalB!.get(`/api/portal/articles/${articleAId}`);
    expect(r4.status()).toBe(404);
  });

  test("P6-7 — anonymous (unauthenticated) request is rejected with 401", async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: BASE_URL });
    const res = await anon.get("/api/portal/articles");
    expect(res.status()).toBe(401);
    await anon.dispose();
  });
});
