/**
 * Outreach Sending Routes — Lane OA.
 *
 * Mounted under /api/admin/outbound — all routes require admin auth.
 *
 *  1. Sending-domain pool CRUD     /api/admin/outbound/sending-domains
 *     - HARD DENYLIST: wefixtrades.com + any subdomain rejected at insert.
 *  2. Domain health sync           POST .../sending-domains/sync-health
 *     - Pulls trailing-7-day Smartlead analytics, auto-pauses on
 *       bounce > 3% or complaint > 0.1%.
 *  3. Campaign link verification   GET .../campaigns/:id/verify-link
 *     - FROZEN CONTRACT (Lane C compiles against this blind):
 *       { linked: boolean, verified: boolean, platform_status: string,
 *         email_accounts: [{ email: string, domain: string }] }
 *
 * Key-absent behaviour: every route that needs the Smartlead API answers
 * 503 { error: "not_configured" } when SMARTLEAD_API_KEY is unset.
 * Mock data is NEVER served as a real platform response.
 */

import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "../auth";
import { db } from "../db";
import {
  outboundCampaigns,
  outreachSendingDomains,
  insertOutreachSendingDomainSchema,
  sendingDomainStatusSchema,
} from "@shared/schema";
import {
  getSmartleadClient,
  isSmartleadConfigured,
} from "../services/sending/smartleadClient";
import {
  isDeniedSendingDomain,
  normalizeDomain,
  syncDomainHealth,
  verifyCampaignLink,
  type VerifyLinkResult,
} from "../services/sending/sendingDomainPool";
import { createLogger } from "../lib/logger";

const log = createLogger("outreachSendingRoutes");

const NOT_CONFIGURED = { error: "not_configured" } as const;

function notConfigured(res: Response): void {
  res.status(503).json(NOT_CONFIGURED);
}

const patchDomainSchema = z
  .object({
    status: sendingDomainStatusSchema.optional(),
    daily_cap: z.number().int().min(1).max(2000).optional(),
    warmup_started_at: z.coerce.date().optional(),
    paused_reason: z.string().max(500).nullable().optional(),
  })
  .strict();

export function registerOutreachSendingRoutes(app: Express): void {
  /* ── 1. Sending-domain pool CRUD (DB-only — works without the API key) ── */

  app.get(
    "/api/admin/outbound/sending-domains",
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const rows = await db
          .select()
          .from(outreachSendingDomains)
          .orderBy(outreachSendingDomains.domain);
        res.json({ domains: rows });
      } catch (err) {
        log.error("list sending domains failed", { error: String(err) });
        res.status(500).json({ error: "internal_error" });
      }
    },
  );

  app.post(
    "/api/admin/outbound/sending-domains",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const parsed = insertOutreachSendingDomainSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_body",
            details: parsed.error.flatten().fieldErrors,
          });
          return;
        }

        const domain = normalizeDomain(parsed.data.domain);

        // HARD DENYLIST — the brand domain never enters the pool.
        if (isDeniedSendingDomain(domain)) {
          res.status(400).json({
            error: "domain_denied",
            message:
              "wefixtrades.com and its subdomains are permanently denylisted for cold outreach",
          });
          return;
        }

        const existing = await db
          .select({ id: outreachSendingDomains.id })
          .from(outreachSendingDomains)
          .where(eq(outreachSendingDomains.domain, domain));
        if (existing.length > 0) {
          res.status(409).json({ error: "domain_exists" });
          return;
        }

        const status = parsed.data.status ?? "warming";
        const [row] = await db
          .insert(outreachSendingDomains)
          .values({
            domain,
            status,
            daily_cap: parsed.data.daily_cap ?? 20,
            warmup_started_at:
              parsed.data.warmup_started_at ??
              (status === "warming" ? new Date() : null),
          })
          .returning();
        res.status(201).json({ domain: row });
      } catch (err) {
        log.error("create sending domain failed", { error: String(err) });
        res.status(500).json({ error: "internal_error" });
      }
    },
  );

  app.patch(
    "/api/admin/outbound/sending-domains/:id",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          res.status(400).json({ error: "invalid_id" });
          return;
        }
        const parsed = patchDomainSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_body",
            details: parsed.error.flatten().fieldErrors,
          });
          return;
        }
        // `domain` is intentionally immutable — delete + re-create instead,
        // so the denylist check can never be bypassed via rename.
        if ("domain" in (req.body ?? {})) {
          res.status(400).json({ error: "domain_immutable" });
          return;
        }

        const [row] = await db
          .update(outreachSendingDomains)
          .set({ ...parsed.data, updated_at: new Date() })
          .where(eq(outreachSendingDomains.id, id))
          .returning();
        if (!row) {
          res.status(404).json({ error: "not_found" });
          return;
        }
        res.json({ domain: row });
      } catch (err) {
        log.error("update sending domain failed", { error: String(err) });
        res.status(500).json({ error: "internal_error" });
      }
    },
  );

  app.delete(
    "/api/admin/outbound/sending-domains/:id",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          res.status(400).json({ error: "invalid_id" });
          return;
        }
        const [row] = await db
          .delete(outreachSendingDomains)
          .where(eq(outreachSendingDomains.id, id))
          .returning();
        if (!row) {
          res.status(404).json({ error: "not_found" });
          return;
        }
        res.json({ deleted: true, domain: row.domain });
      } catch (err) {
        log.error("delete sending domain failed", { error: String(err) });
        res.status(500).json({ error: "internal_error" });
      }
    },
  );

  /* ── 2. Domain health sync (requires the Smartlead API) ── */

  app.post(
    "/api/admin/outbound/sending-domains/sync-health",
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        if (!isSmartleadConfigured()) {
          notConfigured(res);
          return;
        }
        const summary = await syncDomainHealth(getSmartleadClient());
        res.json(summary);
      } catch (err) {
        // Client errors are already api_key-redacted at the throw site.
        log.error("domain health sync failed", { error: String(err) });
        res.status(500).json({ error: "internal_error" });
      }
    },
  );

  /* ── 3. Campaign verify-link (FROZEN CONTRACT — do not change shape) ── */

  app.get(
    "/api/admin/outbound/campaigns/:id/verify-link",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          res.status(400).json({ error: "invalid_id" });
          return;
        }

        const [campaign] = await db
          .select({
            id: outboundCampaigns.id,
            platform: outboundCampaigns.platform,
            external_campaign_id: outboundCampaigns.external_campaign_id,
          })
          .from(outboundCampaigns)
          .where(eq(outboundCampaigns.id, id));
        if (!campaign) {
          res.status(404).json({ error: "campaign_not_found" });
          return;
        }

        // Not linked to Smartlead at all → honest unlinked result in the
        // frozen shape (no platform call needed).
        if (campaign.platform !== "smartlead" || !campaign.external_campaign_id) {
          const result: VerifyLinkResult = {
            linked: false,
            verified: false,
            platform_status: "not_linked",
            email_accounts: [],
          };
          res.json(result);
          return;
        }

        if (!isSmartleadConfigured()) {
          notConfigured(res);
          return;
        }

        const result: VerifyLinkResult = await verifyCampaignLink(
          getSmartleadClient(),
          campaign.external_campaign_id,
        );
        res.json(result);
      } catch (err) {
        log.error("verify-link failed", { error: String(err) });
        res.status(500).json({ error: "internal_error" });
      }
    },
  );
}
