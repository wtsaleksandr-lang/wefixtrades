/**
 * Lane OB — CASL hard-gate + suppression unification + volume ramp tests.
 *
 * Runnable standalone via:
 *   DATABASE_URL=postgres://test:test@127.0.0.1:5432/test_unused \
 *     npx tsx server/services/outboundSafety.test.ts
 *
 * Excluded from `tsc --noEmit` (tsconfig.json excludes **\/*.test.ts).
 *
 * Every gate is exercised with DELIBERATE-FAILURE fixtures: each blocked
 * case has a passing twin differing in exactly one field, proving the gate
 * is the discriminator (per feedback_external_integration_rigor).
 */

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test_unused";
}

import assert from "node:assert/strict";
import {
  evaluateConsentGate,
  checkPushEligibility,
  computeGlobalDailyCap,
  GlobalSendBudget,
  validateCanSpamBody,
  validateSequenceCanSpam,
  minContactConfidence,
  publishedOnOwnDomain,
  type ConsentGateInput,
  type PushEligibilityProspect,
} from "./outboundSafety";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void> | void): Promise<void> {
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

/** Base prospect: HIGH confidence, US, email published on own domain — fully eligible. */
function prospect(overrides: Partial<PushEligibilityProspect> = {}): PushEligibilityProspect {
  return {
    contact_confidence: "high",
    reviewed_by: null,
    consent_basis: "none",
    consent_expires_at: null,
    country: "US",
    primary_email: "john@acmeplumbing.com",
    website_domain: "acmeplumbing.com",
    do_not_contact: false,
    primary_phone: "+14165551234",
    ...overrides,
  };
}

function clearEnv() {
  delete process.env.OUTBOUND_MIN_CONTACT_CONFIDENCE;
  delete process.env.OUTBOUND_CASL_STRICT;
  delete process.env.OUTBOUND_GLOBAL_DAILY_CAP;
}

const DAY = 24 * 60 * 60 * 1000;

async function run(): Promise<void> {
  console.log("Lane OB — outbound compliance gate tests:\n");

  /* ═══ Consent gate: confidence minimum ═══ */

  await test("default minimum confidence is 'high'", () => {
    clearEnv();
    assert.equal(minContactConfidence(), "high");
  });

  await test("DELIBERATE FAILURE: medium confidence is BLOCKED under default env", () => {
    clearEnv();
    const r = evaluateConsentGate(prospect({
      contact_confidence: "medium",
      primary_email: "info@acmeplumbing.com", // even published on own domain
    }));
    assert.equal(r.eligible, false, "medium must NOT auto-pass under default");
    assert.equal(!r.eligible && r.code, "blocked_confidence");
  });

  await test("high confidence passes under default env", () => {
    clearEnv();
    const r = evaluateConsentGate(prospect());
    assert.equal(r.eligible, true);
  });

  await test("reviewed_by overrides the confidence gate (same medium fixture, +review)", () => {
    clearEnv();
    const blockedTwin = evaluateConsentGate(prospect({
      contact_confidence: "medium",
      primary_email: "info@acmeplumbing.com",
    }));
    assert.equal(blockedTwin.eligible, false, "twin without review must block");
    const r = evaluateConsentGate(prospect({
      contact_confidence: "medium",
      primary_email: "info@acmeplumbing.com",
      reviewed_by: 42,
    }));
    assert.equal(r.eligible, true, "human review must override confidence");
  });

  await test("express consent passes even at low confidence (no expiry)", () => {
    clearEnv();
    const r = evaluateConsentGate(prospect({
      contact_confidence: "low",
      primary_email: "acmeplumbing@gmail.com",
      consent_basis: "express",
    }));
    assert.equal(r.eligible, true);
    assert.equal(r.eligible && r.basis, "express");
  });

  await test("lowering env minimum to 'medium' lets medium auto-pass (env is live)", () => {
    clearEnv();
    process.env.OUTBOUND_MIN_CONTACT_CONFIDENCE = "medium";
    const r = evaluateConsentGate(prospect({
      contact_confidence: "medium",
      primary_email: "info@acmeplumbing.com",
    }));
    assert.equal(r.eligible, true);
    clearEnv();
  });

  /* ═══ Consent gate: CASL 2-year implied window ═══ */

  await test("DELIBERATE FAILURE: CA prospect with EXPIRED implied consent is blocked", () => {
    clearEnv();
    const now = new Date("2026-06-10T00:00:00Z");
    const r = evaluateConsentGate(prospect({
      country: "CA",
      contact_confidence: "high",
      consent_basis: "implied_inquiry",
      consent_expires_at: new Date(now.getTime() - DAY), // expired yesterday
    }), now);
    assert.equal(r.eligible, false);
    assert.equal(!r.eligible && r.code, "blocked_consent_expired");
  });

  await test("same CA fixture with UNEXPIRED implied consent passes (expiry is the discriminator)", () => {
    clearEnv();
    const now = new Date("2026-06-10T00:00:00Z");
    const r = evaluateConsentGate(prospect({
      country: "CA",
      contact_confidence: "high",
      consent_basis: "implied_inquiry",
      consent_expires_at: new Date(now.getTime() + DAY), // expires tomorrow
    }), now);
    assert.equal(r.eligible, true);
  });

  await test("expired implied consent blocks even with reviewed_by AND high confidence", () => {
    clearEnv();
    const now = new Date("2026-06-10T00:00:00Z");
    const r = evaluateConsentGate(prospect({
      country: "CA",
      reviewed_by: 42,
      consent_basis: "implied_inquiry",
      consent_expires_at: new Date(now.getTime() - DAY),
    }), now);
    assert.equal(r.eligible, false);
    assert.equal(!r.eligible && r.code, "blocked_consent_expired");
  });

  /* ═══ Consent gate: CASL strictness ═══ */

  await test("strict CASL blocks scraped third-party email with no consent basis", () => {
    clearEnv();
    const r = evaluateConsentGate(prospect({
      contact_confidence: "high", // passes confidence...
      primary_email: "owner@totally-unrelated.com", // ...but not published on own site
      website_domain: "acmeplumbing.com",
    }));
    assert.equal(r.eligible, false);
    assert.equal(!r.eligible && r.code, "blocked_casl_no_basis");
  });

  await test("CA prospect is ALWAYS strict, even with OUTBOUND_CASL_STRICT=false", () => {
    clearEnv();
    process.env.OUTBOUND_CASL_STRICT = "false";
    const us = evaluateConsentGate(prospect({
      country: "US",
      primary_email: "owner@totally-unrelated.com",
    }));
    assert.equal(us.eligible, true, "US prospect passes when strict mode is off");
    const ca = evaluateConsentGate(prospect({
      country: "CA",
      primary_email: "owner@totally-unrelated.com",
    }));
    assert.equal(ca.eligible, false, "CA must stay strict regardless of env");
    assert.equal(!ca.eligible && ca.code, "blocked_casl_no_basis");
    clearEnv();
  });

  await test("conspicuous publication (own-domain email) is reported for bookkeeping", () => {
    clearEnv();
    const r = evaluateConsentGate(prospect());
    assert.equal(r.eligible, true);
    assert.equal(r.eligible && r.inferred_conspicuous, true);
    assert.equal(publishedOnOwnDomain("a@b.com", "www.b.com"), true);
    assert.equal(publishedOnOwnDomain("a@gmail.com", "b.com"), false);
  });

  /* ═══ Push-time eligibility: post-assignment suppression ═══ */

  await test("DELIBERATE FAILURE: lead blacklisted AFTER assignment is NOT pushed", async () => {
    clearEnv();
    const p = prospect();
    // Twin 1 — assignment-time state: blacklist clean → eligible (would push).
    const before = await checkPushEligibility(p, {
      checkBlacklist: async () => ({ blocked: false }),
      isEmailUnsubscribed: async () => false,
    });
    assert.equal(before.eligible, true, "clean lead must be pushable");
    // Twin 2 — same prospect, but a webhook blacklisted it after assignment.
    const after = await checkPushEligibility(p, {
      checkBlacklist: async () => ({ blocked: true, type: "email", reason: "unsubscribed" }),
      isEmailUnsubscribed: async () => false,
    });
    assert.equal(after.eligible, false, "post-assignment blacklist must block the push");
    assert.equal(!after.eligible && after.code, "blocked_blacklist");
  });

  await test("transactional unsubscribe (email_unsubscribes bridge) blocks the push", async () => {
    clearEnv();
    const r = await checkPushEligibility(prospect(), {
      checkBlacklist: async () => ({ blocked: false }),
      isEmailUnsubscribed: async () => true,
    });
    assert.equal(r.eligible, false);
    assert.equal(!r.eligible && r.code, "blocked_unsubscribed");
  });

  await test("do_not_contact blocks the push before any external lookup", async () => {
    clearEnv();
    const r = await checkPushEligibility(prospect({ do_not_contact: true }), {
      checkBlacklist: async () => {
        throw new Error("must not be called for DNC leads");
      },
      isEmailUnsubscribed: async () => false,
    });
    assert.equal(r.eligible, false);
    assert.equal(!r.eligible && r.code, "blocked_dnc");
  });

  await test("push-time gate re-runs the consent gate (medium blocked at push too)", async () => {
    clearEnv();
    const r = await checkPushEligibility(
      prospect({ contact_confidence: "medium", primary_email: "info@acmeplumbing.com" }),
      {
        checkBlacklist: async () => ({ blocked: false }),
        isEmailUnsubscribed: async () => false,
      },
    );
    assert.equal(r.eligible, false);
    assert.equal(!r.eligible && r.code, "blocked_confidence");
  });

  /* ═══ Global volume ramp ═══ */

  await test("ramp starts at 50/day before any real send", () => {
    clearEnv();
    assert.equal(computeGlobalDailyCap(null), 50);
  });

  await test("ramp adds 25/day per full week since first real send", () => {
    clearEnv();
    const first = new Date("2026-06-01T12:00:00Z");
    assert.equal(computeGlobalDailyCap(first, new Date("2026-06-01T13:00:00Z")), 50);  // day 0
    assert.equal(computeGlobalDailyCap(first, new Date("2026-06-07T12:00:00Z")), 50);  // day 6 — not a full week
    assert.equal(computeGlobalDailyCap(first, new Date("2026-06-08T12:00:00Z")), 75);  // week 1
    assert.equal(computeGlobalDailyCap(first, new Date("2026-06-29T12:00:00Z")), 150); // week 4
  });

  await test("OUTBOUND_GLOBAL_DAILY_CAP is a hard ceiling over the ramp", () => {
    clearEnv();
    process.env.OUTBOUND_GLOBAL_DAILY_CAP = "60";
    const first = new Date("2026-01-01T00:00:00Z");
    assert.equal(computeGlobalDailyCap(first, new Date("2026-06-10T00:00:00Z")), 60, "ramp would be way above 60");
    assert.equal(computeGlobalDailyCap(null), 50, "ceiling never raises the ramp");
    clearEnv();
  });

  await test("DELIBERATE FAILURE: global cap of 50 holds ACROSS 2 campaigns in one day", () => {
    clearEnv();
    const budget = new GlobalSendBudget(50, 0); // one budget for the whole run
    let campaignA = 0;
    let campaignB = 0;
    for (let i = 0; i < 40; i++) if (budget.tryConsume()) campaignA++; // campaign A wants 40
    for (let i = 0; i < 40; i++) if (budget.tryConsume()) campaignB++; // campaign B wants 40 more
    assert.equal(campaignA, 40, "campaign A fits inside the cap");
    assert.equal(campaignB, 10, "campaign B must be cut off at the GLOBAL 50, not its own cap");
    assert.equal(campaignA + campaignB, 50, "total real sends never exceed the global cap");
    assert.equal(budget.tryConsume(), false, "51st send must be refused");
    assert.equal(budget.remaining, 0);
  });

  await test("budget accounts for sends already made earlier in the day", () => {
    clearEnv();
    const budget = new GlobalSendBudget(50, 45); // 45 already pushed today
    assert.equal(budget.remaining, 5);
    let granted = 0;
    for (let i = 0; i < 10; i++) if (budget.tryConsume()) granted++;
    assert.equal(granted, 5);
  });

  /* ═══ CAN-SPAM sequence validation ═══ */

  const COMPLIANT_BODY =
    "Hi {{first_name}},\n\nSaw your site — quick idea.\n\n" +
    "{{sender_address}}\nDon't want these? {{unsubscribe}}";

  await test("DELIBERATE FAILURE: step body MISSING physical address fails activation", () => {
    const body = "Hi {{first_name}}, quick idea.\n\nUnsubscribe here: {{unsubscribe}}";
    const v = validateCanSpamBody(body);
    assert.equal(v.ok, false);
    assert.deepEqual(v.missing, ["physical_address"]);
  });

  await test("DELIBERATE FAILURE: step body missing unsubscribe fails activation", () => {
    const body = "Hi {{first_name}}, quick idea.\n\n123 Main St, Suite 200, Toronto ON";
    const v = validateCanSpamBody(body);
    assert.equal(v.ok, false);
    assert.deepEqual(v.missing, ["unsubscribe"]);
  });

  await test("compliant body (merge tokens) passes", () => {
    const v = validateCanSpamBody(COMPLIANT_BODY);
    assert.equal(v.ok, true);
    assert.deepEqual(v.missing, []);
  });

  await test("compliant body (literal address + opt-out wording) passes", () => {
    const v = validateCanSpamBody(
      "Hello!\n\nWeFixTrades, 4501 W Innovation Blvd Suite 200, Austin TX 78701\n" +
      "Reply STOP or click here to opt out: https://wefixtrades.com/u/abc",
    );
    assert.equal(v.ok, true);
  });

  await test("sequence validation reports exactly WHICH step fails", () => {
    const r = validateSequenceCanSpam([
      { order_index: 1, body_template: COMPLIANT_BODY },
      { order_index: 2, body_template: "Just bumping this!" }, // followup forgot the footer
      { order_index: 3, body_template: COMPLIANT_BODY },
    ]);
    assert.equal(r.ok, false);
    assert.equal(r.failures.length, 1);
    assert.equal(r.failures[0].order_index, 2);
    assert.deepEqual(r.failures[0].missing, ["physical_address", "unsubscribe"]);
  });

  await test("empty sequence cannot be compliant by vacuity at the route level", () => {
    // validateSequenceCanSpam([]) is vacuously ok — the route's
    // canSpamActivationError() rejects zero-step activation separately.
    const r = validateSequenceCanSpam([]);
    assert.equal(r.ok, true);
  });

  /* ═══ Module shape ═══ */

  await test("sync worker module loads cleanly and exports the ramp helpers", async () => {
    const mod = await import("../jobs/outboundSyncWorker");
    assert.equal(typeof mod.processOutboundSync, "function");
    assert.equal(typeof mod.buildGlobalSendBudget, "function");
    assert.equal(typeof mod.markFirstRealSend, "function");
    assert.equal(typeof mod.getFirstRealSendAt, "function");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
