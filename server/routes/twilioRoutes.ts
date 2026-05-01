import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import {
  isTwilioConfigured,
  checkRateLimit,
  storeSmsMessage,
  matchLeadByPhone,
  truncateSms,
  verifyTwilioSignature,
  getTwilioFromNumber,
} from "../twilioClient";
import { buildSystemPrompt, runChatCompletion } from "../aiChatEngine";
import { getOpenAI } from "../openaiClient";
import { formatWhatsAppBookingConfirmation } from "./twilioBookingHelper";
import { createLogger } from "../lib/logger";

const log = createLogger("Twilio");

/* ─── MessageSid dedupe cache (TTL-based, max 1000 entries) ─── */
const SEEN_SIDS = new Map<string, number>();
const DEDUPE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEDUPE_MAX_SIZE = 1000;

function isDuplicateMessage(sid: string): boolean {
  if (!sid) return false;
  const now = Date.now();

  // Evict stale entries when approaching capacity
  if (SEEN_SIDS.size >= DEDUPE_MAX_SIZE) {
    for (const [key, ts] of SEEN_SIDS) {
      if (now - ts > DEDUPE_TTL_MS) SEEN_SIDS.delete(key);
    }
  }

  if (SEEN_SIDS.has(sid)) {
    const ts = SEEN_SIDS.get(sid)!;
    if (now - ts < DEDUPE_TTL_MS) return true;
  }
  SEEN_SIDS.set(sid, now);
  return false;
}

export function registerTwilioRoutes(app: Express): void {
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

      // Deduplicate: Twilio may deliver the same message more than once
      if (messageSid && isDuplicateMessage(messageSid)) {
        log.info("Duplicate MessageSid ignored", { messageSid });
        res.set("Content-Type", "text/xml");
        return res.status(200).send("<Response></Response>");
      }

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
        log.warn(`[Twilio] Rate limit hit for lead ${lead.id}: ${rateCheck.reason}`);
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
      const { reply, toolResults } = await runChatCompletion(
        getOpenAI(),
        "client_ai_employee",
        chatMessages,
        systemPrompt,
        { calculatorId: lead.calculator_id, calculator, sessionId: `sms-${lead.id}` }
      );

      // For WhatsApp: format booking confirmations with rich message
      let formattedReply = reply;
      if (isWhatsapp && toolResults) {
        const bookingConfirmation = formatWhatsAppBookingConfirmation(toolResults);
        if (bookingConfirmation) {
          formattedReply = bookingConfirmation;
        }
      }

      const shortReply = truncateSms(formattedReply);

      await storeSmsMessage({
        lead_id: lead.id,
        calculator_id: lead.calculator_id,
        direction: "outbound",
        channel,
        body: shortReply,
        from_number: isWhatsapp ? process.env.TWILIO_WHATSAPP_NUMBER || null : getTwilioFromNumber(),
        to_number: cleanFrom,
        twilio_sid: null,
        is_ai: true,
      });

      res.set("Content-Type", "text/xml");
      res.send(`<Response><Message>${shortReply}</Message></Response>`);
    } catch (error: any) {
      log.error("[Twilio] Inbound webhook error:", error);
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
      log.error("[Messages] Error:", error);
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
        from_number: getTwilioFromNumber(),
        whatsapp_number: process.env.TWILIO_WHATSAPP_NUMBER || null,
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch SMS status" });
    }
  });
}
