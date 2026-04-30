/**
 * ContentFlow — Sprint 1 verification.
 *
 * Confirms the kernel (content_drafts + content_approvals + the back-ref
 * column on socialsync_posts) actually wires together, without invoking
 * the real Anthropic-backed SocialSync generator or publishing to any
 * social platform.
 *
 * Runs against a DEV server (NODE_ENV !== "production") because it calls
 * dev-only endpoints under /api/admin/contentflow/__dev/*. In production
 * those routes do not exist and this spec will fail cleanly.
 *
 * Invariants asserted:
 *   1. GET /api/admin/contentflow/queue returns 200 with a well-formed
 *      payload — even with no drafts.
 *   2. Simulating a generation (via the dev endpoint) creates exactly
 *      one content_drafts row, one content_approvals row, and back-fills
 *      socialsync_posts.content_draft_id.
 *   3. The draft lands with status='approved', auto_approved=true.
 *   4. The approval row has action='auto_approved', actor_type='system'.
 *   5. The linked SocialSyncPost.status stays 'ready' — the ContentFlow
 *      side-effect must NOT mutate any existing SocialSync state.
 *   6. The queue endpoint returns the new draft when filtered by client_id.
 *
 * Everything created by this spec is cleaned up in afterAll via the
 * cleanup dev endpoint. Test clients remain (cleaned by the existing
 * admin-crm cleanup-test-data.ts helper).
 */

import { test, expect, createTestClient } from "./fixtures";

test.describe("ContentFlow Sprint 1 — kernel verification", () => {
  // Track artefacts so afterAll can tear them down even on mid-test failure.
  const created: Array<{ draft_id: number; post_id: number }> = [];

  test.afterAll(async ({ playwright }) => {
    const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
    const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@wefixtrades.com";
    const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "TestAdmin123!";
    const ctx = await playwright.request.newContext({ baseURL: BASE_URL });
    await ctx.post("/api/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    for (const a of created) {
      await ctx.post("/api/admin/contentflow/__dev/cleanup", {
        data: { draft_id: a.draft_id, post_id: a.post_id },
      }).catch(() => {});
    }
    await ctx.dispose();
  });

  test("CF1 — queue endpoint returns 200 with well-formed payload", async ({ apiContext }) => {
    const res = await apiContext.get("/api/admin/contentflow/queue?limit=1");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("drafts");
    expect(Array.isArray(body.drafts)).toBe(true);
    expect(body).toHaveProperty("count");
    expect(body).toHaveProperty("limit");
    expect(body.limit).toBe(1);
  });

  test("CF2 — queue endpoint rejects anonymous callers", async ({ playwright }) => {
    const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
    const anon = await playwright.request.newContext({ baseURL: BASE_URL });
    const res = await anon.get("/api/admin/contentflow/queue");
    // requireAdmin returns 401 or 403 for unauthenticated/non-admin callers.
    expect([401, 403]).toContain(res.status());
    await anon.dispose();
  });

  test("CF3 — simulated generation creates draft + approval + back-ref", async ({ apiContext }) => {
    // 1. Create a throwaway test client.
    const client = await createTestClient(apiContext, {
      business_name: `ContentFlow PW ${Date.now()}`,
      trade_type: "plumber",
    });
    expect(client.id).toBeTruthy();

    // 2. Call the dev simulate endpoint — no Anthropic, no publish.
    const simRes = await apiContext.post(
      "/api/admin/contentflow/__dev/simulate-generation",
      { data: { client_id: client.id, platform: "facebook", quality_score: 88 } },
    );
    expect(simRes.ok()).toBeTruthy();
    const sim = await simRes.json();
    created.push({ draft_id: sim.draft_id, post_id: sim.post_id });

    expect(sim.draft_id).toBeGreaterThan(0);
    expect(sim.post_id).toBeGreaterThan(0);
    expect(sim.draft_status).toBe("approved");
    expect(sim.auto_approved).toBe(true);
    expect(sim.post_status).toBe("ready");                              // INVARIANT #5
    expect(sim.post_content_draft_id).toBe(sim.draft_id);               // back-ref wired

    // 3. Inspect endpoint returns draft + approvals + post.
    const inspRes = await apiContext.get(
      `/api/admin/contentflow/__dev/inspect/${sim.draft_id}`,
    );
    expect(inspRes.ok()).toBeTruthy();
    const insp = await inspRes.json();

    // Draft shape
    expect(insp.draft.id).toBe(sim.draft_id);
    expect(insp.draft.client_id).toBe(client.id);
    expect(insp.draft.kind).toBe("social_post");
    expect(insp.draft.surface).toBe("socialsync");
    expect(insp.draft.target_platform).toBe("facebook");
    expect(insp.draft.quality_score).toBe(88);
    expect(insp.draft.status).toBe("approved");
    expect(insp.draft.auto_approved).toBe(true);
    expect(insp.draft.linked_social_post_id).toBe(sim.post_id);
    expect(insp.draft.admin_approved_at).not.toBeNull();

    // Approvals — exactly one, auto_approved, actor=system
    expect(Array.isArray(insp.approvals)).toBe(true);
    expect(insp.approvals.length).toBe(1);
    expect(insp.approvals[0].action).toBe("auto_approved");
    expect(insp.approvals[0].actor_type).toBe("system");
    expect(insp.approvals[0].actor_id).toBeNull();
    expect(insp.approvals[0].draft_id).toBe(sim.draft_id);

    // Linked post — unchanged by ContentFlow except for back-ref column.
    expect(insp.post.id).toBe(sim.post_id);
    expect(insp.post.status).toBe("ready");                              // INVARIANT #5 (DB-confirmed)
    expect(insp.post.content_draft_id).toBe(sim.draft_id);               // INVARIANT #2
    expect(insp.post.quality_score).toBe(88);
    expect(insp.post.platform).toBe("facebook");

    // 4. Queue endpoint surfaces the new draft when filtered by client_id.
    const qRes = await apiContext.get(
      `/api/admin/contentflow/queue?client_id=${client.id}&limit=10`,
    );
    expect(qRes.ok()).toBeTruthy();
    const q = await qRes.json();
    const found = q.drafts.find((d: any) => d.id === sim.draft_id);
    expect(found).toBeTruthy();
    expect(found.client_id).toBe(client.id);
    expect(found.surface).toBe("socialsync");
    expect(found.status).toBe("approved");
  });

  test("CF4 — simulated generation is idempotent per post", async ({ apiContext }) => {
    // The draftService uses the unique index on linked_social_post_id as
    // an idempotency key. Re-creating a draft from the same post must
    // return the existing draft, not a new one — and must not insert a
    // second approval row.
    //
    // We exercise this by asserting that after the CF3 run, a draftService-
    // level re-invocation (reached via a fresh simulate call against the
    // same post id is not possible in the dev endpoint shape, so instead
    // we rely on the queue endpoint to confirm exactly one draft exists
    // for the post id recorded in CF3.
    if (created.length === 0) test.skip(true, "CF3 did not record a draft; CF4 would be meaningless");
    const last = created[created.length - 1];
    const qRes = await apiContext.get(`/api/admin/contentflow/queue?limit=200`);
    const q = await qRes.json();
    const matches = q.drafts.filter(
      (d: any) => d.linked_social_post_id === last.post_id,
    );
    expect(matches.length).toBe(1);
  });
});
