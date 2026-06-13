/**
 * Portal "Your AI assistant" — unified owner-facing AI placement control.
 *
 * Mounted under /api/portal/ai-assistant/*. Auth: requireClient.
 *
 * This is the session-authed bridge the unified "Your AI assistant" portal
 * page (PortalYourAiAssistant.tsx) uses to read + toggle the Calculator-widget
 * placement. The existing dashboard toggle (dashboard.tsx → PATCH
 * /api/calculators) is TOKEN-authed (calculator edit_token), which a session
 * portal page must not handle client-side for a billing-adjacent control. So
 * this exposes the SAME state transition over the owner's session instead:
 *
 *   GET   /api/portal/ai-assistant/status
 *     → the owner's calculator placement state, with the honest "is it live"
 *       boolean computed from the SHARED isAiAssistantActive predicate (the
 *       exact one the public widget + chat route gate on — never drifts), plus
 *       the wizard's AI-chat-visibility setting for the Appearance link.
 *
 *   PATCH /api/portal/ai-assistant/calculator-placement  { enabled: boolean }
 *     → flips ai_employee EXACTLY like the dashboard free toggle:
 *         on  → { enabled:true, subscription_status:'active', plan:'free_included' }
 *         off → { enabled:false }
 *       Persisted via storage.updateCalculator with a deep-merge of
 *       calculator_settings so channels/consent/training_profile are preserved.
 *
 * No new tables, no new knowledge store — the page's "Teach your assistant"
 * surface reuses the existing tradeline_knowledge_base CRUD
 * (portalTradelineKnowledgeRoutes.ts); the Website placement status reuses the
 * existing /api/portal/widget/site endpoint.
 */

import type { Express, Request, Response } from "express";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { requireClient } from "../auth";
import { db } from "../db";
import { storage } from "../storage";
import { clients, calculators } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { withClientIdOrPreview } from "../middleware/adminPreviewSafe";
import { isAiAssistantActive } from "@shared/schemas/calculator";

const log = createLogger("PortalAiAssistant");

const BASE = "/api/portal/ai-assistant";

/**
 * Deep-merge a calculator_settings patch into the existing JSONB so a partial
 * ai_employee patch never clobbers sibling keys (channels/consent/...). Mirrors
 * deepMergeSettings in calculatorRoutes.ts — kept local so this route owns its
 * own persistence path without importing a non-exported helper. Arrays replace.
 */
function deepMergeSettings(
  base: Record<string, any>,
  patch: Record<string, any>,
): Record<string, any> {
  const result = { ...base };
  for (const key of Object.keys(patch)) {
    const baseVal = base[key];
    const patchVal = patch[key];
    if (
      patchVal !== null &&
      typeof patchVal === "object" &&
      !Array.isArray(patchVal) &&
      baseVal !== null &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMergeSettings(baseVal, patchVal);
    } else {
      result[key] = patchVal;
    }
  }
  return result;
}

/** Resolve the authenticated user's most-recent calculator (or null). */
async function resolveOwnerCalculator(req: Request, res: Response) {
  const clientId = await withClientIdOrPreview(req, res, {
    previewShape: { calculator: null },
  });
  if (clientId === null) return undefined; // response already sent (preview/403)

  const [client] = await db
    .select({ user_id: clients.user_id })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client?.user_id) return null;

  const calcs = await db
    .select()
    .from(calculators)
    .where(eq(calculators.user_id, client.user_id))
    .orderBy(desc(calculators.id))
    .limit(1);
  return calcs[0] ?? null;
}

export function registerPortalAiAssistantRoutes(app: Express): void {
  /* ─── GET /status — placement state for the unified page ─── */
  app.get(`${BASE}/status`, requireClient, async (req: Request, res: Response) => {
    try {
      const calc = await resolveOwnerCalculator(req, res);
      if (calc === undefined) return; // handled by withClientIdOrPreview

      if (!calc) {
        return res.json({
          hasCalculator: false,
          calculator: null,
        });
      }

      const settings = (calc.calculator_settings as any) || {};
      const aiEmployee = settings.ai_employee || {};
      const active = isAiAssistantActive(aiEmployee);
      // 'rescue' (smart timing, default) | 'always' — from the wizard Style tab.
      const aiChatVisibility =
        settings?.advanced?.style?.aiChatVisibility === "always" ? "always" : "rescue";

      return res.json({
        hasCalculator: true,
        calculator: {
          id: calc.id,
          business_name: calc.business_name,
          slug: calc.slug,
          // The single honest predicate the public widget renders on. We expose
          // ONLY the boolean + the owner-facing "enabled" intent — never the
          // billing internals (subscription_status / trial timestamps / plan).
          enabled: aiEmployee.enabled === true,
          active,
          aiChatVisibility,
        },
      });
    } catch (err: any) {
      log.error("status failed", { error: err?.message });
      res.status(500).json({ error: "status_failed" });
    }
  });

  /* ─── PATCH /calculator-placement — flip the Calculator-widget placement ─── */
  const patchBody = z.object({ enabled: z.boolean() });
  app.patch(
    `${BASE}/calculator-placement`,
    requireClient,
    async (req: Request, res: Response) => {
      const parsed = patchBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid_body", details: parsed.error.format() });
      }
      try {
        const calc = await resolveOwnerCalculator(req, res);
        if (calc === undefined) return;
        if (!calc) return res.status(404).json({ error: "no_calculator" });

        const currentSettings = (calc.calculator_settings as any) || {};
        // EXACT state the dashboard free toggle writes (dashboard.tsx) so the
        // two controls can never diverge: on → active/free_included, off →
        // disabled. Deep-merged so channels/consent/training_profile survive.
        const aiPatch = parsed.data.enabled
          ? { enabled: true, subscription_status: "active", plan: "free_included" }
          : { enabled: false };
        const nextSettings = deepMergeSettings(currentSettings, { ai_employee: aiPatch });

        const updated = await storage.updateCalculator(calc.id, {
          calculator_settings: nextSettings as any,
        });
        if (!updated) return res.status(500).json({ error: "update_failed" });

        const nextAi = ((updated.calculator_settings as any) || {}).ai_employee || {};
        return res.json({
          enabled: nextAi.enabled === true,
          active: isAiAssistantActive(nextAi),
        });
      } catch (err: any) {
        log.error("calculator-placement patch failed", { error: err?.message });
        res.status(500).json({ error: "update_failed" });
      }
    },
  );
}
