/**
 * Regression guard: AdFlow 1-click actions must not claim an outcome that
 * cannot happen, and no supplier brief may be mailed to a placeholder domain.
 *
 * (a) AdFlow has ZERO ad-platform integration — no Google Ads / Meta Ads API
 *     client, no ad-account OAuth, no write path to any campaign. Metrics are
 *     typed in by hand by ops. Yet the handler replied "Auto-pause approved —
 *     campaign paused, you'll see it in the dashboard within a few minutes"
 *     while doing literally nothing: no task, no email, no ops notification.
 *     Campaign status is read from a hand-typed JSON blob, so the dashboard
 *     would keep showing "Active" forever.
 *
 * (b) seed-suppliers.ts seeded design@example.com / adflow-agency@example.com
 *     as active email suppliers. autoAssignSupplier matched them and
 *     dispatchViaEmail mailed briefs — for SiteLaunch, including the
 *     customer's full onboarding answers — to a domain nobody owns.
 *
 * Source-level assertions plus a pure-function test (no DB) so this runs in
 * the DB-less CI `gate` job.
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isUndeliverablePlaceholderEmail } from "../../supplierPlaceholder";

const here = dirname(fileURLToPath(import.meta.url));
const handler = readFileSync(join(here, "adflow.ts"), "utf8");
const servicesDir = join(here, "..", "..");
const assignment = readFileSync(join(servicesDir, "supplierAssignment.ts"), "utf8");
const dispatch = readFileSync(join(servicesDir, "supplierDispatch.ts"), "utf8");
const seed = readFileSync(
  join(servicesDir, "..", "scripts", "seed-suppliers.ts"),
  "utf8",
);
const mapguardKpis = readFileSync(
  join(servicesDir, "..", "routes", "portal", "mapguard", "dashboardKpis.ts"),
  "utf8",
);

/* ─── 1. No action may assert a completed platform change ────────────── */

/**
 * Strip comments so the docblock explaining WHY these strings were removed
 * doesn't trip the check that they are gone from the code.
 */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const handlerCode = stripComments(handler);

const FORBIDDEN_CLAIMS = [
  "campaign paused",
  "will get more spend tomorrow",
  "Auto-pause approved",
];
for (const claim of FORBIDDEN_CLAIMS) {
  assert.ok(
    !handlerCode.includes(claim),
    `REGRESSION: AdFlow handler replies "${claim}". Nothing is paused, boosted or scheduled — there is no ad-platform integration. Say what actually happened: a request was logged.`,
  );
}

/* ─── 2. Request-shaped actions must create real work ────────────────── */

assert.ok(
  handler.includes("storage.createFulfillmentTask"),
  "REGRESSION: AdFlow actions no longer create a fulfillment task. 'Request logged / your ops team will action it' is only true if a task exists.",
);
assert.ok(
  /if \(request\) \{[\s\S]{0,600}?createFulfillmentTask/.test(handler),
  "the task must be created for every request-shaped action",
);
assert.ok(
  /catch[\s\S]{0,400}?success: false[\s\S]{0,200}?couldn't log that request/.test(handler),
  "if the task write fails we must NOT tell the customer the request was logged",
);

/* ─── 3. Confirmations must state that nothing changed yet ───────────── */

assert.ok(
  handler.includes("Nothing has changed on your live campaign yet."),
  "request confirmations must say plainly that the live campaign is unchanged",
);

/* ─── 4. Placeholder-domain guard: pure behaviour ────────────────────── */

for (const bad of [
  "design@example.com",
  "adflow-agency@example.com",
  "seo@example.com",
  "someone@sub.example.com",
  "x@example.org",
  "y@foo.invalid",
  "unverified+mahmoud@fiverr-lead.local",
]) {
  assert.strictEqual(
    isUndeliverablePlaceholderEmail(bad),
    true,
    `${bad} must be treated as an undeliverable placeholder`,
  );
}
for (const good of [
  "alex@wefixtrades.com",
  "支持@example-agency.com",
  "hello@myexamples.com",
  "ops@exampleagency.co.uk",
]) {
  assert.strictEqual(
    isUndeliverablePlaceholderEmail(good),
    false,
    `${good} is a real address and must NOT be blocked`,
  );
}
assert.strictEqual(isUndeliverablePlaceholderEmail(null), false);
assert.strictEqual(isUndeliverablePlaceholderEmail(""), false);
assert.strictEqual(isUndeliverablePlaceholderEmail("no-at-sign"), false);

/* ─── 5. The guard is wired into BOTH the assign and send paths ──────── */

assert.ok(
  assignment.includes("isUndeliverablePlaceholderEmail"),
  "autoAssignSupplier must skip placeholder-email suppliers so work is never routed to them",
);
assert.ok(
  dispatch.includes("isUndeliverablePlaceholderEmail"),
  "dispatchViaEmail must refuse to send to a placeholder address — rows seeded before the guard may still be active in an existing database",
);
assert.ok(
  dispatch.includes("supplier_placeholder_email"),
  "the blocked dispatch must report a distinct reason so it is visible in logs",
);

/* ─── 6. The seed roster must be inactive ────────────────────────────── */

const seedBody = seed.slice(seed.indexOf("const SUPPLIER_SEEDS"));
for (const placeholder of [
  "design@example.com",
  "seo@example.com",
  "content@example.com",
  "ads@example.com",
  "adflow-agency@example.com",
]) {
  const idx = seedBody.indexOf(placeholder);
  assert.ok(idx !== -1, `expected the ${placeholder} seed entry to still exist (kept so an admin can fill in a real address)`);
  const entry = seedBody.slice(idx, idx + 400);
  assert.ok(
    entry.includes("is_active: false"),
    `REGRESSION: ${placeholder} is seeded active. It becomes a live email dispatch target for real customer briefs.`,
  );
}

/* ─── 7. MapGuard: no fabricated pin geography ───────────────────────── */

assert.ok(
  !/Math\.floor\(idx \/ 5\) % 5/.test(stripComments(mapguardKpis)),
  "REGRESSION: MapGuard buildGrid scatters keyword ranks across map pins by array index. The scan is city-wide (no coordinates), so this paints an unmeasured rank onto a specific location on a real Google map.",
);
assert.ok(
  /if \(typeof entry\.pinRow !== "number" \|\| typeof entry\.pinCol !== "number"\) return;/.test(mapguardKpis),
  "grid cells may only be populated from an explicit pinRow/pinCol written by a geo-aware scan",
);
assert.ok(
  /if \(cur\.size === 0\) return \[\];/.test(mapguardKpis),
  "with no per-pin data the grid must be empty so the dashboard shows its 'not measured here' state instead of an invented map",
);
assert.ok(
  !/const total = cells\.length \|\| 25;/.test(stripComments(mapguardKpis)),
  "REGRESSION: top-3 coverage divides by a fixed 25 grid size even though far fewer keywords are ever scanned, structurally deflating the number",
);

console.log(
  "adflow-action-honesty guard: OK (no false campaign-state claims; requests create real tasks; placeholder domains blocked on assign+send; MapGuard grid geography not fabricated)",
);
