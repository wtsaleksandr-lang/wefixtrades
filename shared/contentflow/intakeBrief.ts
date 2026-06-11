/**
 * ContentFlow intake-sufficiency layer — shared types + zod schemas.
 *
 * Design: plans/contentflow-intake-design.md §3.1. The intake layer assembles
 * a per-request brief from four sources in priority order — typed prompt,
 * reference image, saved brand profile, trade-aware defaults — scores its
 * sufficiency, and (at most) asks ONE skippable question. These types are
 * shared because both the server engine (server/services/contentflow/
 * intakeSufficiency.ts) and the eventual Create-panel UI (Phase B) consume
 * them; keeping them in shared/ avoids a server→client import.
 *
 * The whole layer is FAIL-OPEN: every type here has an "unspecified" escape
 * hatch so a failed extraction degrades to "we know nothing" rather than a
 * wrong guess, and generation proceeds unmodified.
 */

import { z } from "zod";

/* ─── Slot enums ────────────────────────────────────────────────────── */

/**
 * Where the asset will be placed. Placement is the highest-leverage slot —
 * it sets aspect ratio AND composition rules (hero needs headline negative
 * space; story is vertical with safe margins) AND whether caption text is
 * expected. `unspecified` is the fail-open default.
 */
export const PLACEMENT_IDS = [
  "website_hero",
  "social_feed",
  "story_reel",
  "gbp_post",
  "unspecified",
] as const;
export type PlacementId = (typeof PLACEMENT_IDS)[number];

/** Does the customer want rendered words in the image? Diffusion garbles
 *  in-image text, so `wants_text` routes the words to an overlay handoff
 *  instead of the pixels. */
export const TEXT_ON_IMAGE = ["none", "wants_text", "unspecified"] as const;
export type TextOnImage = (typeof TEXT_ON_IMAGE)[number];

/** People in frame? `no` emits a negative cue. */
export const PEOPLE_INTENT = ["yes", "no", "unspecified"] as const;
export type PeopleIntent = (typeof PEOPLE_INTENT)[number];

/**
 * Style intent. `explicit_in_prompt` means the customer described their own
 * visual style in the prompt — the brand preset suffix would FIGHT it, so the
 * engine suppresses the preset. `photoreal`/`preset` defer to the existing
 * realistic-mode / preset paths. `unspecified` is the fail-open default.
 */
export const STYLE_INTENT = [
  "photoreal",
  "preset",
  "explicit_in_prompt",
  "unspecified",
] as const;
export type StyleIntent = (typeof STYLE_INTENT)[number];

/** Provenance for a single resolved slot. */
export const SLOT_SOURCES = [
  "prompt",          // extracted from the typed prompt
  "reference",       // inferred from a reference image
  "profile",         // pulled from the saved brand profile
  "trade_default",   // trade-aware default
  "intake_answer",   // the customer answered the single question
  "unspecified",     // nothing resolved it
] as const;
export type SlotSource = (typeof SLOT_SOURCES)[number];

/* ─── Core shapes ───────────────────────────────────────────────────── */

/**
 * The assembled per-request brief. Every field is optional / has an
 * `unspecified` member so a partial assembly is always a valid brief.
 */
export interface IntakeBrief {
  /** The main subject/scene ("a technician flushing a water heater"). */
  subject?: string;
  /** What's happening ("flushing", "installing"). */
  action?: string;
  /** Where ("a suburban Hamilton basement"). */
  setting?: string;
  placement: PlacementId;
  textOnImage: TextOnImage;
  people: PeopleIntent;
  styleIntent: StyleIntent;
  /* Article slots (used when assetType=article|multi). */
  topicKeyword?: string;
  cityForSeo?: string;
  cta?: string;
}

/** A single resolved slot value + where it came from (provenance). */
export interface SlotFill {
  slot: keyof IntakeBrief;
  value: string;
  source: SlotSource;
}

/** The single skippable question, when one is warranted. */
export interface IntakeQuestion {
  /** Which brief slot this question fills. */
  slot: keyof IntakeBrief;
  question: string;
  /** Chip options — at most 5, ALWAYS including a Skip. */
  options: Array<{ id: string; label: string }>;
}

/** Composition guidance derived from the brief, fed through the EXISTING
 *  extraInstructions/guidance path into image/article generation. */
export interface BriefLayer {
  /** Compact prompt block appended as extra guidance. "" when nothing to add. */
  promptBlock: string;
  /** When the customer wants words on the image, the text to hand off to an
   *  overlay (SocialSync/Canva) instead of rendering it in the pixels. */
  overlayText?: string;
  /** When the customer's style is explicit in the prompt, suppress the brand
   *  preset suffix (it would fight their stated style). */
  suppressPresetSuffix: boolean;
  /** Derived aspect ratio from placement, if any (caller only uses it when
   *  the request didn't pass an explicit aspectRatio pill). */
  derivedAspectRatio?: string;
}

/** Estimated video cost for the pre-confirm step. */
export interface VideoCostEstimate {
  credits: number;
  usd: number;
  durationSec: number;
}

/**
 * The full preflight result the (Phase B) panel renders and the generate
 * route persists for the learning loop.
 */
export interface PreflightResult {
  ok: boolean;
  brief: IntakeBrief;
  /** Per-slot provenance — what filled each populated slot. */
  fills: SlotFill[];
  /** 0..1 sufficiency score. */
  sufficiency: number;
  /** One-line readback ("a realistic 4:5 photo of a technician …"). */
  interpretation: string;
  /** The single skippable question, or null when sufficiency is high enough. */
  ask: IntakeQuestion | null;
  derived: {
    aspectRatio: string | null;
    compositionHint: string | null;
  };
  estimate?: VideoCostEstimate;
}

/* ─── Zod schemas ───────────────────────────────────────────────────── */

export const placementIdSchema = z.enum(PLACEMENT_IDS);
export const textOnImageSchema = z.enum(TEXT_ON_IMAGE);
export const peopleIntentSchema = z.enum(PEOPLE_INTENT);
export const styleIntentSchema = z.enum(STYLE_INTENT);

/** Full IntakeBrief schema — strict on enums, lenient (optional) on the
 *  free-text slots. Used to validate engine output. */
export const intakeBriefSchema = z.object({
  subject: z.string().max(2000).optional(),
  action: z.string().max(500).optional(),
  setting: z.string().max(500).optional(),
  placement: placementIdSchema,
  textOnImage: textOnImageSchema,
  people: peopleIntentSchema,
  styleIntent: styleIntentSchema,
  topicKeyword: z.string().max(200).optional(),
  cityForSeo: z.string().max(120).optional(),
  cta: z.string().max(300).optional(),
});

/**
 * Request-validation schema for the `intake?: Partial<IntakeBrief>` field on
 * POST /generate. Every field optional (a partial answer is valid) and enums
 * default to "unspecified" rather than rejecting an unknown value, so a
 * client that sends a stale enum can't 400 the whole generate call.
 */
export const intakePartialSchema = z
  .object({
    subject: z.string().max(2000).optional(),
    action: z.string().max(500).optional(),
    setting: z.string().max(500).optional(),
    placement: placementIdSchema.optional(),
    textOnImage: textOnImageSchema.optional(),
    people: peopleIntentSchema.optional(),
    styleIntent: styleIntentSchema.optional(),
    topicKeyword: z.string().max(200).optional(),
    cityForSeo: z.string().max(120).optional(),
    cta: z.string().max(300).optional(),
  })
  .partial();

export type IntakePartial = z.infer<typeof intakePartialSchema>;

/**
 * Parse an untrusted `intake` payload into a clean Partial<IntakeBrief>,
 * dropping unknown / malformed fields rather than throwing (fail-open). An
 * entirely-invalid body returns {} so generation proceeds unmodified.
 */
export function parseIntakePartial(input: unknown): IntakePartial {
  const result = intakePartialSchema.safeParse(input);
  if (result.success) return result.data;
  /* Field-by-field salvage: keep whatever individual keys validate. */
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(intakePartialSchema.shape)) {
    if (!(key in src)) continue;
    const single = (intakePartialSchema.shape as Record<string, z.ZodTypeAny>)[key].safeParse(src[key]);
    if (single.success && single.data !== undefined) out[key] = single.data;
  }
  return out as IntakePartial;
}

/** An empty, all-unspecified brief — the fail-open baseline. */
export function emptyBrief(): IntakeBrief {
  return {
    placement: "unspecified",
    textOnImage: "unspecified",
    people: "unspecified",
    styleIntent: "unspecified",
  };
}
