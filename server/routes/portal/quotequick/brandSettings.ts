/**
 * Portal QuoteQuick Brand Settings — Wave 29.
 *
 * GET  /api/portal/quotequick/brand-settings
 * POST /api/portal/quotequick/brand-settings
 *
 * White-label config for Pro/Business tier customers. Stored on the
 * calculator row (most-recent calculator owned by the client). Persisted
 * inside `calculators.calculator_settings.brand` to avoid a schema
 * migration — the existing JSONB column already takes arbitrary keys.
 *
 * Fields:
 *   - logo_url
 *   - brand_color   (hex; auto-syncs the widget primary color)
 *   - font_family   (one of the 8 web-safe + Google Fonts allowlist)
 *   - show_powered_by_badge (default ON Pro, OFF Business)
 *   - custom_css    (escape hatch for Business+; max 4KB)
 *
 * Tier gate: Free + Pro can edit logo + brand_color + font_family.
 * Business+ unlocks custom_css and show_powered_by_badge=false.
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clients, calculators } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalQuotequickBrandSettings");

const FONT_ALLOWLIST = [
  "system",
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Poppins",
  "Montserrat",
  "Source Sans Pro",
  "Nunito",
] as const;

const brandSchema = z.object({
  logo_url: z.string().url().max(1024).nullable().optional(),
  brand_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  font_family: z.enum(FONT_ALLOWLIST).optional(),
  show_powered_by_badge: z.boolean().optional(),
  custom_css: z.string().max(4096).nullable().optional(),
});

type BrandSettings = z.infer<typeof brandSchema>;

const DEFAULTS: Required<{
  logo_url: string | null;
  brand_color: string | null;
  font_family: (typeof FONT_ALLOWLIST)[number];
  show_powered_by_badge: boolean;
  custom_css: string | null;
}> = {
  logo_url: null,
  brand_color: "#6366f1",
  font_family: "system",
  show_powered_by_badge: true,
  custom_css: null,
};

interface BrandSettingsResponse {
  previewMode?: boolean;
  settings: typeof DEFAULTS;
  tier: string;
  customCssAllowed: boolean;
  removeBadgeAllowed: boolean;
  fontAllowlist: readonly string[];
}

const PREVIEW_RESPONSE = {
  previewMode: true,
  settings: DEFAULTS,
  tier: "free",
  customCssAllowed: false,
  removeBadgeAllowed: false,
  fontAllowlist: FONT_ALLOWLIST,
} satisfies Record<string, unknown>;

function parseStored(input: unknown): typeof DEFAULTS {
  const obj = (input ?? {}) as Record<string, unknown>;
  const parsed = brandSchema.safeParse(obj);
  if (!parsed.success) return DEFAULTS;
  return {
    logo_url: parsed.data.logo_url ?? DEFAULTS.logo_url,
    brand_color: parsed.data.brand_color ?? DEFAULTS.brand_color,
    font_family: parsed.data.font_family ?? DEFAULTS.font_family,
    show_powered_by_badge:
      parsed.data.show_powered_by_badge ?? DEFAULTS.show_powered_by_badge,
    custom_css: parsed.data.custom_css ?? DEFAULTS.custom_css,
  };
}

function tierAllowsCustomCss(tier: string | null | undefined): boolean {
  const t = (tier ?? "").toLowerCase();
  return t === "business" || t === "enterprise";
}

function tierAllowsBadgeRemoval(tier: string | null | undefined): boolean {
  const t = (tier ?? "").toLowerCase();
  return t === "business" || t === "enterprise";
}

async function resolveMostRecentCalculator(
  clientId: number,
): Promise<{
  id: number;
  plan_tier: string | null;
  calculator_settings: unknown;
} | null> {
  const [client] = await db
    .select({ user_id: clients.user_id })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client?.user_id) return null;

  const [calc] = await db
    .select({
      id: calculators.id,
      plan_tier: calculators.plan_tier,
      calculator_settings: calculators.calculator_settings,
    })
    .from(calculators)
    .where(eq(calculators.user_id, client.user_id))
    .orderBy(desc(calculators.id))
    .limit(1);
  return calc ?? null;
}

export function registerPortalQuotequickBrandSettingsRoutes(app: Express) {
  app.get(
    "/api/portal/quotequick/brand-settings",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: PREVIEW_RESPONSE,
        });
        if (clientId === null) return;

        const calc = await resolveMostRecentCalculator(clientId);
        if (!calc) {
          return res.json(PREVIEW_RESPONSE);
        }

        const cs = (calc.calculator_settings ?? {}) as Record<string, unknown>;
        const settings = parseStored(cs.brand);

        const tier = calc.plan_tier ?? "free";
        res.json({
          settings,
          tier,
          customCssAllowed: tierAllowsCustomCss(tier),
          removeBadgeAllowed: tierAllowsBadgeRemoval(tier),
          fontAllowlist: FONT_ALLOWLIST,
        });
      } catch (err: any) {
        log.error(
          "[portal/quotequick/brand-settings GET]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.post(
    "/api/portal/quotequick/brand-settings",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: { ...PREVIEW_RESPONSE, persisted: false },
          mode: "write",
          action: "quotequick.brand-settings.update",
        });
        if (clientId === null) return;

        const parsed = brandSchema.safeParse(req.body?.settings);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid body",
            details: parsed.error.flatten(),
          });
        }

        const calc = await resolveMostRecentCalculator(clientId);
        if (!calc) {
          return res.status(404).json({ error: "No calculator configured" });
        }

        const tier = calc.plan_tier ?? "free";
        const incoming = parsed.data;

        // Tier enforcement — silently null out fields the tier can't unlock.
        if (!tierAllowsCustomCss(tier)) incoming.custom_css = null;
        if (!tierAllowsBadgeRemoval(tier)) incoming.show_powered_by_badge = true;

        // Merge into calculator_settings.brand.
        const cs = (calc.calculator_settings ?? {}) as Record<string, unknown>;
        const prevBrand = parseStored(cs.brand);
        const nextBrand = {
          ...prevBrand,
          ...incoming,
        };
        const nextSettings = { ...cs, brand: nextBrand };

        await db
          .update(calculators)
          .set({
            calculator_settings: nextSettings,
            // also keep the top-level primary_color column in sync so the
            // public widget runtime CSS works without reading the JSONB.
            ...(incoming.brand_color
              ? { primary_color: incoming.brand_color }
              : {}),
            updated_at: new Date(),
          })
          .where(eq(calculators.id, calc.id));

        log.info("quotequick.brand-settings.updated", {
          clientId,
          calcId: calc.id,
          tier,
        });

        res.json({
          settings: nextBrand,
          tier,
          customCssAllowed: tierAllowsCustomCss(tier),
          removeBadgeAllowed: tierAllowsBadgeRemoval(tier),
          fontAllowlist: FONT_ALLOWLIST,
          persisted: true,
        });
      } catch (err: any) {
        log.error(
          "[portal/quotequick/brand-settings POST]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
