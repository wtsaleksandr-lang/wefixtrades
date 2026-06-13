/**
 * Regression test for the TradeLine param-route shadow bug
 * (fix/tradeline-param-route-nan-guard).
 *
 * `GET /api/portal/tradeline/:clientServiceId` is registered (inside
 * registerPortalRoutes) BEFORE the literal `/setup`, `/knowledge`, `/voices`,
 * and `/settings` handlers. Express 5 (path-to-regexp v8) removed inline-regex
 * route constraints, so the param route matches ANY single segment — including
 * those literals. It previously answered a non-numeric id with
 * `res.status(400)`, which SHADOWED every literal sub-route (the main
 * dashboard's /setup banner fetch 400'd for every client; the Teach panel's
 * /knowledge fetch too).
 *
 * The fix makes the param handler `return next()` on a non-numeric id, so the
 * request falls through to whatever literal route is registered for that path,
 * regardless of registration order. This test invokes the ACTUAL handler from
 * the ACTUAL registrar with `clientServiceId="setup"` and asserts it defers
 * (next called, no 400) — and still 400s on a genuinely malformed numeric id
 * is NOT what we want either: a non-numeric segment is simply "not ours".
 *
 * Run: tsx tests/tradeline-param-route-fallthrough.test.ts  (no DB — the
 * handler defers before touching storage; DATABASE_URL may be a dummy.)
 */

// Side-effect FIRST: sets a dummy DATABASE_URL before the registrar transitively
// evaluates server/db.ts (which throws at module-eval if DATABASE_URL is unset).
import "./audit/_failover-env-setup";

import type { Express } from "express";
import { registerPortalTradelineRoutes } from "../server/routes/portal/tradeline";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

// Fake Express app that records every route registration. We only care about
// app.get for the param path; capture its final handler (after middleware).
type Registered = { method: string; path: string; handlers: Function[] };
const routes: Registered[] = [];
const fakeApp = new Proxy(
  {},
  {
    get(_t, method: string) {
      return (path: string, ...handlers: Function[]) => {
        routes.push({ method, path, handlers });
      };
    },
  },
) as unknown as Express;

registerPortalTradelineRoutes(fakeApp);

const paramRoute = routes.find(
  (r) => r.method === "get" && r.path === "/api/portal/tradeline/:clientServiceId",
);
check("param route is registered", !!paramRoute);

const handler = paramRoute?.handlers[paramRoute.handlers.length - 1];
check("param route has a terminal handler", typeof handler === "function");

console.log("param route falls through on a non-numeric segment (literal sub-routes win)");
async function drive(segment: string) {
  let nextCalled = false;
  let statusCode: number | null = null;
  const req: any = { params: { clientServiceId: segment }, query: {}, headers: {} };
  const res: any = {
    status(code: number) { statusCode = code; return this; },
    json() { return this; },
    send() { return this; },
  };
  const next = () => { nextCalled = true; };
  await handler!(req, res, next);
  return { nextCalled, statusCode };
}

for (const seg of ["setup", "knowledge", "voices", "settings"]) {
  const { nextCalled, statusCode } = await drive(seg);
  check(`"${seg}" → next() called`, nextCalled, { seg });
  check(`"${seg}" → did NOT answer with 400`, statusCode !== 400, { seg, statusCode });
}

if (failures > 0) {
  console.error(`\ntradeline-param-route-fallthrough: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\ntradeline-param-route-fallthrough: all assertions passed");
process.exit(0);
