/**
 * Portal ContentFlow Dashboard routes — Wave 23.
 *
 * Mounted under /api/portal/contentflow/*. Auth: requireClient.
 *
 * Adds backend support for the customer-facing ContentFlow dashboard:
 *   GET    /api/portal/contentflow/dashboard-kpis
 *           → 4 KPI numbers + pipeline stage counts + recent items
 *   PATCH  /api/portal/contentflow/pipeline/:requestId
 *           → reschedule a pipeline item (writes scheduled_for into
 *             content_requests.result_payload)
 *   POST   /api/portal/contentflow/draft/:id/suggest
 *           → AI co-pilot — returns a rewritten draft for a given action
 *             (tighten_intro | add_cta | localize | match_voice). Uses
 *             the existing humanization orchestrator's free-tier providers
 *             first, falling back to paid (Claude).
 *
 * All endpoints use `adminPreviewSafe` so admin-preview mode returns
 * `{previewMode:true, ...zeros}` rather than 403.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, sql, inArray } from "drizzle-orm";
import { requireClient } from "../../auth";
import { storage } from "../../storage";
import { db } from "../../db";
import { contentRequests, contentDrafts } from "@shared/schema";
import { createLogger } from "../../lib/logger";
import { withClientIdOrPreview } from "../../middleware/adminPreviewSafe";
import { runPromptViaOrchestrator } from "../../services/contentflow/humanizationOrchestrator";
import { writeAudit } from "../../lib/auditLog";

const log = createLogger("PortalContentflowDashboard");

const SUGGEST_ACTIONS = ["tighten_intro", "add_cta", "localize", "match_voice"] as const;
type SuggestAction = (typeof SUGGEST_ACTIONS)[number];

const ARTICLE_QUOTA_BY_TIER: Record<string, number> = {
  free: 2,
  starter: 6,
  creator: 15,
  studio: 40,
  agency: 120,
};

const EMPTY_PIPELINE = {
  requested: 0,
  generating: 0,
  humanizing: 0,
  quality_check: 0,
  awaiting_approval: 0,
  approved: 0,
  published: 0,
};

const EMPTY_KPIS = {
  articlesThisMonth: 0,
  articlesQuota: 2,
  approvalRate: 0,
  detectionScore: 0,
  distributionReach: 0,
};

const EMPTY_DASHBOARD_RESPONSE = {
  previewMode: true,
  kpis: EMPTY_KPIS,
  pipeline: EMPTY_PIPELINE,
  recent: [] as Array<Record<string, unknown>>,
};

function startOfThisMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function thirtyDaysAgo(): Date {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

async function resolveTier(clientId: number): Promise<keyof typeof ARTICLE_QUOTA_BY_TIER> {
  try {
    const rows = await storage.listClientServices(clientId);
    const active = rows.filter((r) => r.status === "active" && r.enabled === true);
    const ids = new Set(active.map((r) => r.service_id));
    if (ids.has("contentflow-agency")) return "agency";
    if (ids.has("contentflow-studio")) return "studio";
    if (ids.has("contentflow-creator")) return "creator";
    if (ids.has("contentflow-starter")) return "starter";
    return "free";
  } catch {
    return "free";
  }
}

/** Map a content_drafts.metadata.{ai_detection|quality_notes}.aiScore (0..100, where higher = MORE
 *  AI-like) into a "human-likeness" score (higher = safer). */
function toHumanLikeness(aiScore: number | null | undefined): number | null {
  if (aiScore == null || Number.isNaN(aiScore)) return null;
  const clamped = Math.max(0, Math.min(100, aiScore));
  return Math.round(100 - clamped);
}

function readAiScoreFromDraft(draft: any): number | null {
  if (!draft) return null;
  const qn = draft.quality_notes as Record<string, any> | null;
  if (qn && typeof qn.aiScore === "number") return qn.aiScore;
  const meta = draft.metadata as Record<string, any> | null;
  if (meta && typeof meta.ai_detection?.aiScore === "number") return meta.ai_detection.aiScore;
  if (meta && typeof meta.detector?.aiScore === "number") return meta.detector.aiScore;
  return null;
}

function readThumbnailFromDraft(draft: any): string | null {
  const meta = (draft?.metadata as Record<string, any> | null) ?? null;
  if (!meta) return null;
  if (typeof meta.thumbnail_url === "string") return meta.thumbnail_url;
  if (typeof meta.hero_image_url === "string") return meta.hero_image_url;
  const imgs = meta.image_urls;
  if (Array.isArray(imgs) && imgs.length > 0 && typeof imgs[0] === "string") return imgs[0];
  return null;
}

function readTradeFromDraft(draft: any): string | null {
  const meta = (draft?.metadata as Record<string, any> | null) ?? null;
  if (!meta) return null;
  if (typeof meta.trade === "string") return meta.trade;
  if (typeof meta.trade_id === "string") return meta.trade_id;
  if (typeof meta.tradeline === "string") return meta.tradeline;
  return null;
}

function suggestionSystemPrompt(): string {
  return [
    "You are an editorial assistant for a home-trades content platform.",
    "Rewrite the user's draft per the requested action.",
    "Return ONLY the rewritten draft text — no preamble, no commentary, no code fences.",
    "Preserve the customer's tone, brand-safe language, and any factual claims.",
    "Do not invent new facts, prices, or guarantees.",
  ].join(" ");
}

function buildSuggestionPrompt(action: SuggestAction, draft: string, ctx: {
  city?: string | null;
  brandTone?: string | null;
  businessName?: string | null;
}): string {
  const city = ctx.city || "the customer's city";
  const tone = ctx.brandTone || "friendly, professional";
  const brand = ctx.businessName || "the business";

  switch (action) {
    case "tighten_intro":
      return [
        "ACTION: Tighten the introduction (the first 1-2 paragraphs).",
        "Cut filler, repetition, and weak hedges. Keep the rest of the draft unchanged.",
        "Return the full draft with only the intro rewritten.",
        "",
        "DRAFT:",
        draft,
      ].join("\n");
    case "add_cta":
      return [
        "ACTION: Add a single, persuasive call-to-action sentence at the end of the draft.",
        `The CTA should match a ${tone} tone and feel natural for ${brand}.`,
        "Do NOT invent prices or promotions. Generic urgency ('book a free quote', 'call today') is fine.",
        "Return the full draft with the CTA appended.",
        "",
        "DRAFT:",
        draft,
      ].join("\n");
    case "localize":
      return [
        `ACTION: Localize the draft for ${city}.`,
        "Sprinkle 2-4 light, natural references (climate, neighborhood feel, regional codes/seasons).",
        "Do not fabricate specific addresses, contractors, or statistics. Keep the structure intact.",
        "Return the full draft with the localizations woven in.",
        "",
        "DRAFT:",
        draft,
      ].join("\n");
    case "match_voice":
      return [
        `ACTION: Rewrite the draft to match the brand voice for ${brand}.`,
        `Target tone: ${tone}.`,
        "Preserve every factual claim. Preserve the structure (headings, lists, paragraph breaks).",
        "Return the full draft, rewritten in the target voice.",
        "",
        "DRAFT:",
        draft,
      ].join("\n");
  }
}

/**
 * Wave 26.6 — pure compute path for the ContentFlow dashboard KPIs. Extracted
 * from the route handler so the Copilot metricsContext can reuse it without
 * issuing an internal HTTP fetch (avoids re-auth, cookies, double rate-limit).
 *
 * Returns the same shape the route returns minus `previewMode`.
 */
export async function computeContentflowDashboardKpis(clientId: number) {
  const tier = await resolveTier(clientId);
  const articlesQuota = ARTICLE_QUOTA_BY_TIER[tier] ?? 2;

  const monthStart = startOfThisMonth();
  const since30 = thirtyDaysAgo();

  const stageRows = await db
    .select({
      stage: contentRequests.current_stage,
      n: sql<number>`count(*)::int`,
    })
    .from(contentRequests)
    .where(eq(contentRequests.client_id, clientId))
    .groupBy(contentRequests.current_stage);

  const pipeline = { ...EMPTY_PIPELINE };
  for (const row of stageRows) {
    const s = row.stage as keyof typeof pipeline;
    if (s in pipeline) pipeline[s] = Number(row.n) || 0;
  }

  const articlesRow = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contentDrafts)
    .where(
      and(
        eq(contentDrafts.client_id, clientId),
        eq(contentDrafts.kind, "article"),
        inArray(contentDrafts.status, ["approved", "published", "delivered"]),
        gte(contentDrafts.created_at, monthStart),
      ),
    );
  const articlesThisMonth = Number(articlesRow[0]?.n ?? 0);

  const approvedRow = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contentDrafts)
    .where(
      and(
        eq(contentDrafts.client_id, clientId),
        inArray(contentDrafts.status, ["approved", "published", "delivered"]),
        gte(contentDrafts.created_at, since30),
      ),
    );
  const rejectedRow = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contentDrafts)
    .where(
      and(
        eq(contentDrafts.client_id, clientId),
        eq(contentDrafts.status, "rejected"),
        gte(contentDrafts.created_at, since30),
      ),
    );
  const approvedCount = Number(approvedRow[0]?.n ?? 0);
  const rejectedCount = Number(rejectedRow[0]?.n ?? 0);
  const total = approvedCount + rejectedCount;
  const approvalRate = total === 0 ? 0 : Math.round((approvedCount / total) * 100);

  const detectorDrafts = await storage.listContentDrafts({
    client_id: clientId,
    limit: 200,
  });
  const within30 = detectorDrafts.filter((d: any) => {
    const t = d.created_at ? new Date(d.created_at).getTime() : 0;
    return t >= since30.getTime();
  });
  const humanScores = within30
    .map(readAiScoreFromDraft)
    .filter((n): n is number => n != null)
    .map((s) => Math.max(0, Math.min(100, 100 - s)));
  const detectionScore = humanScores.length === 0
    ? 0
    : Math.round(humanScores.reduce((a, b) => a + b, 0) / humanScores.length);

  const platformRows = await db
    .selectDistinct({ p: contentDrafts.target_platform })
    .from(contentDrafts)
    .where(
      and(
        eq(contentDrafts.client_id, clientId),
        inArray(contentDrafts.status, ["published", "delivered"]),
        gte(contentDrafts.created_at, since30),
      ),
    );
  const distributionReach = platformRows.filter((r) => !!r.p).length;

  const recentDrafts = await storage.listContentDrafts({
    client_id: clientId,
    limit: 8,
  });
  const recent = recentDrafts.map((d: any) => {
    const aiScore = readAiScoreFromDraft(d);
    return {
      id: d.id,
      title: (d.title as string | null) || (d.excerpt as string | null)?.slice(0, 80) || "(untitled)",
      thumbnailUrl: readThumbnailFromDraft(d),
      contentType: d.kind as string,
      status: d.status as string,
      trade: readTradeFromDraft(d),
      aiDetectionScore: toHumanLikeness(aiScore),
      createdAt: d.created_at ? new Date(d.created_at).toISOString() : new Date().toISOString(),
      scheduledFor: (d.metadata as any)?.scheduled_for ?? null,
    };
  });

  return {
    kpis: {
      articlesThisMonth,
      articlesQuota,
      approvalRate,
      detectionScore,
      distributionReach,
    },
    pipeline,
    recent,
  };
}

export function registerPortalContentflowDashboardRoutes(app: Express) {
  /**
   * GET /api/portal/contentflow/dashboard-kpis
   * Returns animated-gauge inputs + pipeline stage counts + recent cards.
   */
  app.get("/api/portal/contentflow/dashboard-kpis", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientIdOrPreview(req, res, {
        previewShape: EMPTY_DASHBOARD_RESPONSE,
      });
      if (!clientId) return;

      const payload = await computeContentflowDashboardKpis(clientId);
      res.json(payload);
    } catch (err: any) {
      log.error("[portal/contentflow/dashboard-kpis]", err?.message || err);
      res.status(500).json({ error: err?.message });
    }
  });

  /**
   * PATCH /api/portal/contentflow/pipeline/:requestId
   * Reschedule a content_requests entry. Writes scheduled_for into the
   * result_payload jsonb (no new column).
   */
  app.patch("/api/portal/contentflow/pipeline/:requestId", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientIdOrPreview(req, res, {
        previewShape: { ok: true, persisted: false, previewMode: true },
        mode: "write",
        action: "contentflow.pipeline.reschedule",
      });
      if (!clientId) return;

      const requestId = String(req.params.requestId ?? "");
      const scheduledFor = (req.body?.scheduled_for as string | undefined) ?? undefined;
      if (!requestId || !scheduledFor) {
        res.status(400).json({ error: "requestId and scheduled_for are required" });
        return;
      }
      const newDate = new Date(scheduledFor);
      if (Number.isNaN(newDate.getTime())) {
        res.status(400).json({ error: "scheduled_for must be a valid ISO date" });
        return;
      }

      const [row] = await db
        .select()
        .from(contentRequests)
        .where(
          and(
            eq(contentRequests.request_id, requestId),
            eq(contentRequests.client_id, clientId),
          ),
        )
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      const existingPayload = (row.result_payload as Record<string, unknown> | null) ?? {};
      const nextPayload = { ...existingPayload, scheduled_for: newDate.toISOString() };
      await db
        .update(contentRequests)
        .set({ result_payload: nextPayload as any, updated_at: new Date() } as any)
        .where(eq(contentRequests.request_id, requestId));

      writeAudit({
        actorType: "user",
        action: "contentflow.pipeline.reschedule",
        entityType: "content_request",
        entityId: requestId,
        metadata: { client_id: clientId, scheduled_for: newDate.toISOString() },
      });

      res.json({ ok: true, requestId, scheduled_for: newDate.toISOString() });
    } catch (err: any) {
      log.error("[portal/contentflow/pipeline/:requestId]", err?.message || err);
      res.status(500).json({ error: err?.message });
    }
  });

  /**
   * POST /api/portal/contentflow/draft/:id/suggest
   * AI co-pilot suggestion. Body: { action: "tighten_intro" | "add_cta" | "localize" | "match_voice" }
   * Returns: { ok, action, original, suggestion, providerUsed }
   * Never persists — the client decides whether to accept via AIDraftEditor.
   */
  app.post("/api/portal/contentflow/draft/:id/suggest", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientIdOrPreview(req, res, {
        previewShape: {
          ok: true,
          previewMode: true,
          suggestion: "",
          original: "",
          action: req.body?.action,
        },
        mode: "write",
        action: "contentflow.draft.suggest",
      });
      if (!clientId) return;

      const draftId = Number(req.params.id);
      const action = req.body?.action as SuggestAction | undefined;
      if (!draftId || !action || !SUGGEST_ACTIONS.includes(action)) {
        res.status(400).json({ error: "draftId + valid action required" });
        return;
      }

      const draft = await storage.getContentDraftById(draftId);
      if (!draft || draft.client_id !== clientId) {
        res.status(404).json({ error: "Draft not found" });
        return;
      }

      const draftBody = (draft.body as string | null) || "";
      if (draftBody.trim().length === 0) {
        res.status(400).json({ error: "Draft body is empty" });
        return;
      }

      // Resolve context: city, brand tone, business name (best-effort).
      const client = await storage.getClientById(clientId);
      const meta = ((client?.metadata as Record<string, any>) || {}) as Record<string, any>;
      const brand = (meta.content_brand && typeof meta.content_brand === "object")
        ? (meta.content_brand as Record<string, any>)
        : {};
      const city = (brand.city as string | null) || ((client as any)?.address_city as string | null) || null;
      const brandTone = (brand.tone as string | null) || null;
      const businessName = (client?.business_name as string | null) || null;

      const system = suggestionSystemPrompt();
      const user = buildSuggestionPrompt(action, draftBody, { city, brandTone, businessName });

      const result = await runPromptViaOrchestrator({
        system,
        user,
        clientId,
        purpose: `contentflow.draft.suggest.${action}`,
      });

      if (result.noProviderSucceeded || !result.text) {
        res.status(502).json({
          ok: false,
          error: "No provider available — try again in a moment.",
          providerUsed: result.providerUsed,
        });
        return;
      }

      writeAudit({
        actorType: "user",
        action: "contentflow.draft.suggest",
        entityType: "content_draft",
        entityId: String(draftId),
        metadata: {
          client_id: clientId,
          suggest_action: action,
          provider_used: result.providerUsed,
          output_length: result.text.length,
        },
      });

      res.json({
        ok: true,
        action,
        original: draftBody,
        suggestion: result.text,
        providerUsed: result.providerUsed,
      });
    } catch (err: any) {
      log.error("[portal/contentflow/draft/:id/suggest]", err?.message || err);
      res.status(500).json({ error: err?.message });
    }
  });
}
