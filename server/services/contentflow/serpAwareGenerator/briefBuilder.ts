/**
 * SerpAwareGenerator — Brief builder (Wave 21).
 *
 * Builds a SERP-grounded SEO brief for a target keyword by:
 *   1. Pulling the top-10 organic results via the Wave 6.5 SERP orchestrator
 *      (free-tier rotation; cached).
 *   2. Fetching each result's HTML (5s timeout, 5MB cap) and extracting H1/
 *      H2/H3 headings + plain-text body via cheerio.
 *   3. Running pure-JS TF-IDF over the body texts to surface the n-grams
 *      (1-3 words) competitors use, and flagging the ones appearing in >50%
 *      of pages as "must-include" with a recommended frequency.
 *   4. Clustering competitor headings into common patterns.
 *   5. Persisting the result in `serp_briefs` with a 1-week TTL; subsequent
 *      same-keyword+location lookups hit the cache and bypass everything.
 *
 * No new npm deps. cheerio is already in package.json.
 */

import { eq, and, gt, sql } from "drizzle-orm";
import * as cheerio from "cheerio";
import { db } from "../../../db";
import { serpBriefs } from "@shared/schemas/serpAwareGenerator";
import { searchSerp } from "../../../lib/serpOrchestrator";
import { createLogger } from "../../../lib/logger";

const log = createLogger("ContentFlow:SerpAwareGenerator:BriefBuilder");

/* ─── Public types ──────────────────────────────────────────────────── */

export type SerpBriefResult = {
  position: number;
  title: string;
  url: string;
  snippet: string;
  headings: string[];
};

export type SerpBriefTerm = {
  term: string;
  /** % of top-10 pages that contain this term (0-1). */
  frequency: number;
  /** Recommended number of occurrences for the rewriter to target. */
  recommendedCount: number;
};

export type SerpBrief = {
  targetKeyword: string;
  location?: string | null;
  topResults: SerpBriefResult[];
  nlpTerms: SerpBriefTerm[];
  /** Average body word count across top-10. */
  avgWordCount: number;
  /** Heading text fragments that recur in >=40% of competitors. */
  commonHeadingPatterns: string[];
  /** Question-style headings/snippets (PAA-style). */
  topQuestions: string[];
  generatedAt: Date;
  /** Was this brief served from cache. Diagnostic only. */
  cached?: boolean;
};

/* ─── Constants ─────────────────────────────────────────────────────── */

const FETCH_TIMEOUT_MS = 5_000;
const MAX_CONTENT_BYTES = 5 * 1024 * 1024; // 5MB
const BRIEF_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
const MAX_TOP_RESULTS = 10;
const MAX_NGRAM = 3;
const MAX_NLP_TERMS = 40;
const MUST_INCLUDE_THRESHOLD = 0.5; // appears in >50% of competitors

// Small stop-word list. Pure JS; no external dep.
const STOP_WORDS = new Set<string>([
  "a","about","above","after","again","against","all","am","an","and","any","are","arent",
  "as","at","be","because","been","before","being","below","between","both","but","by",
  "cant","cannot","could","couldnt","did","didnt","do","does","doesnt","doing","dont",
  "down","during","each","few","for","from","further","had","hadnt","has","hasnt","have",
  "havent","having","he","hed","hell","hes","her","here","heres","hers","herself","him",
  "himself","his","how","hows","i","id","ill","im","ive","if","in","into","is","isnt",
  "it","its","its","itself","lets","me","more","most","mustnt","my","myself","no","nor",
  "not","of","off","on","once","only","or","other","ought","our","ours","ourselves","out",
  "over","own","same","shant","she","shed","shell","shes","should","shouldnt","so","some",
  "such","than","that","thats","the","their","theirs","them","themselves","then","there",
  "theres","these","they","theyd","theyll","theyre","theyve","this","those","through",
  "to","too","under","until","up","very","was","wasnt","we","wed","well","were","weve",
  "werent","what","whats","when","whens","where","wheres","which","while","who","whos",
  "whom","why","whys","with","wont","would","wouldnt","you","youd","youll","youre",
  "youve","your","yours","yourself","yourselves",
]);

/* ─── Public entry point ────────────────────────────────────────────── */

export async function buildBrief(input: {
  targetKeyword: string;
  location?: string | null;
  topicHint?: string | null;
}): Promise<SerpBrief> {
  const keyword = (input.targetKeyword || "").trim();
  if (!keyword) {
    throw new Error("buildBrief: targetKeyword is required");
  }
  const location = input.location?.trim() || null;

  // 1) Cache hit.
  const cached = await loadCachedBrief(keyword, location);
  if (cached) {
    log.info(`brief cache hit for "${keyword}" (location=${location ?? "n/a"})`);
    return { ...cached, cached: true };
  }

  // 2) Fetch SERP.
  let serpResults: Array<{ position: number; title: string; link: string; snippet?: string }> = [];
  try {
    const res = await searchSerp({
      query: keyword,
      location: location ?? undefined,
      num: MAX_TOP_RESULTS,
    });
    serpResults = (res.organic || []).slice(0, MAX_TOP_RESULTS);
  } catch (err: any) {
    log.warn(`SERP fetch failed for "${keyword}": ${err?.message || String(err)} — returning minimal brief`);
  }

  // 3) Fetch each page (in parallel) and extract structure.
  const enriched = await Promise.all(
    serpResults.map(async (r) => {
      const html = await safeFetchHtml(r.link);
      if (!html) {
        return {
          position: r.position,
          title: r.title || "",
          url: r.link,
          snippet: r.snippet || "",
          headings: [] as string[],
          bodyText: "",
          wordCount: 0,
        };
      }
      const parsed = extractStructure(html);
      return {
        position: r.position,
        title: r.title || parsed.h1 || "",
        url: r.link,
        snippet: r.snippet || "",
        headings: parsed.headings,
        bodyText: parsed.bodyText,
        wordCount: parsed.wordCount,
      };
    }),
  );

  // 4) Aggregate analysis.
  const topResults: SerpBriefResult[] = enriched.map((e) => ({
    position: e.position,
    title: e.title,
    url: e.url,
    snippet: e.snippet,
    headings: e.headings.slice(0, 30),
  }));

  const wordCounts = enriched.map((e) => e.wordCount).filter((n) => n > 50);
  const avgWordCount = wordCounts.length
    ? Math.round(wordCounts.reduce((s, n) => s + n, 0) / wordCounts.length)
    : 0;

  const nlpTerms = computeMustIncludeTerms(
    enriched.map((e) => e.bodyText),
    keyword,
  );

  const commonHeadingPatterns = clusterCommonHeadings(
    enriched.map((e) => e.headings),
  );

  const topQuestions = extractQuestions(enriched);

  const brief: SerpBrief = {
    targetKeyword: keyword,
    location,
    topResults,
    nlpTerms,
    avgWordCount,
    commonHeadingPatterns,
    topQuestions,
    generatedAt: new Date(),
  };

  // 5) Persist.
  await persistBrief(keyword, location, brief).catch((err) => {
    log.warn(`failed to persist brief for "${keyword}": ${err?.message || String(err)}`);
  });

  return brief;
}

/* ─── Cache layer ───────────────────────────────────────────────────── */

async function loadCachedBrief(
  keyword: string,
  location: string | null,
): Promise<SerpBrief | null> {
  try {
    const rows = await db
      .select()
      .from(serpBriefs)
      .where(
        and(
          eq(serpBriefs.keyword, keyword),
          location ? eq(serpBriefs.location, location) : sql`${serpBriefs.location} IS NULL`,
          gt(serpBriefs.expires_at, new Date()),
        ),
      )
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    const json = row.brief_json as any;
    return {
      ...json,
      generatedAt: new Date(json.generatedAt ?? row.built_at),
    } as SerpBrief;
  } catch (err: any) {
    log.warn(`brief cache read failed: ${err?.message || String(err)}`);
    return null;
  }
}

async function persistBrief(
  keyword: string,
  location: string | null,
  brief: SerpBrief,
): Promise<void> {
  const expires = new Date(Date.now() + BRIEF_TTL_MS);
  await db.insert(serpBriefs).values({
    keyword,
    location,
    brief_json: brief as any,
    expires_at: expires,
  });
}

/* ─── HTTP fetch with hard timeout + size cap ───────────────────────── */

async function safeFetchHtml(url: string): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; WeFixTradesBot/1.0; +https://wefixtrades.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("html")) return null;

    // Length guard: if server advertises a length, reject early.
    const cl = Number(res.headers.get("content-length") || 0);
    if (cl && cl > MAX_CONTENT_BYTES) return null;

    // Stream-read with a byte cap so we never load a gigantic page.
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return text.length > MAX_CONTENT_BYTES ? null : text;
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_CONTENT_BYTES) {
          try { await reader.cancel(); } catch {}
          return null;
        }
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ─── HTML → structure extraction ───────────────────────────────────── */

function extractStructure(html: string): {
  h1: string;
  headings: string[];
  bodyText: string;
  wordCount: number;
} {
  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch {
    return { h1: "", headings: [], bodyText: "", wordCount: 0 };
  }
  // Strip noisy elements before reading text.
  $("script, style, noscript, nav, footer, header, aside, iframe").remove();

  const h1 = ($("h1").first().text() || "").trim();
  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t && t.length <= 200) headings.push(t);
  });

  const bodyText = ($("body").text() || "").replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;
  return { h1, headings, bodyText, wordCount };
}

/* ─── TF-IDF (pure JS, ~50 LOC) ─────────────────────────────────────── */

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w.length > 2 && !STOP_WORDS.has(w));
}

function generateNgrams(tokens: string[], n: number): string[] {
  if (tokens.length < n) return [];
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

/**
 * For every page, compute counts for 1-, 2-, and 3-grams. Then:
 *   - documentFrequency[term] = number of pages containing the term at least once
 *   - totalCount[term] = sum of occurrences across all pages
 *
 * Return terms appearing in >=50% of pages, ranked by document-frequency
 * desc then totalCount desc, capped at MAX_NLP_TERMS.
 */
function computeMustIncludeTerms(
  bodyTexts: string[],
  targetKeyword: string,
): SerpBriefTerm[] {
  const pages = bodyTexts.filter((t) => t && t.length > 200);
  if (pages.length === 0) return [];

  const docFreq = new Map<string, number>();
  const totalCount = new Map<string, number>();

  for (const text of pages) {
    const tokens = tokenize(text);
    const seenThisDoc = new Set<string>();

    for (let n = 1; n <= MAX_NGRAM; n++) {
      const grams = generateNgrams(tokens, n);
      // Count occurrences inside this doc.
      const localCount = new Map<string, number>();
      for (const g of grams) {
        localCount.set(g, (localCount.get(g) ?? 0) + 1);
      }
      for (const [g, c] of localCount) {
        if (!seenThisDoc.has(g)) {
          docFreq.set(g, (docFreq.get(g) ?? 0) + 1);
          seenThisDoc.add(g);
        }
        totalCount.set(g, (totalCount.get(g) ?? 0) + c);
      }
    }
  }

  const minDocs = Math.ceil(pages.length * MUST_INCLUDE_THRESHOLD);
  const keywordNorm = targetKeyword.toLowerCase().trim();

  const candidates: SerpBriefTerm[] = [];
  for (const [term, df] of docFreq) {
    if (df < minDocs) continue;
    // Skip pure target-keyword fragments; that's a given.
    if (term === keywordNorm) continue;
    // Skip very short single tokens (already filtered by tokenize, but
    // double-check).
    if (term.length < 3) continue;
    const total = totalCount.get(term) ?? 0;
    const avgPerPage = total / pages.length;
    // Recommend roughly the per-page average, rounded, clamped 1-8.
    const recommendedCount = Math.max(1, Math.min(8, Math.round(avgPerPage)));
    candidates.push({
      term,
      frequency: df / pages.length,
      recommendedCount,
    });
  }

  // Rank: prefer higher doc-freq, then higher total count, then longer n-grams
  // (more specific phrases beat single words).
  candidates.sort((a, b) => {
    if (b.frequency !== a.frequency) return b.frequency - a.frequency;
    const ta = totalCount.get(a.term) ?? 0;
    const tb = totalCount.get(b.term) ?? 0;
    if (tb !== ta) return tb - ta;
    return b.term.length - a.term.length;
  });

  // Deduplicate near-overlaps: if "emergency plumbing services" is in, drop
  // "emergency plumbing" and "plumbing services" to keep the list useful.
  const deduped: SerpBriefTerm[] = [];
  for (const c of candidates) {
    const isSubsumed = deduped.some(
      (d) => d.term.includes(c.term) && d.term !== c.term,
    );
    if (!isSubsumed) deduped.push(c);
    if (deduped.length >= MAX_NLP_TERMS) break;
  }
  return deduped;
}

/* ─── Heading clustering ────────────────────────────────────────────── */

function clusterCommonHeadings(headingsPerPage: string[][]): string[] {
  const docFreq = new Map<string, number>();
  const pages = headingsPerPage.filter((h) => h.length > 0);
  if (pages.length === 0) return [];

  for (const pageHeadings of pages) {
    const seen = new Set<string>();
    for (const h of pageHeadings) {
      const norm = normalizeHeading(h);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      docFreq.set(norm, (docFreq.get(norm) ?? 0) + 1);
    }
  }

  const minDocs = Math.max(2, Math.ceil(pages.length * 0.4));
  return Array.from(docFreq.entries())
    .filter(([, c]) => c >= minDocs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([h]) => h);
}

function normalizeHeading(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ─── Question extraction (PAA-style) ───────────────────────────────── */

function extractQuestions(
  enriched: Array<{ headings: string[]; snippet: string }>,
): string[] {
  const out = new Set<string>();
  const qStarters = /^(what|why|how|when|where|who|which|can|do|does|is|are|should)\b/i;

  for (const e of enriched) {
    for (const h of e.headings) {
      if (h.endsWith("?") || qStarters.test(h.trim())) {
        const trimmed = h.trim();
        if (trimmed.length >= 8 && trimmed.length <= 150) {
          out.add(trimmed);
        }
      }
    }
    if (e.snippet && e.snippet.includes("?")) {
      const sentences = e.snippet.split(/[.?!]/);
      for (const s of sentences) {
        const t = s.trim();
        if (t.endsWith("?") || qStarters.test(t)) {
          if (t.length >= 8 && t.length <= 150) out.add(t + "?");
        }
      }
    }
  }

  return Array.from(out).slice(0, 12);
}
