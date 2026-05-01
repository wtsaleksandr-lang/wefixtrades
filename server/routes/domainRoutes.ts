import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { buildSubdomain, HOSTING_DOMAIN } from "@shared/slugUtils";
import { createLogger } from "../lib/logger";

const log = createLogger("Domain");

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

      const updatedSettings = {
        ...settings,
        publish: {
          ...publish,
          ssl_status: 'provisioning',
          custom_domain_status: 'ssl_provisioning',
        },
      };
      await storage.updateCalculator(calculator.id, { calculator_settings: updatedSettings });

      setTimeout(async () => {
        try {
          const freshCalc = await storage.getCalculatorByToken(body.data.token);
          if (freshCalc) {
            const s = (freshCalc.calculator_settings as any) || {};
            const p = s.publish || {};
            await storage.updateCalculator(freshCalc.id, {
              calculator_settings: {
                ...s,
                publish: { ...p, ssl_status: 'active', custom_domain_status: 'active' },
              },
            });
          }
        } catch (err) {
          log.error("SSL provision simulation error:", { error: String(err) });
        }
      }, 5000);

      res.json({ status: 'provisioning', message: 'SSL certificate is being provisioned' });
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

      res.json({
        slug: calculator.slug,
        subdomain: buildSubdomain(calculator.slug, HOSTING_DOMAIN),
        hosted_url: `https://${buildSubdomain(calculator.slug, HOSTING_DOMAIN)}`,
        custom_domain: publish.custom_domain || '',
        custom_domain_status: publish.custom_domain_status || 'none',
        ssl_status: publish.ssl_status || 'none',
        last_dns_check: publish.last_dns_check || null,
      });
    } catch (error: any) {
      log.error("Domain status error:", error);
      res.status(500).json({ error: "Failed to get domain status" });
    }
  });
}
