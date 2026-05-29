import type { Express, Request, Response } from "express";
import { createHash } from "node:crypto";
import { storage } from "../storage";
import { captureIntakeEvent } from "../services/intakeService";
import { noisyCatch } from "../lib/silentFailureGuard";
import {
  buildDemoQuoteEmail,
  buildInternalNotificationEmail,
  enqueueDemoQuoteFollowups,
} from "../lib/demoQuoteFollowup";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { ADMIN_ALERT_FROM_NAME } from "../lib/adminAlertShell";
import { createLogger } from "../lib/logger";

const log = createLogger("DemoLead");

const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW = 10 * 60 * 1000;
const RATE_MAX = 5;

export function registerDemoLeadRoutes(app: Express): void {
  app.post("/api/demo-leads", async (req: Request, res: Response) => {
    try {
      // Rate limiting
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const now = Date.now();
      let rl = rateMap.get(ip);
      if (!rl || now > rl.resetAt) { rl = { count: 0, resetAt: now + RATE_WINDOW }; rateMap.set(ip, rl); }
      rl.count++;
      if (rl.count > RATE_MAX) {
        return res.status(429).json({ error: "Too many submissions. Please try again in a few minutes." });
      }

      const {
        email,
        name,
        phone,
        company,
        trade,
        demoBusinessName,
        quoteAmount,
        answers,
        smsConsent,
        // Wave 79 — TCPA audit trail. Client-supplied page URL the visitor
        // was on at the moment of consent; the server fills in IP hash +
        // user agent below (never trust the client for those).
        consentUrl,
        consentTextVersion,
        consentTimestamp,
        consentMethod,
        source_tool,
        source_page,
      } = req.body;

      if (!trade) {
        return res.status(400).json({ error: "Trade is required" });
      }

      // At least email or phone required
      const trimmedEmail = (email || "").trim();
      const trimmedPhone = (phone || "").trim();
      if (!trimmedEmail && !trimmedPhone) {
        return res.status(400).json({ error: "Email or phone is required" });
      }
      if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      // Wave 79 — TCPA audit trail. Same forward-only capture pattern as
      // /api/leads. Only filled when smsConsent=true.
      const consentHasContext = !!smsConsent;
      const rawIp = consentHasContext
        ? (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
            || req.ip
            || req.socket.remoteAddress
            || null
        : null;
      const consentIpHash = rawIp && rawIp !== "unknown"
        ? createHash("sha256").update(rawIp).digest("hex")
        : null;
      const rawUserAgent = consentHasContext
        ? (req.headers["user-agent"] as string | undefined) ?? null
        : null;
      const consentUserAgent = rawUserAgent
        ? rawUserAgent.slice(0, 200)
        : null;
      const consentCapturedAt = consentHasContext && typeof consentTimestamp === "string"
        ? new Date(consentTimestamp)
        : (consentHasContext ? new Date() : null);
      const consentUrlNormalized = consentHasContext
        ? (typeof consentUrl === "string" ? consentUrl.trim() : null)
            || (typeof source_page === "string" ? source_page.trim() : null)
        : null;
      const consentMethodNormalized = consentHasContext
        ? (typeof consentMethod === "string"
            && ["web_form", "sms_keyword", "phone_call", "paper"].includes(consentMethod)
            ? consentMethod
            : "web_form")
        : null;
      const consentTextVersionNormalized = consentHasContext
        ? (typeof consentTextVersion === "string" && consentTextVersion.length <= 50
            ? consentTextVersion
            : null)
        : null;

      // 1. Persist lead
      const lead = await storage.createDemoQuoteLead({
        email: trimmedEmail || null,
        name: name || null,
        phone: trimmedPhone || null,
        company: company || null,
        trade,
        demo_business_name: demoBusinessName || null,
        quote_amount: quoteAmount || null,
        answers: answers || null,
        sms_consent: smsConsent || false,
        consent_captured_at: consentCapturedAt,
        consent_text_version: consentTextVersionNormalized,
        consent_url: consentUrlNormalized,
        consent_ip_hash: consentIpHash,
        consent_user_agent: consentUserAgent,
        consent_method: consentMethodNormalized,
        source: "quote_demo",
        page: "quote-demo",
        source_tool: source_tool || "demo",
        source_page: source_page || null,
      });

      const ctx = {
        demoQuoteLeadId: lead.id,
        email: trimmedEmail,
        trade,
        demoBusinessName: demoBusinessName || trade,
        quoteAmount: quoteAmount || null,
        answers: answers || null,
      };

      // 2. Send immediate quote email to the lead via shared transporter (non-blocking)
      const customerMail = getEmailTransporter();
      if (customerMail && trimmedEmail) {
        const { subject, html, text } = buildDemoQuoteEmail(ctx);
        customerMail
          .sendMail({
            from: `WeFixTrades <${getFromAddress()}>`,
            to: trimmedEmail,
            subject,
            html,
            text,
          })
          .catch((err) => {
            log.error("[demo-lead] Quote email error:", err?.message);
          });
      }

      // 3. Send internal notification to WeFixTrades team (non-blocking)
      const internalMail = getEmailTransporter();
      if (internalMail && trimmedEmail) {
        const internalTo =
          process.env.INTERNAL_LEAD_EMAIL || process.env.SMTP_USER || null;
        if (internalTo) {
          const { subject, html, text } = buildInternalNotificationEmail(ctx);
          internalMail
            .sendMail({
              from: `${ADMIN_ALERT_FROM_NAME} <${getFromAddress()}>`,
              to: internalTo,
              subject,
              html,
              text,
            })
            .catch((err) => {
              log.error(
                "[demo-lead] Internal notification error:",
                err?.message
              );
            });
        } else {
          log.info(
            "No INTERNAL_LEAD_EMAIL or SMTP_USER configured — internal notification skipped",
            { leadId: lead.id }
          );
        }
      }

      // 4. Enqueue follow-up sequence (non-blocking)
      if (trimmedEmail) {
        enqueueDemoQuoteFollowups(ctx).catch((err) => {
          log.error(
            "[demo-lead] Followup enqueue error:",
            err?.message
          );
        });
      }

      // Wave 109 — was silent .catch(() => {}); audit trail entries
      // are non-blocking but their loss invalidates the lead-source
      // attribution dashboard.
      noisyCatch(captureIntakeEvent({
        sourceType:    'public_form',
        eventType:     'demo_lead.submitted',
        correlationId: `demo-lead-${lead.id}`,
        actorType:     'anonymous',
        entityType:    'demo_quote_lead',
        entityId:      String(lead.id),
        rawPayload:    req.body,
        context:       { ipAddress: req.ip, userAgent: req.headers['user-agent'] as string | undefined },
      }), {
        op: "intake.demoLead.submitted",
        meta: { leadId: lead.id },
      });

      log.info("Saved lead", {
        leadId: lead.id,
        contact: trimmedEmail || trimmedPhone,
        trade,
        quoteAmount,
      });
      return res.json({ ok: true, leadId: lead.id });
    } catch (err: any) {
      log.error("[demo-lead] error:", err?.message);
      return res.status(500).json({ error: "Failed to save lead" });
    }
  });
}
