/**
 * SiteLaunch — the page/section document model.
 *
 * This is the one genuinely-missing primitive the SiteLaunch audit identified:
 * before this file there was no multi-page concept anywhere in the repo. The
 * Elfsight editor's document model (`TemplateConfig`) describes a *calculator*
 * — fields, calculations, results — and its only renderer (`AdvancedCalculator`)
 * cannot render an arbitrary marketing page.
 *
 * DESIGN RULES
 *
 *  1. **The section vocabulary is NOT invented here.** Every `SectionType`
 *     below maps 1:1 onto something the repo already ships, so the renderer
 *     reproduces a design language we have already shipped and QA'd rather
 *     than a parallel one:
 *
 *       hero          → client/src/components/marketing/SplitHero
 *       services      → client/src/components/marketing/ServiceCards
 *       features      → client/src/components/marketing/FeatureCards
 *       steps         → client/src/components/effortel-blocks (NumberedCard)
 *       stats         → client/src/components/effortel-blocks (StatTile)
 *       trust         → client/src/components/marketing/TrustStrip
 *       about         → client/src/components/marketing/SurfaceSection
 *       gallery       → client/src/pages/portal/FreeTools/PhotoGallery
 *       testimonials  → client/src/pages/portal/FreeTools (reviews widgets)
 *       faq           → client/src/pages/portal/FreeTools/FaqBuilder      (+ GET /api/widget/:token/faq)
 *       hours         → client/src/pages/portal/FreeTools/HoursWidget     (+ GET /api/widget/:token/hours)
 *       service_area  → client/src/pages/portal/FreeTools/ServiceAreaMap
 *       contact       → client/src/pages/portal/FreeTools/CallbackForm    (+ POST /api/widget/:token/callback)
 *       cta           → client/src/components/marketing/CTASection
 *       quote_embed   → client/public/embed-widget.js (the QuoteQuick embed the SKU promises)
 *
 *  2. **Structure is code, not AI.** The AI draft generator fills the *slots*
 *     defined here; it never invents a layout and never adds a section type.
 *     See server/services/sitelaunch/draftGenerator.ts.
 *
 *  3. **No colours live in this file.** The full theme token tables are
 *     server-side (server/services/sitelaunch/themes.ts) both because the
 *     renderer is server-side and because `scripts/check-hardcoded-colors.mjs`
 *     scans `shared/`. Only theme *metadata* (id, name, who it suits) is
 *     shared with the client, which is all the admin picker needs.
 *
 *  4. **Every document is versioned** (`version: 1`) so a future migration can
 *     upcast old rows instead of guessing.
 */

import { z } from "zod";

/* ────────────────────────────────────────────────────────────────────────
 * Themes — metadata only. Token tables live server-side.
 * ──────────────────────────────────────────────────────────────────────── */

export const SITELAUNCH_THEME_IDS = [
  "trade-classic",
  "trade-bold",
  "trade-clean",
  "trade-pro",
] as const;

export type SiteLaunchThemeId = (typeof SITELAUNCH_THEME_IDS)[number];

export interface SiteLaunchThemeMeta {
  id: SiteLaunchThemeId;
  name: string;
  /** One line describing what actually differs — layout, not colour. */
  character: string;
  best_for: string;
}

/**
 * The four themes differ STRUCTURALLY (container width, hero composition,
 * card treatment, section rhythm, heading case, band alternation), not by
 * swapping an accent colour. See server/services/sitelaunch/themes.ts.
 */
export const SITELAUNCH_THEMES: readonly SiteLaunchThemeMeta[] = [
  {
    id: "trade-classic",
    name: "Classic",
    character:
      "Boxed 1120px container, split hero with image, bordered cards on a warm neutral, generous 96px section rhythm.",
    best_for: "Plumbers, electricians, HVAC",
  },
  {
    id: "trade-bold",
    name: "Bold",
    character:
      "Full-bleed dark hero with overlay, uppercase condensed display type, square corners, alternating dark/light bands, edge-to-edge stat strip.",
    best_for: "Roofers, remodelers, landscapers",
  },
  {
    id: "trade-clean",
    name: "Clean",
    character:
      "Centred text-only hero, hairline borders, no shadows, large radius, single accent, airy two-column text grids.",
    best_for: "Cleaners, painters, window services",
  },
  {
    id: "trade-pro",
    name: "Pro",
    character:
      "Sticky utility bar with phone, dense information design, left-accent-rail cards, credential row under the hero, tabular stat table.",
    best_for: "Commercial contractors, multi-location",
  },
] as const;

/** Deterministic trade → theme mapping. Mirrors the intent of
 *  shared/templateLibrary.ts TRADE_TEMPLATE_MAP. Admin-overridable. */
const TRADE_THEME_MAP: Record<string, SiteLaunchThemeId> = {
  plumbing: "trade-classic",
  plumber: "trade-classic",
  electrical: "trade-classic",
  electrician: "trade-classic",
  hvac: "trade-classic",
  heating: "trade-classic",
  roofing: "trade-bold",
  roofer: "trade-bold",
  remodeling: "trade-bold",
  landscaping: "trade-bold",
  concrete: "trade-bold",
  fencing: "trade-bold",
  cleaning: "trade-clean",
  painting: "trade-clean",
  painter: "trade-clean",
  windows: "trade-clean",
  "window-cleaning": "trade-clean",
  flooring: "trade-clean",
  commercial: "trade-pro",
  construction: "trade-pro",
  contracting: "trade-pro",
  restoration: "trade-pro",
};

export function recommendedTheme(tradeType?: string | null): SiteLaunchThemeId {
  if (!tradeType) return "trade-classic";
  const key = tradeType.toLowerCase().trim().replace(/[\s_]+/g, "-");
  return TRADE_THEME_MAP[key] ?? "trade-classic";
}

export function isSiteLaunchThemeId(v: unknown): v is SiteLaunchThemeId {
  return typeof v === "string" && (SITELAUNCH_THEME_IDS as readonly string[]).includes(v);
}

/* ────────────────────────────────────────────────────────────────────────
 * Section vocabulary
 * ──────────────────────────────────────────────────────────────────────── */

export const SECTION_TYPES = [
  "hero",
  "services",
  "features",
  "steps",
  "stats",
  "trust",
  "about",
  "gallery",
  "testimonials",
  "faq",
  "hours",
  "service_area",
  "contact",
  "cta",
  "quote_embed",
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

/** Human labels for the admin section editor. */
export const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Hero",
  services: "Services",
  features: "Feature cards",
  steps: "How it works",
  stats: "Numbers",
  trust: "Trust strip",
  about: "About",
  gallery: "Photo gallery",
  testimonials: "Testimonials",
  faq: "FAQ",
  hours: "Opening hours",
  service_area: "Service area",
  contact: "Contact form",
  cta: "Call to action",
  quote_embed: "Instant quote calculator",
};

/* ── Shared prop primitives ── */

const linkSchema = z.object({
  label: z.string().min(1).max(60),
  /** Internal page slug ("" = home) or an absolute URL, or "tel:"/"mailto:". */
  href: z.string().min(1).max(400),
});

const imageSchema = z.object({
  url: z.string().min(1).max(1000),
  alt: z.string().max(200).default(""),
  /**
   * Provenance is REQUIRED and load-bearing, not decorative metadata.
   * Trades marketing that shows an AI-generated "photo of your crew" or
   * "your completed job" is a misrepresentation risk. The draft generator
   * only ever emits `stock` or `abstract` for generated imagery, and the
   * renderer refuses to place a generated image in a section whose semantics
   * imply it depicts the customer's own work (gallery, testimonials).
   * See server/services/sitelaunch/draftGenerator.ts (IMAGE SAFETY RULE).
   */
  provenance: z.enum(["customer", "stock", "abstract", "generated"]).default("customer"),
});

export type SiteImage = z.infer<typeof imageSchema>;

/* ── Per-section prop schemas ── */

const heroProps = z.object({
  eyebrow: z.string().max(80).default(""),
  headline: z.string().min(1).max(160),
  subhead: z.string().max(400).default(""),
  primary_cta: linkSchema.optional(),
  secondary_cta: linkSchema.optional(),
  image: imageSchema.optional(),
  /** Short credibility items rendered beneath the hero (licence, years, etc.). */
  credentials: z.array(z.string().max(60)).max(4).default([]),
});

const serviceItem = z.object({
  title: z.string().min(1).max(80),
  description: z.string().max(300).default(""),
  /** lucide-style icon key; the renderer maps a small allowlist to inline SVG. */
  icon: z.string().max(40).default("wrench"),
  href: z.string().max(400).optional(),
  price_from: z.string().max(40).optional(),
});

const servicesProps = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(160).default("What we do"),
  intro: z.string().max(400).default(""),
  items: z.array(serviceItem).min(1).max(12),
});

const featuresProps = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(160).default("Why choose us"),
  intro: z.string().max(400).default(""),
  items: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        description: z.string().max(300).default(""),
        icon: z.string().max(40).default("check"),
      }),
    )
    .min(1)
    .max(9),
});

const stepsProps = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(160).default("How it works"),
  items: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        description: z.string().max(400).default(""),
      }),
    )
    .min(2)
    .max(6),
});

const statsProps = z.object({
  heading: z.string().max(160).default(""),
  items: z
    .array(
      z.object({
        value: z.string().min(1).max(20),
        label: z.string().min(1).max(60),
      }),
    )
    .min(2)
    .max(4),
});

const trustProps = z.object({
  heading: z.string().max(160).default(""),
  /** Short badge phrases: "Licensed & insured", "20 years", "5★ on Google". */
  items: z.array(z.string().min(1).max(60)).min(2).max(6),
});

const aboutProps = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(160).default("About us"),
  /** Plain-text paragraphs. Never raw HTML — the renderer escapes everything. */
  body: z.array(z.string().max(1200)).min(1).max(6),
  image: imageSchema.optional(),
  bullets: z.array(z.string().max(120)).max(6).default([]),
});

const galleryProps = z.object({
  heading: z.string().max(160).default("Recent work"),
  intro: z.string().max(400).default(""),
  images: z.array(imageSchema).max(24).default([]),
});

const testimonialsProps = z.object({
  heading: z.string().max(160).default("What our customers say"),
  items: z
    .array(
      z.object({
        quote: z.string().min(1).max(600),
        author: z.string().max(80).default(""),
        location: z.string().max(80).default(""),
        rating: z.number().int().min(1).max(5).optional(),
      }),
    )
    .max(12)
    .default([]),
});

const faqProps = z.object({
  heading: z.string().max(160).default("Frequently asked questions"),
  items: z
    .array(
      z.object({
        question: z.string().min(1).max(240),
        answer: z.string().min(1).max(1200),
      }),
    )
    .max(20)
    .default([]),
});

const hoursProps = z.object({
  heading: z.string().max(160).default("Opening hours"),
  note: z.string().max(240).default(""),
});

const serviceAreaProps = z.object({
  heading: z.string().max(160).default("Areas we cover"),
  intro: z.string().max(400).default(""),
  /** Town/suburb names. Rendered as a list — NOT as a map pin geography we
   *  cannot verify (see the MapGuard honesty precedent). */
  areas: z.array(z.string().min(1).max(80)).max(60).default([]),
});

const contactProps = z.object({
  heading: z.string().max(160).default("Get in touch"),
  intro: z.string().max(400).default(""),
  show_phone: z.boolean().default(true),
  show_email: z.boolean().default(true),
  show_address: z.boolean().default(true),
  /**
   * When set, the contact form posts to the existing FreeTools callback
   * endpoint (POST /api/widget/:token/callback). When absent the renderer
   * emits a mailto: form instead — it never renders a form that silently
   * discards a submission.
   */
  callback_widget_token: z.string().max(120).optional(),
});

const ctaProps = z.object({
  headline: z.string().min(1).max(160),
  subhead: z.string().max(400).default(""),
  primary_cta: linkSchema.optional(),
  secondary_cta: linkSchema.optional(),
});

const quoteEmbedProps = z.object({
  heading: z.string().max(160).default("Get an instant quote"),
  intro: z.string().max(400).default(""),
  /** QuoteQuick calculator token. Absent → the section is skipped entirely
   *  rather than rendering an empty box that looks broken. */
  calculator_token: z.string().max(120).optional(),
});

/* ── The discriminated section union ── */

export const siteSectionSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string().min(1).max(64), type: z.literal("hero"), props: heroProps }),
  z.object({ id: z.string().min(1).max(64), type: z.literal("services"), props: servicesProps }),
  z.object({ id: z.string().min(1).max(64), type: z.literal("features"), props: featuresProps }),
  z.object({ id: z.string().min(1).max(64), type: z.literal("steps"), props: stepsProps }),
  z.object({ id: z.string().min(1).max(64), type: z.literal("stats"), props: statsProps }),
  z.object({ id: z.string().min(1).max(64), type: z.literal("trust"), props: trustProps }),
  z.object({ id: z.string().min(1).max(64), type: z.literal("about"), props: aboutProps }),
  z.object({ id: z.string().min(1).max(64), type: z.literal("gallery"), props: galleryProps }),
  z.object({ id: z.string().min(1).max(64), type: z.literal("testimonials"), props: testimonialsProps }),
  z.object({ id: z.string().min(1).max(64), type: z.literal("faq"), props: faqProps }),
  z.object({ id: z.string().min(1).max(64), type: z.literal("hours"), props: hoursProps }),
  z.object({ id: z.string().min(1).max(64), type: z.literal("service_area"), props: serviceAreaProps }),
  z.object({ id: z.string().min(1).max(64), type: z.literal("contact"), props: contactProps }),
  z.object({ id: z.string().min(1).max(64), type: z.literal("cta"), props: ctaProps }),
  z.object({ id: z.string().min(1).max(64), type: z.literal("quote_embed"), props: quoteEmbedProps }),
]);

export type SiteSection = z.infer<typeof siteSectionSchema>;

/* ────────────────────────────────────────────────────────────────────────
 * Page + document
 * ──────────────────────────────────────────────────────────────────────── */

export const sitePageSchema = z.object({
  id: z.string().min(1).max(64),
  /** "" is the home page. Otherwise a URL-safe path segment. */
  slug: z.string().max(80).regex(/^$|^[a-z0-9][a-z0-9-]*$/, "Slug must be lowercase letters, numbers and hyphens"),
  title: z.string().min(1).max(160),
  nav_label: z.string().min(1).max(40),
  show_in_nav: z.boolean().default(true),
  meta_title: z.string().max(70).default(""),
  meta_description: z.string().max(180).default(""),
  sections: z.array(siteSectionSchema).max(24),
});

export type SitePage = z.infer<typeof sitePageSchema>;

/** Business facts. These drive the JSON-LD LocalBusiness block, the footer,
 *  the contact section and the header phone CTA. */
export const siteBusinessSchema = z.object({
  name: z.string().min(1).max(120),
  tagline: z.string().max(160).default(""),
  phone: z.string().max(40).default(""),
  email: z.string().max(160).default(""),
  street: z.string().max(160).default(""),
  city: z.string().max(80).default(""),
  region: z.string().max(80).default(""),
  postal_code: z.string().max(20).default(""),
  country: z.string().max(2).default("CA"),
  /** Free-form "Mon–Fri 8am–6pm" style lines; rendered verbatim. */
  hours: z.array(z.string().max(80)).max(7).default([]),
  service_areas: z.array(z.string().max(80)).max(60).default([]),
  /** Public profile links rendered in the footer. */
  social: z.array(linkSchema).max(6).default([]),
  /** Licence / registration numbers. Rendered only when supplied — we never
   *  invent a credential. */
  license_number: z.string().max(60).default(""),
  founded_year: z.string().max(4).default(""),
});

export type SiteBusiness = z.infer<typeof siteBusinessSchema>;

/**
 * Resolved brand. Populated from the real `brand_kits` row when one exists,
 * otherwise from `clients.metadata.content_brand` (the richer ContentFlow
 * `brandProfile` model), otherwise from the theme's own defaults.
 * See server/services/sitelaunch/brandResolver.ts.
 */
export const siteBrandSchema = z.object({
  /** Hex, `#rrggbb`. Empty string = fall back to the theme default. */
  primary: z.string().max(9).default(""),
  secondary: z.string().max(9).default(""),
  logo_url: z.string().max(1000).default(""),
  /** One of the renderer's font-stack keys — see FONT_STACKS in themes.ts. */
  heading_font: z.string().max(40).default(""),
  body_font: z.string().max(40).default(""),
  /** Provenance so the admin surface can say where the colours came from. */
  source: z.enum(["brand_kit", "content_brand", "manual", "theme_default"]).default("theme_default"),
  brand_kit_id: z.string().max(64).optional(),
});

export type SiteBrand = z.infer<typeof siteBrandSchema>;

export const SITE_DOCUMENT_VERSION = 1 as const;

export const siteDocumentSchema = z.object({
  version: z.literal(SITE_DOCUMENT_VERSION),
  theme_id: z.enum(SITELAUNCH_THEME_IDS),
  brand: siteBrandSchema,
  business: siteBusinessSchema,
  pages: z.array(sitePageSchema).min(1).max(12),
  footer_note: z.string().max(400).default(""),
  /** Renders the "Powered by WeFixTrades" badge. Mirrors the QuoteQuick
   *  white-label toggle (server/routes/portal/quotequick/brandSettings.ts). */
  show_powered_by: z.boolean().default(true),
});

export type SiteDocument = z.infer<typeof siteDocumentSchema>;

/* ────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────── */

/** Parse an untrusted stored blob into a document. Throws on invalid input —
 *  callers decide whether that is a 400 or a 500. */
export function parseSiteDocument(raw: unknown): SiteDocument {
  return siteDocumentSchema.parse(raw);
}

/** Non-throwing variant for read paths that must degrade rather than 500. */
export function safeParseSiteDocument(
  raw: unknown,
): { ok: true; doc: SiteDocument } | { ok: false; error: string } {
  const parsed = siteDocumentSchema.safeParse(raw);
  if (parsed.success) return { ok: true, doc: parsed.data };
  const first = parsed.error.issues[0];
  return {
    ok: false,
    error: first ? `${first.path.join(".") || "document"}: ${first.message}` : "Invalid site document",
  };
}

export function findPage(doc: SiteDocument, slug: string): SitePage | undefined {
  const wanted = (slug || "").replace(/^\/+|\/+$/g, "");
  return doc.pages.find((p) => p.slug === wanted);
}

export function homePage(doc: SiteDocument): SitePage {
  return findPage(doc, "") ?? doc.pages[0];
}

/** Pages in nav order, home first. */
export function navPages(doc: SiteDocument): SitePage[] {
  return doc.pages.filter((p) => p.show_in_nav);
}

/** Path a page is served at, relative to the site root. */
export function pagePath(page: SitePage): string {
  return page.slug ? `/${page.slug}` : "/";
}

/** Filename a page exports to inside the "you own it" ZIP. */
export function pageFilename(page: SitePage): string {
  return page.slug ? `${page.slug}.html` : "index.html";
}

let _idCounter = 0;
/** Stable-enough id for a newly created section/page. Not a security token. */
export function newNodeId(prefix: string): string {
  _idCounter = (_idCounter + 1) % 100000;
  return `${prefix}_${Date.now().toString(36)}${_idCounter.toString(36)}`;
}
