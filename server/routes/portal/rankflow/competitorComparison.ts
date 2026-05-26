/**
 * Portal RankFlow Competitor Comparison — Wave 24.
 *
 * GET /api/portal/rankflow/competitor-comparison
 *  → returns side-by-side cards: for each tracked keyword, the customer's
 *    current rank position vs the top-ranking competitor pulled from the
 *    cached Wave 21 SerpAware brief.
 *
 * Source data:
 *  - rankflow_keywords         → the customer's tracked keywords
 *  - rankflow_rankings (latest)→ the customer's current position per keyword
 *  - serp_briefs.brief_json    → cached top-10 competitor pages per keyword
 *
 * The "Why?" expansion bundles:
 *  - competitor word count (avgWordCount from brief)
 *  - terms the competitor uses that aren't in the customer's top page
 *  - top-result title + URL of the leader
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import {
  rankflowKeywords,
  rankflowRankings,
  serpBriefs,
} from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalRankflowCompetitorComparison");

interface CompetitorCard {
  keywordId: number;
  keyword: string;
  yourPosition: number | null;
  previousPosition: number | null;
  topCompetitor: {
    position: number;
    title: string;
    url: string;
    headings: string[];
  } | null;
  rationale: {
    competitorWordCount: number;
    missingTerms: string[];
    commonHeadings: string[];
  } | null;
}

const EMPTY_RESPONSE: { previewMode: true; cards: CompetitorCard[] } = {
  previewMode: true,
  cards: [],
};

/** Pull the SerpBrief shape we care about from the raw jsonb blob. */
function normaliseBrief(raw: unknown): {
  topResults: Array<{ position: number; title: string; url: string; headings: string[] }>;
  avgWordCount: number;
  commonHeadingPatterns: string[];
  nlpTerms: Array<{ term: string; frequency: number; recommendedCount: number }>;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const top = Array.isArray(b.topResults) ? (b.topResults as any[]) : [];
  const nlp = Array.isArray(b.nlpTerms) ? (b.nlpTerms as any[]) : [];
  const headings = Array.isArray(b.commonHeadingPatterns)
    ? (b.commonHeadingPatterns as string[])
    : [];
  return {
    topResults: top.map((r) => ({
      position: Number(r?.position ?? 0),
      title: String(r?.title ?? ""),
      url: String(r?.url ?? ""),
      headings: Array.isArray(r?.headings) ? r.headings.map(String) : [],
    })),
    avgWordCount: Number(b.avgWordCount ?? 0),
    commonHeadingPatterns: headings,
    nlpTerms: nlp.map((t) => ({
      term: String(t?.term ?? ""),
      frequency: Number(t?.frequency ?? 0),
      recommendedCount: Number(t?.recommendedCount ?? 0),
    })),
  };
}

export function registerPortalRankflowCompetitorComparisonRoutes(app: Express) {
  app.get(
    "/api/portal/rankflow/competitor-comparison",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        const limit = Math.min(
          50,
          Math.max(1, Number(req.query.limit ?? 12) || 12),
        );

        /* ─── Customer's tracked keywords (top by priority) ──────────── */
        const keywords = await db
          .select()
          .from(rankflowKeywords)
          .where(eq(rankflowKeywords.client_id, clientId))
          .orderBy(rankflowKeywords.priority)
          .limit(limit);

        if (keywords.length === 0) {
          res.json({ cards: [] });
          return;
        }

        const cards: CompetitorCard[] = [];

        for (const kw of keywords) {
          /* Latest ranking for this keyword */
          const [latest] = await db
            .select()
            .from(rankflowRankings)
            .where(eq(rankflowRankings.keyword_id, kw.id))
            .orderBy(desc(rankflowRankings.checked_at))
            .limit(1);

          /* Cached SERP brief — most recent unexpired */
          const [briefRow] = await db
            .select()
            .from(serpBriefs)
            .where(
              and(
                eq(serpBriefs.keyword, kw.keyword),
                sql`expires_at > now()`,
              ),
            )
            .orderBy(desc(serpBriefs.built_at))
            .limit(1);

          const brief = briefRow ? normaliseBrief(briefRow.brief_json) : null;
          const top = brief?.topResults
            .filter((r) => r.position >= 1)
            .sort((a, b) => a.position - b.position)[0] ?? null;

          // Missing terms: high-frequency NLP terms (appears in ≥60% of
          // competitors) we surface as the "they have, you might not" list.
          const missingTerms =
            brief?.nlpTerms
              .filter((t) => t.frequency >= 0.6)
              .slice(0, 6)
              .map((t) => t.term) ?? [];

          cards.push({
            keywordId: kw.id,
            keyword: kw.keyword,
            yourPosition: latest?.position ?? null,
            previousPosition: latest?.previous_position ?? null,
            topCompetitor: top
              ? {
                  position: top.position,
                  title: top.title || top.url,
                  url: top.url,
                  headings: top.headings.slice(0, 4),
                }
              : null,
            rationale: brief
              ? {
                  competitorWordCount: brief.avgWordCount,
                  missingTerms,
                  commonHeadings: brief.commonHeadingPatterns.slice(0, 4),
                }
              : null,
          });
        }

        res.json({ cards });
      } catch (err: any) {
        log.error(
          "[portal/rankflow/competitor-comparison]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
