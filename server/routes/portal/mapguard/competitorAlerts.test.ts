/**
 * MapGuard competitor-alerts guard.
 *
 * The panel is a SOLD feature (AdvancedOnly, MapGuard dashboard) and it
 * returned `{events: []}` on 100% of calls from Wave 27 until this fix,
 * because the consumer read metric_data keys the producer has never written:
 *
 *   producer  server/services/mapguardAlerts.ts:125
 *             metric_data = { rank_drops: [{ keyword, from, to }], count }
 *   consumer  competitorAlerts.ts (old)
 *             meta.keyword / meta.keywords   → undefined → null
 *             → `if (!keyword) return null`  → every row dropped
 *
 * Nothing looked broken: the feed rendered a confident empty state claiming
 * the first scan was still pending, forever. That is the worst failure mode —
 * a silent wrong answer nobody files a ticket for.
 *
 * Sections 1-4 are BEHAVIOURAL: they run the real projection over a fixture
 * built from the producer's literal output shape, so they go red against the
 * pre-fix implementation. Section 5 cross-reads the producer source, so a
 * rename on EITHER side of the seam reds this guard instead of silently
 * emptying the panel again.
 *
 * Source-level + pure-function assertions only (no DB) so it runs in the
 * DB-less CI `gate` job.
 */

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectAlerts } from "./competitorAlertProjection";

const here = dirname(fileURLToPath(import.meta.url));
const producer = readFileSync(
  join(here, "..", "..", "..", "services", "mapguardAlerts.ts"),
  "utf8",
);
// The element shape {keyword, from, to} is built one layer up, by the monitor.
const monitor = readFileSync(
  join(here, "..", "..", "..", "services", "mapguardMonitor.ts"),
  "utf8",
);
const projection = readFileSync(join(here, "competitorAlertProjection.ts"), "utf8");
const feed = readFileSync(
  join(here, "..", "..", "..", "..", "client", "src", "components", "mapguard", "CompetitorAlertFeed.tsx"),
  "utf8",
);
const dashboard = readFileSync(
  join(here, "..", "..", "..", "..", "client", "src", "pages", "portal", "mapguard", "MapGuardDashboard.tsx"),
  "utf8",
);

/* ─── 1. The real producer payload must project to real events ──────────── */

// Byte-for-byte the shape written at mapguardAlerts.ts:125 for a rank_drops
// alert — `rank_drops` array of {keyword, from, to} plus `count`.
const realRow = {
  id: 4211,
  severity: "warning",
  created_at: new Date("2026-08-01T12:00:00.000Z"),
  metric_data: {
    rank_drops: [
      { keyword: "emergency plumber toronto", from: 3, to: 9 },
      { keyword: "drain cleaning near me", from: 5, to: 12 },
    ],
    count: 2,
  },
};

const events = projectAlerts(realRow);

assert.ok(
  events.length > 0,
  "REGRESSION: the producer's own rank_drops payload projected to ZERO events. " +
    "This is the exact always-empty bug — a sold panel showing nothing forever. " +
    "The keyword lives at metric_data.rank_drops[i].keyword, not metric_data.keyword.",
);
assert.strictEqual(
  events.length,
  2,
  "One alert row carries N keyword drops and must fan out to N events, one per keyword.",
);
assert.deepStrictEqual(
  events.map((e) => e.keyword),
  ["emergency plumber toronto", "drain cleaning near me"],
  "Keywords must be read from the NESTED rank_drops[i].keyword.",
);

/* ─── 2. Ranks come from `from`/`to`, not previous_rank/current_rank ────── */

assert.strictEqual(
  events[0].previous_rank,
  3,
  "REGRESSION: previous_rank must map from rank_drops[i].from. Reading a " +
    "`previous_rank` key the producer never writes leaves it null and the " +
    "feed silently drops its 'rank #X → #Y' line.",
);
assert.strictEqual(events[0].current_rank, 9, "current_rank must map from rank_drops[i].to.");
assert.strictEqual(events[1].previous_rank, 5);
assert.strictEqual(events[1].current_rank, 12);

// Ids must stay unique once one row fans out, or React keys collide.
assert.strictEqual(new Set(events.map((e) => e.id)).size, events.length,
  "Fanned-out events must have unique ids.");

/* ─── 3. Nothing is fabricated when the producer does not supply it ─────── */

assert.strictEqual(
  events[0].pin_row,
  null,
  "REGRESSION: the rank-drop pipeline has NO pin concept, so pin_row must be " +
    "null — not a hardcoded 2. Defaulting to (2,2) told every customer the drop " +
    "happened at a specific grid cell we never measured.",
);
assert.strictEqual(events[0].pin_col, null, "pin_col must be null when unmeasured.");
assert.strictEqual(
  events[0].competitor_name,
  "A competitor",
  "The alert layer records THAT the customer was overtaken, never by whom. " +
    "Naming a specific competitor here would be fabricated attribution.",
);
assert.ok(
  !feed.includes("pin ({evt.pin_row + 1},{evt.pin_col + 1})") ||
    feed.includes("evt.pin_row != null && evt.pin_col != null"),
  "REGRESSION: the feed must omit the pin chip when pin_row/pin_col are null, " +
    "never render an invented cell.",
);

/* ─── 4. Malformed / empty metadata degrades cleanly, never throws ──────── */

for (const bad of [
  null,
  {},
  { rank_drops: [] },
  { rank_drops: "nope" },
  { rank_drops: [null, 42, {}, { keyword: "" }, { from: 1, to: 2 }] },
  { local_pack_delta: -3, current: 1 },
]) {
  const out = projectAlerts({ id: 1, severity: null, created_at: null, metric_data: bad });
  assert.ok(Array.isArray(out), `projectAlerts must always return an array (input ${JSON.stringify(bad)})`);
  assert.strictEqual(out.length, 0,
    `Metadata with no usable keyword must yield no events, not a fabricated one (input ${JSON.stringify(bad)})`);
}

// A partially-valid array keeps the good entries and drops the junk.
const mixed = projectAlerts({
  id: 7,
  severity: "critical",
  created_at: null,
  metric_data: { rank_drops: [{ keyword: "roof repair", from: 1, to: 4 }, { from: 2, to: 8 }] },
});
assert.strictEqual(mixed.length, 1, "Entries without a keyword are skipped, valid ones kept.");
assert.strictEqual(mixed[0].severity, "critical", "Row severity flows through.");

/* ─── 5. The producer↔consumer seam is pinned on BOTH sides ─────────────── */

assert.ok(
  /metric_data:\s*\{\s*rank_drops:/.test(producer),
  "REGRESSION: mapguardAlerts.ts no longer writes metric_data.rank_drops. " +
    "If the producer key is renamed, update competitorAlertProjection.ts in the " +
    "same commit — a silent rename empties the sold competitor panel again.",
);
assert.ok(
  /rank_drops\.push\(\{\s*keyword:\s*[^,]+,\s*from:\s*[^,]+,\s*to:/.test(monitor),
  "REGRESSION: the rank_drops element shape {keyword, from, to} changed in " +
    "mapguardMonitor.ts. The projection reads exactly those three names.",
);
assert.ok(
  /rank_drops:\s*Array<\{\s*keyword:\s*string;\s*from:[^;]+;\s*to:/.test(monitor),
  "REGRESSION: the declared rank_drops element type no longer is " +
    "{keyword, from, to} — the projection reads exactly those three names.",
);
assert.ok(
  projection.includes("meta.rank_drops") && projection.includes("rec.keyword"),
  "REGRESSION: the projection stopped reading the nested rank_drops[i].keyword.",
);
assert.ok(
  !/if\s*\(!keyword\)\s*return null/.test(projection),
  "REGRESSION: the unconditional single-keyword reject is back — that guard is " +
    "what dropped 100% of rows.",
);

/* ─── 6. The empty state may not claim a scan is pending when it is not ─── */

// Read the emptyAlerts DECLARATION only, so a comment quoting the old code
// (like the one left in the dashboard explaining this fix) cannot mask it.
const emptyDecl = /const emptyAlerts\s*=([\s\S]*?);/.exec(dashboard)?.[1] ?? "";
assert.ok(emptyDecl.length > 0, "Could not locate the emptyAlerts derivation in MapGuardDashboard.tsx.");
assert.ok(
  !/!\s*alertsQuery\.isLoading/.test(emptyDecl),
  "REGRESSION: emptyAlerts derived from `!alertsQuery.isLoading` is true for " +
    "EVERY settled query, so a monitored client with zero rank drops was told " +
    "'First rank-grid scan runs within 24h of activation' — forever. Gate the " +
    "claim on previewMode/monitored instead.",
);
assert.ok(
  emptyDecl.includes("monitored") && emptyDecl.includes("previewMode"),
  "The empty state must distinguish preview / not-yet-scanned from scanned-and-clear.",
);

console.log(
  "mapguard-competitor-alerts guard: OK (producer rank_drops[i].keyword projects to real events; " +
    "from/to → previous/current rank; pins and competitor identity never fabricated; " +
    "malformed metadata yields no events; empty state cannot falsely claim a pending scan)",
);
