/**
 * Portal ContentFlow routes.
 *
 * Mounted under /api/portal/contentflow/*. Auth: requireClient.
 *
 * Extracted from portalRoutes.ts as the next step of the portal sub-registrar
 * refactor (PR #711 plan; PRs #713/#718/#721/#722/#727 established the
 * pattern). Pure code move — zero behaviour change. The parent registrar
 * (registerPortalRoutes) invokes registerPortalContentflowRoutes(app) so the
 * wiring in routes/index.ts is unchanged.
 *
 * Endpoints
 *   GET    /api/portal/contentflow/brand-profile
 *   PATCH  /api/portal/contentflow/brand-profile
 *   GET    /api/portal/contentflow/videos
 *   GET    /api/portal/contentflow/video-settings
 *   PATCH  /api/portal/contentflow/video-settings
 */

import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { requireClient } from "../../auth";
import { storage } from "../../storage";
import { db } from "../../db";
import { clients } from "@shared/schema";
import {
  readBrandProfile,
  mergeBrandProfile,
  sanitizeBrandProfilePatch,
} from "../../services/contentflow/brandProfile";
import {
  IMAGE_STYLE_PRESETS,
  defaultPresetForIndustry,
} from "../../services/contentflow/imageStylePresets";
import { createLogger } from "../../lib/logger";

const log = createLogger("PortalContentflow");

/** Resolve client_id from the authenticated user's id. Returns null if no client record linked. */
async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

/** Middleware-style helper: resolve client_id or return 403. */
async function withClientId(req: Request, res: Response): Promise<number | null> {
  const clientId = await resolveClientId(req.user!.id);
  if (!clientId) {
    res.status(403).json({ error: "No client record linked to this account", code: "no_client_linked" });
    return null;
  }
  return clientId;
}

export function registerPortalContentflowRoutes(app: Express) {
  /* ─── Sprint 16: Brand profile (portal) ──────────────────────────── */

  /**
   * GET /api/portal/contentflow/brand-profile
   * Returns the calling client's brand profile. Strict tenant
   * isolation — the clientId comes from the session, never the URL.
   */
  app.get("/api/portal/contentflow/brand-profile", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const client = await storage.getClientById(clientId);
      if (!client) return res.status(404).json({ error: "client not found" });
      res.json({ brand_profile: readBrandProfile(client) });
    } catch (err: any) {
      log.error("[portal/brand-profile][get]", err?.message || err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * PATCH /api/portal/contentflow/brand-profile
   * Body: subset of editable BrandProfile fields. Protected fields
   * (primary_color/secondary_color/logo_url/forbidden_claims) and
   * unknown keys are SILENTLY dropped — not echoed as errors. The
   * resulting profile is returned so the client UI can re-render.
   */
  app.patch("/api/portal/contentflow/brand-profile", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const patch = sanitizeBrandProfilePatch(req.body, "client");
      const updated = await mergeBrandProfile(clientId, patch);
      res.json({ ok: true, brand_profile: updated });
    } catch (err: any) {
      log.error("[portal/brand-profile][patch]", err?.message || err);
      res.status(500).json({ error: err.message });
    }
  });

  /* ─── Sprint 19: Image style presets (portal) ───────────────────── */

  /**
   * GET /api/portal/contentflow/image-style-presets
   * Returns the static preset catalog + the suggested default for this
   * client's trade_type. The customer's current selection (if any) is
   * already on the brand profile — UI uses both to render.
   */
  app.get("/api/portal/contentflow/image-style-presets", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const client = await storage.getClientById(clientId);
      const tradeType = (client?.trade_type as string | null) ?? null;
      res.json({
        presets: IMAGE_STYLE_PRESETS,
        industry_default: defaultPresetForIndustry(tradeType),
        trade_type: tradeType,
      });
    } catch (err: any) {
      log.error("[portal/image-style-presets][get]", err?.message || err);
      res.status(500).json({ error: err.message });
    }
  });

  /* ─── Sprint 18: Video Content (portal) ─────────────────────────── */

  /**
   * GET /api/portal/contentflow/videos
   * Returns the calling client's video drafts (kind='video' or 'video_script').
   */
  app.get("/api/portal/contentflow/videos", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { sql: sqlTag } = await import("drizzle-orm");
      const { db: dbConn } = await import("../../db");
      const { contentDrafts } = await import("@shared/schema");

      const videos = await dbConn.select().from(contentDrafts)
        .where(sqlTag`
          ${contentDrafts.client_id} = ${clientId}
          AND ${contentDrafts.kind} IN ('video', 'video_script')
        `)
        .orderBy(sqlTag`${contentDrafts.created_at} DESC`)
        .limit(50);

      const formatted = videos.map((d: any) => ({
        id: d.id,
        kind: d.kind,
        title: d.title,
        status: d.status,
        excerpt: d.excerpt,
        target_url: d.target_url,
        video_url: (d.metadata as any)?.media_plan?.video_url || null,
        youtube_url: (d.metadata as any)?.youtube?.youtube_url || null,
        thumbnail_url: (d.metadata as any)?.media_plan?.image_url || (d.metadata as any)?.media_plan?.thumbnail_url || null,
        created_at: d.created_at,
      }));

      res.json({ videos: formatted });
    } catch (err: any) {
      log.error("[portal/videos] list error:", err?.message || err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/portal/contentflow/video-settings
   * Returns whether video generation is enabled for this client.
   */
  app.get("/api/portal/contentflow/video-settings", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { isVideoGenerationEnabledForClient, isVideoScriptsEnabled } = await import("../../services/contentflow/videoContentService");
      const { isVideoGenerationEnabled } = await import("../../services/contentflow/videoGenerationService");

      const videoGenEnabled = await isVideoGenerationEnabledForClient(clientId);
      const scriptsEnabled = await isVideoScriptsEnabled(clientId);
      // W-AM-2: surface the global kill switch so the portal can hide the
      // entire Videos tab when video gen is off (script/output mismatch).
      const globalEnabled = isVideoGenerationEnabled();

      res.json({
        video_generation_enabled: videoGenEnabled,
        video_scripts_enabled: scriptsEnabled,
        global_enabled: globalEnabled,
      });
    } catch (err: any) {
      log.error("[portal/video-settings] error:", err?.message || err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * PATCH /api/portal/contentflow/video-settings
   * Body: { video_generation_enabled: boolean }
   * Client can toggle their own video generation on/off.
   */
  app.patch("/api/portal/contentflow/video-settings", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { video_generation_enabled } = req.body;
      if (typeof video_generation_enabled !== "boolean") {
        return res.status(400).json({ error: "video_generation_enabled must be boolean" });
      }

      const { sql: sqlTag } = await import("drizzle-orm");
      const { db: dbConn } = await import("../../db");

      await dbConn.execute(sqlTag`
        UPDATE client_services
        SET metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{video_generation_enabled}',
          ${video_generation_enabled ? sqlTag`'true'::jsonb` : sqlTag`'false'::jsonb`}
        ),
        updated_at = NOW()
        WHERE client_id = ${clientId}
          AND status NOT IN ('cancelled')
      `);

      res.json({ ok: true, video_generation_enabled });
    } catch (err: any) {
      log.error("[portal/video-settings] patch error:", err?.message || err);
      res.status(500).json({ error: err.message });
    }
  });
}
