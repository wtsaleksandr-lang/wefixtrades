import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { randomBytes } from "crypto";
import { z } from "zod";
import OpenAI from "openai";
import { PRICING_TYPES, validatePricingConfig, FAMILY_LABELS, FAMILY_DESCRIPTIONS } from "@shared/pricingConfig";
import { pricingIntakeSchema, sampleQuoteSchema, type PricingDraftJob } from "@shared/schema";
import { generatePricingConfigDraft } from "./aiPricingAgent";
import { slugify, isValidSlug, buildSubdomain, HOSTING_DOMAIN } from "@shared/slugUtils";

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
        calculator_settings: parsed.data.calculator_settings || null,
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
        storage.trackEvent({ calculator_id: parsed.data.calculator_id, event_type: 'view', metadata: null }).catch(() => {});
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
      });

      storage.trackEvent({
        calculator_id: parsed.data.calculator_id,
        event_type: 'lead',
        metadata: { quote_amount: parsed.data.quote_amount || null },
      }).catch(() => {});

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
        },
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
      const [eventCounts, weeklyTrend, avgQuote, totalLeads] = await Promise.all([
        storage.getEventCounts(calculator.id, thirtyDaysAgo),
        storage.getWeeklyTrend(calculator.id),
        storage.getAvgQuoteAmount(calculator.id),
        storage.getLeadsByCalculatorId(calculator.id).then(l => l.length),
      ]);

      const totalViews = calculator.total_views || 0;
      const conversionRate = totalViews > 0 ? Math.round((totalLeads / totalViews) * 100) : 0;

      res.json({
        views: totalViews,
        leads: totalLeads,
        conversion_rate: conversionRate,
        avg_quote: avgQuote,
        weekly_trend: weeklyTrend,
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
        event_type: z.enum(['view', 'lead', 'quote_generated']),
        metadata: z.record(z.any()).optional(),
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

  return httpServer;
}
