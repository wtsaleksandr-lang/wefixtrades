import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { buildSubdomain, HOSTING_DOMAIN } from "@shared/slugUtils";
import { createLogger } from "../lib/logger";

const log = createLogger("Dashboard");

async function requireCalcByToken(token: string) {
  const calculator = await storage.getCalculatorByToken(token);
  if (!calculator) return null;
  const isExpired = new Date() > new Date(calculator.token_expires_at);
  if (isExpired) return null;
  return calculator;
}

export function registerDashboardRoutes(app: Express): void {
  app.get("/api/dashboard/overview", async (req, res) => {
    try {
      const token = String(req.query.token || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [leadsThisWeek, totalLeads, eventCounts, deployment, avgQuote] = await Promise.all([
        storage.getLeadCountSince(calculator.id, oneWeekAgo),
        storage.getLeadsByCalculatorId(calculator.id).then(l => l.length),
        storage.getEventCounts(calculator.id, oneWeekAgo),
        storage.getDeploymentStatus(calculator.id),
        storage.getAvgQuoteAmount(calculator.id),
      ]);

      const settings = (calculator.calculator_settings as any) || {};
      const publish = settings.publish || {};

      const totalViews = calculator.total_views || 0;
      const conversionRate = totalViews > 0 ? Math.round((totalLeads / totalViews) * 100) : 0;

      const subdomain = calculator.slug ? buildSubdomain(calculator.slug, HOSTING_DOMAIN) : '';

      res.json({
        calculator: {
          id: calculator.id,
          slug: calculator.slug,
          business_name: calculator.business_name,
          trade_type: calculator.trade_type,
          owner_email: calculator.owner_email,
          created_at: calculator.created_at,
          calculator_settings: calculator.calculator_settings || {},
          show_powered_by_badge: calculator.show_powered_by_badge ?? true,
          plan_tier: calculator.plan_tier || "free",
        },
        plan_tier: calculator.plan_tier || "free",
        status: publish.status || deployment?.status || 'draft',
        hosted_url: subdomain ? `https://${subdomain}` : '',
        subdomain,
        custom_domain: publish.custom_domain || '',
        custom_domain_status: publish.custom_domain_status || 'none',
        stats: {
          leads_this_week: leadsThisWeek,
          total_leads: totalLeads,
          total_views: totalViews,
          views_this_week: eventCounts.views,
          conversion_rate: conversionRate,
          avg_quote: avgQuote,
        },
      });
    } catch (error: any) {
      log.error("Dashboard overview error:", error);
      res.status(500).json({ error: "Failed to load overview" });
    }
  });

  app.get("/api/dashboard/leads", async (req, res) => {
    try {
      const token = String(req.query.token || '');
      const search = String(req.query.search || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const leadsList = search
        ? await storage.searchLeads(calculator.id, search)
        : await storage.getLeadsByCalculatorId(calculator.id);

      res.json({ leads: leadsList });
    } catch (error: any) {
      log.error("Dashboard leads error:", error);
      res.status(500).json({ error: "Failed to load leads" });
    }
  });

  app.delete("/api/dashboard/leads/:id", async (req, res) => {
    try {
      const token = String(req.query.token || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      await storage.deleteLead(parseInt(req.params.id), calculator.id);
      res.json({ success: true });
    } catch (error: any) {
      log.error("Delete lead error:", error);
      res.status(500).json({ error: "Failed to delete lead" });
    }
  });

  app.get("/api/dashboard/leads/export", async (req, res) => {
    try {
      const token = String(req.query.token || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const leadsList = await storage.getLeadsByCalculatorId(calculator.id);

      const header = 'Name,Phone,Email,Quote,Date\n';
      const rows = leadsList.map(l => {
        const name = (l.name || '').replace(/,/g, ' ');
        const phone = (l.phone || '').replace(/,/g, ' ');
        const email = (l.email || '').replace(/,/g, ' ');
        const quote = l.quote_amount || '';
        const date = l.created_date ? new Date(l.created_date).toISOString().split('T')[0] : '';
        return `${name},${phone},${email},${quote},${date}`;
      }).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="leads-${calculator.slug}.csv"`);
      res.send(header + rows);
    } catch (error: any) {
      log.error("Export leads error:", error);
      res.status(500).json({ error: "Failed to export leads" });
    }
  });

  app.get("/api/dashboard/analytics", async (req, res) => {
    try {
      const token = String(req.query.token || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [eventCounts, weeklyTrend, avgQuote, allLeads, bookingStats] = await Promise.all([
        storage.getEventCounts(calculator.id, thirtyDaysAgo),
        storage.getWeeklyTrend(calculator.id),
        storage.getAvgQuoteAmount(calculator.id),
        storage.getLeadsByCalculatorId(calculator.id),
        storage.getBookingStats(calculator.id),
      ]);

      const totalLeads = allLeads.length;
      const totalViews = calculator.total_views || 0;
      const conversionRate = totalViews > 0 ? Math.round((totalLeads / totalViews) * 100) : 0;

      const settings = (calculator.calculator_settings as any) || {};
      const promotions = settings.promotions || {};
      const coupons: any[] = promotions.coupons || [];
      const couponUses = coupons.reduce((sum: number, c: any) => sum + (c.usage_count || 0), 0);

      const { bookings_total, bookings_confirmed, payments_completed } = bookingStats;
      const estimateToBookingPct = totalLeads > 0 ? Math.round((bookings_total / totalLeads) * 100) : 0;
      const bookingToPaymentPct = bookings_total > 0 ? Math.round((payments_completed / bookings_total) * 100) : 0;

      res.json({
        views: totalViews,
        leads: totalLeads,
        conversion_rate: conversionRate,
        avg_quote: avgQuote,
        weekly_trend: weeklyTrend,
        bookings_total,
        bookings_confirmed,
        payments_completed,
        coupon_uses: couponUses,
        estimate_to_booking_pct: estimateToBookingPct,
        booking_to_payment_pct: bookingToPaymentPct,
      });
    } catch (error: any) {
      log.error("Dashboard analytics error:", error);
      res.status(500).json({ error: "Failed to load analytics" });
    }
  });

  app.post("/api/dashboard/track", async (req, res) => {
    try {
      const body = z.object({
        calculator_id: z.number(),
        event_type: z.enum(['view', 'lead', 'quote_generated', 'confidence_tier']),
        metadata: z.object({
          device_type: z.enum(['mobile', 'tablet', 'desktop']).optional(),
          confidence_tier: z.enum(['strong', 'close', 'needs_adjustment']).optional(),
          quote_amount: z.number().optional(),
          user_agent: z.string().optional(),
        }).optional(),
      }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: "Invalid request" });

      await storage.trackEvent({
        calculator_id: body.data.calculator_id,
        event_type: body.data.event_type,
        metadata: body.data.metadata || null,
      });

      if (body.data.event_type === 'view') {
        await storage.incrementViews(body.data.calculator_id);
      }

      res.json({ success: true });
    } catch (error: any) {
      res.json({ success: true });
    }
  });

  app.patch("/api/dashboard/settings", async (req, res) => {
    try {
      const body = z.object({
        token: z.string(),
        notification_email: z.string().optional(),
        auto_republish: z.boolean().optional(),
      }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: "Invalid request" });

      const calculator = await requireCalcByToken(body.data.token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      if (body.data.notification_email !== undefined) {
        await storage.updateCalculator(calculator.id, { owner_email: body.data.notification_email });
      }

      if (body.data.auto_republish !== undefined) {
        await storage.upsertDeploymentStatus({
          calculator_id: calculator.id,
          status: ((calculator.calculator_settings as any)?.publish?.status) || 'draft',
          auto_republish: body.data.auto_republish,
        });
      }

      res.json({ success: true });
    } catch (error: any) {
      log.error("Update settings error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  app.post("/api/dashboard/republish", async (req, res) => {
    try {
      const body = z.object({ token: z.string() }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: "Invalid request" });

      const calculator = await requireCalcByToken(body.data.token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const settings = (calculator.calculator_settings as any) || {};
      const publish = settings.publish || {};

      await storage.updateCalculator(calculator.id, {
        calculator_settings: {
          ...settings,
          publish: {
            ...publish,
            status: 'published',
            published_at: Date.now(),
            last_modified: null,
          },
        },
      });

      await storage.upsertDeploymentStatus({
        calculator_id: calculator.id,
        status: 'live',
        last_published_at: new Date(),
      });

      res.json({ success: true });
    } catch (error: any) {
      log.error("Republish error:", error);
      res.status(500).json({ error: "Failed to republish" });
    }
  });

  // Unpublish: move to draft (not publicly accessible, preview only)
  app.post("/api/dashboard/unpublish", async (req, res) => {
    try {
      const body = z.object({ token: z.string() }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: "Invalid request" });

      const calculator = await requireCalcByToken(body.data.token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const settings = (calculator.calculator_settings as any) || {};
      const publish = settings.publish || {};

      await storage.updateCalculator(calculator.id, {
        calculator_settings: {
          ...settings,
          publish: {
            ...publish,
            status: 'draft',
          },
        },
      });

      await storage.upsertDeploymentStatus({
        calculator_id: calculator.id,
        status: 'draft',
      });

      res.json({ success: true });
    } catch (error: any) {
      log.error("Unpublish error:", error);
      res.status(500).json({ error: "Failed to unpublish" });
    }
  });

  // ============ LEAD UPDATE (status + won_value) ============

  app.patch("/api/dashboard/leads/:id", async (req, res) => {
    try {
      const token = String(req.query.token || req.body.token || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const leadId = parseInt(req.params.id);
      const lead = await storage.getLeadById(leadId);
      if (!lead || lead.calculator_id !== calculator.id) {
        return res.status(404).json({ error: "Lead not found" });
      }

      const body = z.object({
        status: z.enum(['new', 'contacted', 'won', 'lost']).optional(),
        won_value: z.number().int().min(0).nullable().optional(),
      }).safeParse(req.body);

      if (!body.success) {
        return res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      }

      const updates: Record<string, any> = {};
      if (body.data.status !== undefined) {
        updates.status = body.data.status;
        if (body.data.status !== 'new') {
          await storage.cancelFollowupsForLead(leadId);
        }
      }
      if (body.data.won_value !== undefined) {
        updates.won_value = body.data.won_value;
        updates.won_at = body.data.won_value != null ? new Date() : null;
      }

      if (Object.keys(updates).length === 0) {
        return res.json({ success: true, lead });
      }

      const updated = await storage.updateLead(leadId, updates);
      res.json({ success: true, lead: updated });
    } catch (error: any) {
      log.error("Update lead error:", error);
      res.status(500).json({ error: "Failed to update lead" });
    }
  });

  // ============ LEAD STATUS ============

  app.patch("/api/dashboard/leads/:id/status", async (req, res) => {
    try {
      const token = String(req.query.token || req.body.token || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const validStatuses = ['new', 'contacted', 'won', 'lost'];
      const status = String(req.body.status || '');
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be: new, contacted, won, lost" });
      }

      const leadId = parseInt(req.params.id);
      const lead = await storage.getLeadById(leadId);
      if (!lead || lead.calculator_id !== calculator.id) {
        return res.status(404).json({ error: "Lead not found" });
      }

      const updated = await storage.updateLeadStatus(leadId, status);

      if (status !== 'new') {
        await storage.cancelFollowupsForLead(leadId);
      }

      res.json({ success: true, lead: updated });
    } catch (error: any) {
      log.error("Update lead status error:", error);
      res.status(500).json({ error: "Failed to update lead status" });
    }
  });

  // ============ FOLLOWUP SETTINGS ============

  app.get("/api/dashboard/followup", async (req, res) => {
    try {
      const token = String(req.query.token || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const settings = (calculator.calculator_settings as any) || {};
      const followup = settings.followup || {};

      res.json({ followup });
    } catch (error: any) {
      log.error("Get followup settings error:", error);
      res.status(500).json({ error: "Failed to load follow-up settings" });
    }
  });

  app.put("/api/dashboard/followup", async (req, res) => {
    try {
      const body = z.object({
        token: z.string(),
        followup: z.record(z.any()),
      }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: "Invalid request" });

      const calculator = await requireCalcByToken(body.data.token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const settings = (calculator.calculator_settings as any) || {};
      await storage.updateCalculator(calculator.id, {
        calculator_settings: {
          ...settings,
          followup: { ...settings.followup, ...body.data.followup },
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      log.error("Update followup settings error:", error);
      res.status(500).json({ error: "Failed to update follow-up settings" });
    }
  });

  app.post("/api/dashboard/followup/test", async (req, res) => {
    try {
      const body = z.object({
        token: z.string(),
        template_type: z.enum(['thank_you', 'reminder', 'last_call']),
      }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: "Invalid request" });

      const calculator = await requireCalcByToken(body.data.token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      if (!calculator.owner_email) {
        return res.status(400).json({ error: "No business email configured" });
      }

      const settings = (calculator.calculator_settings as any) || {};
      const followup = settings.followup || {};
      const templates = followup.templates || {};
      const personalization = followup.personalization || {};
      const template = templates[body.data.template_type] || {};

      const vars: Record<string, string> = {
        name: 'Test Customer',
        quote_amount: '$500',
        business_name: personalization.business_name || calculator.business_name,
        phone: personalization.phone || '',
        booking_link: personalization.booking_link || '',
        service_area: personalization.service_area || '',
      };

      let subject = template.subject || `Test: ${body.data.template_type}`;
      let emailBody = template.body || 'This is a test message.';
      for (const [key, value] of Object.entries(vars)) {
        subject = subject.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        emailBody = emailBody.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }

      const nodemailer = await import('nodemailer');
      const smtpHost = process.env.SMTP_HOST;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;

      if (!smtpHost || !smtpUser || !smtpPass) {
        return res.json({ success: true, message: "Test email queued (SMTP not configured — would send when configured)" });
      }

      const port = parseInt(process.env.SMTP_PORT || "587", 10);
      const transporter = nodemailer.default.createTransport({
        host: smtpHost, port, secure: port === 465, auth: { user: smtpUser, pass: smtpPass },
      });
      const from = process.env.SMTP_FROM || smtpUser || 'noreply@quickquote.app';
      const htmlBody = emailBody.replace(/\n/g, '<br/>');
      const html = `<!DOCTYPE html><html><body style="font-family:'Inter',Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="padding:28px;font-size:14px;line-height:1.7;color:#333;">${htmlBody}</td></tr>
  <tr><td style="padding:12px 28px;background:#f9fafb;text-align:center;"><p style="font-size:11px;color:#9ca3af;margin:0;">Test email from QuickQuote Follow-Up Autopilot</p></td></tr>
</table></body></html>`;

      try {
        await transporter.sendMail({ from, to: calculator.owner_email!, subject: `[TEST] ${subject}`, html });
      } catch (sendErr: any) {
        return res.json({ success: true, message: `Test email queued (send failed: ${sendErr.message})` });
      }

      res.json({ success: true, message: "Test email queued for delivery" });
    } catch (error: any) {
      log.error("Test followup error:", error);
      res.status(500).json({ error: "Failed to send test" });
    }
  });

  // ============ NOTIFICATION / FOLLOWUP LOGS ============

  app.get("/api/dashboard/notification-logs", async (req, res) => {
    try {
      const token = String(req.query.token || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      const notifications = await storage.getNotificationLogs(calculator.id, 50);
      const followups = await storage.getFollowupLogs(calculator.id, 50);

      res.json({ notifications, followups });
    } catch (error: any) {
      log.error("Get logs error:", error);
      res.status(500).json({ error: "Failed to load logs" });
    }
  });

  app.delete("/api/dashboard/calculator", async (req, res) => {
    try {
      const token = String(req.query.token || '');
      if (!token) return res.status(400).json({ error: "token required" });
      const calculator = await requireCalcByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found or expired" });

      await storage.deleteCalculator(calculator.id);
      res.json({ success: true });
    } catch (error: any) {
      log.error("Delete calculator error:", error);
      res.status(500).json({ error: "Failed to delete calculator" });
    }
  });

  app.patch("/api/dashboard/leads/:leadId/ai-pause", async (req, res) => {
    try {
      const { token } = req.query as { token: string };
      const leadId = parseInt(req.params.leadId);
      const { paused } = z.object({ paused: z.boolean() }).parse(req.body);

      const calculator = await storage.getCalculatorByToken(token);
      if (!calculator) return res.status(404).json({ error: "Calculator not found" });

      await storage.updateLeadAiPaused(leadId, calculator.id, paused);
      res.json({ success: true, ai_paused: paused });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update AI pause status" });
    }
  });
}
