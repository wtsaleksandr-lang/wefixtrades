/**
 * Body-limit preemption gate — server/lib/bodyLimits.ts regression probe.
 *
 * THE P1 UNDER TEST: the global `express.json()` (100 KB default) in
 * server/index.ts runs before all routes, so a route-scoped
 * `express.json({ limit })` mounted later is DEAD CODE — big bodies 413
 * (`entity.too.large`) at the global parser before the route's parser runs.
 * The fix (PR #1754 pattern, generalized): every raised limit is a
 * PATH-SCOPED parser mounted AHEAD of the global one, driven by the
 * RAISED_BODY_LIMITS table.
 *
 * This gate drives a real in-process express app wired EXACTLY like
 * server/index.ts (mountRaisedBodyLimits → global json parser) and probes
 * it over HTTP:
 *
 *   1. For EVERY table row: an over-100KB-but-under-limit JSON body reaches
 *      the route (200 from the stub handler — NOT 413 at the parser), the
 *      body arrives parsed, and rawBody is captured as a Buffer (webhook
 *      signature parity with the global parser).
 *   2. For EVERY table row: an over-limit body 413s.
 *   3. An untouched path (/api/leads) still 413s past 100 KB and still
 *      accepts small bodies — the global DoS posture is intact.
 *   4. Static mount-order check: server/index.ts calls
 *      mountRaisedBodyLimits(app) BEFORE the global express.json parser.
 *   5. DELIBERATE-FAILURE FIXTURE — a regressed app with the mount order
 *      REVERSED (global parser first — the exact bug class this gate
 *      guards) must turn the gate's real assertion red, proving the gate
 *      CATCHES the regression rather than merely running.
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 * Runnable standalone:
 *
 *   npx tsx server/lib/bodyLimits.test.ts
 *
 * Wired into CI as `npm run check:body-limit-preemption`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { RAISED_BODY_LIMITS, mountRaisedBodyLimits } from "./bodyLimits";

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

/* ═══ Fixtures ════════════════════════════════════════════════════════ */

const KB = 1024;
const MB = 1024 * KB;
/** Over the global 100 KB default, under every raised limit (min is 3mb). */
const BIG_BUT_UNDER = 200 * KB;

/** "12mb" / "100kb" → bytes, same binary units the `bytes` lib uses. */
function limitToBytes(limit: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*(kb|mb)$/i.exec(limit);
  if (!m) throw new Error(`unparseable limit: ${limit}`);
  return Math.floor(Number(m[1]) * (m[2].toLowerCase() === "mb" ? MB : KB));
}

/** A valid JSON body of exactly `totalBytes` ASCII bytes. */
function jsonBodyOfSize(totalBytes: number): string {
  const overhead = '{"data":""}'.length;
  return `{"data":"${"x".repeat(totalBytes - overhead)}"}`;
}

/** Mount-path → concrete URL (`:id` etc. → 123). */
function concretize(path: string): string {
  return path.replace(/:[A-Za-z_]+/g, "123");
}

/**
 * An app wired like server/index.ts plus a stub POST route per table row
 * (+ /api/leads as the untouched control).
 *
 * order "fixed"     = raised path-scoped parsers FIRST, then the global one
 *                     (what server/index.ts does).
 * order "regressed" = global parser FIRST (the bug class under test).
 */
function buildApp(order: "fixed" | "regressed") {
  const app = express();
  const mountGlobal = () =>
    app.use(
      express.json({
        verify: (req, _res, buf) => {
          (req as { rawBody?: unknown }).rawBody = buf;
        },
      }),
    );
  if (order === "regressed") mountGlobal();
  mountRaisedBodyLimits(app);
  if (order === "fixed") mountGlobal();

  const stub = (req: express.Request, res: express.Response) => {
    res.json({
      ok: true,
      dataChars: typeof (req.body as { data?: string })?.data === "string" ? (req.body as { data: string }).data.length : 0,
      rawBodyIsBuffer: Buffer.isBuffer((req as { rawBody?: unknown }).rawBody),
    });
  };
  for (const { path } of RAISED_BODY_LIMITS) app.post(path, stub);
  app.post("/api/leads", stub);
  // Quiet error handler — keeps the EXPECTED 413s from spraying stack
  // traces over CI output (express's default dev handler logs them).
  app.use((err: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.status ?? 500).end();
  });
  return app;
}

interface ProbeResult {
  status: number;
  body: { ok?: boolean; dataChars?: number; rawBodyIsBuffer?: boolean } | null;
}

async function withServer(
  order: "fixed" | "regressed",
  fn: (probe: (path: string, totalBytes: number) => Promise<ProbeResult>) => Promise<void>,
): Promise<void> {
  const server = buildApp(order).listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const probe = async (path: string, totalBytes: number): Promise<ProbeResult> => {
    const res = await fetch(`http://127.0.0.1:${port}${concretize(path)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: jsonBodyOfSize(totalBytes),
    });
    const text = await res.text();
    let body: ProbeResult["body"] = null;
    try {
      body = JSON.parse(text);
    } catch {
      /* 413s render express's default html error page — fine. */
    }
    return { status: res.status, body };
  };
  try {
    await fn(probe);
  } finally {
    server.close();
  }
}

/* ═══ 1+2. Every raised path: big body passes, over-limit 413s ════════ */

await withServer("fixed", async (probe) => {
  for (const { path, limit } of RAISED_BODY_LIMITS) {
    await check(`${path} — ${BIG_BUT_UNDER / KB} KB body reaches the route (limit ${limit})`, async () => {
      const r = await probe(path, BIG_BUT_UNDER);
      assert.equal(r.status, 200, `expected the route, got ${r.status} (413 = swallowed by the global parser)`);
      assert.equal(r.body?.ok, true);
      assert.equal(r.body?.dataChars, BIG_BUT_UNDER - '{"data":""}'.length, "body must arrive parsed");
      assert.equal(r.body?.rawBodyIsBuffer, true, "verify hook must capture rawBody as a Buffer");
    });

    await check(`${path} — over-limit body (> ${limit}) 413s`, async () => {
      const r = await probe(path, limitToBytes(limit) + 64 * KB);
      assert.equal(r.status, 413);
    });
  }

  /* ═══ 3. Untouched path keeps the strict global default ═════════════ */

  await check("/api/leads (untouched) — 200 KB body still 413s at the global parser", async () => {
    const r = await probe("/api/leads", BIG_BUT_UNDER);
    assert.equal(r.status, 413, "raising path-scoped limits must NOT loosen the global DoS posture");
  });

  await check("/api/leads (untouched) — small body still parses fine", async () => {
    const r = await probe("/api/leads", 4 * KB);
    assert.equal(r.status, 200);
    assert.equal(r.body?.ok, true);
    assert.equal(r.body?.rawBodyIsBuffer, true);
  });
});

/* ═══ 4. server/index.ts mounts the table BEFORE the global parser ════ */

await check("server/index.ts mount order — mountRaisedBodyLimits(app) precedes the global express.json", () => {
  const src = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  const mountIdx = src.indexOf("mountRaisedBodyLimits(app)");
  assert.ok(mountIdx >= 0, "server/index.ts must call mountRaisedBodyLimits(app)");
  const globalIdx = src.indexOf("express.json({", mountIdx);
  assert.ok(
    globalIdx > mountIdx,
    "no global express.json parser found AFTER mountRaisedBodyLimits(app) — the raised limits are dead code again",
  );
});

/* ═══ 5. DELIBERATE-FAILURE FIXTURE ═══════════════════════════════════
 * The regression class this gate guards: the global 100 KB parser mounted
 * BEFORE the path-scoped ones (exactly what main did before this fix). The
 * gate's REAL assertion (big body reaches the route) must turn red against
 * that wiring — proving the gate CATCHES the regression instead of merely
 * running. (Repo precedent: quoteWidgetUploadRoutes.test.ts case 7.)
 */

await check("DELIBERATE-FAILURE fixture — reversed mount order turns the gate red", async () => {
  await withServer("regressed", async (probe) => {
    const { path } = RAISED_BODY_LIMITS[0];
    const r = await probe(path, BIG_BUT_UNDER);
    let caught: unknown = null;
    try {
      // The REAL gate assertion from case 1:
      assert.equal(r.status, 200);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, "gate assertion must fail red when the global parser preempts the raised limits");
  });
});

/* ═══ Verdict ═════════════════════════════════════════════════════════ */

console.log(`\nbody-limit-preemption gate: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
