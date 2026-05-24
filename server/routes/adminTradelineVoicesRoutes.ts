/**
 * Wave W-AW-1 — Admin TradeLine voice catalog + per-client assistant settings.
 *
 * Replaces the static `shared/tradelineVoices.ts` registry with a DB-backed
 * catalog managed from the admin UI. Also exposes per-client settings CRUD
 * (voice id, greeting override, response style, monthly minute budget) and
 * a usage roll-up endpoint for the analytics chart.
 *
 * Endpoints (all requireAdmin):
 *   GET    /api/admin/tradeline/voices                — list catalog
 *   POST   /api/admin/tradeline/voices                — add a new voice
 *   PATCH  /api/admin/tradeline/voices/:id            — edit metadata
 *   DELETE /api/admin/tradeline/voices/:id            — soft archive
 *   GET    /api/admin/tradeline/voices/usage          — usage roll-up
 *   GET    /api/admin/tradeline/settings/clients      — clients + their settings
 *   PATCH  /api/admin/tradeline/settings/:clientId    — upsert per-client settings
 *
 * All mutations write to admin_activity_log so the audit page tells the
 * story.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import {
  tradelineVoices,
  tradelineAssistantSettings,
  clients,
  clientServices,
} from "@shared/schema";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import {
  getOrCreateSample,
  isPreviewAvailable,
  pickOpenAIVoice,
} from "../lib/voicePreview";
import { and, asc, desc, eq, sql } from "drizzle-orm";

const log = createLogger("AdminTradelineVoices");

const VOICE_BASE = "/api/admin/tradeline/voices";
const SETTINGS_BASE = "/api/admin/tradeline/settings";
const HEALTH_PATH = "/api/admin/tradeline/provisioning-health";
const VAPI_API_BASE = "https://api.vapi.ai";

const tagsSchema = z.array(z.string().max(40)).max(20).optional();

const createVoiceBody = z.object({
  id: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, "id must be lowercase alphanumeric / dash / underscore"),
  elevenlabs_voice_id: z.string().min(1).max(120),
  display_name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  gender: z.enum(["female", "male", "neutral"]).nullable().optional(),
  accent: z.string().max(40).nullable().optional(),
  tags: tagsSchema,
  sample_audio_url: z.string().max(2000).nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

const updateVoiceBody = z.object({
  elevenlabs_voice_id: z.string().min(1).max(120).optional(),
  display_name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  gender: z.enum(["female", "male", "neutral"]).nullable().optional(),
  accent: z.string().max(40).nullable().optional(),
  tags: tagsSchema,
  sample_audio_url: z.string().max(2000).nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

const settingsBody = z.object({
  voice_id: z.string().max(80).nullable().optional(),
  greeting: z.string().max(2000).nullable().optional(),
  response_style: z.enum(["concise", "detailed", "friendly"]).nullable().optional(),
  monthly_minute_budget: z.number().int().min(0).max(1_000_000).nullable().optional(),
  monthly_minute_used: z.number().int().min(0).optional(),
  auto_disable_on_cap: z.boolean().optional(),
  fallback_voice_id: z.string().max(80).nullable().optional(),
});

export function registerAdminTradelineVoicesRoutes(app: Express): void {
  /* ─── GET /voices — list catalog ─── */
  app.get(VOICE_BASE, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(tradelineVoices)
        .orderBy(asc(tradelineVoices.display_name));
      res.json({ voices: rows });
    } catch (err: any) {
      log.error("list voices failed", { error: err?.message });
      res.status(500).json({ error: "list_voices_failed" });
    }
  });

  /* ─── POST /voices — add new ─── */
  app.post(VOICE_BASE, requireAdmin, async (req: Request, res: Response) => {
    const parsed = createVoiceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", details: parsed.error.format() });
      return;
    }
    try {
      const [created] = await db
        .insert(tradelineVoices)
        .values({
          id: parsed.data.id,
          elevenlabs_voice_id: parsed.data.elevenlabs_voice_id,
          display_name: parsed.data.display_name,
          description: parsed.data.description ?? null,
          gender: parsed.data.gender ?? null,
          accent: parsed.data.accent ?? null,
          tags: parsed.data.tags ?? [],
          sample_audio_url: parsed.data.sample_audio_url ?? null,
          status: parsed.data.status ?? "active",
        })
        .returning();

      await storage.logAdminActivity({
        actor_type: "admin",
        actor_id: req.user?.id ?? null,
        actor_name: (req.user as any)?.email ?? "admin",
        action: "tradeline.voice_added",
        entity_type: "tradeline_voice",
        entity_id: null,
        summary: `Added voice "${created.display_name}" (${created.id})`,
        metadata: { voice_id: created.id, elevenlabs_voice_id: created.elevenlabs_voice_id },
      });
      res.status(201).json({ voice: created });
    } catch (err: any) {
      // Likely a unique-id collision
      if (String(err?.code) === "23505") {
        res.status(409).json({ error: "voice_id_taken" });
        return;
      }
      log.error("create voice failed", { error: err?.message });
      res.status(500).json({ error: "create_voice_failed" });
    }
  });

  /* ─── PATCH /voices/:id — edit ─── */
  app.patch(`${VOICE_BASE}/:id`, requireAdmin, async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const parsed = updateVoiceBody.safeParse(req.body);
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
        .update(tradelineVoices)
        .set(patch)
        .where(eq(tradelineVoices.id, id))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "voice_not_found" });
        return;
      }
      await storage.logAdminActivity({
        actor_type: "admin",
        actor_id: req.user?.id ?? null,
        actor_name: (req.user as any)?.email ?? "admin",
        action: "tradeline.voice_updated",
        entity_type: "tradeline_voice",
        entity_id: null,
        summary: `Updated voice "${updated.display_name}" (${updated.id})`,
        metadata: { voice_id: updated.id, changed: Object.keys(parsed.data) },
      });
      res.json({ voice: updated });
    } catch (err: any) {
      log.error("update voice failed", { error: err?.message, id });
      res.status(500).json({ error: "update_voice_failed" });
    }
  });

  /* ─── DELETE /voices/:id — soft archive ─── */
  app.delete(`${VOICE_BASE}/:id`, requireAdmin, async (req: Request, res: Response) => {
    const id = String(req.params.id);
    try {
      const [updated] = await db
        .update(tradelineVoices)
        .set({ status: "archived", updated_at: new Date() })
        .where(eq(tradelineVoices.id, id))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "voice_not_found" });
        return;
      }
      await storage.logAdminActivity({
        actor_type: "admin",
        actor_id: req.user?.id ?? null,
        actor_name: (req.user as any)?.email ?? "admin",
        action: "tradeline.voice_archived",
        entity_type: "tradeline_voice",
        entity_id: null,
        summary: `Archived voice "${updated.display_name}" (${updated.id})`,
        metadata: { voice_id: updated.id },
      });
      res.json({ voice: updated });
    } catch (err: any) {
      log.error("archive voice failed", { error: err?.message, id });
      res.status(500).json({ error: "archive_voice_failed" });
    }
  });

  /* ─── GET /voices/:voiceId/sample — TTS preview MP3 ─────────────────
   * Streams a short cached MP3 generated by OpenAI TTS so the admin UI
   * Play button gives an immediate audible cue per voice. Cache lives at
   * /tmp/voice-samples-cache/{voiceId}.mp3 — see server/lib/voicePreview.
   * Returns 503 when OpenAI is unconfigured or generation fails so the
   * frontend can toast "Voice preview unavailable" instead of crashing.
   * ──────────────────────────────────────────────────────────────── */
  app.get(
    `${VOICE_BASE}/:voiceId/sample`,
    requireAdmin,
    async (req: Request, res: Response) => {
      const voiceId = String(req.params.voiceId);
      if (!/^[a-z0-9][a-z0-9_-]*$/i.test(voiceId)) {
        res.status(400).json({ error: "invalid_voice_id" });
        return;
      }
      if (!isPreviewAvailable()) {
        res.status(503).json({ error: "preview_unavailable" });
        return;
      }
      try {
        const [row] = await db
          .select({ id: tradelineVoices.id, gender: tradelineVoices.gender })
          .from(tradelineVoices)
          .where(eq(tradelineVoices.id, voiceId))
          .limit(1);
        if (!row) {
          res.status(404).json({ error: "voice_not_found" });
          return;
        }
        const openaiVoice = pickOpenAIVoice(row.id, row.gender);
        const buf = await getOrCreateSample(row.id, openaiVoice);
        if (!buf) {
          res.status(503).json({ error: "preview_unavailable" });
          return;
        }
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Cache-Control", "private, max-age=86400");
        res.setHeader("Content-Length", String(buf.length));
        res.end(buf);
      } catch (err: any) {
        log.error("voice sample failed", { error: err?.message, voiceId });
        res.status(503).json({ error: "preview_unavailable" });
      }
    },
  );

  /* ─── GET /voices/usage — voice usage roll-up ───────────────────────
   * Aggregates `monthly_minute_used` across per-client settings, grouped
   * by voice_id. This is intentionally cheap (one indexed scan) so the
   * admin chart loads instantly even with a big roster.
   * ──────────────────────────────────────────────────────────────── */
  app.get(`${VOICE_BASE}/usage`, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          voice_id: tradelineAssistantSettings.voice_id,
          minutes_used: sql<number>`COALESCE(SUM(${tradelineAssistantSettings.monthly_minute_used}), 0)`,
          client_count: sql<number>`COUNT(${tradelineAssistantSettings.client_id})`,
        })
        .from(tradelineAssistantSettings)
        .groupBy(tradelineAssistantSettings.voice_id);
      res.json({ usage: rows });
    } catch (err: any) {
      log.error("usage roll-up failed", { error: err?.message });
      res.status(500).json({ error: "usage_failed" });
    }
  });

  /* ─── GET /settings/clients — list clients + their settings ─── */
  app.get(`${SETTINGS_BASE}/clients`, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          client_id: clients.id,
          business_name: clients.business_name,
          trade_type: clients.trade_type,
          voice_id: tradelineAssistantSettings.voice_id,
          greeting: tradelineAssistantSettings.greeting,
          response_style: tradelineAssistantSettings.response_style,
          monthly_minute_budget: tradelineAssistantSettings.monthly_minute_budget,
          monthly_minute_used: tradelineAssistantSettings.monthly_minute_used,
          auto_disable_on_cap: tradelineAssistantSettings.auto_disable_on_cap,
          fallback_voice_id: tradelineAssistantSettings.fallback_voice_id,
          updated_at: tradelineAssistantSettings.updated_at,
        })
        .from(clients)
        .leftJoin(
          tradelineAssistantSettings,
          eq(tradelineAssistantSettings.client_id, clients.id),
        )
        .orderBy(asc(clients.business_name));
      res.json({ clients: rows });
    } catch (err: any) {
      log.error("list client settings failed", { error: err?.message });
      res.status(500).json({ error: "list_client_settings_failed" });
    }
  });

  /* ─── PATCH /settings/:clientId — upsert per-client settings ─── */
  app.patch(
    `${SETTINGS_BASE}/:clientId`,
    requireAdmin,
    async (req: Request, res: Response) => {
      const clientId = Number.parseInt(String(req.params.clientId), 10);
      if (!Number.isFinite(clientId) || clientId <= 0) {
        res.status(400).json({ error: "invalid_client_id" });
        return;
      }
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
              monthly_minute_budget: parsed.data.monthly_minute_budget ?? null,
              monthly_minute_used: parsed.data.monthly_minute_used ?? 0,
              auto_disable_on_cap: parsed.data.auto_disable_on_cap ?? true,
              fallback_voice_id: parsed.data.fallback_voice_id ?? null,
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

        await storage.logAdminActivity({
          actor_type: "admin",
          actor_id: req.user?.id ?? null,
          actor_name: (req.user as any)?.email ?? "admin",
          action: "tradeline.assistant_settings_updated",
          entity_type: "client",
          entity_id: clientId,
          summary: `Updated TradeLine settings (voice=${row.voice_id ?? "—"}, budget=${row.monthly_minute_budget ?? "∞"})`,
          metadata: { changed: Object.keys(parsed.data) },
        });
        res.json({ settings: row });
      } catch (err: any) {
        log.error("upsert settings failed", { error: err?.message, clientId });
        res.status(500).json({ error: "upsert_settings_failed" });
      }
    },
  );

  /* ─── GET /provisioning-health ─────────────────────────────────────────
   * Side-by-side diagnostic: DB-side TradeLine provisioning state vs the
   * live Vapi assistant inventory. Used by the small health widget on the
   * Tradeline Voices admin page to catch drift / silent provisioning
   * failures early (e.g. PR #698 audit found zero live TradeLine
   * assistants while the DB carried four pending services).
   *
   * Returns:
   *   {
   *     dbServicesTotal,                 // every client_services row where service_id LIKE 'tradeline%'
   *     dbServicesActive,                // ...AND status = 'active'
   *     dbServicesPending,               // ...AND status = 'pending'
   *     dbServicesWithAssistantId,       // ...AND metadata.tradeline.assistant.vapiAssistantId is non-empty
   *     dbServicesFailed,                // ...AND metadata.tradeline.assistant.status = 'failed'
   *     dbAssistantSettingsRows,         // SELECT COUNT(*) FROM tradeline_assistant_settings
   *     vapiAssistantsTotal,             // GET /assistant on Vapi
   *     vapiTradelineAssistants,         // ...filtered by metadata.source === 'tradeline_template_engine'
   *     driftCount,                      // DB-side ids absent from Vapi inventory
   *     driftIds,                        // those DB ids
   *     failures: [{ id, status, lastBuildError }],
   *     vapiReachable,                   // boolean — did the GET /assistant succeed
   *     vapiError,                       // null or the error message
   *     generatedAt,
   *   }
   * Pure read-only — never mutates anything.
   * ────────────────────────────────────────────────────────────────── */
  app.get(HEALTH_PATH, requireAdmin, async (_req: Request, res: Response) => {
    try {
      // 1. DB-side aggregates.
      const allTradelineServices = await db
        .select({
          id: clientServices.id,
          client_id: clientServices.client_id,
          status: clientServices.status,
          metadata: clientServices.metadata,
        })
        .from(clientServices)
        .where(sql`${clientServices.service_id} LIKE 'tradeline%'`);

      const dbServicesTotal = allTradelineServices.length;
      let dbServicesActive = 0;
      let dbServicesPending = 0;
      let dbServicesWithAssistantId = 0;
      let dbServicesFailed = 0;
      const dbAssistantIds = new Set<string>();
      const failures: Array<{ id: number; status: string; lastBuildError: string }> = [];

      for (const svc of allTradelineServices) {
        if (svc.status === "active") dbServicesActive++;
        if (svc.status === "pending") dbServicesPending++;
        const meta = (svc.metadata as Record<string, any>) ?? {};
        const a = meta?.tradeline?.assistant ?? {};
        const vapiId = typeof a.vapiAssistantId === "string" ? a.vapiAssistantId.trim() : "";
        if (vapiId) {
          dbServicesWithAssistantId++;
          dbAssistantIds.add(vapiId);
        }
        if (a.status === "failed") {
          dbServicesFailed++;
          failures.push({
            id: svc.id,
            status: String(a.status ?? ""),
            lastBuildError: String(a.lastBuildError ?? ""),
          });
        }
      }

      const [settingsCountRow] = await db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(tradelineAssistantSettings);
      const dbAssistantSettingsRows = Number(settingsCountRow?.n ?? 0);

      // 2. Live Vapi inventory. Fail soft — surface the error to the widget
      //    instead of 500ing the whole endpoint, so the DB-side numbers are
      //    still visible if Vapi is briefly unreachable.
      let vapiReachable = false;
      let vapiError: string | null = null;
      const liveVapiIds = new Set<string>();
      let vapiAssistantsTotal = 0;
      let vapiTradelineAssistants = 0;
      const apiKey = process.env.VAPI_API_KEY;
      if (!apiKey) {
        vapiError = "VAPI_API_KEY not configured";
      } else {
        try {
          const resp = await fetch(`${VAPI_API_BASE}/assistant?limit=200`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (!resp.ok) {
            vapiError = `Vapi GET /assistant returned ${resp.status}`;
          } else {
            const all = (await resp.json()) as Array<Record<string, any>>;
            vapiReachable = true;
            vapiAssistantsTotal = Array.isArray(all) ? all.length : 0;
            for (const a of Array.isArray(all) ? all : []) {
              if (typeof a?.id === "string") liveVapiIds.add(a.id);
              if (a?.metadata?.source === "tradeline_template_engine") {
                vapiTradelineAssistants++;
              }
            }
          }
        } catch (err: any) {
          vapiError = `Vapi unreachable: ${err?.message ?? String(err)}`;
        }
      }

      // 3. Drift — DB-side assistant ids that don't exist live.
      const driftIds: string[] = [];
      if (vapiReachable) {
        for (const id of dbAssistantIds) {
          if (!liveVapiIds.has(id)) driftIds.push(id);
        }
      }

      res.json({
        dbServicesTotal,
        dbServicesActive,
        dbServicesPending,
        dbServicesWithAssistantId,
        dbServicesFailed,
        dbAssistantSettingsRows,
        vapiAssistantsTotal,
        vapiTradelineAssistants,
        driftCount: driftIds.length,
        driftIds,
        failures,
        vapiReachable,
        vapiError,
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      log.error("provisioning-health failed", { error: err?.message });
      res.status(500).json({ error: "health_failed", message: err?.message ?? "unknown" });
    }
  });
}
