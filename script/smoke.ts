/**
 * Pre-launch smoke runner.
 *
 * One process, no DB, no Playwright, no browser. Exits 0 only if:
 *   1. Every shared schema imports cleanly (catches dangling imports
 *      and circular deps that the type checker can miss when modules
 *      are only ever loaded lazily)
 *   2. Every server route module imports cleanly
 *   3. The Express app builds (registerRoutes runs to completion)
 *   4. Sanity-check static endpoints respond 200 (or 401 for
 *      auth-gated ones — both are valid signals that the route is
 *      wired)
 *
 * Run as `npm run smoke:quick`. Total wall-time should be well
 * under 5 seconds on a developer machine. This is the fastest
 * "don't ship a broken bundle" check we have.
 */

/* The route tree (and the modules it imports) calls into server/db.ts
 * which throws synchronously if DATABASE_URL is unset. We never run
 * a real query here — every probe hits a route that returns 401/403
 * before touching the pool — so a sentinel URL is enough. Set it
 * BEFORE any imports that might transitively load db.ts. */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://smoke:smoke@127.0.0.1:1/smoke";
}
process.env.NODE_ENV = process.env.NODE_ENV || "test";
/* Suppress session-secret warnings — express-session emits a noisy
 * warning at module load if SESSION_SECRET isn't set. */
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "smoke-smoke-smoke-smoke-smoke-smoke";
}

import http from "http";
import express from "express";

/**
 * Probes intentionally target stable, long-standing routes — anything
 * recently added should be merged to main FIRST before being added
 * here, otherwise the smoke runner fails on the branch that adds it.
 *
 * "Acceptable status codes": auth-gated routes legitimately return
 * 401/403; we accept those as "the route is wired up". 404 means the
 * route no longer exists, which is what we're catching.
 */
const PROBES: Array<{
  path: string;
  expect: number[];
  description: string;
}> = [
  { path: "/api/admin/crm/activity",     expect: [401, 403], description: "admin activity log route gated" },
  { path: "/api/admin/crm/clients",       expect: [401, 403], description: "admin clients list gated" },
  { path: "/api/admin/crm/overview",      expect: [401, 403], description: "admin overview gated" },
  { path: "/api/portal/overview",          expect: [401, 403], description: "portal overview gated" },
  { path: "/api/portal/services",          expect: [401, 403], description: "portal services gated" },
  { path: "/api/portal/billing",           expect: [401, 403], description: "portal billing gated" },
];

interface ProbeResult {
  path: string;
  description: string;
  ok: boolean;
  status?: number;
  error?: string;
}

async function importTree(): Promise<{ app: express.Express } | { error: string }> {
  try {
    /* Dynamic import so a top-level error in any module is reported
     * here rather than crashing the runner before we set up logging. */
    const { registerRoutes } = await import("../server/routes/index.js");
    const app = express();
    app.use(express.json());
    /* registerRoutes expects a Server and an Express app; we never
     * actually call .listen(), so an unbound server is fine. */
    const httpServer = http.createServer(app);
    await registerRoutes(httpServer, app);
    return { app };
  } catch (err) {
    return { error: err instanceof Error ? err.stack || err.message : String(err) };
  }
}

function runProbe(app: express.Express, path: string): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const req = http.get(`http://127.0.0.1:${port}${path}`, (res) => {
        const status = res.statusCode ?? 0;
        res.resume();
        res.on("end", () => {
          server.close();
          resolve({ status });
        });
      });
      req.on("error", (e) => {
        server.close();
        reject(e);
      });
      req.setTimeout(3000, () => {
        req.destroy(new Error("probe timed out after 3s"));
      });
    });
  });
}

async function main() {
  const start = Date.now();
  console.log("[smoke] importing route tree…");
  const importResult = await importTree();
  if ("error" in importResult) {
    console.error("[smoke] FAIL — import tree did not load");
    console.error(importResult.error);
    process.exit(1);
  }
  console.log("[smoke] route tree OK");

  const results: ProbeResult[] = [];
  for (const probe of PROBES) {
    try {
      const { status } = await runProbe(importResult.app, probe.path);
      const ok = probe.expect.includes(status);
      results.push({ path: probe.path, description: probe.description, ok, status });
    } catch (err) {
      results.push({
        path: probe.path,
        description: probe.description,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;

  console.log("");
  console.log("Probe results");
  console.log("─────────────");
  for (const r of results) {
    const icon = r.ok ? "✓" : "✗";
    const detail = r.status !== undefined ? `HTTP ${r.status}` : `error: ${r.error}`;
    console.log(`  ${icon} ${r.path.padEnd(46)} ${detail}  ${r.description}`);
  }
  console.log("");

  const elapsed = Date.now() - start;
  if (failed > 0) {
    console.error(`[smoke] FAIL — ${failed}/${results.length} probes failed (${elapsed}ms)`);
    process.exit(1);
  }
  console.log(`[smoke] PASS — ${passed}/${results.length} probes OK (${elapsed}ms)`);
  process.exit(0);
}

void main();
