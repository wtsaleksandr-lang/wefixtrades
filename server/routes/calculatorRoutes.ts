import type { Express } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import Stripe from "stripe";
import { storage } from "../storage";
import { validatePricingConfig } from "@shared/pricingConfig";
import { calculatorSettingsSchema } from "@shared/schema";
import { slugify, isValidSlug, buildSubdomain, HOSTING_DOMAIN } from "@shared/slugUtils";

function generateToken(): string {
  return randomBytes(24).toString("hex");
}

/**
 * Deep merge for calculator_settings JSONB updates.
 * Merges nested objects instead of replacing them, so a PATCH with
 * { appearance: { accent_color: '#ff0000' } } preserves other appearance fields.
 * Arrays are replaced wholesale (not concatenated).
 */
function deepMergeSettings(base: Record<string, any>, patch: Record<string, any>): Record<string, any> {
  const result = { ...base };
  for (const key of Object.keys(patch)) {
    const baseVal = base[key];
    const patchVal = patch[key];
    if (
      patchVal !== null &&
      typeof patchVal === 'object' &&
      !Array.isArray(patchVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMergeSettings(baseVal, patchVal);
    } else {
      result[key] = patchVal;
    }
  }
  return result;
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

const duplicateBody = z.object({ token: z.string().min(1, "Token required") });

const trackViewBody = z.object({ calculator_id: z.number() });

export function registerCalculatorRoutes(app: Express): void {
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

      let validatedSettings: any = parsed.data.calculator_settings || null;
      if (parsed.data.calculator_settings) {
        try {
          validatedSettings = calculatorSettingsSchema.parse(parsed.data.calculator_settings);
        } catch (err: any) {
          return res.status(400).json({ error: "Invalid calculator_settings", details: err?.message });
        }
      }

      // Ensure publish.status is 'published' for new live calculators
      if (validatedSettings) {
        const publish = (validatedSettings as any).publish || {};
        (validatedSettings as any).publish = {
          ...publish,
          status: 'published',
          published_at: Date.now(),
          slug,
        };
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

  const lookupQuery = z.object({
    slug: z.string().optional(),
    token: z.string().optional(),
    preview: z.string().optional(),
  }).refine(d => d.slug || d.token, { message: "slug or token required" });

  app.get("/api/calculators/lookup", async (req, res) => {
    try {
      const parsed = lookupQuery.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: "slug or token required" });

      const { slug, token, preview } = parsed.data;

      let calculator;
      let isTokenAccess = false;

      if (token) {
        calculator = await storage.getCalculatorByToken(token);
        isTokenAccess = true;
      } else if (slug) {
        calculator = await storage.getCalculatorBySlug(slug);
      }

      if (!calculator) {
        return res.status(404).json({ error: "Calculator not found" });
      }

      const isExpired = new Date() > new Date(calculator.token_expires_at);

      // Token-based access (edit page) — return full config with expiry info
      if (isTokenAccess) {
        if (isExpired) {
          return res.json({
            calculator: {
              id: calculator.id,
              slug: calculator.slug,
              business_name: calculator.business_name,
              is_token_expired: true,
              is_duplicated: calculator.is_duplicated,
              token_expires_at: calculator.token_expires_at,
            },
          });
        }
        return res.json({
          calculator: { ...calculator, is_token_expired: false, is_preview: false },
        });
      }

      // Preview access via slug + preview token
      if (preview) {
        const previewCalc = await storage.getCalculatorByToken(preview);
        if (previewCalc && previewCalc.id === calculator.id) {
          const previewExpired = new Date() > new Date(previewCalc.token_expires_at);
          if (!previewExpired) {
            return res.json({
              calculator: { ...calculator, is_token_expired: false, is_preview: true },
            });
          }
        }
        // Invalid or expired preview token — fall through to public check
      }

      // Public slug access — check if calculator is live
      const deployment = await storage.getDeploymentStatus(calculator.id);
      if (deployment && deployment.status !== 'live') {
        return res.status(404).json({ error: "This calculator is not currently available." });
      }

      res.json({
        calculator: { ...calculator, is_token_expired: isExpired, is_preview: false },
      });
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
        // Deep merge: preserve nested objects that aren't being replaced
        const merged = deepMergeSettings(currentSettings, updates.calculator_settings as Record<string, any>);
        try {
          updates.calculator_settings = calculatorSettingsSchema.parse(merged);
        } catch (err: any) {
          return res.status(400).json({ error: "Invalid calculator_settings", details: err?.message });
        }
      }

      let updated = await storage.updateCalculator(calculator.id, updates);

      // Post-save: handle publish state transitions
      let autoRepublished = false;
      const savedSettings = (updated?.calculator_settings as any) || {};
      const publish = savedSettings.publish || {};

      if (publish.status === 'published') {
        const deployment = await storage.getDeploymentStatus(calculator.id);
        if (pricingChanged && deployment?.auto_republish) {
          // Auto-republish: mark as freshly published, clear modified flag
          updated = await storage.updateCalculator(calculator.id, {
            calculator_settings: {
              ...savedSettings,
              publish: { ...publish, published_at: Date.now(), last_modified: null },
            },
          });
          await storage.upsertDeploymentStatus({
            calculator_id: calculator.id,
            status: 'live',
            last_published_at: new Date(),
          });
          autoRepublished = true;
        } else {
          // Not auto-republished: mark as edited since last publish
          updated = await storage.updateCalculator(calculator.id, {
            calculator_settings: {
              ...savedSettings,
              publish: { ...publish, last_modified: Date.now() },
            },
          });
        }
      }

      res.json({ success: true, calculator: updated, auto_republished: autoRepublished });
    } catch (error: any) {
      console.error("Update calculator error:", error);
      res.status(500).json({ error: "Failed to update calculator" });
    }
  });

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

      const newSlug = await generateUniqueSlug(calculator.business_name);
      const newToken = generateToken();
      const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const newCalc = await storage.duplicateCalculator(calculator.id, newSlug, newToken, newExpiry);
      if (!newCalc) return res.status(500).json({ error: "Failed to duplicate" });

      // Create deployment status for the new calculator
      await storage.upsertDeploymentStatus({
        calculator_id: newCalc.id,
        status: 'live',
        last_published_at: new Date(),
        auto_republish: true,
      });

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

  // Generic client-side event tracking endpoint
  app.post("/api/track", async (req, res) => {
    try {
      const { event, data } = req.body || {};
      if (!event || typeof event !== 'string') return res.json({ ok: true });
      // Store activation events using a calculator_id=0 sentinel for non-calculator events
      const calcId = typeof data?.calculator_id === 'number' ? data.calculator_id : 0;
      storage.trackEvent({
        calculator_id: calcId,
        event_type: event,
        metadata: { ...data, ts: Date.now() },
      }).catch(() => {});
      res.json({ ok: true });
    } catch {
      res.json({ ok: true });
    }
  });

  // QuoteQuick plan checkout — creates Stripe session linked to a calculator
  const checkoutBody = z.object({
    calculator_id: z.number().int().positive(),
    token: z.string().min(1),
    plan: z.enum(['solo', 'business']),
    billing: z.enum(['monthly', 'annual']).default('monthly'),
  });

  app.post("/api/calculators/checkout", async (req, res) => {
    try {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) return res.status(503).json({ error: "Payments not configured" });
      const stripe = new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });

      const parsed = checkoutBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

      const calculator = await storage.getCalculatorByToken(parsed.data.token);
      if (!calculator || calculator.id !== parsed.data.calculator_id) {
        return res.status(404).json({ error: "Calculator not found" });
      }

      // Map plan + billing to Stripe price IDs (configured in env)
      const priceMap: Record<string, string | undefined> = {
        'solo_monthly': process.env.STRIPE_PRICE_QQ_SOLO_MONTHLY,
        'solo_annual': process.env.STRIPE_PRICE_QQ_SOLO_ANNUAL,
        'business_monthly': process.env.STRIPE_PRICE_QQ_BUSINESS_MONTHLY,
        'business_annual': process.env.STRIPE_PRICE_QQ_BUSINESS_ANNUAL,
      };

      const priceKey = `${parsed.data.plan}_${parsed.data.billing}`;
      const priceId = priceMap[priceKey];
      if (!priceId) {
        return res.status(400).json({ error: `Price not configured for ${priceKey}. Contact support.` });
      }

      const planTier = parsed.data.plan === 'business' ? 'business' : 'starter';
      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: calculator.owner_email || undefined,
        metadata: {
          source: 'quotequick_checkout',
          calculator_id: String(calculator.id),
          plan_tier: planTier,
          billing: parsed.data.billing,
        },
        success_url: `${baseUrl}/dashboard?token=${parsed.data.token}&upgraded=1`,
        cancel_url: `${baseUrl}/pricing/quotequick?cancelled=1`,
        allow_promotion_codes: true,
      });

      // Track plan selection
      storage.trackEvent({
        calculator_id: calculator.id,
        event_type: 'plan_selected',
        metadata: { plan: parsed.data.plan, billing: parsed.data.billing },
      }).catch(() => {});

      res.json({ checkout_url: session.url });
    } catch (err: any) {
      console.error("[calculator-checkout] Error:", err.message);
      res.status(500).json({ error: "Failed to create checkout" });
    }
  });
}
