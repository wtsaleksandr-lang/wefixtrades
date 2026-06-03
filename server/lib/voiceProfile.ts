/**
 * Voice profile — single source of truth for the VAPI voice/sound layer that
 * every TradeLine + brand assistant shares.
 *
 * Before this module the voice block (provider/voiceId) and the
 * transcriber/maxDuration/recording/endCallPhrases blocks were copy-pasted in
 * three places inside vapiService.ts (`buildAssistantConfig`,
 * `buildTradeLineAssistantConfig`, the `upsertVapiAssistant` payload), and the
 * tuned ElevenLabs settings (model + stability/similarity/style/speaker-boost)
 * lived ONLY in the admin preview path (`lib/voicePreview.ts`) — so what an
 * admin previewed was not what callers actually heard. This module consolidates
 * all of that so production calls and previews render with identical settings.
 *
 * SCOPE: voice identity + ElevenLabs render settings + transcriber/duration/
 * recording/end-call only. Turn-detection / endpointing / backchanneling /
 * startSpeakingPlan are deliberately NOT set here (handled separately).
 *
 * Field casing note: VAPI's 11labs `voice` block is flat camelCase
 * (`voiceId`, `model`, `stability`, `similarityBoost`, `style`,
 * `useSpeakerBoost`, `speed`). ElevenLabs' own REST API uses snake_case
 * (`model_id`, `voice_settings: { similarity_boost, use_speaker_boost }`).
 * Both shapes are derived from the same numeric constants below.
 */

/**
 * ElevenLabs Rachel — the WeFixTrades production default voice. Mirrors the
 * `VAPI_WFT_VOICE_ID` env default in vapiService.ts and the preview default in
 * voicePreview.ts. Last-resort fallback when neither a customer pick nor a
 * preset voice is available.
 */
export const ELEVENLABS_RACHEL_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

/**
 * ElevenLabs model used for both preview and production. `eleven_turbo_v2_5`
 * is the fast, broad-voice model (see voicePreview.ts Wave 44 rationale).
 */
export const ELEVENLABS_MODEL_ID = "eleven_turbo_v2_5";

/**
 * Tuned ElevenLabs render settings — the single numeric source. Both the VAPI
 * voice block and the ElevenLabs REST preview payload are built from these so
 * preview == production.
 */
export const ELEVENLABS_VOICE_TUNING = {
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0,
  useSpeakerBoost: true,
  /** ElevenLabs/VAPI accept 0.7–1.2; 1.0 is natural pace. */
  speed: 1.0,
} as const;

/**
 * Build a VAPI `voice` block for an ElevenLabs voice (flat camelCase, the shape
 * VAPI expects on POST/PATCH /assistant). Falls back to Rachel when no voiceId
 * is supplied so a caller can never produce a voice-less block.
 */
export function buildVapiVoiceBlock(voiceId?: string | null): {
  provider: "11labs";
  voiceId: string;
  model: string;
  stability: number;
  similarityBoost: number;
  style: number;
  useSpeakerBoost: boolean;
  speed: number;
} {
  return {
    provider: "11labs",
    voiceId: (voiceId && voiceId.trim()) || ELEVENLABS_RACHEL_VOICE_ID,
    model: ELEVENLABS_MODEL_ID,
    stability: ELEVENLABS_VOICE_TUNING.stability,
    similarityBoost: ELEVENLABS_VOICE_TUNING.similarityBoost,
    style: ELEVENLABS_VOICE_TUNING.style,
    useSpeakerBoost: ELEVENLABS_VOICE_TUNING.useSpeakerBoost,
    speed: ELEVENLABS_VOICE_TUNING.speed,
  };
}

/**
 * ElevenLabs REST `voice_settings` (snake_case) for the preview synth path in
 * lib/voicePreview.ts — same numbers as the production voice block.
 */
export function elevenLabsRestVoiceSettings(): {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
} {
  return {
    stability: ELEVENLABS_VOICE_TUNING.stability,
    similarity_boost: ELEVENLABS_VOICE_TUNING.similarityBoost,
    style: ELEVENLABS_VOICE_TUNING.style,
    use_speaker_boost: ELEVENLABS_VOICE_TUNING.useSpeakerBoost,
  };
}

/* ─── Shared transcriber + call-shell constants (de-duplication) ─── */

export const VAPI_TRANSCRIBER_PROVIDER = "deepgram";
export const VAPI_TRANSCRIBER_MODEL = "nova-2";

/** Build the shared VAPI transcriber block; language is per-agent. */
export function buildVapiTranscriber(language = "en"): {
  provider: "deepgram";
  model: string;
  language: string;
} {
  return {
    provider: VAPI_TRANSCRIBER_PROVIDER,
    model: VAPI_TRANSCRIBER_MODEL,
    language: language || "en",
  };
}

export const VAPI_MAX_DURATION_SECONDS = 900;
export const VAPI_RECORDING_ENABLED = true;
export const VAPI_END_CALL_PHRASES = ["goodbye", "bye", "thanks bye"];

/**
 * Pure voice-precedence picker (no I/O — unit-testable).
 *
 * Precedence:
 *   1. `catalogElevenId` — the customer's portal pick, already resolved from
 *      `tradeline_assistant_settings.voice_id` → `tradeline_voices.elevenlabs_voice_id`.
 *   2. `presetVoiceId` — the static preset voice from `config.voice.presetId`.
 *   3. Rachel default.
 */
export function pickTradeLineVoiceId(opts: {
  catalogElevenId?: string | null;
  presetVoiceId?: string | null;
}): string {
  if (opts.catalogElevenId && opts.catalogElevenId.trim()) {
    return opts.catalogElevenId.trim();
  }
  if (opts.presetVoiceId && opts.presetVoiceId.trim()) {
    return opts.presetVoiceId.trim();
  }
  return ELEVENLABS_RACHEL_VOICE_ID;
}

/**
 * Resolve the live ElevenLabs voiceId for a TradeLine client. Looks up the
 * customer's portal pick (`tradeline_assistant_settings.voice_id` → catalog
 * `elevenlabs_voice_id`), falling back to the supplied preset voiceId, then
 * Rachel. Fail-soft: any DB error falls through to the preset/default so a
 * call/provision never breaks on a settings read.
 *
 * @param clientId       the owning client id
 * @param presetVoiceId  already-resolved fallback (e.g. getVoicePreset(...).voiceId)
 */
export async function resolveTradeLineVoiceId(
  clientId: number,
  presetVoiceId?: string | null,
): Promise<string> {
  let catalogElevenId: string | null = null;
  try {
    const { db } = await import("../db");
    const { tradelineAssistantSettings, tradelineVoices } = await import(
      "@shared/schema"
    );
    const { eq } = await import("drizzle-orm");

    const [settings] = await db
      .select({ voice_id: tradelineAssistantSettings.voice_id })
      .from(tradelineAssistantSettings)
      .where(eq(tradelineAssistantSettings.client_id, clientId))
      .limit(1);

    if (settings?.voice_id) {
      const [voice] = await db
        .select({
          elevenlabs_voice_id: tradelineVoices.elevenlabs_voice_id,
          status: tradelineVoices.status,
        })
        .from(tradelineVoices)
        .where(eq(tradelineVoices.id, settings.voice_id))
        .limit(1);
      // Only honor an active catalog voice; archived → fall through to preset.
      if (voice?.elevenlabs_voice_id && voice.status === "active") {
        catalogElevenId = voice.elevenlabs_voice_id;
      }
    }
  } catch (err) {
    const { createLogger } = await import("./logger");
    createLogger("VoiceProfile").warn(
      "resolveTradeLineVoiceId failed — falling back to preset/default",
      { clientId, error: (err as Error).message },
    );
  }

  return pickTradeLineVoiceId({ catalogElevenId, presetVoiceId });
}
