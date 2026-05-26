/**
 * Portal AdFlow Ad Copy Composer — Wave 30.
 *
 * POST /api/portal/adflow/copy/generate
 *
 * Generates 3 predictive-scored ad-copy variants for the customer's
 * current campaign + trade. Each variant carries a `predictedScore`
 * (0-100) used by the AdCopyComposer card's KpiGauge.
 *
 * Body:
 *   { trade: string, platform?: "google"|"meta"|"bing", offer?: string }
 *
 * Response:
 *   { variants: [{ id, headline, body, cta, predictedScore }] }
 *
 * Implementation: no external AI call in this PR — variants are
 * synthesized from a trade-keyed template library so the route is
 * deterministic + free. The humanization orchestrator can be wired in a
 * follow-up PR; the API shape is stable so the UI doesn't change.
 *
 * Auth: requireClient. adminPreviewSafe-wrapped (returns deterministic
 * preview variants).
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireClient } from "../../../auth";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalAdflowCopy");

const generateSchema = z.object({
  trade: z.string().min(1).max(60),
  platform: z.enum(["google", "meta", "bing"]).optional(),
  offer: z.string().max(120).optional(),
});

interface CopyVariant {
  id: string;
  headline: string;
  body: string;
  cta: string;
  predictedScore: number;
}

interface CopyResponse {
  previewMode?: boolean;
  variants: CopyVariant[];
}

const TRADE_TEMPLATES: Record<string, Array<{ headline: string; body: string; cta: string }>> = {
  plumbing: [
    {
      headline: "Same-Day Plumbing — Licensed & Insured",
      body: "Local plumber on call. Upfront pricing, no surprises. Hundreds of 5-star neighbors.",
      cta: "Book Now",
    },
    {
      headline: "Burst Pipe? We Answer 24/7",
      body: "Emergency response in under 60 minutes. Flat-rate quotes before any work begins.",
      cta: "Call Today",
    },
    {
      headline: "$49 Drain Cleaning Special",
      body: "Limited-time offer for new neighbors. Free camera inspection with every visit.",
      cta: "Claim Offer",
    },
  ],
  hvac: [
    {
      headline: "AC Tune-Up — $89 This Week",
      body: "Beat the heat. Certified techs, transparent pricing, financing available.",
      cta: "Schedule",
    },
    {
      headline: "Furnace Repair, Done Right",
      body: "Same-day service. 10-year warranty on parts. Local family-owned crew.",
      cta: "Book Now",
    },
    {
      headline: "New System Quote in 24 Hours",
      body: "Honest, no-pressure estimates. Rebates + 0% financing for qualified buyers.",
      cta: "Get Quote",
    },
  ],
  roofing: [
    {
      headline: "Free Roof Inspection — Today",
      body: "Storm damage? We work with your insurance. GAF-certified, 10-year workmanship warranty.",
      cta: "Book Inspection",
    },
    {
      headline: "Roof Replacement, $0 Down",
      body: "Financing available. Lifetime materials warranty. Locally owned since 1998.",
      cta: "See Options",
    },
    {
      headline: "Leak Repair — Same Week",
      body: "Stop the damage now. Upfront pricing, drone roof scan included with every quote.",
      cta: "Schedule Now",
    },
  ],
  electrical: [
    {
      headline: "Licensed Electricians, Same-Day",
      body: "Flat-rate pricing. Panel upgrades, EV chargers, whole-home rewiring.",
      cta: "Book Now",
    },
    {
      headline: "Power Out? We're On It",
      body: "24/7 emergency electricians. Local crew, master-licensed, fully insured.",
      cta: "Call Today",
    },
    {
      headline: "EV Charger Install — $799",
      body: "Level 2 charger + permit + install. Federal tax credit eligible.",
      cta: "Get Started",
    },
  ],
  default: [
    {
      headline: "Trusted Local Pros, Same Day",
      body: "Upfront pricing, friendly crew, hundreds of 5-star reviews from neighbors like you.",
      cta: "Book Now",
    },
    {
      headline: "Free Quote in Under 5 Minutes",
      body: "Get an instant estimate online. No phone tag, no pushy sales calls.",
      cta: "Get Quote",
    },
    {
      headline: "Local Family-Owned Since 1998",
      body: "Licensed, insured, background-checked techs. Satisfaction guaranteed or we make it right.",
      cta: "Schedule",
    },
  ],
};

function variantsForTrade(trade: string, offer?: string): CopyVariant[] {
  const key = trade.toLowerCase();
  const templates = TRADE_TEMPLATES[key] ?? TRADE_TEMPLATES.default!;
  return templates.map((t, i) => {
    let body = t.body;
    if (offer && i === 0) {
      body = `${offer} ${body}`;
    }
    // Predictive score: skew first variant slightly higher to reflect
    // template priority. In the future this swaps in a real model call.
    const baseScores = [82, 74, 68];
    return {
      id: `${key}-v${i + 1}-${Date.now()}`,
      headline: t.headline,
      body,
      cta: t.cta,
      predictedScore: baseScores[i] ?? 70,
    };
  });
}

const PREVIEW_RESPONSE = {
  previewMode: true,
  variants: variantsForTrade("default"),
} satisfies Record<string, unknown>;

export function registerPortalAdflowCopyRoutes(app: Express) {
  app.post(
    "/api/portal/adflow/copy/generate",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: PREVIEW_RESPONSE,
          mode: "write",
          action: "adflow.copy.generate",
        });
        if (clientId === null) return;

        const parsed = generateSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid body",
            details: parsed.error.flatten(),
          });
        }

        const variants = variantsForTrade(parsed.data.trade, parsed.data.offer);
        log.info("adflow.copy.generate", {
          clientId,
          trade: parsed.data.trade,
          platform: parsed.data.platform,
        });
        res.json({ variants });
      } catch (err: any) {
        log.error("[portal/adflow/copy/generate]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
