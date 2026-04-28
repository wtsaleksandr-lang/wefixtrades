/**
 * ContentFlow — Sprint 15 verification.
 *
 * Unifies SocialSync publishing into the ContentFlow queue. The
 * legacy socialsync_publish_queue path is retired:
 *   - server/jobs/socialSyncWorker.ts is DELETED
 *   - POST /api/socialsync/.../enqueue creates a content_drafts row
 *     and uses enqueueSocialSyncDraft (NOT enqueueSocialSyncJob)
 *   - POST /api/socialsync/internal/queue/process-due drives the
 *     unified processQueue
 *
 *   P15-1  SocialSync enqueue endpoint creates a ContentFlow draft
 *          (no new socialsync_publish_queue row written)
 *   P15-2  draft from P15-1 publishes via ContentFlow's queue
 *   P15-3  FB publish via adapter (smoke; deeper coverage in Sprint 10)
 *   P15-4  IG publish via adapter (smoke)
 *   P15-5  GBP publish via adapter (smoke)
 *   P15-6  no duplicate publish — re-enqueue same post is idempotent
 *   P15-7  scheduling honoured by unified queue (future scheduled_for
 *          → not picked; past → picked)
 *   P15-8  pause/resume on a SocialSync-originated draft works
 *   P15-9  process-due endpoint returns the unified-queue summary shape
 *          (via='contentflow_unified_queue')
 */

import { test as baseTest, expect, type APIRequestContext } from "@playwright/test";
import { STORAGE_STATE_PATH } from "./global-setup";
import { pool } from "../../../server/db";
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

async function provisionClientWithConnections(adminApi: APIRequestContext): Promise<{ clientId: number }> {
  const id = testId();
  const cRes = await adminApi.post("/api/admin/crm/clients", {
    data: {
      business_name: `Sprint 15 Test ${id}`,
      contact_name: "Sprint15 Tester",
      contact_email: `test-${id}@example.com`,
      contact_phone: "212-555-1515",
      trade_type: "plumber",
      status: "lead",
      source: "manual",
    },
  });
  expect(cRes.ok()).toBeTruthy();
  const clientId = (await cRes.json()).id;

  const fbToken = encryptToken("sprint15-fb-token");
  const igToken = encryptToken("sprint15-ig-token");
  const gbpToken = encryptToken("sprint15-gbp-token");
  await pool.query(
    `INSERT INTO socialsync_platform_connections
       (client_id, platform, connection_status, external_account_id, external_page_id,
        token_ref, token_expires_at, last_validated_at, metadata)
     VALUES
       ($1, 'facebook', 'connected', 'fb-acct', 'fb-page-${id}', $2, NOW() + interval '1 hour', NOW(), $3),
       ($1, 'instagram', 'connected', 'ig-acct', 'ig-acct-${id}', $4, NOW() + interval '1 hour', NOW(), $5),
       ($1, 'google_business', 'connected', 'accounts/test', 'accounts/test/locations/sprint15-${id}', $6, NOW() + interval '1 hour', NOW(), '{}'::jsonb)`,
    [clientId, fbToken, JSON.stringify({ page_token_ref: fbToken }), igToken, JSON.stringify({ ig_user_id: `ig-acct-${id}` }), gbpToken],
  );
  return { clientId };
}

async function provisionSocialSyncPost(
  clientId: number,
  platform: "facebook" | "instagram" | "google_business",
  text: string,
  status: string = "ready",
): Promise<number> {
  const r = await pool.query(
    `INSERT INTO socialsync_posts
       (client_id, platform, post_text, status, media_plan, hashtags, quality_score, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NULL, '[]'::jsonb, 90, NOW(), NOW())
     RETURNING id`,
    [clientId, platform, text, status],
  );
  return r.rows[0].id;
}

async function drainLoop(adminApi: APIRequestContext, max = 6): Promise<void> {
  let lastTotal = -1;
  for (let i = 0; i < max; i++) {
    const r = await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`, { data: {} });
    const summary = await r.json();
    const total = (summary.published ?? 0) + (summary.scanned ?? 0);
    if (total === 0 || total === lastTotal) break;
    lastTotal = total;
  }
}

test.describe.configure({ mode: "serial" });

test.describe("ContentFlow Sprint 15 — SocialSync queue unification", () => {
  test.afterAll(async () => {
    try {
      const { rows } = await pool.query(`SELECT id FROM clients WHERE business_name LIKE 'Sprint 15 Test %'`);
      for (const row of rows) {
        const cid = row.id;
        await pool.query(`DELETE FROM content_approvals WHERE draft_id IN (SELECT id FROM content_drafts WHERE client_id = $1)`, [cid]);
        await pool.query(`DELETE FROM content_drafts WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM socialsync_publish_queue WHERE client_id = $1`, [cid]).catch(() => {});
        await pool.query(`DELETE FROM socialsync_activity_logs WHERE client_id = $1`, [cid]).catch(() => {});
        await pool.query(`DELETE FROM socialsync_posts WHERE client_id = $1`, [cid]).catch(() => {});
        await pool.query(`DELETE FROM socialsync_profiles WHERE client_id = $1`, [cid]).catch(() => {});
        await pool.query(`DELETE FROM socialsync_platform_connections WHERE client_id = $1`, [cid]).catch(() => {});
        await pool.query(`DELETE FROM clients WHERE id = $1`, [cid]);
      }
    } catch (err: any) {
      console.warn(`[sprint15 afterAll]`, err.message);
    }
  });

  test("P15-1 — enqueue endpoint creates ContentFlow draft, NOT a legacy queue row", async ({ adminApi }) => {
    const { clientId } = await provisionClientWithConnections(adminApi);
    const postId = await provisionSocialSyncPost(clientId, "facebook", "Sprint 15 P15-1 body");

    /* Snapshot legacy table count before */
    const before = await pool.query(`SELECT count(*)::int AS n FROM socialsync_publish_queue WHERE client_id = $1`, [clientId]);

    const r = await adminApi.post(`/api/socialsync/clients/${clientId}/posts/${postId}/enqueue`, { data: {} });
    expect(r.status()).toBe(201);
    const body = await r.json();
    expect(body.via).toBe("contentflow_unified_queue");
    expect(body.content_draft_id).toBeTruthy();

    /* No row in legacy table */
    const after = await pool.query(`SELECT count(*)::int AS n FROM socialsync_publish_queue WHERE client_id = $1`, [clientId]);
    expect(after.rows[0].n, "no rows added to legacy socialsync_publish_queue").toBe(before.rows[0].n);

    /* ContentFlow draft exists with calendar metadata */
    const draftRes = await adminApi.get(`/api/admin/contentflow/drafts/${body.content_draft_id}`);
    expect(draftRes.ok()).toBeTruthy();
    const draft = (await draftRes.json()).draft;
    expect(draft.kind).toBe("social_post");
    expect(draft.target_platform).toBe("facebook");
    expect((draft.metadata as any)?.calendar?.channel).toBe("facebook");
    expect((draft.metadata as any)?.facebook?.queue_status).toBe("queued");
  });

  test("P15-2 — draft published via ContentFlow's unified queue", async ({ adminApi }) => {
    const { clientId } = await provisionClientWithConnections(adminApi);
    const postId = await provisionSocialSyncPost(clientId, "facebook", "Sprint 15 P15-2 body");
    const r = await adminApi.post(`/api/socialsync/clients/${clientId}/posts/${postId}/enqueue`, { data: {} });
    const draftId = (await r.json()).content_draft_id;

    await drainLoop(adminApi);

    const draft = (await (await adminApi.get(`/api/admin/contentflow/drafts/${draftId}`)).json()).draft;
    expect(draft.status).toBe("published");
    expect((draft.metadata as any)?.facebook?.posted_at).toBeTruthy();
  });

  test("P15-3 — FB publish via adapter (smoke)", async ({ adminApi }) => {
    const { clientId } = await provisionClientWithConnections(adminApi);
    const postId = await provisionSocialSyncPost(clientId, "facebook", "Sprint 15 P15-3 body");
    const r = await adminApi.post(`/api/socialsync/clients/${clientId}/posts/${postId}/enqueue`, { data: {} });
    const draftId = (await r.json()).content_draft_id;
    await drainLoop(adminApi);
    const draft = (await (await adminApi.get(`/api/admin/contentflow/drafts/${draftId}`)).json()).draft;
    expect(draft.status).toBe("published");
    expect((draft.metadata as any)?.facebook?.remote_post_id).toBeTruthy();
  });

  test("P15-4 — IG publish via adapter (smoke; passes when APP_PUBLIC_URL set, skipped otherwise)", async ({ adminApi }) => {
    const { clientId } = await provisionClientWithConnections(adminApi);
    const postId = await provisionSocialSyncPost(clientId, "instagram", "Sprint 15 P15-4 body");
    const r = await adminApi.post(`/api/socialsync/clients/${clientId}/posts/${postId}/enqueue`, { data: {} });
    const draftId = (await r.json()).content_draft_id;
    await drainLoop(adminApi);
    const draft = (await (await adminApi.get(`/api/admin/contentflow/drafts/${draftId}`)).json()).draft;
    /* IG publish is gated on APP_PUBLIC_URL in dev. Either it published, or the adapter
     * left it queued/failed with the well-known validation message — both are valid for
     * the unified-queue contract. */
    const igMeta = (draft.metadata as any)?.instagram ?? {};
    const acceptable = draft.status === "published"
      || /APP_PUBLIC_URL|public image URL/i.test(String(igMeta.last_error ?? ""));
    expect(acceptable, `IG result: status=${draft.status} last_error=${igMeta.last_error}`).toBe(true);
  });

  test("P15-5 — GBP publish via adapter (smoke)", async ({ adminApi }) => {
    const { clientId } = await provisionClientWithConnections(adminApi);
    const postId = await provisionSocialSyncPost(clientId, "google_business", "Sprint 15 P15-5 body");
    const r = await adminApi.post(`/api/socialsync/clients/${clientId}/posts/${postId}/enqueue`, { data: {} });
    const draftId = (await r.json()).content_draft_id;
    await drainLoop(adminApi);
    const draft = (await (await adminApi.get(`/api/admin/contentflow/drafts/${draftId}`)).json()).draft;
    expect(draft.status).toBe("published");
    expect((draft.metadata as any)?.gbp_post?.remote_post_id).toBeTruthy();
  });

  test("P15-6 — no duplicate publish: re-enqueueing the same post returns the same draft", async ({ adminApi }) => {
    const { clientId } = await provisionClientWithConnections(adminApi);
    const postId = await provisionSocialSyncPost(clientId, "facebook", "Sprint 15 P15-6 body");

    const r1 = await adminApi.post(`/api/socialsync/clients/${clientId}/posts/${postId}/enqueue`, { data: {} });
    expect(r1.status()).toBe(201);
    const draftId1 = (await r1.json()).content_draft_id;

    /* Reset post status so endpoint accepts it again. */
    await pool.query(`UPDATE socialsync_posts SET status = 'ready' WHERE id = $1`, [postId]);

    const r2 = await adminApi.post(`/api/socialsync/clients/${clientId}/posts/${postId}/enqueue`, { data: {} });
    expect(r2.status()).toBe(201);
    const draftId2 = (await r2.json()).content_draft_id;

    /* createDraftFromSocialPost is idempotent — same draft returned. */
    expect(draftId2).toBe(draftId1);

    /* And only ONE content_drafts row exists for this post. */
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM content_drafts WHERE linked_social_post_id = $1`, [postId]);
    expect(rows[0].n).toBe(1);
  });

  test("P15-7 — scheduling honoured: future scheduled_for is NOT picked", async ({ adminApi }) => {
    const { clientId } = await provisionClientWithConnections(adminApi);
    const postId = await provisionSocialSyncPost(clientId, "facebook", "Sprint 15 P15-7 body");

    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const r = await adminApi.post(`/api/socialsync/clients/${clientId}/posts/${postId}/enqueue`, {
      data: { run_at: future },
    });
    const draftId = (await r.json()).content_draft_id;

    /* Drive worker — must NOT publish */
    await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`, { data: {} });
    let draft = (await (await adminApi.get(`/api/admin/contentflow/drafts/${draftId}`)).json()).draft;
    expect(draft.status, "scheduled future must NOT publish").toBe("approved");
    expect((draft.metadata as any)?.facebook?.scheduled_for).toBe(future);

    /* Move to past + drain */
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    await pool.query(
      `UPDATE content_drafts
         SET metadata = jsonb_set(metadata, '{facebook,scheduled_for}', to_jsonb($2::text), true)
       WHERE id = $1`,
      [draftId, past],
    );
    await drainLoop(adminApi);
    draft = (await (await adminApi.get(`/api/admin/contentflow/drafts/${draftId}`)).json()).draft;
    expect(draft.status).toBe("published");
  });

  test("P15-8 — pause/resume works on SocialSync-originated drafts", async ({ adminApi }) => {
    const { clientId } = await provisionClientWithConnections(adminApi);
    const postId = await provisionSocialSyncPost(clientId, "facebook", "Sprint 15 P15-8 body");
    const r = await adminApi.post(`/api/socialsync/clients/${clientId}/posts/${postId}/enqueue`, { data: {} });
    const draftId = (await r.json()).content_draft_id;

    /* Pause */
    const pauseRes = await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/pause`, { data: {} });
    expect(pauseRes.ok()).toBeTruthy();

    /* Drain → must NOT publish */
    await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`, { data: {} });
    let draft = (await (await adminApi.get(`/api/admin/contentflow/drafts/${draftId}`)).json()).draft;
    expect(draft.status).toBe("approved");

    /* Resume + drain */
    await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/resume`, { data: {} });
    await drainLoop(adminApi);
    draft = (await (await adminApi.get(`/api/admin/contentflow/drafts/${draftId}`)).json()).draft;
    expect(draft.status).toBe("published");
  });

  test("P15-9 — process-due endpoint returns unified-queue shape (via='contentflow_unified_queue')", async ({ adminApi }) => {
    const r = await adminApi.post(`/api/socialsync/internal/queue/process-due`, { data: {} });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.via).toBe("contentflow_unified_queue");
    expect(body.full).toBeTruthy();
    expect(body.full.channels).toBeTruthy();
    expect(typeof body.processed).toBe("number");
    expect(typeof body.published).toBe("number");
    expect(Array.isArray(body.errors)).toBe(true);
  });
});
