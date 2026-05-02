import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { captureIntakeEvent } from "../services/intakeService";
import { createLogger } from "../lib/logger";

const log = createLogger("Leads");

const createLeadBody = z.object({
  calculator_id: z.number().int().positive(),
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
  // UTM / source attribution
  landing_page: z.string().nullable().optional(),
  referrer: z.string().nullable().optional(),
  utm_source: z.string().nullable().optional(),
  utm_medium: z.string().nullable().optional(),
  utm_campaign: z.string().nullable().optional(),
});

const leadsQuery = z.object({ token: z.string().min(1) });

// Simple in-memory dedup: calculator_id + email/phone → last submit timestamp
const recentSubmissions = new Map<string, number>();
const DEDUP_WINDOW_MS = 10_000; // 10 seconds

function isDuplicateSubmission(calculatorId: number, email: string | null, phone: string | null): boolean {
  const key = `${calculatorId}:${email || ''}:${phone || ''}`;
  const now = Date.now();
  const last = recentSubmissions.get(key);
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  recentSubmissions.set(key, now);
  // Prune old entries periodically
  if (recentSubmissions.size > 5000) {
    for (const [k, v] of recentSubmissions) {
      if (now - v > DEDUP_WINDOW_MS * 2) recentSubmissions.delete(k);
    }
  }
  return false;
}

async function requireCalcByToken(token: string) {
  const calculator = await storage.getCalculatorByToken(token);
  if (!calculator) return null;
  const isExpired = new Date() > new Date(calculator.token_expires_at);
  if (isExpired) return null;
  return calculator;
}

async function enqueueLeadNotificationsAndFollowups(lead: any, calculatorId: number) {
  const calc = await storage.getCalculatorById(calculatorId);
  if (!calc) {
    log.warn(`[leads] Cannot enqueue notifications: calculator ${calculatorId} not found`);
    return;
  }

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

  if (notifications.sms_enabled && calc.owner_phone) {
    await storage.enqueueNotification({
      calculator_id: calculatorId,
      lead_id: lead.id,
      type: 'sms',
      status: 'pending',
      payload: {
        owner_phone: calc.owner_phone,
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
    const schedule = Array.isArray(followup.schedule) ? followup.schedule : [];
    const templates = followup.templates || {};
    const personalization = followup.personalization || {};
    const channels = followup.channels || { email: true, sms: false };

    // Need at least one channel with a reachable contact
    const canEmail = channels.email && lead.email;
    const canSms = channels.sms && lead.sms_consent && lead.phone;

    if (!canEmail && !canSms) {
      // No reachable followup channel — skip silently
      return;
    }

    const jobsToEnqueue: any[] = [];
    const now = Date.now();

    for (const step of schedule) {
      if (!step || !step.type) continue; // skip malformed entries

      let offsetMs = 0;
      if (step.offset_minutes) offsetMs = step.offset_minutes * 60 * 1000;
      else if (step.offset_hours) offsetMs = step.offset_hours * 60 * 60 * 1000;
      else if (step.offset_days) offsetMs = step.offset_days * 24 * 60 * 60 * 1000;

      const runAt = new Date(now + offsetMs);
      const template = templates[step.type] || {};

      if (canEmail) {
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

      if (canSms) {
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

      // Sanitize: trim strings
      const email = (parsed.data.email || '').trim() || null;
      const phone = (parsed.data.phone || '').trim() || null;
      const name = (parsed.data.name || '').trim() || null;
      const company = (parsed.data.company || '').trim() || null;

      // Require at least email or phone
      if (!email && !phone) {
        return res.status(400).json({ error: "Email or phone is required" });
      }

      // Validate email format if provided
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      // Verify calculator exists
      const calculator = await storage.getCalculatorById(parsed.data.calculator_id);
      if (!calculator) {
        return res.status(404).json({ error: "Calculator not found" });
      }

      // Duplicate submission guard
      if (isDuplicateSubmission(parsed.data.calculator_id, email, phone)) {
        return res.status(429).json({ error: "Submission already received. Please wait a moment." });
      }

      // quote_amount: preserve 0 as valid (don't coerce to null)
      const quoteAmount = parsed.data.quote_amount != null ? parsed.data.quote_amount : null;

      // Validate quote_amount is a finite number if present
      if (quoteAmount != null && !Number.isFinite(quoteAmount)) {
        log.warn(`[leads] Non-finite quote_amount=${quoteAmount} for calculator ${parsed.data.calculator_id}, setting to null`);
      }

      const safeQuoteAmount = quoteAmount != null && Number.isFinite(quoteAmount) ? quoteAmount : null;

      const lead = await storage.createLead({
        calculator_id: parsed.data.calculator_id,
        name,
        email,
        phone,
        company,
        quote_amount: safeQuoteAmount,
        answers: parsed.data.answers || null,
        status: 'new',
        sms_consent: parsed.data.sms_consent || false,
        consent_timestamp: parsed.data.sms_consent && parsed.data.consent_timestamp
          ? new Date(parsed.data.consent_timestamp)
          : null,
        consent_text_version: parsed.data.sms_consent && parsed.data.consent_text_version
          ? parsed.data.consent_text_version
          : null,
        // UTM / source attribution
        landing_page: parsed.data.landing_page?.trim() || null,
        referrer: parsed.data.referrer?.trim() || null,
        utm_source: parsed.data.utm_source?.trim() || null,
        utm_medium: parsed.data.utm_medium?.trim() || null,
        utm_campaign: parsed.data.utm_campaign?.trim() || null,
      });

      if (parsed.data.coupon_code) {
        storage.incrementCouponUsage(parsed.data.calculator_id, parsed.data.coupon_code).catch(err => {
          log.error("Failed to increment coupon usage:", err.message);
        });
      }

      storage.trackEvent({
        calculator_id: parsed.data.calculator_id,
        event_type: 'lead',
        metadata: { quote_amount: safeQuoteAmount },
      }).catch(() => {});

      enqueueLeadNotificationsAndFollowups(lead, parsed.data.calculator_id).catch(err => {
        log.error("Failed to enqueue lead notifications:", err.message);
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
      log.error("Create lead error:", error);
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
      log.error("Get leads error:", error);
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
      log.error("Coupon validate error:", error);
      res.status(500).json({ valid: false, error: 'server_error' });
    }
  });
}
