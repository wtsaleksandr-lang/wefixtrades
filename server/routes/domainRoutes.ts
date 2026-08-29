import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { buildSubdomain, HOSTING_DOMAIN } from "@shared/slugUtils";
import { createLogger } from "../lib/logger";

const log = createLogger("Domain");

/**
 * Custom-domain SSL: what is real and what is not.
 *
 * This route file previously contained a `setTimeout(…, 5000)` that flipped
 * `ssl_status` to `'active'` and `custom_domain_status` to `'active'`, with
 * its own error branch logging "SSL provision simulation error". It called no
 * CA, ran no ACME flow, and made no Cloudflare request. It backed the
 * QuoteQuick Pro **paid** "Custom domain" feature, so a paying customer was
 * shown a certificate that did not exist.
 *
 * The simulation is removed. Nothing in this app issues a certificate today,
 * so nothing here claims one. Two consequences, both deliberate:
 *
 *  1. `POST /api/domains/issue-ssl` answers **501 Not Implemented** and
 *     records `ssl_status: 'manual_required'`. It is not a silent no-op — a
 *     caller gets an explicit, machine-readable "a human has to do this".
 *
 *  2. `GET /api/domains/status` DOWNGRADES the legacy `'provisioning'` and
 *     `'active'` values on read. Those two values could only ever have been
 *     written by the simulation, so a stored `'active'` is not evidence of a
 *     certificate — it is a record of the bug. They are reported as
 *     `'unverified'` with an explanatory note rather than being trusted.
 *     No stored row is rewritten by a read.
 *
 * Real provisioning (Cloudflare zone onboarding → DNS records → Universal
 * SSL) is phase 2. Until it ships, the honest answer is "manual".
 */
const SSL_STATUS_MANUAL = "manual_required";

/** Values only the removed simulation could have written. */
const SIMULATED_SSL_STATUSES = new Set(["provisioning", "active"]);

const SSL_UNVERIFIED_NOTE =
  "SSL is not provisioned automatically. This value was recorded before " +
  "certificate provisioning existed and has not been verified against a " +
  "certificate authority.";

/** Report an SSL status we can actually stand behind. */
export function honestSslStatus(stored: string | undefined | null): {
  ssl_status: string;
  ssl_note?: string;
} {
  const value = (stored || "none").toString();
  if (SIMULATED_SSL_STATUSES.has(value)) {
    return { ssl_status: "unverified", ssl_note: SSL_UNVERIFIED_NOTE };
  }
  return { ssl_status: value };
}

export function registerDomainRoutes(app: Express): void {
  app.post("/api/domains/check-dns", async (req, res) => {
    try {
      const body = z.object({
        calculator_id: z.number(),
        custom_domain: z.string().min(3),
        token: z.string(),
      }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: "Invalid request" });

      const calculator = await storage.getCalculatorByToken(body.data.token);
      if (!calculator || calculator.id !== body.data.calculator_id) {
        return res.status(404).json({ error: "Calculator not found" });
      }

      const domain = body.data.custom_domain.toLowerCase().trim();
      const requiredCname = HOSTING_DOMAIN;

      let dnsVerified = false;
      try {
        const dns = await import('dns');
        const records = await dns.promises.resolveCname(domain);
        dnsVerified = records.some(r => r.toLowerCase() === requiredCname || r.toLowerCase().endsWith(`.${requiredCname}`));
      } catch {
        dnsVerified = false;
      }

      const newStatus = dnsVerified ? 'dns_verified' : 'pending_dns';
      const sslStatus = dnsVerified ? 'pending' : 'none';

      const settings = (calculator.calculator_settings as any) || {};
      const publish = settings.publish || {};
      const updatedSettings = {
        ...settings,
        publish: {
          ...publish,
          custom_domain: domain,
          custom_domain_status: newStatus,
          ssl_status: sslStatus,
          last_dns_check: Date.now(),
        },
      };
      await storage.updateCalculator(calculator.id, { calculator_settings: updatedSettings });

      res.json({
        domain,
        dns_verified: dnsVerified,
        status: newStatus,
        ssl_status: sslStatus,
        required_cname: requiredCname,
        checked_at: Date.now(),
      });
    } catch (error: any) {
      log.error("DNS check error:", error);
      res.status(500).json({ error: "DNS check failed" });
    }
  });

  app.post("/api/domains/issue-ssl", async (req, res) => {
    try {
      const body = z.object({
        calculator_id: z.number(),
        token: z.string(),
      }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: "Invalid request" });

      const calculator = await storage.getCalculatorByToken(body.data.token);
      if (!calculator || calculator.id !== body.data.calculator_id) {
        return res.status(404).json({ error: "Calculator not found" });
      }

      const settings = (calculator.calculator_settings as any) || {};
      const publish = settings.publish || {};

      if (publish.custom_domain_status !== 'dns_verified') {
        return res.status(400).json({ error: "DNS must be verified before SSL provisioning" });
      }

      /* Record the honest state: DNS is verified, and a human still has to
       * provision the certificate. We deliberately do NOT write a
       * 'provisioning' status — nothing is in progress, so saying so would
       * be the same lie in a different tense. */
      const updatedSettings = {
        ...settings,
        publish: {
          ...publish,
          ssl_status: SSL_STATUS_MANUAL,
          custom_domain_status: 'dns_verified',
          ssl_requested_at: Date.now(),
        },
      };
      await storage.updateCalculator(calculator.id, { calculator_settings: updatedSettings });

      log.info("SSL provisioning requested — manual handling required", {
        calculatorId: calculator.id,
        domain: publish.custom_domain,
      });

      /* 501, not 200. Automated certificate issuance does not exist in this
       * app, and a 2xx would read as "done". */
      res.status(501).json({
        status: SSL_STATUS_MANUAL,
        automated: false,
        message:
          "Automated SSL provisioning is not available. DNS is verified; a WeFixTrades " +
          "operator provisions the certificate manually and this status updates when they do.",
      });
    } catch (error: any) {
      log.error("SSL issue error:", error);
      res.status(500).json({ error: "SSL provisioning failed" });
    }
  });

  app.get("/api/domains/status", async (req, res) => {
    try {
      const query = z.object({ token: z.string() }).safeParse(req.query);
      if (!query.success) return res.status(400).json({ error: "token required" });

      const calculator = await storage.getCalculatorByToken(query.data.token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found" });

      const settings = (calculator.calculator_settings as any) || {};
      const publish = settings.publish || {};

      // Wave P-E — slug is now nullable. A null slug means the
      // calculator's subdomain has been released; the caller (owner)
      // sees `released` status instead of subdomain/URL details.
      /* Downgrade any value the removed simulation could have written. A read
       * never rewrites the stored row — it only refuses to repeat a claim we
       * cannot back. */
      const ssl = honestSslStatus(publish.ssl_status);
      const customDomainStatus =
        publish.custom_domain_status === 'active' || publish.custom_domain_status === 'ssl_provisioning'
          ? 'dns_verified'
          : publish.custom_domain_status || 'none';

      const slug = calculator.slug;
      if (!slug) {
        res.json({
          slug: null,
          subdomain: '',
          hosted_url: '',
          custom_domain: publish.custom_domain || '',
          custom_domain_status: customDomainStatus,
          ...ssl,
          ssl_automated: false,
          last_dns_check: publish.last_dns_check || null,
          slug_status: 'released',
        });
        return;
      }
      res.json({
        slug,
        subdomain: buildSubdomain(slug, HOSTING_DOMAIN),
        hosted_url: `https://${buildSubdomain(slug, HOSTING_DOMAIN)}`,
        custom_domain: publish.custom_domain || '',
        custom_domain_status: customDomainStatus,
        ...ssl,
        ssl_automated: false,
        last_dns_check: publish.last_dns_check || null,
      });
    } catch (error: any) {
      log.error("Domain status error:", error);
      res.status(500).json({ error: "Failed to get domain status" });
    }
  });
}
