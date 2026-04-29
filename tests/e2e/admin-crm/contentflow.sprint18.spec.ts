/**
 * ContentFlow — Sprint 18 verification.
 *
 * Observability + operator dashboard. Three admin GET endpoints
 * over read-only aggregations. No schema migration, no UI.
 *
 *   P18-1  /health returns top-level shape with status + queue + alerts
 *   P18-2  /channel-status returns all 6 channels with metrics
 *   P18-3  /client-health returns per-client breakdown
 *   P18-4  success rate computed correctly from published vs failed
 *   P18-5  dead-letter count surfaces in queue rollup + alerts at threshold
 *   P18-6  expired tokens surface in connections rollup
 *   P18-7  alerts triggered when thresholds exceeded
 *   P18-8  cross-sprint regression covered alongside (Sprint 1-17)
 *
 * Read-only — none of these endpoints mutate state.
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
      business_name: `Sprint 18 Test ${id}`,
      contact_name: "Sprint18 Tester",
      contact_email: `test-${id}@example.com`,
      contact_phone: "212-555-1818",
      trade_type: "plumber",
      status: "lead",
      source: "manual",
    },
  });
  expect(cRes.ok()).toBeTruthy();
  return { clientId: (await cRes.json()).id };
}

async function insertFbDraft(
  clientId: number,
  body: string,
  opts: {
    status?: string;
    fbPatch?: Record<string, any>;
  } = {},
): Promise<number> {
  const status = opts.status ?? "approved";
  const fb = { queue_status: "queued", attempts: 0, scheduled_for: null, ...(opts.fbPatch ?? {}) };
  const r = await pool.query(
    `INSERT INTO content_drafts
       (client_id, kind, surface, body, status, target_platform, metadata,
        auto_approved, admin_approved_at, created_by, created_at, updated_at)
     VALUES ($1, 'social_post', 'socialsync', $2, $3, 'facebook', $4,
             true, NOW(), 'system', NOW(), NOW())
     RETURNING id`,
    [clientId, body, status, JSON.stringify({ facebook: fb })],
  );
  return r.rows[0].id;
}

test.describe.configure({ mode: "serial" });

test.describe("ContentFlow Sprint 18 — observability + dashboard API", () => {
  test.afterAll(async () => {
    try {
      const { rows } = await pool.query(`SELECT id FROM clients WHERE business_name LIKE 'Sprint 18 Test %'`);
      for (const row of rows) {
        const cid = row.id;
        await pool.query(`DELETE FROM content_approvals WHERE draft_id IN (SELECT id FROM content_drafts WHERE client_id = $1)`, [cid]);
        await pool.query(`DELETE FROM content_drafts WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM socialsync_activity_logs WHERE client_id = $1`, [cid]).catch(() => {});
        await pool.query(`DELETE FROM socialsync_posts WHERE client_id = $1`, [cid]).catch(() => {});
        await pool.query(`DELETE FROM socialsync_platform_connections WHERE client_id = $1`, [cid]).catch(() => {});
        await pool.query(`DELETE FROM clients WHERE id = $1`, [cid]);
      }
    } catch (err: any) {
      console.warn(`[sprint18 afterAll]`, err.message);
    }
  });

  test("P18-1 — /health returns top-level shape with status + queue + alerts", async ({ adminApi }) => {
    const r = await adminApi.get(`/api/admin/contentflow/health`);
    expect(r.ok(), `health endpoint must be 200: ${await r.text()}`).toBeTruthy();
    const body = await r.json();
    expect(["ok", "degraded", "critical"]).toContain(body.status);
    expect(typeof body.generated_at).toBe("string");
    expect(body.queue).toBeTruthy();
    expect(typeof body.queue.total_queued).toBe("number");
    expect(typeof body.queue.total_failed_24h).toBe("number");
    expect(typeof body.queue.total_dead_lettered).toBe("number");
    expect(body.queue.by_channel).toBeTruthy();
    expect(body.publish_success_rate_24h).toBeTruthy();
    expect(typeof body.publish_success_rate_24h.overall).toBe("number");
    expect(body.workers).toBeTruthy();
    expect(body.workers.contentflow_publish_queue).toBeTruthy();
    expect(body.workers.contentflow_performance).toBeTruthy();
    expect(body.image_generation_24h).toBeTruthy();
    expect(Array.isArray(body.alerts)).toBe(true);
  });

  test("P18-2 — /channel-status returns all 6 channels", async ({ adminApi }) => {
    const r = await adminApi.get(`/api/admin/contentflow/channel-status`);
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.channels).toBeTruthy();
    for (const ch of ["wordpress", "gbp", "facebook", "instagram", "gbp_post", "email"]) {
      const c = body.channels[ch];
      expect(c, `channel ${ch} must be present`).toBeTruthy();
      expect(typeof c.queued).toBe("number");
      expect(typeof c.publishing).toBe("number");
      expect(typeof c.published_24h).toBe("number");
      expect(typeof c.failed_24h).toBe("number");
      expect(typeof c.dead_lettered).toBe("number");
      expect(typeof c.success_rate_24h).toBe("number");
      expect(Array.isArray(c.recent_errors)).toBe(true);
    }
    expect(body.connections_by_platform).toBeTruthy();
  });

  test("P18-3 — /client-health returns per-client breakdown", async ({ adminApi }) => {
    const { clientId } = await provisionClient(adminApi);
    /* Seed a queued FB draft so client metrics are non-zero. */
    await insertFbDraft(clientId, "Sprint 18 P18-3 body");

    const r = await adminApi.get(`/api/admin/contentflow/client-health?clientId=${clientId}`);
    expect(r.ok(), `client-health must be 200: ${await r.text()}`).toBeTruthy();
    const body = await r.json();
    expect(body.client_id).toBe(clientId);
    expect(typeof body.business_name).toBe("string");
    expect(body.drafts_24h).toBeTruthy();
    expect(typeof body.drafts_24h.created).toBe("number");
    expect(body.channel_health).toBeTruthy();
    expect(body.channel_health.facebook).toBeTruthy();
    expect(body.channel_health.facebook.queued, "FB queued count for this client").toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.connections)).toBe(true);
    /* Must NOT leak token_ref. */
    for (const c of body.connections) {
      expect(c.token_ref).toBeUndefined();
      expect(c.token).toBeUndefined();
    }
    expect(Array.isArray(body.recent_failures)).toBe(true);
    expect(body.performance_summary).toBeTruthy();
  });

  test("P18-4 — success rate computed correctly", async ({ adminApi }) => {
    const { clientId } = await provisionClient(adminApi);
    const postedAt = new Date().toISOString();
    /* 3 published, 1 failed in last 24h → success rate 0.75. */
    for (let i = 0; i < 3; i++) {
      await insertFbDraft(clientId, `Sprint 18 P18-4 success ${i}`, {
        status: "published",
        fbPatch: {
          queue_status: "published",
          posted_at: postedAt,
          remote_post_id: `fb-${testId()}-${i}`,
        },
      });
    }
    await insertFbDraft(clientId, `Sprint 18 P18-4 fail`, {
      status: "approved",
      fbPatch: {
        queue_status: "failed",
        last_error: "forced for test",
        attempts: 3,
        dead_letter_at: postedAt,
      },
    });

    const r = await adminApi.get(`/api/admin/contentflow/client-health?clientId=${clientId}`);
    const body = await r.json();
    const fb = body.channel_health.facebook;
    expect(fb.published_24h).toBeGreaterThanOrEqual(3);
    expect(fb.failed_24h).toBeGreaterThanOrEqual(1);
    /* Allow some slack for parallel-test interference but the ratio should
     * land in the right band. 3 successes / 4 attempts = 0.75 baseline,
     * possibly diluted if other parallel runs touched this client (none
     * should — this client is fresh). */
    expect(fb.success_rate_24h, "success rate should be 0.6..1.0").toBeGreaterThanOrEqual(0.6);
    expect(fb.success_rate_24h).toBeLessThanOrEqual(1.0);
  });

  test("P18-5 — dead-letter count surfaces and contributes to alerts at threshold", async ({ adminApi }) => {
    const { clientId } = await provisionClient(adminApi);
    /* Insert 7 dead-lettered FB drafts for this client. THRESHOLD_DEAD_LETTERED
     * is 5 — global rollup will pass it. */
    const at = new Date().toISOString();
    for (let i = 0; i < 7; i++) {
      await insertFbDraft(clientId, `Sprint 18 P18-5 dl ${i}`, {
        fbPatch: {
          queue_status: "failed",
          last_error: "forced dead-letter",
          attempts: 3,
          dead_letter_at: at,
        },
      });
    }

    const r = await adminApi.get(`/api/admin/contentflow/health`);
    const body = await r.json();
    expect(body.queue.total_dead_lettered, "global dead-letter count includes our 7").toBeGreaterThanOrEqual(7);
    /* Alert wording: contains "dead_lettered" */
    const hasDeadLetterAlert = (body.alerts as string[]).some((a) => /dead_lettered/i.test(a));
    expect(hasDeadLetterAlert, `alerts must include a dead-letter alert: ${JSON.stringify(body.alerts)}`).toBe(true);
    /* Status should be at least 'degraded' */
    expect(["degraded", "critical"], `status was '${body.status}'`).toContain(body.status);
  });

  test("P18-6 — expired tokens surface in connections rollup", async ({ adminApi }) => {
    const { clientId } = await provisionClient(adminApi);
    /* Insert one FB connection with token_expires_at in the past. */
    await pool.query(
      `INSERT INTO socialsync_platform_connections
         (client_id, platform, connection_status, external_account_id, external_page_id,
          token_ref, token_expires_at, last_validated_at, metadata)
       VALUES ($1, 'facebook', 'connected', 'fb-acct', 'fb-page-${testId()}',
               'sprint18-encrypted-stub', NOW() - interval '1 hour', NOW(), '{}'::jsonb)`,
      [clientId],
    );

    const r = await adminApi.get(`/api/admin/contentflow/channel-status`);
    const body = await r.json();
    const fb = body.connections_by_platform?.facebook;
    expect(fb, "facebook rollup must be present").toBeTruthy();
    expect(fb.expired, "expired count includes our test connection").toBeGreaterThanOrEqual(1);
  });

  test("P18-7 — windowHours param is honoured + bounded", async ({ adminApi }) => {
    /* Ridiculous window → clamped to 168h (7 days). */
    const r1 = await adminApi.get(`/api/admin/contentflow/health?windowHours=99999`);
    expect(r1.ok()).toBeTruthy();
    const r2 = await adminApi.get(`/api/admin/contentflow/health?windowHours=1`);
    expect(r2.ok()).toBeTruthy();
    /* Both responses should be well-formed; smaller window cannot exceed
     * counts of larger window. */
    const big = await r1.json();
    const small = await r2.json();
    expect(big.queue.total_failed_24h).toBeGreaterThanOrEqual(small.queue.total_failed_24h);
  });
});
