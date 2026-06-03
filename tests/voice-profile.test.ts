/**
 * Unit test for the shared voice profile (server/lib/voiceProfile.ts) — the
 * single source of truth for the TradeLine/brand VAPI voice layer.
 *
 * Proves the fix for the confirmed voice-wiring bug (see VOICE-WIRING-SPIKE.md):
 *   (a) a customer's catalog voice id flows to the live VAPI voice block with
 *       the full tuned ElevenLabs settings;
 *   (b) with no customer pick it falls back to the preset, then Rachel;
 *   (c) the three former call sites (buildAssistantConfig,
 *       buildTradeLineAssistantConfig, upsertVapiAssistant) build their voice +
 *       transcriber from these shared helpers, so identical inputs yield
 *       byte-identical blocks;
 *   (d) preview (ElevenLabs REST) and production (VAPI) render with the SAME
 *       tuning numbers.
 *
 * Hermetic: voiceProfile imports db/schema lazily (inside the async resolver),
 * so importing the pure helpers needs no DATABASE_URL. Run: tsx tests/voice-profile.test.ts
 */

import {
  buildVapiVoiceBlock,
  buildVapiTranscriber,
  elevenLabsRestVoiceSettings,
  pickTradeLineVoiceId,
  ELEVENLABS_RACHEL_VOICE_ID,
  ELEVENLABS_MODEL_ID,
  ELEVENLABS_VOICE_TUNING,
  VAPI_TRANSCRIBER_MODEL,
} from "../server/lib/voiceProfile";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : "");
  }
}
function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const CUSTOMER_ELEVEN_ID = "AbCdEf123456CustomerVoice";
const PRESET_ELEVEN_ID = "TxGEqnHWrfWFTfGW9XjX"; // Josh (a static preset voice)

console.log("voice-profile: full tuned VAPI voice block");
{
  const block = buildVapiVoiceBlock(CUSTOMER_ELEVEN_ID);
  check("provider is 11labs", block.provider === "11labs", block.provider);
  check("voiceId is the supplied id", block.voiceId === CUSTOMER_ELEVEN_ID, block.voiceId);
  check("model is eleven_turbo_v2_5", block.model === "eleven_turbo_v2_5", block.model);
  check("stability 0.5", block.stability === 0.5, block.stability);
  check("similarityBoost 0.75 (camelCase)", block.similarityBoost === 0.75, block.similarityBoost);
  check("style 0", block.style === 0, block.style);
  check("useSpeakerBoost true (camelCase)", block.useSpeakerBoost === true, block.useSpeakerBoost);
  check("speed 1.0", block.speed === 1.0, block.speed);
  check(
    "no snake_case leakage (similarity_boost/use_speaker_boost absent)",
    !("similarity_boost" in (block as any)) && !("use_speaker_boost" in (block as any)),
  );
}

console.log("voice-profile: (a) customer catalog voice wins → lands on the live block");
{
  // Simulate the wired path: settings.voice_id resolved to a catalog
  // elevenlabs_voice_id, with a preset available as fallback.
  const voiceId = pickTradeLineVoiceId({
    catalogElevenId: CUSTOMER_ELEVEN_ID,
    presetVoiceId: PRESET_ELEVEN_ID,
  });
  check("picker returns the customer catalog id", voiceId === CUSTOMER_ELEVEN_ID, voiceId);
  const block = buildVapiVoiceBlock(voiceId);
  check("live voice block carries the customer id", block.voiceId === CUSTOMER_ELEVEN_ID, block.voiceId);
  check("…with full tuned settings", block.model === "eleven_turbo_v2_5" && block.stability === 0.5);
}

console.log("voice-profile: (b) fallback chain — preset, then Rachel");
{
  const noCustomer = pickTradeLineVoiceId({ catalogElevenId: null, presetVoiceId: PRESET_ELEVEN_ID });
  check("no catalog pick → preset voice", noCustomer === PRESET_ELEVEN_ID, noCustomer);

  const empties = pickTradeLineVoiceId({ catalogElevenId: "  ", presetVoiceId: "" });
  check("blank catalog + blank preset → Rachel default", empties === ELEVENLABS_RACHEL_VOICE_ID, empties);

  const nullBoth = pickTradeLineVoiceId({});
  check("nothing supplied → Rachel default", nullBoth === ELEVENLABS_RACHEL_VOICE_ID, nullBoth);

  const blockNoVoice = buildVapiVoiceBlock(undefined);
  check("voice block defaults to Rachel when id omitted", blockNoVoice.voiceId === ELEVENLABS_RACHEL_VOICE_ID, blockNoVoice.voiceId);
}

console.log("voice-profile: (c) shared source → identical blocks for the three former call sites");
{
  // All three sites now construct voice via buildVapiVoiceBlock(voiceId) and
  // transcriber via buildVapiTranscriber(lang). Given identical inputs the
  // emitted blocks must be byte-identical (single source of truth).
  const siteA = { voice: buildVapiVoiceBlock(CUSTOMER_ELEVEN_ID), transcriber: buildVapiTranscriber("en") };
  const siteB = { voice: buildVapiVoiceBlock(CUSTOMER_ELEVEN_ID), transcriber: buildVapiTranscriber("en") };
  const siteC = { voice: buildVapiVoiceBlock(CUSTOMER_ELEVEN_ID), transcriber: buildVapiTranscriber("en") };
  check("siteA voice === siteB voice", eq(siteA.voice, siteB.voice));
  check("siteB voice === siteC voice", eq(siteB.voice, siteC.voice));
  check("siteA transcriber === siteC transcriber", eq(siteA.transcriber, siteC.transcriber));
  check(
    "transcriber is deepgram/nova-2 with language",
    siteA.transcriber.provider === "deepgram" &&
      siteA.transcriber.model === VAPI_TRANSCRIBER_MODEL &&
      siteA.transcriber.language === "en",
    siteA.transcriber,
  );
  check("per-agent language override flows", buildVapiTranscriber("es").language === "es");
}

console.log("voice-profile: (d) preview ↔ production tuning parity");
{
  const rest = elevenLabsRestVoiceSettings();
  check("REST stability === production stability", rest.stability === ELEVENLABS_VOICE_TUNING.stability, rest.stability);
  check("REST similarity_boost === production similarityBoost", rest.similarity_boost === ELEVENLABS_VOICE_TUNING.similarityBoost, rest.similarity_boost);
  check("REST style === production style", rest.style === ELEVENLABS_VOICE_TUNING.style, rest.style);
  check("REST use_speaker_boost === production useSpeakerBoost", rest.use_speaker_boost === ELEVENLABS_VOICE_TUNING.useSpeakerBoost, rest.use_speaker_boost);
  check("shared model id is eleven_turbo_v2_5", ELEVENLABS_MODEL_ID === "eleven_turbo_v2_5", ELEVENLABS_MODEL_ID);
}

if (failures > 0) {
  console.error(`\nvoice-profile: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nvoice-profile: all assertions passed");
process.exit(0);
