/**
 * Review request service — creates and processes review requests.
 * Handles both post-job automatic triggers and manual admin triggers.
 */

import crypto from "crypto";
import { storage } from "../storage";
import { generateGoogleReviewLink } from "../lib/reviewLink";
import { sendReviewRequestEmail } from "../lib/reviewRequestEmail";
import { isTwilioConfigured, sendSMS, checkRateLimit, storeSmsMessage } from "../twilioClient";
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

  if (calculator.user_id) {
    const client = await storage.findClientByUserId(calculator.user_id);
    if (client) {
      clientId = client.id;
      googlePlaceId = client.google_place_id ?? null;
    }
  }

  // Generate review URL
  const reviewUrl = generateGoogleReviewLink(googlePlaceId);

  // Determine channel (prefer email, fallback to sms)
  const channel = booking.customer_email ? "email" : "sms";

  // Schedule — send immediately for now (delay can be increased later)
  const runAt = new Date();

  const reviewRequest = await storage.createReviewRequest({
    client_id: clientId ?? null,
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
    review_url: reviewUrl,
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
}): Promise<{ created: boolean; reason?: string; reviewRequest?: ReviewRequest }> {
  if (!opts.customerEmail && !opts.customerPhone) {
    return { created: false, reason: "No customer contact info" };
  }

  // Idempotency: one per client + contact + date
  const dateStr = new Date().toISOString().slice(0, 10);
  const contactKey = opts.customerEmail || opts.customerPhone || "";
  const idempotencyKey = `manual:${opts.clientId}:${contactKey}:${dateStr}`;

  const existing = await storage.findReviewRequestByIdempotencyKey(idempotencyKey);
  if (existing) {
    return { created: false, reason: "Review request already exists for today" };
  }

  // Resolve place_id from client if not provided
  let googlePlaceId = opts.googlePlaceId ?? null;
  if (!googlePlaceId) {
    const client = await storage.getClientById(opts.clientId);
    googlePlaceId = client?.google_place_id ?? null;
  }

  const reviewUrl = generateGoogleReviewLink(googlePlaceId);
  const channel = opts.channel || (opts.customerEmail ? "email" : "sms");

  const reviewRequest = await storage.createReviewRequest({
    client_id: opts.clientId,
    booking_id: null,
    lead_id: null,
    customer_name: opts.customerName,
    customer_email: opts.customerEmail ?? null,
    customer_phone: opts.customerPhone ?? null,
    trigger_source: "manual",
    channel,
    status: "pending",
    sentiment: null,
    google_place_id: googlePlaceId,
    review_url: reviewUrl,
    internal_feedback: null,
    sequence_step: 0,
    run_at: new Date(),
    attempts: 0,
    max_attempts: 3,
    payload: {
      job_label: opts.jobLabel ?? null,
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
    const smsBody = `Hi ${rr.customer_name || "there"}, how was your experience with ${businessName}? Share your feedback: ${feedbackUrl}`;

    try {
      const twilioSid = await sendSMS(rr.customer_phone, smsBody, "sms");

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
