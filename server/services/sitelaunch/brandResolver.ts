/**
 * SiteLaunch — brand resolution.
 *
 * Answers one question: what colours, fonts and logo should this customer's
 * site use? Resolution is a strict precedence chain over data the repo
 * ALREADY holds, so a customer who has used any other WeFixTrades product
 * arrives with their brand already known:
 *
 *   1. an explicit manual override on the site record        (source: manual)
 *   2. their default `brand_kits` row                        (source: brand_kit)
 *      — real table, real CRUD: shared/schemas/brandKits.ts,
 *        server/routes/portalBrandKitsRoutes.ts
 *   3. `clients.metadata.content_brand`                      (source: content_brand)
 *      — the richer ContentFlow brandProfile model, already populated by
 *        onboarding: server/services/contentflow/brandProfile.ts
 *   4. the theme's own defaults                              (source: theme_default)
 *
 * The chain never invents a brand colour. When nothing is known the theme
 * default is used and `source` says so, which the admin surface shows —
 * an operator can see at a glance whether the palette came from the
 * customer or from us.
 *
 * NOT IN SCOPE: extracting a palette from an uploaded logo image. That needs
 * a pixel-quantisation library the repo does not have (no node-vibrant, no
 * color-thief) and is listed as a phase-2 item. Nothing here pretends to do
 * it.
 */

import { eq, and, desc } from "drizzle-orm";
import { db } from "../../db";
import { brandKits } from "@shared/schema";
import { readBrandProfile } from "../contentflow/brandProfile";
import { createLogger } from "../../lib/logger";
import type { SiteBrand } from "@shared/sitelaunch/document";

const log = createLogger("SiteLaunch:Brand");

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function normaliseHex(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!HEX_RE.test(trimmed)) return "";
  return trimmed.startsWith("#") ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
}

function normaliseUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")) return trimmed.slice(0, 1000);
  return "";
}

export interface BrandResolutionInput {
  /** users.id — owner of any brand_kits rows. */
  userId?: number | null;
  /** The clients row, for metadata.content_brand. */
  client?: { metadata?: unknown } | null;
  /** Explicit overrides an operator typed into the admin editor. */
  manual?: Partial<SiteBrand> | null;
}

/**
 * Resolve a `SiteBrand`. Never throws — a DB failure degrades to the next
 * source in the chain and logs, because a brand lookup must not be able to
 * block a site render.
 */
export async function resolveSiteBrand(input: BrandResolutionInput): Promise<SiteBrand> {
  const empty: SiteBrand = {
    primary: "",
    secondary: "",
    logo_url: "",
    heading_font: "",
    body_font: "",
    source: "theme_default",
  };

  // 1 — manual override wins outright.
  const manualPrimary = normaliseHex(input.manual?.primary);
  if (manualPrimary) {
    return {
      ...empty,
      primary: manualPrimary,
      secondary: normaliseHex(input.manual?.secondary),
      logo_url: normaliseUrl(input.manual?.logo_url),
      heading_font: (input.manual?.heading_font || "").slice(0, 40),
      body_font: (input.manual?.body_font || "").slice(0, 40),
      source: "manual",
    };
  }

  // 2 — the customer's default brand kit.
  if (input.userId) {
    try {
      const rows = await db
        .select()
        .from(brandKits)
        .where(and(eq(brandKits.user_id, input.userId), eq(brandKits.is_default, true)))
        .orderBy(desc(brandKits.created_at))
        .limit(1);
      const kit = rows[0];
      if (kit) {
        const style = (kit.style ?? {}) as Record<string, unknown>;
        const primary = normaliseHex(style.accentColor ?? style.accent_color ?? style.primaryColor);
        if (primary) {
          return {
            ...empty,
            primary,
            secondary: normaliseHex(style.secondaryColor ?? style.secondary_color),
            logo_url: normaliseUrl(kit.logo_url ?? style.logoUrl),
            source: "brand_kit",
            brand_kit_id: kit.id,
          };
        }
      }
    } catch (err: any) {
      // Degrade to the next source rather than failing the whole resolve —
      // but log loudly, never silently.
      log.warn("brand_kits lookup failed — falling through to content_brand", {
        error: err?.message,
        userId: input.userId,
      });
    }
  }

  // 3 — the ContentFlow brand profile on the client record.
  if (input.client) {
    const profile = readBrandProfile(input.client);
    const primary = normaliseHex(profile.primary_color);
    if (primary) {
      return {
        ...empty,
        primary,
        secondary: normaliseHex(profile.secondary_color),
        logo_url: normaliseUrl(profile.logo_url),
        source: "content_brand",
      };
    }
    // A logo with no usable colour is still worth carrying forward.
    const logo = normaliseUrl(profile.logo_url);
    if (logo) return { ...empty, logo_url: logo };
  }

  // 4 — theme defaults.
  return empty;
}

/** Synchronous variant for callers that already hold the source objects.
 *  Skips the brand_kits query; used by the draft generator's tests. */
export function resolveSiteBrandFromProfile(
  client: { metadata?: unknown } | null | undefined,
  manual?: Partial<SiteBrand> | null,
): SiteBrand {
  const empty: SiteBrand = {
    primary: "",
    secondary: "",
    logo_url: "",
    heading_font: "",
    body_font: "",
    source: "theme_default",
  };
  const manualPrimary = normaliseHex(manual?.primary);
  if (manualPrimary) {
    return {
      ...empty,
      primary: manualPrimary,
      secondary: normaliseHex(manual?.secondary),
      logo_url: normaliseUrl(manual?.logo_url),
      source: "manual",
    };
  }
  const profile = readBrandProfile(client);
  const primary = normaliseHex(profile.primary_color);
  if (primary) {
    return {
      ...empty,
      primary,
      secondary: normaliseHex(profile.secondary_color),
      logo_url: normaliseUrl(profile.logo_url),
      source: "content_brand",
    };
  }
  const logo = normaliseUrl(profile.logo_url);
  return logo ? { ...empty, logo_url: logo } : empty;
}
