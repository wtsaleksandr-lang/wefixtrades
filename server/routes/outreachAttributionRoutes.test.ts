/**
 * Lane OC — outreach attribution route tests.
 *
 * Runnable standalone via:
 *   npx tsx server/routes/outreachAttributionRoutes.test.ts
 *
 * Excluded from `tsc --noEmit` (tsconfig.json excludes **\/*.test.ts).
 *
 * Pattern matches server/routes/portal/wave73KpiStats.test.ts — node
 * assert/strict, no test-runner dep, no live DB. Coverage:
 *
 *   1. Module import smoke + register function exported
 *   2. Route registration against a mock Express app (both endpoints)
 *   3. Auth gate behavior on POST /api/internal/outreach/attribution:
 *        - 503 when no internal token is configured (never open-by-default)
 *        - 401 on wrong token (deliberate-failure fixture)
 *        - 400 on invalid body with a correct token
 *      None of these paths touch the DB, so they run hermetically.
 *   4. attributionBodySchema validation (accept + reject fixtures,
 *      email normalization, source default)
 *   5. safeTokenEqual constant-time compare edge cases
 *
 * The matched/converted DB flows are covered at merge time by the admin
 * e2e suite against a live DB (the repo convention for query coverage).
 */

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test_unused";
}

import assert from "node:assert/strict";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  return Promise.resolve(fn())
    .then(() => {
      console.log(`  ✓ ${name}`);
      passed++;
    })
    .catch((err) => {
      console.error(`  ✗ ${name}`);
      console.error(err);
      failed++;
    });
}

type Handler = (req: any, res: any) => Promise<any> | any;

function mockRes() {
  return {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
  };
}

async function run(): Promise<void> {
  console.log("Lane OC outreach attribution route tests:\n");

  const mod = await import("./outreachAttributionRoutes");

  await test("module loads cleanly and exports register function", () => {
    assert.equal(typeof mod.registerOutreachAttributionRoutes, "function");
    assert.equal(typeof mod.attributionBodySchema?.safeParse, "function");
    assert.equal(typeof mod.safeTokenEqual, "function");
    assert.equal(typeof mod.internalToken, "function");
  });

  // ── Route registration against a mock app ──
  const routes: Record<string, Handler[]> = {};
  const fakeApp: any = {
    post: (path: string, ...handlers: Handler[]) => { routes[`POST ${path}`] = handlers; },
    get: (path: string, ...handlers: Handler[]) => { routes[`GET ${path}`] = handlers; },
  };
  mod.registerOutreachAttributionRoutes(fakeApp);

  await test("registers POST /api/internal/outreach/attribution", () => {
    assert.ok(routes["POST /api/internal/outreach/attribution"]);
  });

  await test("registers GET /api/admin/outbound/attribution/funnel behind requireAdmin", () => {
    const chain = routes["GET /api/admin/outbound/attribution/funnel"];
    assert.ok(chain);
    // requireAdmin middleware + handler
    assert.equal(chain.length, 2);
  });

  const postHandler = routes["POST /api/internal/outreach/attribution"].at(-1)!;

  // ── Auth gate ──
  await test("503 when no internal token configured (never open-by-default)", async () => {
    const prevA = process.env.INTERNAL_API_TOKEN;
    const prevB = process.env.OUTREACH_WEBHOOK_SECRET;
    delete process.env.INTERNAL_API_TOKEN;
    delete process.env.OUTREACH_WEBHOOK_SECRET;
    try {
      const res = mockRes();
      await postHandler({ headers: {}, body: { email: "a@b.com" } }, res);
      assert.equal(res.statusCode, 503);
    } finally {
      if (prevA !== undefined) process.env.INTERNAL_API_TOKEN = prevA;
      if (prevB !== undefined) process.env.OUTREACH_WEBHOOK_SECRET = prevB;
    }
  });

  await test("401 on wrong token — deliberate-failure fixture proves the gate bites", async () => {
    process.env.INTERNAL_API_TOKEN = "correct-token-value";
    const res = mockRes();
    await postHandler(
      { headers: { "x-internal-token": "wrong-token-value!" }, body: { email: "a@b.com" } },
      res,
    );
    assert.equal(res.statusCode, 401);
  });

  await test("400 on invalid body with correct token (no DB touched)", async () => {
    process.env.INTERNAL_API_TOKEN = "correct-token-value";
    const res = mockRes();
    await postHandler(
      { headers: { "x-internal-token": "correct-token-value" }, body: { email: "not-an-email" } },
      res,
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "invalid body");
  });

  // ── Body schema ──
  await test("schema accepts a minimal valid body and defaults source to signup", () => {
    const r = mod.attributionBodySchema.safeParse({ email: "Owner@AcmePlumbing.com" });
    assert.ok(r.success);
    assert.equal(r.data.email, "owner@acmeplumbing.com"); // normalized lowercase
    assert.equal(r.data.source, "signup");
  });

  await test("schema accepts a full stripe body", () => {
    const r = mod.attributionBodySchema.safeParse({
      email: "owner@acmeplumbing.com",
      source: "stripe",
      external_ref: "cus_123",
      converted_at: "2026-06-10T12:00:00Z",
    });
    assert.ok(r.success);
  });

  await test("schema rejects bad email / bad source / bad timestamp", () => {
    assert.equal(mod.attributionBodySchema.safeParse({ email: "nope" }).success, false);
    assert.equal(mod.attributionBodySchema.safeParse({ email: "a@b.com", source: "ads" }).success, false);
    assert.equal(mod.attributionBodySchema.safeParse({ email: "a@b.com", converted_at: "yesterday" }).success, false);
  });

  // ── Token compare ──
  await test("safeTokenEqual: equal / unequal / undefined / array / empty-expected", () => {
    assert.equal(mod.safeTokenEqual("abc", "abc"), true);
    assert.equal(mod.safeTokenEqual("abc", "abd"), false);
    assert.equal(mod.safeTokenEqual("abcd", "abc"), false);
    assert.equal(mod.safeTokenEqual(undefined, "abc"), false);
    assert.equal(mod.safeTokenEqual(["abc"] as any, "abc"), false);
    assert.equal(mod.safeTokenEqual("", ""), false); // empty expected never authorizes
  });

  // ── Worker daily-cap parsing (same lane, same hermetic pattern) ──
  const worker = await import("../jobs/artifactOutreachWorker");

  await test("globalDailyCap parses valid values and rejects junk", () => {
    const prev = process.env.OUTBOUND_GLOBAL_DAILY_CAP;
    try {
      process.env.OUTBOUND_GLOBAL_DAILY_CAP = "40";
      assert.equal(worker.globalDailyCap(), 40);
      process.env.OUTBOUND_GLOBAL_DAILY_CAP = "12.9";
      assert.equal(worker.globalDailyCap(), 12);
      process.env.OUTBOUND_GLOBAL_DAILY_CAP = "0";
      assert.equal(worker.globalDailyCap(), null);
      process.env.OUTBOUND_GLOBAL_DAILY_CAP = "-5";
      assert.equal(worker.globalDailyCap(), null);
      process.env.OUTBOUND_GLOBAL_DAILY_CAP = "lots";
      assert.equal(worker.globalDailyCap(), null);
      delete process.env.OUTBOUND_GLOBAL_DAILY_CAP;
      assert.equal(worker.globalDailyCap(), null);
    } finally {
      if (prev !== undefined) process.env.OUTBOUND_GLOBAL_DAILY_CAP = prev;
    }
  });

  await test("worker is inert (and uncapped flag false) when ARTIFACT_OUTREACH_ENABLED unset", async () => {
    const prev = process.env.ARTIFACT_OUTREACH_ENABLED;
    delete process.env.ARTIFACT_OUTREACH_ENABLED;
    try {
      const result = await worker.processArtifactOutreach();
      assert.deepEqual(result, { enabled: false, scanned: 0, generated: 0, skipped: 0, failed: 0, capped: false });
    } finally {
      if (prev !== undefined) process.env.ARTIFACT_OUTREACH_ENABLED = prev;
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
