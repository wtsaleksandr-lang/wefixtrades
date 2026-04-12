/**
 * Curated Voice Presets for TradeLine
 *
 * Internal registry of approved voice presets. Each maps to a specific
 * provider + voiceId combination. Start with 4 curated options.
 *
 * NOTE: Voice IDs use ElevenLabs stable IDs. Update voiceId values
 * when finalizing provider account setup.
 */

export interface VoicePreset {
  id: string;
  label: string;
  description: string;
  provider: "11labs";
  voiceId: string;
  languages: string[];
}

/**
 * Curated voice presets — 4 options only.
 *
 * ElevenLabs voice IDs:
 *   - Rachel (21m00Tcm4TlvDq8ikWAM) — Professional Female
 *   - Josh (TxGEqnHWrfWFTfGW9XjX)   — Professional Male
 *   - Bella (EXAVITQu4vr4xnSDxMaL)   — Friendly Female
 *   - Adam (pNInz6obpgDQGcFmaJgB)     — Friendly Male
 *
 * TODO: Confirm these IDs match the target ElevenLabs account.
 *       If using a different provider, update `provider` field.
 */
export const VOICE_PRESETS: VoicePreset[] = [
  {
    id: "professional-female",
    label: "Professional Female",
    description: "Clear, polished tone. Great for service businesses.",
    provider: "11labs",
    voiceId: "21m00Tcm4TlvDq8ikWAM",
    languages: ["en", "es", "fr"],
  },
  {
    id: "professional-male",
    label: "Professional Male",
    description: "Confident, reassuring voice. Ideal for trades and contracting.",
    provider: "11labs",
    voiceId: "TxGEqnHWrfWFTfGW9XjX",
    languages: ["en", "es", "fr"],
  },
  {
    id: "friendly-female",
    label: "Friendly Female",
    description: "Warm and approachable. Perfect for customer-facing services.",
    provider: "11labs",
    voiceId: "EXAVITQu4vr4xnSDxMaL",
    languages: ["en", "es", "fr"],
  },
  {
    id: "friendly-male",
    label: "Friendly Male",
    description: "Casual and natural. Works well for home services and repairs.",
    provider: "11labs",
    voiceId: "pNInz6obpgDQGcFmaJgB",
    languages: ["en", "es", "fr"],
  },
];

/** Look up a voice preset by ID. Falls back to professional-female. */
export function getVoicePreset(presetId: string): VoicePreset {
  return VOICE_PRESETS.find(v => v.id === presetId) ?? VOICE_PRESETS[0];
}

/** Default voice preset ID */
export const DEFAULT_VOICE_PRESET_ID = "professional-female";
