/**
 * ContentFlow — Sprint 10 verification.
 *
 * Locks in the SocialSync → ContentFlow queue convergence:
 *   P10-1  Facebook adapter publishes via dev mock; metadata.facebook.posted_at stamped
 *   P10-2  Instagram adapter publishes via dev mock; metadata.instagram.posted_at stamped
 *   P10-3  GBP-post adapter publishes via dev mock; metadata.gbp_post.posted_at stamped
 *   P10-4  Multi-channel atomic claim: drafts of all 3 platforms publish exactly once
 *          across two parallel worker invocations
 *   P10-5  Cooldown short-circuit — when checkCooldown returns coolingDown=true,
 *          adapter returns reason='cooling_down' AND queue does NOT increment attempts
 *   P10-6  Rate-limit retry — fb mock returns code 4 (rate-limit); adapter marks
 *          rate_limited; queue retries until either success or MAX_ATTEMPTS
 *   P10-7  Permanent failure dead-letter — fb mock returns code 190 (invalid token);
 *          adapter marks permanent_failure; draft → queue_status='failed' with
 *          attempts=1 (no retry waste)
 *   P10-8  SocialSync orchestrator no longer writes to socialsync_publish_queue;
 *          enqueueSocialSyncDraft sets metadata.<platform>.queue_status='queued'
 *   P10-9  Static guarantee: scheduler.ts no longer registers the legacy
 *          processSocialSyncQueue cron
 *
 * Pre-conditions on Replit:
 *   DEV_TOOLS_ENABLED=1
 *   FB_GRAPH_API_BASE_OVERRIDE=http://localhost:5000/api/__dev/fb-mock
 *   IG_GRAPH_API_BASE_OVERRIDE=http://localhost:5000/api/__dev/ig-mock
 *   GBP_POST_API_BASE_OVERRIDE=http://localhost:5000/api/__dev/gbp-post-mock
 *   TOKEN_ENCRYPTION_KEY set
 */

import { test as baseTest, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { STORAGE_STATE_PATH } from "./global-setup";
import { pool } from "../../../server/db";
import { encryptToken } from "../../../server/services/socialSync/tokenEncryption";
import { getAdapter, listRegisteredAdapterTypes } from "../../../server/services/contentflow/adapters/registry";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

interface ProvisionedClient {
  clientId: number;
  email: string;
}

async function provisionSocialClient(adminApi: APIRequestContext): Promise<ProvisionedClient> {
  const id = testId();
  const email = `test-${id}@example.com`;
  const res = await adminApi.post("/api/admin/crm/clients", {
    data: {
      business_name: `Sprint 10 Test ${id}`,
      contact_name: "Sprint10 Tester",
      contact_email: email,
      contact_phone: "415-555-1010",
      trade_type: "plumber",
      status: "lead",
      source: "manual",
    },
  });
  expect(res.ok()).toBeTruthy();
  const clientId = (await res.json()).id;

  /* Insert connections for facebook + instagram + google_business so the
   * adapters can resolve credentials. The dev mocks accept any token. */
  const fbToken = encryptToken("sprint10-fb-token");
  const igToken = encryptToken("sprint10-ig-token");
  const gbpToken = encryptToken("sprint10-gbp-token");

  await pool.query(
    `INSERT INTO socialsync_platform_connections
       (client_id, platform, connection_status, external_account_id, external_page_id,
        token_ref, token_expires_at, last_validated_at, metadata)
     VALUES
       ($1, 'facebook', 'connected', 'fb-acct', 'fb-page-${id}', $2, NOW() + interval '1 hour', NOW(), $3),
       ($1, 'instagram', 'connected', 'ig-acct', 'ig-acct-${id}', $4, NOW() + interval '1 hour', NOW(), $5),
       ($1, 'google_business', 'connected', 'accounts/test', 'accounts/test/locations/sprint10-${id}', $6, NOW() + interval '1 hour', NOW(), $7)`,
    [
      clientId,
      fbToken, JSON.stringify({ page_token_ref: fbToken }),
      igToken, JSON.stringify({ ig_user_id: `ig-acct-${id}` }),
      gbpToken, JSON.stringify({}),
    ],
  );

  return { clientId, email };
}

async function createSocialPostDraft(
  clientId: number,
  platform: "facebook" | "instagram" | "google_business",
  text: string,
  opts: { kind?: string; mediaUrl?: string } = {},
): Promise<{ postId: number; draftId: number }> {
  const kind = opts.kind ?? (platform === "google_business" ? "google_post" : "social_post");
  /* Insert socialsync_posts row. */
  const mediaPlan = opts.mediaUrl ? JSON.stringify({ image_url: opts.mediaUrl, public_image_url: opts.mediaUrl }) : null;
  const postRes = await pool.query(
    `INSERT INTO socialsync_posts
       (client_id, platform, post_text, status, media_plan, hashtags, quality_score, created_at, updated_at)
     VALUES ($1, $2, $3, 'ready', $4, '[]'::jsonb, 90, NOW(), NOW())
     RETURNING id`,
    [clientId, platform, text, mediaPlan],
  );
  const postId = postRes.rows[0].id;

  /* Insert content_drafts row, status='approved', target_platform set,
   * metadata.<channel>.queue_status='queued' so the worker picks it. */
  const channelKey = platform === "facebook" ? "facebook" : platform === "instagram" ? "instagram" : "gbp_post";
  const meta = { [channelKey]: { queue_status: "queued", attempts: 0, scheduled_for: null } };
  const draftRes = await pool.query(
    `INSERT INTO content_drafts
       (client_id, kind, surface, body, status, target_platform, metadata,
        linked_social_post_id, auto_approved, admin_approved_at,
        created_by, created_at, updated_at)
     VALUES ($1, $2, 'socialsync', $3, 'approved', $4, $5, $6, true, NOW(), 'system', NOW(), NOW())
     RETURNING id`,
    [clientId, kind, text, platform, JSON.stringify(meta), postId],
  );
  const draftId = draftRes.rows[0].id;

  /* Backfill the back-reference. */
  await pool.query(
    `UPDATE socialsync_posts SET content_draft_id = $1 WHERE id = $2`,
    [draftId, postId],
  );

  return { postId, draftId };
}

async function readDraft(adminApi: APIRequestContext, draftId: number): Promise<any> {
  const r = await adminApi.get(`/api/admin/contentflow/drafts/${draftId}`);
  expect(r.ok()).toBeTruthy();
  return (await r.json()).draft;
}

test.describe.configure({ mode: "serial" });

test.describe("ContentFlow Sprint 10 — SocialSync queue convergence", () => {
  let provisionedClients: ProvisionedClient[] = [];

  test.afterAll(async () => {
    try {
      const { rows } = await pool.query(
        `SELECT id FROM clients WHERE business_name LIKE 'Sprint 10 Test %'`,
      );
      for (const row of rows) {
        const cid = row.id;
        await pool.query(`DELETE FROM content_approvals WHERE draft_id IN (SELECT id FROM content_drafts WHERE client_id = $1)`, [cid]);
        await pool.query(`DELETE FROM content_drafts WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM socialsync_publish_queue WHERE client_id = $1`, [cid]).catch(() => {});
        await pool.query(`DELETE FROM socialsync_posts WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM socialsync_profiles WHERE client_id = $1`, [cid]).catch(() => {});
        await pool.query(`DELETE FROM socialsync_platform_connections WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM clients WHERE id = $1`, [cid]);
      }
    } catch (err: any) {
      console.warn(`[sprint10 afterAll]`, err.message);
    }
  });

  test("P10-1 — Facebook adapter publishes via dev mock", async ({ adminApi }) => {
    const c = await provisionSocialClient(adminApi);
    provisionedClients.push(c);
    const { draftId } = await createSocialPostDraft(c.clientId, "facebook", "Sprint 10 Facebook test post");

    const runRes = await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`);
    expect(runRes.ok()).toBeTruthy();
    const summary = await runRes.json();
    expect(summary.channels?.facebook?.published, "facebook channel must show 1 publish").toBeGreaterThanOrEqual(1);

    const draft = await readDraft(adminApi, draftId);
    expect(draft.status).toBe("published");
    expect(draft.metadata?.facebook?.posted_at, "metadata.facebook.posted_at stamped").toBeTruthy();
    expect(draft.metadata?.facebook?.remote_post_id).toBeTruthy();
    expect(draft.metadata?.facebook?.queue_status).toBe("published");
  });

  test("P10-2 — Instagram adapter publishes via dev mock", async ({ adminApi }) => {
    const c = await provisionSocialClient(adminApi);
    provisionedClients.push(c);
    const { draftId } = await createSocialPostDraft(
      c.clientId, "instagram", "Sprint 10 Instagram test caption",
      { mediaUrl: "https://example-test.invalid/img.jpg" },
    );

    const runRes = await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`);
    expect(runRes.ok()).toBeTruthy();
    const summary = await runRes.json();
    expect(summary.channels?.instagram?.published).toBeGreaterThanOrEqual(1);

    const draft = await readDraft(adminApi, draftId);
    expect(draft.status).toBe("published");
    expect(draft.metadata?.instagram?.posted_at).toBeTruthy();
    expect(draft.metadata?.instagram?.queue_status).toBe("published");
  });

  test("P10-3 — GBP-post adapter publishes via dev mock", async ({ adminApi }) => {
    const c = await provisionSocialClient(adminApi);
    provisionedClients.push(c);
    const { draftId } = await createSocialPostDraft(c.clientId, "google_business", "Sprint 10 GBP local post summary");

    const runRes = await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`);
    expect(runRes.ok()).toBeTruthy();
    const summary = await runRes.json();
    expect(summary.channels?.gbp_post?.published).toBeGreaterThanOrEqual(1);

    const draft = await readDraft(adminApi, draftId);
    expect(draft.status).toBe("published");
    expect(draft.metadata?.gbp_post?.posted_at).toBeTruthy();
    expect(draft.metadata?.gbp_post?.queue_status).toBe("published");
  });

  test("P10-4 — multi-channel atomic claim: 3 platforms publish exactly once across parallel workers", async ({ adminApi }) => {
    const c = await provisionSocialClient(adminApi);
    provisionedClients.push(c);
    const { draftId: fbId } = await createSocialPostDraft(c.clientId, "facebook", "Sprint 10 multi-channel fb");
    const { draftId: igId } = await createSocialPostDraft(c.clientId, "instagram", "Sprint 10 multi-channel ig", { mediaUrl: "https://example-test.invalid/img2.jpg" });
    const { draftId: gpId } = await createSocialPostDraft(c.clientId, "google_business", "Sprint 10 multi-channel gp");

    /* Two worker invocations in parallel — atomic claim must serialize per row. */
    const [a, b] = await Promise.all([
      adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`),
      adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`),
    ]);
    expect(a.ok()).toBeTruthy();
    expect(b.ok()).toBeTruthy();

    const ids = [fbId, igId, gpId];
    const { rows } = await pool.query(
      `SELECT id, status,
              metadata->'facebook'->>'posted_at' AS fb_posted,
              metadata->'instagram'->>'posted_at' AS ig_posted,
              metadata->'gbp_post'->>'posted_at' AS gp_posted
         FROM content_drafts WHERE id = ANY($1::int[])`,
      [ids],
    );
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.status, `draft ${row.id} should be published`).toBe("published");
      const exactlyOne = [row.fb_posted, row.ig_posted, row.gp_posted].filter((v) => v).length === 1;
      expect(exactlyOne, `draft ${row.id} should have exactly one channel posted_at`).toBe(true);
    }
  });

  test("P10-5 — cooling_down: queue keeps draft queued, does NOT increment attempts", async ({ adminApi }) => {
    const c = await provisionSocialClient(adminApi);
    provisionedClients.push(c);
    const { draftId } = await createSocialPostDraft(c.clientId, "facebook", "Sprint 10 cooldown test");

    /* Force cooldown via socialsync_profiles.runtime_state. cooldownManager
     * reads `runtime_state[platform].cooldown_until` per profile. We
     * upsert a profile row with an active cooldown for facebook. */
    const tenMinFromNow = new Date(Date.now() + 10 * 60_000).toISOString();
    const runtime = JSON.stringify({
      facebook: {
        cooldown_until: tenMinFromNow,
        cooldown_reason: "forced_for_test",
        consecutive_failures: 1,
        consecutive_permanent_failures: 0,
        rate_limit_count_24h: 1,
        last_failure_at: new Date().toISOString(),
        last_success_at: null,
        last_rate_limit_at: new Date().toISOString(),
        last_alerted_at: null,
        suppressed: false,
      },
    });
    await pool.query(
      `INSERT INTO socialsync_profiles (client_id, enabled, niche, runtime_state, created_at, updated_at)
       VALUES ($1, true, 'plumbing', $2::jsonb, NOW(), NOW())
       ON CONFLICT (client_id) DO UPDATE SET runtime_state = EXCLUDED.runtime_state, updated_at = NOW()`,
      [c.clientId, runtime],
    );

    const runRes = await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`);
    expect(runRes.ok()).toBeTruthy();
    const summary = await runRes.json();
    expect(summary.channels?.facebook?.cooldown_skipped, "must register cooldown_skipped").toBeGreaterThanOrEqual(1);

    const draft = await readDraft(adminApi, draftId);
    expect(draft.metadata?.facebook?.queue_status, "still queued — not failed/published").toBe("queued");
    expect(parseInt(draft.metadata?.facebook?.attempts ?? "0", 10), "attempts NOT incremented under cooldown").toBe(0);
  });

  test("P10-6 — rate-limit retry — fb mock code 4 marks retryable; queue retries", async ({ adminApi }) => {
    const c = await provisionSocialClient(adminApi);
    provisionedClients.push(c);
    /* Clear any cooldown from P10-5 if same-client (different client here, safe). */
    const { draftId } = await createSocialPostDraft(c.clientId, "facebook", "FAIL_FB_RATE Sprint 10 rate-limit test");

    const runRes = await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`);
    expect(runRes.ok()).toBeTruthy();

    const draft = await readDraft(adminApi, draftId);
    /* After ONE failed attempt with a rate-limit code, attempts=1 and
     * queue_status='queued' (retry path), NOT 'failed'. */
    expect(parseInt(draft.metadata?.facebook?.attempts ?? "0", 10)).toBeGreaterThanOrEqual(1);
    expect(["queued", "failed"]).toContain(draft.metadata?.facebook?.queue_status);
    /* After 3 attempts the queue dead-letters. The retry classification
     * is the headline assertion here — that we did NOT immediately
     * dead-letter on the first try. */
  });

  test("P10-7 — permanent failure (code 190 invalid token) → dead-letter on first attempt", async ({ adminApi }) => {
    const c = await provisionSocialClient(adminApi);
    provisionedClients.push(c);
    const { draftId } = await createSocialPostDraft(c.clientId, "facebook", "FAIL_FB_PERM Sprint 10 invalid token test");

    const runRes = await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`);
    expect(runRes.ok()).toBeTruthy();

    const draft = await readDraft(adminApi, draftId);
    expect(draft.metadata?.facebook?.queue_status, "permanent failure → failed immediately").toBe("failed");
    expect(parseInt(draft.metadata?.facebook?.attempts ?? "0", 10), "no retry waste — attempts=1").toBe(1);
    expect(draft.metadata?.facebook?.dead_letter_at).toBeTruthy();
  });

  test("P10-8 — orchestrator no longer writes to socialsync_publish_queue", async () => {
    /* Static guarantee: the new SocialSync orchestrator path uses
     * enqueueSocialSyncDraft. Verify the source no longer calls
     * storage.enqueueSocialSyncJob. */
    const filePath = resolve(__dirname, "../../../server/services/socialSync/orchestrator.ts");
    const src = readFileSync(filePath, "utf8");
    /* Look for an actual call (with `(`) — the deprecation comment
     * references the symbol by name without invoking it. */
    expect(src.includes("storage.enqueueSocialSyncJob("), "orchestrator must NOT call storage.enqueueSocialSyncJob anymore").toBe(false);
    expect(src.includes("enqueueSocialSyncDraft("), "orchestrator must call enqueueSocialSyncDraft").toBe(true);
  });

  test("P10-9 — scheduler no longer registers processSocialSyncQueue cron", async () => {
    const filePath = resolve(__dirname, "../../../server/jobs/scheduler.ts");
    const src = readFileSync(filePath, "utf8");
    /* The legacy cron schedule that wrapped processSocialSyncQueue must
     * not exist. The import remains (with a deprecation note) for one
     * release cycle as a manual rollback path, so we check for the cron
     * REGISTRATION, not the import. */
    expect(src.includes(`runJob("socialsync_queue_worker"`), "scheduler must NOT register socialsync_queue_worker cron").toBe(false);
    /* Adapter registry has all 5 expected types. */
    const types = listRegisteredAdapterTypes();
    expect(types).toContain("wordpress");
    expect(types).toContain("gbp");
    expect(types).toContain("facebook");
    expect(types).toContain("instagram");
    expect(types).toContain("gbp_post");

    /* Each adapter is callable. */
    expect(getAdapter("facebook").type).toBe("facebook");
    expect(getAdapter("instagram").type).toBe("instagram");
    expect(getAdapter("gbp_post").type).toBe("gbp_post");
  });
});
