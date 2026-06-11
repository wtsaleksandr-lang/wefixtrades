/**
 * T-sweep 2026-06-11 P2 — TradeLine demo persona regression tests.
 *
 * The bug: the /demo chat greeted visitors as a receptionist inviting a
 * homeowner role-play ("get a quick estimate"), but posted to /api/chat/sync
 * with surface "website" — the WeFixTrades PLATFORM sales assistant — so the
 * AI answered as the platform and declined the role-play.
 *
 * Contract under test (no live AI call — compiled prompt text + wiring):
 *   1. TRADELINE_DEMO_PROMPT contains the receptionist ROLE instructions:
 *      role-plays the business's dispatcher for homeowner inquiries
 *      (quotes, booking, hours), stays in character, never refuses to quote.
 *   2. It does NOT carry platform-assistant framing into the role-play
 *      (recommending WeFixTrades products by name in roleplay is banned).
 *   3. It still refuses genuinely harmful content — in character.
 *   4. WIRING (the actual root cause): every demo chat surface — /demo's
 *      ChatPanel and the /products/tradeline launcher — posts
 *      surface "tradeline_demo", and the promptBuilder routes that surface
 *      to this prompt. /demo must never post surface "website" again.
 *
 * Runnable standalone via:
 *   npx tsx shared/prompts/tradelineDemoPrompt.test.ts
 * Wired into CI as `npm run check:demo-persona` (.github/workflows/ci.yml).
 *
 * Excluded from `tsc --noEmit` via the project tsconfig's **\/*.test.ts
 * pattern. Uses node:assert/strict, no test runner dependency.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TRADELINE_DEMO_PROMPT } from "./tradelineDemoPrompt";

const ROOT = process.cwd();
const prompt = TRADELINE_DEMO_PROMPT;

function mustContain(haystack: string, needle: string, why: string) {
  assert.ok(
    haystack.includes(needle),
    `${why}\n  missing: ${JSON.stringify(needle)}`,
  );
}

/* ─── 1. Receptionist role-play framing ─── */
mustContain(
  prompt,
  "Roleplay as that business's TradeLine dispatcher",
  "demo prompt must instruct the AI to play the BUSINESS's dispatcher/receptionist",
);
mustContain(
  prompt,
  "Treat every visitor message as a real homeowner reaching out",
  "demo prompt must frame visitor messages as homeowner inquiries",
);
// The three homeowner jobs the greeting promises: quotes, booking, hours.
mustContain(
  prompt,
  "Give a realistic price range FIRST",
  "demo prompt must quote (price-first response shape)",
);
mustContain(
  prompt,
  "SCHEDULING SPECIFICS",
  "demo prompt must handle booking/scheduling",
);
mustContain(
  prompt,
  "AFTER-HOURS",
  "demo prompt must handle hours/after-hours questions",
);
// Stays in character — including under prompt injection.
mustContain(
  prompt,
  "Stay in character",
  "demo prompt must instruct staying in character under adversarial input",
);
mustContain(
  prompt,
  "Never refuse to roleplay a normal home-services scenario",
  "demo prompt must never decline the homeowner role-play",
);
mustContain(
  prompt,
  "Never refuse to give a price",
  "demo prompt must never refuse to quote",
);

/* ─── 2. No platform-assistant framing inside the role-play ─── */
mustContain(
  prompt,
  "Never recommend WeFixTrades products by name in roleplay",
  "platform sales pitch must be banned inside the role-play",
);
// The platform assistant's job ("recommend our services to the visitor")
// must not be the demo's job. The only sanctioned WeFixTrades mentions are
// the meta-question answers ([16]) — so the recommendation-protocol marker
// used by the website surface must not appear here.
assert.ok(
  !prompt.includes("[[recommend:"),
  "demo prompt must not carry the website-surface recommendation protocol",
);
assert.ok(
  !prompt.toLowerCase().includes("you are the wefixtrades assistant"),
  "demo prompt must not adopt the platform-assistant identity",
);

/* ─── 3. Harmful content still refused — in character ─── */
mustContain(
  prompt,
  "THE ONE EXCEPTION — genuinely harmful requests",
  "demo prompt must carve out genuinely harmful/illegal requests",
);
mustContain(
  prompt,
  "decline IN CHARACTER",
  "harmful-content refusal must stay in character (no AI-demo break)",
);

/* ─── 4. Surface wiring — the root cause can never regress ─── */
const demoPage = readFileSync(
  join(ROOT, "client/src/pages/marketing/demo.tsx"),
  "utf8",
);
const launcher = readFileSync(
  join(ROOT, "client/src/components/marketing/TradeLineDemoLauncher.tsx"),
  "utf8",
);
const promptBuilder = readFileSync(
  join(ROOT, "server/services/promptBuilder.ts"),
  "utf8",
);

mustContain(
  demoPage,
  'surface: "tradeline_demo"',
  "/demo ChatPanel must post the tradeline_demo surface",
);
assert.ok(
  !demoPage.includes('surface: "website"'),
  '/demo must not post surface "website" (the T-sweep P2 bug: platform assistant declining the homeowner role-play)',
);
mustContain(
  launcher,
  'surface: "tradeline_demo"',
  "/products/tradeline launcher must post the tradeline_demo surface",
);
mustContain(
  promptBuilder,
  'surface === "tradeline_demo"',
  "promptBuilder must route the tradeline_demo surface",
);
mustContain(
  promptBuilder,
  "buildTradeLineDemoPrompt",
  "promptBuilder must build the demo prompt for the tradeline_demo surface",
);

/* ─── 5. Greeting consistency — /demo greets in character ─── */
assert.ok(
  !demoPage.includes("how we help trades businesses grow"),
  "/demo greeting must not reintroduce platform framing the persona then contradicts",
);

console.log("tradelineDemoPrompt.test.ts — all assertions passed");
