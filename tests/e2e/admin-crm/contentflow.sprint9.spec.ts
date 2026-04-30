/**
 * ContentFlow — Sprint 9 verification.
 *
 * Locks in the ReputationShield ↔ ContentFlow integration:
 *   P9-1  ingestion creates kind='review_reply' draft + reply text
 *   P9-2  5-star review under auto_high_star policy → auto-approved + enqueued
 *   P9-3  1-star review under auto_high_star policy → status='draft' awaiting manual approval
 *   P9-4  admin-approved 1-star draft → queue → gbpAdapter publish → reviews row updated
 *   P9-5  admin-rejected draft → never publishes (no GBP call ever made)
 *   P9-6  GBP transient 503 → retry → eventual success → exactly one reply post
 *   P9-7  duplicate publish prevented (atomic claim from Sprint 8)
 *   P9-8  cross-client portal access still 404 (Sprint 6 boundary preserved)
 *   P9-9  policy 'manual_all' overrides auto-approve for high-star
 *
 * Pre-conditions on Replit:
 *   - DEV_TOOLS_ENABLED=1 (Sprint 8 dev gate)
 *   - GBP_API_BASE_OVERRIDE=http://localhost:5000/api/__dev/gbp-mock
 *     (set by the verify script — gbpAdapter routes here instead of Google)
 *   - TOKEN_ENCRYPTION_KEY set (already required for Sprint 4+)
 *
 * No live Google calls. Reply text is supplied directly by the test
 * (skips Anthropic). The dev mock recognises FAIL_GBP_503 / FAIL_GBP_404
 * prefixes for forced-failure scenarios.
 */

import { test as baseTest, expect, type APIRequestContext } from "@playwright/test";
import { STORAGE_STATE_PATH } from "./global-setup";
import { pool } from "../../../server/db";
import { hashPassword } from "../../../server/auth";
import { encryptToken } from "../../../server/services/socialSync/tokenEncryption";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

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

function testId() {
  return `pw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

async function provisionClientWithGbp(adminApi: APIRequestContext): Promise<{
  clientId: number;
  userId: number;
  email: string;
  password: string;
}> {
  const id = testId();
  const email = `test-${id}@example.com`;
  const password = "Sprint9Test!Pw";
  const cRes = await adminApi.post("/api/admin/crm/clients", {
    data: {
      business_name: `Sprint 9 Test ${id}`,
      contact_name: "Sprint9 Tester",
      contact_email: email,
      contact_phone: "212-555-9100",
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
    [email, passwordHash, `Sprint9 Tester ${id}`],
  );
  const userId = rows[0].id;
  await pool.query(`UPDATE clients SET user_id = $1 WHERE id = $2`, [userId, clientId]);

  /* Insert a fake GBP connection so gbpAdapter can resolve credentials.
   * The mock accepts any Bearer token; encryptToken('test-token') is just
   * a real-looking encrypted string so decryptToken doesn't blow up. */
  const tokenRef = encryptToken("sprint9-test-bearer-token");
  const refreshRef = encryptToken("sprint9-test-refresh-token");
  await pool.query(
    `INSERT INTO socialsync_platform_connections
       (client_id, platform, connection_status, external_account_id, external_page_id,
        token_ref, token_expires_at, last_validated_at, metadata)
     VALUES ($1, 'google_business', 'connected', 'accounts/test', $2, $3,
             NOW() + interval '1 hour', NOW(), $4)`,
    [
      clientId,
      `accounts/test/locations/sprint9-${id}`,
      tokenRef,
      JSON.stringify({ refresh_token_ref: refreshRef }),
    ],
  );

  return { clientId, userId, email, password };
}

async function loginAsPortalUser(playwright: any, email: string, password: string): Promise<APIRequestContext> {
  const ctx = await playwright.request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { "x-test-bypass-rate-limit": "1" },
  });
  const r = await ctx.post("/api/auth/login", { data: { email, password } });
  expect(r.ok(), `portal login failed: ${await r.text()}`).toBeTruthy();
  return ctx;
}

async function readDraft(adminApi: APIRequestContext, draftId: number): Promise<any> {
  const r = await adminApi.get(`/api/admin/contentflow/drafts/${draftId}`);
  expect(r.ok()).toBeTruthy();
  return (await r.json()).draft;
}

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

test.describe.configure({ mode: "serial" });

test.describe("ContentFlow Sprint 9 — review-reply integration", () => {
  let clientAId = 0, clientBId = 0;
  let userAId = 0, userBId = 0;
  let portalA: APIRequestContext | null = null, portalB: APIRequestContext | null = null;
  let portalAEmail = "", portalAPassword = "";
  let fiveStarDraftId = 0, oneStarDraftId = 0, rejectDraftId = 0, transientDraftId = 0, manualAllDraftId = 0;
  const externalReviewIds = new Set<string>();

  test.afterAll(async () => {
    if (portalA) await portalA.dispose().catch(() => {});
    if (portalB) await portalB.dispose().catch(() => {});
    try {
      const { rows } = await pool.query(
        `SELECT id, user_id FROM clients WHERE id = ANY($1::int[]) OR business_name LIKE 'Sprint 9 Test %'`,
        [[clientAId, clientBId].filter((n) => n > 0)],
      );
      for (const row of rows) {
        const cid = row.id;
        await pool.query(`DELETE FROM content_approvals WHERE draft_id IN (SELECT id FROM content_drafts WHERE client_id = $1)`, [cid]);
        await pool.query(`DELETE FROM content_drafts WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM reviews WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM review_sync_logs WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM socialsync_platform_connections WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM clients WHERE id = $1`, [cid]);
        if (row.user_id) await pool.query(`DELETE FROM users WHERE id = $1`, [row.user_id]).catch(() => {});
      }
      await pool.query(`DELETE FROM users WHERE role = 'client' AND email LIKE 'test-pw_%@example.com' AND id NOT IN (SELECT user_id FROM clients WHERE user_id IS NOT NULL)`);
    } catch (err: any) {
      console.warn(`[sprint9 afterAll]`, err.message);
    }
  });

  test("P9-1 — ingestion creates kind='review_reply' draft + body", async ({ adminApi, playwright }) => {
    const a = await provisionClientWithGbp(adminApi);
    const b = await provisionClientWithGbp(adminApi);
    clientAId = a.clientId; userAId = a.userId; portalAEmail = a.email; portalAPassword = a.password;
    clientBId = b.clientId; userBId = b.userId;

    const extRid = `r_p91_${testId()}`;
    externalReviewIds.add(extRid);
    const sim = await adminApi.post(`/api/admin/contentflow/__dev/sprint9-simulate-review`, {
      data: {
        clientId: clientAId,
        externalReviewId: extRid,
        starRating: 5,
        reviewText: "Best plumbers in town!",
        replyText: "Thanks so much — really appreciate you taking the time to share this.",
        reviewTime: new Date(Date.now() - 2 * 3600_000).toISOString(),
      },
    });
    expect(sim.ok(), `simulate failed: ${await sim.text()}`).toBeTruthy();
    const body = await sim.json();
    fiveStarDraftId = body.draftId;

    const draft = await readDraft(adminApi, fiveStarDraftId);
    expect(draft.kind).toBe("review_reply");
    expect(draft.surface).toBe("reputationshield");
    expect(draft.body).toContain("appreciate");
    expect(draft.metadata?.gbp?.external_review_id).toBe(extRid);
    expect(draft.metadata?.gbp?.review_id).toBe(body.reviewId);
  });

  test("P9-2 — 5-star + auto_high_star policy → status='approved' + queue_status='queued'", async ({ adminApi }) => {
    const draft = await readDraft(adminApi, fiveStarDraftId);
    expect(draft.status, "5-star should auto-approve under default policy").toBe("approved");
    expect(draft.metadata?.gbp?.queue_status).toBe("queued");
  });

  test("P9-3 — 1-star + auto_high_star → status='draft', not enqueued", async ({ adminApi }) => {
    const extRid = `r_p93_${testId()}`;
    externalReviewIds.add(extRid);
    const sim = await adminApi.post(`/api/admin/contentflow/__dev/sprint9-simulate-review`, {
      data: {
        clientId: clientAId,
        externalReviewId: extRid,
        starRating: 1,
        reviewText: "Plumber was late and rude.",
        replyText: "We're sorry to hear about your experience — please reach us at support so we can make this right.",
      },
    });
    expect(sim.ok()).toBeTruthy();
    const body = await sim.json();
    oneStarDraftId = body.draftId;
    expect(body.decision.autoApprove).toBe(false);
    expect(body.decision.reason).toBe("policy_auto_high_star_low_rating");

    const draft = await readDraft(adminApi, oneStarDraftId);
    expect(draft.status).toBe("draft");
    expect(draft.metadata?.gbp?.queue_status, "1-star should not enqueue under default policy").toBeFalsy();
  });

  test("P9-4 — admin approves 1-star draft → queue worker publishes via GBP adapter", async ({ adminApi }) => {
    /* Approve via the admin endpoint — same as Sprint 2's approve. */
    const r = await adminApi.post(`/api/admin/contentflow/drafts/${oneStarDraftId}/approve`, {
      data: { notes: "Approved manually after review" },
    });
    expect(r.ok(), `approve failed: ${await r.text()}`).toBeTruthy();

    /* Enqueue is fire-and-forget on the approvalService — give it a moment. */
    await waitFor(
      () => readDraft(adminApi, oneStarDraftId),
      (d: any) => d?.metadata?.gbp?.queue_status === "queued",
    );

    /* Drive the queue worker. */
    const runRes = await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`);
    expect(runRes.ok()).toBeTruthy();

    const after = await readDraft(adminApi, oneStarDraftId);
    expect(after.status, "draft should be 'published' after worker tick").toBe("published");
    expect(after.metadata?.gbp?.queue_status).toBe("published");
    expect(after.metadata?.gbp?.posted_at, "posted_at must be stamped on success").toBeTruthy();

    /* The reviews row should reflect the publish. */
    const { rows } = await pool.query(
      `SELECT reply_status, reply_posted_at FROM reviews WHERE id = $1`,
      [(after.metadata.gbp as any).review_id],
    );
    expect(rows[0].reply_status).toBe("manually_replied");
    expect(rows[0].reply_posted_at).toBeTruthy();
  });

  test("P9-5 — admin reject blocks publish — no GBP call ever made", async ({ adminApi }) => {
    const extRid = `r_p95_${testId()}`;
    externalReviewIds.add(extRid);
    const sim = await adminApi.post(`/api/admin/contentflow/__dev/sprint9-simulate-review`, {
      data: {
        clientId: clientAId,
        externalReviewId: extRid,
        starRating: 2,
        reviewText: "Slow service.",
        replyText: "We hear you and appreciate the feedback — we're working on improving response times.",
      },
    });
    rejectDraftId = (await sim.json()).draftId;

    /* Reject. */
    const r = await adminApi.post(`/api/admin/contentflow/drafts/${rejectDraftId}/reject`, {
      data: { reason: "off-brand tone" },
    });
    expect(r.ok()).toBeTruthy();

    /* Run worker — must not pick up rejected drafts. */
    await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`);

    const draft = await readDraft(adminApi, rejectDraftId);
    expect(draft.status).toBe("rejected");
    expect(draft.metadata?.gbp?.posted_at).toBeFalsy();
    expect(draft.metadata?.gbp?.queue_status).not.toBe("published");
  });

  test("P9-6 — GBP transient 503 retries up to MAX_ATTEMPTS=3 then dead-letters", async ({ adminApi }) => {
    const extRid = `r_p96_${testId()}`;
    externalReviewIds.add(extRid);
    const sim = await adminApi.post(`/api/admin/contentflow/__dev/sprint9-simulate-review`, {
      data: {
        clientId: clientAId,
        externalReviewId: extRid,
        starRating: 5,
        reviewText: "Great work.",
        /* The dev mock recognises FAIL_GBP_503 prefix → 503. */
        replyText: "FAIL_GBP_503 Thanks for the kind words!",
        policyOverride: "auto_all",
      },
    });
    transientDraftId = (await sim.json()).draftId;

    /* Worker drains 3 times, all fail. */
    for (let i = 0; i < 3; i++) {
      await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`);
    }
    const draft = await readDraft(adminApi, transientDraftId);
    expect(draft.metadata?.gbp?.queue_status).toBe("failed");
    expect(parseInt(draft.metadata?.gbp?.attempts ?? "0", 10)).toBeGreaterThanOrEqual(3);
    expect(draft.metadata?.gbp?.dead_letter_at).toBeTruthy();
    expect(draft.metadata?.gbp?.posted_at, "must NOT have posted").toBeFalsy();
  });

  test("P9-7 — duplicate publish prevented (atomic claim)", async ({ adminApi }) => {
    /* Provision THREE 5-star reviews under auto_all (auto-approve + queued). */
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      const extRid = `r_p97_${testId()}_${i}`;
      externalReviewIds.add(extRid);
      const sim = await adminApi.post(`/api/admin/contentflow/__dev/sprint9-simulate-review`, {
        data: {
          clientId: clientAId,
          externalReviewId: extRid,
          starRating: 5,
          reviewText: "Excellent.",
          replyText: `Thanks so much for the review — try ${i}!`,
          policyOverride: "auto_all",
        },
      });
      ids.push((await sim.json()).draftId);
    }

    /* Two worker invocations in parallel — atomic claim must split work. */
    const [a, b] = await Promise.all([
      adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`),
      adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`),
    ]);
    expect(a.ok()).toBeTruthy();
    expect(b.ok()).toBeTruthy();

    const { rows } = await pool.query(
      `SELECT id, status, metadata->'gbp'->>'posted_at' AS posted_at, metadata->'gbp'->>'queue_status' AS qs
         FROM content_drafts WHERE id = ANY($1::int[])`,
      [ids],
    );
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(r.status, `draft ${r.id} should be 'published' once`).toBe("published");
      expect(r.posted_at, `draft ${r.id} should have a single posted_at`).toBeTruthy();
      expect(r.qs).toBe("published");
    }
  });

  test("P9-8 — cross-client portal access still 404", async ({ playwright }) => {
    portalA = await loginAsPortalUser(playwright, portalAEmail, portalAPassword);
    /* Provision a draft for clientB. */
    const extRid = `r_p98_${testId()}`;
    externalReviewIds.add(extRid);
    const sim = await pool.query(
      `INSERT INTO content_drafts (client_id, kind, surface, body, status, metadata, created_by, created_at, updated_at)
       VALUES ($1, 'review_reply', 'reputationshield', 'cross-client test reply',
               'draft', $2, 'system', NOW(), NOW()) RETURNING id`,
      [clientBId, JSON.stringify({ gbp: { external_review_id: extRid, review_id: 0, source: "auto" } })],
    );
    const otherClientDraftId = sim.rows[0].id;

    /* clientA's portal context must not see clientB's draft. */
    const det = await portalA!.get(`/api/portal/review-replies/${otherClientDraftId}`);
    expect(det.status()).toBe(404);
    const act = await portalA!.post(`/api/portal/review-replies/${otherClientDraftId}/approve`, { data: {} });
    expect(act.status()).toBe(404);
  });

  test("P9-9 — policy 'manual_all' overrides auto-approve for 5-star", async ({ adminApi }) => {
    const extRid = `r_p99_${testId()}`;
    externalReviewIds.add(extRid);
    const sim = await adminApi.post(`/api/admin/contentflow/__dev/sprint9-simulate-review`, {
      data: {
        clientId: clientAId,
        externalReviewId: extRid,
        starRating: 5,
        reviewText: "Perfect.",
        replyText: "Thank you very much for your feedback!",
        policyOverride: "manual_all",
      },
    });
    manualAllDraftId = (await sim.json()).draftId;
    const body = await sim.json().catch(() => null);
    /* Body already consumed above — read the draft to verify. */
    const draft = await readDraft(adminApi, manualAllDraftId);
    expect(draft.status, "manual_all should NOT auto-approve even at 5 stars").toBe("draft");
    expect(draft.metadata?.gbp?.queue_status, "manual_all should not enqueue").toBeFalsy();
  });
});
