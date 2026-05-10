/**
 * Self-contained verification of server/services/mapguardKeywords.ts.
 *
 * Run with: npx tsx scripts/verify-mapguard-keywords.ts
 *
 * No DB / network required. Exit 0 on all green, 1 on any failure.
 */

import { buildMonitorKeywords } from "../server/services/mapguardKeywords";

let passed = 0;
let failed = 0;

function assert(label: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`  ✓ ${label}${detail ? ` (${detail})` : ""}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ` (${detail})` : ""}`); failed++; }
}

console.log("\n[1] Curated trade overrides");
{
  const out = buildMonitorKeywords("plumber", "Sydney");
  assert("plumber bundle includes 'blocked drain Sydney'", out.includes("blocked drain Sydney"));
  assert("plumber bundle includes 'emergency plumber Sydney'", out.includes("emergency plumber Sydney"));
  assert("plumber bundle has 6+ candidates", out.length >= 6, `n=${out.length}`);
}
{
  const out = buildMonitorKeywords("electrician", "Brisbane");
  assert("electrician bundle includes 'switchboard upgrade Brisbane'", out.includes("switchboard upgrade Brisbane"));
}
{
  const out = buildMonitorKeywords("locksmith", "Melbourne");
  assert("locksmith bundle leads with 'locksmith Melbourne'", out[0] === "locksmith Melbourne");
  assert("locksmith bundle includes 'emergency locksmith Melbourne'", out.includes("emergency locksmith Melbourne"));
}

console.log("\n[2] Category-fallback for non-curated trades");
{
  const out = buildMonitorKeywords("kitchen_remodeling", "Perth");
  // Should NOT contain underscores
  assert("kitchen_remodeling humanises to 'kitchen remodeling'",
    out.every(k => !k.includes("_")),
    out.find(k => k.includes("_")) || "all clean");
  assert("kitchen_remodeling includes 'kitchen remodeling Perth'",
    out.includes("kitchen remodeling Perth"));
  assert("kitchen_remodeling does NOT include 'emergency kitchen remodeling'",
    !out.some(k => k.startsWith("emergency")),
    "good");
}
{
  const out = buildMonitorKeywords("commercial_cleaning", "Adelaide");
  assert("commercial_cleaning humanises (no underscores)",
    out.every(k => !k.includes("_")));
}

console.log("\n[3] Generic fallback for unknown trades");
{
  const out = buildMonitorKeywords("solar_panel_installer", "Hobart");
  assert("unknown trade generates >= 4 candidates", out.length >= 4, `n=${out.length}`);
  assert("unknown trade no underscores", out.every(k => !k.includes("_")));
  assert("unknown non-emergency trade omits 'emergency'",
    !out.some(k => k.startsWith("emergency")));
}

console.log("\n[4] Emergency-eligible generic fallback");
{
  // Hypothetical not in the curated map but in EMERGENCY_TRADES
  const out = buildMonitorKeywords("hvac", "Canberra");
  assert("hvac uses curated bundle (override)", out.includes("air conditioning Canberra"));
}

console.log("\n[5] Edge cases");
{
  const out = buildMonitorKeywords("", "Sydney");
  assert("empty trade falls back to 'trades'", out.length > 0 && out[0].includes("trades"));
}
{
  const out = buildMonitorKeywords("PLUMBER", "Sydney");
  assert("trade is case-insensitive — uppercase 'PLUMBER' still matches override",
    out.includes("blocked drain Sydney"));
}

console.log("\n[6] Dedupe");
{
  const out = buildMonitorKeywords("plumber", "Sydney");
  const lowered = out.map(k => k.toLowerCase());
  const uniq = new Set(lowered);
  assert("no duplicate keywords (case-insensitive)", lowered.length === uniq.size,
    `${lowered.length} items, ${uniq.size} unique`);
}

console.log(`\n${"=".repeat(50)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
