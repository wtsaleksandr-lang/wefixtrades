import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { captureIntakeEvent } from "../services/intakeService";

const createLeadBody = z.object({
  calculator_id: z.number(),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  quote_amount: z.number().nullable().optional(),
  answers: z.record(z.any()).nullable().optional(),
  sms_consent: z.boolean().optional(),
  consent_timestamp: z.string().nullable().optional(),
  consent_text_version: z.string().max(50).nullable().optional(),
  coupon_code: z.string().nullable().optional(),
});

const leadsQuery = z.object({ token: z.string().min(1) });

async function requireCalcByToken(token: string) {
  const calculator = await storage.getCalculatorByToken(token);
  if (!calculator) return null;
  const isExpired = new Date() > new Date(calculator.token_expires_at);
  if (isExpired) return null;
  return calculator;
}

async function enqueueLeadNotificationsAndFollowups(lead: any, calculatorId: number) {
  const allCalcs = await storage.getAllCalculatorsWithEmail();
  const calc = allCalcs.find(c => c.id === calculatorId);
  if (!calc) return;

  const settings = (calc.calculator_settings as any) || {};
  const followup = settings.followup || {};
  const notifications = followup.notifications || {};
  const leadFormSettings = settings.lead_form || {};
  const deliveryEmail = leadFormSettings.delivery?.primary_email || calc.owner_email;

  const devDomain = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '';
  const dashboardUrl = `${devDomain}/Dashboard?token=${calc.edit_token}`;
  const hostedUrl = calc.slug ? `https://${calc.slug}.estimate.ai` : '';

  if (notifications.email_enabled !== false && deliveryEmail) {
    await storage.enqueueNotification({
      calculator_id: calculatorId,
      lead_id: lead.id,
      type: 'email',
      status: 'pending',
      payload: {
        edit_token: calc.edit_token,
        delivery_email: deliveryEmail,
        dashboard_url: dashboardUrl,
        hosted_url: hostedUrl,
      },
    });
  }

  if (notifications.webhook_enabled && notifications.webhook_url) {
    await storage.enqueueNotification({
      calculator_id: calculatorId,
      lead_id: lead.id,
      type: 'webhook',
      status: 'pending',
      payload: {
        webhook_url: notifications.webhook_url,
        webhook_payload: {
          lead_id: lead.id,
          calculator_id: calculatorId,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          quote_value: lead.quote_amount,
          inputs_summary: lead.answers ? Object.entries(lead.answers as Record<string, any>).slice(0, 5) : [],
          created_at: new Date().toISOString(),
        },
      },
    });
  }

  if (followup.enabled) {
    const schedule = followup.schedule || [];
    const templates = followup.templates || {};
    const personalization = followup.personalization || {};
    const channels = followup.channels || { email: true, sms: false };

    const jobsToEnqueue: any[] = [];
    const now = Date.now();

    for (const step of schedule) {
      let offsetMs = 0;
      if (step.offset_minutes) offsetMs = step.offset_minutes * 60 * 1000;
      else if (step.offset_hours) offsetMs = step.offset_hours * 60 * 60 * 1000;
      else if (step.offset_days) offsetMs = step.offset_days * 24 * 60 * 60 * 1000;

      const runAt = new Date(now + offsetMs);
      const template = templates[step.type] || {};

      if (channels.email) {
        jobsToEnqueue.push({
          lead_id: lead.id,
          calculator_id: calculatorId,
          run_at: runAt,
          type: step.type,
          channel: 'email',
          status: 'pending',
          payload: {
            followup_enabled: true,
            template: { subject: template.subject, body: template.body },
            personalization: {
              business_name: personalization.business_name || calc.business_name,
              phone: personalization.phone || calc.owner_phone || '',
              booking_link: personalization.booking_link || '',
              service_area: personalization.service_area || '',
            },
          },
        });
      }

      if (channels.sms && lead.sms_consent) {
        jobsToEnqueue.push({
          lead_id: lead.id,
          calculator_id: calculatorId,
          run_at: runAt,
          type: step.type,
          channel: 'sms',
          status: 'pending',
          payload: {
            followup_enabled: true,
            template: { sms: template.sms },
            personalization: {
              business_name: personalization.business_name || calc.business_name,
              phone: personalization.phone || calc.owner_phone || '',
            },
          },
        });
      }
    }

    if (jobsToEnqueue.length > 0) {
      await storage.enqueueFollowupJobs(jobsToEnqueue);
    }
  }
}

export function registerLeadRoutes(app: Express): void {
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
        status: 'new',
        sms_consent: parsed.data.sms_consent || false,
        consent_timestamp: parsed.data.sms_consent && parsed.data.consent_timestamp
          ? new Date(parsed.data.consent_timestamp)
          : null,
        consent_text_version: parsed.data.sms_consent && parsed.data.consent_text_version
          ? parsed.data.consent_text_version
          : null,
      });

      if (parsed.data.coupon_code) {
        storage.incrementCouponUsage(parsed.data.calculator_id, parsed.data.coupon_code).catch(err => {
          console.error("Failed to increment coupon usage:", err.message);
        });
      }

      storage.trackEvent({
        calculator_id: parsed.data.calculator_id,
        event_type: 'lead',
        metadata: { quote_amount: parsed.data.quote_amount || null },
      }).catch(() => {});

      enqueueLeadNotificationsAndFollowups(lead, parsed.data.calculator_id).catch(err => {
        console.error("Failed to enqueue lead notifications:", err.message);
      });

      captureIntakeEvent({
        sourceType:    'public_form',
        eventType:     'lead.submitted',
        correlationId: `lead-${lead.id}`,
        actorType:     'anonymous',
        entityType:    'lead',
        entityId:      String(lead.id),
        accountId:     parsed.data.calculator_id,
        rawPayload:    req.body,
        context:       { ipAddress: req.ip, userAgent: req.headers['user-agent'] as string | undefined },
      }).catch(() => {});

      res.json({ success: true, lead });
    } catch (error: any) {
      console.error("Create lead error:", error);
      res.status(500).json({ error: "Failed to submit lead" });
    }
  });

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

  // ============ COUPON API ROUTES ============

  app.post("/api/calculators/:slug/coupons/validate", async (req, res) => {
    try {
      const { slug } = req.params;
      const body = z.object({ code: z.string().min(1) }).safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ valid: false, error: 'invalid_request' });
      }

      const calculator = await storage.getCalculatorBySlug(slug);
      if (!calculator) {
        return res.status(404).json({ valid: false, error: 'not_found' });
      }

      const settings = (calculator.calculator_settings as any) || {};
      const promotions = settings.promotions || {};
      const coupons: any[] = promotions.coupons || [];

      const normalizedCode = body.data.code.toUpperCase();
      const coupon = coupons.find((c: any) => c.code.toUpperCase() === normalizedCode);

      if (!coupon) {
        return res.json({ valid: false, error: 'not_found' });
      }

      if (!coupon.active) {
        return res.json({ valid: false, error: 'inactive' });
      }

      if (coupon.expires_at !== null && coupon.expires_at !== undefined && coupon.expires_at < Date.now()) {
        return res.json({ valid: false, error: 'expired' });
      }

      if (coupon.usage_limit !== null && coupon.usage_limit !== undefined && (coupon.usage_count || 0) >= coupon.usage_limit) {
        return res.json({ valid: false, error: 'limit_reached' });
      }

      res.json({
        valid: true,
        coupon: {
          id: coupon.id,
          code: coupon.code,
          type: coupon.type,
          value: coupon.value,
          applies_to: coupon.applies_to || 'estimate_total',
        },
      });
    } catch (error: any) {
      console.error("Coupon validate error:", error);
      res.status(500).json({ valid: false, error: 'server_error' });
    }
  });
}
