import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { db } from "../db";
import { aiUsageLogs, aiConversationArchive, chatMemory } from "@shared/schema";
import { desc, eq, sql, and, gte, lte, ilike, or } from "drizzle-orm";

export function registerAdminRoutes(app: Express): void {

  /* ─── Overview stats ─── */
  app.get("/api/admin/ai/overview", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart.getTime() - 6 * 86400000);

      // Usage stats
      const [usageToday] = await db.select({
        count: sql<number>`count(*)::int`,
        success: sql<number>`count(*) filter (where success = true)::int`,
        failed: sql<number>`count(*) filter (where success = false)::int`,
        cost: sql<number>`coalesce(sum(estimated_cost_usd), 0)::int`,
        messages: sql<number>`coalesce(sum(coalesce(input_tokens,0) + coalesce(output_tokens,0)), 0)::bigint`,
      }).from(aiUsageLogs).where(gte(aiUsageLogs.created_at, todayStart));

      const [usageWeek] = await db.select({
        count: sql<number>`count(*)::int`,
        cost: sql<number>`coalesce(sum(estimated_cost_usd), 0)::int`,
      }).from(aiUsageLogs).where(gte(aiUsageLogs.created_at, weekStart));

      // Most active surface today
      const surfaceRows = await db.select({
        surface: aiUsageLogs.surface,
        count: sql<number>`count(*)::int`,
      }).from(aiUsageLogs)
        .where(gte(aiUsageLogs.created_at, todayStart))
        .groupBy(aiUsageLogs.surface)
        .orderBy(sql`count(*) desc`)
        .limit(1);

      // Archive stats
      const [archiveStats] = await db.select({
        total: sql<number>`count(*)::int`,
        saved: sql<number>`count(*) filter (where save_decision != 'discard_candidate' and save_decision != 'low_signal')::int`,
        discarded: sql<number>`count(*) filter (where save_decision in ('discard_candidate', 'low_signal'))::int`,
      }).from(aiConversationArchive);

      // Active memory sessions
      const [memoryStats] = await db.select({
        active: sql<number>`count(*)::int`,
      }).from(chatMemory).where(gte(chatMemory.expires_at, now));

      res.json({
        today: {
          conversations: usageToday?.count || 0,
          successful: usageToday?.success || 0,
          failed: usageToday?.failed || 0,
          estimatedCostMicroCents: usageToday?.cost || 0,
          totalTokens: Number(usageToday?.messages || 0),
        },
        week: {
          conversations: usageWeek?.count || 0,
          estimatedCostMicroCents: usageWeek?.cost || 0,
        },
        mostActiveSurface: surfaceRows[0]?.surface || "none",
        archive: {
          total: archiveStats?.total || 0,
          saved: archiveStats?.saved || 0,
          discarded: archiveStats?.discarded || 0,
        },
        activeMemorySessions: memoryStats?.active || 0,
      });
    } catch (err: any) {
      console.error("[admin] Overview error:", err.message);
      res.status(500).json({ error: "Failed to load overview" });
    }
  });

  /* ─── Conversations list (archive) ─── */
  app.get("/api/admin/ai/conversations", requireAdmin, async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const offset = (page - 1) * limit;
      const surface = req.query.surface as string;
      const intent = req.query.intent as string;
      const decision = req.query.decision as string;
      const search = req.query.search as string;

      const conditions = [];
      if (surface) conditions.push(eq(aiConversationArchive.surface, surface));
      if (intent) conditions.push(eq(aiConversationArchive.primary_intent, intent));
      if (decision) conditions.push(eq(aiConversationArchive.save_decision, decision));
      if (search) {
        conditions.push(or(
          ilike(aiConversationArchive.summary, `%${search}%`),
          ilike(aiConversationArchive.context_note, `%${search}%`),
          sql`${aiConversationArchive.tags}::text ilike ${'%' + search + '%'}`,
        ));
      }

      const where = conditions.length ? and(...conditions) : undefined;

      const rows = await db.select({
        id: aiConversationArchive.id,
        sessionId: aiConversationArchive.session_id,
        userId: aiConversationArchive.user_id,
        surface: aiConversationArchive.surface,
        reportId: aiConversationArchive.report_id,
        summary: aiConversationArchive.summary,
        contextNote: aiConversationArchive.context_note,
        tags: aiConversationArchive.tags,
        primaryIntent: aiConversationArchive.primary_intent,
        saveDecision: aiConversationArchive.save_decision,
        messageCount: aiConversationArchive.message_count,
        estimatedCostUsd: aiConversationArchive.estimated_cost_usd,
        createdAt: aiConversationArchive.created_at,
      }).from(aiConversationArchive)
        .where(where)
        .orderBy(desc(aiConversationArchive.created_at))
        .limit(limit)
        .offset(offset);

      const [{ total }] = await db.select({
        total: sql<number>`count(*)::int`,
      }).from(aiConversationArchive).where(where);

      res.json({ rows, total, page, limit });
    } catch (err: any) {
      console.error("[admin] Conversations error:", err.message);
      res.status(500).json({ error: "Failed to load conversations" });
    }
  });

  /* ─── Conversation detail ─── */
  app.get("/api/admin/ai/conversations/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      if (!id) return res.status(400).json({ error: "Invalid ID" });

      const [row] = await db.select().from(aiConversationArchive)
        .where(eq(aiConversationArchive.id, id)).limit(1);

      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to load conversation" });
    }
  });

  /* ─── Usage logs ─── */
  app.get("/api/admin/ai/usage", requireAdmin, async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;
      const surface = req.query.surface as string;
      const success = req.query.success as string;

      const conditions = [];
      if (surface) conditions.push(eq(aiUsageLogs.surface, surface));
      if (success === "true") conditions.push(eq(aiUsageLogs.success, true));
      if (success === "false") conditions.push(eq(aiUsageLogs.success, false));

      const where = conditions.length ? and(...conditions) : undefined;

      const rows = await db.select().from(aiUsageLogs)
        .where(where)
        .orderBy(desc(aiUsageLogs.created_at))
        .limit(limit)
        .offset(offset);

      const [{ total }] = await db.select({
        total: sql<number>`count(*)::int`,
      }).from(aiUsageLogs).where(where);

      res.json({ rows, total, page, limit });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to load usage logs" });
    }
  });

  /* ─── Daily cost aggregation ─── */
  app.get("/api/admin/ai/cost", requireAdmin, async (req: Request, res: Response) => {
    try {
      const days = Math.min(90, Math.max(1, parseInt(req.query.days as string) || 30));
      const since = new Date(Date.now() - days * 86400000);

      const rows = await db.select({
        date: sql<string>`date(created_at)`.as("date"),
        requests: sql<number>`count(*)::int`,
        successful: sql<number>`count(*) filter (where success = true)::int`,
        failed: sql<number>`count(*) filter (where success = false)::int`,
        totalCost: sql<number>`coalesce(sum(estimated_cost_usd), 0)::int`,
        totalInputTokens: sql<number>`coalesce(sum(input_tokens), 0)::int`,
        totalOutputTokens: sql<number>`coalesce(sum(output_tokens), 0)::int`,
      }).from(aiUsageLogs)
        .where(gte(aiUsageLogs.created_at, since))
        .groupBy(sql`date(created_at)`)
        .orderBy(sql`date(created_at) desc`);

      // Surface breakdown
      const bySurface = await db.select({
        surface: aiUsageLogs.surface,
        requests: sql<number>`count(*)::int`,
        totalCost: sql<number>`coalesce(sum(estimated_cost_usd), 0)::int`,
      }).from(aiUsageLogs)
        .where(gte(aiUsageLogs.created_at, since))
        .groupBy(aiUsageLogs.surface)
        .orderBy(sql`count(*) desc`);

      res.json({ daily: rows, bySurface });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to load cost data" });
    }
  });

  /* ─── Top topics / intents from archived conversations ─── */
  app.get("/api/admin/ai/topics", requireAdmin, async (req: Request, res: Response) => {
    try {
      const days = Math.min(90, parseInt(req.query.days as string) || 30);
      const since = new Date(Date.now() - days * 86400000);

      // Top intents
      const intents = await db.select({
        intent: aiConversationArchive.primary_intent,
        count: sql<number>`count(*)::int`,
      }).from(aiConversationArchive)
        .where(gte(aiConversationArchive.created_at, since))
        .groupBy(aiConversationArchive.primary_intent)
        .orderBy(sql`count(*) desc`)
        .limit(15);

      // Top tags (unnest JSONB array)
      const tags = await db.execute(sql`
        select tag, count(*)::int as count
        from ai_conversation_archive, jsonb_array_elements_text(tags) as tag
        where created_at >= ${since}
        group by tag
        order by count(*) desc
        limit 20
      `);

      // Surface distribution
      const surfaces = await db.select({
        surface: aiConversationArchive.surface,
        count: sql<number>`count(*)::int`,
      }).from(aiConversationArchive)
        .where(gte(aiConversationArchive.created_at, since))
        .groupBy(aiConversationArchive.surface)
        .orderBy(sql`count(*) desc`);

      res.json({
        topIntents: intents,
        topTags: tags.rows || tags,
        surfaceDistribution: surfaces,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to load topics" });
    }
  });
}
