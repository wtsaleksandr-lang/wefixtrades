/**
 * Unit smoke tests for the Wave 80 BookFlow SMS template helpers.
 *
 * Excluded from `tsc --noEmit` (tsconfig **\/*.test.ts). Runnable
 * standalone via:
 *
 *   npx tsx server/lib/bookflowSmsTemplates.test.ts
 *
 * Uses node's built-in `assert/strict`. No test runner dep added.
 *
 * Coverage:
 *   1. interpolate replaces a known variable
 *   2. interpolate leaves unknown variables literal (observability)
 *   3. interpolate handles undefined / null / empty without throwing
 *   4. interpolate replaces multiple occurrences
 *   5. Each template flow renders cleanly with a representative
 *      payload (confirmation / day_of / eta / post_thank_you /
 *      no_show_recovery)
 *   6. Confirmation body contains the carrier-required STOP + HELP
 *      keywords (TCPA / CTIA guardrail)
 *   7. formatAppointmentTime returns a stable "h:mm AM/PM" shape
 *   8. formatAppointmentDate returns a stable short shape
 */
import assert from "node:assert/strict";
import {
  BOOKFLOW_SMS_TEMPLATES,
  interpolate,
  formatAppointmentDate,
  formatAppointmentTime,
} from "./bookflowSmsTemplates";

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
check("interpolate replaces a known variable", () => {
  assert.equal(interpolate("Hi {name}!", { name: "Sam" }), "Hi Sam!");
});

// 2
check("interpolate leaves unknown variables literal", () => {
  // Production-observability behavior: an unrecognized placeholder
  // surfaces in the SMS body so the bug is visible rather than
  // silent.
  assert.equal(interpolate("Hi {who}!", { name: "Sam" }), "Hi {who}!");
});

// 3
check("interpolate handles undefined / null / empty without throwing", () => {
  assert.equal(interpolate("a={a}, b={b}, c={c}", { a: undefined, b: "", c: "ok" }), "a={a}, b={b}, c=ok");
});

// 4
check("interpolate replaces multiple occurrences", () => {
  assert.equal(interpolate("{x}+{x}={y}", { x: "1", y: "2" }), "1+1=2");
});

// 5a confirmation
check("confirmation template renders cleanly", () => {
  const body = interpolate(BOOKFLOW_SMS_TEMPLATES.confirmation, {
    brand_name: "Acme Plumbing",
    service_name: "drain unclog",
    date: "Mon, May 28",
    time: "3:00 PM",
    manage_link: "https://wefixtrades.com/book/acme?cancel=42",
  });
  assert.ok(body.includes("Acme Plumbing"), "should include brand_name");
  assert.ok(body.includes("drain unclog"), "should include service_name");
  assert.ok(body.includes("Mon, May 28"), "should include date");
  assert.ok(body.includes("3:00 PM"), "should include time");
  assert.ok(!body.includes("{"), "no unrendered placeholders");
});

// 5b day-of
check("day-of reminder template renders cleanly", () => {
  const body = interpolate(BOOKFLOW_SMS_TEMPLATES.day_of_reminder, {
    brand_name: "Acme Plumbing",
    time: "3:00 PM",
  });
  assert.ok(body.includes("Acme Plumbing"));
  assert.ok(body.includes("3:00 PM"));
  assert.ok(!body.includes("{"));
});

// 5c eta
check("eta template renders cleanly", () => {
  const body = interpolate(BOOKFLOW_SMS_TEMPLATES.eta, {
    tech_name: "John",
    brand_name: "Acme Plumbing",
    eta_time: "3:15 PM",
    track_link: "https://wefixtrades.com/t/abc",
  });
  assert.ok(body.includes("John"));
  assert.ok(body.includes("Acme Plumbing"));
  assert.ok(body.includes("3:15 PM"));
  assert.ok(body.includes("https://wefixtrades.com/t/abc"));
  assert.ok(!body.includes("{"));
});

// 5d post-thank-you
check("post-thank-you template renders cleanly", () => {
  const body = interpolate(BOOKFLOW_SMS_TEMPLATES.post_thank_you, {
    brand_name: "Acme Plumbing",
    review_link: "https://search.google.com/local/writereview?placeid=XYZ",
  });
  assert.ok(body.includes("Acme Plumbing"));
  assert.ok(body.includes("1-5"));
  assert.ok(body.includes("XYZ"));
  assert.ok(!body.includes("{"));
});

// 5e no-show
check("no-show recovery template renders cleanly", () => {
  const body = interpolate(BOOKFLOW_SMS_TEMPLATES.no_show_recovery, {
    service_name: "water-heater install",
    reschedule_link: "https://wefixtrades.com/book/acme",
  });
  assert.ok(body.includes("water-heater install"));
  assert.ok(body.includes("https://wefixtrades.com/book/acme"));
  assert.ok(!body.includes("{"));
});

// 6 — TCPA guardrail
check("confirmation body carries STOP + HELP language", () => {
  // The confirmation SMS is the first homeowner-facing message in
  // the BookFlow lifecycle for a given booking, so it must carry
  // the carrier-required opt-out keywords.
  const body = BOOKFLOW_SMS_TEMPLATES.confirmation;
  assert.ok(/STOP/.test(body), "must mention STOP");
  assert.ok(/HELP/.test(body), "must mention HELP");
});

// 7
check("formatAppointmentTime returns a stable shape", () => {
  // 2026-05-28T19:00:00Z → "3:00 PM" in America/New_York (EDT).
  const d = new Date("2026-05-28T19:00:00Z");
  const out = formatAppointmentTime(d, "America/New_York");
  assert.ok(/^3:00\s?PM$/i.test(out), `expected "3:00 PM", got "${out}"`);
});

// 8
check("formatAppointmentDate returns a stable short shape", () => {
  // 2026-05-28T19:00:00Z is a Thursday → "Thu, May 28".
  const d = new Date("2026-05-28T19:00:00Z");
  const out = formatAppointmentDate(d, "America/New_York");
  assert.ok(/^Thu,\s*May\s*28$/.test(out), `expected "Thu, May 28", got "${out}"`);
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
