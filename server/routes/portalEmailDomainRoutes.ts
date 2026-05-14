/**
 * Portal routes for Pro-tier custom email domain setup.
 *
 * Endpoints (all requireClient + Pro-access-gated):
 *   GET    /api/portal/email-domain                — current identity + required DNS records
 *   POST   /api/portal/email-domain/claim          — set the custom domain to verify
 *   POST   /api/portal/email-domain/verify         — re-run DNS check
 *   DELETE /api/portal/email-domain                — revert to wefixtrades subdomain
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { clientEmailIdentities, clients } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireClient } from "../auth";
import { clientHasProAccess } from "../lib/clientProAccess";
import { verifyDomain, requiredRecordsForDomain } from "../lib/dnsVerify";
import { createLogger } from "../lib/logger";

const log = createLogger("PortalEmailDomain");

async function withClientId(req: Request, res: Response): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, req.user!.id))
    .limit(1);
  if (!row) {
    res.status(403).json({ error: "No client record linked to this account", code: "no_client_linked" });
    return null;
  }
  return row.id;
}

async function getOrCreateIdentity(clientId: number, businessName: string) {
  const [existing] = await db
    .select()
    .from(clientEmailIdentities)
    .where(eq(clientEmailIdentities.client_id, clientId))
    .limit(1);
  if (existing) return existing;
  const [inserted] = await db
    .insert(clientEmailIdentities)
    .values({ client_id: clientId, display_name: businessName, sending_method: "wefixtrades_subdomain" })
    .returning();
  return inserted;
}

const VALID_DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/i;

export function registerPortalEmailDomainRoutes(app: Express) {
  /* ─── GET state ─── */
  app.get("/api/portal/email-domain", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      if (!client) return res.status(404).json({ error: "Client not found" });

      const identity = await getOrCreateIdentity(clientId, client.business_name);
      const proAccess = await clientHasProAccess(clientId);

      return res.json({
        proAccess,
        identity: {
          displayName: identity.display_name,
          customDomain: identity.custom_domain,
          customDomainVerifiedAt: identity.custom_domain_verified_at,
          sendingMethod: identity.sending_method,
          lastVerifyAttemptAt: identity.last_verify_attempt_at,
          lastVerifyError: identity.last_verify_error,
        },
        requiredRecords: identity.custom_domain ? requiredRecordsForDomain(identity.custom_domain) : null,
      });
    } catch (err) {
      log.error("get failed", { err: (err as Error).message });
      return res.status(500).json({ error: "Failed to load email-domain settings" });
    }
  });

  /* ─── POST claim a domain (Pro-gated) ─── */
  const claimBody = z.object({
    domain: z.string().min(4).max(253),
    displayName: z.string().min(1).max(120).optional(),
  });
  app.post("/api/portal/email-domain/claim", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      if (!(await clientHasProAccess(clientId))) {
        return res.status(403).json({
          error: "Custom email domain is a Pro feature. Upgrade or start your 14-day Pro trial.",
          code: "pro_required",
        });
      }
      const parsed = claimBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const domain = parsed.data.domain.toLowerCase().trim();
      if (!VALID_DOMAIN_RE.test(domain)) {
        return res.status(400).json({ error: "That doesn't look like a valid domain (e.g. yourcompany.com)." });
      }

      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      if (!client) return res.status(404).json({ error: "Client not found" });

      // Upsert identity row with the claimed domain (verification not yet attempted)
      await getOrCreateIdentity(clientId, client.business_name);
      await db
        .update(clientEmailIdentities)
        .set({
          custom_domain: domain,
          custom_domain_verified_at: null,
          sending_method: "wefixtrades_subdomain", // stays default until verified
          last_verify_attempt_at: null,
          last_verify_error: null,
          display_name: parsed.data.displayName?.trim() || client.business_name,
          updated_at: new Date(),
        })
        .where(eq(clientEmailIdentities.client_id, clientId));

      return res.json({
        ok: true,
        domain,
        requiredRecords: requiredRecordsForDomain(domain),
      });
    } catch (err) {
      log.error("claim failed", { err: (err as Error).message });
      return res.status(500).json({ error: "Failed to save the domain claim" });
    }
  });

  /* ─── POST verify DNS ─── */
  app.post("/api/portal/email-domain/verify", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      if (!(await clientHasProAccess(clientId))) {
        return res.status(403).json({ error: "Custom email domain is a Pro feature.", code: "pro_required" });
      }
      const [identity] = await db
        .select()
        .from(clientEmailIdentities)
        .where(eq(clientEmailIdentities.client_id, clientId))
        .limit(1);
      if (!identity?.custom_domain) {
        return res.status(400).json({ error: "Claim a domain first before verifying." });
      }

      const result = await verifyDomain(identity.custom_domain);
      const errorText = result.allPassed
        ? null
        : [!result.spf.ok ? `SPF: ${result.spf.details}` : null, !result.dkim.ok ? `DKIM: ${result.dkim.details}` : null, !result.dmarc.ok ? `DMARC: ${result.dmarc.details}` : null]
            .filter(Boolean)
            .join("\n");

      await db
        .update(clientEmailIdentities)
        .set({
          custom_domain_verified_at: result.allPassed ? new Date() : null,
          sending_method: result.allPassed ? "custom_domain" : "wefixtrades_subdomain",
          last_verify_attempt_at: new Date(),
          last_verify_error: errorText,
          updated_at: new Date(),
        })
        .where(eq(clientEmailIdentities.client_id, clientId));

      return res.json({ result, requiredRecords: requiredRecordsForDomain(identity.custom_domain) });
    } catch (err) {
      log.error("verify failed", { err: (err as Error).message });
      return res.status(500).json({ error: "DNS verification failed" });
    }
  });

  /* ─── DELETE (revert) ─── */
  app.delete("/api/portal/email-domain", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      await db
        .update(clientEmailIdentities)
        .set({
          custom_domain: null,
          custom_domain_verified_at: null,
          sending_method: "wefixtrades_subdomain",
          last_verify_attempt_at: null,
          last_verify_error: null,
          updated_at: new Date(),
        })
        .where(eq(clientEmailIdentities.client_id, clientId));
      return res.json({ ok: true });
    } catch (err) {
      log.error("delete failed", { err: (err as Error).message });
      return res.status(500).json({ error: "Failed to revert email-domain settings" });
    }
  });
}
