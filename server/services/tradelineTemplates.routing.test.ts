/**
 * TradeLine selectTemplate — specificity-scoring routing tests.
 *
 * Runnable standalone via:
 *   DATABASE_URL=postgres://test:test@127.0.0.1:5432/test_unused \
 *     npx tsx server/services/tradelineTemplates.routing.test.ts
 *
 * Excluded from `tsc --noEmit` (tsconfig.json excludes **\/*.test.ts).
 *
 * Regression guard for the P0 mis-route fixed by replacing first-substring
 * match with specificity scoring: a precise full-phrase trade-type must reach
 * its dedicated template, not a more-general template that merely shares a
 * shorter substring. Each fix has a DELIBERATE-CONTRAST twin (the bare
 * substring still routes to the general template) proving scoring — not luck —
 * is the discriminator.
 */

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test_unused";
}

import assert from "node:assert/strict";
import { selectTemplate } from "./tradelineTemplates";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): Promise<void> {
  return Promise.resolve()
    .then(fn)
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

async function run(): Promise<void> {
  /* ═══ P0 — the two audit-flagged mis-routes ═══ */

  await test("'water damage restoration' → water_damage_restoration (was general_contractor)", () => {
    assert.equal(selectTemplate("water damage restoration").id, "water_damage_restoration");
  });

  await test("'foundation repair' → foundation_repair (was concrete)", () => {
    assert.equal(selectTemplate("foundation repair").id, "foundation_repair");
  });

  /* ═══ Two more precise-phrase routes that the old first-match broke ═══ */

  await test("'sewer line cleaning' → sewer_drain (not plumbing's bare 'sewer')", () => {
    assert.equal(selectTemplate("sewer line cleaning").id, "sewer_drain");
  });

  await test("'garage floor epoxy' → garage_floor_epoxy (not garage_door's bare 'garage')", () => {
    assert.equal(selectTemplate("garage floor epoxy").id, "garage_floor_epoxy");
  });

  await test("'sprinkler system repair' → irrigation_sprinkler (not landscaping's bare 'sprinkler')", () => {
    assert.equal(selectTemplate("sprinkler system repair").id, "irrigation_sprinkler");
  });

  await test("'roll-off dumpster rental' → dumpster_rental (not junk_removal's bare 'dumpster')", () => {
    assert.equal(selectTemplate("roll-off dumpster rental").id, "dumpster_rental");
  });

  await test("'pressure washing' → pressure_washing", () => {
    assert.equal(selectTemplate("pressure washing").id, "pressure_washing");
  });

  /* ═══ Deliberate-contrast twins: the bare substring still routes to the
        general template, proving scoring routes on specificity, not order ═══ */

  await test("CONTRAST: bare 'water damage' still → general_contractor", () => {
    assert.equal(selectTemplate("water damage").id, "general_contractor");
  });

  await test("CONTRAST: bare 'foundation' (no 'repair') still → concrete", () => {
    assert.equal(selectTemplate("foundation").id, "concrete");
  });

  /* ═══ Existing strong templates still route correctly under scoring ═══ */

  await test("'hvac repair' → hvac", () => {
    assert.equal(selectTemplate("hvac repair").id, "hvac");
  });

  await test("'appliance repair' → appliance_repair", () => {
    assert.equal(selectTemplate("appliance repair").id, "appliance_repair");
  });

  await test("'flooring installation' → flooring", () => {
    assert.equal(selectTemplate("flooring installation").id, "flooring");
  });

  /* ═══ Removed dangerous short patterns no longer over-grab ═══ */

  await test("'house cleaning' → house_cleaning (kept) — bare 'clean' substring pattern removed", () => {
    assert.equal(selectTemplate("house cleaning").id, "house_cleaning");
  });

  await test("'kitchen countertop quote' → countertop_installer — bare 'counter' removed but full phrase still routes", () => {
    assert.equal(selectTemplate("kitchen countertop quote").id, "countertop_installer");
  });

  /* ═══ Fallback ═══ */

  await test("null trade type → generic", () => {
    assert.equal(selectTemplate(null).id, "generic");
  });

  await test("nonsense trade type → generic", () => {
    assert.equal(selectTemplate("zzz no such trade zzz").id, "generic");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
