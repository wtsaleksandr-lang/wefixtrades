/**
 * Admin routes for the TradeLine + Concierge template editor.
 *
 * Endpoints (all gated by requireAdmin):
 *   GET    /api/admin/tradeline/templates                       — list both kinds with effective (merged) fields
 *   GET    /api/admin/tradeline/templates/:kind/:templateId     — one template (code default + override + merged)
 *   PATCH  /api/admin/tradeline/templates/:kind/:templateId     — upsert override jsonb
 *   DELETE /api/admin/tradeline/templates/:kind/:templateId     — reset to code default OR delete custom template
 *   POST   /api/admin/tradeline/templates                       — create new (from scratch or from existing)
 *   POST   /api/admin/tradeline/templates/duplicate             — duplicate an existing template
 *
 * Custom templates: stored as override rows with a synthetic template_id
 * (prefix "custom_"). The override blob carries the FULL field set since
 * there is no code default to fall through to.
 */

import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";
import { requireAdmin } from "../auth";
import { listTemplates as listTradelineTemplates, type TradeTemplate } from "../services/tradelineTemplates";
import { listConciergeTemplates, type ConciergeTemplate } from "../services/portalConciergeTemplates";
import {
  applyOverrides,
  deleteOverride,
  getOverride,
  listOverrides,
  upsertOverride,
} from "../lib/applyTemplateOverrides";
import { TEMPLATE_KIND_VALUES, type TemplateKind } from "@shared/schema";
import { createLogger } from "../lib/logger";
import {
  getOrCreateSampleForText,
  isPreviewAvailable,
  pickOpenAIVoice,
} from "../lib/voicePreview";

const log = createLogger("AdminTradelineTemplates");

const kindParam = z.enum(TEMPLATE_KIND_VALUES);

function findCodeDefault(kind: TemplateKind, templateId: string): TradeTemplate | ConciergeTemplate | null {
  if (kind === "tradeline") {
    return listTradelineTemplates().find((t) => t.id === templateId) ?? null;
  }
  return listConciergeTemplates().find((t) => t.id === templateId) ?? null;
}

function isCustomId(templateId: string): boolean {
  return templateId.startsWith("custom_");
}

function newCustomId(): string {
  return `custom_${randomBytes(6).toString("hex")}`;
}

/** Empty placeholder for custom templates (so the codeDefault slot in
 *  responses is never undefined and applyOverrides can run uniformly). */
function emptyTradelineDefault(templateId: string): TradeTemplate {
  return {
    id: templateId,
    name: "",
    matchPatterns: [],
    systemPromptBase: "",
    defaultTone: "professional",
    callFlowNotes: "",
    fallbackBehavior: "",
    bookingBehavior: "",
    escalationRules: "",
    fallbackServices: [],
  };
}

function emptyConciergeDefault(templateId: string): ConciergeTemplate {
  return {
    id: templateId,
    name: "",
    matchPatterns: [],
    systemPromptBase: "",
    defaultTone: "professional",
    coachingFocus: "",
    industryNorms: "",
    commonChallenges: "",
    toolingHints: "",
    escalationToHuman: "",
  };
}

/* ─── Voice-preview helpers ──────────────────────────────────────────
 * Build a short tone-flavored greeting from the merged template + use a
 * deterministic OpenAI TTS preset so the same (tone, kind, name) always
 * sounds the same on replay. The audio cache itself lives on disk via
 * voicePreview.ts; this layer only chooses the text + voice. */

const DEFAULT_SAMPLE_TEXT =
  "Hi, thanks for calling. How can I help with your job today?";

function buildPreviewGreeting(
  kind: TemplateKind,
  effective: Record<string, unknown>,
  customSample?: string,
): string {
  // Admin-supplied sample wins, capped at 200 chars to limit TTS cost.
  if (customSample && customSample.trim()) {
    return customSample.trim().slice(0, 200);
  }
  const name = String(effective.name ?? "").trim();
  const tone = String(effective.defaultTone ?? "professional").toLowerCase();
  // Concierge is portal-internal — the AI greets the trade, not a caller.
  if (kind === "concierge") {
    if (tone === "casual") {
      return name
        ? `Hey — I'm your ${name} concierge. What do you want to dig into today?`
        : "Hey — I'm your portal concierge. What do you want to dig into today?";
    }
    if (tone === "friendly") {
      return name
        ? `Hi there, I'm your ${name} concierge. What can I help you with today?`
        : "Hi there, I'm your portal concierge. What can I help you with today?";
    }
    return name
      ? `Hello, I'm your ${name} concierge — happy to help anytime.`
      : "Hello, I'm your portal concierge — happy to help anytime.";
  }
  // TradeLine receptionist — greets the end-customer who just dialed in.
  if (tone === "casual") {
    return name
      ? `Hey, you've reached ${name}. What's going on today?`
      : DEFAULT_SAMPLE_TEXT;
  }
  if (tone === "friendly") {
    return name
      ? `Hi there, you've reached ${name}. How can I help you today?`
      : DEFAULT_SAMPLE_TEXT;
  }
  return name
    ? `Hello, you've reached ${name} — how can I help today?`
    : DEFAULT_SAMPLE_TEXT;
}

/* Simple in-memory rate limit: max 30 voice-preview hits per minute per
 * actor. Pure-memory window is fine — voice previews are admin-only and
 * the route just protects against an open `for` loop spending OpenAI
 * credits, not against distributed abuse. */
const VOICE_PREVIEW_WINDOW_MS = 60_000;
const VOICE_PREVIEW_MAX_PER_WINDOW = 30;
const voicePreviewHits = new Map<string, number[]>();

function checkVoicePreviewRate(key: string): boolean {
  const now = Date.now();
  const arr = voicePreviewHits.get(key) ?? [];
  const fresh = arr.filter((ts) => now - ts < VOICE_PREVIEW_WINDOW_MS);
  if (fresh.length >= VOICE_PREVIEW_MAX_PER_WINDOW) {
    voicePreviewHits.set(key, fresh);
    return false;
  }
  fresh.push(now);
  voicePreviewHits.set(key, fresh);
  return true;
}

export function registerAdminTradelineTemplatesRoutes(app: Express) {
  /* ─── GET list (both kinds, with overrides merged) ─── */
  app.get("/api/admin/tradeline/templates", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const overrides = await listOverrides();
      const byKey = new Map<string, Record<string, unknown>>();
      for (const o of overrides) byKey.set(`${o.kind}:${o.templateId}`, o.overrides);

      const codeTradeline = listTradelineTemplates();
      const codeConcierge = listConciergeTemplates();
      const codeIds = {
        tradeline: new Set(codeTradeline.map((t) => t.id)),
        concierge: new Set(codeConcierge.map((t) => t.id)),
      };

      interface ListEntry {
        kind: TemplateKind;
        templateId: string;
        name: string;
        defaultTone: "professional" | "friendly" | "casual";
        hasOverride: boolean;
        isCustom: boolean;
        effective: TradeTemplate | ConciergeTemplate;
      }

      const tradeline: ListEntry[] = codeTradeline.map((t) => ({
        kind: "tradeline" as TemplateKind,
        templateId: t.id,
        name: t.name,
        defaultTone: t.defaultTone,
        hasOverride: byKey.has(`tradeline:${t.id}`),
        isCustom: false,
        effective: applyOverrides(t, byKey.get(`tradeline:${t.id}`) ?? null),
      }));
      const concierge: ListEntry[] = codeConcierge.map((t) => ({
        kind: "concierge" as TemplateKind,
        templateId: t.id,
        name: t.name,
        defaultTone: t.defaultTone,
        hasOverride: byKey.has(`concierge:${t.id}`),
        isCustom: false,
        effective: applyOverrides(t, byKey.get(`concierge:${t.id}`) ?? null),
      }));

      // Surface override-only (custom) templates that have no code default.
      for (const o of overrides) {
        if (codeIds[o.kind as "tradeline" | "concierge"]?.has(o.templateId)) continue;
        if (o.kind === "tradeline") {
          const base = emptyTradelineDefault(o.templateId);
          const merged = applyOverrides(base, o.overrides);
          tradeline.push({
            kind: "tradeline" as TemplateKind,
            templateId: o.templateId,
            name: merged.name || o.templateId,
            defaultTone: merged.defaultTone,
            hasOverride: true,
            isCustom: true,
            effective: merged,
          });
        } else if (o.kind === "concierge") {
          const base = emptyConciergeDefault(o.templateId);
          const merged = applyOverrides(base, o.overrides);
          concierge.push({
            kind: "concierge" as TemplateKind,
            templateId: o.templateId,
            name: merged.name || o.templateId,
            defaultTone: merged.defaultTone,
            hasOverride: true,
            isCustom: true,
            effective: merged,
          });
        }
      }

      return res.json({ tradeline, concierge });
    } catch (err) {
      log.error("list failed", { err: (err as Error).message });
      return res.status(500).json({ error: "Failed to load templates" });
    }
  });

  /* ─── GET single (default + override + merged) ─── */
  app.get(
    "/api/admin/tradeline/templates/:kind/:templateId",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const kindResult = kindParam.safeParse(req.params.kind);
        if (!kindResult.success) return res.status(400).json({ error: "Invalid kind" });
        const kind = kindResult.data;
        const templateId = String(req.params.templateId);

        let codeDefault = findCodeDefault(kind, templateId);
        const overrideRow = await getOverride(kind, templateId);
        const isCustom = !codeDefault && isCustomId(templateId);

        if (!codeDefault) {
          if (!overrideRow) return res.status(404).json({ error: "Template not found" });
          // Custom (override-only) template — synthesize an empty base.
          codeDefault =
            kind === "tradeline"
              ? emptyTradelineDefault(templateId)
              : emptyConciergeDefault(templateId);
        }

        const overrides = overrideRow?.overrides ?? null;

        return res.json({
          kind,
          templateId,
          codeDefault,
          overrides,
          effective: applyOverrides(codeDefault, overrides),
          isCustom,
          updatedAt: overrideRow?.updatedAt ?? null,
          updatedBy: overrideRow?.updatedBy ?? null,
        });
      } catch (err) {
        log.error("get failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to load template" });
      }
    },
  );

  /* ─── PATCH override (upsert) ─── */
  const patchBody = z.object({
    overrides: z.record(z.string(), z.unknown()),
  });
  app.patch(
    "/api/admin/tradeline/templates/:kind/:templateId",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const kindResult = kindParam.safeParse(req.params.kind);
        if (!kindResult.success) return res.status(400).json({ error: "Invalid kind" });
        const kind = kindResult.data;
        const templateId = String(req.params.templateId);

        let codeDefault = findCodeDefault(kind, templateId);
        if (!codeDefault && !isCustomId(templateId)) {
          return res.status(404).json({ error: "Template not found" });
        }
        if (!codeDefault) {
          codeDefault =
            kind === "tradeline"
              ? emptyTradelineDefault(templateId)
              : emptyConciergeDefault(templateId);
        }

        const parsed = patchBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

        const updated = await upsertOverride(kind, templateId, parsed.data.overrides, req.user?.id ?? null);
        return res.json({ override: updated, effective: applyOverrides(codeDefault, updated.overrides) });
      } catch (err) {
        log.error("patch failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to save override" });
      }
    },
  );

  /* ─── DELETE override (reset to default) ─── */
  app.delete(
    "/api/admin/tradeline/templates/:kind/:templateId",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const kindResult = kindParam.safeParse(req.params.kind);
        if (!kindResult.success) return res.status(400).json({ error: "Invalid kind" });
        const kind = kindResult.data;
        const templateId = String(req.params.templateId);

        const codeDefault = findCodeDefault(kind, templateId);
        if (!codeDefault && !isCustomId(templateId)) {
          return res.status(404).json({ error: "Template not found" });
        }

        await deleteOverride(kind, templateId);
        return res.json({ ok: true, kind, templateId, deletedCustom: !codeDefault });
      } catch (err) {
        log.error("delete failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to reset override" });
      }
    },
  );

  /* ─── POST create (from scratch or from existing) ─── */
  const createBody = z.object({
    kind: z.enum(TEMPLATE_KIND_VALUES),
    name: z.string().min(1).max(120),
    /** Optional source to clone fields from. If absent → blank scaffold. */
    fromTemplateId: z.string().min(1).optional(),
  });
  app.post(
    "/api/admin/tradeline/templates",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const parsed = createBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
        const { kind, name, fromTemplateId } = parsed.data;

        // Seed the new template's field blob.
        let seedFields: Record<string, unknown>;
        if (fromTemplateId) {
          const sourceDefault = findCodeDefault(kind, fromTemplateId);
          const sourceOverrideRow = await getOverride(kind, fromTemplateId);
          if (!sourceDefault && !sourceOverrideRow) {
            return res.status(404).json({ error: "Source template not found" });
          }
          const base =
            sourceDefault ??
            (kind === "tradeline" ? emptyTradelineDefault(fromTemplateId) : emptyConciergeDefault(fromTemplateId));
          seedFields = applyOverrides(base, sourceOverrideRow?.overrides ?? null) as unknown as Record<string, unknown>;
        } else {
          seedFields = (kind === "tradeline"
            ? emptyTradelineDefault("")
            : emptyConciergeDefault("")) as unknown as Record<string, unknown>;
        }

        const newTemplateId = newCustomId();
        // Override blob carries the full field set (no code default to fall through).
        const fullOverride: Record<string, unknown> = { ...seedFields, name, id: newTemplateId };

        const codeDefaultStub =
          kind === "tradeline" ? emptyTradelineDefault(newTemplateId) : emptyConciergeDefault(newTemplateId);
        const saved = await upsertOverride(kind, newTemplateId, fullOverride, req.user?.id ?? null);

        return res.json({
          kind,
          templateId: newTemplateId,
          isCustom: true,
          override: saved,
          effective: applyOverrides(codeDefaultStub, saved.overrides),
        });
      } catch (err) {
        log.error("create failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to create template" });
      }
    },
  );

  /* ─── POST duplicate ─── */
  const duplicateBody = z.object({
    kind: z.enum(TEMPLATE_KIND_VALUES),
    templateId: z.string().min(1),
  });
  app.post(
    "/api/admin/tradeline/templates/duplicate",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const parsed = duplicateBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
        const { kind, templateId } = parsed.data;

        const sourceDefault = findCodeDefault(kind, templateId);
        const sourceOverrideRow = await getOverride(kind, templateId);
        if (!sourceDefault && !sourceOverrideRow) {
          return res.status(404).json({ error: "Source template not found" });
        }
        const base =
          sourceDefault ??
          (kind === "tradeline" ? emptyTradelineDefault(templateId) : emptyConciergeDefault(templateId));
        const seedFields = applyOverrides(base, sourceOverrideRow?.overrides ?? null) as unknown as Record<
          string,
          unknown
        >;

        const newTemplateId = newCustomId();
        const sourceName = String(seedFields.name ?? templateId);
        const fullOverride: Record<string, unknown> = {
          ...seedFields,
          name: `${sourceName} (copy)`,
          id: newTemplateId,
        };
        const codeDefaultStub =
          kind === "tradeline" ? emptyTradelineDefault(newTemplateId) : emptyConciergeDefault(newTemplateId);
        const saved = await upsertOverride(kind, newTemplateId, fullOverride, req.user?.id ?? null);

        return res.json({
          kind,
          templateId: newTemplateId,
          isCustom: true,
          override: saved,
          effective: applyOverrides(codeDefaultStub, saved.overrides),
        });
      } catch (err) {
        log.error("duplicate failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to duplicate template" });
      }
    },
  );

  /* ─── GET /:kind/:templateId/voice-sample — TTS preview MP3 ───────────
   * Streams a short cached MP3 spoken by an OpenAI TTS voice picked
   * deterministically from the template's tone + id, so the admin can
   * hear roughly what the assistant sounds like before committing.
   *
   * Cache lives on disk via voicePreview.cachePathForText, keyed by
   * (templateId, openaiVoice, sha256(text)) — re-clicking is instant
   * and edits to the template name/tone produce a fresh synthesis.
   *
   * Returns 503 when OpenAI is unconfigured or generation fails so the
   * frontend can toast "Voice preview unavailable" instead of crashing.
   *
   * Optional `?sample=` query (admin-supplied custom sentence, max 200
   * chars) overrides the auto-built greeting.
   * ──────────────────────────────────────────────────────────────── */
  app.get(
    "/api/admin/tradeline/templates/:kind/:templateId/voice-sample",
    requireAdmin,
    async (req: Request, res: Response) => {
      const parseKind = kindParam.safeParse(req.params.kind);
      if (!parseKind.success) {
        return res.status(400).json({ error: "invalid_kind" });
      }
      const kind = parseKind.data;
      const templateId = String(req.params.templateId);
      if (!/^[a-z0-9][a-z0-9_-]*$/i.test(templateId)) {
        return res.status(400).json({ error: "invalid_template_id" });
      }

      // Per-actor rate limit (admin id when known, IP otherwise).
      const rateKey = `voice-preview:${req.user?.id ?? req.ip ?? "anon"}`;
      if (!checkVoicePreviewRate(rateKey)) {
        return res.status(429).json({ error: "rate_limited" });
      }

      if (!isPreviewAvailable()) {
        return res.status(503).json({ error: "preview_unavailable" });
      }

      try {
        // Resolve the template's effective fields (code default + override).
        const codeDefault = findCodeDefault(kind, templateId);
        const overrideRow = await getOverride(kind, templateId);
        if (!codeDefault && !overrideRow) {
          return res.status(404).json({ error: "template_not_found" });
        }
        const base =
          codeDefault ??
          (kind === "tradeline"
            ? emptyTradelineDefault(templateId)
            : emptyConciergeDefault(templateId));
        const effective = applyOverrides(
          base,
          overrideRow?.overrides ?? null,
        ) as unknown as Record<string, unknown>;

        // Custom sample sentence (optional, capped + sanitized).
        const customRaw = req.query.sample;
        const customSample =
          typeof customRaw === "string" ? customRaw : undefined;
        const text = buildPreviewGreeting(kind, effective, customSample);

        // Deterministic OpenAI voice — folds the template id + tone into
        // the pickOpenAIVoice hash so each template keeps a stable timbre.
        const tone = String(effective.defaultTone ?? "professional");
        const voiceSeed = `${templateId}:${tone}`;
        // No gender on templates → null means pickOpenAIVoice samples from
        // the full 6-voice pool deterministically by hash.
        const openaiVoice = pickOpenAIVoice(voiceSeed, null);

        const cachePrefix = `tpl_${kind}_${templateId}_${tone}`.toLowerCase();
        const buf = await getOrCreateSampleForText(
          cachePrefix,
          openaiVoice,
          text,
        );
        if (!buf) {
          return res.status(503).json({ error: "preview_unavailable" });
        }
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Cache-Control", "private, max-age=86400");
        res.setHeader("Content-Length", String(buf.length));
        return res.end(buf);
      } catch (err: any) {
        log.error("template voice-sample failed", {
          error: err?.message,
          kind,
          templateId,
        });
        return res.status(503).json({ error: "preview_unavailable" });
      }
    },
  );
}
