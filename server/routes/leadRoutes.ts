import type { Express, Request } from "express";
import { z } from "zod";
import { createHash } from "node:crypto";
import * as Sentry from "@sentry/node";
import { storage } from "../storage";
import { captureIntakeEvent } from "../services/intakeService";
import { buildHostedUrl } from "@shared/slugUtils";
import { createLogger } from "../lib/logger";
import { noisyCatch } from "../lib/silentFailureGuard";
import { emitApiWebhookEvent } from "../services/apiWebhookDispatcher";
import {
  leadsSubmissionRateLimiter,
  leadsIpRateLimiter,
  LEADS_RATE_LIMIT_WINDOW_MS,
} from "../services/rateLimiter";
import { sendQuoteReadySms } from "../services/quotequickHomeownerSmsService";

const log = createLogger("Leads");

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.ip
    || "unknown";
}

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
  // Wave 79 — TCPA audit trail. Client-supplied URL the homeowner was on
  // when they consented. IP hash + user-agent are computed/captured by
  // the server below (never trust the client for those).
  consent_url: z.string().max(500).nullable().optional(),
  consent_method: z
    .enum(["web_form", "sms_keyword", "phone_call", "paper"])
    .nullable()
    .optional(),
  coupon_code: z.string().nullable().optional(),
  // UTM / source attribution
  landing_page: z.string().nullable().optional(),
  referrer: z.string().nullable().optional(),
  utm_source: z.string().nullable().optional(),
  utm_medium: z.string().nullable().optional(),
  utm_campaign: z.string().nullable().optional(),
  // Honeypot — bots tend to fill every visible field; humans never see this
  // (rendered off-screen with tabIndex={-1}). Server rejects silently when
  // non-empty. Loose schema so a string OR null OR omitted all work.
  company_site: z.string().nullable().optional(),
});

const leadsQuery = z.object({ token: z.string().min(1) });

/**
 * Simple in-memory dedup: calculator_id + email/phone → last submit timestamp.
 *
 * MULTI-POD GAP (PR #724 P1): this Map is per-process. A multi-pod deploy
 * lets a duplicate submission slip through if it lands on a different pod
 * than the first. Today we run single-pod on Replit, but if/when we scale
 * out the dedup MUST move to Redis (24h TTL via SET NX EX), gated on
 * `process.env.REDIS_URL`. The `rateLimiter.ts` module already documents
 * the same Redis migration pattern.
 *
 * Until then, we emit a Sentry warning the first time a single pod's dedup
 * map crosses 100 live entries — that's the early signal that traffic has
 * scaled past what an in-memory Map can safely cover.
 */
const recentSubmissions = new Map<string, number>();
const DEDUP_WINDOW_MS = 10_000; // 10 seconds
const DEDUP_MAP_WARN_THRESHOLD = 100;
let dedupWarnEmitted = false;

function isDuplicateSubmission(calculatorId: number, email: string | null, phone: string | null): boolean {
  const key = `${calculatorId}:${email || ''}:${phone || ''}`;
  const now = Date.now();
  const last = recentSubmissions.get(key);
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  recentSubmissions.set(key, now);

  // Early-warning signal: in-memory dedup is reaching scale where multi-pod
  // gap becomes a real concern. Fire once per process to avoid noise.
  if (!dedupWarnEmitted && recentSubmissions.size > DEDUP_MAP_WARN_THRESHOLD) {
    dedupWarnEmitted = true;
    try {
      Sentry.captureMessage(
        `[leads] in-memory dedup Map exceeded ${DEDUP_MAP_WARN_THRESHOLD} entries — multi-pod deploy would bypass dedup. Migrate to Redis (set REDIS_URL).`,
        "warning",
      );
    } catch {
      // Sentry not initialised in some test envs — fall back to logger
      log.warn(`[leads] dedup Map size=${recentSubmissions.size} crossed warn threshold`);
    }
  }

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
  const hostedUrl = calc.slug ? buildHostedUrl(calc.slug) : '';

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

      // ── Honeypot ──────────────────────────────────────────────────────────
      // Bots tend to fill every field; legit users never see `company_site`.
      // Return 200 with a success-looking shape so the bot doesn't learn the
      // trap exists, but skip every side-effect (no DB write, no follow-ups,
      // no analytics, no webhook). Note this happens BEFORE the rate-limit
      // checks so honeypot hits don't even count toward the limiter buckets.
      const honeypot = (parsed.data.company_site || '').trim();
      if (honeypot) {
        log.warn(`[leads] honeypot triggered ip=${getClientIp(req)} calc=${parsed.data.calculator_id} len=${honeypot.length}`);
        return res.json({ success: true, lead: { id: 0 } });
      }

      // ── Rate limit ────────────────────────────────────────────────────────
      // Two layers: per-IP + per-calculator (20/hr) AND per-IP overall
      // (60/hr) to catch a bot rotating calculator_ids from one source.
      const clientIp = getClientIp(req);
      const calcKey = `leads:${clientIp}:${parsed.data.calculator_id}`;
      const ipKey = `leads:ip:${clientIp}`;
      const calcOk = await leadsSubmissionRateLimiter.check(calcKey);
      const ipOk = await leadsIpRateLimiter.check(ipKey);
      if (!calcOk || !ipOk) {
        res.setHeader("Retry-After", String(Math.ceil(LEADS_RATE_LIMIT_WINDOW_MS / 1000)));
        return res.status(429).json({
          error: "Too many submissions from this source. Please try again later.",
        });
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

      // Wave 79 — TCPA audit trail. Capture immutable context at the moment
      // of consent so we can defend a future challenge: which URL the
      // homeowner consented on, a SHA-256 of their IP (privacy-preserving
      // — enough to correlate with access logs without storing raw PII),
      // and a truncated user-agent. Only populated when sms_consent=true;
      // a row without SMS consent doesn't need audit metadata.
      const consentHasContext = !!parsed.data.sms_consent;
      const rawIp = consentHasContext ? getClientIp(req) : null;
      const consentIpHash = rawIp && rawIp !== "unknown"
        ? createHash("sha256").update(rawIp).digest("hex")
        : null;
      const rawUserAgent = consentHasContext
        ? (req.headers["user-agent"] as string | undefined) ?? null
        : null;
      const consentUserAgent = rawUserAgent
        ? rawUserAgent.slice(0, 200)
        : null;
      const consentUrl = consentHasContext
        ? (parsed.data.consent_url?.trim() || parsed.data.landing_page?.trim() || null)
        : null;
      const consentMethod = consentHasContext
        ? (parsed.data.consent_method ?? "web_form")
        : null;

      // Wave 81 — quote_expires_at drives the expires-soon SMS reminder
      // worker. TTL is per-calculator configurable via
      // settings.appearance.quote.ttl_days; default 7 days. Computed at
      // submission time so legacy rows (pre-Wave-81) stay NULL and never
      // trigger a spurious reminder.
      const calcSettings = (calculator.calculator_settings as any) || {};
      const ttlDaysRaw = Number(calcSettings.appearance?.quote?.ttl_days);
      const ttlDays =
        Number.isFinite(ttlDaysRaw) && ttlDaysRaw > 0 && ttlDaysRaw <= 90
          ? ttlDaysRaw
          : 7;
      const quoteExpiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

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
        // Wave 79 — TCPA audit trail fields. Forward-only; pre-existing
        // rows remain NULL on these columns.
        consent_url: consentUrl,
        consent_ip_hash: consentIpHash,
        consent_user_agent: consentUserAgent,
        consent_method: consentMethod,
        // Wave 81 — QuoteQuick homeowner SMS expiry tracking.
        quote_expires_at: quoteExpiresAt,
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

      // Wave 109 — noisyCatch so the lead-event analytics row reaches
      // the dashboards or surfaces in Sentry on failure.
      noisyCatch(storage.trackEvent({
        calculator_id: parsed.data.calculator_id,
        event_type: 'lead',
        metadata: { quote_amount: safeQuoteAmount },
      }), {
        op: "lead.trackEvent.created",
        meta: { calculatorId: parsed.data.calculator_id, leadId: lead.id, quoteAmount: safeQuoteAmount },
      });

      enqueueLeadNotificationsAndFollowups(lead, parsed.data.calculator_id).catch(err => {
        log.error("Failed to enqueue lead notifications:", err.message);
      });

      // Wave 81 — homeowner quote-ready SMS. Transactional (the homeowner
      // JUST clicked Submit), so quiet hours are bypassed. Fire-and-forget
      // with a stamp on success; if the send defers (quiet hours) or
      // fails, leads.quote_ready_sent_at stays NULL — but we deliberately
      // do NOT re-attempt later. Quote-ready is "right now or never";
      // the homeowner's expectation is an immediate acknowledgment, not
      // a delayed one. expires-soon + post-job handle the later
      // touchpoints.
      if (lead.phone && lead.sms_consent && safeQuoteAmount != null) {
        sendQuoteReadySms({
          leadId: lead.id,
          calculatorId: parsed.data.calculator_id,
          phone: lead.phone,
          quoteAmountDollars: safeQuoteAmount,
          smsConsent: !!lead.sms_consent,
        })
          .then((result) => {
            if (result.ok) {
              storage
                .updateLead(lead.id, { quote_ready_sent_at: new Date() })
                .catch((err: any) =>
                  log.warn("[quote-ready] stamp failed", { error: err?.message, leadId: lead.id }),
                );
            } else if (result.reason === "no_consent") {
              // Permanent — homeowner is opted out. Stamp so we don't
              // retry from any future code path that re-checks this row.
              // Wave 109 — noisyCatch so a stamp-write failure is logged
              // instead of leaving a no-consent lead at risk of repeated
              // re-attempts on each future code-path visit.
              noisyCatch(
                storage.updateLead(lead.id, { quote_ready_sent_at: new Date() }),
                { op: "lead.stampNoConsent", meta: { leadId: lead.id } },
              );
            }
          })
          .catch((err: any) =>
            log.error("[quote-ready] send threw unexpectedly", { error: err?.message, leadId: lead.id }),
          );
      }

      // Wave AQ-3 — emit a webhook event for any API-platform user who
      // owns this calculator AND subscribes to `submission.created`. The
      // dispatcher is a no-op when the calc has no user_id (anonymous
      // portal calculators) or the user has no matching subscription.
      storage.getCalculatorById(parsed.data.calculator_id)
        .then((calc) => {
          if (!calc || calc.user_id == null) return;
          void emitApiWebhookEvent({
            userId: calc.user_id,
            type: "submission.created",
            data: {
              id: lead.id,
              calculator_id: lead.calculator_id,
              name: lead.name,
              email: lead.email,
              phone: lead.phone,
              company: lead.company,
              quote_amount: lead.quote_amount,
              answers: lead.answers,
              status: lead.status,
              created_at: (lead as any).created_date,
              source: "portal",
            },
          });
        })
        .catch((err) => log.warn("Webhook emit lookup failed", { error: err?.message }));

      // Wave 92: captureIntakeEvent feeds the audit trail. Previously a
      // `.catch(() => {})` swallowed write failures so lead-source attribution
      // would silently miss entries when intake_events had any DB pressure.
      noisyCatch(
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
        }),
        { op: "intake.lead.submitted", meta: { lead_id: lead.id, calculator_id: parsed.data.calculator_id } },
      );

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
