/**
 * Unit smoke tests for the Wave 82 central SMS template registry.
 *
 * Excluded from `tsc --noEmit` via the **\/*.test.ts ignore. Runnable as:
 *
 *   npx tsx shared/sms/templateRegistry.test.ts
 *
 * Coverage:
 *   1. Every registry id has a body, vars, and description
 *   2. Declared `vars` actually appear as {placeholders} in defaultBody
 *      (and vice-versa — no orphan placeholders)
 *   3. First-touch carrier-compliance templates are non-disable-able and
 *      contain STOP + HELP keywords
 *   4. interpolate replaces known vars and leaves unknown literal
 *   5. interpolate treats null/undefined/empty as missing (literal)
 *   6. interpolate coerces numbers to strings
 */
import assert from "node:assert/strict";
import {
  SMS_TEMPLATE_REGISTRY,
  SMS_TEMPLATE_IDS,
  interpolate,
} from "./templateRegistry";

let passed = 0;
let failed = 0;

function check(label: string, fn: () => void): void {
  try {
    fn();
    passed++;
    // eslint-disable-next-line no-console
    console.log(`  ok  ${label}`);
  } catch (err: any) {
    failed++;
    // eslint-disable-next-line no-console
    console.error(`  FAIL ${label}: ${err?.message ?? err}`);
  }
}

// 1
check("every registry id has body / vars / description", () => {
  for (const id of SMS_TEMPLATE_IDS) {
    const t = SMS_TEMPLATE_REGISTRY[id];
    assert.ok(t.defaultBody && t.defaultBody.length > 10, `${id}: defaultBody`);
    assert.ok(Array.isArray(t.vars), `${id}: vars`);
    assert.ok(t.description && t.description.length > 10, `${id}: description`);
  }
});

// 2 — vars ↔ {placeholders} parity
check("declared vars match defaultBody placeholders", () => {
  for (const id of SMS_TEMPLATE_IDS) {
    const t = SMS_TEMPLATE_REGISTRY[id];
    const found = new Set<string>();
    t.defaultBody.replace(/\{([a-z_][a-z0-9_]*)\}/gi, (_m, name) => {
      found.add(name);
      return _m;
    });
    const declared = new Set(t.vars);
    for (const v of found) {
      assert.ok(declared.has(v), `${id}: placeholder {${v}} not declared in vars`);
    }
    for (const v of declared) {
      assert.ok(found.has(v), `${id}: declared var ${v} missing from defaultBody`);
    }
  }
});

// 3 — first-touch compliance guardrails
check("first-touch templates carry STOP + HELP and are non-disable-able", () => {
  const firstTouch = ["bookflow.confirmation", "quotequick.quote_ready"] as const;
  for (const id of firstTouch) {
    const t = SMS_TEMPLATE_REGISTRY[id];
    assert.ok(/STOP/i.test(t.defaultBody), `${id}: missing STOP`);
    assert.ok(/HELP/i.test(t.defaultBody), `${id}: missing HELP`);
    assert.equal(t.canBeDisabled, false, `${id}: must be non-disable-able`);
  }
});

// 4
check("interpolate replaces known + leaves unknown literal", () => {
  assert.equal(interpolate("Hi {name}!", { name: "Sam" }), "Hi Sam!");
  assert.equal(interpolate("Hi {who}!", { name: "Sam" }), "Hi {who}!");
});

// 5
check("interpolate leaves null / undefined / empty literal (observability)", () => {
  const out = interpolate("a={a}, b={b}, c={c}, d={d}", {
    a: undefined,
    b: null,
    c: "",
    d: "ok",
  });
  assert.equal(out, "a={a}, b={b}, c={c}, d=ok");
});

// 6
check("interpolate coerces numbers to strings", () => {
  assert.equal(interpolate("Total: ${amount}", { amount: 42 }).replace(/\$/, ""), "Total: 42");
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
