/**
 * Gate test for backlog-C Phase A: Riley (brand sales voice line) must be a
 * CLOSER, not an info-desk — and only on the voice line (the website/audit
 * widgets must keep the soft BRAND_VOICE).
 *
 * Drives the real live entrypoint buildSystemPrompt("vapi") with NO TradeLine
 * context (= a brand call), the same prompt handleConversationTurn produces.
 *
 * Regression-catching, not happy-path:
 *   - The voice brand prompt must NOT contain the old info-desk softness
 *     ("Prioritise education and genuine help over selling"), but the WEBSITE
 *     prompt still MUST — proving Riley's closer change is scoped to the voice
 *     line and didn't bleed into the widgets (or revert).
 *
 * Run: tsx tests/riley-closer.test.ts  (DATABASE_URL may be a dummy.)
 */

import { buildSystemPrompt } from "../server/services/promptBuilder";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

const INFO_DESK_SOFTNESS = "Prioritise education and genuine help over selling";

// Brand voice call = surface "vapi" with NO tradeLineContext.
const riley = buildSystemPrompt("vapi", undefined, undefined, undefined, undefined, undefined, undefined);
// Website widget = the soft brand path, for the scope cross-check.
const website = buildSystemPrompt("website", undefined, undefined, undefined, undefined, undefined, undefined);

console.log("riley: is a closer (identity + qualify + objections + close/capture)");
{
  check("identifies as Riley, the sales rep", riley.includes("You are Riley") && riley.includes("sales rep"));
  check("qualifies on decision-maker", riley.includes("decision-maker"));
  check("qualifies on urgency/timeline", riley.includes("urgency") || riley.includes("timeline"));
  check("has an objection-handling section", riley.includes("HANDLE OBJECTIONS"));
  check("handles the price objection", riley.includes("too expensive"));
  check("drives to a close (free strategy call)", riley.includes("strategy call"));
  check("closes by capturing the best phone number", riley.includes("best phone number"));
  check("reads the number back to confirm", riley.includes("read the phone number back"));
}

console.log("riley: grounded — must cite the knowledge base, never invent");
{
  check("includes the knowledge base", riley.includes("YOUR KNOWLEDGE BASE"));
  check("explicit no-invention guard", riley.includes("Never invent a service name, price"));
  check("real pricing is available to cite (a $-amount is present)", /\$\d/.test(riley));
  check("PII guard present", riley.includes("PII / SAFETY"));
}

console.log("riley: closer behaviour is SCOPED to the voice line (regression catch)");
{
  check("voice (Riley) prompt does NOT contain the info-desk softness", !riley.includes(INFO_DESK_SOFTNESS));
  check("website widget STILL contains the soft BRAND_VOICE (not over-reached/reverted)", website.includes(INFO_DESK_SOFTNESS),
    { note: "if this fails, the change leaked into the widgets or BRAND_VOICE was edited" });
  check("voice and website brand prompts genuinely differ", riley !== website);
}

if (failures > 0) {
  console.error(`\nriley: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nriley: all assertions passed");
process.exit(0);
