import type { Express, Request, Response } from "express";
import nodemailer from "nodemailer";
import { storage } from "../storage";
import {
  buildDemoQuoteEmail,
  buildInternalNotificationEmail,
  enqueueDemoQuoteFollowups,
} from "../lib/demoQuoteFollowup";

function getTransporter() {
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

export function registerDemoLeadRoutes(app: Express): void {
  app.post("/api/demo-leads", async (req: Request, res: Response) => {
    try {
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
      });

      const ctx = {
        demoQuoteLeadId: lead.id,
        email: trimmedEmail,
        trade,
        demoBusinessName: demoBusinessName || trade,
        quoteAmount: quoteAmount || null,
        answers: answers || null,
      };

      const mail = getTransporter();
      const from =
        process.env.SMTP_FROM ||
        process.env.SMTP_USER ||
        "noreply@wefixtrades.com";

      // 2. Send immediate quote email to the lead (non-blocking)
      if (mail && trimmedEmail) {
        const { subject, html } = buildDemoQuoteEmail(ctx);
        mail
          .sendMail({ from, to: trimmedEmail, subject, html })
          .catch((err) => {
            console.error("[demo-lead] Quote email error:", err?.message);
          });
      }

      // 3. Send internal notification to WeFixTrades team (non-blocking)
      if (mail && trimmedEmail) {
        const internalTo =
          process.env.INTERNAL_LEAD_EMAIL || process.env.SMTP_USER || null;
        if (internalTo) {
          const { subject, html } = buildInternalNotificationEmail(ctx);
          mail
            .sendMail({ from, to: internalTo, subject, html })
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
