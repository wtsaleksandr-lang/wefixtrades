/**
 * SerpAwareGenerator — Topical map builder (Wave 21).
 *
 * Builds a hub-and-spoke topical map for a seed keyword by:
 *   1. Pulling SERP-adjacent signals (related searches via the Wave 6.5
 *      orchestrator's snippet text + heading clustering from the briefs we
 *      already cache).
 *   2. Asking a free-tier LLM (via humanizationOrchestrator's generic
 *      runner) to group the candidate keywords into 3-5 thematic clusters
 *      and propose article angles per cluster.
 *   3. Caching the result in `topical_maps` with a 1-week TTL.
 *
 * Used by the admin "Topic Planner" surface (Wave 22) to seed content
 * calendars. The brain doesn't depend on this module for the per-article
 * pipeline — it's purely a planning aid.
 */

import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../../../db";
import { topicalMaps } from "@shared/schemas/serpAwareGenerator";
import { searchSerp } from "../../../lib/serpOrchestrator";
import { runPromptViaOrchestrator } from "../humanizationOrchestrator";
import { createLogger } from "../../../lib/logger";

const log = createLogger("ContentFlow:SerpAwareGenerator:TopicalMap");

/* ─── Public types ──────────────────────────────────────────────────── */

export type TopicalCluster = {
  clusterName: string;
  centralKeyword: string;
  relatedKeywords: Array<{
    keyword: string;
    volume?: number;
    difficulty?: number;
  }>;
  contentIdeas: Array<{ title: string; angle: string }>;
};

const MAP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
const MAX_CLUSTERS = 5;
const MAX_IDEAS_PER_CLUSTER = 10;

export async function buildTopicalMap(input: {
  seedKeyword: string;
  location?: string | null;
  industryNiche?: string | null;
}): Promise<TopicalCluster[]> {
  const seed = (input.seedKeyword || "").trim();
  if (!seed) throw new Error("buildTopicalMap: seedKeyword is required");
  const location = input.location?.trim() || null;
  const niche = input.industryNiche?.trim() || null;

  // Cache hit?
  const cached = await loadCachedMap(seed, location, niche);
  if (cached) {
    log.info(`topical map cache hit for "${seed}"`);
    return cached;
  }

  // 1) Gather candidate keywords. We use SERP titles + snippets from the
  // top-30 (3 pages of 10) plus three obvious expansions of the seed.
  const candidateKeywords = await gatherCandidateKeywords(seed, location);

  if (candidateKeywords.length === 0) {
    log.warn(`no candidate keywords for "${seed}" — returning empty map`);
    return [];
  }

  // 2) Ask the LLM to cluster + suggest angles.
  const clusters = await llmClusterKeywords({
    seedKeyword: seed,
    location,
    industryNiche: niche,
    candidates: candidateKeywords,
  });

  // 3) Persist.
  await persistMap(seed, location, niche, clusters).catch((err) => {
    log.warn(`failed to persist topical map: ${err?.message || String(err)}`);
  });

  return clusters;
}

/* ─── Cache layer ───────────────────────────────────────────────────── */

async function loadCachedMap(
  seedKeyword: string,
  location: string | null,
  niche: string | null,
): Promise<TopicalCluster[] | null> {
  try {
    const rows = await db
      .select()
      .from(topicalMaps)
      .where(
        and(
          eq(topicalMaps.seed_keyword, seedKeyword),
          location ? eq(topicalMaps.location, location) : sql`${topicalMaps.location} IS NULL`,
          niche ? eq(topicalMaps.industry_niche, niche) : sql`${topicalMaps.industry_niche} IS NULL`,
          gt(topicalMaps.expires_at, new Date()),
        ),
      )
      .limit(1);
    if (rows.length === 0) return null;
    const raw = rows[0].map_json as any;
    if (!Array.isArray(raw)) return null;
    return raw as TopicalCluster[];
  } catch (err: any) {
    log.warn(`topical map cache read failed: ${err?.message || String(err)}`);
    return null;
  }
}

async function persistMap(
  seedKeyword: string,
  location: string | null,
  niche: string | null,
  clusters: TopicalCluster[],
): Promise<void> {
  const expires = new Date(Date.now() + MAP_TTL_MS);
  await db.insert(topicalMaps).values({
    seed_keyword: seedKeyword,
    location,
    industry_niche: niche,
    map_json: clusters as any,
    expires_at: expires,
  });
}

/* ─── Candidate keyword gathering ───────────────────────────────────── */

async function gatherCandidateKeywords(
  seed: string,
  location: string | null,
): Promise<string[]> {
  const collected = new Set<string>();
  collected.add(seed);

  try {
    const res = await searchSerp({
      query: seed,
      location: location ?? undefined,
      num: 10,
    });
    for (const r of res.organic ?? []) {
      // Take 2-4 word phrases from titles + snippets as candidate keywords.
      const text = `${r.title ?? ""} ${r.snippet ?? ""}`.toLowerCase();
      for (const phrase of extractPhrases(text)) {
        if (phrase.includes(seed.toLowerCase()) || lexicalOverlap(phrase, seed) >= 0.5) {
          collected.add(phrase);
        }
      }
    }
  } catch (err: any) {
    log.warn(`SERP fetch failed: ${err?.message || String(err)}`);
  }

  return Array.from(collected).slice(0, 60);
}

/** Pull 2-4 word phrases out of a blob, excluding stopword-only fragments. */
function extractPhrases(text: string): string[] {
  const out = new Set<string>();
  const cleaned = text.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = cleaned.split(" ").filter((t) => t.length > 1);
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const phrase = tokens.slice(i, i + n).join(" ");
      if (phrase.length >= 6) out.add(phrase);
    }
  }
  return Array.from(out);
}

function lexicalOverlap(a: string, b: string): number {
  const sa = new Set(a.split(" "));
  const sb = new Set(b.split(" "));
  let common = 0;
  for (const w of sa) if (sb.has(w)) common++;
  return common / Math.max(1, Math.min(sa.size, sb.size));
}

/* ─── LLM clustering ────────────────────────────────────────────────── */

async function llmClusterKeywords(input: {
  seedKeyword: string;
  location: string | null;
  industryNiche: string | null;
  candidates: string[];
}): Promise<TopicalCluster[]> {
  const system = [
    "You are a content strategist. Given a list of related search phrases,",
    `group them into ${MAX_CLUSTERS} or fewer thematic clusters, then propose`,
    `${MAX_IDEAS_PER_CLUSTER} or fewer article ideas per cluster.`,
    "",
    "Output JSON only, matching exactly this schema:",
    `{"clusters": [{"clusterName": "string", "centralKeyword": "string",`,
    `  "relatedKeywords": ["string", ...], "contentIdeas": [{"title": "string", "angle": "string"}, ...]}]}`,
    "",
    "No commentary, no markdown, no code fences. JSON only.",
  ].join("\n");

  const userLines: string[] = [];
  userLines.push(`Seed keyword: ${input.seedKeyword}`);
  if (input.location) userLines.push(`Service area: ${input.location}`);
  if (input.industryNiche) userLines.push(`Industry: ${input.industryNiche}`);
  userLines.push("");
  userLines.push("Candidate phrases:");
  input.candidates.forEach((c) => userLines.push(`- ${c}`));
  userLines.push("");
  userLines.push("Group them and propose ideas. JSON only.");

  const result = await runPromptViaOrchestrator({
    system,
    user: userLines.join("\n"),
    maxTokens: 1800,
    purpose: "serpaware.topicalMap",
  });

  if (result.noProviderSucceeded || !result.text) {
    log.info("no free provider succeeded for topical map — returning empty");
    return [];
  }

  return parseClustersOutput(result.text);
}

export function parseClustersOutput(raw: string): TopicalCluster[] {
  let text = (raw || "").trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return [];
  let parsed: any;
  try {
    parsed = JSON.parse(text.slice(first, last + 1));
  } catch {
    return [];
  }
  const list = Array.isArray(parsed?.clusters) ? parsed.clusters : [];
  const out: TopicalCluster[] = [];
  for (const c of list.slice(0, MAX_CLUSTERS)) {
    if (!c || typeof c.clusterName !== "string") continue;
    const relatedRaw = Array.isArray(c.relatedKeywords) ? c.relatedKeywords : [];
    const ideasRaw = Array.isArray(c.contentIdeas) ? c.contentIdeas : [];
    out.push({
      clusterName: String(c.clusterName).slice(0, 80),
      centralKeyword: String(c.centralKeyword ?? c.clusterName).slice(0, 80),
      relatedKeywords: relatedRaw
        .slice(0, 20)
        .map((k: any) =>
          typeof k === "string"
            ? { keyword: k }
            : { keyword: String(k?.keyword ?? "").slice(0, 80), volume: k?.volume, difficulty: k?.difficulty },
        )
        .filter((k: any) => k.keyword.length > 0),
      contentIdeas: ideasRaw
        .slice(0, MAX_IDEAS_PER_CLUSTER)
        .map((i: any) => ({
          title: String(i?.title ?? "").slice(0, 200),
          angle: String(i?.angle ?? "").slice(0, 400),
        }))
        .filter((i: any) => i.title.length > 0),
    });
  }
  return out;
}
