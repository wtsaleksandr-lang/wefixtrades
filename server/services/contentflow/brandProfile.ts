/**
 * ContentFlow Sprint 16 — brand profile service.
 *
 * Stores per-client brand asset metadata at clients.metadata.content_brand
 * (no schema migration). Used by image generation, social caption
 * generation, repurposer, and future video prompts to make AI output
 * look + sound like the client's actual business instead of generic.
 *
 * Shape:
 *   clients.metadata.content_brand = {
 *     primary_color, secondary_color: "#RRGGBB",
 *     style_keywords: string[]   ("clean", "modern", "local")
 *     tone: "professional" | "friendly" | "premium" | "casual",
 *     avoid: string[]             ("cartoon", "stock photo")
 *     location_cue: string        ("Hamilton, Ontario suburbs")
 *     service_focus: string[]     ("drain cleaning", "water heater")
 *     visual_style: string        ("realistic job-site photo")
 *     logo_url: string,
 *     reference_image_urls: string[],
 *     forbidden_claims: string[]  ("licensed", "same-day")
 *   }
 *
 * Backwards-compat: readBrandProfile() falls back to legacy
 * clients.metadata.image_brand for the visual fields, then to defaults.
 */

import { storage } from "../../storage";

/* ─── Types ──────────────────────────────────────────────────────────── */

export type Tone = "professional" | "friendly" | "premium" | "casual";

export interface BrandProfile {
  primary_color?: string;
  secondary_color?: string;
  style_keywords?: string[];
  tone?: Tone;
  avoid?: string[];
  location_cue?: string;
  service_focus?: string[];
  visual_style?: string;
  logo_url?: string;
  reference_image_urls?: string[];
  forbidden_claims?: string[];
  /* Sprint 17: content-aware onboarding fields */
  target_audience?: string;
  unique_selling_points?: string;
  preferred_topics?: string[];
}

/* Field allow-lists. Anything outside these sets is dropped at sanitize
 * time — no client (and arguably no admin either) gets to silently
 * inject arbitrary keys into clients.metadata.content_brand. */
const ADMIN_FIELDS: ReadonlyArray<keyof BrandProfile> = [
  "primary_color",
  "secondary_color",
  "style_keywords",
  "tone",
  "avoid",
  "location_cue",
  "service_focus",
  "visual_style",
  "logo_url",
  "reference_image_urls",
  "forbidden_claims",
  "target_audience",
  "unique_selling_points",
  "preferred_topics",
];
const CLIENT_FIELDS: ReadonlyArray<keyof BrandProfile> = [
  "tone",
  "style_keywords",
  "avoid",
  "location_cue",
  "service_focus",
  "visual_style",
  "reference_image_urls",
];

const VALID_TONES: ReadonlySet<Tone> = new Set([
  "professional", "friendly", "premium", "casual",
]);

/* Conservative caps so a malicious patch can't bloat metadata. */
const MAX_STRING_LEN = 300;
const MAX_LOCATION_LEN = 200;
const MAX_VISUAL_STYLE_LEN = 200;
const MAX_LOGO_URL_LEN = 500;
const MAX_LIST_ITEM_LEN = 80;
const MAX_LIST_LEN = 20;
const MAX_REF_URLS = 8;
const MAX_REF_URL_LEN = 1000;

/* ─── Sanitization ───────────────────────────────────────────────────── */

/** Strip HTML tags, javascript: prefix, control chars, then trim and
 * cap length. Returns null if the result is empty. */
function sanitizeString(input: unknown, maxLen: number): string | null {
  if (typeof input !== "string") return null;
  let s = input;
  /* Remove <script>...</script> blocks aggressively (case + multiline). */
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, "");
  /* Remove any remaining HTML/SGML tags (simple block, not a parser). */
  s = s.replace(/<[^>]*>/g, "");
  /* Defang javascript: / data: URI prefixes — leave the text but neuter. */
  s = s.replace(/javascript:/gi, "blocked:");
  s = s.replace(/data:\s*text\/html/gi, "blocked:text/html");
  /* Strip control characters except space / tab / LF. */
  s = s.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "");
  s = s.trim();
  if (s.length === 0) return null;
  if (s.length > maxLen) s = s.slice(0, maxLen).trim();
  return s;
}

function sanitizeColor(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  /* Accept #RGB, #RRGGBB, #RRGGBBAA — all hex. Reject everything else. */
  if (!/^#[0-9A-Fa-f]{3}$|^#[0-9A-Fa-f]{6}$|^#[0-9A-Fa-f]{8}$/.test(s)) return null;
  return s.toUpperCase();
}

function sanitizeUrl(input: unknown, maxLen: number): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (s.length === 0 || s.length > maxLen) return null;
  /* Only allow http(s). Reject anything that survived as `blocked:`. */
  if (!/^https?:\/\//i.test(s)) return null;
  /* Sanity: must contain at least one dot in the host. */
  try {
    const url = new URL(s);
    if (!url.hostname || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function sanitizeStringList(input: unknown, maxItemLen: number = MAX_LIST_ITEM_LEN): string[] | null {
  if (!Array.isArray(input)) return null;
  const out: string[] = [];
  for (const item of input.slice(0, MAX_LIST_LEN)) {
    const cleaned = sanitizeString(item, maxItemLen);
    if (cleaned !== null) out.push(cleaned);
  }
  return out;
}

function sanitizeUrlList(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const out: string[] = [];
  for (const item of input.slice(0, MAX_REF_URLS)) {
    const cleaned = sanitizeUrl(item, MAX_REF_URL_LEN);
    if (cleaned !== null) out.push(cleaned);
  }
  return out;
}

function sanitizeTone(input: unknown): Tone | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  return VALID_TONES.has(s as Tone) ? (s as Tone) : null;
}

/** Sanitize a brand profile patch.
 *
 *   mode='admin'  → all fields allowed
 *   mode='client' → only CLIENT_FIELDS (forbidden_claims, colors, logo
 *                   silently DROPPED, not echoed back as errors)
 *
 * Returns a partial BrandProfile with only valid fields. Invalid
 * single-field values become `undefined` (i.e. dropped). Invalid
 * top-level shape (non-object) returns {}.
 */
export function sanitizeBrandProfilePatch(
  input: unknown,
  mode: "admin" | "client",
): Partial<BrandProfile> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const allowed = new Set<string>(mode === "admin" ? ADMIN_FIELDS : CLIENT_FIELDS);
  const src = input as Record<string, unknown>;
  const out: Partial<BrandProfile> = {};

  for (const key of Object.keys(src)) {
    if (!allowed.has(key)) continue;
    const v = src[key];
    switch (key) {
      case "primary_color":
      case "secondary_color": {
        const c = sanitizeColor(v);
        if (c !== null) (out as any)[key] = c;
        break;
      }
      case "tone": {
        const t = sanitizeTone(v);
        if (t !== null) out.tone = t;
        break;
      }
      case "location_cue": {
        const s = sanitizeString(v, MAX_LOCATION_LEN);
        if (s !== null) out.location_cue = s;
        break;
      }
      case "visual_style": {
        const s = sanitizeString(v, MAX_VISUAL_STYLE_LEN);
        if (s !== null) out.visual_style = s;
        break;
      }
      case "logo_url": {
        const u = sanitizeUrl(v, MAX_LOGO_URL_LEN);
        if (u !== null) out.logo_url = u;
        break;
      }
      case "style_keywords":
      case "avoid":
      case "service_focus":
      case "forbidden_claims":
      case "preferred_topics": {
        const list = sanitizeStringList(v);
        if (list !== null) (out as any)[key] = list;
        break;
      }
      case "target_audience":
      case "unique_selling_points": {
        const s = sanitizeString(v, MAX_STRING_LEN);
        if (s !== null) (out as any)[key] = s;
        break;
      }
      case "reference_image_urls": {
        const list = sanitizeUrlList(v);
        if (list !== null) out.reference_image_urls = list;
        break;
      }
    }
  }
  return out;
}

/* ─── Read + merge ───────────────────────────────────────────────────── */

/** Read the brand profile from clients.metadata.content_brand, falling
 * back to legacy clients.metadata.image_brand for visual fields. */
export function readBrandProfile(client: { metadata?: unknown } | null | undefined): BrandProfile {
  const meta = ((client?.metadata as Record<string, any>) || {}) as Record<string, any>;
  const cb = (meta.content_brand && typeof meta.content_brand === "object" ? meta.content_brand : {}) as Record<string, any>;
  const ib = (meta.image_brand && typeof meta.image_brand === "object" ? meta.image_brand : {}) as Record<string, any>;

  /* Re-sanitize on read so a manually-poked metadata column can't
   * inject crap into prompt builders. */
  const merged: Record<string, unknown> = {
    primary_color: cb.primary_color ?? ib.primary_color,
    secondary_color: cb.secondary_color ?? ib.secondary_color,
    style_keywords: cb.style_keywords ?? ib.style_keywords,
    tone: cb.tone,
    avoid: cb.avoid ?? ib.avoid,
    location_cue: cb.location_cue ?? ib.location_cue,
    service_focus: cb.service_focus,
    visual_style: cb.visual_style,
    logo_url: cb.logo_url,
    reference_image_urls: cb.reference_image_urls,
    forbidden_claims: cb.forbidden_claims,
    target_audience: cb.target_audience,
    unique_selling_points: cb.unique_selling_points,
    preferred_topics: cb.preferred_topics,
  };
  return sanitizeBrandProfilePatch(merged, "admin");
}

/** Apply a sanitized patch to clients.metadata.content_brand and
 * persist via storage.updateClient. Preserves all unrelated metadata
 * keys and unchanged content_brand fields. */
export async function mergeBrandProfile(
  clientId: number,
  patch: Partial<BrandProfile>,
): Promise<BrandProfile> {
  const client = await storage.getClientById(clientId);
  if (!client) throw new Error(`client ${clientId} not found`);
  const meta = ((client.metadata as Record<string, any>) || {}) as Record<string, any>;
  const existing = (meta.content_brand && typeof meta.content_brand === "object"
    ? meta.content_brand
    : {}) as Record<string, any>;
  const next = { ...existing, ...patch };
  /* Drop keys explicitly set to null/undefined in the patch. */
  for (const k of Object.keys(patch)) {
    const v = (patch as any)[k];
    if (v === null || v === undefined) delete (next as Record<string, unknown>)[k];
  }
  const updatedMeta = { ...meta, content_brand: next };
  await storage.updateClient(clientId, { metadata: updatedMeta } as any);
  /* Re-read so callers see the sanitized + merged shape. */
  const fresh = await storage.getClientById(clientId);
  return readBrandProfile(fresh);
}

/* ─── Prompt helpers ─────────────────────────────────────────────────── */

/** Build a compact brand layer string for image-prompt or text-prompt
 * use. Returns "" if no fields are populated. */
export function buildBrandLayerText(brand: BrandProfile, tradeType?: string | null): string {
  const parts: string[] = [];
  if (tradeType) parts.push(`Trade: ${tradeType}.`);
  if (brand.location_cue) parts.push(`Setting cue: ${brand.location_cue}.`);
  if (brand.service_focus?.length) parts.push(`Service focus: ${brand.service_focus.join(", ")}.`);
  if (brand.tone) parts.push(`Brand tone: ${brand.tone}.`);
  if (brand.target_audience) parts.push(`Target audience: ${brand.target_audience}.`);
  if (brand.unique_selling_points) parts.push(`USPs: ${brand.unique_selling_points}.`);
  if (brand.preferred_topics?.length) parts.push(`Preferred topics: ${brand.preferred_topics.join(", ")}.`);
  if (brand.style_keywords?.length) parts.push(`Style: ${brand.style_keywords.join(", ")}.`);
  if (brand.visual_style) parts.push(`Visual style: ${brand.visual_style}.`);
  if (brand.primary_color) {
    const accents = [brand.primary_color];
    if (brand.secondary_color) accents.push(brand.secondary_color);
    parts.push(`Subtle brand accent colors (use sparingly, e.g. on tools, signage, or clothing): ${accents.join(", ")}.`);
  }
  if (brand.avoid?.length) parts.push(`Avoid: ${brand.avoid.join(", ")}.`);
  if (brand.forbidden_claims?.length) {
    parts.push(`Never claim: ${brand.forbidden_claims.join(", ")}.`);
  }
  return parts.join(" ");
}
