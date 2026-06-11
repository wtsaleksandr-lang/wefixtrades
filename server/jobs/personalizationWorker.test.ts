/**
 * Regression tests for the deferred per-prospect AI personalization worker.
 *
 * What this gate protects (P1-2 wiring):
 *
 *   1. Static guards — assignment must NEVER run AI calls inline again
 *      (the HTTP request previously blocked on N sequential model calls),
 *      the scheduler actually runs the worker, and the outbound sync worker
 *      still merges the four ai_* tokens into the platform lead payload.
 *   2. Behavioral — tokens are generated AND persisted (real values asserted,
 *      not "ran without error") for an assigned prospect without tokens;
 *      a prospect that already has tokens is skipped (no AI spend, no
 *      overwrite); a mid-batch failure is isolated; the flag + batch cap
 *      conventions hold.
 *   3. Deliberate-failure fixture — re-implements a "regressed" worker that
 *      ignores existing tokens and proves the skip-invariant assertion
 *      catches it (the gate fails red, it isn't vacuous).
 *
 * Runnable standalone via:
 *   npx tsx server/jobs/personalizationWorker.test.ts
 * Wired as `npm run check:outreach-personalization`.
 *
 * Excluded from `tsc --noEmit` via the project tsconfig's test pattern.
 * Uses node:assert/strict, no test runner dependency.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* The worker module imports server/db.ts, which throws without a
 * DATABASE_URL. Nothing in this test ever touches the pool (all IO is
 * injected), so a stub URL is fine. Must be set BEFORE the dynamic import. */
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/* ═══ 1. Static guards — wiring stays correct ═══ */

// The assign endpoint must not run AI personalization inline ever again.
const routesSrc = read("server/routes/adminOutboundRoutes.ts");
assert.ok(
  !routesSrc.includes("personalizeForProspect"),
  "adminOutboundRoutes.ts must not call personalizeForProspect inline — personalization is deferred to personalizationWorker"
);

// The scheduler actually runs the worker (a worker nobody schedules is dead code).
const schedulerSrc = read("server/jobs/scheduler.ts");
assert.ok(
  schedulerSrc.includes("processOutreachPersonalization"),
  "scheduler.ts must run the personalization worker"
);

// The sync worker still merges every one of the four tokens into the
// platform payload — without this, generated tokens never reach an email.
const syncSrc = read("server/jobs/outboundSyncWorker.ts");
for (const field of ["ai_first_line", "ai_reason_to_target", "ai_offer_angle", "ai_cta_variant"]) {
  assert.ok(
    new RegExp(`customFields\\.${field}`).test(syncSrc),
    `outboundSyncWorker.ts must merge ${field} into the lead's customFields`
  );
}

// Inert-by-default convention (matches ARTIFACT_OUTREACH_ENABLED).
const workerSrc = read("server/jobs/personalizationWorker.ts");
assert.ok(
  workerSrc.includes('process.env.OUTREACH_PERSONALIZATION_ENABLED === "true"'),
  "personalizationWorker.ts must be gated on OUTREACH_PERSONALIZATION_ENABLED === 'true' (inert by default)"
);

/* ═══ 2. Behavioral — injected-IO runs of the real worker ═══ */

const {
  processOutreachPersonalization,
  personalizationBatchSize,
} = await import("./personalizationWorker");
import type {
  PersonalizationIo,
  PersonalizationCandidate,
} from "./personalizationWorker";
import type { PersonalizationTokens } from "../services/copyEngine";
import type { Prospect } from "@shared/schema";

const fakeProspect = (id: number): Prospect =>
  ({
    id,
    business_name: `Biz ${id}`,
    primary_email: `owner${id}@example.com`,
    trade_category: "plumber",
    city: "Calgary",
    state: "AB",
    do_not_contact: false,
  } as unknown as Prospect);

const tokensFor = (id: number): PersonalizationTokens => ({
  ai_first_line: `first-line-${id}`,
  ai_reason_to_target: `reason-${id}`,
  ai_offer_angle: `angle-${id}`,
  ai_cta_variant: `cta-${id}`,
});

const CTX = { icp: "test icp", painPoint: "test pain", offer: "test offer" };

function makeIo(candidates: PersonalizationCandidate[], opts?: {
  failProspectIds?: number[];
  contextByCampaign?: Map<number, typeof CTX | null>;
}) {
  const store = new Map<number, PersonalizationTokens>();
  const personalizeCalls: number[] = [];
  const contextCalls: number[] = [];
  let requestedLimit = -1;
  const io: PersonalizationIo = {
    async fetchCandidates(limit) {
      requestedLimit = limit;
      return candidates.slice(0, limit);
    },
    async getContext(campaignId) {
      contextCalls.push(campaignId);
      if (opts?.contextByCampaign) {
        return opts.contextByCampaign.get(campaignId) ?? null;
      }
      return CTX;
    },
    async personalize(prospect) {
      personalizeCalls.push(prospect.id);
      if (opts?.failProspectIds?.includes(prospect.id)) {
        throw new Error(`simulated provider failure for prospect ${prospect.id}`);
      }
      return tokensFor(prospect.id);
    },
    async persistTokens(prospectId, tokens) {
      store.set(prospectId, tokens);
    },
  };
  return { io, store, personalizeCalls, contextCalls, limit: () => requestedLimit };
}

const cand = (
  prospectId: number,
  campaignId = 1,
  existingFirstLine: string | null = null
): PersonalizationCandidate => ({
  campaign_id: campaignId,
  prospect: fakeProspect(prospectId),
  existing_first_line: existingFirstLine,
});

/* 2a. Flag off → fully inert: no fetch, no AI calls, no writes. */
delete process.env.OUTREACH_PERSONALIZATION_ENABLED;
{
  const { io, store, personalizeCalls, limit } = makeIo([cand(1)]);
  const r = await processOutreachPersonalization(io);
  assert.equal(r.enabled, false, "worker must report disabled when flag unset");
  assert.equal(limit(), -1, "worker must not even fetch candidates when disabled");
  assert.equal(personalizeCalls.length, 0, "no AI calls when disabled");
  assert.equal(store.size, 0, "no writes when disabled");
}

process.env.OUTREACH_PERSONALIZATION_ENABLED = "true";

/* 2b. Tokens are generated AND persisted for an assigned prospect without
 *     tokens; a prospect with existing tokens is skipped (no AI call, no
 *     overwrite). Assertions are on the actual persisted values. */
{
  const { io, store, personalizeCalls } = makeIo([
    cand(101),                       // needs tokens
    cand(102, 1, "already here."),   // already personalized — must be skipped
  ]);
  const r = await processOutreachPersonalization(io);

  assert.equal(r.enabled, true);
  assert.equal(r.scanned, 2);
  assert.equal(r.personalized, 1, "exactly one prospect should be personalized");
  assert.equal(r.skipped, 1, "the already-tokened prospect must be counted skipped");
  assert.equal(r.failed, 0);

  // (a) generated + persisted — real values, all four fields.
  assert.deepEqual(
    store.get(101),
    {
      ai_first_line: "first-line-101",
      ai_reason_to_target: "reason-101",
      ai_offer_angle: "angle-101",
      ai_cta_variant: "cta-101",
    },
    "all four tokens must be persisted for the token-less prospect"
  );

  // (b) skipped — never sent to the model, never written.
  assert.ok(!personalizeCalls.includes(102), "prospect with existing tokens must not be sent to the AI");
  assert.equal(store.has(102), false, "prospect with existing tokens must not be overwritten");
}

/* 2c. Mid-batch failure is isolated: the failing prospect is counted and
 *     logged, the rest of the batch still completes. */
{
  const { io, store } = makeIo(
    [cand(201), cand(202), cand(203)],
    { failProspectIds: [202] }
  );
  const r = await processOutreachPersonalization(io);
  assert.equal(r.personalized, 2, "two prospects should still succeed");
  assert.equal(r.failed, 1, "the simulated failure must be counted");
  assert.deepEqual(store.get(201), tokensFor(201));
  assert.deepEqual(store.get(203), tokensFor(203), "prospect AFTER the failure must still be processed");
  assert.equal(store.has(202), false, "failed prospect must not get partial tokens");
}

/* 2d. Campaign without an ai_personalize sequence → skipped, no AI spend,
 *     and the context is looked up once per campaign (cached). */
{
  const contextByCampaign = new Map<number, typeof CTX | null>([
    [7, null],   // no ai_personalize sequence
    [8, CTX],
  ]);
  const { io, store, personalizeCalls, contextCalls } = makeIo(
    [cand(301, 7), cand(302, 7), cand(303, 8)],
    { contextByCampaign }
  );
  const r = await processOutreachPersonalization(io);
  assert.equal(r.skipped, 2, "both leads of the non-AI campaign must be skipped");
  assert.equal(r.personalized, 1);
  assert.equal(personalizeCalls.length, 1, "no AI calls for the non-AI campaign");
  assert.deepEqual(store.get(303), tokensFor(303));
  assert.deepEqual(
    contextCalls,
    [7, 8],
    "context must be resolved once per campaign per tick (cached), not once per prospect"
  );
}

/* 2e. Batch cap conventions: default 12; env-tunable; hard ceiling 50. */
{
  delete process.env.OUTREACH_PERSONALIZATION_BATCH;
  assert.equal(personalizationBatchSize(), 12, "default batch cap is 12");
  process.env.OUTREACH_PERSONALIZATION_BATCH = "7";
  assert.equal(personalizationBatchSize(), 7);
  process.env.OUTREACH_PERSONALIZATION_BATCH = "999";
  assert.equal(personalizationBatchSize(), 50, "batch cap must clamp at 50");
  delete process.env.OUTREACH_PERSONALIZATION_BATCH;

  // And the worker actually passes the cap into the candidate query.
  const { io, limit } = makeIo([]);
  await processOutreachPersonalization(io);
  assert.equal(limit(), 12, "worker must fetch at most the batch cap");
}

/* ═══ 3. Deliberate-failure fixture — the skip gate catches a regression ═══ */
/* Re-implement the regression this gate exists to prevent: a worker that
 * personalizes every candidate, ignoring existing tokens (overwrite +
 * double-spend). Run the SAME invariant assertions and prove they go red. */
{
  const regressedWorker = async (io: PersonalizationIo) => {
    const rows = await io.fetchCandidates(12);
    for (const row of rows) {
      // BUG (deliberate): no existing_first_line check.
      const ctx = await io.getContext(row.campaign_id);
      if (!ctx) continue;
      const tokens = await io.personalize(row.prospect, ctx);
      await io.persistTokens(row.prospect.id, tokens);
    }
  };

  const { io, store, personalizeCalls } = makeIo([cand(401, 1, "already here.")]);
  await regressedWorker(io);

  const skipInvariant = () => {
    assert.ok(!personalizeCalls.includes(401), "prospect with existing tokens must not be sent to the AI");
    assert.equal(store.has(401), false, "prospect with existing tokens must not be overwritten");
  };
  assert.throws(
    skipInvariant,
    "the skip-existing-tokens assertions must FAIL against a regressed worker that ignores existing tokens — otherwise this gate is vacuous"
  );
}

delete process.env.OUTREACH_PERSONALIZATION_ENABLED;

console.log("personalizationWorker.test.ts — all assertions passed");
