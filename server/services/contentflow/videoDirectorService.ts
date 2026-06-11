/**
 * ContentFlow Phase 2 — video Director service (WP2).
 *
 * Single source of truth for turning ONE user description into a scene
 * plan whose total duration exactly matches the deliverable duration.
 * All downstream stages (render worker WP4, routes WP6) consume ONLY the
 * ScenePlan produced here.
 *
 * PURE service:
 *   - no persistence, no route imports, no storage/db imports
 *   - the AI text call is dependency-injected (defaults to
 *     generateContentflowText, lazily imported so tests never touch the
 *     gate / rotator / DB)
 *   - NEVER throws — every failure path returns a typed DirectorError
 *
 * Validation / clamping strategy (documented for WP4/WP6):
 *   - scene count clamped to tierConstraints.maxScenes (trailing scenes
 *     dropped, indexes recomputed 0-based)
 *   - per-scene durationSec snapped to the provider-legal set {4, 6, 8}
 *     (nearest value; ties round down to the cheaper clip)
 *   - total duration: if Σ durations > maxTotalSec, scene durations are
 *     stepped down (8→6→4) from the LAST scene backwards until the plan
 *     fits; if still over at all-4s, trailing scenes are dropped. If even
 *     a single 4s scene cannot fit, the input is impossible →
 *     "validation_impossible".
 *   - totalDurationSec is always RECOMPUTED as Σ scene durations — the
 *     model's own total is never trusted.
 *   - narration: TRIM strategy (deterministic, zero extra AI spend — we
 *     do NOT regenerate). Word count per scene is capped at
 *     floor(durationSec × 2.3); overlong narration is cut at a word
 *     boundary and closed with a period. narrationEnabled=false forces
 *     narration:null on every scene.
 *   - styleBible: built deterministically from the BrandProfile + trade
 *     context (plus the model's own continuity paragraph when provided)
 *     and APPENDED as a suffix to every scene's visualPrompt:
 *     `<scene prompt> Style: <styleBible>` — consistent suffix placement
 *     so providers weight the action first, continuity second.
 *
 * Cost: every Result (ok AND error, once the AI call was made) carries
 * costMicroUsd so the caller can book it via addDraftGenerationCost.
 */

import type { BrandProfile } from "./brandProfile";

/* ─── Public types (imported by WP4 worker + WP6 routes) ───────────── */

export type VideoAspectRatio = "16:9" | "9:16" | "1:1";

export interface TierConstraints {
  /** Maximum number of scenes the client's tier allows. */
  maxScenes: number;
  /** Maximum total video duration in seconds for the tier. */
  maxTotalSec: number;
}

export interface DirectorInput {
  /** The single user description driving the whole video. */
  description: string;
  brand: BrandProfile;
  tradeType: string | null;
  tierConstraints: TierConstraints;
  aspectRatio: VideoAspectRatio;
  narrationEnabled: boolean;
}

export interface PlannedScene {
  /** 0-based scene index (maps to video_scenes.scene_index). */
  index: number;
  /** Render prompt with the styleBible suffix already injected. */
  visualPrompt: string;
  /** Spoken narration for the scene, or null (silent / narration off). */
  narration: string | null;
  /** Clip length in seconds — always one of {4, 6, 8}. */
  durationSec: SceneDurationSec;
}

export interface ScenePlan {
  title: string;
  /** Continuity paragraph injected into every scene's visualPrompt. */
  styleBible: string;
  scenes: PlannedScene[];
  musicMood?: string;
  /** Always recomputed: Σ scenes[].durationSec. */
  totalDurationSec: number;
}

export type DirectorErrorCode =
  | "invalid_input"
  | "gate_blocked"
  | "ai_failed"
  | "parse_failed"
  | "validation_impossible";

export interface DirectorError {
  code: DirectorErrorCode;
  message: string;
}

export type DirectorResult =
  | { ok: true; plan: ScenePlan; costMicroUsd: number; provider?: string }
  /** costMicroUsd is non-zero when the AI call happened before the
   *  failure (e.g. parse_failed) — the caller must still book it. */
  | { ok: false; error: DirectorError; costMicroUsd: number };

/** Injectable text-generation function (subset of generateContentflowText). */
export type DirectorTextGen = (input: {
  system: string;
  user: string;
  maxTokens?: number;
}) => Promise<{ text: string; costMicroUsd: number; provider?: string }>;

/* ─── Constants ─────────────────────────────────────────────────────── */

/** Provider-legal clip lengths (Veo durationSeconds 4|6|8). */
export const SCENE_DURATION_OPTIONS = [4, 6, 8] as const;
export type SceneDurationSec = (typeof SCENE_DURATION_OPTIONS)[number];

/** Comfortable speaking rate used for the narration budget. */
export const NARRATION_WORDS_PER_SEC = 2.3;

/* ─── styleBible ────────────────────────────────────────────────────── */

const STYLE_PREFIX = "Style: ";

/**
 * Deterministic continuity paragraph from the brand profile + trade
 * context: subject/setting, lighting, palette, brand colors. The model's
 * own continuity paragraph (when parseable) is prepended — but the brand
 * facts are always present regardless of what the model returned.
 */
export function buildStyleBible(
  brand: BrandProfile,
  tradeType: string | null,
  modelStyleBible?: string | null,
): string {
  const parts: string[] = [];
  const fromModel = (modelStyleBible || "").trim();
  if (fromModel) parts.push(fromModel.replace(/\s+/g, " "));
  if (tradeType) parts.push(`Professional ${tradeType} business context.`);
  if (brand.service_focus?.length) parts.push(`Subject focus: ${brand.service_focus.join(", ")}.`);
  if (brand.location_cue) parts.push(`Setting: ${brand.location_cue}.`);
  parts.push("Consistent natural lighting and color grade across every shot.");
  if (brand.visual_style) parts.push(`Visual style: ${brand.visual_style}.`);
  if (brand.style_keywords?.length) parts.push(`Palette/mood keywords: ${brand.style_keywords.join(", ")}.`);
  if (brand.primary_color) {
    const accents = [brand.primary_color];
    if (brand.secondary_color) accents.push(brand.secondary_color);
    parts.push(`Subtle brand accent colors (on tools, signage, or clothing): ${accents.join(", ")}.`);
  }
  if (brand.avoid?.length) parts.push(`Avoid: ${brand.avoid.join(", ")}.`);
  parts.push("Same recurring subject, wardrobe, and environment across all scenes.");
  return parts.join(" ");
}

/** Suffix-inject the styleBible into a scene prompt (idempotent). */
function injectStyleBible(visualPrompt: string, styleBible: string): string {
  const base = visualPrompt.trim().replace(/\s+/g, " ");
  const suffix = `${STYLE_PREFIX}${styleBible}`;
  if (base.includes(suffix)) return base;
  const sep = /[.!?]$/.test(base) ? " " : ". ";
  return `${base}${sep}${suffix}`;
}

/* ─── Prompt construction ───────────────────────────────────────────── */

function buildSystemPrompt(input: DirectorInput): string {
  const { maxScenes, maxTotalSec } = input.tierConstraints;
  return `You are a video director planning a short promotional/social video for a trades business (plumber, electrician, roofer, HVAC, etc.).

Break ONE description into a scene-by-scene shooting plan for an AI video generator.

Output STRICT JSON matching exactly this schema:
{
  "title": "Short video title (under 80 chars)",
  "styleBible": "One continuity paragraph: recurring subject, setting, lighting, palette — keeps every scene visually consistent",
  "scenes": [
    {
      "index": 0,
      "visualPrompt": "What the camera sees in this scene — concrete subject, action, setting, camera angle. No on-screen text.",
      "narration": ${input.narrationEnabled ? `"Spoken voiceover for this scene, or null if the scene is silent"` : "null"},
      "durationSec": 4
    }
  ],
  "musicMood": "optional 2-4 word music mood",
  "totalDurationSec": 0
}

Hard rules:
- At most ${maxScenes} scenes. Total duration must NOT exceed ${maxTotalSec} seconds.
- durationSec must be exactly 4, 6, or 8 for every scene.
- totalDurationSec must equal the sum of all scene durations.
- Narration per scene must fit the clip: at most ${NARRATION_WORDS_PER_SEC} words per second (e.g. an 8s scene fits ~18 words).${input.narrationEnabled ? "" : "\n- Narration is DISABLED: set narration to null on every scene."}
- Scenes must flow as one continuous story with the same subject and setting.
- Do NOT fabricate testimonials, prices, guarantees, or certifications.
- No camera-crew jargon in narration; narration is spoken to the viewer.
- Output ONLY the JSON object. No markdown fences, no preamble.`;
}

function buildUserPrompt(input: DirectorInput, brandLayer: string): string {
  const lines: string[] = [];
  lines.push(`Video description: ${input.description.trim()}`);
  if (input.tradeType) lines.push(`Trade: ${input.tradeType}`);
  lines.push(`Aspect ratio: ${input.aspectRatio}`);
  lines.push(`Narration: ${input.narrationEnabled ? "enabled" : "disabled"}`);
  lines.push(`Limits: max ${input.tierConstraints.maxScenes} scenes, max ${input.tierConstraints.maxTotalSec} seconds total, scene lengths 4/6/8 seconds.`);
  if (brandLayer) lines.push(`\nBrand profile: ${brandLayer}`);
  lines.push("");
  lines.push("Produce the scene plan. Output JSON only.");
  return lines.join("\n");
}

/** Compact brand summary for the user prompt (text-side context). */
function buildBrandPromptLayer(brand: BrandProfile): string {
  const parts: string[] = [];
  if (brand.tone) parts.push(`Tone: ${brand.tone}.`);
  if (brand.target_audience) parts.push(`Target audience: ${brand.target_audience}.`);
  if (brand.unique_selling_points) parts.push(`USPs: ${brand.unique_selling_points}.`);
  if (brand.service_focus?.length) parts.push(`Services: ${brand.service_focus.join(", ")}.`);
  if (brand.location_cue) parts.push(`Location: ${brand.location_cue}.`);
  if (brand.forbidden_claims?.length) parts.push(`Never claim: ${brand.forbidden_claims.join(", ")}.`);
  return parts.join(" ");
}

/* ─── Parsing (mirrors videoContentService.tryParseScript) ──────────── */

interface RawScene {
  visualPrompt: string;
  narration: string | null;
  durationSec: number;
}

interface RawPlan {
  title: string;
  styleBible: string | null;
  scenes: RawScene[];
  musicMood?: string;
}

/** Defensive strict-JSON parse. Returns null on anything malformed. */
export function tryParseScenePlan(raw: string): RawPlan | null {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as any;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.title !== "string" || parsed.title.trim().length === 0) return null;
    if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) return null;
    const scenes: RawScene[] = [];
    for (const s of parsed.scenes) {
      if (!s || typeof s !== "object") return null;
      if (typeof s.visualPrompt !== "string" || s.visualPrompt.trim().length === 0) return null;
      const narration =
        typeof s.narration === "string" && s.narration.trim().length > 0
          ? s.narration.trim()
          : null;
      const durationSec = typeof s.durationSec === "number" && Number.isFinite(s.durationSec)
        ? s.durationSec
        : NaN;
      if (Number.isNaN(durationSec)) return null;
      scenes.push({ visualPrompt: s.visualPrompt.trim(), narration, durationSec });
    }
    return {
      title: parsed.title.trim().slice(0, 120),
      styleBible: typeof parsed.styleBible === "string" ? parsed.styleBible : null,
      scenes,
      musicMood:
        typeof parsed.musicMood === "string" && parsed.musicMood.trim().length > 0
          ? parsed.musicMood.trim().slice(0, 60)
          : undefined,
    };
  } catch {
    return null;
  }
}

/* ─── Clamping + validation ─────────────────────────────────────────── */

/** Snap an arbitrary duration to the nearest legal clip length {4,6,8}. */
export function clampSceneDuration(durationSec: number): SceneDurationSec {
  if (durationSec <= 5) return 4;
  if (durationSec <= 7) return 6;
  return 8;
}

/** Trim narration to the per-scene word budget (floor(sec × 2.3)). */
export function clampNarration(narration: string | null, durationSec: number): string | null {
  if (narration === null) return null;
  const text = narration.trim().replace(/\s+/g, " ");
  if (text.length === 0) return null;
  const maxWords = Math.max(1, Math.floor(durationSec * NARRATION_WORDS_PER_SEC));
  const words = text.split(" ");
  if (words.length <= maxWords) return text;
  let trimmed = words.slice(0, maxWords).join(" ");
  // Close the cut cleanly: strip dangling punctuation, end with a period.
  trimmed = trimmed.replace(/[,;:\-–—]+$/, "");
  if (!/[.!?]$/.test(trimmed)) trimmed += ".";
  return trimmed;
}

/**
 * Clamp the raw model output into a tier-legal ScenePlan.
 * Returns a DirectorError when no legal plan can exist for the inputs.
 */
export function validateAndClampPlan(
  rawPlan: RawPlan,
  input: DirectorInput,
  styleBible: string,
): { ok: true; plan: ScenePlan } | { ok: false; error: DirectorError } {
  const { maxScenes, maxTotalSec } = input.tierConstraints;
  if (!Number.isFinite(maxScenes) || maxScenes < 1 || !Number.isFinite(maxTotalSec) || maxTotalSec < 4) {
    return {
      ok: false,
      error: {
        code: "validation_impossible",
        message: `Tier constraints cannot fit any video (maxScenes=${maxScenes}, maxTotalSec=${maxTotalSec}).`,
      },
    };
  }

  /* 1. Scene-count clamp: keep the first maxScenes scenes. */
  let scenes = rawPlan.scenes.slice(0, Math.floor(maxScenes));

  /* 2. Per-scene duration snap + narration policy. */
  let durations: SceneDurationSec[] = scenes.map((s) => clampSceneDuration(s.durationSec));

  /* 3. Total-duration clamp: step durations down (8→6→4) from the last
   *    scene backwards until the total fits; then drop trailing scenes. */
  const sum = () => durations.reduce((a, b) => a + b, 0 as number);
  let guard = durations.length * SCENE_DURATION_OPTIONS.length + 1;
  while (sum() > maxTotalSec && guard-- > 0) {
    let stepped = false;
    for (let i = durations.length - 1; i >= 0; i--) {
      if (durations[i]! > 4) {
        durations[i] = durations[i] === 8 ? 6 : 4;
        stepped = true;
        break;
      }
    }
    if (!stepped) {
      // All scenes are already 4s — drop the last scene.
      if (durations.length <= 1) {
        return {
          ok: false,
          error: {
            code: "validation_impossible",
            message: `Cannot fit even one 4s scene within maxTotalSec=${maxTotalSec}.`,
          },
        };
      }
      durations.pop();
      scenes = scenes.slice(0, durations.length);
    }
  }

  if (scenes.length === 0 || sum() > maxTotalSec) {
    return {
      ok: false,
      error: { code: "validation_impossible", message: "No tier-legal scene plan could be derived." },
    };
  }

  /* 4. Assemble: 0-based reindex, styleBible injection, narration trim. */
  const planned: PlannedScene[] = scenes.map((s, i) => ({
    index: i,
    visualPrompt: injectStyleBible(s.visualPrompt, styleBible),
    narration: input.narrationEnabled ? clampNarration(s.narration, durations[i]!) : null,
    durationSec: durations[i]!,
  }));

  /* 5. totalDurationSec recomputed — never the model's number. */
  const totalDurationSec = planned.reduce((a, s) => a + s.durationSec, 0);

  return {
    ok: true,
    plan: {
      title: rawPlan.title,
      styleBible,
      scenes: planned,
      musicMood: rawPlan.musicMood,
      totalDurationSec,
    },
  };
}

/* ─── Director entry point ──────────────────────────────────────────── */

/** Lazy default so importing this module never loads the gate/rotator/DB. */
async function defaultTextGen(input: { system: string; user: string; maxTokens?: number }) {
  const { generateContentflowText } = await import("./aiText");
  return generateContentflowText(input);
}

/**
 * Turn one user description into a tier-legal ScenePlan.
 * NEVER throws — all failures come back as typed DirectorError results.
 */
export async function directScenePlan(
  input: DirectorInput,
  textGen: DirectorTextGen = defaultTextGen,
): Promise<DirectorResult> {
  try {
    const description = (input?.description || "").trim();
    if (description.length === 0) {
      return {
        ok: false,
        costMicroUsd: 0,
        error: { code: "invalid_input", message: "A video description is required." },
      };
    }
    const { maxScenes, maxTotalSec } = input.tierConstraints || ({} as TierConstraints);
    if (!Number.isFinite(maxScenes) || maxScenes < 1 || !Number.isFinite(maxTotalSec) || maxTotalSec < 4) {
      return {
        ok: false,
        costMicroUsd: 0,
        error: {
          code: "validation_impossible",
          message: `Tier constraints cannot fit any video (maxScenes=${maxScenes}, maxTotalSec=${maxTotalSec}).`,
        },
      };
    }

    /* AI call (gate enforced inside generateContentflowText). */
    let raw: string;
    let costMicroUsd = 0;
    let provider: string | undefined;
    try {
      const gen = await textGen({
        system: buildSystemPrompt(input),
        user: buildUserPrompt(input, buildBrandPromptLayer(input.brand || {})),
        maxTokens: 3000,
      });
      raw = gen.text;
      costMicroUsd = gen.costMicroUsd ?? 0;
      provider = gen.provider;
    } catch (err: any) {
      const message = err?.message || String(err);
      /* generateContentflowText throws for exactly two reasons: the
       * ContentFlow gate (kill switch / spend cap — both messages say
       * "paused") or total provider exhaustion. */
      const code: DirectorErrorCode =
        /paused/i.test(message) && !/providers exhausted/i.test(message)
          ? "gate_blocked"
          : "ai_failed";
      return { ok: false, costMicroUsd: 0, error: { code, message } };
    }

    const rawPlan = tryParseScenePlan(raw);
    if (!rawPlan) {
      return {
        ok: false,
        costMicroUsd,
        error: { code: "parse_failed", message: "Could not parse the AI scene-plan output as JSON." },
      };
    }

    const styleBible = buildStyleBible(input.brand || {}, input.tradeType, rawPlan.styleBible);
    const validated = validateAndClampPlan(rawPlan, input, styleBible);
    if (!validated.ok) {
      return { ok: false, costMicroUsd, error: validated.error };
    }

    return { ok: true, plan: validated.plan, costMicroUsd, provider };
  } catch (err: any) {
    /* Belt-and-braces: the Director never throws. */
    return {
      ok: false,
      costMicroUsd: 0,
      error: { code: "ai_failed", message: err?.message || String(err) },
    };
  }
}
