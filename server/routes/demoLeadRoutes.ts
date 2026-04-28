import type { Express, Request, Response } from "express";
import nodemailer from "nodemailer";
import { storage } from "../storage";
import { captureIntakeEvent } from "../services/intakeService";
import {
  buildDemoQuoteEmail,
  buildInternalNotificationEmail,
  enqueueDemoQuoteFollowups,
} from "../lib/demoQuoteFollowup";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";

/**
 * Standalone transporter for the INTERNAL notification (out of scope for
 * Sprint 2C cleanup — admin-style email scheduled for Sprint 2D).
 */
function getLegacyInternalTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

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
            console.error("[demo-lead] Quote email error:", err?.message);
          });
      }

      // 3. Send internal notification to WeFixTrades team (non-blocking)
      // Uses legacy transporter — admin notification is out of Sprint 2C scope.
      const internalMail = getLegacyInternalTransporter();
      const internalFrom =
        process.env.SMTP_FROM ||
        process.env.SMTP_USER ||
        "noreply@wefixtrades.com";
      if (internalMail && trimmedEmail) {
        const internalTo =
          process.env.INTERNAL_LEAD_EMAIL || process.env.SMTP_USER || null;
        if (internalTo) {
          const { subject, html } = buildInternalNotificationEmail(ctx);
          internalMail
            .sendMail({ from: internalFrom, to: internalTo, subject, html })
            .catch((err) => {
              console.error(
                "[demo-lead] Internal notification error:",
                err?.message
              );
            });
        } else {
          console.log(
            "[demo-lead] No INTERNAL_LEAD_EMAIL or SMTP_USER configured — internal notification skipped. Lead ID:",
            lead.id
          );
        }
      }

      // 4. Enqueue follow-up sequence (non-blocking)
      if (trimmedEmail) {
        enqueueDemoQuoteFollowups(ctx).catch((err) => {
          console.error(
            "[demo-lead] Followup enqueue error:",
            err?.message
          );
        });
      }

      captureIntakeEvent({
        sourceType:    'public_form',
        eventType:     'demo_lead.submitted',
        correlationId: `demo-lead-${lead.id}`,
        actorType:     'anonymous',
        entityType:    'demo_quote_lead',
        entityId:      String(lead.id),
        rawPayload:    req.body,
        context:       { ipAddress: req.ip, userAgent: req.headers['user-agent'] as string | undefined },
      }).catch(() => {});

      console.log(
        "[demo-lead] Saved lead",
        lead.id,
        trimmedEmail || trimmedPhone,
        trade,
        quoteAmount
      );
      return res.json({ ok: true, leadId: lead.id });
    } catch (err: any) {
      console.error("[demo-lead] error:", err?.message);
      return res.status(500).json({ error: "Failed to save lead" });
    }
  });
}
