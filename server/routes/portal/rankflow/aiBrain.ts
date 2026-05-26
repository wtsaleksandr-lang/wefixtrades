/**
 * Portal RankFlow AI Brain — Wave 24.
 *
 * GET /api/portal/rankflow/ai-brain
 *   → returns AI recommendations with a reasoning chain. Each recommendation
 *     contains the decision in plain English, a bullet list of "why", source
 *     chips (Search Console / SerpAware / DataForSEO), and a 1-click action
 *     hook (target=requestContent w/ pre-filled topic + targetKeyword).
 *
 * POST /api/portal/rankflow/ai-brain/dispatch
 *   → fires the action by calling Wave 20 `requestContent()` for the chosen
 *     recommendation. Confirmation-gated: the client must POST explicitly;
 *     this never auto-fires.
 *
 * Source data:
 *  - rankflow_keywords + rankflow_rankings → underperformers
 *  - serp_briefs                          → topical opportunities (cached)
 *  - rankflow_signals + content_pipeline_log → "your page count vs leader"
 *
 * The recommendation is only included when its reasoning chain is FULLY
 * populated — never returns "AI is thinking" placeholders.
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
  rankflowSignals,
  rankflowPages,
  serpBriefs,
} from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";
import { requestContent } from "../../../services/contentflow/api";
import { writeAudit } from "../../../lib/auditLog";

const log = createLogger("PortalRankflowAiBrain");

type SourceChip = "search_console" | "serp_aware" | "data_for_seo";

interface BrainRecommendation {
  id: string;
  /** Plain-English decision the AI made. */
  decision: string;
  /** Bullet rationale (3-5 items). */
  reasoning: string[];
  /** Where each datapoint came from. */
  sources: SourceChip[];
  /** Optional 1-click action — when present the client renders a button. */
  action: {
    kind: "generate_article";
    label: string;
    topic: string;
    targetKeyword: string;
  } | null;
}

const EMPTY_RESPONSE: { previewMode: true; recommendations: BrainRecommendation[] } = {
  previewMode: true,
  recommendations: [],
};

interface SerpBriefNormalised {
  topResults: Array<{ position: number; title: string; url: string; headings: string[] }>;
  avgWordCount: number;
  commonHeadingPatterns: string[];
  topQuestions: string[];
  nlpTerms: Array<{ term: string; frequency: number; recommendedCount: number }>;
}

function normaliseBrief(raw: unknown): SerpBriefNormalised | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const top = Array.isArray(b.topResults) ? (b.topResults as any[]) : [];
  const nlp = Array.isArray(b.nlpTerms) ? (b.nlpTerms as any[]) : [];
  const headings = Array.isArray(b.commonHeadingPatterns)
    ? (b.commonHeadingPatterns as string[])
    : [];
  const questions = Array.isArray(b.topQuestions) ? (b.topQuestions as string[]) : [];
  return {
    topResults: top.map((r) => ({
      position: Number(r?.position ?? 0),
      title: String(r?.title ?? ""),
      url: String(r?.url ?? ""),
      headings: Array.isArray(r?.headings) ? r.headings.map(String) : [],
    })),
    avgWordCount: Number(b.avgWordCount ?? 0),
    commonHeadingPatterns: headings,
    topQuestions: questions,
    nlpTerms: nlp.map((t) => ({
      term: String(t?.term ?? ""),
      frequency: Number(t?.frequency ?? 0),
      recommendedCount: Number(t?.recommendedCount ?? 0),
    })),
  };
}

/**
 * Build recommendations from underperforming tracked keywords.
 * A keyword is "underperforming" when its position is >10 (off page 1).
 * Only emits a recommendation when its reasoning chain is fully populated.
 */
async function buildKeywordRecommendations(clientId: number): Promise<BrainRecommendation[]> {
  const keywords = await db
    .select()
    .from(rankflowKeywords)
    .where(eq(rankflowKeywords.client_id, clientId))
    .orderBy(rankflowKeywords.priority)
    .limit(20);

  if (keywords.length === 0) return [];

  const recs: BrainRecommendation[] = [];

  for (const kw of keywords) {
    const [latest] = await db
      .select()
      .from(rankflowRankings)
      .where(eq(rankflowRankings.keyword_id, kw.id))
      .orderBy(desc(rankflowRankings.checked_at))
      .limit(1);

    // Only consider keywords NOT in top 10 (or unranked)
    const position = latest?.position ?? null;
    if (position !== null && position <= 10) continue;

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
    // Skip recommendations whose reasoning would be incomplete.
    if (!brief || brief.topResults.length === 0) continue;

    const leader = brief.topResults
      .filter((r) => r.position >= 1)
      .sort((a, b) => a.position - b.position)[0];
    if (!leader) continue;

    const positionLabel =
      position == null ? "currently unranked" : `currently at #${position}`;
    const decision = `Write an article about "${kw.keyword}"`;

    const reasoning: string[] = [];
    reasoning.push(`Your page is ${positionLabel} for this keyword`);
    if (brief.avgWordCount > 0) {
      reasoning.push(
        `Top-10 competitors average ${brief.avgWordCount.toLocaleString()} words — match this length`,
      );
    }
    const highFreqTerms = brief.nlpTerms
      .filter((t) => t.frequency >= 0.6)
      .slice(0, 3)
      .map((t) => t.term);
    if (highFreqTerms.length > 0) {
      reasoning.push(
        `Competitors all use these terms: ${highFreqTerms.join(", ")}`,
      );
    }
    reasoning.push(`Leader at #${leader.position}: ${leader.title || leader.url}`);

    if (reasoning.length < 3) continue;

    recs.push({
      id: `kw-${kw.id}`,
      decision,
      reasoning,
      sources: ["serp_aware", "search_console"],
      action: {
        kind: "generate_article",
        label: "Generate article",
        topic: `${kw.keyword} — definitive guide`,
        targetKeyword: kw.keyword,
      },
    });

    if (recs.length >= 6) break;
  }

  return recs;
}

/**
 * One coverage-gap recommendation: when total pages indexed is < signals
 * suggest, surface that as a non-action insight.
 */
async function buildCoverageGapRecommendation(
  clientId: number,
): Promise<BrainRecommendation | null> {
  const [signals] = await db
    .select()
    .from(rankflowSignals)
    .where(eq(rankflowSignals.client_id, clientId))
    .limit(1);
  if (!signals) return null;

  const pageRows = await db
    .select({
      total: sql<number>`count(*)::int`,
      indexed: sql<number>`count(*) filter (where indexed = true)::int`,
    })
    .from(rankflowPages)
    .where(eq(rankflowPages.client_id, clientId));
  const total = Number(pageRows[0]?.total ?? 0);
  const indexed = Number(pageRows[0]?.indexed ?? 0);

  if (total === 0) return null;
  const indexRate = indexed / total;
  if (indexRate >= 0.85) return null;

  return {
    id: "coverage-gap",
    decision: `Resubmit ${total - indexed} pages to Google for indexing`,
    reasoning: [
      `Only ${indexed} of ${total} pages are indexed (${Math.round(indexRate * 100)}%)`,
      "Unindexed pages cannot rank — they contribute zero traffic",
      "Submitting via Search Console typically resolves within 7 days",
    ],
    sources: ["search_console"],
    action: null,
  };
}

export function registerPortalRankflowAiBrainRoutes(app: Express) {
  app.get(
    "/api/portal/rankflow/ai-brain",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        const keywordRecs = await buildKeywordRecommendations(clientId);
        const coverageRec = await buildCoverageGapRecommendation(clientId);
        const all: BrainRecommendation[] = [
          ...keywordRecs,
          ...(coverageRec ? [coverageRec] : []),
        ];

        res.json({ recommendations: all });
      } catch (err: any) {
        log.error("[portal/rankflow/ai-brain]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.post(
    "/api/portal/rankflow/ai-brain/dispatch",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: { ok: true, previewMode: true, requestId: null },
          mode: "write",
          action: "rankflow.ai_brain.dispatch",
        });
        if (clientId === null) return;

        const topic = String(req.body?.topic ?? "").trim();
        const targetKeyword = String(req.body?.targetKeyword ?? "").trim();
        if (!topic || !targetKeyword) {
          res
            .status(400)
            .json({ error: "topic and targetKeyword are required" });
          return;
        }

        const { requestId } = await requestContent({
          source: "rankflow",
          type: "article",
          clientId,
          topic,
          targetKeyword,
          metadata: { dispatched_from: "portal_ai_brain_panel" },
        });

        writeAudit({
          actorType: "user",
          action: "rankflow.ai_brain.dispatch",
          entityType: "content_request",
          entityId: requestId,
          metadata: { client_id: clientId, topic, targetKeyword },
        });

        res.json({ ok: true, requestId });
      } catch (err: any) {
        log.error(
          "[portal/rankflow/ai-brain/dispatch]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
