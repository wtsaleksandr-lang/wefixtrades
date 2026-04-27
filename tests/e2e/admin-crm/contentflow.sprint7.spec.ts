/**
 * ContentFlow — Sprint 7 verification.
 *
 * Verifies the review-notification email pipeline:
 *   - client approve / request-changes / reject → admin notification
 *     fired and metadata.client_review.admin_emailed_for set
 *   - admin re-approves a previously-changes-requested draft → client
 *     revision-ready email fires and revision token recorded
 *   - duplicate same-state decision → no duplicate email (flag stays
 *     pinned to that state)
 *   - cross-client ownership preserved (Sprint 6 boundary)
 *   - anonymous → 401
 *   - multi-recipient ADMIN_EMAIL parsing (helper export)
 *   - SMTP unavailable → no metadata flag written (dev simulation)
 *
 * Email send verification: relies on metadata flags (truthy after first
 * call, no-op after duplicate) plus the dev simulation endpoint for
 * the SMTP-down path. SMTP is configured on Replit in dev — actual
 * sends to ADMIN_EMAIL/INTERNAL_LEAD_EMAIL succeed (low volume; the
 * test client business name is clearly labeled 'Sprint 7 Email Test').
 */

import { test as baseTest, expect, type APIRequestContext } from "@playwright/test";
import { STORAGE_STATE_PATH } from "./global-setup";
import { pool } from "../../../server/db";
import { hashPassword } from "../../../server/auth";
import { resolveAdminRecipients } from "../../../server/lib/contentReviewEmail";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const WP_MOCK_BASE = `${BASE_URL}/api/__dev/wp-mock`;

type SuiteFixtures = { adminApi: APIRequestContext };
const test = baseTest.extend<{}, SuiteFixtures>({
  adminApi: [
    async ({ playwright }, use) => {
      const ctx = await playwright.request.newContext({ baseURL: BASE_URL, storageState: STORAGE_STATE_PATH });
      await use(ctx);
      await ctx.dispose();
    },
    { scope: "worker" },
  ],
});

const STARTER_PROFILE = {
  niche: "hvac",
  location: "Boise, ID",
  website_url: "https://example-test.invalid",
  cms_type: "wordpress",
  target_services: ["furnace install"],
  target_locations: ["Boise, ID"],
  plan_tier: "starter",
  enabled: true,
};
const WP_CONFIG = {
  cms_url: WP_MOCK_BASE,
  cms_username: "wp-test-admin",
  cms_app_password: "sprint7-email-app-pw",
  cms_default_status: "draft" as const,
};

function plusMonths(n: number): string { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 7); }
function nextOddMonth(offset = 0): string { let n = 1 + offset; for (let i = 0; i < 24; i++) { const c = plusMonths(n); if (parseInt(c.split("-")[1] || "0", 10) % 2 === 1) return c; n++; } return plusMonths(1); }
function testId() { return `pw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

async function provisionPortalClient(adminApi: APIRequestContext): Promise<{ clientId: number; userId: number; email: string; password: string }> {
  const id = testId();
  const email = `test-${id}@example.com`;
  const password = "Sprint7Test!Pw";
  const cRes = await adminApi.post("/api/admin/crm/clients", {
    data: {
      business_name: `Sprint 7 Email Test ${id}`,
      contact_name: "Email Tester",
      contact_email: email,
      contact_phone: "416-555-1100",
      trade_type: "hvac",
      status: "lead",
      source: "manual",
    },
  });
  expect(cRes.ok()).toBeTruthy();
  const clientId = (await cRes.json()).id;
  const passwordHash = hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'client') RETURNING id`,
    [email, passwordHash, `Email Tester ${id}`],
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
  const approve = await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/approve`, { data: { notes: "Sprint 7 admin pre-approve" } });
  expect(approve.ok()).toBeTruthy();
  return draftId;
}

async function loginAsPortalUser(playwright: any, email: string, password: string): Promise<APIRequestContext> {
  const ctx = await playwright.request.newContext({ baseURL: BASE_URL });
  const res = await ctx.post("/api/auth/login", { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  return ctx;
}

/** Wait for an async metadata flag to flip — admin/client emails are
 *  fire-and-forget, so we poll briefly after the API call. */
async function waitFor<T>(fn: () => Promise<T>, predicate: (v: T) => boolean, timeoutMs = 8000, intervalMs = 200): Promise<T> {
  const start = Date.now();
  let last: T = await fn();
  while (Date.now() - start < timeoutMs) {
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
    last = await fn();
  }
  return last;
}

async function readDraftMetadata(adminApi: APIRequestContext, draftId: number): Promise<any> {
  const res = await adminApi.get(`/api/admin/contentflow/drafts/${draftId}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).draft.metadata;
}

test.describe.configure({ mode: "serial" });

test.describe("ContentFlow Sprint 7 — review notification emails", () => {
  let clientAId = 0, clientBId = 0, userAId = 0, userBId = 0;
  let portalA: APIRequestContext | null = null, portalB: APIRequestContext | null = null;
  const provisioned = new Set<number>();
  let approvedDraftId = 0;
  let changesDraftId = 0;
  let rejectDraftId = 0;
  let revisionDraftId = 0;
  let smtpDownDraftId = 0;

  test.afterAll(async () => {
    if (portalA) await portalA.dispose().catch(() => {});
    if (portalB) await portalB.dispose().catch(() => {});
    for (const cid of [clientAId, clientBId].filter((n) => n > 0)) {
      try {
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
      } catch (err: any) { console.warn(`[sprint7 afterAll] client ${cid}:`, err.message); }
    }
    for (const uid of [userAId, userBId].filter((n) => n > 0)) {
      try { await pool.query(`DELETE FROM users WHERE id = $1`, [uid]); }
      catch (err: any) { console.warn(`[sprint7 afterAll] user ${uid}:`, err.message); }
    }
  });

  test("P7-1 — client approve fires admin notification (metadata flag set)", async ({ adminApi, playwright }) => {
    const a = await provisionPortalClient(adminApi);
    const b = await provisionPortalClient(adminApi);
    clientAId = a.clientId; userAId = a.userId; clientBId = b.clientId; userBId = b.userId;
    portalA = await loginAsPortalUser(playwright, a.email, a.password);
    portalB = await loginAsPortalUser(playwright, b.email, b.password);

    approvedDraftId = await provisionApprovedArticle(adminApi, clientAId, 0, provisioned);
    provisioned.add(approvedDraftId);

    const r = await portalA!.post(`/api/portal/articles/${approvedDraftId}/approve`, { data: { note: "Looks good." } });
    expect(r.ok()).toBeTruthy();

    /* Email is fire-and-forget — poll briefly until metadata flag flips. */
    const meta = await waitFor(
      () => readDraftMetadata(adminApi, approvedDraftId),
      (m) => m?.client_review?.admin_emailed_for === "approved",
    );
    expect(meta?.client_review?.admin_emailed_for).toBe("approved");
    expect(meta?.client_review?.admin_emailed_at).toBeTruthy();
    expect(meta?.client_review?.admin_emailed_recipient_count).toBeGreaterThanOrEqual(1);
  });

  test("P7-2 — request changes fires admin notification (note included via note field, not subject)", async ({ adminApi }) => {
    changesDraftId = await provisionApprovedArticle(adminApi, clientAId, 2, provisioned);
    provisioned.add(changesDraftId);

    const r = await portalA!.post(`/api/portal/articles/${changesDraftId}/request-changes`, {
      data: { note: "Soften the intro tone please." },
    });
    expect(r.ok()).toBeTruthy();

    const meta = await waitFor(
      () => readDraftMetadata(adminApi, changesDraftId),
      (m) => m?.client_review?.admin_emailed_for === "changes_requested",
    );
    expect(meta?.client_review?.admin_emailed_for).toBe("changes_requested");
    expect(meta?.client_review?.note).toBe("Soften the intro tone please.");
  });

  test("P7-3 — reject fires admin notification", async ({ adminApi }) => {
    rejectDraftId = await provisionApprovedArticle(adminApi, clientAId, 4, provisioned);
    provisioned.add(rejectDraftId);

    const r = await portalA!.post(`/api/portal/articles/${rejectDraftId}/reject`, { data: { note: "Off-brand." } });
    expect(r.ok()).toBeTruthy();

    const meta = await waitFor(
      () => readDraftMetadata(adminApi, rejectDraftId),
      (m) => m?.client_review?.admin_emailed_for === "rejected",
    );
    expect(meta?.client_review?.admin_emailed_for).toBe("rejected");
  });

  test("P7-4 — admin re-approves a changes_requested draft → client revision-ready email", async ({ adminApi }) => {
    /* changesDraftId is currently in client_review.state='changes_requested'.
     * Admin re-approves: should trigger revision-ready email + token. */
    revisionDraftId = changesDraftId;

    const r = await adminApi.post(`/api/admin/contentflow/drafts/${revisionDraftId}/approve`, {
      data: { notes: "Revised per client request" },
    });
    expect(r.ok()).toBeTruthy();

    const meta = await waitFor(
      () => readDraftMetadata(adminApi, revisionDraftId),
      (m) => !!m?.client_review?.client_revision_emailed_token,
    );
    expect(meta?.client_review?.client_revision_emailed_token).toBeTruthy();
    expect(meta?.client_review?.client_revision_emailed_at).toBeTruthy();
  });

  test("P7-5 — duplicate same-state client decision does not double-send", async ({ adminApi }) => {
    /* approvedDraftId already has admin_emailed_for='approved' from P7-1.
     * Calling approve again must NOT bump admin_emailed_at to a newer
     * timestamp — the email function short-circuits when state matches. */
    const before = await readDraftMetadata(adminApi, approvedDraftId);
    const beforeAt = before?.client_review?.admin_emailed_at;

    const r = await portalA!.post(`/api/portal/articles/${approvedDraftId}/approve`, { data: { note: "Still good." } });
    expect(r.ok()).toBeTruthy();

    /* Brief wait then verify timestamp unchanged. */
    await new Promise((res) => setTimeout(res, 1500));
    const after = await readDraftMetadata(adminApi, approvedDraftId);
    expect(after?.client_review?.admin_emailed_for).toBe("approved");
    expect(after?.client_review?.admin_emailed_at).toBe(beforeAt);
  });

  test("P7-6 — cross-client portal access still 404 (Sprint 6 boundary preserved)", async () => {
    const r1 = await portalB!.post(`/api/portal/articles/${approvedDraftId}/approve`, { data: {} });
    expect(r1.status()).toBe(404);
    const r2 = await portalB!.get(`/api/portal/articles/${approvedDraftId}`);
    expect(r2.status()).toBe(404);
  });

  test("P7-7 — anonymous request rejected with 401", async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: BASE_URL });
    const res = await anon.post(`/api/portal/articles/${approvedDraftId}/approve`, { data: {} });
    expect(res.status()).toBe(401);
    await anon.dispose();
  });

  test("P7-8 — resolveAdminRecipients parses comma-separated ADMIN_EMAIL", async () => {
    /* Pure unit-style coverage of the parser since this matters for
     * delivery to multiple admin inboxes. We override env, call, restore. */
    const original = { admin: process.env.ADMIN_EMAIL, lead: process.env.INTERNAL_LEAD_EMAIL };
    try {
      process.env.ADMIN_EMAIL = " ops@example.com , dev@example.com,founder@example.com ,, not-an-email ";
      process.env.INTERNAL_LEAD_EMAIL = "ignored@example.com";
      const result = resolveAdminRecipients();
      expect(result).toEqual(["ops@example.com", "dev@example.com", "founder@example.com"]);

      /* Empty ADMIN_EMAIL should fall back to INTERNAL_LEAD_EMAIL. */
      process.env.ADMIN_EMAIL = "";
      const fallback = resolveAdminRecipients();
      expect(fallback).toEqual(["ignored@example.com"]);

      /* Both unset → empty array. */
      delete process.env.ADMIN_EMAIL;
      delete process.env.INTERNAL_LEAD_EMAIL;
      expect(resolveAdminRecipients()).toEqual([]);
    } finally {
      if (original.admin === undefined) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = original.admin;
      if (original.lead === undefined) delete process.env.INTERNAL_LEAD_EMAIL;
      else process.env.INTERNAL_LEAD_EMAIL = original.lead;
    }
  });

  test("P7-9 — SMTP unavailable: no metadata flag written, function returns smtp_unavailable", async ({ adminApi }) => {
    /* Provision a fresh client decision so we can target a draft whose
     * admin_emailed_for is currently NOT 'approved' (i.e., never emailed
     * via the notification path). Since portal approve calls the live
     * email function (which writes the flag on success), we use a fresh
     * draft and exercise the dev endpoint directly with simulateSmtpDown. */
    smtpDownDraftId = await provisionApprovedArticle(adminApi, clientAId, 6, provisioned);
    provisioned.add(smtpDownDraftId);

    /* Confirm starting state — no flag yet. */
    const before = await readDraftMetadata(adminApi, smtpDownDraftId);
    expect(before?.client_review?.admin_emailed_for).toBeFalsy();

    /* Call the dev endpoint with simulateSmtpDown — should return
     * smtp_unavailable and leave the flag unset. */
    const res = await adminApi.post("/api/admin/contentflow/__dev/email-review-test", {
      data: { draftId: smtpDownDraftId, kind: "admin-approved", simulateSmtpDown: true },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("smtp_unavailable");

    const after = await readDraftMetadata(adminApi, smtpDownDraftId);
    expect(after?.client_review?.admin_emailed_for, "no flag should be written when SMTP is unavailable").toBeFalsy();
    expect(after?.client_review?.admin_emailed_at).toBeFalsy();
  });
});
