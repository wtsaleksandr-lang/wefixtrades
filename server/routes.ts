import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { randomBytes } from "crypto";
import { z } from "zod";
import OpenAI from "openai";
import Stripe from "stripe";
import { PRICING_TYPES, validatePricingConfig, FAMILY_LABELS, FAMILY_DESCRIPTIONS } from "@shared/pricingConfig";
import { pricingIntakeSchema, sampleQuoteSchema, calculatorSettingsSchema, type PricingDraftJob, type BookingSettings } from "@shared/schema";
import { generatePricingConfigDraft } from "./aiPricingAgent";
import { slugify, isValidSlug, buildSubdomain, HOSTING_DOMAIN } from "@shared/slugUtils";
import auditRouter from "./auditRoutes";
import { sendBookingConfirmationToCustomer, sendBookingNotificationToBusiness } from "./bookingEmails";
import { buildSystemPrompt, runChatCompletion, type AgentType } from "./aiChatEngine";
import {
  isTwilioConfigured,
  checkRateLimit,
  storeSmsMessage,
  matchLeadByPhone,
  truncateSms,
  verifyTwilioSignature,
} from "./twilioClient";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function generateToken(): string {
  return randomBytes(24).toString("hex");
}

async function generateUniqueSlug(businessName?: string): Promise<string> {
  const base = businessName ? slugify(businessName) : randomBytes(6).toString("hex");
  const existing = await storage.getCalculatorBySlug(base);
  if (!existing) return base;

  for (let i = 2; i <= 20; i++) {
    const candidate = `${base}-${i}`;
    const exists = await storage.getCalculatorBySlug(candidate);
    if (!exists) return candidate;
  }
  const suffix = randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}

const createCalculatorBody = z.object({
  business_name: z.string().min(1, "Business name is required"),
  trade_type: z.string().min(1, "Trade type is required"),
  tagline: z.string().nullable().optional(),
  logo_url: z.string().nullable().optional(),
  owner_email: z.string().email().nullable().optional(),
  pricing_config: z.record(z.any()),
  primary_color: z.string().optional(),
  theme_overrides: z.record(z.any()).nullable().optional(),
  calculator_settings: z.record(z.any()).nullable().optional(),
});

const updateCalculatorBody = z.object({
  token: z.string().min(1),
  updates: z.object({
    business_name: z.string().optional(),
    tagline: z.string().nullable().optional(),
    logo_url: z.string().nullable().optional(),
    owner_email: z.string().nullable().optional(),
    owner_phone: z.string().nullable().optional(),
    website_url: z.string().nullable().optional(),
    primary_color: z.string().optional(),
    cta_button_text: z.string().nullable().optional(),
    lead_thank_you_message: z.string().nullable().optional(),
    theme_overrides: z.record(z.any()).nullable().optional(),
    calculator_settings: z.record(z.any()).nullable().optional(),
    pricing_config: z.record(z.any()).optional(),
  }),
});

const checkSlugBody = z.object({
  slug: z.string().min(1).max(60).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

const createLeadBody = z.object({
  calculator_id: z.number(),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  quote_amount: z.number().nullable().optional(),
  answers: z.record(z.any()).nullable().optional(),
  sms_consent: z.boolean().optional(),
  consent_timestamp: z.string().nullable().optional(),
  consent_text_version: z.string().max(50).nullable().optional(),
  coupon_code: z.string().nullable().optional(),
});

const generatePricingBody = z.object({
  trade_type: z.string().min(1),
  business_description: z.string().optional(),
  services: z.string().optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const BASE_URL = "https://quickquotepro.com";
  const MARKETING_ROUTES = [
    "/", "/product", "/pricing", "/services", "/bundles",
    "/templates", "/demo", "/docs", "/contact", "/privacy", "/terms",
    "/features/instant-quotes", "/features/booking", "/features/ai-employee",
    "/features/sms", "/features/calculator-engine",
    "/docs/embed", "/docs/domain", "/docs/booking", "/docs/ai",
    "/docs/webhooks", "/docs/troubleshooting",
    "/product/quickquotepro", "/product/booking-addon", "/product/ai-chat",
    "/product/ai-voice", "/product/mapguard", "/product/webboost",
    "/product/webcare", "/product/sitelaunch", "/product/socialsync",
    "/product/reputationshield",
    "/free-audit",
  ];

  app.use("/api/audit", auditRouter);

  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(
      `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /Dashboard\nDisallow: /EditCalculator\nSitemap: ${BASE_URL}/sitemap.xml\n`
    );
  });

  app.get("/sitemap.xml", (_req, res) => {
    const now = new Date().toISOString().split("T")[0];
    const urls = MARKETING_ROUTES.map(
      (r) =>
        `  <url><loc>${BASE_URL}${r}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>${r === "/" ? "1.0" : "0.8"}</priority></url>`
    ).join("\n");
    res.type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
    );
  });

  const contactSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    subject: z.string().optional(),
    message: z.string().min(1),
  });

  app.post("/api/contact", async (req, res) => {
    const parsed = contactSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
    const { name, email, subject, message } = parsed.data;
    console.log(`[Contact] From: ${name} <${email}> | Subject: ${subject} | ${message.substring(0, 100)}`);
    return res.json({ success: true });
  });

  app.post("/api/analytics/pageview", async (req, res) => {
    return res.json({ ok: true });
  });

  app.post("/api/ai/generate-pricing", async (req, res) => {
    try {
      const parsed = generatePricingBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const { trade_type, business_description, services } = parsed.data;

      const familyList = PRICING_TYPES.map(t => `- "${t}": ${FAMILY_LABELS[t]} — ${FAMILY_DESCRIPTIONS[t]}`).join("\n");

      const prompt = `You are a pricing expert for ${trade_type} businesses.

Business: ${business_description || trade_type}
Services: ${services || "General services"}

You MUST choose ONE of these exact pricing families:
${familyList}

Return a JSON object that matches EXACTLY one of these schemas. Examples:

For "hourly": { "pricingType": "hourly", "unitName": "hour", "rate": 85, "baseFee": 50, "travelFee": 25, "addOns": [{"id":"a1","label":"Emergency Service","type":"fixed","amount":75}] }
For "per_sqft": { "pricingType": "per_sqft", "unitName": "sq ft", "rate": 4.5, "minCharge": 200 }
For "base_plus_rate": { "pricingType": "base_plus_rate", "unitName": "room", "baseFee": 100, "rate": 50, "addOns": [{"id":"a1","label":"Deep Clean","type":"pct","amount":25}] }
For "tiered_packages": { "pricingType": "tiered_packages", "tierMode": "fixed", "tiers": [{"label":"Basic","price":150},{"label":"Standard","price":300},{"label":"Premium","price":500}] }
For "tiered_ranges": { "pricingType": "tiered_ranges", "tierMode": "fixed", "unitName": "sq ft", "tiers": [{"min":0,"max":500,"price":300},{"min":501,"max":1000,"price":500},{"min":1001,"max":null,"price":800}] }
For "price_range_only": { "pricingType": "price_range_only", "rangeMin": 200, "rangeMax": 800 }

Rules:
- addOns must have: id (string), label (string), type ("fixed" or "pct"), amount (number >= 0)
- difficultyTiers must have: id (string), label (string), multiplier (number >= 1)
- afterHoursMult must be >= 1
- All prices/rates must be >= 0
- Choose the BEST family for this trade. Use realistic market rates.

Return ONLY the JSON pricing config object.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const content = completion.choices[0]?.message?.content || "{}";
      let pricing;
      try {
        pricing = JSON.parse(content);
      } catch {
        return res.status(500).json({ error: "AI returned invalid JSON" });
      }

      const validation = validatePricingConfig(pricing);
      if (!validation.valid) {
        console.warn("AI generated invalid pricing config, errors:", validation.errors);
      }

      res.json({ success: true, pricing_config: validation.config, validation_errors: validation.valid ? [] : validation.errors });
    } catch (error: any) {
      console.error("AI pricing generation error:", error);
      res.status(500).json({ error: "Failed to generate pricing configuration" });
    }
  });

  const draftJobs = new Map<string, PricingDraftJob>();

  const JOB_TTL_MS = 5 * 60 * 1000;
  function cleanupJobs() {
    const now = Date.now();
    Array.from(draftJobs.entries()).forEach(([id, job]) => {
      if (now - job.created_at > JOB_TTL_MS) draftJobs.delete(id);
    });
  }
  setInterval(cleanupJobs, 60_000);

  const pricingDraftBody = z.object({
    pricing_intake: pricingIntakeSchema,
    sample_quotes: z.array(sampleQuoteSchema).max(3).optional(),
  });

  app.post("/api/ai/pricing-config-draft", async (req, res) => {
    try {
      const parsed = pricingDraftBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const { pricing_intake, sample_quotes } = parsed.data;
      const jobId = randomBytes(12).toString("hex");

      const job: PricingDraftJob = {
        job_id: jobId,
        status: "processing",
        created_at: Date.now(),
      };
      draftJobs.set(jobId, job);

      res.json({ success: true, job_id: jobId });

      generatePricingConfigDraft(pricing_intake, sample_quotes, openai)
        .then(result => {
          const existingJob = draftJobs.get(jobId);
          if (existingJob) {
            existingJob.status = "completed";
            existingJob.result = {
              pricing_config: result.config as Record<string, unknown>,
              assumptions: result.assumptions,
              confidence_score: result.confidence_score,
              needs_human_review: result.needs_human_review,
              status: "ready",
              pricing_audit: {
                source: result.audit.source || "unknown",
                derivation_attempted: result.audit.derivation_attempted,
                derivation_result: result.audit.derivation_result,
                timestamp: result.audit.timestamp,
              },
            };
          }
        })
        .catch(err => {
          console.error("Draft job failed:", err);
          const existingJob = draftJobs.get(jobId);
          if (existingJob) {
            existingJob.status = "failed";
            existingJob.error = err?.message || "Generation failed";
          }
        });
    } catch (error: any) {
      console.error("AI pricing draft creation error:", error);
      res.status(500).json({ error: "Failed to create pricing draft job" });
    }
  });

  app.get("/api/ai/pricing-config-draft/:jobId", (req, res) => {
    const { jobId } = req.params;
    const job = draftJobs.get(jobId);

    if (!job) {
      return res.status(404).json({ error: "Job not found or expired" });
    }

    res.json({
      job_id: job.job_id,
      status: job.status,
      result: job.status === "completed" ? job.result : undefined,
      error: job.status === "failed" ? job.error : undefined,
    });
  });

  app.post("/api/ai/generate-pricing-draft", async (req, res) => {
    try {
      const body = z.object({
        custom_trade_data: z.record(z.any()),
        business_name: z.string().min(1),
      }).safeParse(req.body);

      if (!body.success) {
        return res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      }

      const { custom_trade_data, business_name } = body.data;
      const intake = pricingIntakeSchema.parse({
        version: 1,
        stage1: custom_trade_data,
        stage2: {},
      });

      const result = await generatePricingConfigDraft(intake, undefined, openai);

      res.json({
        success: true,
        pricing_draft: {
          pricing_config: result.config,
          assumptions: result.assumptions,
          confidence_score: result.confidence_score,
          needs_human_review: result.needs_human_review,
          status: "ready",
        },
      });
    } catch (error: any) {
      console.error("AI pricing draft generation error:", error);
      res.status(500).json({ error: "Failed to generate pricing draft" });
    }
  });

  app.post("/api/calculators", async (req, res) => {
    try {
      const parsed = createCalculatorBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const slug = await generateUniqueSlug(parsed.data.business_name);
      const edit_token = generateToken();
      const token_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const pricingValidation = validatePricingConfig(parsed.data.pricing_config);
      const validatedPricingConfig = pricingValidation.config;

      let validatedSettings = parsed.data.calculator_settings || null;
      if (parsed.data.calculator_settings) {
        try {
          validatedSettings = calculatorSettingsSchema.parse(parsed.data.calculator_settings);
        } catch (err: any) {
          return res.status(400).json({ error: "Invalid calculator_settings", details: err?.message });
        }
      }

      const calculator = await storage.createCalculator({
        slug,
        business_name: parsed.data.business_name,
        trade_type: parsed.data.trade_type,
        tagline: parsed.data.tagline || null,
        logo_url: parsed.data.logo_url || null,
        owner_email: parsed.data.owner_email || null,
        pricing_config: validatedPricingConfig,
        primary_color: parsed.data.primary_color || "#6366f1",
        theme_overrides: parsed.data.theme_overrides || null,
        calculator_settings: validatedSettings,
        edit_token,
        token_expires_at,
      });

      await storage.upsertDeploymentStatus({
        calculator_id: calculator.id,
        status: 'live',
        last_published_at: new Date(),
        auto_republish: true,
      });

      const subdomain = buildSubdomain(calculator.slug, HOSTING_DOMAIN);
      res.json({
        success: true,
        calculator: { ...calculator, is_token_expired: false },
        slug: calculator.slug,
        subdomain,
        hosted_url: `https://${subdomain}`,
        edit_token: calculator.edit_token,
        edit_url: `/EditCalculator?token=${calculator.edit_token}`,
        calculator_url: `/Calculator?slug=${calculator.slug}`,
        leads_url: `/Leads?token=${calculator.edit_token}`,
        dashboard_url: `/Dashboard?token=${calculator.edit_token}`,
      });
    } catch (error: any) {
      console.error("Create calculator error:", error);
      res.status(500).json({ error: "Failed to create calculator" });
    }
  });

  app.get("/api/calculators/check-slug", async (req, res) => {
    try {
      const parsed = checkSlugBody.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ available: false, error: parsed.error.flatten().fieldErrors.slug?.[0] || 'Invalid slug' });
      }
      const validation = isValidSlug(parsed.data.slug);
      if (!validation.valid) {
        return res.json({ available: false, slug: parsed.data.slug, error: validation.reason });
      }
      const existing = await storage.getCalculatorBySlug(parsed.data.slug);
      const subdomain = buildSubdomain(parsed.data.slug, HOSTING_DOMAIN);
      res.json({ available: !existing, slug: parsed.data.slug, subdomain });
    } catch (error: any) {
      console.error("Check slug error:", error);
      res.status(500).json({ available: false, error: "Failed to check slug" });
    }
  });

  app.get("/api/calculators/slugify", (req, res) => {
    const name = String(req.query.name || '');
    if (!name) return res.status(400).json({ error: "name required" });
    const slug = slugify(name);
    const subdomain = buildSubdomain(slug, HOSTING_DOMAIN);
    res.json({ slug, subdomain, hosted_url: `https://${subdomain}` });
  });

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
      console.error("DNS check error:", error);
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
          console.error("SSL provision simulation error:", err);
        }
      }, 5000);

      res.json({ status: 'provisioning', message: 'SSL certificate is being provisioned' });
    } catch (error: any) {
      console.error("SSL issue error:", error);
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
      console.error("Domain status error:", error);
      res.status(500).json({ error: "Failed to get domain status" });
    }
  });

  const lookupQuery = z.object({
    slug: z.string().optional(),
    token: z.string().optional(),
  }).refine(d => d.slug || d.token, { message: "slug or token required" });

  app.get("/api/calculators/lookup", async (req, res) => {
    try {
      const parsed = lookupQuery.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: "slug or token required" });

      const { slug, token } = parsed.data;

      let calculator;
      if (token) {
        calculator = await storage.getCalculatorByToken(token);
      } else if (slug) {
        calculator = await storage.getCalculatorBySlug(slug);
      }

      if (!calculator) {
        return res.status(404).json({ error: "Calculator not found" });
      }

      const isExpired = new Date() > new Date(calculator.token_expires_at);

      if (token && isExpired) {
        res.json({
          calculator: {
            id: calculator.id,
            slug: calculator.slug,
            business_name: calculator.business_name,
            is_token_expired: true,
            is_duplicated: calculator.is_duplicated,
            token_expires_at: calculator.token_expires_at,
          },
        });
      } else {
        res.json({
          calculator: { ...calculator, is_token_expired: isExpired },
        });
      }
    } catch (error: any) {
      console.error("Get calculator error:", error);
      res.status(500).json({ error: "Failed to get calculator" });
    }
  });

  app.patch("/api/calculators", async (req, res) => {
    try {
      const parsed = updateCalculatorBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const calculator = await storage.getCalculatorByToken(parsed.data.token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found" });

      const isExpired = new Date() > new Date(calculator.token_expires_at);
      if (isExpired) return res.status(403).json({ error: "Edit access expired" });

      const updates = { ...parsed.data.updates };
      const pricingChanged = !!updates.pricing_config;
      if (updates.pricing_config) {
        const pricingValidation = validatePricingConfig(updates.pricing_config);
        updates.pricing_config = pricingValidation.config;
      }

      if (updates.calculator_settings) {
        const currentSettings = (calculator.calculator_settings as any) || {};
        try {
          updates.calculator_settings = calculatorSettingsSchema.parse({
            ...currentSettings,
            ...updates.calculator_settings,
          });
        } catch (err: any) {
          return res.status(400).json({ error: "Invalid calculator_settings", details: err?.message });
        }
      }

      const updated = await storage.updateCalculator(calculator.id, updates);

      let autoRepublished = false;
      if (pricingChanged) {
        const deployment = await storage.getDeploymentStatus(calculator.id);
        if (deployment?.auto_republish) {
          const settings = (updated?.calculator_settings as any) || {};
          const publish = settings.publish || {};
          if (publish.status === 'published') {
            await storage.updateCalculator(calculator.id, {
              calculator_settings: {
                ...settings,
                publish: { ...publish, published_at: Date.now(), last_modified: null },
              },
            });
            await storage.upsertDeploymentStatus({
              calculator_id: calculator.id,
              status: 'live',
              last_published_at: new Date(),
            });
            autoRepublished = true;
          }
        }
      }

      res.json({ success: true, calculator: updated, auto_republished: autoRepublished });
    } catch (error: any) {
      console.error("Update calculator error:", error);
      res.status(500).json({ error: "Failed to update calculator" });
    }
  });

  const duplicateBody = z.object({ token: z.string().min(1, "Token required") });

  app.post("/api/calculators/duplicate", async (req, res) => {
    try {
      const parsed = duplicateBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Token required" });

      const calculator = await storage.getCalculatorByToken(parsed.data.token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found" });

      const isExpired = new Date() > new Date(calculator.token_expires_at);
      if (isExpired && !calculator.is_duplicated) {
        // Expired tokens can still duplicate (that's the renewal mechanism)
      } else if (calculator.is_duplicated) {
        return res.status(400).json({ error: "Already duplicated" });
      }

      const newSlug = await generateUniqueSlug();
      const newToken = generateToken();
      const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const newCalc = await storage.duplicateCalculator(calculator.id, newSlug, newToken, newExpiry);
      if (!newCalc) return res.status(500).json({ error: "Failed to duplicate" });

      res.json({
        success: true,
        new_slug: newCalc.slug,
        new_token: newCalc.edit_token,
        new_edit_url: `/EditCalculator?token=${newCalc.edit_token}`,
        new_calculator_url: `/Calculator?slug=${newCalc.slug}`,
      });
    } catch (error: any) {
      console.error("Duplicate calculator error:", error);
      res.status(500).json({ error: "Failed to duplicate calculator" });
    }
  });

  const trackViewBody = z.object({ calculator_id: z.number() });

  app.post("/api/calculators/track-view", async (_req, res) => {
    try {
      const parsed = trackViewBody.safeParse(_req.body);
      if (parsed.success) {
        await storage.incrementViews(parsed.data.calculator_id);
        const ua = _req.headers['user-agent'] || '';
        const isMobile = /Mobile|Android|iPhone/i.test(ua);
        const isTablet = /iPad|Tablet/i.test(ua);
        const device_type = isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop';
        storage.trackEvent({
          calculator_id: parsed.data.calculator_id,
          event_type: 'view',
          metadata: { device_type, user_agent: ua.substring(0, 200) },
        }).catch(() => {});
      }
      res.json({ success: true });
    } catch {
      res.json({ success: true });
    }
  });

  app.post("/api/leads", async (req, res) => {
    try {
      const parsed = createLeadBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const lead = await storage.createLead({
        calculator_id: parsed.data.calculator_id,
        name: parsed.data.name || null,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        company: parsed.data.company || null,
        quote_amount: parsed.data.quote_amount || null,
        answers: parsed.data.answers || null,
        status: 'new',
        sms_consent: parsed.data.sms_consent || false,
        consent_timestamp: parsed.data.sms_consent && parsed.data.consent_timestamp
          ? new Date(parsed.data.consent_timestamp)
          : null,
        consent_text_version: parsed.data.sms_consent && parsed.data.consent_text_version
          ? parsed.data.consent_text_version
          : null,
      });

      if (parsed.data.coupon_code) {
        storage.incrementCouponUsage(parsed.data.calculator_id, parsed.data.coupon_code).catch(err => {
          console.error("Failed to increment coupon usage:", err.message);
        });
      }

      storage.trackEvent({
        calculator_id: parsed.data.calculator_id,
        event_type: 'lead',
        metadata: { quote_amount: parsed.data.quote_amount || null },
      }).catch(() => {});

      enqueueLeadNotificationsAndFollowups(lead, parsed.data.calculator_id).catch(err => {
        console.error("Failed to enqueue lead notifications:", err.message);
      });

      res.json({ success: true, lead });
    } catch (error: any) {
      console.error("Create lead error:", error);
      res.status(500).json({ error: "Failed to submit lead" });
    }
  });

  const leadsQuery = z.object({ token: z.string().min(1) });

  app.get("/api/leads", async (req, res) => {
    try {
      const parsed = leadsQuery.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: "Token required" });
      const { token } = parsed.data;

      const calculator = await storage.getCalculatorByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found" });

      const isExpired = new Date() > new Date(calculator.token_expires_at);
      if (isExpired) return res.status(403).json({ error: "Edit access expired. Duplicate your calculator to get a new edit period." });

      const leadsList = await storage.getLeadsByCalculatorId(calculator.id);

      res.json({
        calculator: {
          id: calculator.id,
          slug: calculator.slug,
          business_name: calculator.business_name,
          total_views: calculator.total_views,
        },
        leads: leadsList,
      });
    } catch (error: any) {
      console.error("Get leads error:", error);
      res.status(500).json({ error: "Failed to get leads" });
    }
  });

  // ============ COUPON API ROUTES ============

  app.post("/api/calculators/:slug/coupons/validate", async (req, res) => {
    try {
      const { slug } = req.params;
      const body = z.object({ code: z.string().min(1) }).safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ valid: false, error: 'invalid_request' });
      }

      const calculator = await storage.getCalculatorBySlug(slug);
      if (!calculator) {
        return res.status(404).json({ valid: false, error: 'not_found' });
      }

      const settings = (calculator.calculator_settings as any) || {};
      const promotions = settings.promotions || {};
      const coupons: any[] = promotions.coupons || [];

      const normalizedCode = body.data.code.toUpperCase();
      const coupon = coupons.find((c: any) => c.code.toUpperCase() === normalizedCode);

      if (!coupon) {
        return res.json({ valid: false, error: 'not_found' });
      }

      if (!coupon.active) {
        return res.json({ valid: false, error: 'inactive' });
      }

      if (coupon.expires_at !== null && coupon.expires_at !== undefined && coupon.expires_at < Date.now()) {
        return res.json({ valid: false, error: 'expired' });
      }

      if (coupon.usage_limit !== null && coupon.usage_limit !== undefined && (coupon.usage_count || 0) >= coupon.usage_limit) {
        return res.json({ valid: false, error: 'limit_reached' });
      }

      res.json({
        valid: true,
        coupon: {
          id: coupon.id,
          code: coupon.code,
          type: coupon.type,
          value: coupon.value,
          applies_to: coupon.applies_to || 'estimate_total',
        },
      });
    } catch (error: any) {
      console.error("Coupon validate error:", error);
      res.status(500).json({ valid: false, error: 'server_error' });
    }
  });

  // ============ DASHBOARD API ROUTES ============

  async function requireCalcByToken(token: string) {
    const calculator = await storage.getCalculatorByToken(token);
    if (!calculator) return null;
    const isExpired = new Date() > new Date(calculator.token_expires_at);
    if (isExpired) return null;
    return calculator;
  }

  app.get("/api/dashboard/overview", async (req, res) => {
    try {
      const token = String(req.query.token || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [leadsThisWeek, totalLeads, eventCounts, deployment, avgQuote] = await Promise.all([
        storage.getLeadCountSince(calculator.id, oneWeekAgo),
        storage.getLeadsByCalculatorId(calculator.id).then(l => l.length),
        storage.getEventCounts(calculator.id, oneWeekAgo),
        storage.getDeploymentStatus(calculator.id),
        storage.getAvgQuoteAmount(calculator.id),
      ]);

      const settings = (calculator.calculator_settings as any) || {};
      const publish = settings.publish || {};

      const totalViews = calculator.total_views || 0;
      const conversionRate = totalViews > 0 ? Math.round((totalLeads / totalViews) * 100) : 0;

      const subdomain = calculator.slug ? buildSubdomain(calculator.slug, HOSTING_DOMAIN) : '';

      res.json({
        calculator: {
          id: calculator.id,
          slug: calculator.slug,
          business_name: calculator.business_name,
          trade_type: calculator.trade_type,
          owner_email: calculator.owner_email,
          created_at: calculator.created_at,
          calculator_settings: calculator.calculator_settings || {},
          show_powered_by_badge: calculator.show_powered_by_badge ?? true,
          plan_tier: calculator.plan_tier || "free",
        },
        plan_tier: calculator.plan_tier || "free",
        status: publish.status || deployment?.status || 'draft',
        hosted_url: subdomain ? `https://${subdomain}` : '',
        subdomain,
        custom_domain: publish.custom_domain || '',
        custom_domain_status: publish.custom_domain_status || 'none',
        stats: {
          leads_this_week: leadsThisWeek,
          total_leads: totalLeads,
          total_views: totalViews,
          views_this_week: eventCounts.views,
          conversion_rate: conversionRate,
          avg_quote: avgQuote,
        },
      });
    } catch (error: any) {
      console.error("Dashboard overview error:", error);
      res.status(500).json({ error: "Failed to load overview" });
    }
  });

  app.get("/api/dashboard/leads", async (req, res) => {
    try {
      const token = String(req.query.token || '');
      const search = String(req.query.search || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const leadsList = search
        ? await storage.searchLeads(calculator.id, search)
        : await storage.getLeadsByCalculatorId(calculator.id);

      res.json({ leads: leadsList });
    } catch (error: any) {
      console.error("Dashboard leads error:", error);
      res.status(500).json({ error: "Failed to load leads" });
    }
  });

  app.delete("/api/dashboard/leads/:id", async (req, res) => {
    try {
      const token = String(req.query.token || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      await storage.deleteLead(parseInt(req.params.id), calculator.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete lead error:", error);
      res.status(500).json({ error: "Failed to delete lead" });
    }
  });

  app.get("/api/dashboard/leads/export", async (req, res) => {
    try {
      const token = String(req.query.token || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const leadsList = await storage.getLeadsByCalculatorId(calculator.id);

      const header = 'Name,Phone,Email,Quote,Date\n';
      const rows = leadsList.map(l => {
        const name = (l.name || '').replace(/,/g, ' ');
        const phone = (l.phone || '').replace(/,/g, ' ');
        const email = (l.email || '').replace(/,/g, ' ');
        const quote = l.quote_amount || '';
        const date = l.created_date ? new Date(l.created_date).toISOString().split('T')[0] : '';
        return `${name},${phone},${email},${quote},${date}`;
      }).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="leads-${calculator.slug}.csv"`);
      res.send(header + rows);
    } catch (error: any) {
      console.error("Export leads error:", error);
      res.status(500).json({ error: "Failed to export leads" });
    }
  });

  app.get("/api/dashboard/analytics", async (req, res) => {
    try {
      const token = String(req.query.token || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [eventCounts, weeklyTrend, avgQuote, allLeads, bookingStats] = await Promise.all([
        storage.getEventCounts(calculator.id, thirtyDaysAgo),
        storage.getWeeklyTrend(calculator.id),
        storage.getAvgQuoteAmount(calculator.id),
        storage.getLeadsByCalculatorId(calculator.id),
        storage.getBookingStats(calculator.id),
      ]);

      const totalLeads = allLeads.length;
      const totalViews = calculator.total_views || 0;
      const conversionRate = totalViews > 0 ? Math.round((totalLeads / totalViews) * 100) : 0;

      const settings = (calculator.calculator_settings as any) || {};
      const promotions = settings.promotions || {};
      const coupons: any[] = promotions.coupons || [];
      const couponUses = coupons.reduce((sum: number, c: any) => sum + (c.usage_count || 0), 0);

      const { bookings_total, bookings_confirmed, payments_completed } = bookingStats;
      const estimateToBookingPct = totalLeads > 0 ? Math.round((bookings_total / totalLeads) * 100) : 0;
      const bookingToPaymentPct = bookings_total > 0 ? Math.round((payments_completed / bookings_total) * 100) : 0;

      res.json({
        views: totalViews,
        leads: totalLeads,
        conversion_rate: conversionRate,
        avg_quote: avgQuote,
        weekly_trend: weeklyTrend,
        bookings_total,
        bookings_confirmed,
        payments_completed,
        coupon_uses: couponUses,
        estimate_to_booking_pct: estimateToBookingPct,
        booking_to_payment_pct: bookingToPaymentPct,
      });
    } catch (error: any) {
      console.error("Dashboard analytics error:", error);
      res.status(500).json({ error: "Failed to load analytics" });
    }
  });

  app.post("/api/dashboard/track", async (req, res) => {
    try {
      const body = z.object({
        calculator_id: z.number(),
        event_type: z.enum(['view', 'lead', 'quote_generated', 'confidence_tier']),
        metadata: z.object({
          device_type: z.enum(['mobile', 'tablet', 'desktop']).optional(),
          confidence_tier: z.enum(['strong', 'close', 'needs_adjustment']).optional(),
          quote_amount: z.number().optional(),
          user_agent: z.string().optional(),
        }).optional(),
      }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: "Invalid request" });

      await storage.trackEvent({
        calculator_id: body.data.calculator_id,
        event_type: body.data.event_type,
        metadata: body.data.metadata || null,
      });

      if (body.data.event_type === 'view') {
        await storage.incrementViews(body.data.calculator_id);
      }

      res.json({ success: true });
    } catch (error: any) {
      res.json({ success: true });
    }
  });

  app.patch("/api/dashboard/settings", async (req, res) => {
    try {
      const body = z.object({
        token: z.string(),
        notification_email: z.string().optional(),
        auto_republish: z.boolean().optional(),
      }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: "Invalid request" });

      const calculator = await requireCalcByToken(body.data.token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      if (body.data.notification_email !== undefined) {
        await storage.updateCalculator(calculator.id, { owner_email: body.data.notification_email });
      }

      if (body.data.auto_republish !== undefined) {
        await storage.upsertDeploymentStatus({
          calculator_id: calculator.id,
          status: ((calculator.calculator_settings as any)?.publish?.status) || 'draft',
          auto_republish: body.data.auto_republish,
        });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Update settings error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  app.post("/api/dashboard/republish", async (req, res) => {
    try {
      const body = z.object({ token: z.string() }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: "Invalid request" });

      const calculator = await requireCalcByToken(body.data.token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const settings = (calculator.calculator_settings as any) || {};
      const publish = settings.publish || {};

      await storage.updateCalculator(calculator.id, {
        calculator_settings: {
          ...settings,
          publish: {
            ...publish,
            status: 'published',
            published_at: Date.now(),
            last_modified: null,
          },
        },
      });

      await storage.upsertDeploymentStatus({
        calculator_id: calculator.id,
        status: 'live',
        last_published_at: new Date(),
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Republish error:", error);
      res.status(500).json({ error: "Failed to republish" });
    }
  });

  // ============ LEAD STATUS ============

  app.patch("/api/dashboard/leads/:id/status", async (req, res) => {
    try {
      const token = String(req.query.token || req.body.token || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const validStatuses = ['new', 'contacted', 'won', 'lost'];
      const status = String(req.body.status || '');
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be: new, contacted, won, lost" });
      }

      const leadId = parseInt(req.params.id);
      const lead = await storage.getLeadById(leadId);
      if (!lead || lead.calculator_id !== calculator.id) {
        return res.status(404).json({ error: "Lead not found" });
      }

      const updated = await storage.updateLeadStatus(leadId, status);

      if (status !== 'new') {
        await storage.cancelFollowupsForLead(leadId);
      }

      res.json({ success: true, lead: updated });
    } catch (error: any) {
      console.error("Update lead status error:", error);
      res.status(500).json({ error: "Failed to update lead status" });
    }
  });

  // ============ FOLLOWUP SETTINGS ============

  app.get("/api/dashboard/followup", async (req, res) => {
    try {
      const token = String(req.query.token || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const settings = (calculator.calculator_settings as any) || {};
      const followup = settings.followup || {};

      res.json({ followup });
    } catch (error: any) {
      console.error("Get followup settings error:", error);
      res.status(500).json({ error: "Failed to load follow-up settings" });
    }
  });

  app.put("/api/dashboard/followup", async (req, res) => {
    try {
      const body = z.object({
        token: z.string(),
        followup: z.record(z.any()),
      }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: "Invalid request" });

      const calculator = await requireCalcByToken(body.data.token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const settings = (calculator.calculator_settings as any) || {};
      await storage.updateCalculator(calculator.id, {
        calculator_settings: {
          ...settings,
          followup: { ...settings.followup, ...body.data.followup },
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Update followup settings error:", error);
      res.status(500).json({ error: "Failed to update follow-up settings" });
    }
  });

  app.post("/api/dashboard/followup/test", async (req, res) => {
    try {
      const body = z.object({
        token: z.string(),
        template_type: z.enum(['thank_you', 'reminder', 'last_call']),
      }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: "Invalid request" });

      const calculator = await requireCalcByToken(body.data.token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      if (!calculator.owner_email) {
        return res.status(400).json({ error: "No business email configured" });
      }

      const settings = (calculator.calculator_settings as any) || {};
      const followup = settings.followup || {};
      const templates = followup.templates || {};
      const personalization = followup.personalization || {};
      const template = templates[body.data.template_type] || {};

      const vars: Record<string, string> = {
        name: 'Test Customer',
        quote_amount: '$500',
        business_name: personalization.business_name || calculator.business_name,
        phone: personalization.phone || '',
        booking_link: personalization.booking_link || '',
        service_area: personalization.service_area || '',
      };

      let subject = template.subject || `Test: ${body.data.template_type}`;
      let emailBody = template.body || 'This is a test message.';
      for (const [key, value] of Object.entries(vars)) {
        subject = subject.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        emailBody = emailBody.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }

      const nodemailer = await import('nodemailer');
      const smtpHost = process.env.SMTP_HOST;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;

      if (!smtpHost || !smtpUser || !smtpPass) {
        return res.json({ success: true, message: "Test email queued (SMTP not configured — would send when configured)" });
      }

      const port = parseInt(process.env.SMTP_PORT || "587", 10);
      const transporter = nodemailer.default.createTransport({
        host: smtpHost, port, secure: port === 465, auth: { user: smtpUser, pass: smtpPass },
      });
      const from = process.env.SMTP_FROM || smtpUser || 'noreply@quickquote.app';
      const htmlBody = emailBody.replace(/\n/g, '<br/>');
      const html = `<!DOCTYPE html><html><body style="font-family:'Inter',Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="padding:28px;font-size:14px;line-height:1.7;color:#333;">${htmlBody}</td></tr>
  <tr><td style="padding:12px 28px;background:#f9fafb;text-align:center;"><p style="font-size:11px;color:#9ca3af;margin:0;">Test email from QuickQuote Follow-Up Autopilot</p></td></tr>
</table></body></html>`;

      try {
        await transporter.sendMail({ from, to: calculator.owner_email!, subject: `[TEST] ${subject}`, html });
      } catch (sendErr: any) {
        return res.json({ success: true, message: `Test email queued (send failed: ${sendErr.message})` });
      }

      res.json({ success: true, message: "Test email queued for delivery" });
    } catch (error: any) {
      console.error("Test followup error:", error);
      res.status(500).json({ error: "Failed to send test" });
    }
  });

  // ============ NOTIFICATION / FOLLOWUP LOGS ============

  app.get("/api/dashboard/notification-logs", async (req, res) => {
    try {
      const token = String(req.query.token || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const notifications = await storage.getNotificationLogs(calculator.id, 50);
      const followups = await storage.getFollowupLogs(calculator.id, 50);

      res.json({ notifications, followups });
    } catch (error: any) {
      console.error("Get logs error:", error);
      res.status(500).json({ error: "Failed to load logs" });
    }
  });

  app.delete("/api/dashboard/calculator", async (req, res) => {
    try {
      const token = String(req.query.token || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      await storage.deleteCalculator(calculator.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete calculator error:", error);
      res.status(500).json({ error: "Failed to delete calculator" });
    }
  });

  async function enqueueLeadNotificationsAndFollowups(lead: any, calculatorId: number) {
    const allCalcs = await storage.getAllCalculatorsWithEmail();
    const calc = allCalcs.find(c => c.id === calculatorId);
    if (!calc) return;

    const settings = (calc.calculator_settings as any) || {};
    const followup = settings.followup || {};
    const notifications = followup.notifications || {};
    const leadFormSettings = settings.lead_form || {};
    const deliveryEmail = leadFormSettings.delivery?.primary_email || calc.owner_email;

    const devDomain = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '';
    const dashboardUrl = `${devDomain}/Dashboard?token=${calc.edit_token}`;
    const hostedUrl = calc.slug ? `https://${calc.slug}.estimate.ai` : '';

    if (notifications.email_enabled !== false && deliveryEmail) {
      await storage.enqueueNotification({
        calculator_id: calculatorId,
        lead_id: lead.id,
        type: 'email',
        status: 'pending',
        payload: {
          edit_token: calc.edit_token,
          delivery_email: deliveryEmail,
          dashboard_url: dashboardUrl,
          hosted_url: hostedUrl,
        },
      });
    }

    if (notifications.webhook_enabled && notifications.webhook_url) {
      await storage.enqueueNotification({
        calculator_id: calculatorId,
        lead_id: lead.id,
        type: 'webhook',
        status: 'pending',
        payload: {
          webhook_url: notifications.webhook_url,
          webhook_payload: {
            lead_id: lead.id,
            calculator_id: calculatorId,
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            quote_value: lead.quote_amount,
            inputs_summary: lead.answers ? Object.entries(lead.answers as Record<string, any>).slice(0, 5) : [],
            created_at: new Date().toISOString(),
          },
        },
      });
    }

    if (followup.enabled) {
      const schedule = followup.schedule || [];
      const templates = followup.templates || {};
      const personalization = followup.personalization || {};
      const channels = followup.channels || { email: true, sms: false };

      const jobsToEnqueue: any[] = [];
      const now = Date.now();

      for (const step of schedule) {
        let offsetMs = 0;
        if (step.offset_minutes) offsetMs = step.offset_minutes * 60 * 1000;
        else if (step.offset_hours) offsetMs = step.offset_hours * 60 * 60 * 1000;
        else if (step.offset_days) offsetMs = step.offset_days * 24 * 60 * 60 * 1000;

        const runAt = new Date(now + offsetMs);
        const template = templates[step.type] || {};

        if (channels.email) {
          jobsToEnqueue.push({
            lead_id: lead.id,
            calculator_id: calculatorId,
            run_at: runAt,
            type: step.type,
            channel: 'email',
            status: 'pending',
            payload: {
              followup_enabled: true,
              template: { subject: template.subject, body: template.body },
              personalization: {
                business_name: personalization.business_name || calc.business_name,
                phone: personalization.phone || calc.owner_phone || '',
                booking_link: personalization.booking_link || '',
                service_area: personalization.service_area || '',
              },
            },
          });
        }

        if (channels.sms && lead.sms_consent) {
          jobsToEnqueue.push({
            lead_id: lead.id,
            calculator_id: calculatorId,
            run_at: runAt,
            type: step.type,
            channel: 'sms',
            status: 'pending',
            payload: {
              followup_enabled: true,
              template: { sms: template.sms },
              personalization: {
                business_name: personalization.business_name || calc.business_name,
                phone: personalization.phone || calc.owner_phone || '',
              },
            },
          });
        }
      }

      if (jobsToEnqueue.length > 0) {
        await storage.enqueueFollowupJobs(jobsToEnqueue);
      }
    }
  }

  // ==========================================
  // BOOKING & STRIPE CONNECT ROUTES
  // ==========================================

  function getStripeClient(): Stripe | null {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return null;
    return new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
  }

  function generateTimeSlots(
    startTime: string, endTime: string,
    durationMinutes: number, bufferMinutes: number,
    existingBookings: { time: string; duration_minutes: number }[]
  ): string[] {
    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    const bookedRanges = existingBookings.map(b => {
      const [bh, bm] = b.time.split(":").map(Number);
      const bStart = bh * 60 + bm;
      return { start: bStart, end: bStart + b.duration_minutes };
    });

    const slots: string[] = [];
    let current = startMinutes;

    while (current + durationMinutes <= endMinutes) {
      const slotEnd = current + durationMinutes;
      const overlaps = bookedRanges.some(
        r => current < r.end + bufferMinutes && slotEnd > r.start - bufferMinutes
      );
      if (!overlaps) {
        const h = Math.floor(current / 60);
        const m = current % 60;
        slots.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
      }
      current += durationMinutes + bufferMinutes;
    }
    return slots;
  }

  app.get("/api/bookings/availability", async (req, res) => {
    try {
      const calculatorId = parseInt(req.query.calculator_id as string);
      const date = req.query.date as string;
      if (!calculatorId || !date) return res.status(400).json({ error: "calculator_id and date required" });

      const calc = await storage.getCalculatorById(calculatorId);
      if (!calc) return res.status(404).json({ error: "Calculator not found" });

      const settings = (calc.calculator_settings as any) || {};
      const bookingSettings = settings.booking_settings || {};
      if (!bookingSettings.enabled) return res.json({ slots: [], message: "Booking not enabled" });

      const avail = bookingSettings.availability || {};
      const dayOfWeek = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();
      const dayMap: Record<string, string> = { sun: "sun", mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat" };
      const workingDays: string[] = avail.working_days || ["mon", "tue", "wed", "thu", "fri"];
      if (!workingDays.includes(dayMap[dayOfWeek])) {
        return res.json({ slots: [], message: "Not a working day" });
      }

      const existingBookings = await storage.getConfirmedBookingsForDate(calculatorId, date);
      const slots = generateTimeSlots(
        avail.start_time || "09:00",
        avail.end_time || "17:00",
        bookingSettings.slot_duration_minutes || 60,
        avail.buffer_minutes || 0,
        existingBookings
      );

      res.json({ slots, date, working_day: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const createBookingBody = z.object({
    calculator_id: z.number(),
    customer_name: z.string().min(1),
    customer_email: z.string().email().optional(),
    customer_phone: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    quote_amount: z.number().optional(),
    notes: z.string().optional(),
  });

  app.post("/api/bookings", async (req, res) => {
    try {
      const body = createBookingBody.parse(req.body);
      const calc = await storage.getCalculatorById(body.calculator_id);
      if (!calc) return res.status(404).json({ error: "Calculator not found" });

      const settings = (calc.calculator_settings as any) || {};
      const bookingSettings = settings.booking_settings || {};
      if (!bookingSettings.enabled) return res.status(400).json({ error: "Booking not enabled" });

      const existingBookings = await storage.getConfirmedBookingsForDate(body.calculator_id, body.date);
      const duration = bookingSettings.slot_duration_minutes || 60;
      const buffer = bookingSettings.availability?.buffer_minutes || 0;

      const [bh, bm] = body.time.split(":").map(Number);
      const bookStart = bh * 60 + bm;
      const bookEnd = bookStart + duration;
      const overlap = existingBookings.some(eb => {
        const [eh, em] = eb.time.split(":").map(Number);
        const eStart = eh * 60 + em;
        const eEnd = eStart + eb.duration_minutes;
        return bookStart < eEnd + buffer && bookEnd > eStart - buffer;
      });
      if (overlap) return res.status(409).json({ error: "Time slot no longer available" });

      let depositAmount = 0;
      const requiresDeposit = bookingSettings.require_deposit && bookingSettings.stripe_account_id;
      if (requiresDeposit) {
        if (bookingSettings.deposit_type === "percentage" && body.quote_amount) {
          depositAmount = Math.round(body.quote_amount * (bookingSettings.deposit_value || 0) / 100);
        } else {
          depositAmount = bookingSettings.deposit_value || 0;
        }
      }

      const booking = await storage.createBooking({
        calculator_id: body.calculator_id,
        customer_name: body.customer_name,
        customer_email: body.customer_email || null,
        customer_phone: body.customer_phone || null,
        date: body.date,
        time: body.time,
        duration_minutes: duration,
        status: requiresDeposit ? "pending" : "confirmed",
        deposit_amount: depositAmount,
        deposit_paid: false,
        quote_amount: body.quote_amount || null,
        notes: body.notes || null,
      });

      if (!requiresDeposit) {
        sendBookingConfirmationToCustomer(booking, calc).catch(() => {});
        sendBookingNotificationToBusiness(booking, calc).catch(() => {});
      }

      res.json({
        booking,
        requires_checkout: requiresDeposit,
        deposit_amount: depositAmount,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/bookings/:id/checkout", async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);
      const booking = await storage.getBookingById(bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      const calc = await storage.getCalculatorById(booking.calculator_id);
      if (!calc) return res.status(404).json({ error: "Calculator not found" });

      const settings = (calc.calculator_settings as any) || {};
      const bookingSettings = settings.booking_settings || {};
      const stripeAccountId = bookingSettings.stripe_account_id;

      if (!stripeAccountId) return res.status(400).json({ error: "Stripe not connected" });

      const stripe = getStripeClient();
      if (!stripe) return res.status(500).json({ error: "Stripe not configured on platform" });

      const depositCents = (booking.deposit_amount || 0) * 100;
      if (depositCents <= 0) return res.status(400).json({ error: "No deposit required" });

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: `Booking Deposit — ${calc.business_name}`,
              description: `Appointment on ${booking.date} at ${booking.time}`,
            },
            unit_amount: depositCents,
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/api/bookings/confirm?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/calculator/${calc.slug}?booking_cancelled=1`,
        payment_intent_data: {
          application_fee_amount: 0,
        },
      }, {
        stripeAccount: stripeAccountId,
      });

      await storage.updateBooking(bookingId, { stripe_checkout_session_id: session.id } as any);

      res.json({ checkout_url: session.url });
    } catch (err: any) {
      console.error("[Stripe Checkout]", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/bookings/confirm", async (req, res) => {
    try {
      const sessionId = req.query.session_id as string;
      if (!sessionId) return res.status(400).send("Missing session_id");

      const stripe = getStripeClient();
      if (!stripe) return res.status(500).send("Stripe not configured");

      const { db } = await import("./db");
      const { bookings: bookingsTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const [booking] = await db.select().from(bookingsTable)
        .where(eq(bookingsTable.stripe_checkout_session_id, sessionId)).limit(1);
      if (!booking) return res.status(404).send("Booking not found");

      const calc = await storage.getCalculatorById(booking.calculator_id);

      const settings = (calc?.calculator_settings as any) || {};
      const bookingSettings = settings.booking_settings || {};
      const stripeAccountId = bookingSettings.stripe_account_id;

      if (!stripeAccountId) {
        return res.status(400).send("Stripe not connected for this booking");
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        stripeAccount: stripeAccountId,
      });

      if (session.payment_status !== "paid") {
        return res.status(400).send("Payment not completed");
      }

      const expectedCents = (booking.deposit_amount || 0) * 100;
      if (session.amount_total && expectedCents > 0 && session.amount_total !== expectedCents) {
        return res.status(400).send("Payment amount mismatch");
      }

      await storage.updateBooking(booking.id, {
        status: "confirmed",
        deposit_paid: true,
      } as any);

      if (calc) {
        const updatedBooking = { ...booking, status: "confirmed", deposit_paid: true };
        sendBookingConfirmationToCustomer(updatedBooking, calc).catch(() => {});
        sendBookingNotificationToBusiness(updatedBooking, calc).catch(() => {});
      }

      const confirmParams = new URLSearchParams({
        booking_confirmed: "1",
        booking_date: booking.date,
        booking_time: booking.time,
        booking_name: booking.customer_name,
        ...(booking.quote_amount ? { booking_quote: String(booking.quote_amount) } : {}),
        ...(booking.deposit_amount ? { booking_deposit: String(booking.deposit_amount) } : {}),
      });
      res.redirect(`/calculator/${calc?.slug || ""}?${confirmParams.toString()}`);
    } catch (err: any) {
      console.error("[Booking Confirm]", err);
      res.status(500).send("Error confirming booking");
    }
  });

  app.get("/api/dashboard/bookings", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) return res.status(401).json({ error: "Token required" });
      const calc = await storage.getCalculatorByToken(token);
      if (!calc) return res.status(404).json({ error: "Calculator not found" });
      if (calc.token_expires_at && new Date(calc.token_expires_at) < new Date()) {
        return res.status(401).json({ error: "Token expired" });
      }

      const bookingsList = await storage.getBookingsByCalculatorId(calc.id);
      res.json({ bookings: bookingsList });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/dashboard/bookings/:id/status", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) return res.status(401).json({ error: "Token required" });
      const calc = await storage.getCalculatorByToken(token);
      if (!calc) return res.status(404).json({ error: "Calculator not found" });
      if (calc.token_expires_at && new Date(calc.token_expires_at) < new Date()) {
        return res.status(401).json({ error: "Token expired" });
      }

      const bookingId = parseInt(req.params.id);
      const { status } = req.body;
      if (!["pending", "confirmed", "cancelled"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const booking = await storage.getBookingById(bookingId);
      if (!booking || booking.calculator_id !== calc.id) {
        return res.status(404).json({ error: "Booking not found" });
      }

      const updated = await storage.updateBookingStatus(bookingId, status);

      if (status === "confirmed" && booking.status !== "confirmed") {
        sendBookingConfirmationToCustomer(updated!, calc).catch(() => {});
        sendBookingNotificationToBusiness(updated!, calc).catch(() => {});
      }

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/stripe/connect", async (req, res) => {
    try {
      const token = req.body.token;
      if (!token) return res.status(401).json({ error: "Token required" });
      const calc = await storage.getCalculatorByToken(token);
      if (!calc) return res.status(404).json({ error: "Calculator not found" });

      const stripe = getStripeClient();
      if (!stripe) return res.status(500).json({ error: "Stripe not configured. Set STRIPE_SECRET_KEY." });

      const account = await stripe.accounts.create({
        type: "express",
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      });

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${baseUrl}/api/stripe/connect/refresh?token=${token}&account_id=${account.id}`,
        return_url: `${baseUrl}/api/stripe/connect/callback?token=${token}&account_id=${account.id}`,
        type: "account_onboarding",
      });

      res.json({ url: accountLink.url, account_id: account.id });
    } catch (err: any) {
      console.error("[Stripe Connect]", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/stripe/connect/callback", async (req, res) => {
    try {
      const token = req.query.token as string;
      const accountId = req.query.account_id as string;
      if (!token || !accountId) return res.status(400).send("Missing token or account_id");

      const calc = await storage.getCalculatorByToken(token);
      if (!calc) return res.status(404).send("Calculator not found");

      const settings = (calc.calculator_settings as any) || {};
      const bookingSettings = settings.booking_settings || {};
      bookingSettings.stripe_account_id = accountId;
      settings.booking_settings = bookingSettings;
      await storage.updateCalculator(calc.id, { calculator_settings: settings });

      res.redirect(`/?stripe_connected=1`);
    } catch (err: any) {
      console.error("[Stripe Callback]", err);
      res.status(500).send("Error connecting Stripe");
    }
  });

  app.get("/api/stripe/connect/refresh", async (req, res) => {
    try {
      const token = req.query.token as string;
      const accountId = req.query.account_id as string;
      if (!token || !accountId) return res.status(400).send("Missing params");

      const stripe = getStripeClient();
      if (!stripe) return res.status(500).send("Stripe not configured");

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${baseUrl}/api/stripe/connect/refresh?token=${token}&account_id=${accountId}`,
        return_url: `${baseUrl}/api/stripe/connect/callback?token=${token}&account_id=${accountId}`,
        type: "account_onboarding",
      });

      res.redirect(accountLink.url);
    } catch (err: any) {
      res.status(500).send("Error refreshing Stripe link");
    }
  });

  app.get("/api/stripe/connect/status", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) return res.status(401).json({ error: "Token required" });
      const calc = await storage.getCalculatorByToken(token);
      if (!calc) return res.status(404).json({ error: "Calculator not found" });

      const settings = (calc.calculator_settings as any) || {};
      const bookingSettings = settings.booking_settings || {};
      const connected = !!bookingSettings.stripe_account_id;

      res.json({ connected, account_id: bookingSettings.stripe_account_id || null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============ AI SUPPORT TICKET ============

  app.post("/api/ai/create-ticket", async (req, res) => {
    try {
      const body = z.object({
        token: z.string().min(1),
        description: z.string().min(1),
        transcript: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
      }).safeParse(req.body);

      if (!body.success) {
        return res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      }

      const { token, description, transcript } = body.data;
      const calculator = await storage.getCalculatorByToken(token);
      if (!calculator) {
        return res.status(404).json({ error: "Calculator not found" });
      }

      const ticket = await storage.createSupportTicket({
        description,
        calculator_id: calculator.id,
        status: "open",
        transcript_json: (transcript || []) as any,
        admin_notified: false,
      });

      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        try {
          const nodemailer = await import("nodemailer");
          const smtpHost = process.env.SMTP_HOST;
          const smtpUser = process.env.SMTP_USER;
          const smtpPass = process.env.SMTP_PASS;
          if (smtpHost && smtpUser && smtpPass) {
            const port = parseInt(process.env.SMTP_PORT || "587", 10);
            const transporter = nodemailer.default.createTransport({
              host: smtpHost, port, secure: port === 465, auth: { user: smtpUser, pass: smtpPass },
            });
            const from = process.env.SMTP_FROM || smtpUser;
            await transporter.sendMail({
              from,
              to: adminEmail,
              subject: `[Support Ticket #${ticket.id}] — ${calculator.business_name}`,
              html: `<p><strong>Ticket #${ticket.id}</strong><br/>Calculator: ${calculator.business_name} (${calculator.trade_type})<br/>Description: ${description}</p>`,
            });
            await storage.updateSupportTicket(ticket.id, { admin_notified: true });
          }
        } catch (emailErr) {
          console.warn("Failed to email admin:", emailErr);
        }
      }

      res.json({ ticket_id: ticket.id, success: true });
    } catch (error: any) {
      console.error("Create ticket error:", error);
      res.status(500).json({ error: "Failed to create support ticket" });
    }
  });

  // ============ AI CHAT ENDPOINTS ============

  const chatMessageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  });

  app.post("/api/ai/demo-chat", async (req, res) => {
    try {
      const body = z.object({
        messages: z.array(chatMessageSchema).min(1).max(50),
        trade_category: z.string().optional(),
      }).safeParse(req.body);

      if (!body.success) {
        return res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      }

      const { messages, trade_category } = body.data;
      const sessionId = randomBytes(12).toString("hex");
      const systemPrompt = buildSystemPrompt("demo_ai_employee", { tradeCategory: trade_category });

      const { reply, toolResults } = await runChatCompletion(
        openai,
        "demo_ai_employee",
        messages as any,
        systemPrompt,
        { tradeCategory: trade_category, sessionId }
      );

      try {
        await storage.createAiConversation({
          agent_type: "demo_ai_employee",
          account_id: null,
          calculator_id: null,
          session_id: sessionId,
          messages_json: [...messages, { role: "assistant", content: reply }] as any,
        });
      } catch (err) {
        console.warn("Failed to store demo conversation:", err);
      }

      res.json({ reply, tool_results: toolResults });
    } catch (error: any) {
      console.error("Demo chat error:", error);
      res.status(500).json({ error: "Failed to process chat" });
    }
  });

  app.post("/api/ai/support-chat", async (req, res) => {
    try {
      const body = z.object({
        messages: z.array(chatMessageSchema).min(1).max(50),
        token: z.string().min(1),
        session_id: z.string().optional(),
      }).safeParse(req.body);

      if (!body.success) {
        return res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      }

      const { messages, token, session_id } = body.data;
      const calculator = await storage.getCalculatorByToken(token);
      if (!calculator) {
        return res.status(404).json({ error: "Calculator not found" });
      }

      const isExpired = new Date() > new Date(calculator.token_expires_at);
      if (isExpired) {
        return res.status(403).json({ error: "Edit access expired" });
      }

      const settings = (calculator.calculator_settings as any) || {};
      const publish = settings.publish || {};
      const deployment = await storage.getDeploymentStatus(calculator.id);
      const calculatorStatus = `${publish.status || "draft"} / deployment: ${deployment?.status || "unknown"}`;

      const systemPrompt = buildSystemPrompt("platform_support_ai", {
        businessName: calculator.business_name,
        tradeType: calculator.trade_type,
        calculatorStatus,
      });

      const { reply, toolResults } = await runChatCompletion(
        openai,
        "platform_support_ai",
        messages as any,
        systemPrompt,
        { calculator, sessionId: session_id }
      );

      const sessionIdFinal = session_id || randomBytes(12).toString("hex");
      const ticketCreated = toolResults?.some(r => r.tool === "create_support_ticket" && r.result?.ticket_id);

      try {
        const existing = session_id ? await storage.getAiConversationBySession(session_id) : undefined;
        const allMessages = [...messages, { role: "assistant", content: reply }];
        if (existing) {
          await storage.updateAiConversation(existing.id, { messages_json: allMessages as any });
        } else {
          await storage.createAiConversation({
            agent_type: "platform_support_ai",
            account_id: calculator.id,
            calculator_id: calculator.id,
            session_id: sessionIdFinal,
            messages_json: allMessages as any,
          });
        }
      } catch (err) {
        console.warn("Failed to store support conversation:", err);
      }

      res.json({ reply, ticket_created: !!ticketCreated, session_id: sessionIdFinal, tool_results: toolResults });
    } catch (error: any) {
      console.error("Support chat error:", error);
      res.status(500).json({ error: "Failed to process chat" });
    }
  });

  app.post("/api/ai/client-chat", async (req, res) => {
    try {
      const body = z.object({
        messages: z.array(chatMessageSchema).min(1).max(50),
        calculator_id: z.number().int().positive(),
        session_id: z.string().min(1),
      }).safeParse(req.body);

      if (!body.success) {
        return res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      }

      const { messages, calculator_id, session_id } = body.data;
      const calculator = await storage.getCalculatorById(calculator_id);
      if (!calculator) {
        return res.status(404).json({ error: "Calculator not found" });
      }

      const settings = (calculator.calculator_settings as any) || {};
      const aiEmployee = settings.ai_employee || {};

      if (!aiEmployee.enabled) {
        return res.status(403).json({ error: "AI Employee is not enabled for this calculator" });
      }

      const subscriptionStatus = aiEmployee.subscription_status || "inactive";
      if (subscriptionStatus === "trial" && aiEmployee.trial_started_at) {
        const trialDays = (Date.now() - aiEmployee.trial_started_at) / (1000 * 60 * 60 * 24);
        if (trialDays > 14) {
          return res.status(403).json({
            error: "trial_expired",
            message: "AI Assistant paused — upgrade to continue",
          });
        }
      } else if (subscriptionStatus === "inactive") {
        return res.status(403).json({ error: "AI Employee subscription is not active" });
      }

      const trainingProfile = aiEmployee.training_profile || {};
      const systemPrompt = buildSystemPrompt("client_ai_employee", {
        businessName: calculator.business_name,
        tradeType: calculator.trade_type,
        trainingProfile,
        pricingConfig: calculator.pricing_config as Record<string, any>,
      });

      const { reply, toolResults } = await runChatCompletion(
        openai,
        "client_ai_employee",
        messages as any,
        systemPrompt,
        { calculatorId: calculator_id, calculator, sessionId: session_id }
      );

      try {
        const existing = await storage.getAiConversationBySession(session_id);
        const allMessages = [...messages, { role: "assistant", content: reply }];
        if (existing) {
          await storage.updateAiConversation(existing.id, { messages_json: allMessages as any });
        } else {
          await storage.createAiConversation({
            agent_type: "client_ai_employee",
            account_id: calculator.id,
            calculator_id: calculator.id,
            session_id,
            messages_json: allMessages as any,
          });
        }
      } catch (err) {
        console.warn("Failed to store client conversation:", err);
      }

      res.json({ reply, tool_results: toolResults, session_id });
    } catch (error: any) {
      console.error("Client chat error:", error);
      res.status(500).json({ error: "Failed to process chat" });
    }
  });

  app.post("/api/twilio/inbound", async (req, res) => {
    const twimlError = (msg: string) => {
      res.set("Content-Type", "text/xml");
      res.send(`<Response><Message>${msg}</Message></Response>`);
    };

    try {
      const valid = verifyTwilioSignature(req);
      if (!valid) {
        res.set("Content-Type", "text/xml");
        return res.status(403).send("<Response></Response>");
      }

      const from: string = req.body?.From || "";
      const body: string = req.body?.Body || "";
      const messageSid: string = req.body?.MessageSid || "";

      if (!from || !body) {
        return twimlError("Invalid request.");
      }

      const isWhatsapp = from.startsWith("whatsapp:");
      const channel = isWhatsapp ? "whatsapp" : "sms";
      const cleanFrom = isWhatsapp ? from.replace("whatsapp:", "") : from;

      const lead = await matchLeadByPhone(cleanFrom);
      if (!lead) {
        return twimlError("We couldn't find your record. Please contact us directly.");
      }

      await storeSmsMessage({
        lead_id: lead.id,
        calculator_id: lead.calculator_id,
        direction: "inbound",
        channel,
        body,
        from_number: cleanFrom,
        to_number: null,
        twilio_sid: messageSid,
        is_ai: false,
      });

      if (lead.ai_paused) {
        res.set("Content-Type", "text/xml");
        res.send("<Response></Response>");
        return;
      }

      const rateCheck = await checkRateLimit(lead.id, lead.calculator_id, channel);
      if (!rateCheck.allowed) {
        console.warn(`[Twilio] Rate limit hit for lead ${lead.id}: ${rateCheck.reason}`);
        res.set("Content-Type", "text/xml");
        res.send("<Response></Response>");
        return;
      }

      const calculator = await storage.getCalculatorById(lead.calculator_id);
      const settings = (calculator?.calculator_settings as any) || {};
      const aiEmployee = settings.ai_employee || {};

      if (!aiEmployee.enabled || !["trial", "active"].includes(aiEmployee.subscription_status)) {
        return twimlError(`Thanks for reaching out! We'll get back to you shortly. — ${calculator?.business_name || "Your service provider"}`);
      }

      if (aiEmployee.subscription_status === "trial" && aiEmployee.trial_started_at) {
        const trialDays = (Date.now() - aiEmployee.trial_started_at) / (1000 * 60 * 60 * 24);
        if (trialDays > 14) {
          return twimlError(`Thanks for reaching out! We'll get back to you shortly. — ${calculator?.business_name || "Your service provider"}`);
        }
      }

      const trainingProfile = aiEmployee.training_profile || {};
      const systemPrompt = buildSystemPrompt("client_ai_employee", {
        businessName: calculator?.business_name,
        tradeType: calculator?.trade_type,
        trainingProfile,
        pricingConfig: calculator?.pricing_config as Record<string, any>,
      }) + "\n\nIMPORTANT: This is an SMS/WhatsApp conversation. Keep ALL replies under 160 characters. Be very concise.";

      const chatMessages = [{ role: "user" as const, content: body }];
      const { reply } = await runChatCompletion(
        openai,
        "client_ai_employee",
        chatMessages,
        systemPrompt,
        { calculatorId: lead.calculator_id, calculator, sessionId: `sms-${lead.id}` }
      );

      const shortReply = truncateSms(reply);

      await storeSmsMessage({
        lead_id: lead.id,
        calculator_id: lead.calculator_id,
        direction: "outbound",
        channel,
        body: shortReply,
        from_number: isWhatsapp ? process.env.TWILIO_WHATSAPP_NUMBER || null : process.env.TWILIO_FROM_NUMBER || null,
        to_number: cleanFrom,
        twilio_sid: null,
        is_ai: true,
      });

      res.set("Content-Type", "text/xml");
      res.send(`<Response><Message>${shortReply}</Message></Response>`);
    } catch (error: any) {
      console.error("[Twilio] Inbound webhook error:", error);
      twimlError("Thanks for reaching out! We'll get back to you soon.");
    }
  });

  app.get("/api/dashboard/messages", async (req, res) => {
    try {
      const { token } = req.query as { token: string };
      const calculator = await storage.getCalculatorByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found" });

      const threads = await storage.getSmsThreads(calculator.id);
      res.json({ threads });
    } catch (error: any) {
      console.error("[Messages] Error:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.get("/api/dashboard/sms-status", async (req, res) => {
    try {
      const { token } = req.query as { token: string };
      const calculator = await storage.getCalculatorByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found" });

      res.json({
        configured: isTwilioConfigured(),
        from_number: process.env.TWILIO_FROM_NUMBER || null,
        whatsapp_number: process.env.TWILIO_WHATSAPP_NUMBER || null,
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch SMS status" });
    }
  });

  app.patch("/api/dashboard/leads/:leadId/ai-pause", async (req, res) => {
    try {
      const { token } = req.query as { token: string };
      const leadId = parseInt(req.params.leadId);
      const { paused } = z.object({ paused: z.boolean() }).parse(req.body);

      const calculator = await storage.getCalculatorByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found" });

      await storage.updateLeadAiPaused(leadId, calculator.id, paused);
      res.json({ success: true, ai_paused: paused });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update AI pause status" });
    }
  });

  return httpServer;
}
