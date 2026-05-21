/**
 * Wave W-AW-1 — User-facing TradeLine knowledge base management.
 *
 * Mounted at /api/portal/tradeline/. Auth: requireClient + must have a client
 * record linked. Owners curate the FAQ / service / policy / pricing / doc
 * entries their AI receptionist references at runtime — the prompt builder
 * pulls active entries (priority desc) and embeds them into the system
 * prompt under "Business Knowledge".
 *
 * Endpoints (all requireClient + must own the client_id):
 *   GET    /api/portal/tradeline/knowledge          — list MY active+draft entries
 *   POST   /api/portal/tradeline/knowledge          — create new entry
 *   PATCH  /api/portal/tradeline/knowledge/:id      — update one
 *   DELETE /api/portal/tradeline/knowledge/:id      — soft archive
 *   POST   /api/portal/tradeline/knowledge/reorder  — bulk priority update
 *   GET    /api/portal/tradeline/voices             — list active voices for picker
 *   GET    /api/portal/tradeline/settings           — get my voice/greeting settings
 *   PATCH  /api/portal/tradeline/settings           — update my voice/greeting settings
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import {
  tradelineKnowledgeBase,
  tradelineVoices,
  tradelineAssistantSettings,
  clients,
  TRADELINE_KB_KINDS,
  TRADELINE_KB_STATUSES,
} from "@shared/schema";
import { requireClient } from "../auth";
import { createLogger } from "../lib/logger";
import { generateCuid } from "../lib/apiKeys";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";

const log = createLogger("PortalTradelineKnowledge");

const KB_BASE = "/api/portal/tradeline/knowledge";
const PORTAL_VOICES = "/api/portal/tradeline/voices";
const PORTAL_SETTINGS = "/api/portal/tradeline/settings";

const createBody = z.object({
  kind: z.enum(TRADELINE_KB_KINDS),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(20_000),
  priority: z.number().int().min(0).max(1_000_000).optional(),
  status: z.enum(TRADELINE_KB_STATUSES).optional(),
});

const updateBody = z.object({
  kind: z.enum(TRADELINE_KB_KINDS).optional(),
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(20_000).optional(),
  priority: z.number().int().min(0).max(1_000_000).optional(),
  status: z.enum(TRADELINE_KB_STATUSES).optional(),
});

const reorderBody = z.object({
  order: z
    .array(
      z.object({
        id: z.string().min(1),
        priority: z.number().int().min(0).max(1_000_000),
      }),
    )
    .min(1)
    .max(500),
});

const settingsBody = z.object({
  voice_id: z.string().max(80).nullable().optional(),
  greeting: z.string().max(2000).nullable().optional(),
  response_style: z.enum(["concise", "detailed", "friendly"]).nullable().optional(),
});

/** Resolve client_id from the authenticated user. */
async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

async function withClientId(req: Request, res: Response): Promise<number | null> {
  const clientId = await resolveClientId(req.user!.id);
  if (!clientId) {
    res.status(403).json({ error: "no_client_linked" });
    return null;
  }
  return clientId;
}

export function registerPortalTradelineKnowledgeRoutes(app: Express): void {
  /* ─── GET /knowledge — list MY entries (active + draft, archived hidden) ─── */
  app.get(KB_BASE, requireClient, async (req: Request, res: Response) => {
    const clientId = await withClientId(req, res);
    if (clientId === null) return;
    try {
      const rows = await db
        .select()
        .from(tradelineKnowledgeBase)
        .where(
          and(
            eq(tradelineKnowledgeBase.client_id, clientId),
            ne(tradelineKnowledgeBase.status, "archived"),
          ),
        )
        .orderBy(desc(tradelineKnowledgeBase.priority), desc(tradelineKnowledgeBase.updated_at));
      res.json({ entries: rows });
    } catch (err: any) {
      log.error("list kb failed", { error: err?.message, clientId });
      res.status(500).json({ error: "list_kb_failed" });
    }
  });

  /* ─── POST /knowledge — create ─── */
  app.post(KB_BASE, requireClient, async (req: Request, res: Response) => {
    const clientId = await withClientId(req, res);
    if (clientId === null) return;
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", details: parsed.error.format() });
      return;
    }
    try {
      const id = generateCuid();
      const [created] = await db
        .insert(tradelineKnowledgeBase)
        .values({
          id,
          client_id: clientId,
          kind: parsed.data.kind,
          title: parsed.data.title,
          content: parsed.data.content,
          priority: parsed.data.priority ?? 0,
          status: parsed.data.status ?? "active",
        })
        .returning();
      res.status(201).json({ entry: created });
    } catch (err: any) {
      log.error("create kb failed", { error: err?.message, clientId });
      res.status(500).json({ error: "create_kb_failed" });
    }
  });

  /* ─── PATCH /knowledge/:id — update one ─── */
  app.patch(`${KB_BASE}/:id`, requireClient, async (req: Request, res: Response) => {
    const clientId = await withClientId(req, res);
    if (clientId === null) return;
    const id = String(req.params.id);
    const parsed = updateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", details: parsed.error.format() });
      return;
    }
    try {
      const patch: Record<string, unknown> = { updated_at: new Date() };
      for (const key of Object.keys(parsed.data) as Array<keyof typeof parsed.data>) {
        const v = parsed.data[key];
        if (v !== undefined) patch[key] = v;
      }
      const [updated] = await db
        .update(tradelineKnowledgeBase)
        .set(patch)
        .where(
          and(
            eq(tradelineKnowledgeBase.id, id),
            eq(tradelineKnowledgeBase.client_id, clientId),
          ),
        )
        .returning();
      if (!updated) {
        res.status(404).json({ error: "kb_not_found" });
        return;
      }
      res.json({ entry: updated });
    } catch (err: any) {
      log.error("update kb failed", { error: err?.message, clientId, id });
      res.status(500).json({ error: "update_kb_failed" });
    }
  });

  /* ─── DELETE /knowledge/:id — soft archive ─── */
  app.delete(`${KB_BASE}/:id`, requireClient, async (req: Request, res: Response) => {
    const clientId = await withClientId(req, res);
    if (clientId === null) return;
    const id = String(req.params.id);
    try {
      const [updated] = await db
        .update(tradelineKnowledgeBase)
        .set({ status: "archived", updated_at: new Date() })
        .where(
          and(
            eq(tradelineKnowledgeBase.id, id),
            eq(tradelineKnowledgeBase.client_id, clientId),
          ),
        )
        .returning();
      if (!updated) {
        res.status(404).json({ error: "kb_not_found" });
        return;
      }
      res.json({ ok: true });
    } catch (err: any) {
      log.error("archive kb failed", { error: err?.message, clientId, id });
      res.status(500).json({ error: "archive_kb_failed" });
    }
  });

  /* ─── POST /knowledge/reorder — bulk priority update ─── */
  app.post(`${KB_BASE}/reorder`, requireClient, async (req: Request, res: Response) => {
    const clientId = await withClientId(req, res);
    if (clientId === null) return;
    const parsed = reorderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", details: parsed.error.format() });
      return;
    }
    try {
      // Only update entries the client actually owns (defensive).
      const ids = parsed.data.order.map((o) => o.id);
      const owned = await db
        .select({ id: tradelineKnowledgeBase.id })
        .from(tradelineKnowledgeBase)
        .where(
          and(
            eq(tradelineKnowledgeBase.client_id, clientId),
            inArray(tradelineKnowledgeBase.id, ids),
          ),
        );
      const ownedSet = new Set(owned.map((r) => r.id));

      // Single transaction-ish loop — fine for ≤500 rows.
      for (const item of parsed.data.order) {
        if (!ownedSet.has(item.id)) continue;
        await db
          .update(tradelineKnowledgeBase)
          .set({ priority: item.priority, updated_at: new Date() })
          .where(
            and(
              eq(tradelineKnowledgeBase.id, item.id),
              eq(tradelineKnowledgeBase.client_id, clientId),
            ),
          );
      }
      res.json({ ok: true, updated: ownedSet.size });
    } catch (err: any) {
      log.error("reorder kb failed", { error: err?.message, clientId });
      res.status(500).json({ error: "reorder_kb_failed" });
    }
  });

  /* ─── GET /tradeline/voices — list active voices for the portal picker ─── */
  app.get(PORTAL_VOICES, requireClient, async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(tradelineVoices)
        .where(eq(tradelineVoices.status, "active"))
        .orderBy(asc(tradelineVoices.display_name));
      res.json({ voices: rows });
    } catch (err: any) {
      log.error("portal list voices failed", { error: err?.message });
      res.status(500).json({ error: "list_voices_failed" });
    }
  });

  /* ─── GET /tradeline/settings — get MY voice + greeting settings ─── */
  app.get(PORTAL_SETTINGS, requireClient, async (req: Request, res: Response) => {
    const clientId = await withClientId(req, res);
    if (clientId === null) return;
    try {
      const [row] = await db
        .select()
        .from(tradelineAssistantSettings)
        .where(eq(tradelineAssistantSettings.client_id, clientId))
        .limit(1);
      res.json({ settings: row ?? null });
    } catch (err: any) {
      log.error("get portal settings failed", { error: err?.message, clientId });
      res.status(500).json({ error: "get_settings_failed" });
    }
  });

  /* ─── PATCH /tradeline/settings — update MY voice + greeting settings ─── */
  app.patch(PORTAL_SETTINGS, requireClient, async (req: Request, res: Response) => {
    const clientId = await withClientId(req, res);
    if (clientId === null) return;
    const parsed = settingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", details: parsed.error.format() });
      return;
    }
    try {
      const existing = await db
        .select()
        .from(tradelineAssistantSettings)
        .where(eq(tradelineAssistantSettings.client_id, clientId))
        .limit(1);

      let row;
      if (existing.length === 0) {
        const [created] = await db
          .insert(tradelineAssistantSettings)
          .values({
            client_id: clientId,
            voice_id: parsed.data.voice_id ?? null,
            greeting: parsed.data.greeting ?? null,
            response_style: parsed.data.response_style ?? null,
          })
          .returning();
        row = created;
      } else {
        const patch: Record<string, unknown> = { updated_at: new Date() };
        for (const key of Object.keys(parsed.data) as Array<keyof typeof parsed.data>) {
          const v = parsed.data[key];
          if (v !== undefined) patch[key] = v;
        }
        const [updated] = await db
          .update(tradelineAssistantSettings)
          .set(patch)
          .where(eq(tradelineAssistantSettings.client_id, clientId))
          .returning();
        row = updated;
      }
      res.json({ settings: row });
    } catch (err: any) {
      log.error("update portal settings failed", { error: err?.message, clientId });
      res.status(500).json({ error: "update_settings_failed" });
    }
  });
}
