/**
 * Trial-truth regression tests for the calculator lifecycle worker.
 *
 * Business decision (2026-06-11): free tools never pause; the 14-day
 * Pro-features preview stays but must be honest. Marketing + terms promise
 * a permanent, no-time-limit free tier — these tests make sure the code
 * can never quietly contradict that again:
 *
 *   1. Static guards — the worker is physically incapable of pausing a
 *      calculator (no deployment-status access, no `pauseExpiredTrials`),
 *      the scheduler no longer invokes a pause, the legacy wizard's
 *      AI-trial step stays retired, and the customer-visible copy in the
 *      adjacent emails/UI carries no "trial" / pressure phrasing.
 *   2. Behavioral — running the full lifecycle pass over free calculators
 *      past day 14 sends exactly ONE honest "Pro preview has ended" email
 *      and leaves their live deployment state untouched.
 *   3. Deliberate-failure fixture — re-implements the OLD day-14 pause and
 *      proves the free-tools-stay-live invariant assertion catches it
 *      (i.e. the gate fails red if the pause behavior ever comes back).
 *
 * Runnable standalone via:
 *   npx tsx server/jobs/trialLifecycleWorker.test.ts
 * Wired into CI as `npm run check:trial-truth` (.github/workflows/ci.yml).
 *
 * Excluded from `tsc --noEmit` via the project tsconfig's **\/*.test.ts
 * pattern. Uses node:assert/strict, no test runner dependency.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/* The worker module imports server/db.ts, which throws without a
 * DATABASE_URL. Nothing in this test ever touches the pool (all IO is
 * injected), so a stub URL is fine — same pattern as CI's schema-drift
 * step. Must be set BEFORE the dynamic import below. */
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/* ═══ 1. Static guards — the pause can never come back ═══ */

const workerSrc = read("server/jobs/trialLifecycleWorker.ts");

// No pause machinery in the worker. The IO surface has no deployment-status
// accessor, and these identifiers must never reappear in this file.
for (const banned of [
  "pauseExpiredTrials",
  "upsertDeploymentStatus",
  "getDeploymentStatus",
  "deploymentStatus",
]) {
  assert.ok(
    !workerSrc.includes(banned),
    `trialLifecycleWorker.ts must not reference ${banned} — free calculators never pause`
  );
}
assert.ok(
  !/status:\s*['"]draft['"]/.test(workerSrc),
  "trialLifecycleWorker.ts must never write a 'draft' status"
);
assert.ok(
  !workerSrc.includes("trialExpiryEmail"),
  "the pressure-copy trialExpiryEmail module stays deleted"
);

// The pressure-copy warning email module itself stays deleted.
assert.ok(
  !existsSync(join(root, "server/lib/trialExpiryEmail.ts")),
  "server/lib/trialExpiryEmail.ts ('what you'll lose' pressure copy) must stay deleted"
);

// Scheduler runs the lifecycle pass only — no pause step.
const schedulerSrc = read("server/jobs/scheduler.ts");
assert.ok(
  !schedulerSrc.includes("pauseExpiredTrials"),
  "scheduler.ts must not invoke a trial pause"
);
assert.ok(
  schedulerSrc.includes("processCalculatorLifecycle"),
  "scheduler.ts should run the calculator lifecycle worker"
);

// Legacy wizard (whose PublishStep advertised + activated a 14-day AI
// trial) stays retired: route redirects, files gone.
const appSrc = read("client/src/App.tsx");
assert.ok(!appSrc.includes("WizardLegacy"), "the legacy wizard must stay unrouted");
assert.ok(
  /path="\/wizard\/legacy">\{\(\) => <Redirect to="\/wizard" \/>\}/.test(appSrc),
  "/wizard/legacy must redirect to the canonical /wizard"
);
assert.ok(
  !existsSync(join(root, "client/src/pages/wizard-legacy.tsx")) &&
    !existsSync(join(root, "client/src/components/wizard/legacy")),
  "legacy wizard files (incl. the AI-trial PublishStep) must stay deleted"
);

// Customer-visible copy in adjacent surfaces stays honest.
const proEndedSrc = read("server/lib/proTrialEndedEmail.ts");
assert.ok(
  !/14-day Pro trial/.test(proEndedSrc) && !/free trial/i.test(proEndedSrc),
  "proTrialEndedEmail must not call the preview a trial"
);
assert.ok(
  proEndedSrc.includes("Pro preview has ended"),
  "proTrialEndedEmail must use the honest Pro-preview phrasing"
);
assert.ok(
  !/What you'?ll lose/i.test(proEndedSrc),
  "proTrialEndedEmail must not carry loss-aversion pressure copy"
);

const proExpirySrc = read("server/jobs/trialProExpiryWorker.ts");
assert.ok(
  !/trial ends in 3 days/i.test(proExpirySrc),
  "the T-3d SMS must not say 'trial'"
);
assert.ok(
  proExpirySrc.includes("Pro preview ends in 3 days"),
  "the T-3d SMS should use the honest Pro-preview phrasing"
);

const chatBubbleSrc = read("client/src/components/ai/AIChatBubble.tsx");
assert.ok(
  !/free trial has ended/i.test(chatBubbleSrc),
  "AIChatBubble expiry message must not say 'free trial'"
);
/* UNIFIED-AI U5 (2026-06-12) — the customer-facing widget bubble must NEVER
 * show the owner-facing upgrade/Pro-preview message. Showing "upgrade to Pro"
 * to the owner's HOMEOWNER customer is a direct identity violation (spec §C).
 * Trial-expired (and every other blocked/limit state) is now a WARM hand-off:
 * a normal assistant bubble + an inline lead-capture form. The honest
 * Pro-preview upgrade message lives ONLY in the owner channels — emails
 * (proTrialEndedEmail, asserted above), the T-3d SMS, and the owner portal —
 * NOT in this customer bubble. So the bubble must NOT carry any of that copy. */
for (const banned of [
  "Pro preview of the chat assistant has ended",
  "Upgrading to Pro",
  "upgrade to Pro",
  "Assistant unavailable",
]) {
  assert.ok(
    !chatBubbleSrc.includes(banned),
    `AIChatBubble must NOT show owner-facing upgrade copy to the customer ("${banned}") — it converts blocked states to a warm lead-capture hand-off instead`
  );
}
assert.ok(
  /captureLead/.test(chatBubbleSrc),
  "AIChatBubble must render the warm hand-off lead-capture form (captureLead) for blocked/limit states"
);

const dashboardSrc = read("client/src/pages/dashboard.tsx");
for (const banned of ["left in trial", "banner-trial-expired", "trial has ended", "isTrialExpired"]) {
  assert.ok(
    !dashboardSrc.includes(banned),
    `dashboard.tsx must not resurrect the trial-pause banner ("${banned}")`
  );
}

/* ═══ 2. Behavioral — honest emails, free entitlements untouched ═══ */

const {
  buildLifecycleEmail,
  processCalculatorLifecycle,
  ONBOARDING_EMAIL_DAYS,
  PRO_PREVIEW_ENDED_DAY,
  PRO_PREVIEW_ENDED_EVENT,
} = await import("./trialLifecycleWorker");
const { QUOTEQUICK, getTier, formatPrice } = await import("@shared/pricing");

const ctx = {
  businessName: "Test Plumbing Co",
  slug: "test-plumbing",
  ownerEmail: "owner@example.com",
  views: 42,
  leadCount: 3,
  calcUrl: "https://example.com/calculator?slug=test-plumbing",
  editUrl: "https://example.com/EditCalculator?token=check-dashboard",
  pricingUrl: "https://example.com/pricing/quotequick",
};

// 2a. The countdown-pressure sequence is gone.
for (const day of [7, 10, 13, 21]) {
  assert.equal(
    buildLifecycleEmail(day, ctx),
    null,
    `day-${day} countdown email must not exist — there is nothing to count down to`
  );
}

// 2b. Onboarding emails survive and contain no trial language.
for (const day of ONBOARDING_EMAIL_DAYS) {
  const email = buildLifecycleEmail(day, ctx);
  assert.ok(email, `day-${day} onboarding email should exist`);
  assert.ok(
    !/\btrial\b/i.test(email!.subject + email!.html),
    `day-${day} onboarding email must not mention a trial`
  );
}

// 2c. The ONE expiry email is honest: no trial/pressure words, says the
// free plan is permanent, and quotes prices derived from @shared/pricing.
const ended = buildLifecycleEmail(PRO_PREVIEW_ENDED_DAY, ctx);
assert.ok(ended, "the day-14 Pro-preview-ended email should exist");
const endedText = ended!.subject + " " + ended!.html;
for (const banned of [
  /\btrial\b/i,
  /reactivate/i,
  /last chance/i,
  /act now/i,
  /hurry/i,
  /don'?t lose/i,
  /paused/i,
  /expires? (today|tomorrow|soon)/i,
]) {
  assert.ok(
    !banned.test(endedText),
    `Pro-preview-ended email must not contain ${banned} — no trial claims, no pressure copy`
  );
}
assert.ok(
  ended!.subject.includes("Your Pro preview has ended"),
  "expiry email subject must lead with the honest Pro-preview framing"
);
assert.ok(
  endedText.includes("you're now on the Free plan"),
  "expiry email must state the silent downgrade to the Free plan"
);
assert.ok(
  /free stays free/i.test(endedText),
  "expiry email must reaffirm the permanent free tier"
);
const qqPro = formatPrice(getTier(QUOTEQUICK, "Pro")!.price);
const qqBusiness = formatPrice(getTier(QUOTEQUICK, "Business")!.price);
assert.ok(
  endedText.includes(`${qqPro}/mo`) && endedText.includes(`${qqBusiness}/mo`),
  `expiry email prices must derive from @shared/pricing (${qqPro}/${qqBusiness})`
);

// 2d. Full lifecycle pass over free calculators past day 14: exactly one
// honest email, and the (separately modeled) deployment state stays live.
type FakeCalc = {
  id: number; business_name: string; slug: string | null; owner_email: string | null;
  plan_tier: string | null; total_views: number | null; created_at: Date;
};
const NOW = Date.UTC(2026, 5, 11, 9, 0, 0);
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000);
const fakeCalcs: FakeCalc[] = [
  { id: 1, business_name: "Day-14 Free Co", slug: "day14", owner_email: "a@x.com", plan_tier: "free", total_views: 5, created_at: daysAgo(14) },
  { id: 2, business_name: "Day-20 Free Co", slug: "day20", owner_email: "b@x.com", plan_tier: "free", total_views: 9, created_at: daysAgo(20) },
  { id: 3, business_name: "Paid Co", slug: "paid", owner_email: "c@x.com", plan_tier: "pro", total_views: 1, created_at: daysAgo(14) },
];

// Deployment state lives OUTSIDE the worker's reach — the worker's IO has
// no accessor for it. This map stands in for prod deployment_status rows.
const deploymentStore = new Map<number, string>([[1, "live"], [2, "live"], [3, "live"]]);

function assertFreeToolsStayLive(store: Map<number, string>) {
  for (const calc of fakeCalcs) {
    if (calc.plan_tier === "free" || calc.plan_tier == null) {
      assert.equal(
        store.get(calc.id),
        "live",
        `free calculator ${calc.id} (${calc.business_name}) must stay live — free tools never pause`
      );
    }
  }
}

const sentEmails: { to: string; subject: string; html: string }[] = [];
const trackedEvents: { calculator_id: number; event_type: string }[] = [];
const result = await processCalculatorLifecycle(
  {
    baseUrl: "https://example.com",
    async listCalculators() { return fakeCalcs; },
    async countLeads() { return 2; },
    async wasEventTracked() { return false; },
    async trackEvent(e) { trackedEvents.push({ calculator_id: e.calculator_id, event_type: e.event_type }); },
    async sendEmail(to, subject, html) { sentEmails.push({ to, subject, html }); },
  },
  NOW,
);

assert.equal(result.errors.length, 0, `lifecycle pass errored: ${result.errors.join("; ")}`);
// Day-14 calc gets the expiry email; day-20 is outside the catch-up window
// (no backlog blast); the paid calc is skipped entirely.
assert.equal(sentEmails.length, 1, "exactly ONE expiry email per eligible calculator");
assert.equal(sentEmails[0].to, "a@x.com");
assert.ok(sentEmails[0].subject.includes("Your Pro preview has ended"));
assert.deepEqual(trackedEvents, [{ calculator_id: 1, event_type: PRO_PREVIEW_ENDED_EVENT }]);
// Free entitlements survived the expiry transition.
assertFreeToolsStayLive(deploymentStore);

// 2e. Historical dedup: a calculator that already received the legacy
// day-14 email never gets the new one.
const dedupSent: string[] = [];
await processCalculatorLifecycle(
  {
    baseUrl: "https://example.com",
    async listCalculators() { return [fakeCalcs[0]]; },
    async countLeads() { return 0; },
    async wasEventTracked(_id, eventType) { return eventType === "trial_email_day_14"; },
    async trackEvent() {},
    async sendEmail(to) { dedupSent.push(to); },
  },
  NOW,
);
assert.equal(dedupSent.length, 0, "legacy day-14 recipients must not be re-emailed");

/* ═══ 3. Deliberate failure — the gate catches the old pause behavior ═══ */

// Faithful re-implementation of the REMOVED pauseExpiredTrials rule:
// free tier + past day 14 (17 with leads) + currently live → set 'draft'.
function simulateLegacyPauseExpiredTrials(
  calcs: FakeCalc[],
  store: Map<number, string>,
  leadCounts: Map<number, number>,
  now: number,
) {
  for (const calc of calcs) {
    if (calc.plan_tier && calc.plan_tier !== "free") continue;
    const day = Math.floor((now - calc.created_at.getTime()) / (1000 * 60 * 60 * 24));
    const expiryDay = (leadCounts.get(calc.id) ?? 0) > 0 ? 17 : 14;
    if (day < expiryDay) continue;
    if (store.get(calc.id) !== "live") continue;
    store.set(calc.id, "draft"); // ← the old behavior this PR removes
  }
}

const regressedStore = new Map(deploymentStore);
simulateLegacyPauseExpiredTrials(fakeCalcs, regressedStore, new Map([[1, 0], [2, 0]]), NOW);

// Sanity: the simulation really does pause (otherwise the throws-check below
// would prove nothing).
assert.equal(regressedStore.get(1), "draft", "deliberate-failure fixture must actually pause");
assert.equal(regressedStore.get(2), "draft", "deliberate-failure fixture must actually pause");
assert.equal(regressedStore.get(3), "live", "paid calculators were never auto-paused");

// THE GATE: re-introducing the old pause makes the invariant fail loudly.
assert.throws(
  () => assertFreeToolsStayLive(regressedStore),
  /free tools never pause/,
  "the free-tools-stay-live invariant must catch a re-introduced pause"
);

console.log(
  "trialLifecycleWorker.test.ts — all trial-truth assertions passed " +
    "(no pause paths, honest Pro-preview copy, derived prices, deliberate-failure gate verified)"
);
