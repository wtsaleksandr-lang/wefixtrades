/**
 * Route-order regression — the portal "Teach your assistant" knowledge routes
 * must NOT be shadowed by the TradeLine param route.
 *
 * Night-audit (2026-06-13): `GET /api/portal/tradeline/:clientServiceId`
 * (server/routes/portal/tradeline.ts) was registered (via registerPortalRoutes)
 * BEFORE the literal knowledge routes (registerPortalTradelineKnowledgeRoutes:
 * GET /api/portal/tradeline/{knowledge,voices,settings}). Express matches in
 * registration order, first-match-wins, so a request to
 *   GET /api/portal/tradeline/knowledge
 * hit the PARAM handler → parseInt("knowledge") → NaN → 400 "Invalid service id".
 * Impact: the portal AI "Teach" panel showed "Couldn't load… / Retry", the
 * seeded KB never displayed, and because the list query always errored
 * (notesEntry null) the save path always POSTed → duplicate `doc` rows on every
 * save. Also broke PortalTradelineKnowledgePage.tsx.
 *
 * Express 5 (this repo runs express 5.2.1) REMOVED inline regex route params
 * (`:id(\\d+)` throws at registration via path-to-regexp v8), so the robust fix
 * is REORDERING: register the literal knowledge routers BEFORE the param route.
 * server/routes/index.ts now calls registerPortalTradelineKnowledgeRoutes(app)
 * immediately before registerPortalRoutes(app).
 *
 * This test drives a REAL Express app (pattern: server/lib/bodyLimits.test.ts —
 * app.listen(0) + fetch, no network, no DB) with stub handlers that mirror the
 * two real handlers' MATCHING behaviour:
 *
 *   1. FIXED order (literals first): GET /knowledge|/voices|/settings resolve
 *      to the literal handler (200), never the param 400. A real numeric id
 *      (GET /api/portal/tradeline/42) STILL reaches the param handler.
 *   2. POST/PATCH/DELETE knowledge sub-routes still resolve to their handlers
 *      (the param route has no single-segment POST/PATCH/DELETE that shadows).
 *   3. DELIBERATE-FAILURE FIXTURE — the OLD regressed order (param route first)
 *      makes GET /knowledge hit the param handler → 400 NaN, turning the
 *      contract assertion red. Proves this test catches the shadow regression
 *      rather than merely running.
 *   4. SOURCE CONTRACT — in routes/index.ts the
 *      registerPortalTradelineKnowledgeRoutes(app) call must appear BEFORE
 *      registerPortalRoutes(app). A reversed-order source fixture proves the
 *      checker flags the regression.
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 * Runnable standalone:
 *
 *   npx tsx server/routes/portalTradelineKnowledgeRoutes.routeOrder.test.ts
 *
 * Wired into CI as `npm run check:tradeline-route-order`. node:assert/strict,
 * no test-runner dependency.
 */
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";

let passed = 0;
let failed = 0;
async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${label}`);
  } catch (err: any) {
    failed++;
    console.error(`  FAIL ${label}: ${err?.message ?? err}`);
  }
}

const KB_BASE = "/api/portal/tradeline/knowledge";
const PORTAL_VOICES = "/api/portal/tradeline/voices";
const PORTAL_SETTINGS = "/api/portal/tradeline/settings";
const PARAM_ROUTE = "/api/portal/tradeline/:clientServiceId";

/**
 * Build an app whose handlers replicate the REAL matching behaviour of the two
 * registrars:
 *   • the param handler does `parseInt(req.params.clientServiceId)` and 400s on
 *     NaN — exactly tradeline.ts:89-90.
 *   • the literal handlers reply 200 with a `handler` tag so the test can prove
 *     WHICH handler answered.
 *
 * order "fixed"     = literal routers registered FIRST (what index.ts now does).
 * order "regressed" = param route registered FIRST (the shadow bug).
 */
function buildApp(order: "fixed" | "regressed") {
  const app = express();
  app.use(express.json());

  const mountLiterals = () => {
    app.get(KB_BASE, (_req, res) => res.json({ handler: "knowledge:list" }));
    app.post(KB_BASE, (_req, res) => res.json({ handler: "knowledge:create" }));
    app.patch(`${KB_BASE}/:id`, (req, res) => res.json({ handler: "knowledge:update", id: req.params.id }));
    app.delete(`${KB_BASE}/:id`, (req, res) => res.json({ handler: "knowledge:delete", id: req.params.id }));
    app.post(`${KB_BASE}/reorder`, (_req, res) => res.json({ handler: "knowledge:reorder" }));
    app.get(PORTAL_VOICES, (_req, res) => res.json({ handler: "voices:list" }));
    app.get(PORTAL_SETTINGS, (_req, res) => res.json({ handler: "settings:get" }));
    app.patch(PORTAL_SETTINGS, (_req, res) => res.json({ handler: "settings:patch" }));
  };

  const mountParam = () => {
    // Mirrors tradeline.ts: parseInt → NaN → 400 "Invalid service id".
    app.get(PARAM_ROUTE, (req, res) => {
      const csId = parseInt(req.params.clientServiceId as string);
      if (Number.isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });
      return res.json({ handler: "param:get", csId });
    });
  };

  if (order === "fixed") {
    mountLiterals();
    mountParam();
  } else {
    mountParam();
    mountLiterals();
  }
  return app;
}

interface Probe {
  status: number;
  body: any;
}

async function withServer(
  order: "fixed" | "regressed",
  fn: (req: (method: string, path: string) => Promise<Probe>) => Promise<void>,
): Promise<void> {
  const server = buildApp(order).listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const req = async (method: string, path: string): Promise<Probe> => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method });
    const text = await res.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { /* non-JSON */ }
    return { status: res.status, body };
  };
  try {
    await fn(req);
  } finally {
    // Await full close so the listening handle is released before the next
    // server (or process.exit) — avoids a libuv teardown abort on Windows.
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/* ═══ 1. FIXED order — literals resolve, numeric id still hits param ════ */

await check("FIXED: GET /knowledge resolves to the knowledge handler (no NaN 400)", async () => {
  await withServer("fixed", async (req) => {
    const r = await req("GET", KB_BASE);
    assert.equal(r.status, 200, "must NOT be the param 400");
    assert.equal(r.body?.handler, "knowledge:list", "literal knowledge list handler answered");
  });
});

await check("FIXED: GET /voices and GET /settings resolve to their literal handlers", async () => {
  await withServer("fixed", async (req) => {
    const v = await req("GET", PORTAL_VOICES);
    assert.equal(v.status, 200);
    assert.equal(v.body?.handler, "voices:list");
    const s = await req("GET", PORTAL_SETTINGS);
    assert.equal(s.status, 200);
    assert.equal(s.body?.handler, "settings:get");
  });
});

await check("FIXED: a real numeric id STILL reaches the param handler", async () => {
  await withServer("fixed", async (req) => {
    const r = await req("GET", "/api/portal/tradeline/42");
    assert.equal(r.status, 200);
    assert.equal(r.body?.handler, "param:get");
    assert.equal(r.body?.csId, 42, "numeric id parsed and served by the param route");
  });
});

/* ═══ 2. POST/PATCH/DELETE knowledge sub-routes still resolve ══════════ */

await check("FIXED: POST/PATCH/DELETE/reorder knowledge routes still resolve correctly", async () => {
  await withServer("fixed", async (req) => {
    const create = await req("POST", KB_BASE);
    assert.equal(create.body?.handler, "knowledge:create");
    const update = await req("PATCH", `${KB_BASE}/abc123`);
    assert.equal(update.body?.handler, "knowledge:update");
    assert.equal(update.body?.id, "abc123");
    const del = await req("DELETE", `${KB_BASE}/abc123`);
    assert.equal(del.body?.handler, "knowledge:delete");
    const reorder = await req("POST", `${KB_BASE}/reorder`);
    assert.equal(reorder.body?.handler, "knowledge:reorder");
    const patchSettings = await req("PATCH", PORTAL_SETTINGS);
    assert.equal(patchSettings.body?.handler, "settings:patch");
  });
});

/* ═══ 3. DELIBERATE-FAILURE FIXTURE — the OLD regressed order ══════════ */

await check("DELIBERATE-FAILURE: regressed (param-first) order makes GET /knowledge 400 NaN", async () => {
  await withServer("regressed", async (req) => {
    const r = await req("GET", KB_BASE);
    // This is the EXACT bug: the param route swallowed /knowledge.
    assert.equal(r.status, 400, "regressed order hits the param 400");
    assert.equal(r.body?.error, "Invalid service id");

    // The REAL contract assertion (fixed-order expectation) must fail red here.
    let caught: unknown = null;
    try {
      assert.equal(r.status, 200, "knowledge must resolve to its own handler");
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, "the regressed order must fail the route-order contract red");
  });
});

/* ═══ 4. SOURCE CONTRACT — index.ts registration order ════════════════ */

await check("SOURCE: registerPortalTradelineKnowledgeRoutes is called BEFORE registerPortalRoutes", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const indexSrc = readFileSync(join(here, "index.ts"), "utf8");

  // Match the actual REGISTRATION calls (call-site, not the import line).
  const knowledgeIdx = indexSrc.search(/registerPortalTradelineKnowledgeRoutes\(\s*app\s*\)/);
  const portalIdx = indexSrc.search(/registerPortalRoutes\(\s*app\s*\)/);
  assert.ok(knowledgeIdx >= 0, "knowledge registrar call present");
  assert.ok(portalIdx >= 0, "portal registrar call present");
  assert.ok(
    knowledgeIdx < portalIdx,
    "registerPortalTradelineKnowledgeRoutes(app) must be registered before registerPortalRoutes(app) " +
      "so the literal /knowledge,/voices,/settings routes are not shadowed by the :clientServiceId param route",
  );
});

await check("SOURCE DELIBERATE-FAILURE: a reversed-order source fixture trips the checker", () => {
  // Simulate the OLD index.ts ordering (param registrar first).
  const reversedSrc = `
    registerPortalRoutes(app);
    registerPortalTradelineKnowledgeRoutes(app);
  `;
  const knowledgeIdx = reversedSrc.search(/registerPortalTradelineKnowledgeRoutes\(\s*app\s*\)/);
  const portalIdx = reversedSrc.search(/registerPortalRoutes\(\s*app\s*\)/);

  let caught: unknown = null;
  try {
    assert.ok(knowledgeIdx < portalIdx, "knowledge must precede portal");
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, "the reversed-order fixture must fail the source-contract assertion red");
});

/* ═══ Verdict ═════════════════════════════════════════════════════════ */

console.log(`\ntradeline route-order: ${passed} passed, ${failed} failed`);
// Set the exit code and let the event loop drain naturally — all servers are
// already closed in withServer's finally, so there are no open handles. Avoids
// the process.exit() vs closing-socket race that aborts libuv on Windows.
process.exitCode = failed > 0 ? 1 : 0;
