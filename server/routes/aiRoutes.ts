import type { Express, Request, Response } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import OpenAI from "openai";
import { storage } from "../storage";
import { PRICING_TYPES, validatePricingConfig, FAMILY_LABELS, FAMILY_DESCRIPTIONS } from "@shared/pricingConfig";
import { pricingIntakeSchema, sampleQuoteSchema, type PricingDraftJob } from "@shared/schema";
import { generatePricingConfigDraft } from "../aiPricingAgent";
import { buildSystemPrompt, runChatCompletion } from "../aiChatEngine";
import { createLogger } from "../lib/logger";
import { aiChatRateLimiter } from "../services/rateLimiter";

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
