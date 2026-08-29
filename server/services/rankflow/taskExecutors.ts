/**
 * RankFlow task executors — the real work behind the monthly plan.
 *
 * ─── Why this file exists ────────────────────────────────────────────
 *
 * Until now `rankflowWorker.autoProcessAITasks()` "completed" every
 * `execution_mode: "ai"` task by writing one canned sentence:
 *
 *     `[AI-generated] Task "${title}" completed by AI engine.
 *      Content/output pending review.`
 *
 * …and moving on. No page was fetched, no title was rewritten, no schema
 * was generated, no link was proposed. On Starter ($349/mo) that stub
 * covered 12 of the 13 monthly tasks. Meanwhile `/products/rankflow`
 * promises "Each month we optimize pages, build listings, and improve
 * your local SEO" (client/src/config/products.ts) and the monthly email
 * reports "Shipped N optimization tasks" (server/services/rankflowReports.ts).
 *
 * Every executor here does real, verifiable work against the client's real
 * website and returns a real artifact. The honesty rules are absolute:
 *
 *   1. An executor NEVER reports work it did not do. If the input it needs
 *      is missing (no website, unreachable page, no NAP, no LLM provider),
 *      it returns `disposition: "needs_human"` with the concrete blocker —
 *      it does not emit a plausible-looking artifact.
 *
 *   2. An executor NEVER claims a change was applied to the customer's
 *      site. We have no write access to customer CMSes, so a generated
 *      title/schema/link-plan is a *recommendation*. Those return
 *      `disposition: "needs_implementation"` and the worker parks the task
 *      in `qa_review` rather than marking it done.
 *
 *   3. The only executor that is complete on delivery is `content_support`
 *      — the deliverable IS the brief, so nothing has to be applied to the
 *      site afterwards. It alone returns `deliverable_ready`.
 *
 *   4. Anything derived from a model is labelled as such, and anything we
 *      could not measure is stated as unmeasured rather than guessed.
 *
 * ─── Cost posture ────────────────────────────────────────────────────
 *
 * SERP: `content_support` is the only executor that touches the SERP
 * stack, and it deliberately does NOT pass `allowPaidProviders`. Per
 * PR #2057 the orchestrator is default-deny, so these calls are
 * structurally incapable of spending money — they use the free provider
 * pool (~5,500 queries/month) and, when it is exhausted, the brief is
 * still produced but explicitly says it carries no live SERP evidence.
 * Volume is tiny by construction: content_support is 1 task/month on
 * Starter and Growth, 2 on Pro, and each task issues at most
 * SERP_QUERIES_PER_BRIEF (3) queries.
 *
 * LLM: routed through `chat()` on the `rankflow_tasks` surface, so the
 * system-wide kill switch and the monthly spend cap both apply.
 */

import * as cheerio from "cheerio";
import type { RankflowProfile, RankflowTask } from "@shared/schema";
import { chat, NoAIProviderError } from "../aiService";
import { AI_SURFACES } from "../aiSurfaces";
import { searchSerp } from "../../lib/serpOrchestrator";
import { fetchWithTimeout } from "../fullAuditMaster/httpUtil";
import { createLogger } from "../../lib/logger";

const log = createLogger("RankflowTaskExecutors");

/* ─── Bounds ─────────────────────────────────────────────────────────
 * Every external-call count in this module is a named constant so the
 * per-task ceiling is auditable at a glance.
 */

/** Max SERP queries a single content_support brief may issue. Free tier only. */
export const SERP_QUERIES_PER_BRIEF = 3;
/** Max pages we will pull off a sitemap when building a link inventory. */
export const MAX_INVENTORY_PAGES = 40;
/** Max page fetches performed while titling the link inventory. */
export const MAX_INVENTORY_FETCHES = 12;
/** Hard ceiling on title / meta length, straight from the quality checklist. */
export const MAX_TITLE_CHARS = 60;
export const MAX_META_CHARS = 155;

const PAGE_FETCH_TIMEOUT_MS = 10_000;

/* ─── Types ──────────────────────────────────────────────────────────*/

/**
 * What the worker should do with the result.
 *
 *  - `deliverable_ready`    — the artifact IS the deliverable; nothing has
 *                             to happen on the customer's site. Eligible
 *                             for auto-approval once QA passes.
 *  - `needs_implementation` — real output was produced, but it still has to
 *                             be applied to the customer's website by a
 *                             human with CMS access. Parked in `qa_review`.
 *  - `needs_human`          — we could not do the work at all. The task is
 *                             handed to a human with the concrete blocker.
 *                             NOTHING is reported as completed.
 */
export type ExecutionDisposition =
  | "deliverable_ready"
  | "needs_implementation"
  | "needs_human";

export interface ExecutorProof {
  urls: string[];
  notes: string;
  word_count?: number;
}

export interface ExecutorOutcome {
  disposition: ExecutionDisposition;
  /** Proof written to rankflow_tasks.proof_data. Real content only. */
  proof: ExecutorProof;
  /** Structured deliverable merged into rankflow_tasks.metadata.artifact. */
  artifact: Record<string, unknown>;
  /** One-line human summary for logs and the admin queue. */
  summary: string;
  /** Populated only for needs_human — the concrete reason we could not act. */
  blocker?: string;
}

/* ─── Shared helpers ─────────────────────────────────────────────────*/

function humanBlocked(summary: string, blocker: string): ExecutorOutcome {
  return {
    disposition: "needs_human",
    proof: { urls: [], notes: "" },
    artifact: { blocked: true, blocker },
    summary,
    blocker,
  };
}

function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

/** Resolve the page this task targets: explicit metadata URL, else the site root. */
function targetUrlForTask(task: RankflowTask, profile: RankflowProfile): string | null {
  const meta = (task.metadata || {}) as Record<string, unknown>;
  return (
    normalizeUrl(typeof meta.target_url === "string" ? meta.target_url : null) ||
    normalizeUrl(profile.website_url)
  );
}

interface FetchedPage {
  url: string;
  status: number;
  html: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  bodyText: string;
  jsonLdBlocks: string[];
}

/**
 * Fetch and parse a real page. Returns null when the page cannot be read —
 * callers must treat that as "cannot do the work", never as "nothing to fix".
 */
async function fetchPage(url: string): Promise<FetchedPage | null> {
  const resp = await fetchWithTimeout(url, { timeoutMs: PAGE_FETCH_TIMEOUT_MS, redirect: "follow" });
  if (!resp || !resp.ok) return null;

  const contentType = resp.headers.get("content-type") || "";
  if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) return null;

  let html: string;
  try {
    html = await resp.text();
  } catch {
    return null;
  }
  if (!html || html.length < 50) return null;

  const $ = cheerio.load(html);
  const jsonLdBlocks: string[] = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    const raw = $(el).contents().text().trim();
    if (raw) jsonLdBlocks.push(raw);
  });

  $("script, style, noscript").remove();

  return {
    url,
    status: resp.status,
    html,
    title: $("title").first().text().trim() || null,
    metaDescription:
      $('meta[name="description"]').attr("content")?.trim() ||
      $('meta[property="og:description"]').attr("content")?.trim() ||
      null,
    h1: $("h1").first().text().trim() || null,
    bodyText: $("body").text().replace(/\s+/g, " ").trim().slice(0, 4000),
    jsonLdBlocks,
  };
}

/** Strip markdown fences and parse JSON — the house pattern for LLM output. */
function parseJsonFromModel(raw: string): unknown | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // Some providers wrap the object in prose. Take the outermost braces.
    const first = stripped.indexOf("{");
    const last = stripped.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(stripped.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function businessContext(profile: RankflowProfile, businessName: string): string {
  const services = asStringArray(profile.target_services);
  const locations = asStringArray(profile.target_locations);
  return [
    `Business name: ${businessName}`,
    `Trade / niche: ${profile.niche || "general trades"}`,
    `Primary location: ${profile.location || "not specified"}`,
    services.length ? `Services: ${services.join(", ")}` : null,
    locations.length ? `Service areas: ${locations.join(", ")}` : null,
    profile.website_url ? `Website: ${profile.website_url}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ─── 1. meta_fix ────────────────────────────────────────────────────
 * Promise: "Title & meta description optimization" (pricing.ts Starter).
 * Real work: fetch the live page, read its ACTUAL title + meta description,
 * generate an optimized replacement, and verify the length rules
 * programmatically. Output is a genuine before/after diff.
 * We cannot push it to the customer's CMS → needs_implementation.
 */
export async function executeMetaFix(
  task: RankflowTask,
  profile: RankflowProfile,
  businessName: string,
): Promise<ExecutorOutcome> {
  const url = targetUrlForTask(task, profile);
  if (!url) {
    return humanBlocked(
      "No website URL on the RankFlow profile — cannot audit a title tag.",
      "missing_website_url",
    );
  }

  const page = await fetchPage(url);
  if (!page) {
    return humanBlocked(
      `Could not fetch ${url} to read its current title and meta description.`,
      "page_unreachable",
    );
  }

  const meta = (task.metadata || {}) as Record<string, unknown>;
  const primaryKeyword =
    (typeof meta.primary_keyword === "string" && meta.primary_keyword) ||
    `${profile.niche || "services"} ${profile.location || ""}`.trim();

  const system = [
    "You are a local-SEO specialist rewriting one page's title tag and meta description.",
    "Return ONLY valid JSON. No markdown, no backticks, no explanation.",
    'Shape: {"title": string, "meta_description": string, "rationale": string}',
    `HARD RULES: title <= ${MAX_TITLE_CHARS} characters. meta_description <= ${MAX_META_CHARS} characters.`,
    "Title format: [Service] in [City] | [Business Name] — drop a segment if needed to fit.",
    "The meta description must read as a natural sentence and contain a call to action.",
    "Use the primary keyword ONCE in the title and naturally in the meta. Never keyword-stuff.",
    "Base the rewrite on the ACTUAL page content supplied. Do not invent services or locations.",
  ].join("\n");

  const user = [
    businessContext(profile, businessName),
    `Primary keyword: ${primaryKeyword}`,
    "",
    `Page URL: ${page.url}`,
    `Current title: ${page.title ?? "(none — the page has no title tag)"}`,
    `Current meta description: ${page.metaDescription ?? "(none — the page has no meta description)"}`,
    `Current H1: ${page.h1 ?? "(none)"}`,
    "",
    "Page content excerpt:",
    page.bodyText.slice(0, 1500),
  ].join("\n");

  let raw: string;
  try {
    raw = await chat({
      system,
      messages: [{ role: "user", content: user }],
      maxTokens: 500,
      surface: AI_SURFACES.rankflow_tasks,
    });
  } catch (err: any) {
    if (err instanceof NoAIProviderError) {
      return humanBlocked(
        "No AI provider configured — title/meta rewrite must be done by hand.",
        "no_ai_provider",
      );
    }
    return humanBlocked(
      `Title/meta rewrite failed: ${err?.message ?? "unknown error"}`,
      "llm_error",
    );
  }

  const parsed = parseJsonFromModel(raw) as
    | { title?: unknown; meta_description?: unknown; rationale?: unknown }
    | null;
  const newTitle = typeof parsed?.title === "string" ? parsed.title.trim() : "";
  const newMeta =
    typeof parsed?.meta_description === "string" ? parsed.meta_description.trim() : "";

  if (!newTitle || !newMeta) {
    return humanBlocked(
      "Model did not return a usable title/meta pair — needs a human rewrite.",
      "unparseable_model_output",
    );
  }

  // Verify the hard rules ourselves rather than trusting the model's claim.
  const violations: string[] = [];
  if (newTitle.length > MAX_TITLE_CHARS) {
    violations.push(`title is ${newTitle.length} chars (max ${MAX_TITLE_CHARS})`);
  }
  if (newMeta.length > MAX_META_CHARS) {
    violations.push(`meta is ${newMeta.length} chars (max ${MAX_META_CHARS})`);
  }
  if (violations.length > 0) {
    return humanBlocked(
      `Generated title/meta broke the length rules (${violations.join("; ")}) — needs a human rewrite.`,
      "length_rule_violation",
    );
  }

  const rationale =
    typeof parsed?.rationale === "string" && parsed.rationale.trim()
      ? parsed.rationale.trim()
      : "Rewritten for keyword placement, length, and a clear call to action.";

  const notes = [
    `Title & meta rewrite for ${page.url} (page fetched live, HTTP ${page.status}).`,
    "",
    "BEFORE",
    `  title: ${page.title ?? "(none)"}${page.title ? ` (${page.title.length} chars)` : ""}`,
    `  meta:  ${page.metaDescription ?? "(none)"}${page.metaDescription ? ` (${page.metaDescription.length} chars)` : ""}`,
    "",
    "AFTER (proposed — AI-generated, not yet applied to the site)",
    `  title: ${newTitle} (${newTitle.length} chars)`,
    `  meta:  ${newMeta} (${newMeta.length} chars)`,
    "",
    `Primary keyword targeted: ${primaryKeyword}`,
    `Rationale: ${rationale}`,
    "",
    "STATUS: recommendation ready. Not live — requires CMS access to apply.",
  ].join("\n");

  return {
    disposition: "needs_implementation",
    proof: { urls: [page.url], notes },
    artifact: {
      kind: "meta_rewrite",
      url: page.url,
      before: { title: page.title, meta_description: page.metaDescription },
      after: { title: newTitle, meta_description: newMeta },
      primary_keyword: primaryKeyword,
      rationale,
      generated_by: "ai",
      applied_to_site: false,
    },
    summary: `Title/meta rewrite generated for ${page.url} — awaiting implementation.`,
  };
}

/* ─── 2. schema_basic ────────────────────────────────────────────────
 * Promise: "Basic schema markup" (Growth) / "Advanced schema markup" (Pro).
 * Real work: build LocalBusiness + Service JSON-LD DETERMINISTICALLY from
 * the client record. Business facts (name, phone, URL, areas) are never
 * model-generated — a hallucinated phone number on a customer's live site
 * would be actively harmful. We then validate the block parses and carries
 * its required fields, and report what is already on the page.
 */
export interface SchemaBusinessFacts {
  businessName: string;
  phone?: string | null;
  websiteUrl?: string | null;
  tradeType?: string | null;
}

export function buildLocalBusinessJsonLd(
  facts: SchemaBusinessFacts,
  profile: RankflowProfile,
): { jsonLd: Record<string, unknown>; missing: string[] } {
  const services = asStringArray(profile.target_services);
  const areas = asStringArray(profile.target_locations);
  const primaryLocation = profile.location?.trim() || null;
  const areaServed = areas.length > 0 ? areas : primaryLocation ? [primaryLocation] : [];

  const missing: string[] = [];
  if (!facts.phone) missing.push("telephone");
  if (areaServed.length === 0) missing.push("areaServed");
  if (services.length === 0) missing.push("service list");

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: facts.businessName,
  };
  if (facts.websiteUrl) jsonLd.url = facts.websiteUrl;
  if (facts.phone) jsonLd.telephone = facts.phone;
  if (facts.tradeType || profile.niche) {
    jsonLd.description = `${facts.tradeType || profile.niche} services${
      primaryLocation ? ` in ${primaryLocation}` : ""
    }.`;
  }
  if (areaServed.length > 0) {
    jsonLd.areaServed = areaServed.map((a) => ({ "@type": "Place", name: a }));
  }
  if (services.length > 0) {
    jsonLd.hasOfferCatalog = {
      "@type": "OfferCatalog",
      name: `${facts.businessName} services`,
      itemListElement: services.map((s) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: s },
      })),
    };
  }

  return { jsonLd, missing };
}

export async function executeSchemaBasic(
  task: RankflowTask,
  profile: RankflowProfile,
  facts: SchemaBusinessFacts,
): Promise<ExecutorOutcome> {
  const url = targetUrlForTask(task, profile);
  if (!url) {
    return humanBlocked(
      "No website URL on the RankFlow profile — cannot target a page for schema.",
      "missing_website_url",
    );
  }
  if (!facts.businessName?.trim()) {
    return humanBlocked(
      "No business name on the client record — refusing to emit schema with invented identity.",
      "missing_business_name",
    );
  }

  const { jsonLd, missing } = buildLocalBusinessJsonLd(facts, profile);

  // A LocalBusiness block with nothing but a name is not worth shipping —
  // and inventing the rest is exactly what we must never do.
  if (missing.length >= 3) {
    return humanBlocked(
      `Not enough verified business data to build accurate schema (missing: ${missing.join(", ")}).`,
      "insufficient_business_data",
    );
  }

  const serialized = JSON.stringify(jsonLd, null, 2);
  // Validate our own output rather than asserting it is valid.
  try {
    const roundTripped = JSON.parse(serialized);
    if (!roundTripped["@context"] || !roundTripped["@type"] || !roundTripped.name) {
      return humanBlocked(
        "Generated JSON-LD failed its own required-field check.",
        "schema_validation_failed",
      );
    }
  } catch {
    return humanBlocked("Generated JSON-LD did not parse.", "schema_validation_failed");
  }

  const page = await fetchPage(url);
  const existingTypes: string[] = [];
  if (page) {
    for (const block of page.jsonLdBlocks) {
      try {
        const parsed = JSON.parse(block);
        const nodes = Array.isArray(parsed) ? parsed : [parsed];
        for (const n of nodes) {
          const t = n?.["@type"];
          if (typeof t === "string") existingTypes.push(t);
          else if (Array.isArray(t)) existingTypes.push(...t.filter((x) => typeof x === "string"));
        }
      } catch {
        existingTypes.push("(unparseable block)");
      }
    }
  }

  const notes = [
    `LocalBusiness + Service JSON-LD generated for ${url}.`,
    "",
    page
      ? `Page fetched live (HTTP ${page.status}). Existing JSON-LD on page: ${
          existingTypes.length > 0 ? existingTypes.join(", ") : "none found"
        }.`
      : `Page could not be fetched, so existing on-page schema was NOT checked. Verify no duplicate LocalBusiness block exists before adding this one.`,
    "",
    "Business name, telephone, URL and service areas are taken verbatim from the client record — no values were model-generated.",
    missing.length > 0
      ? `Fields omitted because we hold no verified value: ${missing.join(", ")}.`
      : "All supported fields populated from verified client data.",
    "",
    "JSON-LD to embed in the page <head>:",
    "",
    `<script type="application/ld+json">`,
    serialized,
    `</script>`,
    "",
    "STATUS: schema block ready. Not live — requires CMS access to apply, then validate with Google's Rich Results Test.",
  ].join("\n");

  return {
    disposition: "needs_implementation",
    proof: { urls: [url], notes },
    artifact: {
      kind: "json_ld_schema",
      url,
      json_ld: jsonLd,
      omitted_fields: missing,
      existing_on_page_types: page ? existingTypes : null,
      page_checked: Boolean(page),
      generated_by: "deterministic",
      applied_to_site: false,
    },
    summary: `LocalBusiness JSON-LD generated for ${url} — awaiting implementation.`,
  };
}

/* ─── 3. internal_linking ────────────────────────────────────────────
 * Promise: "Internal linking optimization" (Growth+).
 * Real work: discover the client's REAL pages from their sitemap (falling
 * back to crawling the homepage's own links), fetch titles for a bounded
 * subset, then have the model propose source → target pairs with anchor
 * text. Every proposed URL is validated against the discovered inventory,
 * so the plan can never reference a page that does not exist.
 */

/** Pull page URLs from a sitemap, following one level of sitemap-index nesting. */
async function discoverFromSitemap(origin: string): Promise<string[]> {
  const found = new Set<string>();

  async function readSitemap(sitemapUrl: string, depth: number): Promise<void> {
    if (depth > 1 || found.size >= MAX_INVENTORY_PAGES) return;
    const resp = await fetchWithTimeout(sitemapUrl, { timeoutMs: PAGE_FETCH_TIMEOUT_MS });
    if (!resp || !resp.ok) return;
    let xml: string;
    try {
      xml = await resp.text();
    } catch {
      return;
    }
    const $ = cheerio.load(xml, { xmlMode: true });

    const nested: string[] = [];
    $("sitemap > loc").each((_i, el) => {
      const loc = $(el).text().trim();
      if (loc) nested.push(loc);
    });
    $("url > loc").each((_i, el) => {
      const loc = normalizeUrl($(el).text().trim());
      if (loc && found.size < MAX_INVENTORY_PAGES) found.add(loc);
    });

    for (const n of nested.slice(0, 3)) {
      if (found.size >= MAX_INVENTORY_PAGES) break;
      await readSitemap(n, depth + 1);
    }
  }

  await readSitemap(new URL("/sitemap.xml", origin).toString(), 0);
  return [...found];
}

/** Fallback discovery: same-origin links on the homepage. */
async function discoverFromHomepage(origin: string, homepage: FetchedPage): Promise<string[]> {
  const $ = cheerio.load(homepage.html);
  const found = new Set<string>();
  const originHost = new URL(origin).host;

  $("a[href]").each((_i, el) => {
    if (found.size >= MAX_INVENTORY_PAGES) return;
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) return;
    try {
      const abs = new URL(href, origin);
      if (abs.host !== originHost) return;
      abs.hash = "";
      found.add(abs.toString());
    } catch {
      /* skip unparseable href */
    }
  });

  return [...found];
}

export async function executeInternalLinking(
  task: RankflowTask,
  profile: RankflowProfile,
  businessName: string,
): Promise<ExecutorOutcome> {
  const site = targetUrlForTask(task, profile);
  if (!site) {
    return humanBlocked(
      "No website URL on the RankFlow profile — cannot map internal links.",
      "missing_website_url",
    );
  }

  const origin = new URL(site).origin;
  const homepage = await fetchPage(origin);
  if (!homepage) {
    return humanBlocked(
      `Could not fetch ${origin} — cannot build a page inventory to link between.`,
      "site_unreachable",
    );
  }

  let inventoryUrls = await discoverFromSitemap(origin);
  let discoverySource: "sitemap" | "homepage_crawl" = "sitemap";
  if (inventoryUrls.length < 2) {
    inventoryUrls = await discoverFromHomepage(origin, homepage);
    discoverySource = "homepage_crawl";
  }

  if (inventoryUrls.length < 2) {
    return humanBlocked(
      `Only ${inventoryUrls.length} page(s) discovered on ${origin} — there is nothing to interlink yet.`,
      "insufficient_pages",
    );
  }

  // Title a bounded subset so the model reasons over real pages, not URLs alone.
  const toTitle = inventoryUrls.slice(0, MAX_INVENTORY_FETCHES);
  const inventory: Array<{ url: string; title: string | null }> = [];
  for (const u of toTitle) {
    const p = u === origin ? homepage : await fetchPage(u);
    inventory.push({ url: u, title: p?.title ?? null });
  }
  for (const u of inventoryUrls.slice(MAX_INVENTORY_FETCHES)) {
    inventory.push({ url: u, title: null });
  }

  const allowedUrls = new Set(inventory.map((p) => p.url));

  const system = [
    "You are a local-SEO specialist planning internal links for a trades website.",
    "Return ONLY valid JSON. No markdown, no backticks, no explanation.",
    'Shape: {"links": [{"from_url": string, "to_url": string, "anchor_text": string, "reason": string}]}',
    "CRITICAL: from_url and to_url MUST be copied verbatim from the supplied page inventory.",
    "Never invent a URL. If you cannot find a good pair, return fewer links or an empty array.",
    "Propose at most 3 links per source page. Anchor text must be descriptive and keyword-relevant.",
    "Never use generic anchors like 'click here', 'read more', or 'this page'.",
    "Only pair pages that are genuinely topically related.",
  ].join("\n");

  const user = [
    businessContext(profile, businessName),
    "",
    `Page inventory (discovered via ${discoverySource}; ${inventory.length} pages):`,
    ...inventory.map((p) => `- ${p.url}${p.title ? ` — "${p.title}"` : ""}`),
  ].join("\n");

  let raw: string;
  try {
    raw = await chat({
      system,
      messages: [{ role: "user", content: user }],
      maxTokens: 1200,
      surface: AI_SURFACES.rankflow_tasks,
    });
  } catch (err: any) {
    if (err instanceof NoAIProviderError) {
      return humanBlocked(
        "No AI provider configured — internal-link plan must be built by hand.",
        "no_ai_provider",
      );
    }
    return humanBlocked(
      `Internal-link planning failed: ${err?.message ?? "unknown error"}`,
      "llm_error",
    );
  }

  const parsed = parseJsonFromModel(raw) as { links?: unknown } | null;
  const rawLinks = Array.isArray(parsed?.links) ? parsed!.links : [];

  // Drop anything that references a page we did not actually discover.
  const validated: Array<{ from_url: string; to_url: string; anchor_text: string; reason: string }> =
    [];
  let rejectedInvented = 0;
  for (const l of rawLinks) {
    const link = l as Record<string, unknown>;
    const from = typeof link.from_url === "string" ? link.from_url.trim() : "";
    const to = typeof link.to_url === "string" ? link.to_url.trim() : "";
    const anchor = typeof link.anchor_text === "string" ? link.anchor_text.trim() : "";
    const reason = typeof link.reason === "string" ? link.reason.trim() : "";
    if (!from || !to || !anchor) continue;
    if (from === to) continue;
    if (!allowedUrls.has(from) || !allowedUrls.has(to)) {
      rejectedInvented++;
      continue;
    }
    if (/\b(click here|read more|this page|here)\b/i.test(anchor)) continue;
    validated.push({ from_url: from, to_url: to, anchor_text: anchor, reason });
  }

  if (validated.length === 0) {
    return humanBlocked(
      `No valid internal-link pairs could be produced for ${origin}${
        rejectedInvented > 0 ? ` (${rejectedInvented} proposal(s) referenced non-existent URLs and were rejected)` : ""
      }.`,
      "no_valid_link_pairs",
    );
  }

  const notes = [
    `Internal-link plan for ${origin}.`,
    `Page inventory: ${inventory.length} real page(s) discovered via ${discoverySource}; ${toTitle.length} fetched for titles.`,
    rejectedInvented > 0
      ? `${rejectedInvented} proposed link(s) were rejected for referencing URLs that do not exist on the site.`
      : "Every proposed URL was verified against the discovered page inventory.",
    "",
    `Proposed links (${validated.length}):`,
    ...validated.map(
      (l, i) =>
        `${i + 1}. ${l.from_url}\n   → ${l.to_url}\n   anchor: "${l.anchor_text}"\n   reason: ${l.reason || "topically related"}`,
    ),
    "",
    "STATUS: link plan ready. Not live — requires CMS access to apply.",
  ].join("\n");

  return {
    disposition: "needs_implementation",
    proof: { urls: [origin], notes },
    artifact: {
      kind: "internal_link_plan",
      site: origin,
      discovery_source: discoverySource,
      pages_discovered: inventory.length,
      links: validated,
      rejected_invented_urls: rejectedInvented,
      generated_by: "ai",
      applied_to_site: false,
    },
    summary: `${validated.length} internal link(s) planned for ${origin} — awaiting implementation.`,
  };
}

/* ─── 4. content_support ─────────────────────────────────────────────
 * Promise: "Monthly content recommendations" (Starter seed task list).
 * Real work: run a bounded set of FREE-TIER SERP queries for the client's
 * niche + location, capture what is actually ranking, and build a brief
 * grounded in that evidence. The brief IS the deliverable, so this is the
 * one executor that completes on delivery.
 *
 * When the free SERP pool is exhausted the brief is still produced, but it
 * says plainly that it carries no live SERP evidence. It never presents
 * unmeasured competitive data as measured.
 */

interface SerpEvidence {
  query: string;
  results: Array<{ position: number; title: string; link: string }>;
}

async function gatherSerpEvidence(
  profile: RankflowProfile,
): Promise<{ evidence: SerpEvidence[]; unavailableReason: string | null }> {
  const niche = profile.niche?.trim() || "";
  const location = profile.location?.trim() || "";
  const services = asStringArray(profile.target_services);

  const seeds: string[] = [];
  if (niche && location) seeds.push(`${niche} ${location}`);
  if (services[0] && location) seeds.push(`${services[0]} ${location}`);
  if (niche) seeds.push(`${niche} near me`);
  const queries = seeds.filter(Boolean).slice(0, SERP_QUERIES_PER_BRIEF);

  if (queries.length === 0) {
    return { evidence: [], unavailableReason: "no niche or location on the profile to search for" };
  }

  const evidence: SerpEvidence[] = [];
  let lastError: string | null = null;

  for (const query of queries) {
    try {
      // NOTE: no `allowPaidProviders` — this call is structurally incapable
      // of spending money. Free provider pool only (PR #2057 default-deny).
      const result = await searchSerp({
        query,
        location: location || undefined,
        engine: "google_web",
        num: 10,
      });
      evidence.push({
        query,
        results: result.organic.slice(0, 10).map((r) => ({
          position: r.position,
          title: r.title,
          link: r.link,
        })),
      });
    } catch (err: any) {
      lastError = err?.message ?? "SERP provider unavailable";
    }
  }

  if (evidence.length === 0) {
    return {
      evidence: [],
      unavailableReason: lastError || "no free-tier SERP provider had capacity",
    };
  }
  return { evidence, unavailableReason: null };
}

export async function executeContentSupport(
  _task: RankflowTask,
  profile: RankflowProfile,
  businessName: string,
): Promise<ExecutorOutcome> {
  const { evidence, unavailableReason } = await gatherSerpEvidence(profile);

  const evidenceBlock =
    evidence.length > 0
      ? evidence
          .map((e) =>
            [
              `Query: "${e.query}" — live Google results:`,
              ...e.results.map((r) => `  ${r.position}. ${r.title} (${r.link})`),
            ].join("\n"),
          )
          .join("\n\n")
      : `No live SERP data was available for this brief (${unavailableReason}).`;

  const system = [
    "You are a local-SEO strategist writing a monthly content brief for a trades business.",
    "Return ONLY valid JSON. No markdown, no backticks, no explanation.",
    'Shape: {"summary": string, "keyword_opportunities": [{"keyword": string, "intent": string, "why": string}], "page_ideas": [{"title": string, "page_type": string, "primary_keyword": string, "outline": [string]}], "notes": string}',
    "Ground every competitive observation in the supplied live search results.",
    evidence.length > 0
      ? "You MAY reference the ranking pages supplied. Do not invent competitors or rankings."
      : "NO live search results were supplied. Do NOT state or imply what currently ranks, who the competitors are, or what positions anyone holds. Base the brief only on the business profile, and say in `notes` that no live search data backed this brief.",
    "Give 4-6 keyword opportunities and 2-3 page ideas, each with a 4-6 point outline.",
    "Be specific to the trade and service area. No generic filler.",
  ].join("\n");

  const user = [
    businessContext(profile, businessName),
    "",
    "Live search evidence:",
    evidenceBlock,
  ].join("\n");

  let raw: string;
  try {
    raw = await chat({
      system,
      messages: [{ role: "user", content: user }],
      maxTokens: 2000,
      surface: AI_SURFACES.rankflow_tasks,
    });
  } catch (err: any) {
    if (err instanceof NoAIProviderError) {
      return humanBlocked(
        "No AI provider configured — the monthly content brief must be written by hand.",
        "no_ai_provider",
      );
    }
    return humanBlocked(
      `Content brief generation failed: ${err?.message ?? "unknown error"}`,
      "llm_error",
    );
  }

  const parsed = parseJsonFromModel(raw) as
    | {
        summary?: unknown;
        keyword_opportunities?: unknown;
        page_ideas?: unknown;
        notes?: unknown;
      }
    | null;

  const summary = typeof parsed?.summary === "string" ? parsed.summary.trim() : "";
  const keywords = Array.isArray(parsed?.keyword_opportunities)
    ? (parsed!.keyword_opportunities as Array<Record<string, unknown>>)
    : [];
  const pageIdeas = Array.isArray(parsed?.page_ideas)
    ? (parsed!.page_ideas as Array<Record<string, unknown>>)
    : [];

  if (!summary || keywords.length === 0 || pageIdeas.length === 0) {
    return humanBlocked(
      "Model did not return a usable content brief — needs a human strategist.",
      "unparseable_model_output",
    );
  }

  const provenance =
    evidence.length > 0
      ? `Grounded in ${evidence.length} live Google search(es) run on the free SERP tier: ${evidence
          .map((e) => `"${e.query}"`)
          .join(", ")}.`
      : `NO live search data backed this brief (${unavailableReason}). Keyword and competitor claims are therefore NOT measured — treat them as suggestions to validate.`;

  const notesBody = [
    `Monthly content brief for ${businessName}.`,
    provenance,
    "",
    "SUMMARY",
    summary,
    "",
    "KEYWORD OPPORTUNITIES",
    ...keywords.map((k, i) => {
      const kw = typeof k.keyword === "string" ? k.keyword : "(unnamed)";
      const intent = typeof k.intent === "string" ? k.intent : "unspecified intent";
      const why = typeof k.why === "string" ? k.why : "";
      return `${i + 1}. ${kw} — ${intent}${why ? `\n   ${why}` : ""}`;
    }),
    "",
    "PAGE IDEAS",
    ...pageIdeas.map((p, i) => {
      const title = typeof p.title === "string" ? p.title : "(untitled)";
      const pageType = typeof p.page_type === "string" ? p.page_type : "page";
      const primary = typeof p.primary_keyword === "string" ? p.primary_keyword : "";
      const outline = Array.isArray(p.outline)
        ? (p.outline as unknown[]).filter((o): o is string => typeof o === "string")
        : [];
      return [
        `${i + 1}. ${title} (${pageType})`,
        primary ? `   primary keyword: ${primary}` : null,
        ...outline.map((o) => `   - ${o}`),
      ]
        .filter(Boolean)
        .join("\n");
    }),
    typeof parsed?.notes === "string" && parsed.notes.trim()
      ? `\nNOTES\n${parsed.notes.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const wordCount = notesBody.split(/\s+/).filter(Boolean).length;

  return {
    disposition: "deliverable_ready",
    proof: { urls: [], notes: notesBody, word_count: wordCount },
    artifact: {
      kind: "content_brief",
      summary,
      keyword_opportunities: keywords,
      page_ideas: pageIdeas,
      serp_evidence: evidence,
      serp_backed: evidence.length > 0,
      serp_unavailable_reason: unavailableReason,
      paid_serp_providers_used: false,
      generated_by: "ai",
    },
    summary: `Content brief delivered${
      evidence.length > 0 ? ` (${evidence.length} live SERP queries)` : " (no live SERP evidence)"
    }.`,
  };
}

/* ─── Dispatcher ─────────────────────────────────────────────────────*/

export interface ExecutorContext {
  profile: RankflowProfile;
  businessName: string;
  phone?: string | null;
  websiteUrl?: string | null;
  tradeType?: string | null;
}

/** Task types this module can genuinely execute. */
export const EXECUTABLE_TASK_TYPES = [
  "meta_fix",
  "schema_basic",
  "internal_linking",
  "content_support",
] as const;

export function isExecutableTaskType(type: string): boolean {
  return (EXECUTABLE_TASK_TYPES as readonly string[]).includes(type);
}

/**
 * Run the real executor for a task. Returns null when this task type has no
 * automated executor — the caller must NOT then pretend it was done.
 */
export async function executeTask(
  task: RankflowTask,
  ctx: ExecutorContext,
): Promise<ExecutorOutcome | null> {
  const { profile, businessName } = ctx;
  try {
    switch (task.type) {
      case "meta_fix":
        return await executeMetaFix(task, profile, businessName);
      case "schema_basic":
        return await executeSchemaBasic(task, profile, {
          businessName,
          phone: ctx.phone ?? null,
          websiteUrl: ctx.websiteUrl ?? profile.website_url ?? null,
          tradeType: ctx.tradeType ?? null,
        });
      case "internal_linking":
        return await executeInternalLinking(task, profile, businessName);
      case "content_support":
        return await executeContentSupport(task, profile, businessName);
      default:
        return null;
    }
  } catch (err: any) {
    log.error(`[rankflow-executor] ${task.type} task ${task.id} threw`, {
      error: err?.message ?? String(err),
    });
    return humanBlocked(
      `Automated execution errored: ${err?.message ?? "unknown error"}`,
      "executor_exception",
    );
  }
}
