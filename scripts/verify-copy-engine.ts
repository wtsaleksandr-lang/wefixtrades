/**
 * Copy engine verification harness.
 *
 * Runs the multi-agent pipeline (research → drafter → editor → QA) end-to-end
 * against the real Anthropic API and prints the result for visual inspection.
 *
 * NOT a pass/fail test — the operator reads the output to evaluate prompt
 * quality and iterates on prompts.ts. After it looks good, optionally pass
 * --persist to write the result to outbound_sequence_templates so the
 * /api/admin/outbound/sequences route can serve it.
 *
 * Required env:
 *   ANTHROPIC_API_KEY        — same key the running app uses
 *   DATABASE_URL             — required only when --persist is passed
 *
 * Usage:
 *   npx tsx scripts/verify-copy-engine.ts                 # generate + print
 *   npx tsx scripts/verify-copy-engine.ts --persist       # generate + persist
 *   npx tsx scripts/verify-copy-engine.ts --tone warm     # override tone
 *   npx tsx scripts/verify-copy-engine.ts --steps 5       # override step count
 *
 * SAFETY:
 *   - Refuses to run if NODE_ENV=production AND --persist is set.
 *   - Persisted rows are clearly tagged in the name so they're easy to
 *     delete from the DB after testing.
 */

/* eslint-disable no-console */

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("✗ ANTHROPIC_API_KEY must be set.");
  process.exit(2);
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const optVal = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
};

const PERSIST = flag("--persist");
const TONE = (optVal("--tone") || "direct") as "direct" | "warm" | "playful" | "technical";
const STEPS = Number(optVal("--steps") || "4");

if (PERSIST && process.env.NODE_ENV === "production") {
  console.error("✗ Refusing to persist in production.");
  process.exit(2);
}

const RUN_TAG = `verify-${Date.now().toString(36)}`;

const SYNTHETIC_INPUTS = {
  // Synthetic but realistic — wefixtrades target ICP.
  icp: "Owner-operator plumbing companies in the US with 1-15 employees, taking calls during the day, missing after-hours leads.",
  painPoint: "Missed calls + manual quote work eats their evenings; first-respond-wins is the dominant signal in the trades.",
  offer: "WeFixTrades — embeddable AI receptionist that answers after-hours calls, qualifies leads, and texts the owner the booking. $99/mo, 7-day setup.",
  senderPersona: "Aleksandr from WeFixTrades, a 2-person team of an ex-trade ops lead and an engineer. Direct, no-fluff, builder mindset.",
  tone: TONE,
  stepCount: STEPS,
};

console.log("══════════════════════════════════════════════════════════════════");
console.log("  COPY ENGINE — VERIFICATION RUN");
console.log("══════════════════════════════════════════════════════════════════");
console.log(`  Tone        : ${TONE}`);
console.log(`  Step count  : ${STEPS}`);
console.log(`  Persist     : ${PERSIST ? "yes" : "no (dry run)"}`);
console.log(`  Run tag     : ${RUN_TAG}`);
console.log("");

const { generateSequence } = await import("../server/services/copyEngine/sequenceGenerator");

const t0 = Date.now();
const result = await generateSequence(SYNTHETIC_INPUTS);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`✓ pipeline complete in ${elapsed}s — runId=${result.runId}\n`);

console.log("─── BRIEF (research agent) ─────────────────────────────────────");
console.log("Pain points:");
result.brief.painPoints.forEach((p) => console.log(`  • ${p}`));
console.log("\nValue props:");
result.brief.valueProps.forEach((v) => console.log(`  • ${v}`));
console.log("\nSubject themes:");
result.brief.subjectThemes.forEach((s) => console.log(`  • ${s.angle} → "${s.example}"`));
console.log(`\nSingle CTA: ${result.brief.callToAction}`);

console.log("\n─── DRAFT vs REFINED ───────────────────────────────────────────");
result.refinedSteps.forEach((step, idx) => {
  const draftStep = result.draftSteps[idx];
  console.log(`\nStep ${step.stepNumber} (delay: ${step.delayDays}d):`);
  console.log("  Subject variants:");
  step.subjectVariants.forEach((s) => console.log(`    • ${s}`));
  console.log("  Body:");
  console.log(
    step.body
      .split("\n")
      .map((l) => "    " + l)
      .join("\n")
  );
  if (draftStep.body !== step.body) {
    console.log("  (editor changed body)");
  }
});

console.log("\n─── EDITOR NOTES ───────────────────────────────────────────────");
result.editorNotes.forEach((n) => console.log(`  • ${n}`));

console.log("\n─── QA REPORT ──────────────────────────────────────────────────");
console.log(`  Spam risk score      : ${result.qaReport.spamRiskScore}/100`);
console.log(`  Passes compliance    : ${result.qaReport.passesCompliance}`);
console.log(`  Hardcoded unsubscribe: ${result.qaReport.hasHardcodedUnsubscribe}`);
console.log(`  Tokens used          : ${result.qaReport.tokensUsed.join(", ")}`);
if (result.qaReport.tokensInvalid.length) {
  console.log(`  ⚠ Invalid tokens     : ${result.qaReport.tokensInvalid.join(", ")}`);
}
console.log(`  Summary              : ${result.qaReport.summary}`);
if (result.qaReport.warnings.length) {
  console.log("  Warnings:");
  result.qaReport.warnings.forEach((w) =>
    console.log(`    [${w.severity}] step ${w.stepNumber}: ${w.issue} → ${w.fix}`)
  );
}

if (PERSIST) {
  if (!process.env.DATABASE_URL) {
    console.error("\n✗ --persist requires DATABASE_URL.");
    process.exit(2);
  }
  console.log("\n─── PERSIST ────────────────────────────────────────────────────");
  const { persistSequence } = await import("../server/services/copyEngine");
  const persisted = await persistSequence(result, {
    name: `[verify] ${RUN_TAG} — ${TONE} ${STEPS}-step`,
    activate: false,
  });
  console.log(`  ✓ template_id = ${persisted.templateId}`);
  console.log(`  ✓ step_ids    = [${persisted.stepIds.join(", ")}]`);
  console.log(`  Rows tagged with "[verify] ${RUN_TAG}" — easy to clean up.`);
  // Close pool so the process exits cleanly.
  try {
    const { pool } = await import("../server/db");
    await pool.end();
  } catch {
    /* noop */
  }
}

console.log("\n══════════════════════════════════════════════════════════════════");
console.log(`  Total time: ${elapsed}s`);
console.log("══════════════════════════════════════════════════════════════════");
