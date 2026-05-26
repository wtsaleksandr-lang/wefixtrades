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
 *   POST   /api/portal/contentflow/generate                    (Phase 3)
 *   GET    /api/portal/contentflow/custom-prompts              (Phase 3)
 *   POST   /api/portal/contentflow/custom-prompts              (Phase 3)
 *   DELETE /api/portal/contentflow/custom-prompts/:id          (Phase 3)
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
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
  isImageStylePresetId,
  applyStylePreset,
  type ImageStylePresetId,
} from "../../services/contentflow/imageStylePresets";
import {
  PROMPT_TEMPLATE_COUNT,
  filterPromptTemplates,
  topTagsForTemplates,
  getPromptTemplate,
  interpolatePromptTemplate,
  type PromptVariables,
} from "@shared/contentflow/promptLibrary";
import {
  extractBusinessProfileFromUrl,
  prefillPromptTokens,
  defaultSelectionsFromProfile,
  type ExtractedBusinessProfile,
  type PrefilledToken,
} from "../../services/contentflow/profilePrefill";
import { generateImageViaOrchestrator } from "../../services/contentflow/imageOrchestrator";
import { generateVideoViaOrchestrator } from "../../services/contentflow/videoOrchestrator";
import { generateContentflowText } from "../../services/contentflow/aiText";
import { listPending as listPipelineForClient } from "../../services/contentflow/api";
import { humanizeViaOrchestrator } from "../../services/contentflow/humanizationOrchestrator";
import { writeAudit } from "../../lib/auditLog";
import { createLogger } from "../../lib/logger";
import { withClientIdOrPreview } from "../../middleware/adminPreviewSafe";

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

/**
 * Middleware-style helper: resolve client_id or send a response and return null.
 *
 * Wave 12C: admin users without a linked clients row are in "preview mode".
 * Instead of 403 (which the UI shows as a red "Failed to load" boundary), we
 * send 200 with `{previewMode:true, persisted:false, ...previewShape}` so the
 * portal page renders its empty state. Real customers still get 403.
 *
 * `previewShape` defaults to {} — routes that need a richer empty shape (e.g.
 * `{ articles: [] }`) pass it explicitly.
 */
async function withClientId(
  req: Request,
  res: Response,
  previewShape: Record<string, unknown> = {},
  mode: "read" | "write" = "read",
): Promise<number | null> {
  return withClientIdOrPreview(req, res, { previewShape, mode });
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
      /* Wave 11B Issue 9 + Wave 12C — admin-preview mode soft-success.
       *
       * `requireClient` lets admins through to the portal so they can
       * preview the customer surface, but admins have no linked clients
       * row. The shared `withClientIdOrPreview` helper (Wave 12C) returns
       * 200 `{previewMode:true, persisted:false, brand_profile:null}` for
       * admins without a client, and 403 `no_client_linked` for real
       * customers whose account is broken — no security weakening.
       */
      const clientId = await withClientId(
        req,
        res,
        { ok: true, brand_profile: null },
        "write",
      );
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

      const tmpl = getPromptTemplate(String(req.params.id || ""));
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

      const tmpl = getPromptTemplate(String(req.params.id || ""));
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

  /* ─── Phase 2: AI-prefill workflow (URL → profile → token chips) ─── */

  /**
   * POST /api/portal/contentflow/profile/from-url
   * Body: { url: string }
   *
   * Step 1 of the Phase 2 flow. Fetches the customer's website,
   * extracts visible text + meta tags + JSON-LD, and calls Claude
   * Haiku to return a structured business profile (business_name,
   * services, service_area, target_persona, brand_voice_adjectives,
   * usps, hero_testimonials, primary_trade, also_offers_trades).
   *
   * Does NOT save to the database — the customer reviews the result
   * in the editor (Step 2 UI) before the PATCH /brand-profile call
   * persists their edits.
   */
  app.post("/api/portal/contentflow/profile/from-url", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const rawUrl = typeof req.body?.url === "string" ? req.body.url.trim() : "";
      if (!rawUrl) return res.status(400).json({ error: "url is required", code: "missing_url" });
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        return res.status(400).json({ error: "url is not parseable", code: "invalid_url" });
      }
      if (!/^https?:$/.test(parsed.protocol)) {
        return res.status(400).json({ error: "url must be http(s)", code: "invalid_url" });
      }
      /* Defense-in-depth: refuse private / loopback hosts so a bored
       * customer can't ask us to fetch internal services. */
      const host = parsed.hostname.toLowerCase();
      if (host === "localhost" || host.endsWith(".local") || host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
        return res.status(400).json({ error: "private hosts not allowed", code: "private_host" });
      }

      const profile = await extractBusinessProfileFromUrl(parsed.toString());
      res.json({ ok: true, source_url: parsed.toString(), profile });
    } catch (err: any) {
      log.error("[portal/profile/from-url]", err?.message || err);
      res.status(500).json({ error: err?.message || "extraction failed" });
    }
  });

  /**
   * POST /api/portal/contentflow/prompts/:id/prefill
   * Body (optional):
   *   {
   *     profile?: ExtractedBusinessProfile   // when omitted, falls back to saved BrandProfile
   *     current?: Partial<Record<placeholder, string>>  // optional starting selections
   *   }
   *
   * Step 3 of the Phase 2 flow. For each {{placeholder}} in the
   * template, the AI generates 4–6 alternatives anchored to the
   * supplied (or saved) profile. Returns a PrefilledPrompt with:
   *
   *   { templateId, tokens: [{ placeholder, selected, alternatives }],
   *     rendered: "the prompt with selections inlined" }
   *
   * The rendered field is what the modal previews; tokens carry the
   * click-to-swap state. No DB writes.
   */
  app.post("/api/portal/contentflow/prompts/:id/prefill", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const tmpl = getPromptTemplate(String(req.params.id || ""));
      if (!tmpl) return res.status(404).json({ error: "prompt not found", code: "prompt_not_found" });

      /* Profile preference order:
       *   1. Caller-supplied (e.g. just-extracted, not yet saved)
       *   2. Customer's saved brand profile (mapped onto the
       *      ExtractedBusinessProfile shape)
       */
      let profile: ExtractedBusinessProfile;
      if (req.body && typeof req.body === "object" && req.body.profile && typeof req.body.profile === "object") {
        profile = req.body.profile as ExtractedBusinessProfile;
      } else {
        const client = await storage.getClientById(clientId);
        const brand = readBrandProfile(client);
        const meta = ((client?.metadata as Record<string, any>) || {}) as Record<string, any>;
        const cb = (meta.content_brand && typeof meta.content_brand === "object" ? meta.content_brand : {}) as Record<string, any>;
        profile = {
          business_name: typeof cb.business_name === "string" ? cb.business_name : (client?.business_name as string | undefined),
          services: brand.service_focus,
          service_area: brand.location_cue,
          target_persona: brand.target_audience,
          brand_voice_adjectives: brand.tone ? [brand.tone] : undefined,
          usps: brand.unique_selling_points ? [brand.unique_selling_points] : undefined,
          hero_testimonials: typeof cb.hero_testimonial === "string"
            ? [{ text: cb.hero_testimonial }]
            : Array.isArray(cb.hero_testimonials) ? cb.hero_testimonials : undefined,
          primary_trade: typeof cb.primary_trade === "string" ? cb.primary_trade : undefined,
          also_offers_trades: Array.isArray(cb.also_offers_trades) ? cb.also_offers_trades : undefined,
        };
      }

      const rawCurrent = (req.body && typeof req.body === "object" && req.body.current) || {};
      const current: Partial<Record<keyof PromptVariables, string>> = {};
      for (const k of Object.keys(rawCurrent)) {
        const v = (rawCurrent as Record<string, unknown>)[k];
        if (typeof v === "string" && v.trim().length > 0 && v.length <= 300) {
          (current as Record<string, string>)[k] = v.trim();
        }
      }

      const prefilled = await prefillPromptTokens({
        templateId: tmpl.id,
        template: tmpl.template,
        profile,
        current,
      });

      /* Echo a defaultSelections map so the client can render even if
       * the user hasn't clicked a chip yet. */
      const defaults = defaultSelectionsFromProfile(profile, current);

      res.json({ ok: true, template: tmpl.template, prefilled, defaults });
    } catch (err: any) {
      log.error("[portal/prompts][prefill]", err?.message || err);
      res.status(500).json({ error: err?.message || "prefill failed" });
    }
  });

  /**
   * POST /api/portal/contentflow/prompts/:id/draft
   * Body: { tokens: PrefilledToken[], finalPrompt: string }
   *
   * Step 5 stub. Records the current prompt state to clients.metadata
   * for the Phase 3 worker to pick up. No actual generation — the
   * client toasts "Phase 3 ships generation pipeline" and stores the
   * draft so nothing is lost between sessions.
   *
   * Persisted to clients.metadata.content_brand.last_draft as
   *   { template_id, tokens, final_prompt, saved_at }
   *
   * Phase 3 will replace this with a real content_drafts row.
   */
  app.post("/api/portal/contentflow/prompts/:id/draft", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const tmpl = getPromptTemplate(String(req.params.id || ""));
      if (!tmpl) return res.status(404).json({ error: "prompt not found", code: "prompt_not_found" });

      const rawTokens = Array.isArray(req.body?.tokens) ? (req.body.tokens as unknown[]) : [];
      const finalPrompt = typeof req.body?.finalPrompt === "string" ? req.body.finalPrompt.slice(0, 8_000) : "";

      const tokens: PrefilledToken[] = [];
      for (const t of rawTokens.slice(0, 16)) {
        if (!t || typeof t !== "object") continue;
        const placeholder = (t as any).placeholder;
        const selected = (t as any).selected;
        const alternatives = (t as any).alternatives;
        if (typeof placeholder !== "string") continue;
        if (typeof selected !== "string") continue;
        if (!Array.isArray(alternatives)) continue;
        tokens.push({
          placeholder: placeholder as keyof PromptVariables,
          selected: selected.slice(0, 300),
          alternatives: alternatives.filter((a) => typeof a === "string").slice(0, 6).map((a: string) => a.slice(0, 300)),
        });
      }

      const client = await storage.getClientById(clientId);
      const meta = ((client?.metadata as Record<string, any>) || {}) as Record<string, any>;
      const cb = (meta.content_brand && typeof meta.content_brand === "object" ? meta.content_brand : {}) as Record<string, any>;
      const updatedMeta = {
        ...meta,
        content_brand: {
          ...cb,
          last_draft: {
            template_id: tmpl.id,
            tokens,
            final_prompt: finalPrompt,
            saved_at: new Date().toISOString(),
          },
        },
      };
      await storage.updateClient(clientId, { metadata: updatedMeta } as any);

      res.json({ ok: true, template_id: tmpl.id, saved_at: updatedMeta.content_brand.last_draft.saved_at });
    } catch (err: any) {
      log.error("[portal/prompts][draft]", err?.message || err);
      res.status(500).json({ error: err?.message || "draft save failed" });
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

  /* ─── Phase 3: Generate endpoint + custom-prompt save ──────────────
   *
   * Phase 3 wires the modal's Generate button to the existing image
   * orchestrator (PR #786) and article humanize pipeline (PR #787),
   * persists a content_drafts row per generation, and adds tier-gated
   * custom-prompt save (Free=0, Starter=5, Creator=5, Studio=25,
   * Agency=unlimited). Tier resolution reads client_services for an
   * active contentflow-* row; tier-less customers fall through to
   * "free". No DB migration — custom prompts live on
   * clients.metadata.content_brand.custom_prompts; this will move
   * to a dedicated table in Phase 5 (TODO comment near write path).
   */

  /**
   * POST /api/portal/contentflow/generate
   *
   * Body: { templateId, tokens?, rendered, assetType }
   * Returns: { ok, draftId, assetUrl?, content?, tier, ... }
   *
   * Asset routing:
   *   - "image":   generateImageViaOrchestrator(rendered + style preset)
   *   - "article": generateContentflowText() → humanizeViaOrchestrator()
   *   - "video":   402 if free/starter; Creator+ runs the multi-provider
   *                video orchestrator (Hugging Face CogVideoX → Replicate
   *                Wan/SVD → Google Veo → Replicate Hunyuan/ZeroScope).
   *                Gated globally by VIDEO_GENERATION_ENABLED.
   *   - "multi":   image + article in parallel (Promise.all).
   *
   * Every generation writes a content_drafts row (surface='contentflow_portal',
   * kind matches assetType) so the customer can see the output in their
   * library. Audit row on each success/failure.
   */
  app.post("/api/portal/contentflow/generate", requireClient, async (req: Request, res: Response) => {
    const t0 = Date.now();
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { templateId, tokens, rendered, assetType } = (req.body || {}) as {
        templateId?: string;
        tokens?: unknown;
        rendered?: string;
        assetType?: string;
      };

      /* ── Validate body ────────────────────────────────────────── */
      if (!templateId || typeof templateId !== "string") {
        return res.status(400).json({ error: "templateId is required", code: "missing_template_id" });
      }
      const tmpl = getPromptTemplate(templateId);
      if (!tmpl) return res.status(404).json({ error: "prompt not found", code: "prompt_not_found" });
      if (!rendered || typeof rendered !== "string" || !rendered.trim()) {
        return res.status(400).json({ error: "rendered prompt is required", code: "missing_rendered" });
      }
      if (rendered.length > 8_000) {
        return res.status(400).json({ error: "rendered prompt too long (max 8000)", code: "prompt_too_long" });
      }
      const VALID_ASSETS = new Set(["image", "article", "video", "multi"]);
      if (!assetType || !VALID_ASSETS.has(assetType)) {
        return res.status(400).json({ error: "assetType must be one of image|article|video|multi", code: "invalid_asset_type" });
      }

      const tier = await resolveContentflowTier(clientId);

      /* ── Video: tier gate at Free/Starter (402), then run the
       *    multi-provider orchestrator (PR follow-up to #791). Free
       *    + Starter still get 402; Creator+ goes through the
       *    Hugging Face → Replicate → Veo rotation. */
      if (assetType === "video") {
        if (tier === "free" || tier === "starter") {
          writeAudit({
            actorType: "system",
            actorId: req.user?.id ?? null,
            action: "contentflow.generate.blocked",
            entityType: "client",
            entityId: String(clientId),
            metadata: { template_id: templateId, asset_type: assetType, reason: "tier_below_creator", tier },
          });
          return res.status(402).json({
            error: "Video requires Creator+ tier.",
            code: "tier_too_low",
            tier,
            upgrade_required: true,
          });
        }

        /* Persist a draft row up front so a mid-pipeline failure still
         * leaves a record the customer can re-run. */
        const videoDraft = await storage.createContentDraft({
          client_id: clientId,
          client_service_id: null,
          kind: "video",
          surface: "contentflow_portal",
          title: tmpl.title,
          body: null,
          excerpt: null,
          target_platform: null,
          target_url: null,
          metadata: {
            template_id: templateId,
            pattern_id: tmpl.patternId,
            trade: tmpl.trade,
            goal: tmpl.goal,
            asset: tmpl.asset,
            tokens: Array.isArray(tokens) ? tokens : [],
            rendered_prompt: rendered,
            tier_at_generation: tier,
            source: "phase3_generate_endpoint_video",
            generation_status: "in_progress",
          } as any,
          quality_score: null,
          quality_notes: null,
          status: "draft",
          auto_approved: false,
          requires_admin_review: false,
          requires_client_review: false,
          admin_approved_at: null,
          admin_approved_by: null,
          client_approved_at: null,
          rejected_at: null,
          rejection_reason: null,
          linked_social_post_id: null,
          linked_task_id: null,
          generation_cost_micro_usd: null,
          created_by: "system",
        } as any);

        const videoDraftId = videoDraft.id;
        const videoResult = await generateVideoViaOrchestrator(rendered, { customerTier: tier });

        if (!videoResult.ok) {
          await storage.updateContentDraft(videoDraftId, {
            metadata: {
              template_id: templateId,
              tier_at_generation: tier,
              rendered_prompt: rendered,
              generation_status: "failed",
              generation_errors: [`video:${videoResult.reason}`],
              fallback_chain: videoResult.fallback_chain,
              duration_ms: Date.now() - t0,
            } as any,
            status: "failed",
          } as any);
          writeAudit({
            actorType: "system",
            actorId: req.user?.id ?? null,
            action: "contentflow.video.generated",
            entityType: "content_draft",
            entityId: String(videoDraftId),
            metadata: {
              client_id: clientId,
              template_id: templateId,
              succeeded: false,
              reason: videoResult.reason,
              fallback_chain: videoResult.fallback_chain,
              tier,
            },
          });
          return res.status(502).json({
            ok: false,
            draftId: videoDraftId,
            tier,
            errors: [videoResult.reason],
            fallback_chain: videoResult.fallback_chain,
            message: "Video generation failed across all providers. Try again or contact support.",
          });
        }

        /* Some providers return URLs (Replicate, Veo); others return
         * raw bytes (Hugging Face). For buffer-mode, encode as data URI
         * so the browser can play directly. Future PR: persist to R2. */
        const videoUrl = videoResult.videoUrl
          ?? (videoResult.videoBuffer ? `data:video/mp4;base64,${videoResult.videoBuffer.toString("base64")}` : undefined);

        await storage.updateContentDraft(videoDraftId, {
          metadata: {
            template_id: templateId,
            pattern_id: tmpl.patternId,
            trade: tmpl.trade,
            goal: tmpl.goal,
            asset: tmpl.asset,
            tokens: Array.isArray(tokens) ? tokens : [],
            rendered_prompt: rendered,
            tier_at_generation: tier,
            source: "phase3_generate_endpoint_video",
            generation_status: "succeeded",
            provider_used: videoResult.providerUsed,
            fallback_chain: videoResult.fallback_chain,
            media_plan: { video_url: videoUrl, prompt: rendered, provider: videoResult.providerUsed, resolution: videoResult.resolution, duration_sec: videoResult.durationSec },
            duration_ms: Date.now() - t0,
          } as any,
          status: "draft",
        } as any);

        writeAudit({
          actorType: "system",
          actorId: req.user?.id ?? null,
          action: "contentflow.video.generated",
          entityType: "content_draft",
          entityId: String(videoDraftId),
          metadata: {
            client_id: clientId,
            template_id: templateId,
            provider_id: videoResult.providerUsed,
            duration_sec: videoResult.durationSec,
            cost: videoResult.cost,
            resolution: videoResult.resolution,
            fallback_chain: videoResult.fallback_chain,
            tier,
            succeeded: true,
          },
        });

        return res.json({
          ok: true,
          draftId: videoDraftId,
          tier,
          videoUrl,
          providerUsed: videoResult.providerUsed,
          durationSec: videoResult.durationSec,
          resolution: videoResult.resolution,
          cost: videoResult.cost,
          fallback_chain: videoResult.fallback_chain,
        });
      }

      /* ── Resolve customer brand + image style preset for image gen. */
      const client = await storage.getClientById(clientId);
      const brand = readBrandProfile(client);
      const tradeType = (client?.trade_type as string | null) ?? null;
      const customerStylePreset =
        isImageStylePresetId(brand.image_style_preset)
          ? brand.image_style_preset
          : defaultPresetForIndustry(tradeType);

      /* ── Single insert of a draft row that we then attach the result
       *    to. Doing this up front means a failure mid-pipeline still
       *    leaves a record the customer can re-run. */
      const draftKind =
        assetType === "image" ? "image"
        : assetType === "article" ? "article"
        : "multi";
      const insertedDraft = await storage.createContentDraft({
        client_id: clientId,
        client_service_id: null,
        kind: draftKind,
        surface: "contentflow_portal",
        title: tmpl.title,
        body: null,
        excerpt: null,
        target_platform: null,
        target_url: null,
        metadata: {
          template_id: templateId,
          pattern_id: tmpl.patternId,
          trade: tmpl.trade,
          goal: tmpl.goal,
          asset: tmpl.asset,
          tokens: Array.isArray(tokens) ? tokens : [],
          rendered_prompt: rendered,
          style_preset: customerStylePreset,
          tier_at_generation: tier,
          source: "phase3_generate_endpoint",
          generation_status: "in_progress",
        } as any,
        quality_score: null,
        quality_notes: null,
        status: "draft",
        auto_approved: false,
        requires_admin_review: false,
        requires_client_review: false,
        admin_approved_at: null,
        admin_approved_by: null,
        client_approved_at: null,
        rejected_at: null,
        rejection_reason: null,
        linked_social_post_id: null,
        linked_task_id: null,
        generation_cost_micro_usd: null,
        created_by: "system",
      } as any);

      const draftId = insertedDraft.id;

      /* ── Image branch — orchestrator + persist URL on the draft. */
      let assetUrl: string | undefined;
      let articleContent: string | undefined;
      const errors: string[] = [];

      const runImage = async (): Promise<void> => {
        const finalPrompt = applyStyleSuffixToPrompt(rendered, customerStylePreset);
        const orch = await generateImageViaOrchestrator(finalPrompt, {
          customerTier: tier,
        });
        if (orch.ok) {
          /* Persist as a data URI for now — Phase 3 ships without R2
           * coupling on this surface; the existing publish pipeline
           * uses R2, but here the asset is shown directly in the
           * browser. Cap at ~1.2 MB to stay metadata-safe. */
          const b64 = orch.imageBuffer.toString("base64");
          assetUrl = `data:image/png;base64,${b64}`;
        } else {
          errors.push(`image:${orch.reason}`);
        }
      };

      const runArticle = async (): Promise<void> => {
        const draftRaw = await generateContentflowText({
          system: "You are an SEO content writer for a local trade-services business. Produce a single short-form article (300-500 words) that answers the brief. Markdown headings allowed (## only). No fabricated testimonials, certifications, or prices. Plain prose only.",
          user: rendered,
          maxTokens: 1500,
        }).catch((e: any) => ({ text: "", provider: "error", costMicroUsd: 0, _err: e?.message } as any));
        const draftText = (draftRaw as any).text as string;
        if (!draftText || !draftText.trim()) {
          errors.push(`article:gen_empty${(draftRaw as any)._err ? `:${(draftRaw as any)._err}` : ""}`);
          return;
        }
        try {
          const humanized = await humanizeViaOrchestrator(draftText, {
            clientId,
            industry: tradeType ?? undefined,
            targetWordCount: 400,
            sourceProvider: (draftRaw as any).provider === "openai" ? "openai" : "anthropic",
          });
          articleContent = humanized.humanized || draftText;
        } catch (err: any) {
          /* Humanizer failure is non-fatal — fall back to the LLM draft. */
          articleContent = draftText;
          log.warn("[generate] humanizer fell through", { err: err?.message });
        }
      };

      try {
        if (assetType === "image") {
          await runImage();
        } else if (assetType === "article") {
          await runArticle();
        } else if (assetType === "multi") {
          await Promise.all([runImage(), runArticle()]);
        }
      } catch (err: any) {
        /* Top-level pipeline crash — log + record on the draft. */
        log.error("[generate] pipeline crash", { err: err?.message, draftId });
        errors.push(`pipeline:${err?.message || "unknown"}`);
      }

      const succeeded =
        (assetType === "image" && !!assetUrl) ||
        (assetType === "article" && !!articleContent) ||
        (assetType === "multi" && (!!assetUrl || !!articleContent));

      /* ── Persist result on the draft. */
      await storage.updateContentDraft(draftId, {
        body: articleContent ?? null,
        metadata: {
          template_id: templateId,
          pattern_id: tmpl.patternId,
          trade: tmpl.trade,
          goal: tmpl.goal,
          asset: tmpl.asset,
          tokens: Array.isArray(tokens) ? tokens : [],
          rendered_prompt: rendered,
          style_preset: customerStylePreset,
          tier_at_generation: tier,
          source: "phase3_generate_endpoint",
          generation_status: succeeded ? "succeeded" : "failed",
          generation_errors: errors,
          media_plan: assetUrl ? { image_url: assetUrl, prompt: rendered, image_style_preset: customerStylePreset } : null,
          duration_ms: Date.now() - t0,
        } as any,
        status: succeeded ? "draft" : "failed",
      } as any);

      writeAudit({
        actorType: "system",
        actorId: req.user?.id ?? null,
        action: "contentflow.generate.complete",
        entityType: "content_draft",
        entityId: String(draftId),
        metadata: {
          client_id: clientId,
          template_id: templateId,
          asset_type: assetType,
          tier,
          succeeded,
          errors,
          has_image: !!assetUrl,
          has_article: !!articleContent,
          style_preset: customerStylePreset,
          duration_ms: Date.now() - t0,
        },
      });

      if (!succeeded) {
        return res.status(502).json({
          ok: false,
          draftId,
          tier,
          errors,
          message: "Generation pipeline returned no asset. Try again or contact support.",
        });
      }

      res.json({
        ok: true,
        draftId,
        tier,
        assetUrl,
        content: articleContent,
        stylePreset: customerStylePreset,
      });
    } catch (err: any) {
      log.error("[portal/contentflow/generate]", err?.message || err);
      res.status(500).json({ error: err?.message || "generate failed" });
    }
  });

  /* ─── Custom-prompt save (tier-gated) ─────────────────────────────
   *
   * Storage: clients.metadata.content_brand.custom_prompts. JSON-only
   * for Phase 3 — Phase 5 will lift this into a dedicated table once
   * we wire share-with-team and library search. TODO(phase5-migration).
   *
   * Limits per tier:
   *   free      → 0    (returns 402 with upgrade message)
   *   starter   → 5
   *   creator   → 5
   *   studio    → 25
   *   agency    → Infinity (unlimited)
   */

  app.get("/api/portal/contentflow/custom-prompts", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const tier = await resolveContentflowTier(clientId);
      const cap = customPromptCapForTier(tier);
      const items = await readCustomPrompts(clientId);
      res.json({
        ok: true,
        tier,
        cap: Number.isFinite(cap) ? cap : null,
        used: items.length,
        remaining: Number.isFinite(cap) ? Math.max(0, cap - items.length) : null,
        custom_prompts: items,
      });
    } catch (err: any) {
      log.error("[portal/custom-prompts][list]", err?.message || err);
      res.status(500).json({ error: err?.message });
    }
  });

  app.post("/api/portal/contentflow/custom-prompts", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { baseTemplateId, customizedRendered, customizedTokens, title } = (req.body || {}) as {
        baseTemplateId?: string;
        customizedRendered?: string;
        customizedTokens?: unknown;
        title?: string;
      };
      if (!baseTemplateId || typeof baseTemplateId !== "string") {
        return res.status(400).json({ error: "baseTemplateId is required", code: "missing_base_template" });
      }
      if (!customizedRendered || typeof customizedRendered !== "string" || !customizedRendered.trim()) {
        return res.status(400).json({ error: "customizedRendered is required", code: "missing_rendered" });
      }
      if (customizedRendered.length > 8_000) {
        return res.status(400).json({ error: "customizedRendered too long (max 8000)", code: "prompt_too_long" });
      }
      const cleanTitle = typeof title === "string" && title.trim().length > 0
        ? title.trim().slice(0, 200)
        : "Untitled prompt";

      const tier = await resolveContentflowTier(clientId);
      const cap = customPromptCapForTier(tier);
      if (cap <= 0) {
        return res.status(402).json({
          error: "Upgrade to Starter to save custom prompts",
          code: "tier_no_save",
          tier,
          upgrade_required: true,
        });
      }

      const existing = await readCustomPrompts(clientId);
      if (Number.isFinite(cap) && existing.length >= cap) {
        return res.status(402).json({
          error: `Your ${tier} plan caps custom prompts at ${cap}. Delete one or upgrade to add more.`,
          code: "tier_cap_reached",
          tier,
          cap,
          used: existing.length,
          upgrade_required: true,
        });
      }

      /* Sanitize the tokens array — same shape as the prefill response. */
      const safeTokens = Array.isArray(customizedTokens)
        ? (customizedTokens as unknown[]).slice(0, 16).filter((t): t is Record<string, unknown> =>
            !!t && typeof t === "object",
          ).map((t) => {
            const placeholder = (t as any).placeholder;
            const selected = (t as any).selected;
            const alternatives = (t as any).alternatives;
            return {
              placeholder: typeof placeholder === "string" ? placeholder.slice(0, 60) : "",
              selected: typeof selected === "string" ? selected.slice(0, 300) : "",
              alternatives: Array.isArray(alternatives)
                ? alternatives.filter((a) => typeof a === "string").slice(0, 6).map((a: string) => a.slice(0, 300))
                : [],
            };
          })
          .filter((t) => t.placeholder && t.selected)
        : [];

      const item = {
        id: `cf_custom_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
        baseTemplateId,
        title: cleanTitle,
        rendered: customizedRendered.slice(0, 8_000),
        tokens: safeTokens,
        savedAt: new Date().toISOString(),
      };

      const next = [...existing, item];
      await writeCustomPrompts(clientId, next);

      writeAudit({
        actorType: "system",
        actorId: req.user?.id ?? null,
        action: "contentflow.custom_prompt.created",
        entityType: "client",
        entityId: String(clientId),
        metadata: {
          custom_prompt_id: item.id,
          base_template_id: baseTemplateId,
          tier,
          total_after_save: next.length,
        },
      });

      res.json({ ok: true, tier, custom_prompt: item, used: next.length, cap: Number.isFinite(cap) ? cap : null });
    } catch (err: any) {
      log.error("[portal/custom-prompts][create]", err?.message || err);
      res.status(500).json({ error: err?.message });
    }
  });

  app.delete("/api/portal/contentflow/custom-prompts/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const id = String(req.params.id || "");
      if (!id) return res.status(400).json({ error: "id is required", code: "missing_id" });

      const existing = await readCustomPrompts(clientId);
      const before = existing.length;
      const next = existing.filter((p) => p.id !== id);
      if (next.length === before) {
        return res.status(404).json({ error: "custom prompt not found", code: "not_found" });
      }
      await writeCustomPrompts(clientId, next);

      writeAudit({
        actorType: "system",
        actorId: req.user?.id ?? null,
        action: "contentflow.custom_prompt.deleted",
        entityType: "client",
        entityId: String(clientId),
        metadata: { custom_prompt_id: id, remaining: next.length },
      });

      res.json({ ok: true, deleted_id: id, remaining: next.length });
    } catch (err: any) {
      log.error("[portal/custom-prompts][delete]", err?.message || err);
      res.status(500).json({ error: err?.message });
    }
  });

  /* ─── Wave 20: per-client content pipeline view ──────────────────── */

  /**
   * GET /api/portal/contentflow/pipeline
   * Returns the calling client's recent content requests across
   * RankFlow + SocialSync + standalone ContentFlow. Used by the
   * portal banner that surfaces "Generation failed — retry?" and
   * by the in-portal approval queue.
   */
  app.get("/api/portal/contentflow/pipeline", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { items: [] });
      if (!clientId) return;
      const stage = (req.query.stage as string | undefined) ?? undefined;
      const items = await listPipelineForClient({
        clientId,
        currentStage: stage as any,
        limit: 100,
      });
      res.json({ items });
    } catch (err: any) {
      log.error("[portal/contentflow/pipeline]", err?.message || err);
      res.status(500).json({ error: err?.message });
    }
  });
}

/* ──────────────────────────────────────────────────────────────────
 * Phase 3 helpers — tier resolution, custom-prompt persistence,
 * style-suffix glue. Kept in this file because each is small and
 * only used by the routes above; promoted to a service if reused.
 * ────────────────────────────────────────────────────────────────── */

type ContentflowTier = "free" | "starter" | "creator" | "studio" | "agency";

/**
 * Resolve a client's effective ContentFlow tier from their active
 * client_services rows. Returns the highest tier among
 * contentflow-* service ids; falls back to "free" if no row is
 * active. Order: agency > studio > creator > starter > free.
 */
async function resolveContentflowTier(clientId: number): Promise<ContentflowTier> {
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

function customPromptCapForTier(tier: ContentflowTier): number {
  switch (tier) {
    case "free": return 0;
    case "starter": return 5;
    case "creator": return 5;
    case "studio": return 25;
    case "agency": return Number.POSITIVE_INFINITY;
  }
}

interface SavedCustomPrompt {
  id: string;
  baseTemplateId: string;
  title: string;
  rendered: string;
  tokens: Array<{ placeholder: string; selected: string; alternatives: string[] }>;
  savedAt: string;
}

async function readCustomPrompts(clientId: number): Promise<SavedCustomPrompt[]> {
  const client = await storage.getClientById(clientId);
  const meta = ((client?.metadata as Record<string, any>) || {}) as Record<string, any>;
  const cb = (meta.content_brand && typeof meta.content_brand === "object" ? meta.content_brand : {}) as Record<string, any>;
  const arr = Array.isArray(cb.custom_prompts) ? cb.custom_prompts : [];
  return arr.filter((p: any) =>
    p && typeof p === "object"
      && typeof p.id === "string"
      && typeof p.baseTemplateId === "string"
      && typeof p.rendered === "string",
  ) as SavedCustomPrompt[];
}

async function writeCustomPrompts(clientId: number, items: SavedCustomPrompt[]): Promise<void> {
  /* TODO(phase5-migration): move to a dedicated contentflow_custom_prompts
   * table once we wire share-with-team / library search. Today we
   * store on clients.metadata.content_brand.custom_prompts so Phase 3
   * ships without a migration. */
  const client = await storage.getClientById(clientId);
  const meta = ((client?.metadata as Record<string, any>) || {}) as Record<string, any>;
  const cb = (meta.content_brand && typeof meta.content_brand === "object" ? meta.content_brand : {}) as Record<string, any>;
  const next = {
    ...meta,
    content_brand: { ...cb, custom_prompts: items },
  };
  await storage.updateClient(clientId, { metadata: next } as any);
}

/**
 * Append the customer's image-style preset hint to the rendered prompt.
 */
function applyStyleSuffixToPrompt(rendered: string, preset: string): string {
  if (isImageStylePresetId(preset)) {
    return applyStylePreset(rendered, preset as ImageStylePresetId);
  }
  return rendered;
}
