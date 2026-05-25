/**
 * ContentFlow Phase 2 — AI-prefill workflow.
 *
 * Two cooperating helpers:
 *
 *   1. extractBusinessProfileFromUrl(url) — fetches a customer's website,
 *      extracts visible text + meta tags + JSON-LD, then asks Claude
 *      Haiku to return a structured business profile (business_name,
 *      services, service_area, target_persona, brand_voice_adjectives,
 *      usps, hero_testimonials, primary_trade, also_offers_trades).
 *
 *   2. prefillPromptTokens(template, profile) — for each {{placeholder}}
 *      in a prompt template, ask Claude Haiku to generate 4–6 plausible
 *      alternatives anchored to the customer's profile. Returns a
 *      PrefilledPrompt with selected + alternatives per token + a
 *      rendered preview string the UI displays.
 *
 * NO DB MIGRATION in Phase 2. The extra business profile fields land on
 * the existing `clients.metadata.content_brand` JSON column (see
 * brandProfile.ts) under stable keys; a Phase 5 migration promotes them
 * to proper columns once the prefill workflow has settled. Phase 2
 * keys persisted on content_brand (in addition to the existing
 * BrandProfile shape):
 *
 *   content_brand.business_name           string
 *   content_brand.year_founded            number | string
 *   content_brand.hero_testimonial        string  (single — first item
 *                                                  of hero_testimonials)
 *   content_brand.brand_voice_adjectives  string[]
 *   content_brand.target_persona          string
 *   content_brand.primary_trade           string
 *   content_brand.also_offers_trades      string[]
 *   content_brand.source_url              string  (where Step 1 fetched)
 *   content_brand.last_prefill_at         ISO timestamp
 *
 * These keys are *not* added to BrandProfile's sanitizer in this PR —
 * they piggyback on the same metadata column but are stored verbatim
 * by the route handler in contentflow.ts. The Phase 5 migration will
 * promote them and wire the sanitizer.
 */

import { generateContentflowText } from "./aiText";
import { interpolatePromptTemplate, type PromptVariables } from "@shared/contentflow/promptLibrary";
import { createLogger } from "../../lib/logger";

const log = createLogger("ContentFlow:ProfilePrefill");

/* ─── Types ────────────────────────────────────────────────────────── */

export interface ExtractedBusinessProfile {
  business_name?: string;
  services?: string[];
  service_area?: string;
  target_persona?: string;
  brand_voice_adjectives?: string[];
  usps?: string[];
  hero_testimonials?: { text: string; attribution?: string }[];
  primary_trade?: string;
  also_offers_trades?: string[];
  /** Raw extracted text snippets the model saw — useful for the UI to
   * show "this came from <meta description>" provenance, and for the
   * Step 1 endpoint to round-trip back to the client. */
  raw?: {
    title?: string;
    meta_description?: string;
    h1?: string;
    json_ld_org_name?: string;
    text_excerpt?: string;
  };
}

export interface PrefilledToken {
  /** The {{placeholder}} key, e.g. "businessName" / "city". */
  placeholder: keyof PromptVariables;
  /** Currently-selected value (string for display). */
  selected: string;
  /** 4–6 click-to-swap alternatives the AI proposed. Always includes
   * the `selected` value as one entry so the popover renders a coherent
   * radio group. */
  alternatives: string[];
}

export interface PrefilledPrompt {
  templateId: string;
  tokens: PrefilledToken[];
  /** Rendered template with current selections inlined. */
  rendered: string;
}

/* ─── Step 1: URL → structured profile ──────────────────────────────── */

/* Fetch is opinionated: max 12s, max 2 MB body. UAs that block headless
 * fetches show a small body; we still extract whatever meta we got. */
const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 2 * 1024 * 1024;
const UA = "Mozilla/5.0 (compatible; WeFixTradesBot/1.0; +https://wefixtrades.com)";

async function fetchWithLimits(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) {
      throw new Error(`fetch ${url} → HTTP ${res.status}`);
    }
    const reader = res.body?.getReader();
    if (!reader) {
      return await res.text();
    }
    let received = 0;
    const chunks: Uint8Array[] = [];
    /* eslint-disable no-constant-condition */
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BYTES) {
        try { await reader.cancel(); } catch { /* noop */ }
        break;
      }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return buf.toString("utf8");
  } finally {
    clearTimeout(timer);
  }
}

/** Minimal regex extraction — no DOM parser dependency. We pull
 * <title>, meta description, first <h1>, all visible-ish text, and the
 * first JSON-LD Organization block. Good enough for the AI to do the
 * semantic lift in Step 1 — and it keeps the dependency surface flat. */
export function extractWebsiteSignals(html: string): {
  title?: string;
  meta_description?: string;
  h1?: string;
  json_ld_org_name?: string;
  text: string;
} {
  const out: ReturnType<typeof extractWebsiteSignals> = { text: "" };

  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title) out.title = stripTags(title[1]).slice(0, 300);

  const desc = /<meta[^>]+name=["']description["'][^>]*content=["']([^"']{0,500})["']/i.exec(html);
  if (desc) out.meta_description = stripTags(desc[1]).slice(0, 500);

  const ogDesc = !out.meta_description
    ? /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']{0,500})["']/i.exec(html)
    : null;
  if (ogDesc) out.meta_description = stripTags(ogDesc[1]).slice(0, 500);

  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1) out.h1 = stripTags(h1[1]).slice(0, 200);

  /* JSON-LD: first <script type="application/ld+json"> with an Organization
   * or LocalBusiness @type. Hand-roll the JSON parse — many sites have
   * stray HTML entities inside. */
  const ldMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of ldMatches) {
    const raw = m[1].trim();
    try {
      const j = JSON.parse(raw);
      const nodes: any[] = Array.isArray(j) ? j : [j];
      for (const n of nodes) {
        const t = n?.["@type"];
        const ts = Array.isArray(t) ? t : [t];
        if (ts.some((x) => typeof x === "string" && /(?:LocalBusiness|Organization|Plumber|Electrician|HVAC|HomeAndConstructionBusiness)/i.test(x))) {
          if (typeof n.name === "string") {
            out.json_ld_org_name = n.name.slice(0, 200);
            break;
          }
        }
      }
      if (out.json_ld_org_name) break;
    } catch {
      /* Tolerate malformed JSON-LD. */
    }
  }

  /* Visible text: strip script/style/noscript blocks first, then tags,
   * then collapse whitespace. Cap at 12k chars so the prompt stays
   * cheap on Haiku. */
  let body = html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript\s*>/gi, " ");
  body = stripTags(body);
  body = body.replace(/\s+/g, " ").trim();
  out.text = body.slice(0, 12_000);

  return out;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const EXTRACT_SYSTEM = `You extract structured business profiles for trades businesses (plumbing, HVAC, electrical, roofing, landscaping, etc.) from a snapshot of their website.

Return ONLY a single JSON object. No prose, no markdown fences. Schema:

{
  "business_name": string,
  "services": string[],            // 3-8 concrete services
  "service_area": string,          // city or region, e.g. "Hamilton, Ontario"
  "target_persona": string,        // who they sell to in one phrase
  "brand_voice_adjectives": string[], // 3-5 adjectives for tone
  "usps": string[],                // 2-5 unique selling points (short phrases)
  "hero_testimonials": [{"text": string, "attribution": string}],  // 0-3
  "primary_trade": string,         // one of: plumbing, hvac, electrical, roofing, landscaping, general_contractor
  "also_offers_trades": string[]   // 0-4 additional trades from the same set
}

If a field is unknowable from the snapshot, omit it. Multi-trade businesses are common — capture all real trades they offer in also_offers_trades.`;

export async function extractBusinessProfileFromUrl(url: string): Promise<ExtractedBusinessProfile> {
  let html: string;
  try {
    html = await fetchWithLimits(url);
  } catch (err: any) {
    log.warn(`fetch failed for ${url}: ${err?.message || err}`);
    /* Still allow a best-effort extraction with no signals — the AI
     * call will return mostly-empty fields but the customer can edit. */
    html = "";
  }

  const signals = extractWebsiteSignals(html);
  const userPrompt = [
    `URL: ${url}`,
    signals.title ? `TITLE: ${signals.title}` : "",
    signals.meta_description ? `META_DESCRIPTION: ${signals.meta_description}` : "",
    signals.h1 ? `H1: ${signals.h1}` : "",
    signals.json_ld_org_name ? `JSON_LD_NAME: ${signals.json_ld_org_name}` : "",
    signals.text ? `VISIBLE_TEXT:\n${signals.text}` : "",
  ].filter(Boolean).join("\n\n");

  const result = await generateContentflowText({
    system: EXTRACT_SYSTEM,
    user: userPrompt || `URL: ${url}\n(no readable content fetched; infer from URL only)`,
    tier: "fast",
    maxTokens: 1200,
  });

  const parsed = safeJsonObject(result.text);
  const profile: ExtractedBusinessProfile = {
    business_name: pickString(parsed.business_name) ?? signals.json_ld_org_name ?? signals.title,
    services: pickStringArray(parsed.services, 8),
    service_area: pickString(parsed.service_area),
    target_persona: pickString(parsed.target_persona),
    brand_voice_adjectives: pickStringArray(parsed.brand_voice_adjectives, 5),
    usps: pickStringArray(parsed.usps, 5),
    hero_testimonials: pickTestimonials(parsed.hero_testimonials),
    primary_trade: pickString(parsed.primary_trade),
    also_offers_trades: pickStringArray(parsed.also_offers_trades, 4),
    raw: {
      title: signals.title,
      meta_description: signals.meta_description,
      h1: signals.h1,
      json_ld_org_name: signals.json_ld_org_name,
      text_excerpt: signals.text.slice(0, 600),
    },
  };
  return profile;
}

function safeJsonObject(text: string): Record<string, unknown> {
  if (!text) return {};
  /* Strip ``` fences and any leading prose before the first '{'. */
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return {};
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return {};
  }
}

function pickString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length > 0 ? s.slice(0, 300) : undefined;
}

function pickStringArray(v: unknown, max: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const item of v) {
    const s = pickString(item);
    if (s) out.push(s);
    if (out.length >= max) break;
  }
  return out.length > 0 ? out : undefined;
}

function pickTestimonials(v: unknown): { text: string; attribution?: string }[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: { text: string; attribution?: string }[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const text = pickString((item as any).text);
    if (!text) continue;
    const attribution = pickString((item as any).attribution);
    out.push(attribution ? { text, attribution } : { text });
    if (out.length >= 3) break;
  }
  return out.length > 0 ? out : undefined;
}

/* ─── Step 3: per-token alternative generation ──────────────────────── */

/** All placeholder keys the prompt library uses today, as defined by
 * PromptVariables in shared/contentflow/promptLibrary.ts. Listed
 * explicitly so the prefill engine can iterate even when a particular
 * template uses only a subset. */
const ALL_PLACEHOLDERS: readonly (keyof PromptVariables)[] = [
  "businessName",
  "city",
  "serviceUSP",
  "serviceFocus",
  "customerQuote",
  "brandPrimary",
  "brandSecondary",
  "tone",
  "audience",
  "yearFounded",
] as const;

const PLACEHOLDER_HUMAN_LABEL: Record<keyof PromptVariables, string> = {
  businessName: "Business name",
  city: "City / service area",
  serviceUSP: "Unique selling point",
  serviceFocus: "Service focus",
  customerQuote: "Customer testimonial",
  brandPrimary: "Primary brand color",
  brandSecondary: "Secondary brand color",
  tone: "Brand voice / tone",
  audience: "Target audience",
  yearFounded: "Year founded",
};

export function placeholdersInTemplate(template: string): (keyof PromptVariables)[] {
  const seen = new Set<string>();
  for (const m of template.matchAll(/{{\s*(\w+)\s*}}/g)) {
    seen.add(m[1]);
  }
  /* Filter to known keys only so we never try to generate alternatives
   * for a typo'd placeholder. */
  return ALL_PLACEHOLDERS.filter((k) => seen.has(k));
}

const ALTERNATIVES_SYSTEM = `You generate concise, on-brand alternatives for a single placeholder in a marketing prompt for a trades business.

You will receive:
  - The placeholder name (e.g. "serviceUSP", "city", "customerQuote")
  - A short business profile (JSON) — name, services, area, voice, USPs, testimonials, trades
  - The currently-selected value (may be empty)

Return ONLY a JSON object: {"alternatives": string[]}
  - 4 to 6 alternatives, each 1–14 words, NO surrounding quotes.
  - Anchored to the business profile when possible.
  - The currently-selected value should be one of the alternatives if it's non-empty (so the UI can render a coherent radio group).
  - For colors, use plausible hex codes (#RRGGBB) — never named colors.
  - For yearFounded, plausible years between 1985 and the current year.
  - For customerQuote, write as a real customer would write (no marketing-speak).
  - For tone, use one of: professional, friendly, premium, casual, plus 1-2 trade-natural alternatives like "no-nonsense", "warm".
  - NEVER fabricate licensing or guarantee claims.`;

interface ProfileForPrefill extends ExtractedBusinessProfile {
  /* Fields the customer may have already saved (current selections). */
  current?: Partial<Record<keyof PromptVariables, string>>;
}

/** Build the per-placeholder seed value from a saved BrandProfile-shape
 * object plus the extracted business profile. The route layer composes
 * this — exported here so a test can call it directly. */
export function defaultSelectionsFromProfile(
  profile: ExtractedBusinessProfile,
  current?: Partial<Record<keyof PromptVariables, string>>,
): Record<keyof PromptVariables, string> {
  const c = current ?? {};
  return {
    businessName: c.businessName ?? profile.business_name ?? "",
    city: c.city ?? (profile.service_area?.split(",")[0]?.trim() ?? ""),
    serviceUSP: c.serviceUSP ?? profile.usps?.[0] ?? "",
    serviceFocus: c.serviceFocus ?? profile.services?.[0] ?? "",
    customerQuote: c.customerQuote ?? profile.hero_testimonials?.[0]?.text ?? "",
    brandPrimary: c.brandPrimary ?? "",
    brandSecondary: c.brandSecondary ?? "",
    tone: c.tone ?? (profile.brand_voice_adjectives?.[0] ?? ""),
    audience: c.audience ?? profile.target_persona ?? "",
    yearFounded: c.yearFounded ?? "",
  };
}

async function generateAlternativesForToken(
  placeholder: keyof PromptVariables,
  selected: string,
  profile: ProfileForPrefill,
): Promise<string[]> {
  const profileForModel = {
    business_name: profile.business_name,
    services: profile.services,
    service_area: profile.service_area,
    target_persona: profile.target_persona,
    brand_voice_adjectives: profile.brand_voice_adjectives,
    usps: profile.usps,
    hero_testimonials: profile.hero_testimonials,
    primary_trade: profile.primary_trade,
    also_offers_trades: profile.also_offers_trades,
  };
  const user = `Placeholder: ${placeholder} (${PLACEHOLDER_HUMAN_LABEL[placeholder]})
Currently selected: ${JSON.stringify(selected)}
Business profile:
${JSON.stringify(profileForModel, null, 2)}`;

  const result = await generateContentflowText({
    system: ALTERNATIVES_SYSTEM,
    user,
    tier: "fast",
    maxTokens: 400,
  });
  const parsed = safeJsonObject(result.text);
  const alts = pickStringArray((parsed as any).alternatives, 6) ?? [];
  /* Guarantee the current selection appears so the radio group is
   * consistent with what's rendered in the live preview. */
  if (selected && !alts.includes(selected)) alts.unshift(selected);
  /* Backfill to a minimum of 4 with safe placeholders so the popover
   * always offers a real choice (rare — Haiku usually returns 5-6). */
  while (alts.length < 4) {
    alts.push(fallbackPlaceholder(placeholder, alts.length));
  }
  return alts.slice(0, 6);
}

function fallbackPlaceholder(p: keyof PromptVariables, i: number): string {
  switch (p) {
    case "tone":
      return ["professional", "friendly", "premium", "casual"][i] ?? "professional";
    case "brandPrimary":
      return ["#1F6FEB", "#0EA5E9", "#16A34A", "#F97316"][i] ?? "#1F6FEB";
    case "brandSecondary":
      return ["#0F172A", "#475569", "#E2E8F0", "#FACC15"][i] ?? "#0F172A";
    case "yearFounded":
      return String(2024 - i * 3);
    case "city":
      return ["your city", "your region", "your service area", "downtown"][i] ?? "your area";
    case "businessName":
      return ["Your Business", "Your Company", "Local Trades Co.", "[Business Name]"][i] ?? "[Business Name]";
    case "serviceFocus":
      return ["service call", "repair job", "maintenance visit", "install"][i] ?? "service call";
    case "serviceUSP":
      return ["fast, fair, no-surprise pricing", "same-day response", "locally owned & operated", "20-year guarantee"][i] ?? "trusted local pros";
    case "audience":
      return ["homeowners", "small business owners", "property managers", "landlords"][i] ?? "homeowners";
    case "customerQuote":
      return ["They showed up fast and fixed it right.", "Friendly crew, fair price.", "Saved us a huge headache.", "Will call them again."][i] ?? "Great service.";
  }
}

/**
 * For each placeholder in `template`, ask the AI for 4–6 alternatives
 * anchored to the customer's profile. Returns the full PrefilledPrompt
 * including a rendered preview using the current selections.
 *
 * Concurrency: token alternative generations run in parallel (capped by
 * Promise.all). Typical prompt has 4-8 distinct placeholders.
 */
export async function prefillPromptTokens(opts: {
  templateId: string;
  template: string;
  profile: ExtractedBusinessProfile;
  current?: Partial<Record<keyof PromptVariables, string>>;
}): Promise<PrefilledPrompt> {
  const placeholders = placeholdersInTemplate(opts.template);
  const defaults = defaultSelectionsFromProfile(opts.profile, opts.current);

  const tokenJobs = placeholders.map(async (p): Promise<PrefilledToken> => {
    const selected = defaults[p] || "";
    let alternatives: string[];
    try {
      alternatives = await generateAlternativesForToken(p, selected, opts.profile);
    } catch (err: any) {
      log.warn(`alternatives failed for ${p}: ${err?.message || err}`);
      alternatives = [selected || fallbackPlaceholder(p, 0), ...[0, 1, 2].map((i) => fallbackPlaceholder(p, i + 1))];
    }
    return {
      placeholder: p,
      selected: selected || alternatives[0],
      alternatives,
    };
  });
  const tokens = await Promise.all(tokenJobs);

  const vars: PromptVariables = {};
  for (const t of tokens) {
    (vars as Record<string, string>)[t.placeholder] = t.selected;
  }
  const rendered = interpolatePromptTemplate(opts.template, vars);
  return { templateId: opts.templateId, tokens, rendered };
}

/**
 * Rebuild the rendered preview when the customer swaps a chip — pure
 * function, no AI call. The PrefilledPrompt's tokens carry the new
 * selections; the route returns this so the live preview stays in sync.
 */
export function renderPrefilledPrompt(template: string, tokens: PrefilledToken[]): string {
  const vars: PromptVariables = {};
  for (const t of tokens) (vars as Record<string, string>)[t.placeholder] = t.selected;
  return interpolatePromptTemplate(template, vars);
}
