/**
 * Review request service — creates and processes review requests.
 * Handles both post-job automatic triggers and manual admin triggers.
 */

import crypto from "crypto";
import { storage } from "../storage";
import { generateGoogleReviewLink, generateFacebookReviewLink } from "../lib/reviewLink";
import { sendReviewRequestEmail } from "../lib/reviewRequestEmail";
import { isTwilioConfigured, sendSmsAsClient, checkRateLimit, storeSmsMessage } from "../twilioClient";
import type { Booking, Calculator, ReviewRequest } from "@shared/schema";

function generateAccessToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

function getBaseUrl(): string {
  return process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "";
}

/**
 * Create a review request after a booking is marked completed.
 * Idempotent — safe to call multiple times for the same booking.
 */
export async function createPostJobReviewRequest(
  booking: Booking,
  calculator: Calculator,
): Promise<{ created: boolean; reason?: string; reviewRequest?: ReviewRequest }> {
  // Need at least email or phone
  if (!booking.customer_email && !booking.customer_phone) {
    return { created: false, reason: "No customer contact info" };
  }

  // Idempotency check
  const idempotencyKey = `booking:${booking.id}`;
  const existing = await storage.findReviewRequestByIdempotencyKey(idempotencyKey);
  if (existing) {
    return { created: false, reason: "Review request already exists" };
  }

  // Resolve client via calculator.user_id → clients.user_id
  let clientId: number | undefined;
  let googlePlaceId: string | null = null;
  let facebookPageUrl: string | null = null;

  if (calculator.user_id) {
    const client = await storage.findClientByUserId(calculator.user_id);
    if (client) {
      clientId = client.id;
      googlePlaceId = client.google_place_id ?? null;
      facebookPageUrl = client.facebook_page_url ?? null;
    }
  }
  if (!clientId) {
    return { created: false, reason: "No linked client found for calculator owner" };
  }

  // ─── Sprint 1 safety rails ─────────────────────────────────────────
  // Honor the same protections we added to the ReputationShield path so
  // the older booking-completion trigger doesn't bypass them. Without
  // these, a suppression list entry / rate cap only blocks the new
  // service-layer path and is silently bypassed here.

  // 1. DNC / suppression list.
  const isSuppressed = await storage.isReviewRequestSuppressed(
    clientId,
    booking.customer_email ?? null,
    booking.customer_phone ?? null,
  );
  if (isSuppressed) {
    return { created: false, reason: "Customer is on the review-request suppression list" };
  }

  // 2. Daily per-client send cap. Same caps as the ReputationShield path.
  const channelGuess: "sms" | "email" = booking.customer_phone ? "sms" : "email";
  const dailyCap = channelGuess === "sms" ? 50 : 200;
  const sentToday = await storage.countReviewRequestSendsToday(clientId, channelGuess);
  if (sentToday >= dailyCap) {
    return { created: false, reason: `Daily ${channelGuess.toUpperCase()} send cap reached (${dailyCap}/day)` };
  }

  // Generate review URLs
  const reviewUrl = generateGoogleReviewLink(googlePlaceId) || "";
  const facebookReviewUrl = generateFacebookReviewLink(facebookPageUrl);

  // Load client settings if available
  let settings: { channel_preference: string; review_request_delay_hours: number } | null = null;
  if (clientId) {
    try {
      const { mergeSettings } = await import("@shared/reputationConfig");
      const svc = await storage.getClientReputationService(clientId);
      if (svc?.metadata?.reputation_settings) {
        settings = mergeSettings(svc.metadata.reputation_settings);
      }
    } catch { /* use defaults */ }
  }

  // Determine channel: "auto" prefers SMS (higher conversion), falls back to email
  const pref = settings?.channel_preference ?? "auto";
  let channel: "email" | "sms";
  if (pref === "sms" && booking.customer_phone) {
    channel = "sms";
  } else if (pref === "email" && booking.customer_email) {
    channel = "email";
  } else if (pref === "auto") {
    // Auto: prefer SMS when phone is available (3-5x better conversion)
    channel = booking.customer_phone ? "sms" : booking.customer_email ? "email" : "email";
  } else {
    channel = booking.customer_email ? "email" : "sms";
  }

  // Schedule with configurable delay
  const delayHours = settings?.review_request_delay_hours ?? 2;
  const runAt = new Date(Date.now() + delayHours * 60 * 60 * 1000);

  const reviewRequest = await storage.createReviewRequest({
    client_id: clientId,
    source_type: "booking",
    source_id: booking.id,
    booking_id: booking.id,
    lead_id: booking.lead_id ?? null,
    customer_name: booking.customer_name,
    customer_email: booking.customer_email ?? null,
    customer_phone: booking.customer_phone ?? null,
    trigger_source: "job_complete",
    channel,
    status: "pending",
    sentiment: null,
    google_place_id: googlePlaceId,
    review_link: reviewUrl,
    review_url: reviewUrl,
    facebook_review_url: facebookReviewUrl ?? null,
    routed_platform: null,
    internal_feedback: null,
    sequence_step: 0,
    run_at: runAt,
    attempts: 0,
    max_attempts: 3,
    payload: {
      business_name: calculator.business_name,
      trade_type: calculator.trade_type,
      booking_date: booking.date,
      calculator_id: calculator.id,
    },
    idempotency_key: idempotencyKey,
    access_token: generateAccessToken(),
    sent_at: null,
    clicked_at: null,
    completed_at: null,
    next_followup_at: null,
    last_error: null,
  });

  return { created: true, reviewRequest };
}

/**
 * Create a manual review request (admin/portal trigger).
 */
export async function createManualReviewRequest(opts: {
  clientId: number;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  channel?: "email" | "sms";
  googlePlaceId?: string;
  jobLabel?: string;
  triggerSource?: string;
}): Promise<{ created: boolean; reason?: string; reviewRequest?: ReviewRequest }> {
  if (!opts.customerEmail && !opts.customerPhone) {
    return { created: false, reason: "No customer contact info" };
  }

  // Idempotency: one per client + contact + date + source
  const dateStr = new Date().toISOString().slice(0, 10);
  const contactKey = opts.customerEmail || opts.customerPhone || "";
  const source = opts.triggerSource || "manual";
  const idempotencyKey = `${source}:${opts.clientId}:${contactKey}:${dateStr}`;

  const existing = await storage.findReviewRequestByIdempotencyKey(idempotencyKey);
  if (existing) {
    return { created: false, reason: "Review request already exists for today" };
  }

  // Resolve review destinations from client
  let googlePlaceId = opts.googlePlaceId ?? null;
  let facebookReviewUrl: string | null = null;
  const client = await storage.getClientById(opts.clientId);
  if (client) {
    if (!googlePlaceId) googlePlaceId = client.google_place_id ?? null;
    facebookReviewUrl = generateFacebookReviewLink(client.facebook_page_url);
  }

  const reviewUrl = generateGoogleReviewLink(googlePlaceId) || "";
  const channel = opts.channel || (opts.customerEmail ? "email" : "sms");

  const reviewRequest = await storage.createReviewRequest({
    client_id: opts.clientId,
    source_type: source,
    source_id: null,
    booking_id: null,
    lead_id: null,
    customer_name: opts.customerName,
    customer_email: opts.customerEmail ?? null,
    customer_phone: opts.customerPhone ?? null,
    trigger_source: source,
    channel,
    status: "pending",
    sentiment: null,
    google_place_id: googlePlaceId,
    review_link: reviewUrl,
    review_url: reviewUrl,
    facebook_review_url: facebookReviewUrl,
    routed_platform: null,
    internal_feedback: null,
    sequence_step: 0,
    run_at: new Date(),
    attempts: 0,
    max_attempts: 3,
    payload: {
      job_label: opts.jobLabel ?? null,
      trigger_source: source,
    },
    idempotency_key: idempotencyKey,
    access_token: generateAccessToken(),
    sent_at: null,
    clicked_at: null,
    completed_at: null,
    next_followup_at: null,
    last_error: null,
  });

  return { created: true, reviewRequest };
}

/**
 * Create a review request from a QR code scan (walk-in, no contact info needed).
 * The customer scans the QR → lands on the sentiment gate page directly.
 * No email/SMS is sent — the "delivery" is the QR scan itself.
 */
export async function createQrReviewRequest(
  clientId: number,
): Promise<ReviewRequest> {
  // Resolve client data
  const client = await storage.getClientById(clientId);
  const googlePlaceId = client?.google_place_id ?? null;
  const reviewUrl = generateGoogleReviewLink(googlePlaceId) || "";
  const facebookReviewUrl = generateFacebookReviewLink(client?.facebook_page_url);

  const reviewRequest = await storage.createReviewRequest({
    client_id: clientId,
    source_type: "qr_scan",
    source_id: null,
    booking_id: null,
    lead_id: null,
    customer_name: null,
    customer_email: null,
    customer_phone: null,
    trigger_source: "qr_scan",
    channel: "qr",
    status: "sent", // Already "delivered" — the customer is on the page
    sentiment: null,
    google_place_id: googlePlaceId,
    review_link: reviewUrl,
    review_url: reviewUrl,
    facebook_review_url: facebookReviewUrl ?? null,
    routed_platform: null,
    internal_feedback: null,
    sequence_step: 0,
    run_at: new Date(),
    sent_at: new Date(),
    attempts: 1,
    max_attempts: 1,
    payload: {
      business_name: client?.business_name ?? null,
      trigger_source: "qr_scan",
    },
    idempotency_key: null, // QR scans are not idempotent — each scan is a new session
    access_token: generateAccessToken(),
    clicked_at: null,
    completed_at: null,
    next_followup_at: null,
    last_error: null,
  });

  return reviewRequest;
}

/**
 * Process (send) a single review request.
 * Handles email and SMS channels, stop conditions, and error tracking.
 */
export async function processReviewRequest(rr: ReviewRequest): Promise<{ sent: boolean; error?: string }> {
  // Stop conditions
  const terminalStatuses = ["completed", "stopped", "routed_positive", "routed_negative", "feedback_captured", "failed"];
  if (terminalStatuses.includes(rr.status)) {
    return { sent: false, error: `Already in terminal status: ${rr.status}` };
  }

  if (rr.status === "sent") {
    return { sent: false, error: "Already sent" };
  }

  const baseUrl = getBaseUrl();

  // Schedule first follow-up 1 day after initial send
  const FIRST_FOLLOWUP_DELAY_MS = 1 * 24 * 60 * 60 * 1000;

  if (rr.channel === "email") {
    const result = await sendReviewRequestEmail(rr, baseUrl);
    if (result.ok) {
      await storage.updateReviewRequest(rr.id, {
        status: "sent",
        sent_at: new Date(),
        attempts: (rr.attempts || 0) + 1,
        next_followup_at: new Date(Date.now() + FIRST_FOLLOWUP_DELAY_MS),
      });
      return { sent: true };
    } else {
      const attempts = (rr.attempts || 0) + 1;
      await storage.updateReviewRequest(rr.id, {
        status: attempts >= (rr.max_attempts || 3) ? "failed" : "pending",
        last_error: result.error,
        attempts,
      });
      return { sent: false, error: result.error };
    }
  }

  if (rr.channel === "sms") {
    if (!isTwilioConfigured()) {
      await storage.updateReviewRequest(rr.id, {
        status: "failed",
        last_error: "Twilio not configured",
        attempts: (rr.attempts || 0) + 1,
      });
      return { sent: false, error: "Twilio not configured" };
    }

    if (!rr.customer_phone) {
      await storage.updateReviewRequest(rr.id, {
        status: "failed",
        last_error: "No phone number",
      });
      return { sent: false, error: "No phone number" };
    }

    // Rate limit check (use booking_id as proxy for lead_id if lead_id missing)
    if (rr.lead_id) {
      const payload = rr.payload as any;
      const calcId = payload?.calculator_id || 0;
      const rateCheck = await checkRateLimit(rr.lead_id, calcId, "sms");
      if (!rateCheck.allowed) {
        await storage.updateReviewRequest(rr.id, {
          last_error: `Rate limit: ${rateCheck.reason}`,
        });
        return { sent: false, error: rateCheck.reason };
      }
    }

    const payload = rr.payload as any;
    const businessName = payload?.business_name || "your service provider";
    const feedbackUrl = `${baseUrl}/review/${rr.access_token}`;
    // Wave 82 — registry-resolved body. Template is per-tenant editable via
    // the portal API (Wave 83 UI). `enabled: false` here means the tenant
    // muted review-request SMS entirely; surface that as a permanent stop.
    const { resolveSmsTemplate } = await import("../lib/smsTemplateResolver");
    const resolved = await resolveSmsTemplate({
      templateId: "reputation.review_request",
      clientId: rr.client_id,
      vars: {
        customer_name: rr.customer_name || "there",
        business_name: businessName,
        feedback_url: feedbackUrl,
      },
    });
    if (!resolved.enabled) {
      await storage.updateReviewRequest(rr.id, {
        status: "stopped",
        last_error: "Disabled by tenant",
      });
      return { sent: false, error: "disabled_by_tenant" };
    }
    const smsBody = resolved.body;

    try {
      // Wave 77 — send from the client's per-tenant TradeLine number so
      // the homeowner sees the trade's own line, and scope opt-out lookups
      // per-client. Falls back to the shared brand line if not provisioned.
      // Wave 79 — homeowner-facing review request is a reminder send;
      // honor the local quiet-hours window. A quiet-hours throw is
      // caught below and surfaced as a defer (no attempt consumed).
      const twilioSid = await sendSmsAsClient({
        clientId: rr.client_id,
        to: rr.customer_phone,
        body: smsBody,
        channel: "sms",
        quietHoursBypass: "reminder",
      });

      if (rr.lead_id) {
        await storeSmsMessage({
          lead_id: rr.lead_id,
          calculator_id: (payload?.calculator_id) || null,
          direction: "outbound",
          channel: "sms",
          body: smsBody,
          to_number: rr.customer_phone,
          twilio_sid: twilioSid,
          is_ai: false,
        });
      }

      await storage.updateReviewRequest(rr.id, {
        status: "sent",
        sent_at: new Date(),
        attempts: (rr.attempts || 0) + 1,
        next_followup_at: new Date(Date.now() + FIRST_FOLLOWUP_DELAY_MS),
      });
      return { sent: true };
    } catch (err: any) {
      // Wave 79 — quiet-hours defer: leave row untouched so the worker
      // retries the row at its next natural cadence.
      if (err?.message === "sms_quiet_hours_blocked") {
        await storage.updateReviewRequest(rr.id, {
          last_error: "Deferred — recipient quiet hours",
        });
        return { sent: false, error: "deferred_quiet_hours" };
      }
      const attempts = (rr.attempts || 0) + 1;
      await storage.updateReviewRequest(rr.id, {
        status: attempts >= (rr.max_attempts || 3) ? "failed" : "pending",
        last_error: err.message,
        attempts,
      });
      return { sent: false, error: err.message };
    }
  }

  return { sent: false, error: `Unknown channel: ${rr.channel}` };
}
