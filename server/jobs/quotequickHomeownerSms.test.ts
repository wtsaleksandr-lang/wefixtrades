/**
 * Wave 81 — QuoteQuick homeowner SMS worker smoke tests.
 *
 * These don't require a live Twilio account or a real DB — they just
 * confirm the worker modules export the expected entry points, that the
 * service module loads cleanly, and that the no-Twilio-configured branch
 * short-circuits without errors.
 *
 * Runnable standalone via:
 *   DATABASE_URL=postgres://test:test@127.0.0.1:5432/test_unused \
 *     npx tsx server/jobs/quotequickHomeownerSms.test.ts
 *
 * Excluded from `tsc --noEmit` (tsconfig excludes **\/*.test.ts).
 */

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test_unused";
}

import assert from "node:assert/strict";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void> | void): Promise<void> {
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
  console.log("Wave 81 QuoteQuick homeowner SMS worker smoke tests:\n");

  /* ─── Module-load sanity ──────────────────────────────────────── */

  await test("expires-soon worker exports processQuotequickExpiresSoon", async () => {
    const mod = await import("./quotequickExpiresSoonWorker");
    assert.equal(
      typeof mod.processQuotequickExpiresSoon,
      "function",
      "processQuotequickExpiresSoon exported",
    );
  });

  await test("post-job worker exports processQuotequickPostJob", async () => {
    const mod = await import("./quotequickPostJobWorker");
    assert.equal(
      typeof mod.processQuotequickPostJob,
      "function",
      "processQuotequickPostJob exported",
    );
  });

  await test("homeowner SMS service exports all four flow entries", async () => {
    const mod = await import("../services/quotequickHomeownerSmsService");
    assert.equal(typeof mod.sendQuoteReadySms, "function");
    assert.equal(typeof mod.sendDepositReceiptSms, "function");
    assert.equal(typeof mod.sendExpiresSoonSms, "function");
    assert.equal(typeof mod.sendPostJobThankYouSms, "function");
  });

  /* ─── No-Twilio short-circuit ─────────────────────────────────── */
  //
  // Wipe Twilio env vars so isTwilioConfigured() returns false. Both
  // workers should return zeroed counters without touching the DB.

  await test("expires-soon worker no-ops cleanly when Twilio is unconfigured", async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
    delete process.env.TWILIO_PHONE_NUMBER;

    const { processQuotequickExpiresSoon } = await import("./quotequickExpiresSoonWorker");
    const result = await processQuotequickExpiresSoon();
    assert.equal(result.processed, 0);
    assert.equal(result.sent, 0);
    assert.equal(result.deferred, 0);
    assert.equal(result.skipped, 0);
    assert.equal(result.errors, 0);
  });

  await test("post-job worker no-ops cleanly when Twilio is unconfigured", async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
    delete process.env.TWILIO_PHONE_NUMBER;

    const { processQuotequickPostJob } = await import("./quotequickPostJobWorker");
    const result = await processQuotequickPostJob();
    assert.equal(result.processed, 0);
    assert.equal(result.sent, 0);
    assert.equal(result.deferred, 0);
    assert.equal(result.skipped, 0);
    assert.equal(result.errors, 0);
  });

  /* ─── Idempotency-stamp shape ─────────────────────────────────── */
  //
  // We can't exercise the live update paths without a DB, but we can
  // confirm the result objects carry the fields the cron schedulers
  // log in their summary lines — guards against shape drift.

  await test("expires-soon result has the expected counters", async () => {
    const { processQuotequickExpiresSoon } = await import("./quotequickExpiresSoonWorker");
    const result = await processQuotequickExpiresSoon();
    assert.ok("processed" in result);
    assert.ok("sent" in result);
    assert.ok("deferred" in result);
    assert.ok("skipped" in result);
    assert.ok("errors" in result);
  });

  await test("post-job result has the expected counters", async () => {
    const { processQuotequickPostJob } = await import("./quotequickPostJobWorker");
    const result = await processQuotequickPostJob();
    assert.ok("processed" in result);
    assert.ok("sent" in result);
    assert.ok("deferred" in result);
    assert.ok("skipped" in result);
    assert.ok("errors" in result);
  });

  /* ─── Missing-client_id graceful handling ─────────────────────── */
  //
  // sendQuoteReadySms / sendDepositReceiptSms / sendPostJobThankYouSms
  // all branch on no-consent / no-phone before touching the DB or
  // Twilio. Confirm the synchronous-rejection paths return the right
  // reason codes — these are the inputs the worker layer relies on.

  await test("sendQuoteReadySms rejects no_consent before any IO", async () => {
    const { sendQuoteReadySms } = await import("../services/quotequickHomeownerSmsService");
    const result = await sendQuoteReadySms({
      leadId: 1,
      calculatorId: 1,
      phone: "+15555550100",
      quoteAmountDollars: 250,
      smsConsent: false, // ← gate
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_consent");
  });

  await test("sendQuoteReadySms rejects no_phone before any IO", async () => {
    const { sendQuoteReadySms } = await import("../services/quotequickHomeownerSmsService");
    const result = await sendQuoteReadySms({
      leadId: 1,
      calculatorId: 1,
      phone: "",
      quoteAmountDollars: 250,
      smsConsent: true,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_phone");
  });

  await test("sendDepositReceiptSms rejects no_consent before any IO", async () => {
    const { sendDepositReceiptSms } = await import("../services/quotequickHomeownerSmsService");
    const result = await sendDepositReceiptSms({
      depositId: 1,
      calculatorId: 1,
      leadId: 1,
      phone: "+15555550100",
      amountCents: 5000,
      smsConsent: false,
      stripeSessionId: "cs_test_x",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_consent");
  });

  await test("sendExpiresSoonSms rejects no_phone before any IO", async () => {
    const { sendExpiresSoonSms } = await import("../services/quotequickHomeownerSmsService");
    const result = await sendExpiresSoonSms({
      leadId: 1,
      calculatorId: 1,
      phone: "",
      smsConsent: true,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_phone");
  });

  await test("sendPostJobThankYouSms rejects no_consent before any IO", async () => {
    const { sendPostJobThankYouSms } = await import("../services/quotequickHomeownerSmsService");
    const result = await sendPostJobThankYouSms({
      appointmentId: 1,
      clientId: 1,
      calculatorId: 1,
      phone: "+15555550100",
      smsConsent: false,
      fallbackTimezone: "America/Toronto",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_consent");
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
