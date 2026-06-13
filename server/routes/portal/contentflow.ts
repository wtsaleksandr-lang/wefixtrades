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
 *   POST   /api/portal/contentflow/generate                    (Phase 3; templateId OR customPromptId)
 *   GET    /api/portal/contentflow/custom-prompts              (Phase 3)
 *   POST   /api/portal/contentflow/custom-prompts              (Phase 3)
 *   DELETE /api/portal/contentflow/custom-prompts/:id          (Phase 3)
 *   GET    /api/portal/contentflow/cms-config                   (self-serve)
 *   PUT    /api/portal/contentflow/cms-config                   (self-serve)
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { requireClient } from "../../auth";
import { storage } from "../../storage";
import { db } from "../../db";
import { clients } from "@shared/schema";
import type { ContentDraft } from "@shared/schema";
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
} from "../../services/contentflow/profilePrefill";
import { generateImageViaOrchestrator } from "../../services/contentflow/imageOrchestrator";
import {
  describeReferenceAndComposePrompt,
  buildPhotorealPrompt,
  moderatePromptText,
} from "../../services/contentflow/referenceReplication";
import { generateVideoViaOrchestrator, VIDEO_PROVIDERS } from "../../services/contentflow/videoOrchestrator";
import { generateContentflowText } from "../../services/contentflow/aiText";
import {
  type IntakeBrief,
  type SlotFill,
  type BriefLayer,
  parseIntakePartial,
  emptyBrief,
} from "@shared/contentflow/intakeBrief";
import {
  defaultBriefExtractor,
  extractBriefFromPrompt,
  fillFromProfile,
  scoreSufficiency,
  composeBriefLayer,
  assemblePreflight,
  aspectRatioForPlacement,
  estimateVideoCost,
  type BriefExtractor,
} from "../../services/contentflow/intakeSufficiency";
import { listPending as listPipelineForClient } from "../../services/contentflow/api";
import { humanizeViaOrchestrator } from "../../services/contentflow/humanizationOrchestrator";
import { writeAudit } from "../../lib/auditLog";
import { createLogger } from "../../lib/logger";
import { encryptToken, isEncryptionConfigured } from "../../services/socialSync/tokenEncryption";
import { withClientIdOrPreview } from "../../middleware/adminPreviewSafe";
import { uploadToR2, isR2Configured } from "../../lib/r2Upload";
import { scheduleDraftToSocialSync } from "../../services/contentflow/socialSyncHandoff";

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
   * Body: { templateId?, customPromptId?, tokens?, rendered?, assetType,
   *         freeForm?, photoreal?, aspectRatio?, reference?, extraInstructions? }
   * Returns: { ok, draftId, assetUrl?, content?, tier, ... }
   *
   * Prompt source (exactly ONE of):
   *   - templateId:       a library template; `rendered` is required.
   *   - customPromptId:   a prompt the client previously saved via
   *                       POST /custom-prompts. Resolved server-side from
   *                       the caller's own saved prompts (tenant-isolated —
   *                       the id is only looked up inside the session
   *                       client's list, so it can never address another
   *                       client's prompt). `rendered`/`tokens` default to
   *                       the saved values; the body may override them.
   *                       This is what un-binds generation from the
   *                       template library (Phase 3 completion).
   *   - free-form:        `rendered` WITHOUT templateId/customPromptId —
   *                       the customer's own prompt text, moderated via
   *                       moderatePromptText() (Starter+ only). Optionally
   *                       marked explicit with freeForm:true (then a
   *                       templateId/customPromptId alongside is a 400
   *                       ambiguous_prompt_source).
   *
   * Orthogonal modifiers (work with ALL three sources):
   *   - photoreal:    realistic mode — photoreal provider order
   *                   (PHOTOREAL_PROVIDER_ORDER) + camera/lens/lighting
   *                   prompt augmentation (image paths; Starter+).
   *   - aspectRatio:  1:1 | 4:5 | 5:4 | 3:2 | 2:3 | 16:9 | 9:16 →
   *                   explicit dimensions for the image orchestrator.
   *   - reference:    { imageBase64 | url } — image-only, Starter+.
   *                   Vision-describe the reference → derive the prompt;
   *                   the resolved source's rendered text layers in as
   *                   guidance. May also stand alone (reference-only
   *                   request: no template/custom/rendered needed).
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

  /**
   * POST /api/portal/contentflow/generate/preflight   (Phase A)
   *
   * Body: { rendered: string, assetType?: "image"|"article"|"multi"|"video",
   *         photoreal?: boolean }
   * Returns: PreflightResult — the assembled brief, provenance, sufficiency
   * score, one-line interpretation, the single skippable question (or null),
   * derived aspect ratio + composition hint, and (for video) a cost estimate.
   *
   * This is advisory ONLY — it never generates, never writes a draft, never
   * charges. FAIL-OPEN: any engine error returns ok:false with an empty
   * all-unspecified brief so the panel falls back to today's behavior.
   *
   * Cost control: results are cached in-proc by (clientId, sha1(rendered),
   * assetType, photoreal) for 10 min so the debounced panel preflight + the
   * eventual Generate click reuse one engine run. Free tier gets
   * deterministic profile fills ONLY (no LLM call); Starter+ runs the
   * extractor (still cached, still cheap).
   */
  app.post("/api/portal/contentflow/generate/preflight", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { ok: false, brief: emptyBrief() });
      if (!clientId) return;

      const rendered = typeof req.body?.rendered === "string" ? req.body.rendered : "";
      const assetTypeRaw = typeof req.body?.assetType === "string" ? req.body.assetType : "image";
      const assetType = ["image", "article", "multi", "video"].includes(assetTypeRaw) ? assetTypeRaw : "image";
      const photoreal = req.body?.photoreal === true;

      if (!rendered.trim()) {
        /* Nothing to interpret yet — return the fail-open empty shape. */
        return res.json({
          ok: true,
          brief: emptyBrief(),
          fills: [],
          sufficiency: 0,
          interpretation: "",
          ask: null,
          derived: { aspectRatio: null, compositionHint: null },
        });
      }

      const client = await storage.getClientById(clientId);
      const brand = readBrandProfile(client);
      const tradeType = (client?.trade_type as string | null) ?? null;
      const tier = await resolveContentflowTier(clientId);
      /* Free tier = deterministic fills only (no LLM). Starter+ runs the
       * extractor. Shadow flag can force the LLM on for baselining too. */
      const runLlm = (tier !== "free") || isIntakeShadowEnabled();

      const cacheKey = preflightCacheKey(clientId, rendered, assetType, photoreal);
      let engine = preflightCacheGet(cacheKey);
      if (!engine || (runLlm && !engine.llmExtractionRan)) {
        engine = await runPreflightEngine({ rendered, brand, tradeType, photoreal, runLlm });
        preflightCacheSet(cacheKey, engine);
      }

      const estimate = assetType === "video"
        ? estimateVideoCost(tier, engine.brief, { providers: VIDEO_PROVIDERS })
        : undefined;

      res.json({
        ok: true,
        brief: engine.brief,
        fills: engine.fills,
        sufficiency: engine.sufficiency,
        interpretation: engine.interpretation,
        ask: engine.ask,
        derived: engine.derived,
        ...(estimate ? { estimate } : {}),
        tier,
      });
    } catch (err: any) {
      /* FAIL-OPEN: never 500 the panel — return today's empty shape. */
      log.warn("[portal/contentflow/generate/preflight] fail-open", { err: err?.message });
      res.json({
        ok: false,
        brief: emptyBrief(),
        fills: [],
        sufficiency: 0,
        interpretation: "",
        ask: null,
        derived: { aspectRatio: null, compositionHint: null },
      });
    }
  });

  // NOTE: this route accepts reference.imageBase64 (up to ~11 MB base64 for
  // the 8 MB client-side cap). The global express.json() parser in
  // server/index.ts has a 100 KB limit and runs first — the raised limit for
  // this path is mounted ahead of it via server/lib/bodyLimits.ts
  // ("/api/portal/contentflow/generate" → 12mb). Do NOT add a route-scoped
  // parser here; it would be dead code (see bodyLimits.ts header).
  app.post("/api/portal/contentflow/generate", requireClient, async (req: Request, res: Response) => {
    const t0 = Date.now();
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const {
        templateId,
        customPromptId,
        tokens,
        rendered: renderedBody,
        assetType,
        /* ── Free-prompt + realistic mode + reference replication ── */
        freeForm,
        photoreal,
        aspectRatio,
        reference,
        extraInstructions,
        /* ── Phase A: intake-sufficiency answers (optional). ── */
        intake: intakeRaw,
      } = (req.body || {}) as {
        templateId?: string;
        customPromptId?: string;
        tokens?: unknown;
        rendered?: string;
        assetType?: string;
        /** Explicit free-form marker. Optional — a `rendered` prompt without
         *  templateId/customPromptId is already free-form; setting this WITH
         *  a templateId/customPromptId is a 400 ambiguous_prompt_source. */
        freeForm?: boolean;
        /** Realistic mode — routes to the photoreal provider order +
         *  injects camera/lens/lighting + raw-photo augmentation. */
        photoreal?: boolean;
        /** "16:9" | "9:16" | "1:1" | "4:5" | "3:2" | "2:3" (provider-permitting). */
        aspectRatio?: string;
        /** Reference replication input: an uploaded image (base64) OR a URL
         *  (direct image or web page). When present, the rendered prompt is
         *  DERIVED from a vision description of the reference. */
        reference?: {
          imageBase64?: string;
          mediaType?: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
          url?: string;
        };
        /** Customer free-text guidance layered on top of any reference. */
        extraInstructions?: string;
        /** Phase A — optional intake answers, merged at intake_answer
         *  priority. Omitting this MUST behave exactly as today. */
        intake?: unknown;
      };

      /* Parse the optional intake payload up front (fail-open → {} on junk).
       * `hasIntake` gates the whole engine-merge path so a request with no
       * intake is byte-identical to the historical behavior. */
      const intakeAnswers = parseIntakePartial(intakeRaw);
      const hasIntake = Object.keys(intakeAnswers).length > 0;

      /* ── Mode detection ───────────────────────────────────────────
       * Three prompt sources — library template, saved custom prompt,
       * free-form rendered text — resolved as exactly-ONE-of by
       * resolveGeneratePromptSource() below. Reference replication,
       * photoreal, and aspectRatio are ORTHOGONAL modifiers that combine
       * with any source (reference is image-only and may also stand alone:
       * its prompt is derived from a vision description of the reference,
       * with the resolved rendered text layered in as guidance). */
      const hasReference = !!reference && (!!reference.imageBase64 || !!reference.url);

      const VALID_ASSETS = new Set(["image", "article", "video", "multi"]);
      if (!assetType || !VALID_ASSETS.has(assetType)) {
        return res.status(400).json({ error: "assetType must be one of image|article|video|multi", code: "invalid_asset_type" });
      }

      /* Reference replication is image-only (vision→generate). */
      if (hasReference && assetType !== "image") {
        return res.status(400).json({ error: "reference replication supports assetType=image only", code: "reference_image_only" });
      }

      /* Resolve the prompt source — a library template, one of the
       * caller's saved custom prompts, OR a free-form rendered prompt
       * (Phase 3: generation is no longer template-bound). All validation
       * (exactly-one source, 404s, rendered length, free-form moderation
       * via moderatePromptText) lives in the helper so it is unit-testable.
       * A reference-only request carries no rendered text — the prompt is
       * derived from the vision description — so the helper is allowed to
       * return an empty free-form source in that case only. */
      const resolvedSource = await resolveGeneratePromptSource({
        templateId,
        customPromptId,
        rendered: renderedBody,
        tokens,
        freeForm,
        allowEmptyRendered: hasReference,
        loadCustomPrompts: () => readCustomPrompts(clientId),
      });
      if (!resolvedSource.ok) {
        return res.status(resolvedSource.status).json({ error: resolvedSource.error, code: resolvedSource.code });
      }
      const src = resolvedSource.source;
      const renderedPrompt = src.rendered;
      const tokenList = src.tokens;
      const isFreePrompt = src.kind === "free";
      const promptMode = hasReference
        ? "reference"
        : src.kind === "free"
          ? "free_prompt"
          : src.kind === "custom"
            ? "custom_prompt"
            : "template";

      /* ── Validate optional aspect ratio → explicit dimensions. ──── */
      let dimensions: { width: number; height: number } | undefined;
      const callerSetAspectRatio = typeof aspectRatio === "string" && aspectRatio.trim().length > 0;
      if (callerSetAspectRatio) {
        const dims = aspectRatioToDimensions((aspectRatio as string).trim());
        if (!dims) {
          return res.status(400).json({
            error: "aspectRatio must be one of 1:1, 4:5, 5:4, 3:2, 2:3, 16:9, 9:16",
            code: "invalid_aspect_ratio",
          });
        }
        dimensions = dims;
      }

      const tier = await resolveContentflowTier(clientId);

      /* ── Premium-capability tier gate. The new free-prompt, reference-
       *    replication, and realistic-mode paths are paid capabilities
       *    (parity with custom-prompt SAVE which is free=0). The curated-
       *    template path stays open to all tiers (unchanged). Free tier on
       *    a premium capability → 402 with an upgrade hint. */
      if ((isFreePrompt || hasReference || photoreal) && tier === "free") {
        writeAudit({
          actorType: "system",
          actorId: req.user?.id ?? null,
          action: "contentflow.generate.blocked",
          entityType: "client",
          entityId: String(clientId),
          metadata: {
            reason: "premium_capability_requires_starter",
            tier,
            free_prompt: isFreePrompt,
            reference: hasReference,
            photoreal: !!photoreal,
          },
        });
        return res.status(402).json({
          error: "Custom prompts, reference replication, and realistic mode require Starter+ tier.",
          code: "tier_too_low",
          tier,
          upgrade_required: true,
        });
      }

      /* ── Video: tier gate at Free/Starter (402), then run the
       *    multi-provider orchestrator (PR follow-up to #791). Free
       *    + Starter still get 402; Creator+ goes through the
       *    Hugging Face → Replicate → Veo rotation. */
      if (assetType === "video") {
        /* Video still requires a curated template or a saved custom prompt
         * (both guarantee a non-empty rendered prompt). The free-prompt /
         * reference / photoreal features are image-only. */
        if (isFreePrompt || hasReference) {
          return res.status(400).json({
            error: "video generation requires a templateId or customPromptId",
            code: "video_requires_template",
          });
        }
        if (tier === "free" || tier === "starter") {
          writeAudit({
            actorType: "system",
            actorId: req.user?.id ?? null,
            action: "contentflow.generate.blocked",
            entityType: "client",
            entityId: String(clientId),
            metadata: { template_id: src.templateId, custom_prompt_id: src.customPromptId, asset_type: assetType, reason: "tier_below_creator", tier },
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
          title: src.title,
          body: null,
          excerpt: null,
          target_platform: null,
          target_url: null,
          metadata: {
            template_id: src.templateId,
            custom_prompt_id: src.customPromptId,
            pattern_id: src.patternId,
            trade: src.trade,
            goal: src.goal,
            asset: src.asset,
            tokens: tokenList,
            rendered_prompt: renderedPrompt,
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
        const videoResult = await generateVideoViaOrchestrator(renderedPrompt, { customerTier: tier });

        if (!videoResult.ok) {
          await storage.updateContentDraft(videoDraftId, {
            metadata: {
              template_id: src.templateId, custom_prompt_id: src.customPromptId,
              tier_at_generation: tier,
              rendered_prompt: renderedPrompt,
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
              template_id: src.templateId, custom_prompt_id: src.customPromptId,
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
            template_id: src.templateId,
            custom_prompt_id: src.customPromptId,
            pattern_id: src.patternId,
            trade: src.trade,
            goal: src.goal,
            asset: src.asset,
            tokens: tokenList,
            rendered_prompt: renderedPrompt,
            tier_at_generation: tier,
            source: "phase3_generate_endpoint_video",
            generation_status: "succeeded",
            provider_used: videoResult.providerUsed,
            fallback_chain: videoResult.fallback_chain,
            media_plan: { video_url: videoUrl, prompt: renderedPrompt, provider: videoResult.providerUsed, resolution: videoResult.resolution, duration_sec: videoResult.durationSec },
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
            template_id: src.templateId, custom_prompt_id: src.customPromptId,
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

      /* ── Phase A: intake-sufficiency engine + shadow mode. ────────────
       * FAIL-OPEN: any failure here leaves briefLayer undefined → the image
       * path assembles EXACTLY as before. The engine runs on EVERY generate
       * to baseline the sufficiency score, but the LLM extractor only fires
       * when shadow mode is on (default off → deterministic-fill score only,
       * zero cost) OR when the caller actually supplied intake answers (then
       * we want the extraction to merge under them). The reference path is
       * vision-derived and skips intake entirely.
       *
       * The cache (clientId, sha1(rendered), assetType, photoreal) is shared
       * with the /preflight route so a debounced panel preflight + the
       * Generate click reuse one engine run. */
      let intakeBrief: IntakeBrief = emptyBrief();
      let intakeFills: SlotFill[] = [];
      let sufficiencyScore = 0;
      let briefLayer: BriefLayer | undefined;
      let intakeAsked = false;
      if (!hasReference && (assetType === "image" || assetType === "article" || assetType === "multi")) {
        try {
          const runLlm = isIntakeShadowEnabled() || hasIntake;
          const cacheKey = preflightCacheKey(clientId, renderedPrompt, assetType, !!photoreal);
          /* Reuse a fresh preflight run when one exists AND we won't need a
           * NEW llm pass it didn't do (cache stores llmExtractionRan). */
          const cached = preflightCacheGet(cacheKey);
          let engine = cached && (cached.llmExtractionRan || !runLlm) ? cached : null;
          if (!engine) {
            engine = await runPreflightEngine({
              rendered: renderedPrompt,
              brand,
              tradeType,
              photoreal: !!photoreal,
              runLlm,
              intake: hasIntake ? intakeAnswers : undefined,
            });
            preflightCacheSet(cacheKey, engine);
          } else if (hasIntake) {
            /* Cache hit but the caller passed answers — re-merge them at
             * intake_answer priority without re-running the LLM. */
            engine = await runPreflightEngine({
              rendered: renderedPrompt,
              brand,
              tradeType,
              photoreal: !!photoreal,
              runLlm: false,
              intake: intakeAnswers,
            });
          }
          intakeBrief = engine.brief;
          intakeFills = engine.fills;
          sufficiencyScore = engine.sufficiency;
          intakeAsked = !!engine.ask;
          /* Only let the brief SHAPE generation when the caller opted in via
           * intake answers — shadow mode observes silently. */
          if (hasIntake) {
            briefLayer = composeBriefLayer(intakeBrief);
            /* Derive aspect ratio ONLY when the caller didn't pass an
             * explicit pill (design: Advanced pills are a power override). */
            if (!callerSetAspectRatio) {
              const derived = briefLayer.derivedAspectRatio ?? aspectRatioForPlacement(intakeBrief.placement);
              if (derived) {
                const dims = aspectRatioToDimensions(derived);
                if (dims) dimensions = dims;
              }
            }
          }
        } catch (err: any) {
          /* Hard fail-open — discard everything intake and proceed unmodified. */
          log.warn("[intake] engine failed (fail-open, generating unmodified)", { err: err?.message });
          briefLayer = undefined;
          intakeBrief = emptyBrief();
          intakeFills = [];
          sufficiencyScore = 0;
        }
      }

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
        title: hasReference ? "Reference replication" : src.title,
        body: null,
        excerpt: null,
        target_platform: null,
        target_url: null,
        metadata: {
          template_id: src.templateId,
          custom_prompt_id: src.customPromptId,
          pattern_id: src.patternId,
          trade: src.trade,
          goal: src.goal,
          asset: src.asset,
          tokens: tokenList,
          rendered_prompt: renderedPrompt,
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

      /* Captured for metadata/audit when the reference flow runs. */
      let referenceStyleDescription: string | undefined;
      let referenceSource: string | undefined;

      const runImage = async (): Promise<void> => {
        /* ── Resolve the prompt source for this image. ───────────────
         *   reference  → vision-describe the reference, derive the prompt
         *   template / free-prompt → use the (style-suffixed) rendered text
         * Photoreal augmentation + explicit dimensions apply to all. */
        let basePrompt: string;
        if (hasReference) {
          const brandLayer = buildReferenceBrandLayer(brand, tradeType);
          /* Reference is ORTHOGONAL to the prompt source: the resolved
           * rendered text (template / custom / free-form — may be empty for
           * a reference-only request) layers into the vision-derived prompt
           * as guidance, alongside any explicit extraInstructions. */
          const guidance = [
            renderedPrompt.trim(),
            typeof extraInstructions === "string" ? extraInstructions.slice(0, 2_000) : "",
          ].filter(Boolean).join("\n\n");
          const composed = await describeReferenceAndComposePrompt({
            reference: {
              uploadedBytes: reference?.imageBase64 ? decodeBase64Image(reference.imageBase64) : undefined,
              uploadedMediaType: reference?.mediaType,
              url: reference?.url,
            },
            brandLayer,
            extraInstructions: guidance || undefined,
            photoreal: !!photoreal,
          });
          if (!composed.ok) {
            errors.push(`reference:${composed.reason}`);
            return;
          }
          basePrompt = composed.prompt;
          referenceStyleDescription = composed.styleDescription.description;
          referenceSource = composed.source ?? undefined;
        } else {
          /* Non-reference image prompt assembly goes through the single
           * assembleImagePrompt() seam. With briefLayer undefined (no intake)
           * it reproduces the historical sequence byte-for-byte —
           * applyStyleSuffixToPrompt → buildPhotorealPrompt — so a generate
           * without intake is identical to the pre-change path. With a brief
           * layer it appends the composition guidance through the existing
           * guidance channel and honors style-suffix suppression. */
          basePrompt = assembleImagePrompt({
            rendered: renderedPrompt,
            stylePreset: customerStylePreset,
            photoreal: !!photoreal,
            layer: briefLayer,
          });
        }

        const finalPrompt = basePrompt;
        const orch = await generateImageViaOrchestrator(finalPrompt, {
          customerTier: tier,
          photoreal: !!photoreal,
          dimensions,
        });
        if (orch.ok) {
          /* Prefer a durable R2 https URL when R2 is configured — a data
           * URI bloats the content_drafts.metadata JSON (and can't be
           * shared/scheduled cleanly). Fall back to the base64 data URI
           * only when R2 is unset or the upload fails, so the surface
           * still works in dev / un-configured environments. */
          if (isR2Configured()) {
            const key = `contentflow/portal/${clientId}/${draftId}-${crypto.randomBytes(4).toString("hex")}.png`;
            const up = await uploadToR2({ key, contentType: "image/png", buffer: orch.imageBuffer });
            if (up.ok && up.url) {
              assetUrl = up.url;
            } else {
              log.warn("[generate] R2 upload failed; falling back to data URI", { draftId, err: up.error });
              assetUrl = `data:image/png;base64,${orch.imageBuffer.toString("base64")}`;
            }
          } else {
            assetUrl = `data:image/png;base64,${orch.imageBuffer.toString("base64")}`;
          }
        } else {
          errors.push(`image:${orch.reason}`);
        }
      };

      const runArticle = async (): Promise<void> => {
        /* No-intake path: user prompt is the rendered text, byte-identical to
         * before. With a brief layer present, append the compact guidance
         * block through the same channel. */
        const articleUser = briefLayer?.promptBlock?.trim()
          ? `${renderedPrompt}\n\n${briefLayer.promptBlock.trim()}`
          : renderedPrompt;
        const draftRaw = await generateContentflowText({
          system: "You are an SEO content writer for a local trade-services business. Produce a single short-form article (300-500 words) that answers the brief. Markdown headings allowed (## only). No fabricated testimonials, certifications, or prices. Plain prose only.",
          user: articleUser,
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
          template_id: src.templateId,
          custom_prompt_id: src.customPromptId,
          pattern_id: src.patternId,
          trade: src.trade,
          goal: src.goal,
          asset: src.asset,
          tokens: tokenList,
          rendered_prompt: renderedPrompt,
          style_preset: customerStylePreset,
          tier_at_generation: tier,
          source: hasReference
            ? "phase3_generate_endpoint_reference"
            : isFreePrompt
              ? "phase3_generate_endpoint_freeprompt"
              : "phase3_generate_endpoint",
          /* New-feature provenance — kept on metadata so the library + audit
           * can surface how the asset was produced. */
          prompt_mode: promptMode,
          photoreal: !!photoreal,
          aspect_ratio: typeof aspectRatio === "string" ? aspectRatio : null,
          reference_source: referenceSource ?? null,
          reference_style_description: referenceStyleDescription ?? null,
          /* ── Phase A intake learning-loop provenance. Persisted on EVERY
           * generate (shadow baseline). intake_answered=true means the caller
           * supplied answers that actually shaped this generation; otherwise
           * the brief/score come from extraction (shadow) + deterministic
           * profile fills only. overlay_text is the wants_text UI handoff. */
          intake_brief: intakeBrief,
          intake_fills: intakeFills,
          sufficiency_score: sufficiencyScore,
          intake_asked: intakeAsked,
          intake_answered: hasIntake,
          intake_shadow: isIntakeShadowEnabled(),
          intake_overlay_text: briefLayer?.overlayText ?? null,
          generation_status: succeeded ? "succeeded" : "failed",
          generation_errors: errors,
          media_plan: assetUrl ? { image_url: assetUrl, prompt: renderedPrompt, image_style_preset: customerStylePreset } : null,
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
          template_id: src.templateId, custom_prompt_id: src.customPromptId,
          asset_type: assetType,
          tier,
          succeeded,
          errors,
          has_image: !!assetUrl,
          has_article: !!articleContent,
          style_preset: customerStylePreset,
          prompt_mode: promptMode,
          photoreal: !!photoreal,
          aspect_ratio: typeof aspectRatio === "string" ? aspectRatio : null,
          reference_source: referenceSource ?? null,
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

  /* ─── Customer content library (generated drafts) ─────────────────
   *
   * The generate endpoint persists every generation as a content_drafts
   * row (surface='contentflow_portal'). These endpoints give the
   * customer a real home for that library: list, edit, keep/pin,
   * delete, and hand off to SocialSync. All are strictly tenant-scoped:
   * the draft is fetched by id and its client_id is checked against the
   * session's resolved client_id before any read or write. The URL id is
   * NEVER trusted on its own.
   */

  /**
   * GET /api/portal/contentflow/drafts
   *
   * Query (optional): surface (default 'contentflow_portal'), kind,
   * status, limit (<=100), offset.
   *
   * Returns the calling client's generated assets, newest first, in a
   * compact shape the Library UI renders. Image/article bodies are
   * included so open/download/edit work without a second round-trip;
   * the rendered prompt is surfaced for "Generate variation".
   */
  app.get("/api/portal/contentflow/drafts", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { drafts: [] });
      if (!clientId) return;

      const surface = typeof req.query.surface === "string" && req.query.surface.trim()
        ? req.query.surface.trim()
        : "contentflow_portal";
      const kind = typeof req.query.kind === "string" && req.query.kind.trim() ? req.query.kind.trim() : undefined;
      const status = typeof req.query.status === "string" && req.query.status.trim() ? req.query.status.trim() : undefined;
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
      const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);

      const rows = await storage.listContentDrafts({ client_id: clientId, surface, kind, status, limit, offset });
      const drafts = rows.map((d) => formatPortalDraft(d));
      res.json({ drafts });
    } catch (err: any) {
      log.error("[portal/contentflow/drafts][list]", err?.message || err);
      res.status(500).json({ error: err?.message || "Failed to load library" });
    }
  });

  /**
   * PATCH /api/portal/contentflow/drafts/:id
   * Body (any subset): { body?, title?, metadata? }
   *
   * Lets the customer edit a generated draft (article body / caption /
   * title). metadata is shallow-merged onto the existing metadata so we
   * never clobber generation provenance (template_id, media_plan, etc.).
   */
  app.patch("/api/portal/contentflow/drafts/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { ok: true, persisted: false }, "write");
      if (!clientId) return;

      const draft = await loadOwnedDraft(req, res, clientId);
      if (!draft) return;

      const updates: Record<string, unknown> = {};
      if (typeof req.body?.body === "string") updates.body = req.body.body.slice(0, 100_000);
      if (typeof req.body?.title === "string") updates.title = req.body.title.slice(0, 500);
      if (req.body?.metadata && typeof req.body.metadata === "object" && !Array.isArray(req.body.metadata)) {
        const existing = (draft.metadata as Record<string, any> | null) ?? {};
        updates.metadata = { ...existing, ...(req.body.metadata as Record<string, any>) };
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "nothing to update", code: "empty_patch" });
      }

      const updated = await storage.updateContentDraft(draft.id, updates as any);
      writeAudit({
        actorType: "system",
        actorId: req.user?.id ?? null,
        action: "contentflow.draft.edited",
        entityType: "content_draft",
        entityId: String(draft.id),
        metadata: { client_id: clientId, fields: Object.keys(updates) },
      });
      res.json({ ok: true, draft: updated ? formatPortalDraft(updated) : null });
    } catch (err: any) {
      log.error("[portal/contentflow/drafts][patch]", err?.message || err);
      res.status(500).json({ error: err?.message || "Failed to save draft" });
    }
  });

  /**
   * POST /api/portal/contentflow/drafts/:id/keep
   *
   * "Save asset" / "Keep" — pin a generated draft so it persists in the
   * library independently of the prompt. Flips status draft → kept and
   * stamps metadata.kept_at. Distinct from "Save prompt" (custom-prompts),
   * which saves the PROMPT not the generated asset.
   */
  app.post("/api/portal/contentflow/drafts/:id/keep", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { ok: true, persisted: false }, "write");
      if (!clientId) return;

      const draft = await loadOwnedDraft(req, res, clientId);
      if (!draft) return;

      const existing = (draft.metadata as Record<string, any> | null) ?? {};
      const updated = await storage.updateContentDraft(draft.id, {
        status: "kept",
        metadata: { ...existing, kept_at: new Date().toISOString() },
      } as any);

      writeAudit({
        actorType: "system",
        actorId: req.user?.id ?? null,
        action: "contentflow.draft.kept",
        entityType: "content_draft",
        entityId: String(draft.id),
        metadata: { client_id: clientId },
      });
      res.json({ ok: true, draft: updated ? formatPortalDraft(updated) : null });
    } catch (err: any) {
      log.error("[portal/contentflow/drafts][keep]", err?.message || err);
      res.status(500).json({ error: err?.message || "Failed to keep draft" });
    }
  });

  /**
   * DELETE /api/portal/contentflow/drafts/:id
   * Removes a generated draft from the customer's library.
   */
  app.delete("/api/portal/contentflow/drafts/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { ok: true, persisted: false }, "write");
      if (!clientId) return;

      const draft = await loadOwnedDraft(req, res, clientId);
      if (!draft) return;

      await storage.deleteContentDraftCascade(draft.id, draft.linked_social_post_id ?? undefined);
      writeAudit({
        actorType: "system",
        actorId: req.user?.id ?? null,
        action: "contentflow.draft.deleted",
        entityType: "content_draft",
        entityId: String(draft.id),
        metadata: { client_id: clientId },
      });
      res.json({ ok: true, deleted_id: draft.id });
    } catch (err: any) {
      log.error("[portal/contentflow/drafts][delete]", err?.message || err);
      res.status(500).json({ error: err?.message || "Failed to delete draft" });
    }
  });

  /**
   * POST /api/portal/contentflow/drafts/:id/schedule-to-socialsync
   * Body (optional): { platform?, scheduled_for? }
   *
   * Hand a generated portal draft off to SocialSync: creates a
   * socialsync_posts row (status='draft') and wires the two-way
   * back-reference (content_draft_id ↔ linked_social_post_id) so
   * SocialSync status-sync works. Idempotent — re-calling returns the
   * already-linked post. The customer schedules/approves in SocialSync;
   * we never auto-publish here.
   */
  app.post("/api/portal/contentflow/drafts/:id/schedule-to-socialsync", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { ok: true, persisted: false }, "write");
      if (!clientId) return;

      const draft = await loadOwnedDraft(req, res, clientId);
      if (!draft) return;

      const platform = typeof req.body?.platform === "string" ? req.body.platform : undefined;
      const scheduledFor = typeof req.body?.scheduled_for === "string" ? req.body.scheduled_for : null;

      const { post, reused } = await scheduleDraftToSocialSync({ draft, platform, scheduledFor });

      writeAudit({
        actorType: "system",
        actorId: req.user?.id ?? null,
        action: "contentflow.draft.scheduled_to_socialsync",
        entityType: "content_draft",
        entityId: String(draft.id),
        metadata: { client_id: clientId, social_post_id: post.id, platform: post.platform, reused },
      });

      res.json({
        ok: true,
        reused,
        social_post_id: post.id,
        platform: post.platform,
        status: post.status,
        draft_id: draft.id,
      });
    } catch (err: any) {
      log.error("[portal/contentflow/drafts][schedule-to-socialsync]", err?.message || err);
      res.status(500).json({ error: err?.message || "Failed to schedule to SocialSync" });
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
        currentStage: stage as any,
        limit: 100,
      });
      res.json({ items });
    } catch (err: any) {
      log.error("[portal/contentflow/pipeline]", err?.message || err);
      res.status(500).json({ error: err?.message });
    }
  });


  /* ─── CMS publishing credentials (self-serve) ────────────────── */


  /**
   * GET /api/portal/contentflow/cms-config
   * Returns current WordPress CMS configuration (password stripped).
   */
  app.get("/api/portal/contentflow/cms-config", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { cms_configured: false });
      if (!clientId) return;
      const profile = await storage.getRankFlowProfile(clientId);
      if (!profile?.credentials) return res.json({ cms_configured: false });
      const wp = (profile.credentials as Record<string, any>)?.wordpress;
      if (!wp) return res.json({ cms_configured: false });
      res.json({
        cms_configured: true,
        cms_type: profile.cms_type || "wordpress",
        cms_url: wp.cms_url || "",
        cms_username: wp.cms_username || "",
        cms_default_status: wp.cms_default_status || "draft",
        configured_at: wp.configured_at || null,
      });
    } catch (err: any) {
      log.error("[portal/contentflow/cms-config GET]", err?.message || err);
      res.status(500).json({ error: "Failed to load CMS config" });
    }
  });


  /**
   * PUT /api/portal/contentflow/cms-config
   * Stores WordPress credentials (password encrypted at rest via AES-256-GCM).
   * Mirrors the admin endpoint but scoped to the authenticated portal user.
   */
  app.put("/api/portal/contentflow/cms-config", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, {}, "write");
      if (!clientId) return;
      const cmsUrl = typeof req.body?.cms_url === "string" ? req.body.cms_url.trim() : "";
      const cmsUsername = typeof req.body?.cms_username === "string" ? req.body.cms_username.trim() : "";
      const cmsAppPassword = typeof req.body?.cms_app_password === "string" ? req.body.cms_app_password : "";
      const cmsDefaultStatus = req.body?.cms_default_status === "publish" ? "publish" : "draft";

      if (!cmsUrl || !/^https?:\/\//i.test(cmsUrl)) {
        return res.status(400).json({ error: "cms_url must be an http(s) URL" });
      }
      const isLocalhostDev = process.env.NODE_ENV !== "production" && /^http:\/\/localhost(:\d+)?\//.test(cmsUrl);
      if (!cmsUrl.startsWith("https://") && !isLocalhostDev) {
        return res.status(422).json({ error: "cms_url must use https://" });
      }
      if (!cmsUsername) return res.status(400).json({ error: "cms_username required" });
      if (!cmsAppPassword) return res.status(400).json({ error: "cms_app_password required" });
      if (!isEncryptionConfigured()) {
        return res.status(500).json({ error: "Encryption not configured on this server" });
      }

      const encryptedPassword = encryptToken(cmsAppPassword);
      const configuredAt = new Date().toISOString();
      const profile = await storage.getRankFlowProfile(clientId);
      const existingCreds = (profile?.credentials || {}) as Record<string, any>;

      await storage.upsertRankFlowProfile(clientId, {
        cms_type: "wordpress",
        credentials: {
          ...existingCreds,
          wordpress: {
            cms_url: cmsUrl,
            cms_username: cmsUsername,
            cms_app_password: encryptedPassword,
            cms_default_status: cmsDefaultStatus,
            configured_at: configuredAt,
          },
        },
      } as any);

      writeAudit({
        actorId: (req as any).user?.id,
        action: "contentflow.cms_config_saved",
        entityType: "rankflow_profiles",
        entityId: String(clientId),
        metadata: { cms_url: cmsUrl, cms_username: cmsUsername, cms_default_status: cmsDefaultStatus },
      });
      log.info("[portal/contentflow/cms-config] saved for client=" + clientId + " cms_url=" + cmsUrl);

      res.json({
        ok: true,
        cms_configured: true,
        cms_url: cmsUrl,
        cms_username: cmsUsername,
        cms_default_status: cmsDefaultStatus,
        configured_at: configuredAt,
      });
    } catch (err: any) {
      log.error("[portal/contentflow/cms-config PUT]", err?.message || err);
      res.status(500).json({ error: "Failed to save CMS config" });
    }
  });
}

/* ──────────────────────────────────────────────────────────────────
 * Library helpers — owned-draft loader + compact serializer.
 * ────────────────────────────────────────────────────────────────── */

/**
 * Load the draft named by :id and enforce tenant ownership. Sends the
 * appropriate response (400 invalid id, 404 not found / not owned) and
 * returns null when the caller should bail. The 404 for a foreign-tenant
 * draft is deliberate — it never leaks that the id exists for another
 * client.
 */
async function loadOwnedDraft(
  req: Request,
  res: Response,
  clientId: number,
): Promise<ContentDraft | null> {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "invalid draft id", code: "invalid_id" });
    return null;
  }
  const draft = await storage.getContentDraftById(id);
  if (!draft || draft.client_id !== clientId) {
    res.status(404).json({ error: "draft not found", code: "draft_not_found" });
    return null;
  }
  return draft;
}

/** Compact shape the Library UI renders. */
function formatPortalDraft(d: ContentDraft) {
  const meta = (d.metadata as Record<string, any> | null) ?? {};
  const mp = meta.media_plan && typeof meta.media_plan === "object" ? meta.media_plan : null;
  return {
    id: d.id,
    kind: d.kind,
    title: d.title,
    body: d.body,
    excerpt: d.excerpt,
    status: d.status,
    surface: d.surface,
    target_platform: d.target_platform,
    image_url: (mp?.image_url ?? mp?.url ?? null) as string | null,
    rendered_prompt: typeof meta.rendered_prompt === "string" ? meta.rendered_prompt : null,
    template_id: typeof meta.template_id === "string" ? meta.template_id : null,
    style_preset: typeof meta.style_preset === "string" ? meta.style_preset : null,
    generation_status: typeof meta.generation_status === "string" ? meta.generation_status : null,
    linked_social_post_id: d.linked_social_post_id ?? null,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

/* ──────────────────────────────────────────────────────────────────
 * Phase 3 helpers — tier resolution, custom-prompt persistence,
 * style-suffix glue. Kept in this file because each is small and
 * only used by the routes above; promoted to a service if reused.
 * ────────────────────────────────────────────────────────────────── */

/**
 * Map a customer-facing aspect ratio string to explicit pixel dimensions
 * the image orchestrator accepts. Returns null for an unsupported ratio so
 * the route can 400. Kept to a curated set (long side 1024-ish, multiple of
 * 64) so all wired providers accept it; the orchestrator clamps as a
 * backstop. The default 3 sizes (1:1, 4:5≈2:3, 5:4≈3:2) still work via the
 * existing `size` param when aspectRatio is omitted.
 */
function aspectRatioToDimensions(ratio: string): { width: number; height: number } | null {
  switch (ratio) {
    case "1:1":  return { width: 1024, height: 1024 };
    case "4:5":  return { width: 1024, height: 1280 };
    case "5:4":  return { width: 1280, height: 1024 };
    case "2:3":  return { width: 832, height: 1216 };
    case "3:2":  return { width: 1216, height: 832 };
    case "9:16": return { width: 768, height: 1344 };
    case "16:9": return { width: 1344, height: 768 };
    default:     return null;
  }
}

/**
 * Decode a base64 image payload (with or without a data: URI prefix) into a
 * Buffer for the reference-replication vision call. Returns an empty Buffer
 * on malformed input so the caller's resolver reports a clean failure rather
 * than throwing.
 */
function decodeBase64Image(b64: string): Buffer {
  try {
    const cleaned = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
    return Buffer.from(cleaned, "base64");
  } catch {
    return Buffer.alloc(0);
  }
}

/**
 * Compose a compact brand-layer fragment for the reference-replication
 * prompt. Mirrors imageGenerationService.buildBrandLayer's intent (trade +
 * style + brand accent colours) but inline here to avoid importing the
 * generation engine into the route. Kept short — the vision description
 * already carries the bulk of the visual direction.
 */
function buildReferenceBrandLayer(
  brand: ReturnType<typeof readBrandProfile>,
  tradeType: string | null,
): string {
  const parts: string[] = [];
  if (tradeType) parts.push(`Business trade: ${tradeType}.`);
  if (brand.style_keywords?.length) parts.push(`Brand style: ${brand.style_keywords.join(", ")}.`);
  if (brand.primary_color) {
    const accents = [brand.primary_color, brand.secondary_color].filter(Boolean);
    parts.push(`Subtle brand accent colors (use sparingly): ${accents.join(", ")}.`);
  }
  return parts.join(" ");
}

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

/* ──────────────────────────────────────────────────────────────────
 * Phase A — intake-sufficiency assembly glue.
 *
 * assembleImagePrompt() is the SINGLE place the non-reference image prompt
 * is built. It is the no-regression seam: with `layer` omitted (the
 * no-intake path) it reproduces the historical sequence EXACTLY —
 * applyStyleSuffixToPrompt → buildPhotorealPrompt — so generate-without-
 * intake is byte-identical to the pre-change path. The intake test captures
 * its output via this exported pure function. When a brief layer IS present,
 * its compact prompt block is appended as guidance (the existing
 * extraInstructions/guidance channel) and an explicit style suppresses the
 * preset suffix.
 *
 * Pure + dependency-free → unit-testable without express/db. Wired into CI as
 * `npm run check:contentflow-intake`.
 * ────────────────────────────────────────────────────────────────── */
export function assembleImagePrompt(args: {
  rendered: string;
  stylePreset: string;
  photoreal: boolean;
  /** Brief layer from composeBriefLayer(); omit for the no-intake path. */
  layer?: BriefLayer;
}): string {
  const { rendered, stylePreset, photoreal, layer } = args;
  /* Style suffix — suppressed only when the customer's style is explicit. */
  let prompt = layer?.suppressPresetSuffix
    ? rendered
    : applyStyleSuffixToPrompt(rendered, stylePreset);
  /* Intake guidance through the existing extraInstructions/guidance channel:
   * append the compact composition block. Only when present — keeps the
   * no-intake path byte-identical. */
  if (layer?.promptBlock && layer.promptBlock.trim()) {
    prompt = `${prompt}\n\n${layer.promptBlock.trim()}`;
  }
  /* Realistic-mode augmentation last — identical ordering to the historical
   * path so the no-layer call is byte-identical. */
  if (photoreal) prompt = buildPhotorealPrompt(prompt);
  return prompt;
}

/* ── Shadow-mode flag. When OFF (default), the generate path persists only a
 *    DETERMINISTIC-fill sufficiency score (no LLM call → zero cost). When ON,
 *    the LLM extractor runs to baseline against real prompt understanding.
 *    Read per-call so an env flip takes effect without a restart in dev. */
export function isIntakeShadowEnabled(): boolean {
  return String(process.env.CONTENTFLOW_INTAKE_SHADOW_ENABLED || "").toLowerCase() === "true";
}

/**
 * In-proc preflight cache. Keyed (clientId, sha1(rendered), assetType,
 * photoreal). 10-minute TTL so the debounced panel preflight + the eventual
 * Generate click reuse one engine run. Tiny bounded map — evicts oldest when
 * it grows past the cap. Process-local (acceptable: preflight is advisory).
 */
interface PreflightCacheEntry {
  at: number;
  value: PreflightEngineResult;
}
const PREFLIGHT_CACHE = new Map<string, PreflightCacheEntry>();
const PREFLIGHT_TTL_MS = 10 * 60 * 1000;
const PREFLIGHT_CACHE_MAX = 500;

function preflightCacheKey(
  clientId: number,
  rendered: string,
  assetType: string,
  photoreal: boolean,
): string {
  const h = crypto.createHash("sha1").update(rendered).digest("hex");
  return `${clientId}:${h}:${assetType}:${photoreal ? 1 : 0}`;
}

function preflightCacheGet(key: string): PreflightEngineResult | null {
  const hit = PREFLIGHT_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > PREFLIGHT_TTL_MS) {
    PREFLIGHT_CACHE.delete(key);
    return null;
  }
  return hit.value;
}

function preflightCacheSet(key: string, value: PreflightEngineResult): void {
  if (PREFLIGHT_CACHE.size >= PREFLIGHT_CACHE_MAX) {
    const oldest = PREFLIGHT_CACHE.keys().next().value;
    if (oldest !== undefined) PREFLIGHT_CACHE.delete(oldest);
  }
  PREFLIGHT_CACHE.set(key, { at: Date.now(), value });
}

/** What runPreflightEngine returns — the assembled brief + scoring + asks. */
export interface PreflightEngineResult {
  brief: IntakeBrief;
  fills: SlotFill[];
  sufficiency: number;
  interpretation: string;
  ask: ReturnType<typeof assemblePreflight>["ask"];
  derived: { aspectRatio: string | null; compositionHint: string | null };
  /** True when the LLM extractor actually ran (shadow on / preflight paid). */
  llmExtractionRan: boolean;
}

/**
 * Run the intake engine for a (rendered, profile, trade) tuple. FAIL-OPEN:
 * any engine error degrades to a deterministic-only assembly. The LLM
 * extractor runs ONLY when `runLlm` is true (shadow on, or a paid-tier
 * preflight) — otherwise scoring is from deterministic profile fills alone,
 * which costs nothing.
 */
export async function runPreflightEngine(args: {
  rendered: string;
  brand: ReturnType<typeof readBrandProfile>;
  tradeType: string | null;
  photoreal: boolean;
  runLlm: boolean;
  extractor?: BriefExtractor;
  /** Caller-provided intake answers, merged at intake_answer priority. */
  intake?: Partial<IntakeBrief>;
}): Promise<PreflightEngineResult> {
  let extracted: { brief: Partial<IntakeBrief>; fills: SlotFill[] } = { brief: {}, fills: [] };
  let llmExtractionRan = false;
  if (args.runLlm) {
    try {
      extracted = await extractBriefFromPrompt(args.rendered, {
        extractor: args.extractor ?? defaultBriefExtractor,
      });
      llmExtractionRan = true;
    } catch (err: any) {
      /* extractBriefFromPrompt is already fail-open, but belt-and-suspenders. */
      log.warn("[intake] extraction failed (fail-open)", { err: err?.message });
      extracted = { brief: {}, fills: [] };
    }
  }

  /* Deterministic profile/trade fills layered under the extraction. */
  const profileFilled = fillFromProfile(extracted.brief, args.brand, args.tradeType);

  /* Merge caller intake answers at intake_answer priority (highest). */
  let brief = profileFilled.brief;
  const fills: SlotFill[] = [...extracted.fills, ...profileFilled.fills];
  if (args.intake) {
    const answerFills: SlotFill[] = [];
    for (const [slot, value] of Object.entries(args.intake)) {
      if (value === undefined || value === null || value === "") continue;
      (brief as unknown as Record<string, unknown>)[slot] = value;
      answerFills.push({ slot: slot as keyof IntakeBrief, value: String(value), source: "intake_answer" });
    }
    fills.push(...answerFills);
  }

  const assembled = assemblePreflight({ brief, fills, photoreal: args.photoreal });
  return { ...assembled, llmExtractionRan };
}

/* ──────────────────────────────────────────────────────────────────
 * Phase 3 completion — generate-from-custom-prompt resolution.
 *
 * POST /generate historically required a LIBRARY templateId (404 for
 * anything else), so prompts saved via POST /custom-prompts could be
 * listed but never actually drive a generation — image gen was
 * template-bound. This helper un-binds it: the route now accepts
 * exactly one of { templateId, customPromptId, free-form rendered } and
 * this function normalizes each into the single shape the pipeline
 * consumes (free-form prompts are moderated via moderatePromptText).
 *
 * Pure + dependency-injected (loadCustomPrompts) so it is unit-testable
 * without express/db — see contentflow.generateSource.test.ts, wired
 * into CI as `npm run check:contentflow-generate-source`.
 * ────────────────────────────────────────────────────────────────── */

export interface GeneratePromptSource {
  kind: "template" | "custom" | "free";
  /** Library template id, or the saved prompt's baseTemplateId for
   *  kind=custom. Null for kind=free (no template involved). */
  templateId: string | null;
  /** Saved custom-prompt id (null for kind=template / kind=free). */
  customPromptId: string | null;
  title: string;
  patternId: string | null;
  trade: string | null;
  goal: string | null;
  asset: string | null;
  rendered: string;
  tokens: unknown[];
}

export type GeneratePromptSourceResult =
  | { ok: true; source: GeneratePromptSource }
  | { ok: false; status: number; error: string; code: string };

export async function resolveGeneratePromptSource(input: {
  templateId?: unknown;
  customPromptId?: unknown;
  rendered?: unknown;
  tokens?: unknown;
  /** Explicit free-form marker. A `rendered` prompt without templateId/
   *  customPromptId is already free-form; passing freeForm:true WITH a
   *  templateId or customPromptId is a 400 ambiguous_prompt_source. */
  freeForm?: unknown;
  /** Reference-replication escape hatch: a reference-only request carries
   *  no rendered text (the prompt is derived from a vision description of
   *  the reference image), so when this is true a source-less request
   *  resolves to an EMPTY free-form source instead of 400ing. */
  allowEmptyRendered?: boolean;
  /** Loader for the SESSION client's saved prompts — tenant isolation is
   *  inherited from the caller resolving clientId from the session, never
   *  from the request body. */
  loadCustomPrompts: () => Promise<SavedCustomPrompt[]>;
}): Promise<GeneratePromptSourceResult> {
  const { templateId, customPromptId, rendered, tokens } = input;

  const hasTemplate = typeof templateId === "string" && templateId.trim().length > 0;
  const hasCustom = typeof customPromptId === "string" && customPromptId.trim().length > 0;
  const explicitFree = input.freeForm === true;

  if (hasTemplate && hasCustom) {
    return { ok: false, status: 400, error: "provide exactly one of templateId or customPromptId", code: "ambiguous_prompt_source" };
  }
  if (explicitFree && (hasTemplate || hasCustom)) {
    return {
      ok: false,
      status: 400,
      error: "a free-form prompt cannot be combined with templateId or customPromptId — provide exactly one source",
      code: "ambiguous_prompt_source",
    };
  }

  const renderedBody = typeof rendered === "string" && rendered.trim().length > 0 ? rendered : null;

  /* ── Free-form path — rendered text with no template / saved prompt.
   * Runs through moderatePromptText (length/empty + denylist + the
   * TODO(moderation) hook). Tier gating (Starter+) stays in the route. */
  if (!hasTemplate && !hasCustom) {
    if (!renderedBody) {
      if (input.allowEmptyRendered) {
        return {
          ok: true,
          source: {
            kind: "free",
            templateId: null,
            customPromptId: null,
            title: "Custom prompt",
            patternId: null,
            trade: null,
            goal: null,
            asset: null,
            rendered: "",
            tokens: Array.isArray(tokens) ? tokens : [],
          },
        };
      }
      return {
        ok: false,
        status: 400,
        error: "templateId, customPromptId, or a free-form rendered prompt is required",
        code: "missing_template_id",
      };
    }
    const moderation = moderatePromptText(renderedBody);
    if (!moderation.ok) {
      return { ok: false, status: 400, error: moderation.reason ?? "prompt rejected", code: "invalid_prompt" };
    }
    return {
      ok: true,
      source: {
        kind: "free",
        templateId: null,
        customPromptId: null,
        title: "Custom prompt",
        patternId: null,
        trade: null,
        goal: null,
        asset: null,
        rendered: renderedBody.trim(),
        tokens: Array.isArray(tokens) ? tokens : [],
      },
    };
  }

  if (hasCustom) {
    const saved = (await input.loadCustomPrompts()).find((p) => p.id === customPromptId);
    if (!saved) {
      return { ok: false, status: 404, error: "custom prompt not found", code: "custom_prompt_not_found" };
    }
    /* Base template is metadata enrichment only — a custom prompt must
     * keep working even if its base template is later removed from the
     * library, so a miss here is NOT a 404. */
    const baseTmpl = getPromptTemplate(saved.baseTemplateId);
    const effectiveRendered = renderedBody ?? saved.rendered;
    if (!effectiveRendered || !effectiveRendered.trim()) {
      return { ok: false, status: 400, error: "rendered prompt is required", code: "missing_rendered" };
    }
    if (effectiveRendered.length > 8_000) {
      return { ok: false, status: 400, error: "rendered prompt too long (max 8000)", code: "prompt_too_long" };
    }
    return {
      ok: true,
      source: {
        kind: "custom",
        templateId: saved.baseTemplateId,
        customPromptId: saved.id,
        title: saved.title || "Custom prompt",
        patternId: baseTmpl?.patternId ?? null,
        trade: baseTmpl?.trade ?? null,
        goal: baseTmpl?.goal ?? null,
        asset: baseTmpl?.asset ?? null,
        rendered: effectiveRendered,
        tokens: Array.isArray(tokens) ? tokens : (saved.tokens ?? []),
      },
    };
  }

  /* Template path — behavior identical to the pre-customPromptId route:
   * unknown template 404s and `rendered` is required from the body. */
  const tmpl = getPromptTemplate(templateId as string);
  if (!tmpl) {
    return { ok: false, status: 404, error: "prompt not found", code: "prompt_not_found" };
  }
  if (!renderedBody) {
    return { ok: false, status: 400, error: "rendered prompt is required", code: "missing_rendered" };
  }
  if (renderedBody.length > 8_000) {
    return { ok: false, status: 400, error: "rendered prompt too long (max 8000)", code: "prompt_too_long" };
  }
  return {
    ok: true,
    source: {
      kind: "template",
      templateId: templateId as string,
      customPromptId: null,
      title: tmpl.title,
      patternId: tmpl.patternId,
      trade: tmpl.trade,
      goal: tmpl.goal,
      asset: tmpl.asset,
      rendered: renderedBody,
      tokens: Array.isArray(tokens) ? tokens : [],
    },
  };
}
