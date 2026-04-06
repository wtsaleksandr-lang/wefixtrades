import type { Express, Request, Response } from "express";
import nodemailer from "nodemailer";
import { storage } from "../storage";
import {
  enqueueMissedCallFollowups,
  buildImmediateResultsEmail,
} from "../lib/missedCallFollowup";

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW = 10 * 60 * 1000;
const RATE_MAX = 5;

export function registerMissedCallLeadRoutes(app: Express): void {
  app.post("/api/missed-call-leads", async (req: Request, res: Response) => {
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
        trade,
        missedCallsPerWeek,
        closeRatePercent,
        avgJobValue,
        estimatedAnnualLoss,
        source_tool,
        source_page,
      } = req.body;

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Valid email is required" });
      }
      if (!trade) {
        return res.status(400).json({ error: "Trade is required" });
      }

      // 1. Persist lead
      const lead = await storage.createMissedCallLead({
        email: email.trim(),
        name: name || null,
        phone: phone || null,
        trade,
        missed_calls_per_week: missedCallsPerWeek || null,
        close_rate_percent: closeRatePercent || null,
        avg_job_value: avgJobValue || null,
        estimated_annual_loss: estimatedAnnualLoss || null,
        source_tool: source_tool || null,
        source_page: source_page || null,
      });

      const ctx = {
        missedCallLeadId: lead.id,
        email: email.trim(),
        trade,
        missedCallsPerWeek: missedCallsPerWeek || 0,
        closeRatePercent: closeRatePercent || 0,
        avgJobValue: avgJobValue || 0,
        estimatedAnnualLoss: estimatedAnnualLoss || 0,
      };

      // 2. Send immediate results email (non-blocking)
      const mail = getTransporter();
      if (mail) {
        const { subject, html } = buildImmediateResultsEmail(ctx);
        const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@wefixtrades.com";
        mail.sendMail({ from, to: email.trim(), subject, html }).catch((err) => {
          console.error("[missed-call-lead] Email send error:", err?.message);
        });
      }

      // 3. Enqueue follow-up sequence (non-blocking)
      enqueueMissedCallFollowups(ctx).catch((err) => {
        console.error("[missed-call-lead] Followup enqueue error:", err?.message);
      });

      console.log("[missed-call-lead] Saved lead", lead.id, email, trade, estimatedAnnualLoss);
      return res.json({ ok: true, leadId: lead.id });
    } catch (err: any) {
      console.error("[missed-call-lead] error:", err?.message);
      return res.status(500).json({ error: "Failed to save lead" });
    }
  });
}
