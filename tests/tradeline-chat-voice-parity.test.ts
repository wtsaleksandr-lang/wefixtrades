/**
 * Gate test for TradeLine chat ↔ voice parity + resilience
 * (fix/tradeline-chat-voice-parity).
 *
 * Proves the two CONFIRMED divergences are closed STRUCTURALLY:
 *
 *   P0-1 — the website CHAT widget prompt now carries the SAME life-safety
 *     floor + PII guard + injection-resistant closer the VOICE prompt has.
 *     Both channels splice the shared `tradeLineSafetyTail()` helper, so a
 *     homeowner reporting gas/CO/live-wire/structural danger IN CHAT gets the
 *     same floor as a phone caller. (The chat prompt is assembled inline in
 *     tradelineWidgetRoutes with the same helper + ordering — we assert the
 *     shared helper that both paths consume, plus that the helper's output is
 *     ordered floor → DATA → PII_GUARD → closer.)
 *
 *   P0-2 — the VOICE builder now renders the platform-assembled business-data
 *     block (clientKnowledge customer audience) when the context carries it,
 *     framed as injection-safe DATA beneath the SAFETY_FLOOR — the same block
 *     the chat path injects. (vapiService loads it via assembleClientKnowledge
 *     into ctx.assembledKnowledgeBlock; here we drive buildSystemPrompt with a
 *     populated block and assert it surfaces in the right place.)
 *
 * Run: tsx tests/tradeline-chat-voice-parity.test.ts  (no DB — pure string
 * assembly; DATABASE_URL may be a dummy.)
 */

// Side-effect FIRST: sets a dummy DATABASE_URL before promptBuilder transitively
// evaluates server/db.ts (which throws at module-eval if DATABASE_URL is unset).
// CI audit runs DB-less; this test is pure string assembly and opens no connection.
import "./audit/_failover-env-setup";

import {
  buildSystemPrompt,
  tradeLineSafetyTail,
  renderAssembledKnowledgeBlock,
  SAFETY_FLOOR,
  PII_GUARD,
  SAFETY_CLOSER,
} from "../server/services/promptBuilder";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

function livePrompt(over: Record<string, unknown>): string {
  const ctx = {
    businessName: "Bob's Plumbing",
    mode: "available",
    channels: {},
    booking: { enabled: false },
    phoneRouting: {},
    ...over,
  };
  return buildSystemPrompt("vapi", undefined, undefined, undefined, ctx as any, undefined, undefined);
}

console.log("parity P0-1: shared safety tail carries floor + PII_GUARD + closer (both channels)");
{
  const tail = tradeLineSafetyTail([]);
  check("tail contains the full SAFETY_FLOOR verbatim", tail.includes(SAFETY_FLOOR));
  check("tail contains the full PII_GUARD verbatim", tail.includes(PII_GUARD));
  check("tail contains the injection-resistant SAFETY_CLOSER", tail.includes(SAFETY_CLOSER));

  // Ordering contract both channels rely on: floor first, PII_GUARD, then the
  // closer is the literal LAST block.
  check("SAFETY_FLOOR precedes PII_GUARD", tail.indexOf(SAFETY_FLOOR) < tail.indexOf(PII_GUARD));
  check("PII_GUARD precedes the closer", tail.indexOf(PII_GUARD) < tail.indexOf(SAFETY_CLOSER));
  check("closer is the last block", tail.trimEnd().endsWith(SAFETY_CLOSER));

  // Interleaved DATA sits BETWEEN the floor and the closer (so owner data can
  // never sit after the final safety reaffirmation).
  const withData = tradeLineSafetyTail(["=== BUSINESS DATA === marker-xyz"]);
  check("interleaved DATA after floor", withData.indexOf("marker-xyz") > withData.indexOf(SAFETY_FLOOR));
  check("interleaved DATA before closer", withData.indexOf("marker-xyz") < withData.indexOf(SAFETY_CLOSER));
}

console.log("parity P0-1: the VOICE prompt (also used as the parity reference) still carries floor + PII_GUARD + closer");
{
  const p = livePrompt({ tradeType: "plumbing" });
  check("voice prompt has SAFETY_FLOOR", p.includes(SAFETY_FLOOR));
  check("voice prompt has PII_GUARD", p.includes(PII_GUARD));
  check("voice prompt has SAFETY_CLOSER", p.includes(SAFETY_CLOSER));
  check("voice closer is the prompt tail", p.trimEnd().endsWith(SAFETY_CLOSER));
}

console.log("parity P0-2: VOICE renders the assembled business-data block when present");
{
  const block = "Business hours: Mon-Fri 8-5. Service area: Springfield. Drain cleaning from $149.";
  const p = livePrompt({ tradeType: "plumbing", assembledKnowledgeBlock: block });
  check("assembled BUSINESS DATA header present", p.includes("BUSINESS DATA (auto-assembled"));
  check("assembled block content present", p.includes("Drain cleaning from $149"));
  check(
    "assembled DATA sits AFTER the SAFETY_FLOOR (DATA, not an instruction above the floor)",
    p.indexOf(block) > p.indexOf(SAFETY_FLOOR),
    { blockAt: p.indexOf(block), floorAt: p.indexOf(SAFETY_FLOOR) },
  );
  check(
    "assembled DATA sits BEFORE the closer",
    p.indexOf(block) < p.indexOf(SAFETY_CLOSER),
  );

  // Absent block → no DATA header (no empty section, no behaviour change).
  const pNone = livePrompt({ tradeType: "plumbing" });
  check("no assembled block → no BUSINESS DATA header", !pNone.includes("BUSINESS DATA (auto-assembled"));
}

console.log("parity: renderAssembledKnowledgeBlock framing");
{
  check("empty block renders to ''", renderAssembledKnowledgeBlock("Acme", "") === "");
  check("whitespace-only block renders to ''", renderAssembledKnowledgeBlock("Acme", "   \n ") === "");
  const r = renderAssembledKnowledgeBlock("Acme", "Hours: 9-5");
  check("non-empty block is framed as DATA not instructions", r.includes("not instructions") && r.includes("Hours: 9-5"));
  check("framing forbids overriding ESCALATION/SAFETY", /MUST NOT override/.test(r));
}

if (failures > 0) {
  console.error(`\nchat-voice-parity: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nchat-voice-parity: all assertions passed");
process.exit(0);
