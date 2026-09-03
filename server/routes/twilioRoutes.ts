import type { Express } from "express";
import * as Sentry from "@sentry/node";
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
  recordSmsOptOut,
  getClientIdByAssignedNumber,
} from "../twilioClient";
import { buildSystemPrompt, runChatCompletion } from "../aiChatEngine";
import { getOpenAI } from "../openaiClient";
import { formatWhatsAppBookingConfirmation } from "./twilioBookingHelper";
import { captureVoicemail, enrichVoicemailInBackground } from "./voicemailRoutes";
import { createLogger } from "../lib/logger";
import {
  agentLoopEnabledBA6,
  processInboundSmsViaLoop,
} from "../services/inboundSmsConcierge";
import { aiChannelGateOn } from "../services/aiChannelGate";
import { aiGateAllowed } from "../services/aiSystemGate";
import { brandLineInboundRateLimiter } from "../services/rateLimiter";

const log = createLogger("Twilio");

/**
 * W-TWILIO hardening (P2-2) — escape XML special chars before interpolating
 * ANY dynamic value into a TwiML `<Message>` body. Tenant-controlled fields
 * (business_name, support email/phone), classifier output, and AI replies were
 * spliced into TwiML unescaped, so a `<`, `&`, or a stray `</Message>` could
 * break the document or inject markup. Mirrors the escapeXml helper already
 * used in twilioVoiceCallbackRoutes.ts.
 */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

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
      // P2-2 — escape: callers interpolate business_name (tenant-controlled).
      res.send(`<Response><Message>${escapeXml(msg)}</Message></Response>`);
    };

    try {
      const valid = verifyTwilioSignature(req);
      if (!valid) {
        res.set("Content-Type", "text/xml");
        return res.status(403).send("<Response></Response>");
      }

      const from: string = req.body?.From || "";
      const to: string = req.body?.To || "";
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

      // ── STOP keyword handling (SMS only; WhatsApp opt-outs are managed in
      //    Meta's UI). Match the standard CTIA keywords case-insensitively;
      //    a single-word body that exactly matches one of them flips the
      //    sender into the sms_opt_outs registry. Subsequent outbound sends
      //    to this number are blocked by sendSMS()'s opt-out check.
      //    Reply with the required confirmation per TCPA / CTIA guidance.
      if (channel === "sms") {
        const trimmed = body.trim().toUpperCase();
        const STOP_KEYWORDS = new Set([
          "STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT",
        ]);
        if (STOP_KEYWORDS.has(trimmed)) {
          // Wave 77 — STOP routed via a per-tenant TradeLine number scopes
          // the opt-out to THAT client only. STOP routed via the shared
          // WeFixTrades brand line records a global opt-out (unchanged
          // pre-Wave-77 behavior). `To` is the number the homeowner
          // actually texted — we reverse-lookup the owning client.
          const scopeClientId = to
            ? await getClientIdByAssignedNumber(to.replace(/^whatsapp:/i, ""))
            : null;
          await recordSmsOptOut(cleanFrom, "stop_keyword", scopeClientId ?? undefined);
          log.info("[Twilio] inbound STOP keyword — opt-out recorded", {
            from: cleanFrom,
            to,
            scope: scopeClientId ?? "global",
          });
          res.set("Content-Type", "text/xml");
          return res.send(
            `<Response><Message>You're opted out of WeFixTrades SMS. Reply START to re-subscribe.</Message></Response>`,
          );
        }
        // Wave 79 — HELP / INFO keyword handling (CTIA compliance).
        // Carriers REQUIRE a HELP response on every A2P campaign; without
        // it the campaign can be flagged or suspended. Mirrors the STOP
        // path: scope to per-tenant number when one matches so the reply
        // reflects the trade's brand, fall back to the WeFixTrades brand
        // line otherwise. Always logs the inbound for the audit trail.
        const HELP_KEYWORDS = new Set(["HELP", "INFO"]);
        if (HELP_KEYWORDS.has(trimmed)) {
          let brand = "WeFixTrades";
          let supportEmail = "support@wefixtrades.com";
          let supportPhone: string | null = null;
          /* Resolved once, used twice: it decides whose brand answers HELP AND
           * it is the only thing that says which tenant the row we are about to
           * write belongs to. Hoisted out of the branding block below, and
           * resolved in a try of its own, because a failure of the BRANDING
           * query must not silently cost us the ATTRIBUTION — an unattributed
           * row holds the sender's phone number and body where the owning
           * account's deletion can never find it. */
          let scopeClientId: number | null = null;
          try {
            scopeClientId = to
              ? await getClientIdByAssignedNumber(to.replace(/^whatsapp:/i, ""))
              : null;
          } catch (err: any) {
            log.warn("[Twilio] HELP keyword — tenant number lookup failed", {
              error: err?.message,
            });
          }
          if (scopeClientId != null) {
            try {
              const { db } = await import("../db");
              const { clients } = await import("@shared/schema");
              const { eq } = await import("drizzle-orm");
              const [c] = await db
                .select({
                  business_name: clients.business_name,
                  contact_email: clients.contact_email,
                  contact_phone: clients.contact_phone,
                })
                .from(clients)
                .where(eq(clients.id, scopeClientId))
                .limit(1);
              if (c?.business_name) brand = c.business_name;
              if (c?.contact_email) supportEmail = c.contact_email;
              if (c?.contact_phone) supportPhone = c.contact_phone;
            } catch (err: any) {
              log.warn("[Twilio] HELP keyword — per-tenant branding lookup failed", {
                error: err?.message,
              });
            }
          }
          // Log the inbound for the audit trail (best-effort; never block
          // the 200 OK to Twilio on a write failure). lead_id /
          // calculator_id are null on a keyword text — there is no lead and no
          // calculator involved — so `scope_client_id` is the ONLY thing that
          // makes this row reachable by the owning account's deletion. It is
          // null only when the message really did arrive on the shared
          // WeFixTrades brand line, where the sender is a member of the public
          // and no tenant owns the row; RETENTION_SWEEPS bounds those.
          try {
            await storeSmsMessage({
              lead_id: null,
              calculator_id: null,
              scope_client_id: scopeClientId,
              direction: "inbound",
              channel,
              body,
              from_number: cleanFrom,
              to_number: to || null,
              twilio_sid: messageSid || null,
              is_ai: false,
            });
          } catch (err: any) {
            log.warn("[Twilio] HELP keyword — inbound log write failed", {
              error: err?.message,
            });
          }
          log.info("[Twilio] inbound HELP keyword", {
            from: cleanFrom,
            to,
            brand,
          });
          const contactSuffix = supportPhone
            ? `Email ${supportEmail} or call ${supportPhone}.`
            : `Email ${supportEmail}.`;
          const reply =
            `${brand} SMS support. Reply STOP to unsubscribe. ` +
            `Msg & data rates may apply. ${contactSuffix}`;
          res.set("Content-Type", "text/xml");
          // P2-2 — escape: brand/email/phone are tenant-controlled.
          return res.send(`<Response><Message>${escapeXml(reply)}</Message></Response>`);
        }

        // START / UNSTOP — clear the opt-out row so the sender can opt
        // back in without a manual admin step. Wave 77 — when the START
        // comes in via a per-tenant number we only clear THAT client's
        // opt-out; a global opt-out persists until the user texts START
        // to the shared brand line.
        if (trimmed === "START" || trimmed === "UNSTOP" || trimmed === "YES") {
          try {
            const { db } = await import("../db");
            const { smsOptOuts } = await import("@shared/schema");
            const { eq, and, isNull } = await import("drizzle-orm");
            // Reuse the same E.164 normalization as the writer
            const e164 = cleanFrom.startsWith("+")
              ? cleanFrom
              : (() => {
                  const d = cleanFrom.replace(/\D/g, "");
                  if (d.length === 10) return `+1${d}`;
                  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
                  return `+${d}`;
                })();
            const scopeClientId = to
              ? await getClientIdByAssignedNumber(to.replace(/^whatsapp:/i, ""))
              : null;
            if (scopeClientId != null) {
              await db
                .delete(smsOptOuts)
                .where(
                  and(
                    eq(smsOptOuts.phone_e164, e164),
                    eq(smsOptOuts.scope_client_id, scopeClientId),
                  ),
                );
            } else {
              // No per-tenant match → clear the global opt-out only.
              await db
                .delete(smsOptOuts)
                .where(
                  and(
                    eq(smsOptOuts.phone_e164, e164),
                    isNull(smsOptOuts.scope_client_id),
                  ),
                );
            }
            log.info("[Twilio] inbound START — opt-out cleared", {
              from: cleanFrom,
              to,
              scope: scopeClientId ?? "global",
            });
          } catch (err: any) {
            log.warn("[Twilio] failed to clear opt-out on START", { error: err.message });
          }
          res.set("Content-Type", "text/xml");
          return res.send(
            `<Response><Message>You're re-subscribed to WeFixTrades SMS. Reply STOP at any time to opt out.</Message></Response>`,
          );
        }
      }

      const lead = await matchLeadByPhone(cleanFrom);
      if (!lead) {
        // No per-customer lead matched. This is almost certainly a message
        // sent to the operating brand's own line (e.g. +1 915 615 3280)
        // rather than to a TradeLine customer's number.
        //
        // Per-sender volume cap BEFORE the LLM classify. The matched-lead
        // path has checkRateLimit; this no-lead branch had none, so one
        // sender could drive unbounded Haiku spend + ticket creation. Keyed
        // on the inbound From number, 15/hour. Past the cap we ack Twilio
        // quietly (empty TwiML) and skip the classifier entirely.
        const withinBrandLineLimit = await brandLineInboundRateLimiter.check(
          `twilio:brandline:${cleanFrom}`,
        );
        if (!withinBrandLineLimit) {
          log.warn("[Twilio] brand-line inbound rate limit hit — skipping classify", {
            from: cleanFrom,
          });
          res.set("Content-Type", "text/xml");
          return res.send("<Response></Response>");
        }

        // Run it through the inbound classifier so spam is silently dropped,
        // out-of-scope messages get a polite decline, legitimate inquiries
        // get a confirm-receipt reply, and complex/availability-off cases
        // create a support ticket.
        const { decideInboundAction } = await import("../services/inboundClassifier");
        const decision = await decideInboundAction({
          channel: "sms",
          fromIdentity: cleanFrom,
          message: body,
        });
        log.info("[Twilio] brand-line classification", {
          from: cleanFrom, action: decision.action, category: decision.category, confidence: decision.confidence,
        });

        res.set("Content-Type", "text/xml");
        switch (decision.action) {
          case "drop":
            // Silent — no response sent (Twilio still acks at HTTP 200)
            return res.send("<Response></Response>");
          case "polite_decline":
            return res.send(
              `<Response><Message>Thanks for reaching out — WeFixTrades sells digital tools to trades businesses (plumbers, HVAC, roofers, etc.). We don't perform the trade work itself. Best of luck!</Message></Response>`
            );
          case "ticket": {
            const awayPart = decision.awayMessage
              ? `${decision.awayMessage} `
              : "Thanks for reaching out — our team will get back to you within 1 hour. ";
            const ref = decision.ticketId ? `Reference: T-${decision.ticketId}` : "";
            // P2-2 — escape: awayMessage is classifier/config-derived text.
            return res.send(
              `<Response><Message>${escapeXml(`${awayPart}${ref}`)}</Message></Response>`
            );
          }
          case "reply":
          default:
            // Legitimate sales inquiry — confirm receipt and route to sales.
            // Detailed AI conversation can be added later.
            return res.send(
              `<Response><Message>Thanks for messaging WeFixTrades! A member of our sales team will reply within the hour. For urgent help, email sales@wefixtrades.com.</Message></Response>`
            );
        }
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

      // ── W-BA-6: route inbound SMS through the BA-0 multi-step loop ──
      //
      // SMS only (WhatsApp keeps the legacy single-call path for now). Gate
      // checks fire BEFORE the loop so a tripped system gate or off channel
      // never reaches the model — the loop's own gate is a defence-in-depth
      // re-check between steps. STOP / opt-out is owned by Twilio at the
      // carrier level + the existing `lead.ai_paused` short-circuit above.
      //
      // When the loop yields ownership (no portal-user match, loop threw, or
      // the env flag is off) we fall through to the legacy runChatCompletion
      // path so nothing regresses.
      if (channel === "sms" && agentLoopEnabledBA6() && calculator) {
        const systemGate = await aiGateAllowed("portal").catch(() => ({
          allowed: false,
          reason: "gate read failed",
        }));
        const channelGateSms = await aiChannelGateOn("sms").catch(() => false);
        if (systemGate.allowed && channelGateSms) {
          // Pull a short recent transcript for context. Cap at 10 turns to
          // keep token cost predictable. Filter to this lead's thread only.
          let thread: Array<{ role: "user" | "assistant"; content: string }> = [];
          try {
            const threads = await storage.getSmsThreads(lead.calculator_id);
            const mine = threads.find((t) => t.lead?.id === lead.id);
            if (mine) {
              thread = mine.messages.slice(-10).map((m) => ({
                role: (m.direction === "inbound" ? "user" : "assistant") as
                  | "user"
                  | "assistant",
                content: m.body ?? "",
              }));
            }
          } catch (err: any) {
            log.warn("[BA-6] failed to load SMS thread history; proceeding with current message", {
              leadId: lead.id,
              error: err?.message,
            });
          }
          const loopOutcome = await processInboundSmsViaLoop({
            lead,
            calculator,
            senderPhone: cleanFrom,
            body,
            thread,
          });
          if (loopOutcome.handled) {
            // The loop owned the reply (sent via tool, drafted, or recorded
            // an error draft). Acknowledge Twilio with empty TwiML so we
            // don't ALSO send a synchronous reply on this HTTP response.
            res.set("Content-Type", "text/xml");
            return res.send("<Response></Response>");
          }
          // Fall through to legacy path.
        } else {
          log.info("[BA-6] system or channel gate off — falling back to legacy SMS reply", {
            systemAllowed: systemGate.allowed,
            channelOn: channelGateSms,
          });
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
      // P2-2 — escape: shortReply is AI-generated free text.
      res.send(`<Response><Message>${escapeXml(shortReply)}</Message></Response>`);
    } catch (error: any) {
      log.error("[Twilio] Inbound webhook error:", error);
      twimlError("Thanks for reaching out! We'll get back to you soon.");
    }
  });

  /**
   * Voice fallback — Twilio hits this if the primary VoiceUrl (Vapi) is
   * unreachable or returns 5xx. Without it the caller hears the carrier
   * error tone; with it they get a branded apology + voicemail capture so
   * we can call back within an hour.
   *
   * Wired on the IncomingPhoneNumber via scripts/twilio/patch-fallback-url.mjs.
   * Twilio retries the primary VoiceUrl once before invoking the fallback,
   * so every hit here is a real Vapi outage — we surface it to Sentry as
   * a warning so on-call can see when this path fires.
   */
  app.post("/api/twilio/voice-fallback", async (req, res) => {
    // Twilio fallback POSTs are signed with the same auth token as every
    // other webhook. Reject anything unsigned/forged before emitting TwiML —
    // this is the only Twilio route that was missing the guard its siblings
    // (e.g. /api/twilio/inbound) all apply.
    if (!verifyTwilioSignature(req)) {
      res.set("Content-Type", "text/xml");
      return res.status(403).send("<Response/>");
    }

    const callSid = typeof req.body?.CallSid === "string" ? req.body.CallSid : "(unknown)";
    const errorCode = typeof req.body?.ErrorCode === "string" ? req.body.ErrorCode : null;
    const errorUrl = typeof req.body?.ErrorUrl === "string" ? req.body.ErrorUrl : null;

    /* Second visit: the `<Record>` below carries no `action`, so Twilio posts
     * the finished recording back to THIS url. Everything after the caller
     * hangs up arrives here.
     *
     * Until now that payload was dropped. Two consequences, both real:
     *   • the message the caller was promised a callback on was never stored,
     *     and the handler re-served the same "technical issue" prompt; and
     *   • the Recording stayed on Twilio's servers with nothing in our database
     *     naming it, so account deletion could never reach it. Deletion erases
     *     what a scoped row points at; an artefact with no row is invisible to
     *     it, and we deliberately never list Twilio to find one.
     *
     * Storing it makes the recording attributable, which is what makes it
     * erasable — `voicemails.recording_url` is declared in STORED_OBJECTS and
     * purged with the account. Guarded on `RecordingUrl` being present, so the
     * first visit is untouched. */
    const recordingUrl =
      typeof req.body?.RecordingUrl === "string" ? req.body.RecordingUrl : "";
    // Read CallSid directly rather than reusing the "(unknown)" log sentinel
    // above: coupling the capture guard to a logging placeholder would break it
    // silently if that placeholder ever changed.
    const recordingCallSid =
      typeof req.body?.CallSid === "string" ? req.body.CallSid.trim() : "";
    if (recordingUrl && recordingCallSid) {
      const fromRaw = typeof req.body?.From === "string" ? req.body.From : "";
      try {
        const vmId = await captureVoicemail({
          callSid: recordingCallSid,
          recordingUrl,
          from: fromRaw,
          to: typeof req.body?.To === "string" ? req.body.To : "",
          durationRaw: req.body?.RecordingDuration,
        });
        log.info("[Twilio] voice-fallback voicemail captured", { callSid, vmId });
        if (vmId !== null) enrichVoicemailInBackground(vmId, recordingUrl);
      } catch (err: any) {
        // Loud, never silent: an uncaptured recording is one nothing can ever
        // delete, so the SID has to survive in the logs.
        log.error(
          "[Twilio] voice-fallback recording could NOT be stored — it will sit on Twilio " +
            "unattributed and out of reach of account deletion",
          { callSid, recordingUrl, err: err?.message },
        );
      }
      res.set("Content-Type", "text/xml");
      return res.send("<Response><Hangup/></Response>");
    }

    log.warn("[Twilio] voice-fallback invoked — primary VoiceUrl failed", {
      callSid,
      errorCode,
      errorUrl,
    });

    try {
      Sentry.captureMessage("twilio.voice_fallback_invoked", {
        level: "warning",
        tags: { component: "twilio", path: "voice-fallback" },
        extra: { callSid, errorCode, errorUrl },
      });
    } catch (sentryErr: any) {
      log.error("[Twilio] Sentry capture failed in voice-fallback", { err: sentryErr?.message });
    }

    res.set("Content-Type", "text/xml");
    res.send(
      `<Response>` +
        `<Say voice="Polly.Joanna">Hi, we're experiencing a brief technical issue. Please leave a message after the tone and we'll call you back within one hour.</Say>` +
        `<Record maxLength="60" playBeep="true" trim="trim-silence"/>` +
        `<Hangup/>` +
      `</Response>`,
    );
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
