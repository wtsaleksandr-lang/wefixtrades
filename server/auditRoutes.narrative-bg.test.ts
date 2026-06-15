/**
 * Background AI-narrative job tests (feat/audit-narrative-bg-merge).
 *
 * KEYSTONE: the premium Sonnet narrative used to race a ~28s inline budget that
 * the 40-55s data-gather starved, so most reports shipped the GENERIC templated
 * fallback. The fix generates the AI narrative in a BACKGROUND job (90s budget,
 * off the request path) and PATCHES it into the saved report; the client polls
 * and swaps the templated prose for the AI prose when ready.
 *
 * This guards the PURE core of that flow (DB-free):
 *   (a) parseNarrativeJSON recovers the model's JSON (clean, fenced, truncated);
 *   (b) buildNarrativePatch shapes the parsed AI narrative + reports 'ready';
 *   (c) buildNarrativePatch reports 'failed' on unparseable / timeout output
 *       (so the report keeps its already-shipped templated narrative — never a
 *       fabricated upgrade);
 *   (d) finalizeNarrativeShapes injects contentGap volumes + splits problem/fix;
 *   (e) the isReal $-gating is PRESERVED: the patch never fabricates a dollar
 *       figure — when the model (under the no-$ prompt) returns a {low:0,high:0}
 *       loss + dollar-free prose, the patch carries that through verbatim.
 *
 * DB-free: auditRoutes.ts transitively imports server/db, which throws at
 * module-eval when DATABASE_URL is unset. We set a dummy URL FIRST (mirror of
 * auditRoutes.audit-general.test.ts), THEN dynamically import. The functions
 * under test never open a DB connection.
 *
 * Runnable standalone:  npx tsx server/auditRoutes.narrative-bg.test.ts
 * Wired into CI as `npm run check:audit-narrative`.
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 */
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://audit:audit@127.0.0.1:1/audit_no_connect";
}
process.env.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "test-key-not-used";

/** Recursively collect every string value in an object/array. */
function allStrings(v: any, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) allStrings(x, out);
  else if (v && typeof v === "object") for (const k of Object.keys(v)) allStrings(v[k], out);
  return out;
}

/** A realistic AI narrative payload, paramaterised by whether a $ figure is real. */
function sampleNarrativeJSON(opts: { withDollar: boolean }): any {
  return {
    grade: "C",
    executiveSummary: opts.withDollar
      ? "You score 62/100 (Grade C) with a strong 4.7 rating. Your biggest gap: only 18 reviews vs the leader's 140. Closing it is worth roughly $1,200–$2,400/month."
      : "You score 62/100 (Grade C) with a strong 4.7 rating. Your biggest gap is visibility: you rank for only 2 of 6 key searches. Closing it means more inbound contacts and faster response.",
    keyStrength: "Your 4.7 rating beats most competitors in the area.",
    competitorWeakness: "Acme Plumbing has 140 reviews but a slow website.",
    actionPlan: [
      {
        priority: "HIGH",
        title: "Grow your review base",
        // problem + fix intentionally collide on the detail to prove ensureProblemFix splits them.
        problem: "",
        fix: "",
        detail: "Send a one-tap review link to your last 30 happy customers.",
        estimatedImpact: "More reviews lift your Maps ranking and trust.",
        estimatedCost: "Free",
        timeToResult: "2-4 weeks",
        wefixtrades_can_help: true,
      },
    ],
    contentGaps: [
      // monthlySearches null → must be filled from volumeMap.
      { pageTitle: "Drain Cleaning Austin — Same-Day Service", targetKeyword: "drain cleaning austin", monthlySearches: null, reason: "High-intent, not ranking." },
    ],
    demandGapInsight: "Your hours cover evenings, so you're capturing after-hours demand.",
    estimatedMonthlyRevenueLoss: opts.withDollar
      ? { low: 1200, high: 2400, calculation: "Based on 6 missed leads/mo at $400 avg job." }
      : { low: 0, high: 0, calculation: "No defensible dollar figure for this business." },
    quickWin: { action: "Reply to all reviews", timeRequired: "20 min", expectedResult: "Higher trust" },
    websiteInsight: null,
    reportDataQuality: {
      keywordDataAvailable: true, competitorDataAvailable: true, demandDataAvailable: true,
      adDataAvailable: true, reviewDataAvailable: true, missingDataNote: null,
    },
  };
}

async function main() {
  const { parseNarrativeJSON, buildNarrativePatch, finalizeNarrativeShapes, injectContentGapVolumes } =
    await import("./auditRoutes");

  /* ─── (a) parseNarrativeJSON recovers clean / fenced / truncated JSON ─── */
  {
    const clean = JSON.stringify({ grade: "A", executiveSummary: "ok" });
    assert.deepEqual(parseNarrativeJSON(clean), { grade: "A", executiveSummary: "ok" }, "parses clean JSON");

    const fenced = "```json\n" + clean + "\n```";
    assert.deepEqual(parseNarrativeJSON(fenced), { grade: "A", executiveSummary: "ok" }, "strips markdown fences");

    const chatty = "Here is your report:\n" + clean + "\nLet me know!";
    assert.equal(parseNarrativeJSON(chatty)?.grade, "A", "extracts JSON from surrounding chatter");

    // Truncated mid-array (complete-value cutoff) — salvage by closing the open
    // bracket/brace. This is the shape a token-limit cutoff produces.
    const truncated = '{"grade":"B","executiveSummary":"You score 62/100.","items":[1,2,3';
    const salvaged = parseNarrativeJSON(truncated);
    assert.equal(salvaged?.grade, "B", "salvages truncated JSON (grade survives)");
    assert.equal(salvaged?.executiveSummary, "You score 62/100.", "salvages truncated JSON (summary survives)");

    assert.equal(parseNarrativeJSON(""), null, "empty string → null");
    assert.equal(parseNarrativeJSON("not json at all"), null, "garbage → null");
  }

  /* ─── (b) buildNarrativePatch shapes the AI narrative and reports 'ready' ─── */
  {
    const raw = JSON.stringify(sampleNarrativeJSON({ withDollar: true }));
    const volumeMap = { "drain cleaning austin": { searchVolume: 880, cpc: 12.5 } };
    const patch = buildNarrativePatch(raw, volumeMap);
    assert.equal(patch.status, "ready", "valid AI output → status ready");
    if (patch.status !== "ready") throw new Error("unreachable");

    // contentGap volume injected.
    assert.equal(patch.narrative.contentGaps[0].monthlySearches, 880, "contentGap monthlySearches filled from volumeMap");
    assert.equal(patch.narrative.contentGaps[0].cpc, 12.5, "contentGap cpc filled from volumeMap");

    // problem/fix split (ensureProblemFix): both filled, and never identical.
    const item = patch.narrative.actionPlan[0];
    assert.ok(item.problem && item.fix, "problem and fix both populated");
    assert.notEqual(item.problem, item.fix, "problem and fix are distinct (never identical)");
  }

  /* ─── (c) buildNarrativePatch reports 'failed' on unusable output ─── */
  {
    const AI_TIMEOUT_SENTINEL = "__AI_TIMEOUT__";
    assert.equal(buildNarrativePatch(AI_TIMEOUT_SENTINEL, null).status, "failed", "timeout sentinel → failed (keep templated)");
    assert.equal(buildNarrativePatch("", null).status, "failed", "empty → failed");
    assert.equal(buildNarrativePatch("the model said no", null).status, "failed", "unparseable → failed");
  }

  /* ─── (d) injectContentGapVolumes is a no-op without a volumeMap ─── */
  {
    const narrative = { contentGaps: [{ targetKeyword: "x", monthlySearches: null, cpc: null }] };
    injectContentGapVolumes(narrative, null);
    assert.equal(narrative.contentGaps[0].monthlySearches, null, "no volumeMap → contentGap unchanged");
    finalizeNarrativeShapes(narrative, undefined); // must not throw on missing actionPlan
  }

  /* ─── (e) isReal $-gating PRESERVED: no fabricated dollar figure ─── */
  {
    const raw = JSON.stringify(sampleNarrativeJSON({ withDollar: false }));
    const patch = buildNarrativePatch(raw, null);
    assert.equal(patch.status, "ready", "no-$ AI output still produces a ready patch");
    if (patch.status !== "ready") throw new Error("unreachable");

    // The structured loss stays zeroed — the patch never invents a band.
    assert.equal(patch.narrative.estimatedMonthlyRevenueLoss.low, 0, "loss.low stays 0");
    assert.equal(patch.narrative.estimatedMonthlyRevenueLoss.high, 0, "loss.high stays 0");

    // No prose string contains a fabricated dollar amount ($ followed by a digit).
    const strings = allStrings(patch.narrative);
    const offender = strings.find((s) => /\$\s?\d/.test(s));
    assert.equal(offender, undefined, `no $-figure in no-$ narrative prose (found: ${offender ?? "none"})`);
  }

  console.log("auditRoutes.narrative-bg.test.ts — all assertions passed");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
