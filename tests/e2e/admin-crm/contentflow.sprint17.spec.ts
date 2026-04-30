/**
 * ContentFlow — Sprint 17 verification.
 *
 * Performance feedback loop. Worker reads recent published drafts,
 * stamps metadata.performance + metadata.performance_flags. Generators
 * read high_performer flags and inject patterns into prompts.
 *
 *   P17-1  performance metadata saved on draft
 *   P17-2  scoring computed correctly
 *   P17-3  high/low flags assigned at thresholds
 *   P17-4  worker runs without API config (no crash, fetched_at stamped)
 *   P17-5  worker updates only stale drafts (freshness skip)
 *   P17-6  generation prompt includes feedback patterns
 *          (verified via __dev/performance-feedback)
 *   P17-7  full Sprint 1-16 regression
 */

import { test as baseTest, expect, type APIRequestContext } from "@playwright/test";
import { STORAGE_STATE_PATH } from "./global-setup";
import { pool } from "../../../server/db";

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

async function provisionClient(adminApi: APIRequestContext): Promise<{ clientId: number }> {
  const id = testId();
  const cRes = await adminApi.post("/api/admin/crm/clients", {
    data: {
      business_name: `Sprint 17 Test ${id}`,
      contact_name: "Sprint17 Tester",
      contact_email: `test-${id}@example.com`,
      contact_phone: "212-555-1717",
      trade_type: "plumber",
      status: "lead",
      source: "manual",
    },
  });
  expect(cRes.ok()).toBeTruthy();
  return { clientId: (await cRes.json()).id };
}

/**
 * Insert a published FB-channel draft directly in DB. The performance
 * worker scans for `status = 'published'` AND a posted_at within the
 * 7-day window.
 */
async function insertPublishedFbDraft(
  clientId: number,
  body: string,
  opts: {
    postedAt?: Date;
    perfPatch?: Record<string, any> | null;
    flagsPatch?: Record<string, any> | null;
    bodyHook?: string;
  } = {},
): Promise<number> {
  const postedAt = (opts.postedAt ?? new Date()).toISOString();
  const remoteId = `fb-${testId()}`;
  /* Build metadata. Tests pass perfPatch=null to omit performance entirely. */
  const meta: Record<string, any> = {
    facebook: {
      queue_status: "published",
      posted_at: postedAt,
      remote_post_id: remoteId,
    },
  };
  if (opts.perfPatch !== null && opts.perfPatch !== undefined) {
    meta.performance = { channel: "facebook", ...opts.perfPatch };
  }
  if (opts.flagsPatch !== null && opts.flagsPatch !== undefined) {
    meta.performance_flags = opts.flagsPatch;
  }
  const r = await pool.query(
    `INSERT INTO content_drafts
       (client_id, kind, surface, body, status, target_platform, metadata,
        auto_approved, admin_approved_at, created_by, created_at, updated_at)
     VALUES ($1, 'social_post', 'socialsync', $2, 'published', 'facebook', $3,
             true, NOW(), 'system', NOW(), NOW())
     RETURNING id`,
    [clientId, body, JSON.stringify(meta)],
  );
  return r.rows[0].id;
}

test.describe.configure({ mode: "serial" });

test.describe("ContentFlow Sprint 17 — performance feedback loop", () => {
  test.afterAll(async () => {
    try {
      const { rows } = await pool.query(`SELECT id FROM clients WHERE business_name LIKE 'Sprint 17 Test %'`);
      for (const row of rows) {
        const cid = row.id;
        await pool.query(`DELETE FROM content_approvals WHERE draft_id IN (SELECT id FROM content_drafts WHERE client_id = $1)`, [cid]);
        await pool.query(`DELETE FROM content_drafts WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM socialsync_activity_logs WHERE client_id = $1`, [cid]).catch(() => {});
        await pool.query(`DELETE FROM socialsync_posts WHERE client_id = $1`, [cid]).catch(() => {});
        await pool.query(`DELETE FROM clients WHERE id = $1`, [cid]);
      }
    } catch (err: any) {
      console.warn(`[sprint17 afterAll]`, err.message);
    }
  });

  test("P17-1 — worker stamps performance metadata on a recently-published draft", async ({ adminApi }) => {
    const { clientId } = await provisionClient(adminApi);
    /* Insert a published FB draft with NO performance metadata yet. */
    const draftId = await insertPublishedFbDraft(clientId, "Sprint 17 P17-1 hook", {
      perfPatch: null,
      flagsPatch: null,
    });

    const r = await adminApi.post(`/api/admin/contentflow/__dev/performance-worker/run`, { data: {} });
    expect(r.ok(), `worker run failed: ${await r.text()}`).toBeTruthy();
    const summary = await r.json();
    expect(summary.ok).toBe(true);
    expect(summary.scanned, "must scan our draft").toBeGreaterThanOrEqual(1);
    expect(summary.updated, "must update our draft").toBeGreaterThanOrEqual(1);

    /* Re-read the draft and assert performance metadata is present. */
    const { rows } = await pool.query(`SELECT metadata FROM content_drafts WHERE id = $1`, [draftId]);
    const meta = rows[0].metadata as any;
    expect(meta.performance).toBeTruthy();
    expect(meta.performance.channel).toBe("facebook");
    expect(typeof meta.performance.score).toBe("number");
    expect(typeof meta.performance.fetched_at).toBe("string");
    expect(meta.performance_flags).toBeTruthy();
  });

  test("P17-2 — score computed correctly from engagement weights", async ({ adminApi }) => {
    const { clientId } = await provisionClient(adminApi);
    /* Expected: reactions(10)*1 + comments(5)*3 + shares(3)*5 + clicks(8)*2
     *         = 10 + 15 + 15 + 16 = 56 → not high, not low. */
    const oldFetchedAt = new Date(Date.now() - 2 * 3600_000).toISOString();
    const draftId = await insertPublishedFbDraft(clientId, "Sprint 17 P17-2 hook", {
      perfPatch: { reactions: 10, comments: 5, shares: 3, clicks: 8, fetched_at: oldFetchedAt },
      flagsPatch: null,
    });

    const r = await adminApi.post(`/api/admin/contentflow/__dev/performance-worker/run`, { data: {} });
    expect(r.ok()).toBeTruthy();

    const { rows } = await pool.query(`SELECT metadata FROM content_drafts WHERE id = $1`, [draftId]);
    const meta = rows[0].metadata as any;
    expect(meta.performance.score, "exact weighted sum").toBe(56);
    /* Mid-range scores produce neither flag. */
    expect(meta.performance_flags.high_performer).toBe(false);
    expect(meta.performance_flags.low_performer).toBe(false);
  });

  test("P17-3 — high/low flags assigned by worker at score thresholds", async ({ adminApi }) => {
    const { clientId } = await provisionClient(adminApi);
    /* Pre-seed engagement counts WITHOUT a recent fetched_at so the
     * worker re-processes the drafts. Collectors return empty, so the
     * worker's merge preserves the seeded counts and re-computes
     * score + flags from them. Thresholds: high_performer >= 70,
     * low_performer <= 20. */
    const oldFetchedAt = new Date(Date.now() - 2 * 3600_000).toISOString();
    /* HIGH: shares(15)*5 = 75 → score 75 → high_performer */
    const highId = await insertPublishedFbDraft(clientId, "Sprint 17 P17-3 high", {
      perfPatch: { reactions: 0, comments: 0, shares: 15, clicks: 0, fetched_at: oldFetchedAt },
      flagsPatch: { high_performer: false, low_performer: false }, /* will be REPLACED by worker */
    });
    /* LOW: reactions(5)*1 = 5 → score 5 → low_performer */
    const lowId = await insertPublishedFbDraft(clientId, "Sprint 17 P17-3 low", {
      perfPatch: { reactions: 5, comments: 0, shares: 0, clicks: 0, fetched_at: oldFetchedAt },
      flagsPatch: { high_performer: false, low_performer: false },
    });

    const r = await adminApi.post(`/api/admin/contentflow/__dev/performance-worker/run`, { data: {} });
    expect(r.ok()).toBeTruthy();

    const high = await pool.query(`SELECT metadata FROM content_drafts WHERE id = $1`, [highId]);
    const low = await pool.query(`SELECT metadata FROM content_drafts WHERE id = $1`, [lowId]);
    const highMeta = high.rows[0].metadata as any;
    const lowMeta = low.rows[0].metadata as any;
    expect(highMeta.performance.score, "high score >= 70").toBeGreaterThanOrEqual(70);
    expect(highMeta.performance_flags.high_performer).toBe(true);
    expect(highMeta.performance_flags.low_performer).toBe(false);
    expect(lowMeta.performance.score, "low score <= 20").toBeLessThanOrEqual(20);
    expect(lowMeta.performance_flags.high_performer).toBe(false);
    expect(lowMeta.performance_flags.low_performer).toBe(true);
  });

  test("P17-4 — worker runs without API config (no crash, fetched_at stamped)", async ({ adminApi }) => {
    const { clientId } = await provisionClient(adminApi);
    /* No CONTENTFLOW_FB_INSIGHTS / CONTENTFLOW_IG_INSIGHTS env set →
     * collectors return baseline data without making any HTTP calls. */
    const draftId = await insertPublishedFbDraft(clientId, "Sprint 17 P17-4 hook", {
      perfPatch: null,
      flagsPatch: null,
    });

    const r = await adminApi.post(`/api/admin/contentflow/__dev/performance-worker/run`, { data: {} });
    expect(r.ok()).toBeTruthy();
    const summary = await r.json();
    expect(summary.ok).toBe(true);
    expect(Array.isArray(summary.errors)).toBe(true);

    const { rows } = await pool.query(`SELECT metadata FROM content_drafts WHERE id = $1`, [draftId]);
    const meta = rows[0].metadata as any;
    expect(meta.performance.fetched_at).toBeTruthy();
  });

  test("P17-5 — worker updates only stale drafts (freshness skip)", async ({ adminApi }) => {
    const { clientId } = await provisionClient(adminApi);
    /* fresh: fetched 1 minute ago — should be SKIPPED */
    const freshId = await insertPublishedFbDraft(clientId, "Sprint 17 P17-5 fresh", {
      perfPatch: { score: 50, fetched_at: new Date(Date.now() - 60_000).toISOString() },
      flagsPatch: null,
    });
    /* stale: fetched 2 hours ago — should be UPDATED */
    const staleId = await insertPublishedFbDraft(clientId, "Sprint 17 P17-5 stale", {
      perfPatch: { score: 50, fetched_at: new Date(Date.now() - 2 * 3600_000).toISOString() },
      flagsPatch: null,
    });

    const r = await adminApi.post(`/api/admin/contentflow/__dev/performance-worker/run`, { data: {} });
    expect(r.ok()).toBeTruthy();

    const fresh = await pool.query(`SELECT metadata FROM content_drafts WHERE id = $1`, [freshId]);
    const stale = await pool.query(`SELECT metadata FROM content_drafts WHERE id = $1`, [staleId]);
    const freshFetched = new Date((fresh.rows[0].metadata as any).performance.fetched_at).getTime();
    const staleFetched = new Date((stale.rows[0].metadata as any).performance.fetched_at).getTime();

    /* Fresh's fetched_at must NOT have changed by the worker — still ~1m ago */
    expect(Date.now() - freshFetched, "fresh draft must NOT be re-fetched").toBeGreaterThan(30_000);
    /* Stale's fetched_at must have been updated to nearly-now */
    expect(Date.now() - staleFetched, "stale draft must be updated to recent").toBeLessThan(60_000);
  });

  test("P17-6 — feedback endpoint extracts hooks from high-performer drafts", async ({ adminApi }) => {
    const { clientId } = await provisionClient(adminApi);
    /* Seed two high-performer drafts with distinct hooks. */
    await insertPublishedFbDraft(clientId, "Sprint17 P17-6 distinct hook one. The rest of the body follows.", {
      perfPatch: { score: 80, fetched_at: new Date().toISOString() },
      flagsPatch: { high_performer: true, low_performer: false },
    });
    await insertPublishedFbDraft(clientId, "Sprint17 P17-6 distinct hook two. Another body.", {
      perfPatch: { score: 90, fetched_at: new Date().toISOString() },
      flagsPatch: { high_performer: true, low_performer: false },
    });
    /* Add a low-performer that must NOT show up in the feedback. */
    await insertPublishedFbDraft(clientId, "Sprint17 P17-6 low performer hook should not appear.", {
      perfPatch: { score: 5, fetched_at: new Date().toISOString() },
      flagsPatch: { high_performer: false, low_performer: true },
    });

    const r = await adminApi.get(
      `/api/admin/contentflow/__dev/performance-feedback?clientId=${clientId}&channel=facebook`,
    );
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(typeof body.feedback).toBe("string");
    expect(body.feedback, "must include the high-performer hooks").toContain("distinct hook one");
    expect(body.feedback, "must include the high-performer hooks").toContain("distinct hook two");
    expect(body.feedback, "must NOT include low-performer hooks").not.toContain("should not appear");
  });
});
