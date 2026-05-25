/**
 * ContentFlow Phase 1 — prompt library.
 *
 * 12 named prompt patterns × 5 seed trades = 60 trade-adapted prompts.
 * Each pattern mirrors the "YouTuber" reference set (Influencer-POV,
 * Ugly Ad, Tool Hero, Before/After, Emergency Call, BTS, Flat-lay,
 * Testimonial, Day-in-Life, Job Site, Local Pride, Seasonal). The
 * library is the discovery surface the customer browses in the
 * Portal — they pick a pattern, the prompt is interpolated against
 * the BrandProfile, and the result feeds the existing image / video
 * / article workers (Phase 3 wiring; not in this PR).
 *
 * Variables follow {{handlebar}} convention so the Phase 2 prefill
 * engine can do a single-pass string interpolation off the
 * BrandProfile. Every variable used in templates MUST be available
 * (or derivable) from the BrandProfile schema in
 * server/services/contentflow/brandProfile.ts.
 *
 * No DB migration in Phase 1 — the library is a static seed list,
 * not a per-tenant table. Custom-prompt save is a Phase 3 follow-up.
 */

/* ImageStylePresetId is duplicated here from
 * server/services/contentflow/imageStylePresets.ts to keep the
 * shared/ layer free of upward dependencies. The string-literal union
 * MUST stay in sync with that file; the server route layer is the
 * single place that validates incoming ids against the canonical
 * preset catalog. */
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

/* ─── Axis types ─────────────────────────────────────────────────────── */

export type PromptGoal =
  | "awareness"
  | "lead_gen"
  | "trust"
  | "conversion"
  | "re_engagement";

export type PromptAsset = "image" | "article" | "video" | "multi";

/* The 12 named patterns. IDs are stable (used as anchors in URLs,
 * analytics keys, etc.) — do not rename without a migration story. */
export type PromptPatternId =
  | "contractor_pov"
  | "ugly_ad"
  | "tool_hero"
  | "before_after"
  | "emergency_call"
  | "behind_scenes"
  | "flat_lay"
  | "customer_testimonial"
  | "day_in_life"
  | "job_site"
  | "local_pride"
  | "seasonal";

export type PromptTrade =
  | "plumbing"
  | "hvac"
  | "electrical"
  | "roofing"
  | "landscaping";

/* ─── Pattern metadata (public-safe — used by SEO landing pages) ──── */

export interface PromptPattern {
  id: PromptPatternId;
  label: string;
  short: string;
  /** 1-sentence pitch, safe to render on public SEO pages. */
  publicDescription: string;
  defaultGoal: PromptGoal;
  defaultAsset: PromptAsset;
}

export const PROMPT_PATTERNS: readonly PromptPattern[] = [
  {
    id: "contractor_pov",
    label: "Contractor POV",
    short: "Owner-operator selfie on a real job site",
    publicDescription:
      "A first-person video or photo from the contractor's perspective on the job — the trades answer to influencer marketing.",
    defaultGoal: "trust",
    defaultAsset: "video",
  },
  {
    id: "ugly_ad",
    label: "Ugly Ad / Post-it",
    short: "Handwritten note, pattern-interrupt energy",
    publicDescription:
      "Hand-written sharpie or post-it ads that look like a real customer's note. Cuts through polished feeds.",
    defaultGoal: "conversion",
    defaultAsset: "image",
  },
  {
    id: "tool_hero",
    label: "Tool-of-the-Trade Hero",
    short: "Studio hero shot of the tool that closes the job",
    publicDescription:
      "Editorial close-up of the tool or instrument that signals competence at a glance.",
    defaultGoal: "trust",
    defaultAsset: "image",
  },
  {
    id: "before_after",
    label: "Before / After Reveal",
    short: "Split-screen proof that the work works",
    publicDescription:
      "The single highest-converting trades format: same angle, same lighting, before vs. after.",
    defaultGoal: "conversion",
    defaultAsset: "image",
  },
  {
    id: "emergency_call",
    label: "Emergency Callout",
    short: "3am hero moment — the call that saves the customer",
    publicDescription:
      "Dramatic-but-real after-hours rescue scene — phone lighting up, work van pulling up in the rain.",
    defaultGoal: "lead_gen",
    defaultAsset: "video",
  },
  {
    id: "behind_scenes",
    label: "Behind the Scenes",
    short: "6am truck-loading, golden-hour crew shots",
    publicDescription:
      "Candid behind-the-scenes content. Removes the agency-stock feel and signals authenticity.",
    defaultGoal: "trust",
    defaultAsset: "image",
  },
  {
    id: "flat_lay",
    label: "Tool Flat-Lay",
    short: "Top-down arrangement of tools, parts, paperwork",
    publicDescription:
      "Pinterest-style top-down hero shot of the kit involved in the work — minimal, modern, sharable.",
    defaultGoal: "awareness",
    defaultAsset: "image",
  },
  {
    id: "customer_testimonial",
    label: "Customer Testimonial Reenactment",
    short: "Real review, dramatised in B-roll",
    publicDescription:
      "Borrow a real Google review verbatim, then visualize the story beats with stock B-roll style imagery.",
    defaultGoal: "trust",
    defaultAsset: "multi",
  },
  {
    id: "day_in_life",
    label: "Day in the Life",
    short: "6 clips: coffee → first job → handshake → drive home",
    publicDescription:
      "Episodic carousel content. Builds owner-as-character brand affinity and high feed retention.",
    defaultGoal: "awareness",
    defaultAsset: "multi",
  },
  {
    id: "job_site",
    label: "Real Job, Real Crew",
    short: "Anti-stock-photo crew shot — sweat, focus, no posing",
    publicDescription:
      "Counter-programs the generic stock-photo wrench-thumbs-up. Real hands, real tools, real angles.",
    defaultGoal: "trust",
    defaultAsset: "image",
  },
  {
    id: "local_pride",
    label: "Local Landmark Drop-In",
    short: "Work van next to a recognisable local landmark",
    publicDescription:
      "Geo-trust play: customers buy local, so show local. Work van at the bridge, the diner, the courthouse.",
    defaultGoal: "lead_gen",
    defaultAsset: "image",
  },
  {
    id: "seasonal",
    label: "Seasonal Hook",
    short: "Tie the service to the season everyone's feeling",
    publicDescription:
      "Weather-anchored content. Snow on the van, leaves in the gutter, AC in July — the right service at the right moment.",
    defaultGoal: "re_engagement",
    defaultAsset: "multi",
  },
] as const;

/** Stable lookup: pattern id → pattern metadata. */
const PATTERN_BY_ID: Record<PromptPatternId, PromptPattern> = (() => {
  const out: Partial<Record<PromptPatternId, PromptPattern>> = {};
  for (const p of PROMPT_PATTERNS) out[p.id] = p;
  return out as Record<PromptPatternId, PromptPattern>;
})();

export function getPromptPattern(id: PromptPatternId): PromptPattern {
  return PATTERN_BY_ID[id];
}

/* ─── Trade metadata (public-safe — drives SEO landing copy) ──────── */

export interface TradeMeta {
  id: PromptTrade;
  /** Plural label for headlines, e.g. "Plumbing Businesses". */
  label: string;
  /** Slug used in /tools/[slug]-ai-content-prompts URLs. */
  slug: string;
  /** Single-trade noun used inline, e.g. "plumbing". */
  noun: string;
  /** SEO H1 fragment, e.g. "Plumbers". */
  seoTradeNoun: string;
}

export const TRADE_META: readonly TradeMeta[] = [
  { id: "plumbing", label: "Plumbing Businesses", slug: "plumbing", noun: "plumbing", seoTradeNoun: "Plumbers" },
  { id: "hvac", label: "HVAC Businesses", slug: "hvac", noun: "HVAC", seoTradeNoun: "HVAC Contractors" },
  { id: "electrical", label: "Electrical Businesses", slug: "electrical", noun: "electrical", seoTradeNoun: "Electricians" },
  { id: "roofing", label: "Roofing Businesses", slug: "roofing", noun: "roofing", seoTradeNoun: "Roofers" },
  { id: "landscaping", label: "Landscaping Businesses", slug: "landscaping", noun: "landscaping", seoTradeNoun: "Landscapers" },
] as const;

const TRADE_BY_ID: Record<PromptTrade, TradeMeta> = (() => {
  const out: Partial<Record<PromptTrade, TradeMeta>> = {};
  for (const t of TRADE_META) out[t.id] = t;
  return out as Record<PromptTrade, TradeMeta>;
})();

const TRADE_BY_SLUG: Record<string, TradeMeta> = (() => {
  const out: Record<string, TradeMeta> = {};
  for (const t of TRADE_META) out[t.slug] = t;
  return out;
})();

export function getTradeMeta(id: PromptTrade): TradeMeta {
  return TRADE_BY_ID[id];
}

export function getTradeMetaBySlug(slug: string): TradeMeta | null {
  return TRADE_BY_SLUG[slug] ?? null;
}

/* ─── Prompt template ────────────────────────────────────────────────── */

export interface PromptTemplate {
  /** Stable id, e.g. "plumbing_ugly_ad_burst_pipe". */
  id: string;
  patternId: PromptPatternId;
  trade: PromptTrade;
  goal: PromptGoal;
  asset: PromptAsset;
  /** 4–7 word headline for the picker card. */
  title: string;
  /** 1–2 sentences shown under the title in the picker. */
  description: string;
  /** The actual prompt text. Uses {{handlebar}} placeholders. */
  template: string;
  /** Image style presets that pair well with this prompt. */
  styleHints: ImageStylePresetId[];
  /** 0–100 seed popularity (replaced by real usage data in Phase 4+). */
  popularity: number;
  /** Free-text discovery tags. */
  tags: string[];
  /** Optional CDN path to canonical sample output (filled post-test pass). */
  previewImageUrl?: string;
}

/* ─── 60 prompt templates ────────────────────────────────────────────── */

/* Variable conventions used below — every one resolves off BrandProfile:
 *   {{businessName}}      — business_name (Phase 2 brandProfile field)
 *   {{city}}              — location_cue split or first phrase
 *   {{serviceUSP}}        — unique_selling_points
 *   {{serviceFocus}}      — service_focus[0]
 *   {{customerQuote}}     — hero_testimonial (Phase 2 field)
 *   {{brandPrimary}}      — primary_color
 *   {{brandSecondary}}    — secondary_color
 *   {{tone}}              — tone
 *   {{audience}}          — target_audience
 *   {{yearFounded}}       — year_founded (Phase 2 field)
 *
 * Phase 1 preview endpoint substitutes any unfilled value with a
 * conservative placeholder (e.g. "[Your business name]") so the
 * library is usable before the Phase 2 prefill flow lands.
 */

export const PROMPT_TEMPLATES: readonly PromptTemplate[] = [
  /* ═══════════════════ PLUMBING (12) ═══════════════════ */
  {
    id: "plumbing_contractor_pov_finished_bath",
    patternId: "contractor_pov",
    trade: "plumbing",
    goal: "trust",
    asset: "video",
    title: "Plumber Selfie In Finished Bath",
    description: "Owner-POV selfie in a freshly-finished customer bathroom. iPhone Stories format, parasocial trust.",
    template:
      "Pretend you're a master plumber with 12 years of experience filming a quick selfie video in a customer's freshly-finished {{city}} basement bathroom for {{businessName}}. iPhone 14 quality, slight handheld shake, natural lighting from a window. Tone: {{tone}}, no sales energy. Caption overlay: '{{serviceUSP}}'. Mention the {{serviceFocus}} job you just finished.",
    styleHints: ["lifestyle", "photoreal"],
    popularity: 78,
    tags: ["selfie", "owner-operator", "stories", "trust"],
  },
  {
    id: "plumbing_ugly_ad_burst_pipe",
    patternId: "ugly_ad",
    trade: "plumbing",
    goal: "conversion",
    asset: "image",
    title: "Post-It After 2AM Burst Pipe",
    description: "Pattern-interrupt post-it taped to a dried-out basement floor — looks like a real homeowner's snapshot.",
    template:
      "Pretend you're a homeowner who just had {{businessName}} fix a burst pipe at 2 AM. Take a photo with your iPhone of the dried-out basement floor with a yellow Post-it note next to {{businessName}}'s business card. iPhone 14 or lower quality — this is a real homeowner snapshot, not professional photography. Slight blur on the background. The post-it says in blue ballpoint handwriting: '{{customerQuote}}'. No filters.",
    styleHints: ["photoreal", "lifestyle"],
    popularity: 91,
    tags: ["ugly-ad", "post-it", "emergency", "pattern-interrupt"],
  },
  {
    id: "plumbing_tool_hero_pipe_wrench",
    patternId: "tool_hero",
    trade: "plumbing",
    goal: "trust",
    asset: "image",
    title: "Hero Shot Of Pipe Wrench",
    description: "Editorial close-up of a worn pipe wrench on a clean workbench. Competence at a glance.",
    template:
      "Editorial hero photograph of a well-worn pipe wrench resting on a clean stainless workbench at {{businessName}}'s shop. Single key light from upper-left, deep shadow, shallow depth of field. Subtle accent of {{brandPrimary}} on the handle wrap. Studio quality. Caption overlay placeholder: '{{serviceUSP}}'. Photoreal — no illustration.",
    styleHints: ["editorial", "product-hero", "minimalist"],
    popularity: 64,
    tags: ["tools", "hero-shot", "editorial"],
  },
  {
    id: "plumbing_before_after_drain",
    patternId: "before_after",
    trade: "plumbing",
    goal: "conversion",
    asset: "image",
    title: "Clogged Drain Reveal Split",
    description: "Same drain, same angle, same light — hair-clog on the left, sparkling clean on the right.",
    template:
      "Split-screen before/after for {{businessName}}. Left half: hair-clogged shower drain in a {{city}} home, harsh overhead light, slight grime. Right half: same exact drain, sparkling clean, identical camera angle and light. Subtle wipe line down the centre. Caption overlay placeholder: 'Same drain. Same hour. {{businessName}} — {{serviceUSP}}.' Photoreal, no illustration.",
    styleHints: ["photoreal", "editorial"],
    popularity: 88,
    tags: ["before-after", "drain", "proof"],
  },
  {
    id: "plumbing_emergency_call_burst_pipe",
    patternId: "emergency_call",
    trade: "plumbing",
    goal: "lead_gen",
    asset: "video",
    title: "3AM Burst-Pipe Callout",
    description: "Cinematic emergency callout video. Phone glow, headlights through rain, calm professional energy.",
    template:
      "Cinematic 3am emergency callout scene for {{businessName}}. Phone on a nightstand lighting up. Owner answers, gets dressed in 90 seconds. Headlights through rain. Pulls up to a {{city}} home with a burst pipe. Tone: calm professionalism, not panic — matches a {{tone}} brand voice. Subtle {{brandPrimary}} accent on the van wrap. End card: '{{serviceUSP}}'. Film grain, color graded, anamorphic framing.",
    styleHints: ["cinematic", "photoreal"],
    popularity: 82,
    tags: ["emergency", "after-hours", "video", "hero-moment"],
  },
  {
    id: "plumbing_behind_scenes_truck_load",
    patternId: "behind_scenes",
    trade: "plumbing",
    goal: "trust",
    asset: "image",
    title: "6AM Truck Load-Out",
    description: "BTS shot of the work van being loaded for the day's first job. Pre-dawn light, breath visible.",
    template:
      "Behind-the-scenes photograph of a {{businessName}} plumber loading a work van at 6:45am in {{city}}. Pre-dawn light, breath visible in the cold. iPhone X quality, slight motion blur on the worker. Subtle {{brandPrimary}} brand wrap. Real moment — no posing. Caption placeholder: '#BehindTheTrade'.",
    styleHints: ["lifestyle", "photoreal"],
    popularity: 56,
    tags: ["behind-the-scenes", "morning", "authenticity"],
  },
  {
    id: "plumbing_flat_lay_repair_kit",
    patternId: "flat_lay",
    trade: "plumbing",
    goal: "awareness",
    asset: "image",
    title: "Top-Down Plumber's Kit",
    description: "Pinterest-style flat lay of the kit involved in a typical service call.",
    template:
      "Top-down flat-lay photograph of a {{businessName}} plumber's service-call kit on a clean concrete floor: pipe wrench, channel locks, PTFE tape, a coiled drain snake, work gloves, a clipboard with a {{businessName}} invoice, and a coffee cup. Generous negative space. Soft directional natural light from the left. Minimal palette with a small {{brandPrimary}} accent on the gloves.",
    styleHints: ["minimalist", "editorial", "product-hero"],
    popularity: 49,
    tags: ["flat-lay", "tools", "pinterest"],
  },
  {
    id: "plumbing_customer_testimonial_burst_save",
    patternId: "customer_testimonial",
    trade: "plumbing",
    goal: "trust",
    asset: "multi",
    title: "Real Review, B-Roll Visual",
    description: "Voiceover of a real Google review over B-roll of a {{city}} home repair. Match emotional beats.",
    template:
      "Multi-asset content for {{businessName}}. Voiceover (text-to-speech or subtitle): '{{customerQuote}}'. Visuals: B-roll of a {{city}} home being repaired by a plumber — start with the problem (water on floor), middle with the work (replacing the section of pipe), end with the relief (dry basement at sunset). Match the emotional beats of the quote. Tone: {{tone}}.",
    styleHints: ["cinematic", "photoreal", "lifestyle"],
    popularity: 71,
    tags: ["testimonial", "review", "story"],
  },
  {
    id: "plumbing_day_in_life_six_clips",
    patternId: "day_in_life",
    trade: "plumbing",
    goal: "awareness",
    asset: "multi",
    title: "Plumber's Day In 6 Clips",
    description: "6-clip carousel: coffee, first call, lunch, the hard fix, handshake, drive home.",
    template:
      "6-clip vertical carousel for {{businessName}}: (1) 6am coffee in a work-van mug, (2) the first drain call of the day at a {{city}} home, (3) lunch from a local diner, (4) finding the tricky leak under a sink, (5) a customer handshake at the door, (6) sunset drive home with the van in {{brandPrimary}}. iPhone vertical, natural light, {{tone}} voiceover. Hashtag: #PlumbersDay.",
    styleHints: ["lifestyle", "cinematic"],
    popularity: 60,
    tags: ["day-in-life", "carousel", "story"],
  },
  {
    id: "plumbing_job_site_under_sink",
    patternId: "job_site",
    trade: "plumbing",
    goal: "trust",
    asset: "image",
    title: "Real Crew Under A Sink",
    description: "Anti-stock-photo: real plumber under a real kitchen sink. Hands, tools, focus — no smiling-thumbs-up.",
    template:
      "Real-job photograph for {{businessName}}. A plumber on the floor working under a {{city}} kitchen sink at 11am. No posing — focused on the work, head partly out of frame, hands tightening a fitting. Focus on hands and tools. Natural light from a kitchen window. iPhone quality, slight imperfection in framing. No teeth, no thumbs-up.",
    styleHints: ["photoreal", "lifestyle"],
    popularity: 67,
    tags: ["job-site", "anti-stock", "real-crew"],
  },
  {
    id: "plumbing_local_pride_van_landmark",
    patternId: "local_pride",
    trade: "plumbing",
    goal: "lead_gen",
    asset: "image",
    title: "Van At A Local Landmark",
    description: "Work van parked beside a recognisable landmark in {{city}}. Golden hour, geo-trust.",
    template:
      "Wide photograph of {{businessName}}'s work van parked next to {{city}}'s most recognisable landmark. Golden hour, natural light, slight lens flare. No people. {{brandPrimary}} brand wrap visible. Caption placeholder: 'Serving {{city}} since {{yearFounded}}.' Photoreal — no illustration.",
    styleHints: ["editorial", "cinematic", "photoreal"],
    popularity: 58,
    tags: ["local", "geo-trust", "landmark"],
  },
  {
    id: "plumbing_seasonal_frozen_pipes",
    patternId: "seasonal",
    trade: "plumbing",
    goal: "re_engagement",
    asset: "multi",
    title: "Frozen-Pipe Winter Hook",
    description: "Seasonal post — snow on the van, breath in the air, the winter service tee-up.",
    template:
      "Seasonal multi-asset post for {{businessName}}. Hero image: snow on the {{businessName}} work van in a {{city}} driveway, breath visible from a plumber pulling tools out of the back. Companion short copy (300–500 chars) for {{audience}}: 'Frozen pipes are the call we get most often in January. Here's the 30-second check we recommend before you call us.' Tone: {{tone}}.",
    styleHints: ["lifestyle", "cinematic"],
    popularity: 52,
    tags: ["winter", "frozen-pipes", "seasonal"],
  },

  /* ═══════════════════ HVAC (12) ═══════════════════ */
  {
    id: "hvac_contractor_pov_install",
    patternId: "contractor_pov",
    trade: "hvac",
    goal: "trust",
    asset: "video",
    title: "Tech POV Next To New Unit",
    description: "Selfie-POV of an HVAC tech standing next to a brand-new install. Stories-format, matter-of-fact.",
    template:
      "Selfie-POV video for {{businessName}}. You're an HVAC tech standing next to a brand-new install at a {{city}} home. Work van visible in background with {{brandPrimary}} accent. Quick to-camera explanation of why {{serviceFocus}} matters before summer. iPhone Stories format, natural light, {{tone}} delivery — matter-of-fact, no salesy energy.",
    styleHints: ["lifestyle", "photoreal"],
    popularity: 74,
    tags: ["selfie", "install", "stories"],
  },
  {
    id: "hvac_ugly_ad_furnace_note",
    patternId: "ugly_ad",
    trade: "hvac",
    goal: "conversion",
    asset: "image",
    title: "Sharpie Note On Furnace",
    description: "Torn-cardboard sharpie note duct-taped to a basement furnace. Looks like a customer's text-photo.",
    template:
      "A torn cardboard note duct-taped to a furnace in a {{city}} basement. Handwritten in black sharpie: '{{customerQuote}}'. iPhone close-up, low basement lighting, slight blur on the background. Looks like a homeowner just texted this to a friend — not a designed ad. Subtle {{brandPrimary}} on the furnace sticker.",
    styleHints: ["photoreal", "lifestyle"],
    popularity: 79,
    tags: ["ugly-ad", "furnace", "pattern-interrupt"],
  },
  {
    id: "hvac_tool_hero_manifold_gauges",
    patternId: "tool_hero",
    trade: "hvac",
    goal: "trust",
    asset: "image",
    title: "Manifold Gauges On Van Bumper",
    description: "Editorial shot of HVAC manifold gauges on a service-van bumper. Trade-pride, competence.",
    template:
      "Editorial-quality photograph of an HVAC technician's tool belt with manifold gauge, multimeter, and refrigerant tank resting on a {{businessName}} service-van bumper. Soft golden-hour lighting from a low angle. {{brandPrimary}} subtly visible on the van's wrap. The shot conveys '{{serviceUSP}}' — competent, reliable, trade-pride. Photoreal, no illustration.",
    styleHints: ["editorial", "cinematic", "photoreal"],
    popularity: 69,
    tags: ["tools", "hero-shot", "trade-pride"],
  },
  {
    id: "hvac_before_after_coil_clean",
    patternId: "before_after",
    trade: "hvac",
    goal: "conversion",
    asset: "image",
    title: "Dirty Vs Clean Coil Split",
    description: "Same condenser coil, same angle: filth on the left, factory-clean on the right.",
    template:
      "Split-screen before/after for {{businessName}}. Left half: a filthy AC condenser coil at a {{city}} home, dust and cottonwood matted into the fins. Right half: same coil, factory-clean, identical camera angle and natural light. Caption overlay placeholder: 'Same coil. 18 minutes. {{businessName}} — {{serviceUSP}}.' Photoreal.",
    styleHints: ["photoreal", "editorial"],
    popularity: 81,
    tags: ["before-after", "coil", "maintenance"],
  },
  {
    id: "hvac_emergency_call_storm_outage",
    patternId: "emergency_call",
    trade: "hvac",
    goal: "lead_gen",
    asset: "video",
    title: "AC-Down In A Heatwave",
    description: "Cinematic emergency-callout video: AC quit in July, van pulls up by sunset, tone stays calm.",
    template:
      "Cinematic emergency-callout video for {{businessName}}. Mid-heatwave, a {{city}} family's AC has died. Phone rings, owner answers calmly. Van pulls into the driveway as the sun gets low — {{brandPrimary}} wrap catching the light. Tech walks to the unit, gauges out. Family fanning themselves on the porch. Calm narration: '{{serviceUSP}}.' Film grain, anamorphic, color graded.",
    styleHints: ["cinematic", "photoreal"],
    popularity: 77,
    tags: ["emergency", "heatwave", "video"],
  },
  {
    id: "hvac_behind_scenes_pre_dawn_shop",
    patternId: "behind_scenes",
    trade: "hvac",
    goal: "trust",
    asset: "image",
    title: "Pre-Dawn Shop Stand-Up",
    description: "BTS of a morning crew stand-up in the {{businessName}} shop. Coffee, clipboards, day's jobs.",
    template:
      "Behind-the-scenes photograph of the {{businessName}} HVAC crew at a 6:30am morning stand-up in the shop. Three techs, coffee in hand, clipboards, the dispatch board behind them showing the day's jobs. Warm overhead light, no posing. {{brandPrimary}} on shirts and the board frame. iPhone candid.",
    styleHints: ["lifestyle", "photoreal"],
    popularity: 51,
    tags: ["behind-the-scenes", "morning", "crew"],
  },
  {
    id: "hvac_flat_lay_install_parts",
    patternId: "flat_lay",
    trade: "hvac",
    goal: "awareness",
    asset: "image",
    title: "Install-Day Parts Flat-Lay",
    description: "Top-down lay-out of every part that goes into a typical AC install. Modern, minimal.",
    template:
      "Top-down flat-lay photograph of every part that goes into a typical {{businessName}} AC install in {{city}}: condenser pad, copper line set, disconnect box, drain pan, thermostat in its box, screws and fittings in a small dish. Clean grey concrete floor. Soft directional light. Minimal palette with {{brandPrimary}} on the thermostat box label.",
    styleHints: ["minimalist", "editorial", "product-hero"],
    popularity: 46,
    tags: ["flat-lay", "install", "parts"],
  },
  {
    id: "hvac_customer_testimonial_install",
    patternId: "customer_testimonial",
    trade: "hvac",
    goal: "trust",
    asset: "multi",
    title: "Real Review On Install B-Roll",
    description: "Voiceover of a real customer review over B-roll of the same job type — quote drives visuals.",
    template:
      "Multi-asset content for {{businessName}}. Voiceover (subtitle): '{{customerQuote}}'. Visuals: B-roll of an HVAC install at a {{city}} home — old unit being pulled out, new unit on the pad, thermostat being mounted, family checking the new vent temperature. Tone: {{tone}}. Match the emotional beats of the quote (relief → trust).",
    styleHints: ["cinematic", "photoreal", "lifestyle"],
    popularity: 68,
    tags: ["testimonial", "install", "story"],
  },
  {
    id: "hvac_day_in_life_carousel",
    patternId: "day_in_life",
    trade: "hvac",
    goal: "awareness",
    asset: "multi",
    title: "HVAC Day In 6 Clips",
    description: "Day-in-the-life carousel: van load, diagnostic, lunch, the tricky leak, customer chat, drive home.",
    template:
      "6-clip vertical carousel for {{businessName}}: (1) 6am van load-out in {{city}}, (2) first AC diagnostic of the day, (3) lunch from a local diner, (4) finding the rare refrigerant leak with a sniffer, (5) the customer handshake, (6) sunset drive home with the {{brandPrimary}} van. iPhone vertical, natural light. Tone: {{tone}}. Hashtag: #HVACDay.",
    styleHints: ["lifestyle", "cinematic"],
    popularity: 57,
    tags: ["day-in-life", "carousel"],
  },
  {
    id: "hvac_job_site_attic_diagnostic",
    patternId: "job_site",
    trade: "hvac",
    goal: "trust",
    asset: "image",
    title: "Real Tech In A Hot Attic",
    description: "Anti-stock: real tech in a real attic in July. Sweat, focus, no posing.",
    template:
      "Real-job photograph for {{businessName}}. An HVAC tech kneeling in a hot {{city}} attic in July diagnosing an evaporator coil. Sweat on the brow, multimeter in one hand. Natural attic-bulb lighting. No posing, head partly out of frame. Focus on hands and gauges. iPhone candid quality.",
    styleHints: ["photoreal", "lifestyle"],
    popularity: 62,
    tags: ["job-site", "attic", "anti-stock"],
  },
  {
    id: "hvac_local_pride_van_landmark",
    patternId: "local_pride",
    trade: "hvac",
    goal: "lead_gen",
    asset: "image",
    title: "Van At The Town Landmark",
    description: "Service van parked next to a recognisable {{city}} landmark. Geo-trust play.",
    template:
      "Wide photograph of {{businessName}}'s HVAC service van parked next to {{city}}'s most recognisable landmark. Golden hour, slight lens flare, no people. {{brandPrimary}} brand wrap clearly visible. Caption placeholder: 'Keeping {{city}} comfortable since {{yearFounded}}.' Photoreal.",
    styleHints: ["editorial", "cinematic", "photoreal"],
    popularity: 55,
    tags: ["local", "landmark", "geo-trust"],
  },
  {
    id: "hvac_seasonal_first_heatwave",
    patternId: "seasonal",
    trade: "hvac",
    goal: "re_engagement",
    asset: "multi",
    title: "First Heatwave Of The Year",
    description: "Seasonal hook tied to the first big heat day of the year — tune-up call-to-action.",
    template:
      "Seasonal multi-asset post for {{businessName}}. Hero image: a thermometer on a sunlit {{city}} porch reading 32°C, condenser visible in the background. Companion short copy (300–500 chars) for {{audience}}: 'First real heat day of the year. Now is the cheap time to catch a coil or capacitor issue — before the heatwave queue jams.' Tone: {{tone}}.",
    styleHints: ["lifestyle", "cinematic"],
    popularity: 53,
    tags: ["seasonal", "summer", "tune-up"],
  },

  /* ═══════════════════ ELECTRICAL (12) ═══════════════════ */
  {
    id: "electrical_contractor_pov_panel_upgrade",
    patternId: "contractor_pov",
    trade: "electrical",
    goal: "trust",
    asset: "video",
    title: "Electrician POV At New Panel",
    description: "Owner-POV selfie next to a freshly-upgraded service panel. Matter-of-fact, no sales energy.",
    template:
      "Selfie-POV video for {{businessName}}. You're a licensed electrician on a panel-upgrade job in a {{city}} home. POV next to the new panel, breaker labels clearly visible. {{tone}} delivery — matter-of-fact, no salesy energy. Mention what you upgraded and why. iPhone Stories format, natural basement light, {{brandPrimary}} accent on hard-hat or shirt.",
    styleHints: ["lifestyle", "photoreal"],
    popularity: 70,
    tags: ["selfie", "panel-upgrade", "stories"],
  },
  {
    id: "electrical_ugly_ad_breaker_box",
    patternId: "ugly_ad",
    trade: "electrical",
    goal: "conversion",
    asset: "image",
    title: "Sharpie Note On Breaker Box",
    description: "Handwritten sticky on a finished breaker box — looks like a real customer note.",
    template:
      "A yellow Post-it stuck to a freshly-labeled breaker box in a {{city}} home. Handwritten in blue ballpoint: '{{customerQuote}}'. iPhone close-up, basement utility-light, slight blur on the background. Looks like a homeowner sent this to a family group chat — not a designed ad. {{brandPrimary}} accent on the box label.",
    styleHints: ["photoreal", "lifestyle"],
    popularity: 76,
    tags: ["ugly-ad", "breaker-box", "pattern-interrupt"],
  },
  {
    id: "electrical_tool_hero_multimeter",
    patternId: "tool_hero",
    trade: "electrical",
    goal: "trust",
    asset: "image",
    title: "Fluke Multimeter Hero Shot",
    description: "Studio hero of a Fluke multimeter on a clean panel cover. Competence signal.",
    template:
      "Editorial hero photograph of a Fluke multimeter and probes resting on a clean white {{businessName}} panel cover. Single light from upper-left, deep shadow, shallow depth of field. Subtle {{brandPrimary}} accent on the probe handles. Studio quality. Tagline overlay placeholder: '{{serviceUSP}}'. Photoreal.",
    styleHints: ["editorial", "product-hero", "minimalist"],
    popularity: 66,
    tags: ["tools", "multimeter", "hero-shot"],
  },
  {
    id: "electrical_before_after_panel",
    patternId: "before_after",
    trade: "electrical",
    goal: "conversion",
    asset: "image",
    title: "Old Vs New Service Panel",
    description: "Split: cluttered old panel with mismatched breakers on the left, organised new panel on the right.",
    template:
      "Split-screen before/after for {{businessName}}. Left half: a cluttered old electrical panel in a {{city}} home with mismatched breakers and a confusing label sheet. Right half: same wall, brand-new panel, neatly-labeled breakers, clean wiring trough. Identical camera angle and light. Caption placeholder: '{{serviceUSP}} — {{businessName}}.' Photoreal.",
    styleHints: ["photoreal", "editorial"],
    popularity: 84,
    tags: ["before-after", "panel-upgrade", "proof"],
  },
  {
    id: "electrical_emergency_call_storm_outage",
    patternId: "emergency_call",
    trade: "electrical",
    goal: "lead_gen",
    asset: "video",
    title: "Storm-Night Power Outage",
    description: "Cinematic storm-night callout — van in the rain, flashlight on the panel, calm hero moment.",
    template:
      "Cinematic storm-night emergency-callout video for {{businessName}}. Heavy rain. Electrician's van pulls up to a {{city}} home that's lost power. Flashlight beam on the breaker panel. Calm narration: 'This is what {{businessName}} does at 2am.' {{brandPrimary}} wrap visible in the headlight wash. Film grain, color graded, anamorphic framing.",
    styleHints: ["cinematic", "photoreal"],
    popularity: 75,
    tags: ["emergency", "storm", "video"],
  },
  {
    id: "electrical_behind_scenes_shop_test_bench",
    patternId: "behind_scenes",
    trade: "electrical",
    goal: "trust",
    asset: "image",
    title: "Test Bench In The Shop",
    description: "BTS of the {{businessName}} shop test bench. Soldering iron, scope, a half-rebuilt outlet.",
    template:
      "Behind-the-scenes photograph of the {{businessName}} electrician's shop test bench: soldering iron on its stand, oscilloscope, a half-rebuilt outlet, a coffee mug. Warm desk-lamp light. No people in frame. {{brandPrimary}} accent on the shop apron hanging in the background. iPhone candid.",
    styleHints: ["lifestyle", "editorial"],
    popularity: 48,
    tags: ["behind-the-scenes", "shop", "bench"],
  },
  {
    id: "electrical_flat_lay_panel_swap_kit",
    patternId: "flat_lay",
    trade: "electrical",
    goal: "awareness",
    asset: "image",
    title: "Panel-Swap Kit Flat-Lay",
    description: "Top-down lay-out of every part used in a 200A service upgrade. Minimal, modern.",
    template:
      "Top-down flat-lay photograph of a {{businessName}} panel-swap kit on a clean concrete floor in {{city}}: new 200A service panel, breakers in a row, copper grounding rod, conduit elbows, label sheet, work gloves, multimeter. Generous negative space. Soft directional light. {{brandPrimary}} on the label sheet.",
    styleHints: ["minimalist", "editorial", "product-hero"],
    popularity: 44,
    tags: ["flat-lay", "panel", "parts"],
  },
  {
    id: "electrical_customer_testimonial_ev_charger",
    patternId: "customer_testimonial",
    trade: "electrical",
    goal: "trust",
    asset: "multi",
    title: "EV-Charger Review B-Roll",
    description: "Real Google review of an EV-charger install + B-roll of the same job style.",
    template:
      "Multi-asset content for {{businessName}}. Voiceover (subtitle): '{{customerQuote}}'. Visuals: B-roll of an EV-charger install at a {{city}} home — conduit run on the garage wall, breaker added to the panel, charger mounted, homeowner plugging in their car at sunset. Tone: {{tone}}.",
    styleHints: ["cinematic", "lifestyle", "photoreal"],
    popularity: 65,
    tags: ["testimonial", "ev-charger", "story"],
  },
  {
    id: "electrical_day_in_life_carousel",
    patternId: "day_in_life",
    trade: "electrical",
    goal: "awareness",
    asset: "multi",
    title: "Electrician's Day In 6 Clips",
    description: "Carousel: shop start, panel diagnostic, lunch, tricky fault find, customer handshake, drive home.",
    template:
      "6-clip vertical carousel for {{businessName}}: (1) 7am shop start with coffee, (2) the first panel diagnostic of the day at a {{city}} home, (3) lunch from a local diner, (4) finding the tricky intermittent fault with a clamp meter, (5) the customer handshake, (6) sunset drive home in the {{brandPrimary}} van. iPhone vertical, natural light. Tone: {{tone}}.",
    styleHints: ["lifestyle", "cinematic"],
    popularity: 54,
    tags: ["day-in-life", "carousel"],
  },
  {
    id: "electrical_job_site_attic_run",
    patternId: "job_site",
    trade: "electrical",
    goal: "trust",
    asset: "image",
    title: "Real Crew Pulling Wire",
    description: "Anti-stock: real electrician pulling Romex through a {{city}} attic. Hands, focus, no posing.",
    template:
      "Real-job photograph for {{businessName}}. An electrician kneeling in a {{city}} attic pulling Romex between joists. Headlamp casting a hard light on the work. No posing — head partly out of frame, hands focused on the cable. iPhone candid quality. Insulation visible. {{brandPrimary}} on the shop tee.",
    styleHints: ["photoreal", "lifestyle"],
    popularity: 61,
    tags: ["job-site", "anti-stock", "attic"],
  },
  {
    id: "electrical_local_pride_van_courthouse",
    patternId: "local_pride",
    trade: "electrical",
    goal: "lead_gen",
    asset: "image",
    title: "Van At The Courthouse",
    description: "Service van parked next to a recognisable {{city}} landmark. Geo-trust play.",
    template:
      "Wide photograph of {{businessName}}'s electrical service van parked next to {{city}}'s most recognisable landmark (courthouse / town hall / signature bridge). Golden hour, slight lens flare, no people. {{brandPrimary}} brand wrap clearly visible. Caption placeholder: 'Wiring {{city}} since {{yearFounded}}.' Photoreal.",
    styleHints: ["editorial", "cinematic", "photoreal"],
    popularity: 50,
    tags: ["local", "landmark", "geo-trust"],
  },
  {
    id: "electrical_seasonal_holiday_lights",
    patternId: "seasonal",
    trade: "electrical",
    goal: "re_engagement",
    asset: "multi",
    title: "Holiday-Lights Capacity Check",
    description: "Seasonal hook — outdoor outlet capacity for holiday lights, plus a 60-second safety reel.",
    template:
      "Seasonal multi-asset post for {{businessName}}. Hero image: a {{city}} porch at dusk in December with warm holiday lights strung along the railing, GFCI outlet visible. Companion short copy (300–500 chars) for {{audience}}: 'Every December we get calls about tripped breakers from holiday lights. Here's how to check your outdoor outlet capacity in 60 seconds.' Tone: {{tone}}.",
    styleHints: ["lifestyle", "cinematic"],
    popularity: 47,
    tags: ["seasonal", "holiday", "safety"],
  },

  /* ═══════════════════ ROOFING (12) ═══════════════════ */
  {
    id: "roofing_contractor_pov_finished_roof",
    patternId: "contractor_pov",
    trade: "roofing",
    goal: "trust",
    asset: "video",
    title: "Roofer POV On Finished Roof",
    description: "Selfie-POV from the roof of a freshly-completed install. Big sky, big trust.",
    template:
      "Selfie-POV video for {{businessName}}. You're a roofer standing on a freshly-installed roof at a {{city}} home. POV with the finished shingle line in frame and the truck visible on the street below. {{tone}} delivery — matter-of-fact, no salesy energy. Quick walkthrough of what you just finished. iPhone Stories, natural light, {{brandPrimary}} on the shirt.",
    styleHints: ["lifestyle", "photoreal"],
    popularity: 72,
    tags: ["selfie", "roof", "stories"],
  },
  {
    id: "roofing_ugly_ad_storm_note",
    patternId: "ugly_ad",
    trade: "roofing",
    goal: "conversion",
    asset: "image",
    title: "Post-It After A Storm Save",
    description: "Pattern-interrupt note on a kitchen counter after a storm-emergency tarp + repair.",
    template:
      "A yellow Post-it stuck to a {{city}} kitchen counter the morning after a storm. Hand-written in ballpoint: '{{customerQuote}}'. iPhone close-up, soft morning light, slight blur on the background. Coffee mug in the background. Looks like a homeowner just texted this to family — not a designed ad. {{brandPrimary}} accent on a {{businessName}} card next to the note.",
    styleHints: ["photoreal", "lifestyle"],
    popularity: 80,
    tags: ["ugly-ad", "storm", "pattern-interrupt"],
  },
  {
    id: "roofing_tool_hero_nail_gun",
    patternId: "tool_hero",
    trade: "roofing",
    goal: "trust",
    asset: "image",
    title: "Coil Nail Gun Hero Shot",
    description: "Studio hero of a roofing coil-nailer on a clean shingle bundle. Competence at a glance.",
    template:
      "Editorial hero photograph of a roofing coil-nailer resting on a clean bundle of architectural shingles at the {{businessName}} shop. Single key light from upper-left, deep shadow, shallow depth of field. Subtle {{brandPrimary}} accent on the air hose. Studio quality, photoreal. Tagline overlay placeholder: '{{serviceUSP}}'.",
    styleHints: ["editorial", "product-hero", "minimalist"],
    popularity: 63,
    tags: ["tools", "nail-gun", "hero-shot"],
  },
  {
    id: "roofing_before_after_shingle_replace",
    patternId: "before_after",
    trade: "roofing",
    goal: "conversion",
    asset: "image",
    title: "Old Vs New Shingles",
    description: "Same {{city}} home, same angle: weathered curling shingles left, new architectural right.",
    template:
      "Split-screen before/after for {{businessName}}. Left half: a weathered {{city}} home with curling, moss-spotted shingles in harsh midday light. Right half: same exact home and angle, brand-new architectural shingles, identical light. Drone or step-back composition. Caption overlay placeholder: '{{serviceUSP}} — {{businessName}}.' Photoreal.",
    styleHints: ["photoreal", "editorial"],
    popularity: 89,
    tags: ["before-after", "shingles", "proof"],
  },
  {
    id: "roofing_emergency_call_storm_tarp",
    patternId: "emergency_call",
    trade: "roofing",
    goal: "lead_gen",
    asset: "video",
    title: "Storm-Tarp Emergency",
    description: "Cinematic post-storm callout — crew on the roof in last light, tarp going on a damaged section.",
    template:
      "Cinematic post-storm callout video for {{businessName}}. Storm winding down over a {{city}} neighbourhood. {{businessName}} crew pulls up — {{brandPrimary}} truck wrap catching the last light. Crew on the ladder fast, tarp on the damaged section before nightfall. Calm narration: 'When the storm passes, {{businessName}} starts.' Film grain, color graded.",
    styleHints: ["cinematic", "photoreal"],
    popularity: 78,
    tags: ["emergency", "storm", "tarp", "video"],
  },
  {
    id: "roofing_behind_scenes_dawn_load",
    patternId: "behind_scenes",
    trade: "roofing",
    goal: "trust",
    asset: "image",
    title: "Dawn Truck Load-Out",
    description: "BTS of the crew loading shingle bundles at 6:45am. Breath visible, headlamps still on.",
    template:
      "Behind-the-scenes photograph of the {{businessName}} roofing crew at 6:45am loading shingle bundles into a {{city}} truck. Pre-dawn light, breath visible in the cold. iPhone X quality, slight motion blur on the workers. {{brandPrimary}} brand wrap on the truck. Real moment — no posing. Caption placeholder: '#BehindTheTrade'.",
    styleHints: ["lifestyle", "photoreal"],
    popularity: 54,
    tags: ["behind-the-scenes", "morning", "crew"],
  },
  {
    id: "roofing_flat_lay_install_kit",
    patternId: "flat_lay",
    trade: "roofing",
    goal: "awareness",
    asset: "image",
    title: "Roof-Install Kit Flat-Lay",
    description: "Top-down lay-out of everything that goes into a roof tear-off and re-install.",
    template:
      "Top-down flat-lay photograph of a {{businessName}} roof-install kit laid out on a clean tarp in {{city}}: bundle of architectural shingles, drip edge, ice-and-water shield roll, coil-nailer, flashing tin snips, work gloves, a sharpie. Generous negative space. Soft directional light. {{brandPrimary}} on the gloves.",
    styleHints: ["minimalist", "editorial", "product-hero"],
    popularity: 45,
    tags: ["flat-lay", "install", "parts"],
  },
  {
    id: "roofing_customer_testimonial_storm",
    patternId: "customer_testimonial",
    trade: "roofing",
    goal: "trust",
    asset: "multi",
    title: "Storm-Damage Review B-Roll",
    description: "Real review of a storm-damage replacement + matched B-roll of the same kind of job.",
    template:
      "Multi-asset content for {{businessName}}. Voiceover (subtitle): '{{customerQuote}}'. Visuals: B-roll of a {{city}} home roof being replaced after storm damage — old shingles being torn off, ice-and-water shield going down, new shingles being nailed, finished roof at sunset. Tone: {{tone}}. Match the emotional beats of the quote (storm-shock → finished roof).",
    styleHints: ["cinematic", "lifestyle", "photoreal"],
    popularity: 73,
    tags: ["testimonial", "storm", "story"],
  },
  {
    id: "roofing_day_in_life_carousel",
    patternId: "day_in_life",
    trade: "roofing",
    goal: "awareness",
    asset: "multi",
    title: "Roofer's Day In 6 Clips",
    description: "Carousel: dawn coffee, first tear-off, lunch on the truck, the trickiest valley, handshake, drive home.",
    template:
      "6-clip vertical carousel for {{businessName}}: (1) dawn coffee on the truck bumper, (2) the first tear-off of the day at a {{city}} home, (3) lunch on the lowered tailgate, (4) the trickiest roof-valley of the day, (5) the customer handshake on the porch, (6) sunset drive home with the {{brandPrimary}} truck. iPhone vertical. Tone: {{tone}}.",
    styleHints: ["lifestyle", "cinematic"],
    popularity: 58,
    tags: ["day-in-life", "carousel"],
  },
  {
    id: "roofing_job_site_real_crew",
    patternId: "job_site",
    trade: "roofing",
    goal: "trust",
    asset: "image",
    title: "Real Crew On A Real Roof",
    description: "Anti-stock-photo: real crew on a real {{city}} roof at 11am. Sweat, focus, no smiling-to-camera.",
    template:
      "Real-job photograph for {{businessName}}. Crew on a real {{city}} roof at 11am. No posing — one roofer on his knees nailing shingles, another carrying a bundle up the ladder. Focus on hands and tools. No faces directly to camera. iPhone, natural light, slight framing imperfection. {{brandPrimary}} on the shop tees.",
    styleHints: ["photoreal", "lifestyle"],
    popularity: 70,
    tags: ["job-site", "anti-stock", "real-crew"],
  },
  {
    id: "roofing_local_pride_truck_landmark",
    patternId: "local_pride",
    trade: "roofing",
    goal: "lead_gen",
    asset: "image",
    title: "Truck At A Local Landmark",
    description: "Roofing truck parked next to a recognisable {{city}} landmark. Geo-trust play.",
    template:
      "Wide photograph of {{businessName}}'s roofing truck parked next to {{city}}'s most recognisable landmark. Golden hour, slight lens flare, no people in frame. {{brandPrimary}} truck wrap clearly visible. Caption placeholder: 'Re-roofing {{city}} since {{yearFounded}}.' Photoreal.",
    styleHints: ["editorial", "cinematic", "photoreal"],
    popularity: 51,
    tags: ["local", "landmark", "geo-trust"],
  },
  {
    id: "roofing_seasonal_pre_winter_check",
    patternId: "seasonal",
    trade: "roofing",
    goal: "re_engagement",
    asset: "multi",
    title: "Pre-Winter Roof Check",
    description: "Seasonal post tied to first frost — gutter check, missing-shingle check, ice-dam prevention.",
    template:
      "Seasonal multi-asset post for {{businessName}}. Hero image: a {{city}} home at first frost with autumn leaves still in the gutter. Companion short copy (300–500 chars) for {{audience}}: 'Before the first big snow, here are the three things to check on your roof. The cheap fix now beats the $4k ice-dam claim in February.' Tone: {{tone}}.",
    styleHints: ["lifestyle", "cinematic"],
    popularity: 56,
    tags: ["seasonal", "winter-prep", "ice-dam"],
  },

  /* ═══════════════════ LANDSCAPING (12) ═══════════════════ */
  {
    id: "landscaping_contractor_pov_finished_yard",
    patternId: "contractor_pov",
    trade: "landscaping",
    goal: "trust",
    asset: "video",
    title: "Landscaper POV On Finished Yard",
    description: "Selfie-POV at the end of a backyard transformation. Pride-of-work, soft golden light.",
    template:
      "Selfie-POV video for {{businessName}}. You're a landscaper at the end of a {{city}} backyard transformation. POV with the finished yard in frame — fresh mulch beds, edged grass, plant arrangement. {{tone}} delivery, pride-of-work energy. iPhone Stories format, late-afternoon golden light, {{brandPrimary}} accent on the shop tee.",
    styleHints: ["lifestyle", "photoreal"],
    popularity: 66,
    tags: ["selfie", "transformation", "stories"],
  },
  {
    id: "landscaping_ugly_ad_yard_note",
    patternId: "ugly_ad",
    trade: "landscaping",
    goal: "conversion",
    asset: "image",
    title: "Post-It On A Patio Table",
    description: "Pattern-interrupt note left on a {{city}} patio table after a yard makeover.",
    template:
      "A yellow Post-it on a {{city}} patio table after a yard makeover. Handwritten in ballpoint: '{{customerQuote}}'. iPhone close-up, soft afternoon light, slight blur on the freshly-mulched bed behind. {{businessName}} card next to the note with {{brandPrimary}} accent. Looks like a homeowner sent this to a neighbour — not a designed ad.",
    styleHints: ["photoreal", "lifestyle"],
    popularity: 74,
    tags: ["ugly-ad", "yard", "pattern-interrupt"],
  },
  {
    id: "landscaping_tool_hero_pruning_shears",
    patternId: "tool_hero",
    trade: "landscaping",
    goal: "trust",
    asset: "image",
    title: "Pruning Shears Hero Shot",
    description: "Studio hero of well-worn pruning shears on a clean cedar surface. Trade-pride aesthetic.",
    template:
      "Editorial hero photograph of well-worn pruning shears resting on a clean cedar work surface at the {{businessName}} shop. Single key light from upper-left, deep shadow, shallow depth of field. Subtle {{brandPrimary}} accent on the handle wrap. Studio quality. Tagline overlay placeholder: '{{serviceUSP}}'. Photoreal.",
    styleHints: ["editorial", "product-hero", "minimalist"],
    popularity: 60,
    tags: ["tools", "shears", "hero-shot"],
  },
  {
    id: "landscaping_before_after_yard",
    patternId: "before_after",
    trade: "landscaping",
    goal: "conversion",
    asset: "image",
    title: "Overgrown Vs Manicured Yard",
    description: "Split: weed-choked dead-patched yard on the left, manicured edged mulched on the right.",
    template:
      "Split-screen before/after for {{businessName}}. Left half: an overgrown {{city}} front yard with weeds, dead patches, and harsh midday light. Right half: same yard, same angle — trimmed grass, sharply edged beds, freshly mulched, soft golden-hour light. Caption overlay placeholder: '{{serviceUSP}} — {{businessName}}.' Photoreal.",
    styleHints: ["photoreal", "editorial", "lifestyle"],
    popularity: 87,
    tags: ["before-after", "yard", "proof"],
  },
  {
    id: "landscaping_emergency_call_storm_cleanup",
    patternId: "emergency_call",
    trade: "landscaping",
    goal: "lead_gen",
    asset: "video",
    title: "Storm-Cleanup Callout",
    description: "Cinematic post-storm cleanup — fallen branches, crew arriving with chainsaws by first light.",
    template:
      "Cinematic post-storm cleanup video for {{businessName}}. Morning after a windstorm in {{city}} — a large branch down across a homeowner's driveway. {{brandPrimary}} truck pulls up at first light. Crew out with chainsaws, calm and methodical. End frame: driveway clear, leaves swept. Narration: '{{serviceUSP}}'. Film grain, color graded.",
    styleHints: ["cinematic", "photoreal"],
    popularity: 68,
    tags: ["emergency", "storm-cleanup", "video"],
  },
  {
    id: "landscaping_behind_scenes_mulch_load",
    patternId: "behind_scenes",
    trade: "landscaping",
    goal: "trust",
    asset: "image",
    title: "Mulch Yard At Dawn",
    description: "BTS of the crew loading mulch at the yard at 6:30am. Pre-dawn light, breath visible.",
    template:
      "Behind-the-scenes photograph of the {{businessName}} landscaping crew at 6:30am loading mulch into a truck at the supply yard in {{city}}. Pre-dawn light, breath visible in the cold spring air. iPhone X quality, slight motion blur. {{brandPrimary}} brand wrap on the truck. No posing.",
    styleHints: ["lifestyle", "photoreal"],
    popularity: 50,
    tags: ["behind-the-scenes", "morning", "mulch"],
  },
  {
    id: "landscaping_flat_lay_planting_kit",
    patternId: "flat_lay",
    trade: "landscaping",
    goal: "awareness",
    asset: "image",
    title: "Planting-Day Flat-Lay",
    description: "Top-down lay-out of pots, plants, soil, trowel, and gloves before a planting job.",
    template:
      "Top-down flat-lay photograph of a {{businessName}} planting-day kit on a clean tarp in {{city}}: three plant pots with healthy starts, a bag of soil amendment, hand trowel, work gloves, pruning shears, a sharpie. Generous negative space. Soft directional natural light. Earthy palette with {{brandPrimary}} on the gloves.",
    styleHints: ["minimalist", "editorial", "product-hero"],
    popularity: 47,
    tags: ["flat-lay", "planting", "parts"],
  },
  {
    id: "landscaping_customer_testimonial_yard",
    patternId: "customer_testimonial",
    trade: "landscaping",
    goal: "trust",
    asset: "multi",
    title: "Yard-Reveal Review B-Roll",
    description: "Real review of a backyard transformation + B-roll of the same kind of project.",
    template:
      "Multi-asset content for {{businessName}}. Voiceover (subtitle): '{{customerQuote}}'. Visuals: B-roll of a {{city}} backyard transformation — overgrown start, mid-project demolition, fresh mulch and edging, homeowner stepping out at sunset to see the finished space. Tone: {{tone}}. Match emotional beats of the quote (overwhelm → relief).",
    styleHints: ["cinematic", "lifestyle", "photoreal"],
    popularity: 71,
    tags: ["testimonial", "transformation", "story"],
  },
  {
    id: "landscaping_day_in_life_carousel",
    patternId: "day_in_life",
    trade: "landscaping",
    goal: "awareness",
    asset: "multi",
    title: "Landscaper's Day In 6 Clips",
    description: "Carousel: mulch yard, first job edging, lunch in the truck, planting, handshake, drive home.",
    template:
      "6-clip vertical carousel for {{businessName}}: (1) 6am at the mulch yard, (2) first job of the day edging a {{city}} front yard, (3) lunch from a local diner in the truck, (4) afternoon planting a row of shrubs, (5) the customer handshake on the porch, (6) sunset drive home in the {{brandPrimary}} truck. iPhone vertical. Tone: {{tone}}.",
    styleHints: ["lifestyle", "cinematic"],
    popularity: 55,
    tags: ["day-in-life", "carousel"],
  },
  {
    id: "landscaping_job_site_real_crew",
    patternId: "job_site",
    trade: "landscaping",
    goal: "trust",
    asset: "image",
    title: "Real Crew Mid-Edging",
    description: "Anti-stock-photo: real landscaper mid-edging on a real {{city}} lawn. Sweat, focus, no smile-to-cam.",
    template:
      "Real-job photograph for {{businessName}}. A landscaper edging a {{city}} lawn at midday. No posing — leaning into the edger, sweat on the back of the shirt. Focus on hands, tool, and the sharp new edge being cut. No faces to camera. iPhone candid quality, natural light. {{brandPrimary}} on the shop tee.",
    styleHints: ["photoreal", "lifestyle"],
    popularity: 64,
    tags: ["job-site", "edging", "anti-stock"],
  },
  {
    id: "landscaping_local_pride_truck_landmark",
    patternId: "local_pride",
    trade: "landscaping",
    goal: "lead_gen",
    asset: "image",
    title: "Truck At The Park Sign",
    description: "Landscaping truck parked next to a recognisable {{city}} landmark. Geo-trust play.",
    template:
      "Wide photograph of {{businessName}}'s landscaping truck parked next to {{city}}'s most recognisable landmark (city park sign / town hall / bridge). Golden hour, slight lens flare, no people. {{brandPrimary}} truck wrap clearly visible. Caption placeholder: 'Sharpening {{city}} yards since {{yearFounded}}.' Photoreal.",
    styleHints: ["editorial", "cinematic", "photoreal"],
    popularity: 49,
    tags: ["local", "landmark", "geo-trust"],
  },
  {
    id: "landscaping_seasonal_spring_clean_up",
    patternId: "seasonal",
    trade: "landscaping",
    goal: "re_engagement",
    asset: "multi",
    title: "Spring Clean-Up Hook",
    description: "Seasonal post tied to the first warm week — clean-up package, fresh-mulch promo.",
    template:
      "Seasonal multi-asset post for {{businessName}}. Hero image: a {{city}} front yard at the first warm week of spring — winter debris still under the shrubs, daffodils starting to push up. Companion short copy (300–500 chars) for {{audience}}: 'First warm week is the right time to book the spring clean-up — beds opened, fresh mulch, edges cut. Calendar fills fast.' Tone: {{tone}}.",
    styleHints: ["lifestyle", "cinematic"],
    popularity: 59,
    tags: ["seasonal", "spring", "clean-up"],
  },
] as const;

/* ─── Indexes + queries ──────────────────────────────────────────────── */

/** Total seeded prompts. Compile-time guard via const assertion. */
export const PROMPT_TEMPLATE_COUNT = PROMPT_TEMPLATES.length;

const TEMPLATE_BY_ID: Record<string, PromptTemplate> = (() => {
  const out: Record<string, PromptTemplate> = {};
  for (const t of PROMPT_TEMPLATES) out[t.id] = t;
  return out;
})();

export function getPromptTemplate(id: string): PromptTemplate | null {
  return TEMPLATE_BY_ID[id] ?? null;
}

export function getPromptTemplatesForTrade(trade: PromptTrade): readonly PromptTemplate[] {
  return PROMPT_TEMPLATES.filter((t) => t.trade === trade);
}

/** 3-axis + free-text filter. Defensive: any unknown axis value is
 * treated as "no filter" rather than throwing — the route layer
 * validates inputs but this helper is also used from the client. */
export function filterPromptTemplates(opts: {
  trade?: string;
  goal?: PromptGoal | string;
  asset?: PromptAsset | string;
  style?: ImageStylePresetId | string;
  search?: string;
}): readonly PromptTemplate[] {
  const tradeFilter = opts.trade && opts.trade !== "all" ? opts.trade : null;
  const goalFilter = opts.goal && opts.goal !== "all" ? opts.goal : null;
  const assetFilter = opts.asset && opts.asset !== "all" ? opts.asset : null;
  const styleFilter = opts.style && opts.style !== "all" ? opts.style : null;
  const search = (opts.search ?? "").trim().toLowerCase();

  return PROMPT_TEMPLATES.filter((t) => {
    if (tradeFilter && t.trade !== tradeFilter) return false;
    if (goalFilter && t.goal !== goalFilter) return false;
    if (assetFilter && t.asset !== assetFilter) return false;
    if (styleFilter && !t.styleHints.includes(styleFilter as ImageStylePresetId)) return false;
    if (search) {
      const hay =
        `${t.title} ${t.description} ${t.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

/** Most-popular tags across a filtered set. Used by the picker UI to
 * surface a tag-chip row that responds to active filters. */
export function topTagsForTemplates(
  templates: readonly PromptTemplate[],
  limit: number = 8,
): readonly string[] {
  const counts = new Map<string, number>();
  for (const t of templates) {
    for (const tag of t.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

/* ─── Variable interpolation (preview endpoint) ──────────────────────── */

export interface PromptVariables {
  businessName?: string;
  city?: string;
  serviceUSP?: string;
  serviceFocus?: string;
  customerQuote?: string;
  brandPrimary?: string;
  brandSecondary?: string;
  tone?: string;
  audience?: string;
  yearFounded?: string | number;
}

/* Defaults used when the BrandProfile is missing a field. Conservative —
 * we want the preview to read as plausible placeholder text, not as a
 * raw {{handlebar}} that the customer will mistake for a bug. */
const PLACEHOLDER_DEFAULTS: Required<Record<keyof PromptVariables, string>> = {
  businessName: "[Your business name]",
  city: "your service area",
  serviceUSP: "fast, fair, no-surprise pricing",
  serviceFocus: "service call",
  customerQuote: "They showed up fast and fixed it right.",
  brandPrimary: "your brand color",
  brandSecondary: "your accent color",
  tone: "friendly",
  audience: "homeowners in your area",
  yearFounded: "2019",
};

/** Interpolate {{handlebar}} placeholders in a template string with
 * the provided variables, falling back to safe placeholders for any
 * missing fields. Safe to call with an empty `vars` object. */
export function interpolatePromptTemplate(
  template: string,
  vars: PromptVariables,
): string {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_match, key: string) => {
    const k = key as keyof PromptVariables;
    const v = vars[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v);
    }
    return PLACEHOLDER_DEFAULTS[k] ?? `[${key}]`;
  });
}
