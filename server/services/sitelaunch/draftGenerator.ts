/**
 * SiteLaunch — intake → editable draft.
 *
 * THE SPLIT THAT MAKES THIS TRUSTWORTHY:
 *
 *   STRUCTURE IS CODE. The page plan, the section order per page, the
 *   heading hierarchy, the JSON-LD, the internal links — all deterministic
 *   and written here. The AI cannot add a page, add a section, reorder
 *   anything, or invent a layout.
 *
 *   AI FILLS SLOTS. One `chat()` call returns a JSON object of copy strings
 *   which are slotted into the structure. Every slot has a deterministic
 *   fallback, so a refused/failed/malformed AI response yields a complete,
 *   shippable draft rather than an error.
 *
 * NEVER AUTO-PUBLISHES. `generateDraft()` returns a document; the caller
 * persists it with status 'draft'. Publishing is a separate, explicit admin
 * action (server/routes/sitelaunchRoutes.ts).
 *
 * COST. Copy generation runs through `chat({ surface: "sitelaunch" })`, which
 * is already a registered AI surface with a $10/month cap
 * (server/services/aiSurfaces.ts: DEFAULT_BUDGET_CENTS.sitelaunch = 1000).
 * Exceeding the cap throws inside chat(); we catch it and fall back to
 * deterministic copy rather than failing the run.
 *
 * NO INVENTED FACTS. The prompt forbids claiming licences, certifications,
 * awards, years in business, guarantees, review counts or prices that the
 * intake did not supply, and every such field is dropped from the output
 * when the intake left it blank. `sanitiseCopy()` enforces it a second time
 * on the way back.
 */

import { chat } from "../aiService";
import { createLogger } from "../../lib/logger";
import { checkSiteLaunchGate } from "./gate";
import { buildHeroImagePrompt, generateBackgroundImage, customerPhotos } from "./imagePolicy";
import {
  SITE_DOCUMENT_VERSION,
  recommendedTheme,
  newNodeId,
  siteDocumentSchema,
  type SiteBrand,
  type SiteBusiness,
  type SiteDocument,
  type SiteImage,
  type SiteLaunchThemeId,
  type SitePage,
  type SiteSection,
} from "@shared/sitelaunch/document";

const log = createLogger("SiteLaunch:Draft");

/* ────────────────────────────────────────────────────────────────────────
 * Intake
 * ──────────────────────────────────────────────────────────────────────── */

export interface SiteLaunchIntake {
  business_name: string;
  trade_type?: string;
  tagline?: string;
  phone?: string;
  email?: string;
  street?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  country?: string;
  /** Service names the customer actually offers. Drives the services grid
   *  AND the per-service detail pages. */
  services?: string[];
  service_areas?: string[];
  hours?: string[];
  years_in_business?: string;
  license_number?: string;
  /** "friendly" | "straight-talking" | "premium" | ... — steers copy only. */
  tone?: string;
  unique_selling_points?: string;
  target_audience?: string;
  existing_site_url?: string;
  /** Customer-uploaded photos. The only source of portfolio imagery. */
  photos?: Array<{ url: string; alt?: string }>;
  /** QuoteQuick calculator token — powers the promised embed. */
  calculator_token?: string;
  /** FreeTools callback widget token — makes the contact form actually post. */
  callback_widget_token?: string;
  /** Admin override; otherwise derived from trade_type. */
  theme_id?: SiteLaunchThemeId;
  /** Opt-in. Default false: we do not spend on imagery unless asked. */
  allow_generated_hero?: boolean;
}

export interface GenerateDraftOptions {
  brand: SiteBrand;
  /** Skip the LLM entirely (used by the guard test and by "regenerate
   *  structure only"). */
  skipAi?: boolean;
}

export interface GenerateDraftResult {
  document: SiteDocument;
  /** True when AI copy was used; false when every slot came from the
   *  deterministic fallback. Surfaced in the admin UI so an operator knows
   *  what they are reviewing. */
  aiCopyUsed: boolean;
  /** Populated when the AI step was skipped or failed. Never swallowed. */
  aiError?: string;
  /** Every field the intake left blank that the copy would otherwise have
   *  filled. Shown to the operator as the "ask the customer for this" list. */
  missingFacts: string[];
}

/* ────────────────────────────────────────────────────────────────────────
 * Deterministic fallbacks
 * ──────────────────────────────────────────────────────────────────────── */

const ICON_BY_KEYWORD: Array<[RegExp, string]> = [
  [/plumb|drain|pipe|leak|water heater/i, "droplet"],
  [/electric|wiring|panel|lighting/i, "bolt"],
  [/heat|furnace|hvac|boiler|air condition|cooling/i, "flame"],
  [/roof|shingle|gutter|siding/i, "home"],
  [/clean|wash|maid|janitor/i, "brush"],
  [/paint|decorat/i, "brush"],
  [/landscap|lawn|garden|tree/i, "leaf"],
  [/haul|move|deliver|dispos/i, "truck"],
  [/floor|tile|carpet|deck/i, "ruler"],
  [/inspect|survey|assess|estimate|quote/i, "clock"],
  [/emergency|24|urgent|call/i, "phone"],
  [/warrant|guarant|insur|licen|safe/i, "shield"],
];

function iconFor(serviceName: string): string {
  for (const [re, key] of ICON_BY_KEYWORD) if (re.test(serviceName)) return key;
  return "wrench";
}

function locationPhrase(intake: SiteLaunchIntake): string {
  const parts = [intake.city, intake.region].filter(Boolean);
  return parts.join(", ");
}

/** Sentence-case a trade word for use at the start of a headline. */
function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Deterministic copy used when AI is unavailable, over budget, or refused.
 *  Deliberately plain and factual — it never claims anything the intake did
 *  not supply. */
function fallbackCopy(intake: SiteLaunchIntake) {
  const place = locationPhrase(intake);
  const trade = intake.trade_type || "home services";
  const tradeTitle = titleCase(trade);
  const name = intake.business_name;
  const inPlace = place ? ` in ${place}` : "";
  return {
    hero_headline: place ? `${tradeTitle} services${inPlace}` : `${tradeTitle} services you can rely on`,
    hero_subhead: `${name} handles ${trade.toLowerCase()} work${inPlace}. Call for a straight answer and a clear price.`,
    services_intro: "",
    about_heading: `About ${name}`,
    about_body: [
      `${name} provides ${trade.toLowerCase()} services${inPlace}.`,
      "Get in touch to talk through what you need and what it will cost.",
    ],
    cta_headline: "Ready to get started?",
    cta_subhead: place ? `Serving ${place} and the surrounding area.` : "",
    faq: [] as Array<{ question: string; answer: string }>,
    service_descriptions: {} as Record<string, string>,
    meta: {} as Record<string, { title: string; description: string }>,
  };
}

type Copy = ReturnType<typeof fallbackCopy>;

/* ────────────────────────────────────────────────────────────────────────
 * AI copy
 * ──────────────────────────────────────────────────────────────────────── */

function buildCopyPrompt(intake: SiteLaunchIntake): string {
  const facts: string[] = [`Business name: ${intake.business_name}`];
  if (intake.trade_type) facts.push(`Trade: ${intake.trade_type}`);
  if (intake.tagline) facts.push(`Tagline supplied by owner: ${intake.tagline}`);
  const place = locationPhrase(intake);
  if (place) facts.push(`Location: ${place}`);
  if (intake.service_areas?.length) facts.push(`Service areas: ${intake.service_areas.join(", ")}`);
  if (intake.services?.length) facts.push(`Services: ${intake.services.join(", ")}`);
  if (intake.years_in_business) facts.push(`Years in business: ${intake.years_in_business}`);
  if (intake.license_number) facts.push(`Licence number: ${intake.license_number}`);
  if (intake.unique_selling_points) facts.push(`What makes them different: ${intake.unique_selling_points}`);
  if (intake.target_audience) facts.push(`Customers they want: ${intake.target_audience}`);
  if (intake.tone) facts.push(`Preferred tone: ${intake.tone}`);

  const serviceList = (intake.services ?? []).slice(0, 8);

  return `You are writing website copy for a small trades business. Use ONLY the facts below.

FACTS
${facts.map((f) => `- ${f}`).join("\n")}

HARD RULES
- Never state a fact that is not in the list above. No invented years in business, licence
  numbers, certifications, awards, review counts, customer numbers, guarantees or prices.
- Never write "family owned", "award winning", "voted best", "trusted by thousands" or any
  similar claim unless it appears verbatim in the facts.
- No superlatives you cannot support ("the best", "number one", "unbeatable").
- Plain, direct sentences. Write the way a tradesperson talks, not like an agency.
- Canadian/US small-business English. No emoji. No exclamation marks.

Return ONLY a JSON object, no prose and no markdown fences, with exactly these keys:
{
  "hero_headline": "under 70 characters",
  "hero_subhead": "1-2 sentences, under 200 characters",
  "services_intro": "one sentence, may be an empty string",
  "about_heading": "under 60 characters",
  "about_body": ["2 to 3 paragraphs, each under 500 characters"],
  "cta_headline": "under 60 characters",
  "cta_subhead": "one short sentence",
  "faq": [{"question": "...", "answer": "..."}],
  "service_descriptions": { ${serviceList.map((s) => `"${s.replace(/"/g, "")}": "one or two sentences"`).join(", ")} }
}

Write 4 to 6 FAQ entries covering: what areas they cover, how to get a quote, how pricing
works, response times, and whether they handle emergencies — but ONLY answer with what the
facts support. If the facts do not support an answer, leave that question out entirely.`;
}

/** Phrases that assert a credential or social proof. Stripped when the
 *  intake did not supply the backing fact. Second line of defence behind the
 *  prompt rules. */
const UNSUPPORTED_CLAIM_PATTERNS: Array<{ re: RegExp; needs: keyof SiteLaunchIntake | null }> = [
  { re: /\baward[- ]winning\b/gi, needs: null },
  { re: /\bvoted (?:the )?best\b/gi, needs: null },
  { re: /\bnumber one\b/gi, needs: null },
  { re: /\b#1\b/g, needs: null },
  { re: /\btrusted by (?:thousands|hundreds|\d[\d,]*)\b/gi, needs: null },
  { re: /\b\d[\d,]*\+? (?:happy |satisfied )?customers\b/gi, needs: null },
  { re: /\b5[- ]star\b/gi, needs: null },
  { re: /\bfully licensed and insured\b/gi, needs: "license_number" },
  { re: /\blicensed and insured\b/gi, needs: "license_number" },
  { re: /\b\d+\+? years(?: of)? experience\b/gi, needs: "years_in_business" },
  { re: /\bover \d+ years\b/gi, needs: "years_in_business" },
];

function stripUnsupportedClaims(text: string, intake: SiteLaunchIntake): string {
  let out = text;
  for (const { re, needs } of UNSUPPORTED_CLAIM_PATTERNS) {
    if (needs && intake[needs]) continue; // the fact IS supplied — allow it
    out = out.replace(re, "");
  }
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,])/g, "$1").trim();
}

function asString(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max).trim() : "";
}

function sanitiseCopy(raw: unknown, intake: SiteLaunchIntake, fallback: Copy): Copy {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const clean = (v: unknown, max: number, fb: string) =>
    stripUnsupportedClaims(asString(v, max), intake) || fb;

  const bodyRaw = Array.isArray(r.about_body) ? r.about_body : [];
  const body = bodyRaw
    .map((p) => stripUnsupportedClaims(asString(p, 1200), intake))
    .filter(Boolean)
    .slice(0, 4);

  const faqRaw = Array.isArray(r.faq) ? r.faq : [];
  const faq = faqRaw
    .map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      return {
        question: stripUnsupportedClaims(asString(o.question, 240), intake),
        answer: stripUnsupportedClaims(asString(o.answer, 1200), intake),
      };
    })
    .filter((f) => f.question && f.answer)
    .slice(0, 8);

  const descRaw = (r.service_descriptions ?? {}) as Record<string, unknown>;
  const service_descriptions: Record<string, string> = {};
  for (const [key, value] of Object.entries(descRaw)) {
    const text = stripUnsupportedClaims(asString(value, 300), intake);
    if (text) service_descriptions[key] = text;
  }

  return {
    hero_headline: clean(r.hero_headline, 160, fallback.hero_headline),
    hero_subhead: clean(r.hero_subhead, 400, fallback.hero_subhead),
    services_intro: stripUnsupportedClaims(asString(r.services_intro, 400), intake),
    about_heading: clean(r.about_heading, 160, fallback.about_heading),
    about_body: body.length ? body : fallback.about_body,
    cta_headline: clean(r.cta_headline, 160, fallback.cta_headline),
    cta_subhead: stripUnsupportedClaims(asString(r.cta_subhead, 400), intake),
    faq,
    service_descriptions,
    meta: {},
  };
}

async function generateCopy(
  intake: SiteLaunchIntake,
  fallback: Copy,
): Promise<{ copy: Copy; used: boolean; error?: string }> {
  const gate = checkSiteLaunchGate();
  if (!gate.allowed) return { copy: fallback, used: false, error: gate.reason };

  let raw: string;
  try {
    raw = await chat({
      system: "You write plain, factual small-business website copy. Return only valid JSON.",
      messages: [{ role: "user", content: buildCopyPrompt(intake) }],
      maxTokens: 2400,
      surface: "sitelaunch",
    });
  } catch (err: any) {
    // Budget cap, circuit breaker, provider outage. Falling back to
    // deterministic copy is correct: the operator still gets a complete
    // draft, and the error is surfaced rather than swallowed.
    const message = err?.message || String(err);
    log.warn("copy generation failed — using deterministic fallback", { error: message });
    return { copy: fallback, used: false, error: message };
  }

  let parsed: unknown;
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    parsed = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned);
  } catch (err: any) {
    log.warn("copy JSON unparseable — using deterministic fallback", {
      error: err?.message || String(err),
    });
    return { copy: fallback, used: false, error: "AI returned unparseable JSON" };
  }

  return { copy: sanitiseCopy(parsed, intake, fallback), used: true };
}

/* ────────────────────────────────────────────────────────────────────────
 * The page plan — deterministic
 * ──────────────────────────────────────────────────────────────────────── */

function heroSection(intake: SiteLaunchIntake, copy: Copy, image: SiteImage | undefined): SiteSection {
  const credentials: string[] = [];
  // Credentials are echoed ONLY from supplied facts.
  if (intake.years_in_business) credentials.push(`${intake.years_in_business} years in business`);
  if (intake.license_number) credentials.push(`Licence ${intake.license_number}`);
  if (intake.service_areas?.length) credentials.push(`Serving ${intake.service_areas.slice(0, 2).join(" & ")}`);

  return {
    id: newNodeId("hero"),
    type: "hero",
    props: {
      eyebrow: locationPhrase(intake),
      headline: copy.hero_headline,
      subhead: copy.hero_subhead,
      primary_cta: intake.phone
        ? { label: `Call ${intake.phone}`, href: `tel:${intake.phone.replace(/[^\d+]/g, "")}` }
        : { label: "Get in touch", href: "contact" },
      secondary_cta: { label: "See our services", href: "services" },
      image,
      credentials: credentials.slice(0, 4),
    },
  };
}

function servicesSection(intake: SiteLaunchIntake, copy: Copy, heading: string): SiteSection | null {
  const services = (intake.services ?? []).filter(Boolean).slice(0, 12);
  if (!services.length) return null;
  return {
    id: newNodeId("services"),
    type: "services",
    props: {
      eyebrow: "",
      heading,
      intro: copy.services_intro,
      items: services.map((name) => ({
        title: name.slice(0, 80),
        description: (copy.service_descriptions[name] || "").slice(0, 300),
        icon: iconFor(name),
        price_from: undefined,
      })),
    },
  };
}

function trustSection(intake: SiteLaunchIntake): SiteSection | null {
  // Only verifiable, supplied facts become trust badges. No stock claims.
  const items: string[] = [];
  if (intake.license_number) items.push(`Licensed — ${intake.license_number}`);
  if (intake.years_in_business) items.push(`${intake.years_in_business} years in business`);
  if (intake.service_areas?.length) items.push(`${intake.service_areas.length} areas covered`);
  if (intake.services?.length) items.push(`${intake.services.length} services offered`);
  if (items.length < 2) return null;
  return { id: newNodeId("trust"), type: "trust", props: { heading: "", items: items.slice(0, 6) } };
}

function ctaSection(intake: SiteLaunchIntake, copy: Copy): SiteSection {
  return {
    id: newNodeId("cta"),
    type: "cta",
    props: {
      headline: copy.cta_headline,
      subhead: copy.cta_subhead,
      primary_cta: intake.phone
        ? { label: `Call ${intake.phone}`, href: `tel:${intake.phone.replace(/[^\d+]/g, "")}` }
        : { label: "Contact us", href: "contact" },
      secondary_cta: { label: "Contact form", href: "contact" },
    },
  };
}

function contactSection(intake: SiteLaunchIntake, heading: string): SiteSection {
  return {
    id: newNodeId("contact"),
    type: "contact",
    props: {
      heading,
      intro: "",
      show_phone: true,
      show_email: true,
      show_address: Boolean(intake.street || intake.city),
      callback_widget_token: intake.callback_widget_token,
    },
  };
}

function buildPages(intake: SiteLaunchIntake, copy: Copy, hero: SiteImage | undefined, photos: SiteImage[]): SitePage[] {
  const place = locationPhrase(intake);
  const name = intake.business_name;
  const services = (intake.services ?? []).filter(Boolean);
  const pages: SitePage[] = [];

  /* 1 — Home */
  const homeSections: SiteSection[] = [heroSection(intake, copy, hero)];
  const trust = trustSection(intake);
  if (trust) homeSections.push(trust);
  const homeServices = servicesSection(intake, copy, "What we do");
  if (homeServices) homeSections.push(homeServices);
  homeSections.push({
    id: newNodeId("steps"),
    type: "steps",
    props: {
      eyebrow: "",
      heading: "How it works",
      items: [
        { title: "Get in touch", description: "Call or send a message with what you need." },
        { title: "We take a look", description: "We assess the job and give you a clear price." },
        { title: "We do the work", description: "Booked in at a time that suits you." },
      ],
    },
  });
  if (photos.length >= 3) {
    homeSections.push({
      id: newNodeId("gallery"),
      type: "gallery",
      props: { heading: "Recent work", intro: "", images: photos.slice(0, 8) },
    });
  }
  if (intake.calculator_token) {
    homeSections.push({
      id: newNodeId("quote"),
      type: "quote_embed",
      props: {
        heading: "Get an instant quote",
        intro: "Answer a few questions and see a price straight away.",
        calculator_token: intake.calculator_token,
      },
    });
  }
  homeSections.push(ctaSection(intake, copy));

  pages.push({
    id: newNodeId("page"),
    slug: "",
    title: "Home",
    nav_label: "Home",
    show_in_nav: true,
    meta_title: `${name}${place ? ` | ${intake.trade_type || "Trades"} in ${place}` : ""}`.slice(0, 70),
    meta_description: copy.hero_subhead.slice(0, 180),
    sections: homeSections,
  });

  /* 2 — Services */
  if (services.length) {
    const sections: SiteSection[] = [];
    const s = servicesSection(intake, copy, "Our services");
    if (s) sections.push(s);
    sections.push({
      id: newNodeId("features"),
      type: "features",
      props: {
        eyebrow: "",
        heading: "What to expect",
        intro: "",
        items: [
          { title: "A clear price", description: "You know the cost before we start.", icon: "check" },
          { title: "Booked in properly", description: "A time slot that works for you.", icon: "clock" },
          { title: "Tidy finish", description: "We leave the place as we found it.", icon: "shield" },
        ],
      },
    });
    sections.push(ctaSection(intake, copy));
    pages.push({
      id: newNodeId("page"),
      slug: "services",
      title: "Services",
      nav_label: "Services",
      show_in_nav: true,
      meta_title: `Services | ${name}`.slice(0, 70),
      meta_description: `${services.slice(0, 4).join(", ")}${place ? ` in ${place}` : ""}.`.slice(0, 180),
      sections,
    });
  }

  /* 3 — About */
  pages.push({
    id: newNodeId("page"),
    slug: "about",
    title: "About",
    nav_label: "About",
    show_in_nav: true,
    meta_title: `About ${name}`.slice(0, 70),
    meta_description: (copy.about_body[0] || "").slice(0, 180),
    sections: [
      {
        id: newNodeId("about"),
        type: "about",
        props: {
          eyebrow: "",
          heading: copy.about_heading,
          body: copy.about_body,
          image: photos[0],
          bullets: [],
        },
      },
      ...(trust ? [trust] : []),
      ctaSection(intake, copy),
    ],
  });

  /* 4 — Service areas */
  if ((intake.service_areas ?? []).length) {
    pages.push({
      id: newNodeId("page"),
      slug: "service-areas",
      title: "Service areas",
      nav_label: "Areas",
      show_in_nav: true,
      meta_title: `Service areas | ${name}`.slice(0, 70),
      meta_description: `Areas covered by ${name}${place ? ` around ${place}` : ""}.`.slice(0, 180),
      sections: [
        {
          id: newNodeId("areas"),
          type: "service_area",
          props: { heading: "Areas we cover", intro: "", areas: intake.service_areas ?? [] },
        },
        ctaSection(intake, copy),
      ],
    });
  }

  /* 5 — Contact (+ hours + FAQ) */
  const contactSections: SiteSection[] = [contactSection(intake, "Get in touch")];
  if ((intake.hours ?? []).length) {
    contactSections.push({
      id: newNodeId("hours"),
      type: "hours",
      props: { heading: "Opening hours", note: "" },
    });
  }
  if (copy.faq.length) {
    contactSections.push({
      id: newNodeId("faq"),
      type: "faq",
      props: { heading: "Frequently asked questions", items: copy.faq },
    });
  }
  pages.push({
    id: newNodeId("page"),
    slug: "contact",
    title: "Contact",
    nav_label: "Contact",
    show_in_nav: true,
    meta_title: `Contact ${name}`.slice(0, 70),
    meta_description: `Call, email or send a message to ${name}${place ? ` in ${place}` : ""}.`.slice(0, 180),
    sections: contactSections,
  });

  /* 6-7 — Up to two individual service pages, so the site lands inside the
   * SKU's promised 5-7 pages (shared/pricing.ts: "5-7 page website"). */
  for (const service of services.slice(0, 2)) {
    if (pages.length >= 7) break;
    const slug = service
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    if (!slug || pages.some((p) => p.slug === slug)) continue;
    pages.push({
      id: newNodeId("page"),
      slug,
      title: service,
      nav_label: service.slice(0, 40),
      show_in_nav: false,
      meta_title: `${service}${place ? ` in ${place}` : ""} | ${name}`.slice(0, 70),
      meta_description: (copy.service_descriptions[service] || `${service} from ${name}.`).slice(0, 180),
      sections: [
        {
          id: newNodeId("hero"),
          type: "hero",
          props: {
            eyebrow: locationPhrase(intake),
            headline: service,
            subhead: copy.service_descriptions[service] || "",
            primary_cta: intake.phone
              ? { label: `Call ${intake.phone}`, href: `tel:${intake.phone.replace(/[^\d+]/g, "")}` }
              : { label: "Get in touch", href: "contact" },
            secondary_cta: { label: "All services", href: "services" },
            image: undefined,
            credentials: [],
          },
        },
        contactSection(intake, "Ask about " + service),
      ],
    });
  }

  return pages.slice(0, 12);
}

/* ────────────────────────────────────────────────────────────────────────
 * Entry point
 * ──────────────────────────────────────────────────────────────────────── */

/** Facts the intake did not supply that materially weaken the draft.
 *  Reported so an operator chases the customer instead of shipping thin. */
function collectMissingFacts(intake: SiteLaunchIntake): string[] {
  const missing: string[] = [];
  if (!intake.services?.length) missing.push("services offered");
  if (!intake.service_areas?.length) missing.push("service areas");
  if (!intake.phone) missing.push("phone number");
  if (!intake.email) missing.push("email address");
  if (!intake.hours?.length) missing.push("opening hours");
  if (!intake.photos?.length) missing.push("photos of completed work");
  if (!intake.years_in_business) missing.push("years in business");
  if (!intake.license_number) missing.push("licence / registration number");
  if (!intake.unique_selling_points) missing.push("what makes them different");
  return missing;
}

export async function generateDraft(
  intake: SiteLaunchIntake,
  options: GenerateDraftOptions,
): Promise<GenerateDraftResult> {
  const themeId = intake.theme_id ?? recommendedTheme(intake.trade_type);
  const fallback = fallbackCopy(intake);

  const { copy, used, error } = options.skipAi
    ? { copy: fallback, used: false, error: "AI copy skipped by caller" }
    : await generateCopy(intake, fallback);

  const photos = customerPhotos(intake.photos ?? []);

  // Hero imagery: customer photo first, always. A generated abstract only
  // when the operator explicitly opted in AND no customer photo exists.
  let hero: SiteImage | undefined = photos[0];
  if (!hero && intake.allow_generated_hero) {
    const prompt = buildHeroImagePrompt(intake.trade_type, "clean, professional, understated");
    const generated = await generateBackgroundImage(prompt, `${intake.business_name} background`);
    if (generated.ok && generated.image) hero = generated.image;
  }

  const business: SiteBusiness = {
    name: intake.business_name,
    tagline: intake.tagline ?? "",
    phone: intake.phone ?? "",
    email: intake.email ?? "",
    street: intake.street ?? "",
    city: intake.city ?? "",
    region: intake.region ?? "",
    postal_code: intake.postal_code ?? "",
    country: (intake.country ?? "CA").slice(0, 2).toUpperCase(),
    hours: (intake.hours ?? []).slice(0, 7),
    service_areas: (intake.service_areas ?? []).slice(0, 60),
    social: [],
    license_number: intake.license_number ?? "",
    founded_year: "",
  };

  const document: SiteDocument = siteDocumentSchema.parse({
    version: SITE_DOCUMENT_VERSION,
    theme_id: themeId,
    brand: options.brand,
    business,
    pages: buildPages(intake, copy, hero, photos),
    footer_note: "",
    show_powered_by: true,
  });

  return {
    document,
    aiCopyUsed: used,
    aiError: error,
    missingFacts: collectMissingFacts(intake),
  };
}
