/**
 * Wave 81 — QuoteQuick homeowner SMS template/helper smoke tests.
 *
 * Runnable standalone via:
 *   npx tsx server/lib/quotequickHomeownerSms.test.ts
 *
 * Excluded from `tsc --noEmit` via the project tsconfig's **\/*.test.ts
 * pattern. Uses node:assert/strict, no test runner dependency.
 */

import assert from "node:assert/strict";
import {
  interpolate,
  formatAmountCents,
  formatAmountDollars,
  formatExpiresTime,
  QUOTEQUICK_SMS_TEMPLATES,
} from "./quotequickHomeownerSms";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
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
  console.log("Wave 81 QuoteQuick homeowner SMS smoke tests:\n");

  /* ─── interpolate() ───────────────────────────────────────────── */

  await test("interpolate substitutes ${var} tokens", () => {
    const out = interpolate("Hi ${name}, your quote is ${amount}", {
      name: "Alex",
      amount: "$250",
    });
    assert.equal(out, "Hi Alex, your quote is $250");
  });

  await test("interpolate handles missing keys as empty string", () => {
    const out = interpolate("Hi ${name}, your link: ${link}", { name: "Alex" });
    assert.equal(out, "Hi Alex, your link: ");
  });

  await test("interpolate handles null/undefined values", () => {
    const out = interpolate("a=${a} b=${b}", { a: null, b: undefined });
    assert.equal(out, "a= b=");
  });

  await test("interpolate handles whitespace inside braces", () => {
    const out = interpolate("Hi ${ name }!", { name: "Sam" });
    assert.equal(out, "Hi Sam!");
  });

  await test("interpolate coerces numbers to strings", () => {
    const out = interpolate("Total: ${n}", { n: 42 });
    assert.equal(out, "Total: 42");
  });

  /* ─── formatAmountDollars / formatAmountCents ─────────────────── */

  await test("formatAmountDollars renders whole dollars without decimals", () => {
    assert.equal(formatAmountDollars(250), "$250");
  });

  await test("formatAmountDollars preserves sub-dollar precision", () => {
    assert.equal(formatAmountDollars(199.99), "$199.99");
  });

  await test("formatAmountDollars returns empty on null/NaN", () => {
    assert.equal(formatAmountDollars(null), "");
    assert.equal(formatAmountDollars(undefined), "");
    assert.equal(formatAmountDollars(Number.NaN), "");
  });

  await test("formatAmountCents converts cents to dollars", () => {
    assert.equal(formatAmountCents(2500), "$25");
    assert.equal(formatAmountCents(2599), "$25.99");
  });

  await test("formatAmountCents returns empty on null/undefined", () => {
    assert.equal(formatAmountCents(null), "");
    assert.equal(formatAmountCents(undefined), "");
  });

  /* ─── formatExpiresTime ───────────────────────────────────────── */

  await test("formatExpiresTime renders a time string", () => {
    const ts = new Date("2026-06-01T14:30:00Z");
    const out = formatExpiresTime(ts, "UTC");
    // toLocaleTimeString output varies by env locale, but it should
    // contain a digit and not be the "tomorrow" fallback.
    assert.notEqual(out, "tomorrow");
    assert.match(out, /\d/);
  });

  await test("formatExpiresTime falls back to 'tomorrow' on null", () => {
    assert.equal(formatExpiresTime(null), "tomorrow");
    assert.equal(formatExpiresTime(undefined), "tomorrow");
  });

  await test("formatExpiresTime falls back to 'tomorrow' on invalid date", () => {
    assert.equal(formatExpiresTime("not-a-date"), "tomorrow");
  });

  await test("formatExpiresTime tolerates an invalid timezone", () => {
    const ts = new Date("2026-06-01T14:30:00Z");
    const out = formatExpiresTime(ts, "Not/A/Real/Zone");
    assert.match(out, /\d/);
  });

  /* ─── Template shape sanity ───────────────────────────────────── */

  await test("all 4 templates exist and contain expected tokens", () => {
    assert.match(QUOTEQUICK_SMS_TEMPLATES.quoteReady, /\$\{trade_name\}/);
    assert.match(QUOTEQUICK_SMS_TEMPLATES.quoteReady, /\$\{amount\}/);
    assert.match(QUOTEQUICK_SMS_TEMPLATES.quoteReady, /\$\{quote_link\}/);
    assert.match(QUOTEQUICK_SMS_TEMPLATES.quoteReady, /STOP/);

    assert.match(QUOTEQUICK_SMS_TEMPLATES.depositReceipt, /\$\{trade_name\}/);
    assert.match(QUOTEQUICK_SMS_TEMPLATES.depositReceipt, /\$\{amount\}/);
    assert.match(QUOTEQUICK_SMS_TEMPLATES.depositReceipt, /\$\{ref\}/);
    assert.match(QUOTEQUICK_SMS_TEMPLATES.depositReceipt, /\$\{link\}/);

    assert.match(QUOTEQUICK_SMS_TEMPLATES.expiresSoon, /\$\{trade_name\}/);
    assert.match(QUOTEQUICK_SMS_TEMPLATES.expiresSoon, /\$\{time\}/);
    assert.match(QUOTEQUICK_SMS_TEMPLATES.expiresSoon, /\$\{quote_link\}/);

    assert.match(QUOTEQUICK_SMS_TEMPLATES.postJobThankYou, /\$\{trade_name\}/);
    assert.match(QUOTEQUICK_SMS_TEMPLATES.postJobThankYou, /\$\{review_link\}/);
  });

  await test("templates render plausibly for a sample quote-ready send", () => {
    const out = interpolate(QUOTEQUICK_SMS_TEMPLATES.quoteReady, {
      trade_name: "Joe's Plumbing",
      amount: formatAmountDollars(450),
      quote_link: "https://joes-plumbing.your-quote.net",
    });
    assert.ok(out.includes("Joe's Plumbing"));
    assert.ok(out.includes("$450"));
    assert.ok(out.includes("https://joes-plumbing.your-quote.net"));
    assert.ok(out.includes("STOP"));
  });

  await test("templates render plausibly for a sample deposit-receipt send", () => {
    const out = interpolate(QUOTEQUICK_SMS_TEMPLATES.depositReceipt, {
      trade_name: "Mary's Roofing",
      amount: formatAmountCents(5000),
      ref: "00042",
      link: "https://marys-roofing.your-quote.net?deposit=success&deposit_id=42",
    });
    assert.ok(out.includes("Mary's Roofing"));
    assert.ok(out.includes("$50"));
    assert.ok(out.includes("00042"));
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
