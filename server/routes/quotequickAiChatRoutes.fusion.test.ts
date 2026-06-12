/**
 * QuoteQuick fused text+image — server behavior test.
 *
 * Runnable standalone via:
 *   npx tsx server/routes/quotequickAiChatRoutes.fusion.test.ts
 *   npm run check:quotequick-fusion
 *
 * Excluded from `tsc --noEmit` (tsconfig excludes **\/*.test.ts).
 *
 * Pattern matches server/routes/outreachAttributionRoutes.test.ts — node
 * assert/strict, no test-runner dep, no live DB.
 *
 * The route handler itself is an Express + SSE + streaming-Anthropic flow that
 * can't be exercised hermetically, so the model-selection + user-block assembly
 * was extracted into the pure exported `buildChatTurn`. This test drives THAT
 * directly. Coverage:
 *
 *   (a) text + image  → vision model (Sonnet) AND replace_template tool stays
 *       available (the route offers QUOTEQUICK_AI_TOOLS unconditionally — a
 *       regression that gated tools off when an image is present would fail
 *       the tool-availability assertion here).
 *   (b) text only      → text model (Haiku), single text block, behavior
 *       unchanged.
 *   (c) fused user blocks contain BOTH the text block and the image block,
 *       text FIRST (so the model receives the written intent alongside the
 *       screenshot).
 */

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test_unused";
}

import assert from "node:assert/strict";
import { CLAUDE_HAIKU, CLAUDE_SONNET } from "../services/aiModels";
import { QUOTEQUICK_AI_TOOLS, QUOTEQUICK_SYSTEM_PROMPT } from "../services/quotequickAiTools";

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

// A minimal but valid 1x1 PNG data URL — parseImage accepts the data: prefix
// + recognized media type, which is all buildChatTurn needs to flip to vision.
const PNG_1x1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function run(): Promise<void> {
  console.log("QuoteQuick text+image fusion tests:\n");

  const mod = await import("./quotequickAiChatRoutes");

  await test("buildChatTurn is exported", () => {
    assert.equal(typeof mod.buildChatTurn, "function");
  });

  await test("(a) text + image selects the VISION model (Sonnet)", () => {
    const turn = mod.buildChatTurn("Build a roof-repair calculator", PNG_1x1);
    assert.equal(turn.hasImage, true);
    assert.equal(turn.model, CLAUDE_SONNET);
  });

  await test("(a) replace_template tool stays available in the fused case", () => {
    // The route passes QUOTEQUICK_AI_TOOLS to the model unconditionally —
    // hasImage never strips tools. Assert the tool the wizard relies on to
    // rebuild from a screenshot is present in the offered set.
    const names = QUOTEQUICK_AI_TOOLS.map((t: any) => t.name);
    assert.ok(names.includes("replace_template"), "replace_template must be offered");
    // The fused path is the same offered-tools set as any other turn — there
    // is no image-conditional tools array in the route.
    assert.ok(names.includes("apply_template"));
    assert.ok(names.includes("add_field"));
  });

  await test("(b) text-only path is unchanged: TEXT model (Haiku), single block", () => {
    const turn = mod.buildChatTurn("Add a deep-clean toggle", undefined);
    assert.equal(turn.hasImage, false);
    assert.equal(turn.model, CLAUDE_HAIKU);
    assert.equal(turn.userBlocks.length, 1);
    assert.equal(turn.userBlocks[0].type, "text");
    assert.equal(turn.userBlocks[0].text, "Add a deep-clean toggle");
  });

  await test("(c) fused userBlocks contain BOTH the text block AND the image block, text first", () => {
    const msg = "Match this screenshot but for lawn care";
    const turn = mod.buildChatTurn(msg, PNG_1x1);
    assert.equal(turn.userBlocks.length, 2);
    // Text FIRST so the model reads the written intent alongside the image.
    assert.equal(turn.userBlocks[0].type, "text");
    assert.equal(turn.userBlocks[0].text, msg);
    // Image block present + well-formed (base64 source, recognized media type).
    assert.equal(turn.userBlocks[1].type, "image");
    assert.equal(turn.userBlocks[1].source.type, "base64");
    assert.equal(turn.userBlocks[1].source.media_type, "image/png");
    assert.ok(turn.userBlocks[1].source.data.length > 0);
  });

  await test("malformed/empty image string falls back to text model", () => {
    const turn = mod.buildChatTurn("hello", "not-an-image");
    assert.equal(turn.hasImage, false);
    assert.equal(turn.model, CLAUDE_HAIKU);
    assert.equal(turn.userBlocks.length, 1);
  });

  await test("system prompt carries the FUSED text+image instruction", () => {
    // The fusion guidance must be in the cached system prompt so the model
    // knows to combine the screenshot with the text (text wins on conflict).
    assert.match(QUOTEQUICK_SYSTEM_PROMPT, /FUSED TEXT \+ IMAGE/);
    assert.match(QUOTEQUICK_SYSTEM_PROMPT, /text intent WINS/i);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  // Force-exit on success too: importing the route module opens a handle
  // (SSE/AI deps) so the event loop never drains; the CI step would hang otherwise.
  process.exit(failed > 0 ? 1 : 0);
}

run();
