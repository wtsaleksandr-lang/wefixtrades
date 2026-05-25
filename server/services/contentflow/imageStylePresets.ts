/**
 * ContentFlow — image-style preset library.
 *
 * Customers used to get whatever gpt-image-1 chose with a brand-color
 * accent layer (see imageGenerationService.buildBrandLayer). That meant
 * the visual look drifted across drafts: one post was photographic, the
 * next was illustration, the third was a glossy 3D render. The preset
 * library locks the visual direction per draft (or per customer default)
 * by appending a tested suffix to the post's prompt.
 *
 * Resolution order at generate time:
 *   1. caller-supplied preset (e.g. admin/agency override per draft)
 *   2. customer default stored at clients.metadata.content_brand.image_style_preset
 *   3. industry default via defaultPresetForIndustry(trade_type)
 *   4. hard fallback: "photoreal"
 *
 * NOT a database migration in this PR — the customer's preferred preset
 * is stored as a new BrandProfile field that is persisted in the existing
 * clients.metadata JSON blob alongside tone, style_keywords, etc.
 */

export type ImageStylePresetId =
  | "photoreal"
  | "cinematic"
  | "minimalist"
  | "vintage"
  | "editorial"
  | "lifestyle"
  | "product-hero"
  | "flat-illustration"
  | "hand-drawn"
  | "3d-render";

export interface ImageStylePreset {
  id: ImageStylePresetId;
  label: string;
  short: string;
  promptSuffix: string;
  /** Sample image path; lucide-icon fallback used in UI when missing. */
  thumbnail: string;
  /** Trade keywords (lowercased substring match) that suggest this preset. */
  recommended_for?: string[];
}

export const IMAGE_STYLE_PRESETS: readonly ImageStylePreset[] = [
  {
    id: "photoreal",
    label: "Photorealistic",
    short: "Real photography with natural lighting and sharp focus.",
    promptSuffix:
      "professional photography, natural lighting, sharp focus, real environment, no illustration",
    thumbnail: "/assets/style-thumbs/photoreal.jpg",
    recommended_for: ["plumbing", "electric", "hvac", "roofing", "construction", "auto", "general"],
  },
  {
    id: "cinematic",
    label: "Cinematic",
    short: "Film-style framing with dramatic lighting and color grading.",
    promptSuffix:
      "cinematic photography, film grain, dramatic lighting, shallow depth of field, anamorphic framing, color graded",
    thumbnail: "/assets/style-thumbs/cinematic.jpg",
    recommended_for: ["auto", "luxury", "real estate", "fitness"],
  },
  {
    id: "minimalist",
    label: "Minimalist",
    short: "Single subject on a clean neutral background.",
    promptSuffix:
      "clean minimalist composition, single subject, white or neutral background, generous negative space",
    thumbnail: "/assets/style-thumbs/minimalist.jpg",
    recommended_for: ["design", "tech", "consulting", "legal", "finance"],
  },
  {
    id: "vintage",
    label: "Vintage",
    short: "Retro film tones — warm, slightly grainy 70s/80s aesthetic.",
    promptSuffix:
      "vintage photography, 70s/80s film color grading, slight grain, warm tones, retro aesthetic",
    thumbnail: "/assets/style-thumbs/vintage.jpg",
    recommended_for: ["barber", "salon", "cafe", "restaurant", "boutique"],
  },
  {
    id: "editorial",
    label: "Editorial",
    short: "Magazine-style photography with sharp focus and pro lighting.",
    promptSuffix:
      "editorial magazine photography, high contrast, sharp focus, professional lighting setup",
    thumbnail: "/assets/style-thumbs/editorial.jpg",
    recommended_for: ["real estate", "fashion", "interior", "luxury"],
  },
  {
    id: "lifestyle",
    label: "Lifestyle",
    short: "Candid, warm moments of people in real environments.",
    promptSuffix:
      "lifestyle photography, candid moment, warm natural lighting, real people in natural environment",
    thumbnail: "/assets/style-thumbs/lifestyle.jpg",
    recommended_for: ["fitness", "wellness", "salon", "cafe", "retail", "family"],
  },
  {
    id: "product-hero",
    label: "Product hero",
    short: "Studio hero shot with isolated subject and dramatic shadow.",
    promptSuffix:
      "product hero shot, studio lighting, isolated subject on gradient background, dramatic shadow",
    thumbnail: "/assets/style-thumbs/product-hero.jpg",
    recommended_for: ["ecommerce", "retail", "tech", "boutique"],
  },
  {
    id: "flat-illustration",
    label: "Flat illustration",
    short: "Modern flat vector graphics with brand colors.",
    promptSuffix:
      "modern flat design illustration, geometric shapes, brand colors, no photographic elements",
    thumbnail: "/assets/style-thumbs/flat-illustration.jpg",
    recommended_for: ["saas", "tech", "fintech", "consulting"],
  },
  {
    id: "hand-drawn",
    label: "Hand-drawn",
    short: "Sketch or watercolor illustration — artistic and warm.",
    promptSuffix:
      "hand-drawn illustration, sketch or watercolor style, artistic and warm",
    thumbnail: "/assets/style-thumbs/hand-drawn.jpg",
    recommended_for: ["cafe", "boutique", "florist", "education", "kids"],
  },
  {
    id: "3d-render",
    label: "3D render",
    short: "Stylized 3D render with isometric framing and soft shadows.",
    promptSuffix:
      "clean 3D render, isometric perspective, soft global illumination, modern stylized aesthetic",
    thumbnail: "/assets/style-thumbs/3d-render.jpg",
    recommended_for: ["saas", "tech", "fintech", "gaming"],
  },
] as const;

/** Fast id → preset lookup. */
const PRESET_BY_ID: Record<ImageStylePresetId, ImageStylePreset> = (() => {
  const out: Partial<Record<ImageStylePresetId, ImageStylePreset>> = {};
  for (const p of IMAGE_STYLE_PRESETS) out[p.id] = p;
  return out as Record<ImageStylePresetId, ImageStylePreset>;
})();

/** Public list of valid preset ids. Use to validate API input. */
export const IMAGE_STYLE_PRESET_IDS: readonly ImageStylePresetId[] =
  IMAGE_STYLE_PRESETS.map((p) => p.id);

export function isImageStylePresetId(v: unknown): v is ImageStylePresetId {
  return typeof v === "string" && (IMAGE_STYLE_PRESET_IDS as readonly string[]).includes(v);
}

export function getStylePreset(
  id: ImageStylePresetId | null | undefined,
): ImageStylePreset | null {
  if (!id) return null;
  return PRESET_BY_ID[id] ?? null;
}

/**
 * Append a preset's promptSuffix to a base prompt. Pure string concat,
 * no trimming of the base — caller may have already composed a multi-line
 * 3-layer prompt and we want to preserve its structure.
 *
 * When the preset is unknown / null / undefined, returns the base prompt
 * unchanged so a caller without a preset isn't penalised vs. legacy.
 */
export function applyStylePreset(
  basePrompt: string,
  presetId: ImageStylePresetId | null | undefined,
): string {
  const preset = getStylePreset(presetId);
  if (!preset) return basePrompt;
  const suffix = preset.promptSuffix.trim();
  if (!suffix) return basePrompt;
  /* If the base already ends with the suffix (idempotent retry), don't
   * double-append. Cheap exact-match check. */
  if (basePrompt.endsWith(suffix)) return basePrompt;
  return `${basePrompt}, ${suffix}`;
}

/**
 * Map a free-form trade_type / industry string to a default preset.
 * The match is intentionally permissive — substring, case-insensitive —
 * because trade_type can be anything from "Plumbing" to "Auto repair &
 * detail" depending on how the customer was onboarded.
 *
 * Returns "photoreal" as the ultimate fallback. That keeps the existing
 * behaviour (a professional photo with brand accent) for any industry we
 * haven't tagged explicitly.
 */
export function defaultPresetForIndustry(
  industry: string | null | undefined,
): ImageStylePresetId {
  if (!industry || typeof industry !== "string") return "photoreal";
  const needle = industry.toLowerCase();
  /* Walk presets in declaration order so the first hit wins. photoreal
   * is first which is fine — its recommended_for covers the bulk of
   * trades work and is the desired default for them anyway. */
  for (const p of IMAGE_STYLE_PRESETS) {
    if (!p.recommended_for) continue;
    for (const kw of p.recommended_for) {
      if (needle.includes(kw)) return p.id;
    }
  }
  return "photoreal";
}
