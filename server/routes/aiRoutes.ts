import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import multer from "multer";
import OpenAI from "openai";
import { storage } from "../storage";
import { PRICING_TYPES, validatePricingConfig, FAMILY_LABELS, FAMILY_DESCRIPTIONS } from "@shared/pricingConfig";
import { pricingIntakeSchema, sampleQuoteSchema, type PricingDraftJob } from "@shared/schema";
import { generatePricingConfigDraft } from "../aiPricingAgent";
import { validateFormula } from "@shared/formulaEngine";
import { buildSystemPrompt, runChatCompletion } from "../aiChatEngine";
import { createLogger } from "../lib/logger";
import { aiChatRateLimiter } from "../services/rateLimiter";
// W-BB-1 — customer-widget multi-step agent loop wiring.
// Importing customerWidgetTools registers the 6 customer-widget actions
// into the shared copilotActionRegistry at module load.
import {
  CUSTOMER_WIDGET_TOOLS,
  CUSTOMER_WIDGET_ACTION_NAMES,
  buildCustomerWidgetSystemPrompt,
} from "../services/customerWidgetTools";
import { runAgentLoop, executorFromCustomerWidgetAction } from "../services/aiAgentLoop";
import { AI_SURFACES } from "../services/aiSurfaces";

const log = createLogger("AIRoutes");

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openai;
}

const generatePricingBody = z.object({
  trade_type: z.string().min(1),
  business_description: z.string().optional(),
  services: z.string().optional(),
});

const generateAdvancedBody = z.object({
  description: z.string().min(3).max(2000),
  trade_type: z.string().max(120).optional(),
});

/**
 * Coerce a raw AI response into a safe `calculator_settings.advanced` config:
 * stable ids, valid field types, clamped counts. Never throws.
 */
function sanitizeAdvancedAi(raw: any): { fields: any[]; calculations: any[]; result_calc: string } {
  const VALID_TYPES = ['number', 'slider', 'select', 'radio', 'multi_select', 'toggle', 'text'];
  const str = (v: any, max: number, fallback: string) =>
    (typeof v === 'string' && v.trim() ? v.trim() : fallback).slice(0, max);
  const numOrU = (v: any) => (v == null || v === '' || isNaN(Number(v)) ? undefined : Number(v));

  const fields = (Array.isArray(raw?.fields) ? raw.fields : []).slice(0, 20).map((f: any, i: number) => {
    const name = str(f?.name ?? f?.label, 60, `Field ${i + 1}`);
    const type = VALID_TYPES.includes(f?.type) ? f.type : 'number';
    const options = (Array.isArray(f?.options) ? f.options : []).slice(0, 12).map((o: any, j: number) => ({
      id: `opt_${i}_${j}`,
      label: str(o?.label, 60, `Option ${j + 1}`),
      value: Number(o?.value) || 0,
    }));
    return {
      id: `fld_${i}`, name, label: name, type,
      required: !!f?.required,
      default_value: numOrU(f?.default_value),
      min: numOrU(f?.min), max: numOrU(f?.max), step: numOrU(f?.step),
      unit: f?.unit ? str(f.unit, 16, '') : undefined,
      on_value: numOrU(f?.on_value) ?? 1,
      options,
    };
  });

  const calculations = (Array.isArray(raw?.calculations) ? raw.calculations : []).slice(0, 10).map((c: any, i: number) => ({
    id: `calc_${i}`,
    name: str(c?.name, 60, `Calculation ${i + 1}`),
    formula: typeof c?.formula === 'string' ? c.formula.slice(0, 600) : '',
    format: ['number', 'currency', 'percent'].includes(c?.format) ? c.format : 'currency',
  }));

  const result_calc = (typeof raw?.result_calc === 'string' && calculations.some((c: any) => c.name === raw.result_calc))
    ? raw.result_calc
    : (calculations.length ? calculations[calculations.length - 1].name : '');

  return { fields, calculations, result_calc };
}

/**
 * In-memory upload handler for the quote-to-calculator route. A quote photo
 * arrives as multipart/form-data so it bypasses the global JSON body parser.
 */
const QUOTE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const quoteUpload = multer({
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, QUOTE_IMAGE_TYPES.includes(file.mimetype)),
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

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export function registerAiRoutes(app: Express): void {
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

      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
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
        log.warn("AI generated invalid pricing config, errors:", { detail: validation.errors });
      }

      res.json({ success: true, pricing_config: validation.config, validation_errors: validation.valid ? [] : validation.errors });
    } catch (error: any) {
      log.error("AI pricing generation error:", error);
      res.status(500).json({ error: "Failed to generate pricing configuration" });
    }
  });

  /**
   * POST /api/ai/generate-advanced-calculator
   * Plain-language description -> a full advanced calculator config
   * (fields + calculations) for the custom-builder mode.
   */
  app.post("/api/ai/generate-advanced-calculator", async (req, res) => {
    try {
      const parsed = generateAdvancedBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const { description, trade_type } = parsed.data;

      const prompt = `You design custom price calculators for small businesses.

The owner describes what they want; you output the calculator as JSON.

Description: ${description}
${trade_type ? `Trade: ${trade_type}` : ""}

Output a JSON object: { "fields": [...], "calculations": [...], "result_calc": "<headline calculation name>" }

FIELDS — the inputs the customer fills in. Each: { "name": "Short label", "type": "<type>", ...options }
- "number" / "slider": { "min": n, "max": n, "step": n, "default_value": n, "unit": "optional" }
- "select" / "radio": { "options": [ { "label": "Text", "value": <number> } ] } — each option contributes its numeric value
- "multi_select": { "options": [...] } — checkboxes; selected option values are summed
- "toggle": { "on_value": <number> } — on/off switch contributing on_value when on
- "text": free text (not used in math)

CALCULATIONS — named formulas, computed top to bottom (a later one may reference an earlier one):
{ "name": "Subtotal", "formula": "...", "format": "currency" | "number" | "percent" }
Formula syntax:
- reference any field or earlier calculation by name in [square brackets]: [Number of rooms]
- operators + - * / ^ and parentheses
- functions: SUM, MIN, MAX, ROUND, ROUNDUP, ROUNDDOWN, ABS, IF, AND, OR, NOT, CONTAINS
- comparisons inside IF: = != < > <= >=

Rules:
- 2-8 fields, 1-3 calculations. The headline calculation is the final price the customer sees.
- Every name used in a formula MUST be an existing field or earlier calculation.
- Use realistic numbers for the trade.
Return ONLY the JSON object.`;

      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      let raw: any;
      try {
        raw = JSON.parse(completion.choices[0]?.message?.content || "{}");
      } catch {
        return res.status(500).json({ error: "AI returned invalid JSON" });
      }

      const advanced = sanitizeAdvancedAi(raw);
      if (advanced.fields.length === 0 && advanced.calculations.length === 0) {
        return res.status(422).json({ error: "Could not build a calculator from that description" });
      }
      res.json({ success: true, advanced: { enabled: true, ...advanced } });
    } catch (error: any) {
      log.error("AI advanced calculator generation error:", error);
      res.status(500).json({ error: "Failed to generate calculator" });
    }
  });

  /**
   * POST /api/ai/generate-formula
   * Plain-language description -> a single formula expression for one
   * calculation, constrained to the fields/calcs that already exist.
   */
  app.post("/api/ai/generate-formula", async (req, res) => {
    try {
      const parsed = z.object({
        description: z.string().min(2).max(600),
        fields: z.array(z.object({ name: z.string(), type: z.string().optional() })).max(40).optional(),
        calculations: z.array(z.object({ name: z.string() })).max(20).optional(),
      }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const { description, fields = [], calculations = [] } = parsed.data;

      const fieldList = fields.length
        ? fields.map((f) => `- [${f.name}]${f.type ? ` (${f.type})` : ""}`).join("\n")
        : "(no fields defined yet)";
      const calcList = calculations.length
        ? calculations.map((c) => `- [${c.name}]`).join("\n")
        : "(no earlier calculations)";

      const prompt = `You write ONE pricing formula expression for a calculator.

Available fields (reference by exact name in [square brackets]):
${fieldList}

Earlier calculations you may also reference:
${calcList}

What this formula should do: ${description}

Formula syntax:
- reference a field or earlier calculation by its exact name in [square brackets]
- operators: + - * / ^ and parentheses
- functions: SUM, MIN, MAX, ROUND, ROUNDUP, ROUNDDOWN, ABS, IF, AND, OR, NOT, CONTAINS
- comparisons inside IF: = != < > <= >=

Rules:
- Use ONLY names that appear in the lists above. Never invent a field.
- Return ONE formula expression — no explanation.

Return JSON: { "formula": "<the formula expression>" }`;

      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      let raw: any;
      try {
        raw = JSON.parse(completion.choices[0]?.message?.content || "{}");
      } catch {
        return res.status(500).json({ error: "AI returned invalid JSON" });
      }
      const formula = typeof raw?.formula === "string" ? raw.formula.trim().slice(0, 600) : "";
      if (!formula) {
        return res.status(422).json({ error: "Could not build a formula from that description" });
      }
      const check = validateFormula(formula);
      if (!check.valid) {
        return res.status(422).json({ error: `AI produced an invalid formula (${check.error || "parse error"})` });
      }
      res.json({ success: true, formula });
    } catch (error: any) {
      log.error("AI formula generation error:", error);
      res.status(500).json({ error: "Failed to generate formula" });
    }
  });

  /**
   * POST /api/ai/quote-to-calculator
   * A photo / screenshot of an existing written quote -> a proposed advanced
   * calculator config. The owner reviews and approves it in the builder.
   */
  app.post(
    "/api/ai/quote-to-calculator",
    (req: Request, res: Response, next: NextFunction) => {
      quoteUpload.single("file")(req, res, (err: any) => {
        if (err) {
          const tooBig = err?.code === "LIMIT_FILE_SIZE";
          return res.status(tooBig ? 413 : 400).json({
            error: tooBig ? "Image is too large — keep it under 8 MB." : "Could not read the uploaded file.",
          });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const file = (req as any).file as { buffer: Buffer; mimetype: string } | undefined;
        if (!file || !file.buffer || file.buffer.length === 0) {
          return res.status(400).json({ error: "Upload a clear image of the quote (PNG, JPG or WEBP)." });
        }
        const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

        const prompt = `You set up an instant-price calculator from a photo of an existing written quote or price list.

Read the image and work out the pricing structure: what does the final price depend on, and how is it calculated?

Output a JSON object: { "fields": [...], "calculations": [...], "result_calc": "<headline calculation name>", "notes": "<one short sentence on what you read>" }

FIELDS — the inputs a customer would pick. Each: { "name": "Short label", "type": "<type>", ...options }
- "number" / "slider": { "min": n, "max": n, "step": n, "default_value": n, "unit": "optional" }
- "select" / "radio": { "options": [ { "label": "Text", "value": <number> } ] } — each option contributes its numeric value
- "multi_select": { "options": [...] } — checkboxes; selected option values are summed
- "toggle": { "on_value": <number> } — on/off switch contributing on_value when on

CALCULATIONS — named formulas, computed top to bottom (a later one may reference an earlier one):
{ "name": "Subtotal", "formula": "...", "format": "currency" | "number" | "percent" }
- reference any field or earlier calculation by name in [square brackets]
- operators + - * / ^ and parentheses; functions SUM, MIN, MAX, ROUND, IF

Rules:
- Use the real numbers and line items visible in the quote.
- 2-8 fields, 1-3 calculations. The headline calculation is the final price.
- Every name used in a formula MUST be an existing field or earlier calculation.
- If the image is not a quote or price list, return empty "fields" and "calculations" arrays.
Return ONLY the JSON object.`;

        const completion = await getOpenAI().chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          }],
          response_format: { type: "json_object" },
        });

        let raw: any;
        try {
          raw = JSON.parse(completion.choices[0]?.message?.content || "{}");
        } catch {
          return res.status(500).json({ error: "AI returned invalid JSON" });
        }

        const advanced = sanitizeAdvancedAi(raw);
        if (advanced.fields.length === 0 && advanced.calculations.length === 0) {
          return res.status(422).json({
            error: "Couldn't read a pricing structure from that image. Try a clearer, well-lit photo of the quote.",
          });
        }
        res.json({
          success: true,
          advanced: { enabled: true, ...advanced },
          notes: typeof raw?.notes === "string" ? raw.notes.slice(0, 400) : "",
        });
      } catch (error: any) {
        log.error("AI quote-to-calculator error:", error);
        res.status(500).json({ error: "Failed to analyse the quote" });
      }
    },
  );

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

      generatePricingConfigDraft(pricing_intake, sample_quotes, getOpenAI())
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
          log.error("Draft job failed:", err);
          const existingJob = draftJobs.get(jobId);
          if (existingJob) {
            existingJob.status = "failed";
            existingJob.error = err?.message || "Generation failed";
          }
        });
    } catch (error: any) {
      log.error("AI pricing draft creation error:", error);
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

      const result = await generatePricingConfigDraft(intake, undefined, getOpenAI());

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
      log.error("AI pricing draft generation error:", error);
      res.status(500).json({ error: "Failed to generate pricing draft" });
    }
  });

  app.post("/api/ai/demo-chat", async (req: Request, res: Response) => {
    try {
      const ip = getClientIp(req);
      if (!(await aiChatRateLimiter.check(ip))) {
        return res.status(429).json({ error: "Too many requests, please try again shortly" });
      }

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
        getOpenAI(),
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
        log.warn("Failed to store demo conversation:", { error: String(err) });
      }

      res.json({ reply, tool_results: toolResults });
    } catch (error: any) {
      log.error("Demo chat error:", error);
      res.status(500).json({ error: "Failed to process chat" });
    }
  });

  app.post("/api/ai/support-chat", async (req: Request, res: Response) => {
    try {
      const ip = getClientIp(req);
      if (!(await aiChatRateLimiter.check(ip))) {
        return res.status(429).json({ error: "Too many requests, please try again shortly" });
      }

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
        getOpenAI(),
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
        log.warn("Failed to store support conversation:", { error: String(err) });
      }

      res.json({ reply, ticket_created: !!ticketCreated, session_id: sessionIdFinal, tool_results: toolResults });
    } catch (error: any) {
      log.error("Support chat error:", error);
      res.status(500).json({ error: "Failed to process chat" });
    }
  });

  app.post("/api/ai/client-chat", async (req: Request, res: Response) => {
    try {
      const ip = getClientIp(req);
      if (!(await aiChatRateLimiter.check(ip))) {
        return res.status(429).json({ error: "Too many requests, please try again shortly" });
      }

      const body = z.object({
        messages: z.array(chatMessageSchema).min(1).max(50),
        calculator_id: z.number().int().positive(),
        session_id: z.string().min(1),
        // W-BB-1 — opt-in multi-step agent loop. When true, the chat is
        // routed through `runAgentLoop` with the 6 customer-widget tools
        // and progress steps are streamed back as SSE. Legacy single-call
        // behaviour preserved when omitted/false.
        useAgentLoop: z.boolean().optional(),
        customer_email: z.string().email().optional(),
        customer_phone: z.string().optional(),
        customer_name: z.string().optional(),
      }).safeParse(req.body);

      if (!body.success) {
        return res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      }

      const {
        messages,
        calculator_id,
        session_id,
        useAgentLoop,
        customer_email,
        customer_phone,
        customer_name,
      } = body.data;
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

      /* ─── W-BB-1: multi-step agent loop branch ───
       * When the client opts in, route to `runAgentLoop` with the 6 customer
       * widget tools. Steps stream back as SSE so the bubble can show
       * "Checking schedule..." → "Confirming booking..." → final message.
       * Cost is capped at 25¢/conversation (vs the loop default $1.00) since
       * customers are anonymous and abuse risk is higher.
       */
      if (useAgentLoop) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");

        const widgetSystemPrompt = buildCustomerWidgetSystemPrompt({
          businessName: calculator.business_name,
          tradeType: calculator.trade_type,
          customer_email,
          customer_name,
        });

        const ctxMetadata = {
          calculator_id,
          customer_email,
          customer_phone,
          customer_name,
        };
        const toolExecutors: Record<string, import("../services/aiAgentLoop").ToolExecutor> = {};
        for (const name of CUSTOMER_WIDGET_ACTION_NAMES) {
          toolExecutors[name] = executorFromCustomerWidgetAction(name, ctxMetadata);
        }

        try {
          const result = await runAgentLoop({
            systemPrompt: widgetSystemPrompt,
            conversationHistory: messages as any,
            tools: CUSTOMER_WIDGET_TOOLS as any,
            toolExecutors,
            surface: AI_SURFACES.quotequick_widget_ai,
            actionSurface: "customer-widget",
            sessionId: session_id,
            costCapCents: 25, // 25¢ per conversation
            maxSteps: 8,
            onStep: (step) => {
              try {
                res.write(`data: ${JSON.stringify({ step })}\n\n`);
                if (step.type === "text" && step.payload?.text) {
                  res.write(`data: ${JSON.stringify({ text: step.payload.text })}\n\n`);
                }
              } catch {
                // Best-effort streaming — drop frame on write error.
              }
            },
          });

          // Cost-cap fallback: if the loop hit the 25¢ ceiling, escalate to
          // a human teammate via the support_tickets table (one of the 6
          // auto-tier tools, called server-side so we don't need a model
          // round-trip).
          if (result.status === "cost_cap_exceeded") {
            res.write(`data: ${JSON.stringify({
              text: "I'd love to keep helping — let me grab a human teammate. They'll follow up shortly.",
            })}\n\n`);
            try {
              await toolExecutors.request_human_followup(
                { reason: "Customer chat exceeded the per-conversation cost cap" },
                {
                  surface: AI_SURFACES.quotequick_widget_ai,
                  sessionId: session_id,
                  loopRunId: result.loopRunId,
                  stepIndex: result.steps.length,
                },
              );
            } catch (escErr) {
              log.warn("Failed to escalate on cost cap:", { error: String(escErr) });
            }
          }

          res.write(`data: ${JSON.stringify({
            loop_status: result.status,
            loop_run_id: result.loopRunId,
            step_count: result.steps.length,
            cost_cents: result.totalCostCents,
          })}\n\n`);

          // Persist conversation transcript.
          try {
            const existing = await storage.getAiConversationBySession(session_id);
            const allMessages = [...messages, { role: "assistant", content: result.reply || "" }];
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
            log.warn("Failed to store agent loop conversation:", { error: String(err) });
          }

          res.write("data: [DONE]\n\n");
          res.end();
        } catch (err: any) {
          log.error("Customer widget agent loop error:", err);
          try {
            res.write(`data: ${JSON.stringify({ error: "Something went wrong. Please try again." })}\n\n`);
            res.write("data: [DONE]\n\n");
            res.end();
          } catch {
            // headers already sent + connection broken — nothing more we can do.
          }
        }
        return;
      }

      /* ─── Legacy single-call branch (backward compat) ─── */
      const trainingProfile = aiEmployee.training_profile || {};
      const systemPrompt = buildSystemPrompt("client_ai_employee", {
        businessName: calculator.business_name,
        tradeType: calculator.trade_type,
        trainingProfile,
        pricingConfig: calculator.pricing_config as Record<string, any>,
      });

      const { reply, toolResults } = await runChatCompletion(
        getOpenAI(),
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
        log.warn("Failed to store client conversation:", { error: String(err) });
      }

      res.json({ reply, tool_results: toolResults, session_id });
    } catch (error: any) {
      log.error("Client chat error:", error);
      res.status(500).json({ error: "Failed to process chat" });
    }
  });

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
        client_id: 0,
        subject: description.slice(0, 100),
        description,
        calculator_id: calculator.id,
        source: "ai_escalation",
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
          log.warn("Failed to email admin:", { detail: emailErr });
        }
      }

      res.json({ ticket_id: ticket.id, success: true });
    } catch (error: any) {
      log.error("Create ticket error:", error);
      res.status(500).json({ error: "Failed to create support ticket" });
    }
  });
}
