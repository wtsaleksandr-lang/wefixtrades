/**
 * Tests for the ops-engine AI JSON parser (Sentry NODEWEFIXTRADES-A —
 * "Unexpected end of JSON input" on the daily 07:00 ops summary).
 *
 * Excluded from `tsc --noEmit` (tsconfig `**\/*.test.ts`). Runnable standalone:
 *
 *   npx tsx server/services/opsEngine.parse.test.ts
 *
 * Deliberate-failure fixture: a truncated model reply (the production
 * failure) must throw a DIAGNOSABLE error ("likely truncated"), not the
 * bare JSON.parse message — and prose-wrapped/fenced replies must parse.
 */
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://stub:stub@localhost:5432/stub";
process.env.NODE_ENV ||= "test";

let failures = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err: any) {
    failures++;
    console.error(`  FAIL ${name}\n      ${err?.message ?? err}`);
  }
}

async function main() {
  const { parseOpsJson } = await import("./opsEngine");

  const obj = { summary: "fine", priorities: [], risks: [], recommendations: [] };

  test("plain JSON parses", () => {
    assert.deepEqual(parseOpsJson(JSON.stringify(obj)), obj);
  });

  test("markdown-fenced JSON parses", () => {
    assert.deepEqual(parseOpsJson("```json\n" + JSON.stringify(obj) + "\n```"), obj);
  });

  test("prose-wrapped JSON salvages the outermost object", () => {
    const raw = "Here is the summary you asked for:\n" + JSON.stringify(obj) + "\nLet me know!";
    assert.deepEqual(parseOpsJson(raw), obj);
  });

  test("FIXTURE truncated JSON (the production failure) → diagnosable error, not raw JSON.parse text", () => {
    const truncated = JSON.stringify(obj).slice(0, 25); // cut mid-object
    assert.throws(() => parseOpsJson(truncated), /truncated|unparseable/i);
  });

  test("empty / whitespace reply → clear error", () => {
    assert.throws(() => parseOpsJson(""), /empty/i);
    assert.throws(() => parseOpsJson("   \n"), /empty/i);
  });

  test("non-JSON prose with no object → clear error", () => {
    assert.throws(() => parseOpsJson("I could not generate a summary today."), /not JSON/i);
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\nall opsEngine parse tests passed");
}

main();
