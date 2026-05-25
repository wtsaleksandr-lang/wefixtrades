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
import {
  extractBusinessProfileFromUrl,
  prefillPromptTokens,
  defaultSelectionsFromProfile,
  type ExtractedBusinessProfile,
  type PrefilledToken,
} from "../../services/contentflow/profilePrefill";
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

      const tmpl = getPromptTemplate(req.params.id);
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

      const tmpl = getPromptTemplate(req.params.id);
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
}
