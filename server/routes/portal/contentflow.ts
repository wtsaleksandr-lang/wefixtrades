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
import {
  PROMPT_TEMPLATE_COUNT,
  filterPromptTemplates,
  topTagsForTemplates,
  getPromptTemplate,
  interpolatePromptTemplate,
  type PromptVariables,
} from "@shared/contentflow/promptLibrary";
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

  /* ─── Phase 1: Prompt library (portal) ──────────────────────────── */

  /**
   * GET /api/portal/contentflow/prompts
   *
   * Query params (all optional):
   *   trade   — plumbing | hvac | electrical | roofing | landscaping
   *   goal    — awareness | lead_gen | trust | conversion | re_engagement
   *   asset   — image | article | video | multi
   *   style   — one of the 10 ImageStylePresetId values
   *   search  — free-text match against title + description + tags
   *
   * Returns the filtered template list (without the full prompt body —
   * just the metadata UI cards need) plus the most-popular tag cloud
   * for the filtered set. Full prompt body is fetched on click via
   * /prompts/:id (and only after auth).
   *
   * Phase 1: free + paid tiers all access the library. Per-tier
   * generation caps land in Phase 4. To be safe we inline a minimal
   * guard so a free-tier customer can't trigger video pipelines from
   * Phase 3+ even if the UI slips up — the route returns the entire
   * list, the asset-cap guard is in the worker.
   */
  app.get("/api/portal/contentflow/prompts", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { trade, goal, asset, style, search } = req.query as Record<string, string | undefined>;
      const filtered = filterPromptTemplates({ trade, goal, asset, style, search });

      /* Strip the full template body — UI uses the lighter shape until
       * the customer clicks Use → which calls the :id detail endpoint. */
      const compact = filtered.map((t) => ({
        id: t.id,
        patternId: t.patternId,
        trade: t.trade,
        goal: t.goal,
        asset: t.asset,
        title: t.title,
        description: t.description,
        styleHints: t.styleHints,
        popularity: t.popularity,
        tags: t.tags,
        previewImageUrl: t.previewImageUrl ?? null,
      }));

      res.json({
        prompts: compact,
        total: PROMPT_TEMPLATE_COUNT,
        filtered_count: compact.length,
        top_tags: topTagsForTemplates(filtered),
      });
    } catch (err: any) {
      log.error("[portal/prompts][list]", err?.message || err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/portal/contentflow/prompts/:id
   * Returns the full template (including the prompt body).
   */
  app.get("/api/portal/contentflow/prompts/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const tmpl = getPromptTemplate(req.params.id);
      if (!tmpl) return res.status(404).json({ error: "prompt not found", code: "prompt_not_found" });
      res.json({ prompt: tmpl });
    } catch (err: any) {
      log.error("[portal/prompts][get]", err?.message || err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/portal/contentflow/prompts/:id/preview
   *
   * Interpolate the template's {{handlebar}} placeholders against the
   * customer's BrandProfile and return the FINAL prompt text. No
   * generation — this is the cheap iteration loop the customer uses
   * to tune the prompt before they spend an image/video credit.
   *
   * Body (optional): { overrides: PromptVariables } — last-mile edits
   * the customer wants applied without saving to the BrandProfile.
   */
  app.post("/api/portal/contentflow/prompts/:id/preview", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const tmpl = getPromptTemplate(req.params.id);
      if (!tmpl) return res.status(404).json({ error: "prompt not found", code: "prompt_not_found" });

      const client = await storage.getClientById(clientId);
      const profile = readBrandProfile(client);

      /* Map BrandProfile → PromptVariables. The Phase 2 prefill flow
       * will add business_name / hero_testimonial / year_founded to
       * the BrandProfile schema; until then we fall back to plausible
       * placeholders from interpolatePromptTemplate(). */
      const meta = ((client?.metadata as Record<string, any>) || {}) as Record<string, any>;
      const cb = (meta.content_brand && typeof meta.content_brand === "object" ? meta.content_brand : {}) as Record<string, any>;

      const vars: PromptVariables = {
        businessName: typeof cb.business_name === "string" ? cb.business_name : (client?.business_name as string | undefined),
        city: profile.location_cue?.split(",")[0]?.trim(),
        serviceUSP: profile.unique_selling_points,
        serviceFocus: profile.service_focus?.[0],
        customerQuote: typeof cb.hero_testimonial === "string" ? cb.hero_testimonial : undefined,
        brandPrimary: profile.primary_color,
        brandSecondary: profile.secondary_color,
        tone: profile.tone,
        audience: profile.target_audience,
        yearFounded: typeof cb.year_founded === "number" || typeof cb.year_founded === "string" ? cb.year_founded : undefined,
      };

      /* Optional inline overrides — accepted as a flat object of
       * the same keys. Strings only, no length > 300 chars. */
      const rawOverrides = (req.body && typeof req.body === "object" && req.body.overrides) || {};
      const overrides: PromptVariables = {};
      for (const k of Object.keys(rawOverrides)) {
        if (!(k in vars)) continue;
        const v = (rawOverrides as Record<string, unknown>)[k];
        if (typeof v === "string" && v.trim().length > 0 && v.length <= 300) {
          (overrides as Record<string, string>)[k] = v.trim();
        }
      }

      const merged: PromptVariables = { ...vars, ...overrides };
      const preview = interpolatePromptTemplate(tmpl.template, merged);

      res.json({
        prompt_id: tmpl.id,
        template: tmpl.template,
        preview,
        variables_used: merged,
      });
    } catch (err: any) {
      log.error("[portal/prompts][preview]", err?.message || err);
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
