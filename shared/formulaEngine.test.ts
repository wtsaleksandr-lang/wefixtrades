/**
 * QuoteQuick formula-engine guard — `shared/formulaEngine.ts`.
 *
 * The advanced calculator builder lets a tradesperson author arbitrary
 * pricing formulas. This module tokenizes, parses and evaluates them, and
 * its output IS the customer's quote. It had zero test coverage.
 *
 * Pinned contracts:
 *   - SECURITY: no `eval` / `new Function` / `Function(...)` anywhere in the
 *     source. The module's entire reason to exist is being a hand-written
 *     evaluator instead of a JS escape hatch, so that property is asserted
 *     against the file text itself, not just its behaviour.
 *   - PEMDAS + right-associative `^`, unary minus, parentheses
 *   - every documented function: SUM MAX MIN ROUND ROUNDUP ROUNDDOWN ABS IF
 *     AND OR NOT CONTAINS RAND RANDBETWEEN MROUND CEILING FLOOR
 *   - runCalculations() chains named calcs so a subtotal can feed a total
 *   - malformed input NEVER throws out of the public API — it returns
 *     { ok:false, value:0, error } so the widget can refuse to quote
 *
 * WRONG-QUOTE edge cases are covered explicitly and labelled FINDING where
 * the current behaviour is a genuine hazard rather than a design choice.
 *
 * Runnable standalone via:
 *   npx tsx shared/formulaEngine.test.ts
 * Wired into CI as `npm run check:formula-engine` (.github/workflows/ci.yml).
 *
 * DB-free. Excluded from `tsc --noEmit` via the project tsconfig's
 * **\/*.test.ts pattern. Uses node:assert/strict, no test runner dependency.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
}

import {
  evaluateFormula,
  runCalculations,
  validateFormula,
  type Calculation,
  type FormulaContext,
} from "./formulaEngine";

let checks = 0;
function check(cond: unknown, msg: string): void {
  checks++;
  assert.ok(cond, msg);
}
function eq<T>(actual: T, expected: T, msg: string): void {
  checks++;
  assert.equal(actual, expected, msg);
}

/** Evaluate and assert success + value. */
function val(expr: string, expected: number, msg: string, ctx: FormulaContext = {}): void {
  const r = evaluateFormula(expr, ctx);
  checks++;
  assert.ok(r.ok, `${msg} — expected ok, got error: ${r.error}`);
  eq(r.value, expected, msg);
}

/** Evaluate and assert a graceful failure (never a throw). */
function fails(expr: string, msg: string, ctx: FormulaContext = {}): string {
  const r = evaluateFormula(expr, ctx);
  checks++;
  assert.equal(r.ok, false, `${msg} — expected failure, got ${r.value}`);
  eq(r.value, 0, `${msg} — a failed formula must value 0`);
  check(typeof r.error === "string" && r.error.length > 0, `${msg} — carries an error message`);
  return r.error!;
}

function main() {
  /* ══════════════════════════════════════════════════════════════════
   * 1. SECURITY — the no-eval property, asserted against the source.
   * This is the module's entire justification: a tenant-authored string
   * must never reach a JS interpreter.
   * ══════════════════════════════════════════════════════════════════ */
  {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "formulaEngine.ts"), "utf8");

    // Strip comments so the doc-block's own prose ("NO `eval` / `new
    // Function`") cannot mask a real occurrence in code.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    check(!/\beval\s*\(/.test(code), "SECURITY: source contains no eval( call");
    check(!/\bnew\s+Function\b/.test(code), "SECURITY: source contains no `new Function`");
    check(!/[^.\w]Function\s*\(/.test(code), "SECURITY: source never calls Function() as a constructor");
    check(!/\bsetTimeout\s*\(\s*["'`]/.test(code), "SECURITY: no string-body setTimeout (an eval alias)");
    check(!/\brequire\s*\(/.test(code), "SECURITY: the evaluator pulls in no dynamic module");
    check(!/\bimport\s*\(/.test(code), "SECURITY: the evaluator performs no dynamic import");

    // Behavioural corollary: JS injected through a formula is inert. It must
    // fail to parse, not execute and not silently evaluate to something.
    for (const attack of [
      "process.exit(1)",
      "global.x = 1",
      "constructor.constructor('return 1')()",
      "this.constructor",
      "__proto__",
      "(function(){return 9})()",
      "1; process.exit(1)",
    ]) {
      const r = evaluateFormula(attack, {});
      check(r.ok === false || r.value === 0, `SECURITY: injection attempt is inert — "${attack}"`);
    }

    // A context key cannot smuggle a prototype-chain lookup: resolveVar uses
    // hasOwnProperty, so inherited props are not reachable as fields.
    const r = evaluateFormula("toString", {});
    eq(r.value, 0, "SECURITY: inherited Object.prototype members are not readable as fields");
  }

  /* ══════════════════════════════════════════════════════════════════
   * 2. Tokenizer + arithmetic + PEMDAS.
   * ══════════════════════════════════════════════════════════════════ */
  {
    val("1 + 2", 3, "addition");
    val("10 - 4", 6, "subtraction");
    val("6 * 7", 42, "multiplication");
    val("20 / 4", 5, "division");
    val("2 ^ 8", 256, "exponentiation");

    // PEMDAS
    val("2 + 3 * 4", 14, "PEMDAS: multiplication binds tighter than addition");
    val("(2 + 3) * 4", 20, "PEMDAS: parentheses override precedence");
    val("2 * 3 + 4 * 5", 26, "PEMDAS: both products resolve before the sum");
    val("100 - 10 - 5", 85, "PEMDAS: subtraction is left-associative");
    val("100 / 10 / 2", 5, "PEMDAS: division is left-associative");
    val("2 ^ 3 ^ 2", 512, "PEMDAS: exponentiation is RIGHT-associative (2^9), not (2^3)^2");
    val("2 + 3 ^ 2", 11, "PEMDAS: exponent binds tighter than addition");
    val("((1 + 2) * (3 + 4)) ^ 2", 441, "PEMDAS: nested parentheses");

    // Number literal forms
    val("1.5 + 1.5", 3, "decimal literals");
    val(".5 + .25", 0.75, "leading-dot decimals");
    val("0.1 + 0.2", 0.30000000000000004, "float arithmetic is NOT auto-rounded (callers must round money)");

    // Unary
    val("-5 + 10", 5, "unary minus");
    val("+7", 7, "unary plus");
    val("--3", 3, "double negation");
    val("10 - -3", 13, "subtracting a negative");

    /* Unary minus binds TIGHTER than `^` here, matching Excel: -2^2 = 4.
     * Standard mathematical notation would give -4. Pinned because a change
     * would silently flip the sign of any formula using a negated base. */
    val("-2 ^ 2", 4, "unary minus binds tighter than ^ (Excel convention: -2^2 = 4, not -4)");

    // Whitespace is insignificant.
    val("  1   +\t2  \n ", 3, "whitespace/tabs/newlines are skipped");
    val("", 0, "an empty formula evaluates to 0 and is treated as OK");
    val("   ", 0, "a whitespace-only formula evaluates to 0");
  }

  /* ══════════════════════════════════════════════════════════════════
   * 3. Field references.
   * ══════════════════════════════════════════════════════════════════ */
  {
    val("rooms * 50", 150, "bare identifier resolves from context", { rooms: 3 });
    val("[Room count] * 50", 150, "bracketed reference supports spaces", { "Room count": 3 });
    val("[ Room count ] * 2", 8, "bracketed reference is trimmed", { "Room count": 4 });
    val("ROOMS * 10", 40, "field lookup falls back to case-insensitive", { rooms: 4 });
    val("rooms", 1, "boolean true in context coerces to 1", { rooms: true });
    val("rooms", 0, "boolean false in context coerces to 0", { rooms: false });
    val("[Sizes]", 9, "an array field SUMs its members", { Sizes: [2, 3, 4] });
    val("[Qty] * 2", 24, "a numeric STRING field is coerced", { Qty: "12" });

    /* FINDING — the single biggest wrong-quote hazard in this module.
     * An unknown field reference silently resolves to 0 instead of erroring,
     * so a typo'd `[Rooms]` in `[Rooms] * 150` quotes the customer $0 with
     * ok:true. CI mitigates this for SHIPPED TEMPLATES via
     * `npm run check:template-formula-refs`, but a tenant-authored formula in
     * the advanced builder has no such guard. Pinned so the behaviour is a
     * deliberate decision; flagged as a real defect, not endorsed. */
    const typo = evaluateFormula("[Romms] * 150", { Rooms: 4 });
    eq(typo.ok, true, "FINDING: an unknown [Field] does NOT error — it reports ok:true");
    eq(typo.value, 0, "FINDING: an unknown [Field] silently becomes 0 → a $0 customer quote");

    // Same hazard via a bare identifier.
    val("missingField * 999", 0, "FINDING: an unknown bare identifier is also silently 0");

    // A field present but holding a non-numeric string is also 0.
    val("[Name] * 2", 0, "a non-numeric string field coerces to 0", { Name: "Bob" });
    // ...but a leading-numeric string parses its prefix (parseFloat semantics).
    val("[Mixed] * 2", 24, 'FINDING: "12abc" parses as 12 (parseFloat prefix), not 0', { Mixed: "12abc" });

    // Literals that look like identifiers.
    val("true", 1, "`true` literal is 1");
    val("false", 0, "`false` literal is 0");
    val("TRUE + FALSE", 1, "boolean literals are case-insensitive");
    // A context value must not shadow the boolean literals.
    val("true", 1, "a context key named `true` does not override the literal", { true: 99 } as any);
  }

  /* ══════════════════════════════════════════════════════════════════
   * 4. Comparison operators (yield booleans → 1/0 at the top level).
   * ══════════════════════════════════════════════════════════════════ */
  {
    val("1 < 2", 1, "less-than true → 1");
    val("2 < 1", 0, "less-than false → 0");
    val("2 <= 2", 1, "less-or-equal is inclusive");
    val("3 > 2", 1, "greater-than");
    val("3 >= 4", 0, "greater-or-equal");
    val("2 = 2", 1, "single `=` is equality (spreadsheet style), not assignment");
    val("2 == 2", 1, "`==` equality");
    val("2 != 3", 1, "`!=` inequality");
    val("2 <> 3", 1, "`<>` inequality (spreadsheet style)");

    // Loose equality across types.
    val("[N] = 5", 1, "number/string equality is loose", { N: "5" });
    val("[B] = 1", 1, "boolean true equals 1", { B: true });
    val("[S] = 'yes'", 1, "string equality", { S: "yes" });
    val('[S] = "yes"', 1, "double-quoted string literals work too", { S: "yes" });
    val("'a' = 'b'", 0, "unequal strings → 0");

    /* Comparisons are NON-associative by design: comparison() consumes at
     * most ONE operator, so a chained comparison is a parse error rather
     * than silently evaluating as (1<2)<3. */
    fails("1 < 2 < 3", "chained comparisons are rejected, not silently mis-evaluated");
  }

  /* ══════════════════════════════════════════════════════════════════
   * 5. Every documented function.
   * ══════════════════════════════════════════════════════════════════ */

  /* ─── SUM / MAX / MIN ─── */
  {
    val("SUM(1, 2, 3)", 6, "SUM of literals");
    val("SUM()", 0, "SUM with no arguments → 0");
    val("SUM([A], [B])", 30, "SUM of fields", { A: 10, B: 20 });
    val("SUM([List])", 15, "SUM flattens an array field", { List: [1, 2, 3, 4, 5] });
    val("SUM([List], 10)", 25, "SUM mixes arrays and scalars", { List: [5, 10] });

    val("MAX(3, 9, 1)", 9, "MAX of literals");
    val("MAX()", 0, "MAX with no arguments → 0 (guarded, not -Infinity)");
    val("MAX([List])", 9, "MAX flattens an array field", { List: [3, 9, 1] });
    val("MIN(3, 9, 1)", 1, "MIN of literals");
    val("MIN()", 0, "MIN with no arguments → 0 (guarded, not +Infinity)");
    val("MAX(0, [Qty] - 10)", 0, "MAX is the idiom for clamping a negative to 0", { Qty: 4 });
  }

  /* ─── ROUND / ROUNDUP / ROUNDDOWN ─── */
  {
    val("ROUND(2.4)", 2, "ROUND down to integer");
    val("ROUND(2.5)", 3, "ROUND half-up at .5");
    val("ROUND(2.567, 2)", 2.57, "ROUND to 2 decimal places");
    val("ROUND(1234.5678, 1)", 1234.6, "ROUND to 1 decimal place");
    /* JS Math.round breaks ties toward +Infinity, so ROUND(-2.5) is -2.
     * Excel's ROUND would give -3 (half away from zero). Pinned as a real,
     * documented divergence from the spreadsheet mental model. */
    val("ROUND(-2.5)", -2, "FINDING: ROUND(-2.5) = -2 (JS half-up), Excel would give -3");

    val("ROUNDUP(2.1)", 3, "ROUNDUP always ceilings");
    val("ROUNDUP(2.0)", 2, "ROUNDUP leaves an exact integer alone");
    val("ROUNDUP(2.111, 2)", 2.12, "ROUNDUP honours decimal places");
    val("ROUNDDOWN(2.9)", 2, "ROUNDDOWN always floors");
    val("ROUNDDOWN(2.999, 2)", 2.99, "ROUNDDOWN honours decimal places");

    // Places are clamped to 0..10 and truncated.
    val("ROUND(2.5, -3)", 3, "negative decimal places clamp to 0");
    val("ROUND(2.555, 1.9)", 2.6, "fractional decimal places truncate to 1");
  }

  /* ─── ABS ─── */
  {
    val("ABS(-5)", 5, "ABS of a negative");
    val("ABS(5)", 5, "ABS of a positive");
    val("ABS()", 0, "ABS with no argument → 0 (defaulted, not a crash)");
    val("ABS([A] - [B])", 4, "ABS of a difference", { A: 3, B: 7 });
  }

  /* ─── IF / AND / OR / NOT ─── */
  {
    val("IF(1 > 0, 100, 200)", 100, "IF true branch");
    val("IF(1 < 0, 100, 200)", 200, "IF false branch");
    val("IF(0, 100)", 0, "IF with no else branch → 0");
    val("IF([Urgent], 500, 250)", 500, "IF on a boolean field", { Urgent: true });
    val("IF([Size] > 100, [Size] * 2, [Size] * 3)", 300, "IF branches can be expressions", { Size: 100 });
    val("IF(1, IF(1, 7, 8), 9)", 7, "IF nests");
    fails("IF(1)", "IF with fewer than 2 arguments errors rather than guessing");

    val("AND(1, 1)", 1, "AND all-true");
    val("AND(1, 0)", 0, "AND with a false");
    val("OR(0, 1)", 1, "OR with a true");
    val("OR(0, 0)", 0, "OR all-false");
    val("NOT(0)", 1, "NOT of false");
    val("NOT(1)", 0, "NOT of true");
    val("NOT()", 1, "NOT with no argument → NOT(0) → 1");
    val("IF(AND([A] > 1, [B] > 1), 10, 20)", 10, "AND composes inside IF", { A: 2, B: 2 });

    /* Vacuous-truth edge: `[].every()` is true, `[].some()` is false. */
    val("AND()", 1, "FINDING: AND() with no arguments is vacuously TRUE (Excel would error)");
    val("OR()", 0, "OR() with no arguments is false");

    // Truthiness of strings: "" / "0" / "false" are falsey, anything else true.
    val("IF([S], 1, 0)", 0, 'empty string is falsey', { S: "" });
    val("IF([S], 1, 0)", 0, '"0" is falsey', { S: "0" });
    val("IF([S], 1, 0)", 0, '"false" is falsey (case-insensitive)', { S: "FALSE" });
    val("IF([S], 1, 0)", 1, "a non-empty string is truthy", { S: "yes" });
  }

  /* ─── CONTAINS ─── */
  {
    val("CONTAINS([Services], 'gutter')", 1, "CONTAINS matches an array member", { Services: ["roof", "gutter"] });
    val("CONTAINS([Services], 'siding')", 0, "CONTAINS misses an absent array member", { Services: ["roof", "gutter"] });
    val("CONTAINS([Notes], 'urgent')", 1, "CONTAINS does substring match on a string", { Notes: "This is URGENT work" });
    val("CONTAINS([Notes], 'URGENT')", 1, "CONTAINS is case-insensitive on strings", { Notes: "this is urgent work" });
    val("CONTAINS([Notes], 'zzz')", 0, "CONTAINS misses an absent substring", { Notes: "nothing here" });
    val(
      "IF(CONTAINS([Extras], 'skylight'), 800, 0)", 800,
      "CONTAINS is the multi-select add-on idiom", { Extras: ["skylight", "vent"] },
    );
  }

  /* ─── MROUND / CEILING / FLOOR (the doc-block's own examples) ─── */
  {
    val("MROUND(137, 25)", 125, "MROUND rounds to the NEAREST multiple (doc example)");
    val("MROUND(138, 25)", 150, "MROUND rounds up past the halfway point");
    val("MROUND(137, 0)", 0, "MROUND by 0 is guarded → 0, never Infinity/NaN");
    val("MROUND(137, -25)", 125, "MROUND takes the absolute value of the multiple");

    val("CEILING(137, 25)", 150, "CEILING rounds UP to the multiple (doc example)");
    val("CEILING(150, 25)", 150, "CEILING leaves an exact multiple alone");
    val("CEILING(2.1)", 3, "CEILING with one argument ceilings to an integer");
    val("CEILING(137, 0)", 0, "CEILING by 0 is guarded → 0");

    val("FLOOR(137, 25)", 125, "FLOOR rounds DOWN to the multiple (doc example)");
    val("FLOOR(2.9)", 2, "FLOOR with one argument floors to an integer");
    val("FLOOR(137, 0)", 0, "FLOOR by 0 is guarded → 0");
  }

  /* ─── RAND / RANDBETWEEN (the only impure functions) ─── */
  {
    for (let i = 0; i < 50; i++) {
      const r = evaluateFormula("RAND()");
      check(r.ok && r.value >= 0 && r.value < 1, "RAND() stays in [0, 1)");
      const rb = evaluateFormula("RANDBETWEEN(5, 10)");
      check(
        rb.ok && Number.isInteger(rb.value) && rb.value >= 5 && rb.value <= 10,
        "RANDBETWEEN(5,10) yields an integer within the INCLUSIVE bounds",
      );
    }
    val("RANDBETWEEN(3, 3)", 3, "RANDBETWEEN with equal bounds is deterministic");
    fails("RANDBETWEEN(10, 5)", "RANDBETWEEN with high < low errors rather than looping/NaN");
  }

  /* ─── unknown function ─── */
  {
    const err = fails("VLOOKUP(1, 2)", "an unsupported function errors rather than resolving to 0");
    check(/VLOOKUP/.test(err), "the unknown-function error names the offending function");
    fails("sum2(1)", "a near-miss function name is rejected");
    // Function names ARE case-insensitive.
    val("sum(1, 2)", 3, "function names are case-insensitive (lowercase)");
    val("Round(2.6)", 3, "function names are case-insensitive (mixed case)");
  }

  /* ══════════════════════════════════════════════════════════════════
   * 6. Division by zero and non-finite results — a wrong-quote class.
   * ══════════════════════════════════════════════════════════════════ */
  {
    const err = fails("10 / 0", "division by zero errors instead of yielding Infinity");
    check(/[Dd]ivision by zero/.test(err), "the div-by-zero error says so plainly");
    fails("10 / [Missing]", "dividing by a MISSING field is a div-by-zero error (missing → 0)");
    fails("[Total] / [Count]", "dividing by a zero-valued field errors", { Total: 100, Count: 0 });
    fails("0 / 0", "0/0 errors rather than yielding NaN");

    /* REGRESSION GUARD — a bug this suite found and fixed.
     *
     * toNum() launders a non-finite number to 0 (`isFinite(v) ? v : 0`). It ran
     * BEFORE the "not a finite number" check in evaluateFormula, so that check
     * was unreachable for numeric overflow and `10 ^ 400` came back as
     * { ok: true, value: 0 } — a confident $0 quote. evaluateFormula now tests
     * the RAW result first. If this assertion ever flips back to ok:true/0, the
     * overflow guard has been reverted and overflowing formulas quote $0 again. */
    {
      const overflow = evaluateFormula("10 ^ 400");
      eq(overflow.ok, false, "an overflowing exponentiation REFUSES to quote (must not silently become $0)");
      eq(overflow.value, 0, "a refused overflow still values 0");
      check(/finite/i.test(overflow.error ?? ""), "the overflow error names the finiteness problem");
    }
    fails("(10 ^ 400) * 2", "an overflow inside a larger expression is also rejected");
    val("1 ^ 999999999", 1, "a large but FINITE exponentiation is accepted");
    val("10 ^ 300", 1e300, "a huge but representable number is accepted");

    /* FINDING (pinned): the tokenizer accepts only digits and dots, so
     * SCIENTIFIC NOTATION is not supported — `9e307` lexes as the number 9
     * followed by the identifier `e307`, which is a parse error. Owners must
     * write large numbers out in full. */
    fails("9e307", "FINDING: scientific notation is NOT supported — `9e307` is a parse error");
    fails("1e5 * 2", "FINDING: `1e5` is likewise rejected, not read as 100000");
  }

  /* ══════════════════════════════════════════════════════════════════
   * 7. Negative inputs — NOT clamped. A negative field yields a
   *    negative quote. Pinned as a hazard, not endorsed.
   * ══════════════════════════════════════════════════════════════════ */
  {
    val("[Qty] * 150", -750, "FINDING: a negative field produces a NEGATIVE quote — no clamping", { Qty: -5 });
    val("0 - 500", -500, "FINDING: a formula can evaluate to a negative total unchallenged");
    // The safe authoring idiom, for contrast:
    val("MAX(0, [Qty] * 150)", 0, "MAX(0, …) is the available clamp idiom", { Qty: -5 });
  }

  /* ══════════════════════════════════════════════════════════════════
   * 8. Malformed input — the public API must never throw.
   * ══════════════════════════════════════════════════════════════════ */
  {
    const malformed: Array<[string, string]> = [
      ["1 +", "a trailing operator"],
      ["* 5", "a leading binary operator"],
      ["(1 + 2", "an unclosed parenthesis"],
      ["1 + 2)", "an unmatched closing parenthesis"],
      ["1.2.3", "a malformed number with two dots"],
      ["'unterminated", "an unterminated string literal"],
      ["[Unterminated", "an unterminated [field reference]"],
      ["[]", "an empty [field reference]"],
      ["[   ]", "a whitespace-only [field reference]"],
      ["1 @ 2", "an unexpected character"],
      ["SUM(1,", "a truncated argument list"],
      ["SUM 1, 2)", "a call missing its opening parenthesis"],
      ["()", "an empty parenthesis group"],
      ["1 2", "two adjacent literals"],
      ["ROUND(", "a truncated call"],
      ["#$%", "pure garbage"],
    ];
    for (const [expr, label] of malformed) {
      fails(expr, `malformed input is handled gracefully: ${label}`);
    }

    // Even hostile inputs never throw out of evaluateFormula.
    for (const expr of ["((((((((((", "))))))))))", "^^^^", ",,,", "[[[[", "''''"]) {
      assert.doesNotThrow(() => evaluateFormula(expr, {}), `evaluateFormula never throws on "${expr}"`);
      checks++;
    }

    // Deep nesting is handled (recursion depth sanity).
    const deep = "(".repeat(60) + "1" + ")".repeat(60);
    const deepResult = evaluateFormula(deep);
    check(deepResult.ok && deepResult.value === 1, "deeply nested parentheses parse correctly");

    // Non-string / nullish input must not throw.
    assert.doesNotThrow(() => evaluateFormula(undefined as any, {}), "undefined expression does not throw");
    assert.doesNotThrow(() => evaluateFormula(null as any, {}), "null expression does not throw");
    checks += 2;
    eq(evaluateFormula(null as any, {}).value, 0, "a null expression evaluates to 0");
  }

  /* ══════════════════════════════════════════════════════════════════
   * 9. validateFormula() — the builder's pre-save static check.
   * ══════════════════════════════════════════════════════════════════ */
  {
    eq(validateFormula("1 + 2").valid, true, "validateFormula accepts valid arithmetic");
    eq(validateFormula("SUM([A], [B]) * 1.2").valid, true, "validateFormula accepts function calls and fields");
    eq(validateFormula("").valid, true, "validateFormula treats an empty formula as valid");
    eq(validateFormula("1 +").valid, false, "validateFormula rejects a parse error");
    check(typeof validateFormula("1 +").error === "string", "validateFormula returns an error message");

    /* validateFormula only PARSES — it does not evaluate, so it cannot catch
     * an unknown function or a div-by-zero. Pinned so the builder UI's
     * guarantees are not overstated. */
    eq(validateFormula("VLOOKUP(1,2)").valid, true, "FINDING: validateFormula cannot catch an unknown FUNCTION (parse-only)");
    eq(validateFormula("1 / 0").valid, true, "FINDING: validateFormula cannot catch division by zero (parse-only)");
    eq(validateFormula("[Typo] * 5").valid, true, "FINDING: validateFormula cannot catch an unknown FIELD (parse-only)");
  }

  /* ══════════════════════════════════════════════════════════════════
   * 10. runCalculations() — named-calc chaining, the real pricing path.
   * ══════════════════════════════════════════════════════════════════ */
  {
    const ctx: FormulaContext = { rooms: 4, sqft: 1200, urgent: true };
    const calcs: Calculation[] = [
      { id: "c1", name: "Labour", formula: "rooms * 120" },
      { id: "c2", name: "Materials", formula: "sqft * 1.5" },
      { id: "c3", name: "Subtotal", formula: "Labour + Materials" },
      { id: "c4", name: "Rush", formula: "IF(urgent, Subtotal * 0.25, 0)" },
      { id: "c5", name: "Total", formula: "ROUND(Subtotal + Rush, 2)" },
    ];
    const r = runCalculations(calcs, ctx);
    eq(r.values.Labour, 480, "chain: Labour = 4 × 120");
    eq(r.values.Materials, 1800, "chain: Materials = 1200 × 1.5");
    eq(r.values.Subtotal, 2280, "chain: a later calc reads EARLIER calcs by name");
    eq(r.values.Rush, 570, "chain: conditional calc uses the chained subtotal");
    eq(r.values.Total, 2850, "chain: final total composes the whole chain");
    eq(Object.keys(r.errors).length, 0, "chain: a clean run reports no errors");

    // The input context is not mutated by the run.
    eq(Object.prototype.hasOwnProperty.call(ctx, "Subtotal"), false, "chain: the caller's context object is not mutated");

    // ORDER MATTERS — a forward reference resolves to 0, not to the later value.
    const outOfOrder = runCalculations(
      [
        { id: "a", name: "Total", formula: "Subtotal * 2" },
        { id: "b", name: "Subtotal", formula: "100" },
      ],
      {},
    );
    eq(outOfOrder.values.Total, 0, "FINDING: a FORWARD reference silently resolves to 0 — calc order is significant");
    eq(outOfOrder.values.Subtotal, 100, "chain: the later calc still computes correctly");

    // A failing calc yields 0, records an error, and downstream calcs consume the 0.
    const withError = runCalculations(
      [
        { id: "a", name: "Bad", formula: "10 / 0" },
        { id: "b", name: "Downstream", formula: "Bad + 100" },
      ],
      {},
    );
    eq(withError.values.Bad, 0, "chain: a failing calc values 0");
    check(typeof withError.errors.Bad === "string", "chain: the failing calc's error is reported by name");
    eq(withError.values.Downstream, 100, "chain: downstream consumes the failed calc's 0 (error does NOT propagate)");
    eq(Object.prototype.hasOwnProperty.call(withError.errors, "Downstream"), false,
      "FINDING: downstream reports NO error — a broken subtotal silently under-quotes");

    // A calc name shadows a same-named context field.
    const shadow = runCalculations([{ id: "a", name: "rate", formula: "999" }, { id: "b", name: "Out", formula: "rate" }], { rate: 5 });
    eq(shadow.values.Out, 999, "chain: a calc name shadows a same-named input field");

    // Empty inputs are safe.
    eq(Object.keys(runCalculations([], {}).values).length, 0, "chain: an empty calc list yields no values");
    eq(runCalculations([{ id: "a", name: "Empty", formula: "" }], {}).values.Empty, 0,
      "FINDING: a calc with an EMPTY formula silently yields 0 with no error");

    // Duplicate calc names: last write wins.
    const dup = runCalculations(
      [{ id: "a", name: "T", formula: "10" }, { id: "b", name: "T", formula: "20" }],
      {},
    );
    eq(dup.values.T, 20, "chain: duplicate calc names — the last one wins");

    // Every value is a finite number, never undefined/NaN.
    const messy = runCalculations(
      [
        { id: "a", name: "A", formula: "1 / 0" },
        { id: "b", name: "B", formula: "garbage((" },
        { id: "c", name: "C", formula: "[Nope] * 5" },
      ],
      {},
    );
    for (const [name, v] of Object.entries(messy.values)) {
      check(Number.isFinite(v), `chain: calc "${name}" always yields a finite number`);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   * 11. Determinism — the server-side lead recompute compares its
   *    result to the client's, so a pure formula must be stable.
   * ══════════════════════════════════════════════════════════════════ */
  {
    const calcs: Calculation[] = [
      { id: "a", name: "Base", formula: "SUM([sqft] * 4.25, [rooms] * 95)" },
      { id: "b", name: "Total", formula: "ROUND(CEILING(Base, 25) * IF([urgent], 1.3, 1), 2)" },
    ];
    const ctx: FormulaContext = { sqft: 1875, rooms: 6, urgent: true };
    const first = runCalculations(calcs, ctx).values.Total;
    for (let i = 0; i < 25; i++) {
      eq(runCalculations(calcs, ctx).values.Total, first, "a pure formula chain is deterministic across runs");
    }
    check(Number.isFinite(first) && first > 0, "the determinism fixture produces a real positive number");
    //   Base    = 1875 × 4.25 + 6 × 95 = 7968.75 + 570 = 8538.75
    //   CEILING(8538.75, 25)           = 8550
    //   × 1.3                          = 11115
    eq(first, 11115, "the determinism fixture pins its exact composed value");
  }

  console.log(`formulaEngine.test.ts — all ${checks} assertions passed`);
}

// Standalone tsx guard: MUST exit(0) on success / exit(1) on failure. A
// resolved main() that left an open handle once stalled CI for an hour — so
// exit explicitly here.
try {
  main();
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
