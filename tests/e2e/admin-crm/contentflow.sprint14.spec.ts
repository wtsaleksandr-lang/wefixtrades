/**
 * ContentFlow — Sprint 14 verification.
 *
 * Calendar + control layer on top of existing ContentFlow. No new
 * tables. metadata.calendar = { scheduled_for, channel, parent_draft_id?,
 * auto_generated, repurposed, paused? }.
 *
 *   P14-1  GET /calendar returns drafts grouped by date
 *   P14-2  PATCH /:id/schedule accepts future ISO, refuses past
 *   P14-3  pause prevents publish (queue skips paused row)
 *   P14-4  resume restores publish (after pause + resume, drain claims)
 *   P14-5  repurposed drafts carry calendar.parent_draft_id + repurposed=true
 *   P14-6  scheduled future draft is NOT picked; flips to picked after time
 *   P14-7  daily cap defers publish (>= MAX_PER_CHANNEL_PER_DAY published in 24h)
 *   P14-8  Sprint 1-13 regression covered by running them
 *
 * Pre-conditions on Replit (same as Sprint 13):
 *   DEV_TOOLS_ENABLED=1, REPURPOSER_AI_STUB=1, EMAIL_TEST_SIMULATE_SUCCESS=1,
 *   IMAGE_API_BASE_OVERRIDE, FB/IG/GBP_POST_API_BASE_OVERRIDE
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

async function provisionClient(adminApi: APIRequestContext): Promise<{ clientId: number; email: string }> {
  const id = testId();
  const email = `test-${id}@example.com`;
  const cRes = await adminApi.post("/api/admin/crm/clients", {
    data: {
      business_name: `Sprint 14 Test ${id}`,
      contact_name: "Sprint14 Tester",
      contact_email: email,
      contact_phone: "212-555-1414",
      trade_type: "plumber",
      status: "lead",
      source: "manual",
    },
  });
  expect(cRes.ok()).toBeTruthy();
  const clientId = (await cRes.json()).id;

  const fbToken = encryptToken("sprint14-fb-token");
  const igToken = encryptToken("sprint14-ig-token");
  const gbpToken = encryptToken("sprint14-gbp-token");
  await pool.query(
    `INSERT INTO socialsync_platform_connections
       (client_id, platform, connection_status, external_account_id, external_page_id,
        token_ref, token_expires_at, last_validated_at, metadata)
     VALUES
       ($1, 'facebook', 'connected', 'fb-acct', 'fb-page-${id}', $2, NOW() + interval '1 hour', NOW(), $3),
       ($1, 'instagram', 'connected', 'ig-acct', 'ig-acct-${id}', $4, NOW() + interval '1 hour', NOW(), $5),
       ($1, 'google_business', 'connected', 'accounts/test', 'accounts/test/locations/sprint14-${id}', $6, NOW() + interval '1 hour', NOW(), '{}'::jsonb)`,
    [clientId, fbToken, JSON.stringify({ page_token_ref: fbToken }), igToken, JSON.stringify({ ig_user_id: `ig-acct-${id}` }), gbpToken],
  );

  return { clientId, email };
}

async function createSocialPostDraft(
  clientId: number,
  platform: "facebook" | "instagram" | "google_business",
  body: string,
  opts: { metadataExtra?: Record<string, any>; status?: string } = {},
): Promise<number> {
  /* Mirror Sprint 10/13 helper: socialsync_posts shell + linked draft. */
  const channelKey = platform === "google_business" ? "gbp_post" : platform;
  const baseMeta: Record<string, any> = {
    [channelKey]: { queue_status: "queued", attempts: 0, scheduled_for: null },
    calendar: {
      channel: platform,
      scheduled_for: null,
      auto_generated: false,
      repurposed: false,
      paused: false,
    },
    ...(opts.metadataExtra ?? {}),
  };
  const postRes = await pool.query(
    `INSERT INTO socialsync_posts
       (client_id, platform, post_text, status, media_plan, hashtags, quality_score, created_at, updated_at)
     VALUES ($1, $2, $3, 'ready', NULL, '[]'::jsonb, 90, NOW(), NOW())
     RETURNING id`,
    [clientId, platform, body],
  );
  const postId = postRes.rows[0].id;
  const kind = platform === "google_business" ? "google_post" : "social_post";
  const draftRes = await pool.query(
    `INSERT INTO content_drafts
       (client_id, kind, surface, body, status, target_platform, metadata,
        linked_social_post_id, auto_approved, admin_approved_at,
        created_by, created_at, updated_at)
     VALUES ($1, $2, 'socialsync', $3, $4, $5, $6, $7, true, NOW(), 'system', NOW(), NOW())
     RETURNING id`,
    [clientId, kind, body, opts.status ?? "approved", platform, JSON.stringify(baseMeta), postId],
  );
  const draftId = draftRes.rows[0].id;
  await pool.query(`UPDATE socialsync_posts SET content_draft_id = $1 WHERE id = $2`, [draftId, postId]);
  return draftId;
}

async function readDraft(adminApi: APIRequestContext, draftId: number): Promise<any> {
  const r = await adminApi.get(`/api/admin/contentflow/drafts/${draftId}`);
  expect(r.ok()).toBeTruthy();
  return (await r.json()).draft;
}

test.describe.configure({ mode: "serial" });

test.describe("ContentFlow Sprint 14 — calendar + control", () => {
  test.afterAll(async () => {
    try {
      const { rows } = await pool.query(`SELECT id FROM clients WHERE business_name LIKE 'Sprint 14 Test %'`);
      for (const row of rows) {
        const cid = row.id;
        await pool.query(`DELETE FROM content_approvals WHERE draft_id IN (SELECT id FROM content_drafts WHERE client_id = $1)`, [cid]);
        await pool.query(`DELETE FROM content_drafts WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM socialsync_posts WHERE client_id = $1`, [cid]).catch(() => {});
        await pool.query(`DELETE FROM socialsync_platform_connections WHERE client_id = $1`, [cid]).catch(() => {});
        await pool.query(`DELETE FROM clients WHERE id = $1`, [cid]);
      }
    } catch (err: any) {
      console.warn(`[sprint14 afterAll]`, err.message);
    }
  });

  test("P14-1 — GET /calendar returns projections grouped by date", async ({ adminApi }) => {
    const { clientId } = await provisionClient(adminApi);
    await createSocialPostDraft(clientId, "facebook", "Sprint 14 P14-1 FB body");
    await createSocialPostDraft(clientId, "instagram", "Sprint 14 P14-1 IG body");

    const r = await adminApi.get(`/api/admin/contentflow/calendar?clientId=${clientId}`);
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(typeof body.days).toBe("object");
    expect(body.count).toBeGreaterThanOrEqual(2);

    /* Spot-check projection shape — must NOT contain raw metadata. */
    const allItems = Object.values(body.days).flat() as any[];
    const fb = allItems.find((d: any) => d.target_platform === "facebook");
    expect(fb).toBeTruthy();
    expect(fb.channel).toBe("facebook");
    expect(fb.metadata).toBeUndefined();
    expect(typeof fb.paused).toBe("boolean");
  });

  test("P14-2 — PATCH /schedule accepts future ISO, refuses past", async ({ adminApi }) => {
    const { clientId } = await provisionClient(adminApi);
    const draftId = await createSocialPostDraft(clientId, "facebook", "Sprint 14 P14-2 body");

    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const ok = await adminApi.patch(`/api/admin/contentflow/drafts/${draftId}/schedule`, {
      data: { scheduled_for: future },
    });
    expect(ok.ok()).toBeTruthy();

    const draft = await readDraft(adminApi, draftId);
    expect((draft.metadata as any)?.calendar?.scheduled_for).toBe(future);

    /* Past must reject */
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const bad = await adminApi.patch(`/api/admin/contentflow/drafts/${draftId}/schedule`, {
      data: { scheduled_for: past },
    });
    expect(bad.status()).toBe(400);
  });

  test("P14-3 — pause prevents publish", async ({ adminApi }) => {
    const { clientId } = await provisionClient(adminApi);
    const draftId = await createSocialPostDraft(clientId, "facebook", "Sprint 14 P14-3 body");

    const pauseRes = await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/pause`, { data: {} });
    expect(pauseRes.ok()).toBeTruthy();
    const paused = await pauseRes.json();
    expect(paused.draft.paused).toBe(true);

    /* Drive worker — paused draft must NOT publish. */
    await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`, { data: {} });
    const draft = await readDraft(adminApi, draftId);
    expect(draft.status).toBe("approved");
    expect((draft.metadata as any)?.facebook?.posted_at).toBeFalsy();
  });

  test("P14-4 — resume restores publish", async ({ adminApi }) => {
    const { clientId } = await provisionClient(adminApi);
    const draftId = await createSocialPostDraft(clientId, "facebook", "Sprint 14 P14-4 body");

    await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/pause`, { data: {} });
    /* Confirm paused blocks publish */
    await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`, { data: {} });
    let draft = await readDraft(adminApi, draftId);
    expect(draft.status, "still approved while paused").toBe("approved");

    /* Resume + drive */
    const resume = await adminApi.post(`/api/admin/contentflow/drafts/${draftId}/resume`, { data: {} });
    expect(resume.ok()).toBeTruthy();
    expect((await resume.json()).draft.paused).toBe(false);

    /* Loop drain so we get past earlier specs' queued items */
    let lastTotal = -1;
    for (let i = 0; i < 6; i++) {
      const r = await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`, { data: {} });
      const summary = await r.json();
      const total = (summary.published ?? 0) + (summary.scanned ?? 0);
      if (total === 0 || total === lastTotal) break;
      lastTotal = total;
    }
    draft = await readDraft(adminApi, draftId);
    expect(draft.status, "publishes after resume").toBe("published");
  });

  test("P14-5 — repurposed drafts carry calendar.parent_draft_id + repurposed=true", async ({ adminApi }) => {
    const { clientId } = await provisionClient(adminApi);
    /* Insert a parent article + drive the repurposer __dev endpoint. */
    const parentRes = await pool.query(
      `INSERT INTO content_drafts (client_id, kind, surface, title, body, excerpt, status, metadata, created_by, created_at, updated_at)
       VALUES ($1, 'article', 'rankflow', $2, $3, $4, 'approved', '{"primary_keyword":"leak repair","location":"Austin TX"}'::jsonb, 'system', NOW(), NOW())
       RETURNING id`,
      [
        clientId,
        `Sprint 14 — Repurposer Source ${testId()}`,
        "Sprint 14 article body — describes a recent leak repair service. Customers benefit from quick response, technicians explain the issue, and the repair is cleanly executed.",
        "Sprint 14 source excerpt",
      ],
    );
    const articleId = parentRes.rows[0].id;
    const r = await adminApi.post(`/api/admin/contentflow/__dev/repurpose-test`, { data: { articleDraftId: articleId } });
    expect(r.ok()).toBeTruthy();

    /* Verify children carry calendar.parent_draft_id + repurposed=true */
    const { rows } = await pool.query(
      `SELECT id, metadata FROM content_drafts WHERE metadata->>'parent_draft_id' = $1::text`,
      [String(articleId)],
    );
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const row of rows) {
      const cal = (row.metadata as any)?.calendar;
      expect(cal, `child ${row.id} must have calendar metadata`).toBeTruthy();
      expect(cal.parent_draft_id).toBe(articleId);
      expect(cal.repurposed).toBe(true);
      expect(cal.auto_generated).toBe(true);
    }
  });

  test("P14-6 — scheduled future draft is NOT picked; flips to picked after time elapses", async ({ adminApi }) => {
    const { clientId } = await provisionClient(adminApi);
    const draftId = await createSocialPostDraft(clientId, "facebook", "Sprint 14 P14-6 body");

    /* Schedule 1h in the future via the new endpoint. */
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await adminApi.patch(`/api/admin/contentflow/drafts/${draftId}/schedule`, { data: { scheduled_for: future } });

    /* Drain — must NOT publish */
    await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`, { data: {} });
    let draft = await readDraft(adminApi, draftId);
    expect(draft.status, "scheduled future must NOT publish").toBe("approved");

    /* Move to past via direct SQL on calendar.scheduled_for + per-channel. */
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    await pool.query(
      `UPDATE content_drafts
         SET metadata = jsonb_set(jsonb_set(metadata, '{calendar,scheduled_for}', to_jsonb($2::text), true),
                                  '{facebook,scheduled_for}', to_jsonb($2::text), true)
       WHERE id = $1`,
      [draftId, past],
    );

    /* Loop drain past earlier queued items. */
    let lastTotal = -1;
    for (let i = 0; i < 6; i++) {
      const r = await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`, { data: {} });
      const summary = await r.json();
      const total = (summary.published ?? 0) + (summary.scanned ?? 0);
      if (total === 0 || total === lastTotal) break;
      lastTotal = total;
    }
    draft = await readDraft(adminApi, draftId);
    expect(draft.status, "publishes after scheduled time elapses").toBe("published");
  });

  test("P14-7 — daily cap defers publish when >= MAX_PER_CHANNEL_PER_DAY", async ({ adminApi }) => {
    const { clientId } = await provisionClient(adminApi);
    /* GBP cap = 5/day. Insert 5 already-published GBP drafts in last 24h. */
    for (let i = 0; i < 5; i++) {
      await pool.query(
        `INSERT INTO content_drafts
           (client_id, kind, surface, body, status, target_platform, metadata,
            linked_social_post_id, auto_approved, admin_approved_at,
            created_by, created_at, updated_at)
         VALUES ($1, 'google_post', 'socialsync', $2, 'published', 'google_business',
           jsonb_build_object('gbp_post', jsonb_build_object('posted_at', NOW()::text, 'queue_status', 'published'),
                              'calendar', jsonb_build_object('channel', 'google_business', 'scheduled_for', NULL, 'auto_generated', false, 'repurposed', false, 'paused', false)),
           NULL, true, NOW(), 'system', NOW(), NOW())`,
        [clientId, `Sprint 14 P14-7 cap-filler ${i}`],
      );
    }

    /* Insert one fresh GBP draft expecting to publish — should be deferred. */
    const draftId = await createSocialPostDraft(clientId, "google_business", "Sprint 14 P14-7 should-defer");

    /* Loop drain — daily cap should defer this one. */
    let lastTotal = -1;
    for (let i = 0; i < 6; i++) {
      const r = await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`, { data: {} });
      const summary = await r.json();
      const total = (summary.published ?? 0) + (summary.scanned ?? 0);
      if (total === 0 || total === lastTotal) break;
      lastTotal = total;
    }

    const draft = await readDraft(adminApi, draftId);
    expect(draft.status, "deferred draft must remain approved (not published)").toBe("approved");
    /* metadata.gbp_post.scheduled_for must be in the future (deferred). */
    const sched = (draft.metadata as any)?.gbp_post?.scheduled_for;
    expect(sched, "scheduled_for must be set by cap-defer").toBeTruthy();
    expect(new Date(sched).getTime()).toBeGreaterThan(Date.now());
    /* last_error should mention the cap. */
    expect((draft.metadata as any)?.gbp_post?.last_error).toMatch(/daily cap/i);
  });
});
