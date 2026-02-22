import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { randomBytes } from "crypto";
import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function generateSlug(): string {
  return randomBytes(6).toString("hex");
}

function generateToken(): string {
  return randomBytes(24).toString("hex");
}

async function generateUniqueSlug(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = generateSlug();
    const existing = await storage.getCalculatorBySlug(slug);
    if (!existing) return slug;
  }
  return generateSlug() + generateSlug();
}

const createCalculatorBody = z.object({
  business_name: z.string().min(1, "Business name is required"),
  trade_type: z.string().min(1, "Trade type is required"),
  tagline: z.string().nullable().optional(),
  owner_email: z.string().email().nullable().optional(),
  pricing_config: z.record(z.any()),
  primary_color: z.string().optional(),
  theme_overrides: z.record(z.any()).nullable().optional(),
});

const updateCalculatorBody = z.object({
  token: z.string().min(1),
  updates: z.object({
    business_name: z.string().optional(),
    tagline: z.string().optional(),
    logo_url: z.string().optional(),
    owner_email: z.string().optional(),
    owner_phone: z.string().optional(),
    website_url: z.string().optional(),
    primary_color: z.string().optional(),
    cta_button_text: z.string().optional(),
    lead_thank_you_message: z.string().optional(),
    theme_overrides: z.record(z.any()).optional(),
  }),
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

      const prompt = `You are a pricing expert for ${trade_type} businesses. Based on the following business description and services, generate a JSON pricing configuration for a quote calculator.

Business: ${business_description || trade_type}
Services: ${services || "General services"}

Return a JSON object with this structure:
{
  "questions": [
    {
      "id": "q1",
      "label": "What type of service do you need?",
      "type": "select",
      "options": [
        { "label": "Option A", "value": "option_a", "price_impact": 100 },
        { "label": "Option B", "value": "option_b", "price_impact": 200 }
      ]
    }
  ],
  "base_price": 150,
  "currency": "USD"
}

Generate 3-5 relevant questions for the ${trade_type} trade. Each question should have 2-5 options with realistic price_impact values.

Return ONLY the JSON, no explanation.`;

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

      if (!pricing.questions || !Array.isArray(pricing.questions)) {
        return res.status(500).json({ error: "AI returned invalid pricing structure" });
      }

      res.json({ success: true, pricing_config: pricing });
    } catch (error: any) {
      console.error("AI pricing generation error:", error);
      res.status(500).json({ error: "Failed to generate pricing configuration" });
    }
  });

  app.post("/api/calculators", async (req, res) => {
    try {
      const parsed = createCalculatorBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const slug = await generateUniqueSlug();
      const edit_token = generateToken();
      const token_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const calculator = await storage.createCalculator({
        slug,
        business_name: parsed.data.business_name,
        trade_type: parsed.data.trade_type,
        tagline: parsed.data.tagline || null,
        owner_email: parsed.data.owner_email || null,
        pricing_config: parsed.data.pricing_config,
        primary_color: parsed.data.primary_color || "#6366f1",
        theme_overrides: parsed.data.theme_overrides || null,
        edit_token,
        token_expires_at,
      });

      res.json({
        success: true,
        calculator: { ...calculator, is_token_expired: false },
        slug: calculator.slug,
        edit_token: calculator.edit_token,
        edit_url: `/EditCalculator?token=${calculator.edit_token}`,
        calculator_url: `/Calculator?slug=${calculator.slug}`,
        leads_url: `/Leads?token=${calculator.edit_token}`,
      });
    } catch (error: any) {
      console.error("Create calculator error:", error);
      res.status(500).json({ error: "Failed to create calculator" });
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

      const updated = await storage.updateCalculator(calculator.id, parsed.data.updates);
      res.json({ success: true, calculator: updated });
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

  return httpServer;
}
