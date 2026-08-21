/**
 * Regression guard: /api/portal/overview leads-series query.
 *
 * The dashboard hero sparkline counts leads for the client's calculators. But
 * calculators are owned by a USER (`calculators.user_id → users.id`) — there is
 * NO `calculators.client_id` column. A prior version filtered the join on
 * `c.client_id`, which threw "column c.client_id does not exist" and 500'd the
 * ENTIRE client dashboard ("We hit a snag loading your dashboard") for every
 * client. This guard fails if that mistake is reintroduced. It is a source-level
 * assertion (no DB) so it runs in the DB-less CI `gate` job.
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "portalRoutes.ts"), "utf8");

// Isolate the overview handler body so we assert against the right query.
const start = src.indexOf('app.get("/api/portal/overview"');
assert.ok(start !== -1, "could not find the /api/portal/overview handler");
const body = src.slice(start, start + 4000);

// The calculators alias `c` must be joined/scoped by user_id, never client_id.
assert.ok(
  /JOIN\s+\$\{calculators\}\s+c\b/.test(body),
  "overview must join the calculators table aliased as c",
);
assert.ok(
  /c\.user_id\s*=/.test(body),
  "overview leads-series must scope calculators by c.user_id (calculators are owned by users, not clients)",
);
assert.ok(
  !/c\.client_id/.test(body),
  "REGRESSION: overview references c.client_id — that column does not exist and 500s the whole dashboard; scope by c.user_id instead",
);

// Missing client row must be handled, not dereferenced into a 500.
assert.ok(
  /if\s*\(\s*!client\s*\)\s*return\s+res\.status\(\s*404/.test(body),
  "overview must guard a missing client row with a 404 rather than throwing on client.business_name",
);

console.log("portal-overview guard: OK (calculators scoped by user_id; missing-client guarded)");
