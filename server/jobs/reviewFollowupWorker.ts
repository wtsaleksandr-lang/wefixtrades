/**
 * Review follow-up worker — processes reminder sends for review requests.
 *
 * Sequence:
 *   step 0 → initial request (handled by processReviewRequest at creation time)
 *   step 1 → reminder (1 day after initial send)
 *   step 2 → final reminder (2 days after reminder = 3 days after initial)
 *
 * After step 2 is sent, no more follow-ups are scheduled (sequence complete).
 *
 * Stop conditions checked before every send:
 *   - customer already responded (clicked, routed_positive, routed_negative, feedback_captured)
 *   - request completed/stopped/failed
 *   - no valid contact channel
 */

import { storage } from "../storage";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import {
  buildReminderEmailHtml,
  getReminderSubject,
  getReminderSmsBody,
} from "../lib/reviewRequestEmail";
import { isTwilioConfigured, sendSMS, storeSmsMessage } from "../twilioClient";
import type { ReviewRequest } from "@shared/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("ReviewFollowup");

// Delays between steps (in milliseconds)
const STEP_DELAYS_MS = {
  1: 1 * 24 * 60 * 60 * 1000, // step 0→1: 1 day after initial
  2: 2 * 24 * 60 * 60 * 1000, // step 1→2: 2 days after reminder 1
};

const MAX_SEQUENCE_STEP = 2;

/** Statuses that mean the customer has already engaged — stop all follow-ups. */
const TERMINAL_STATUSES = [
  "clicked", "routed_positive", "routed_negative",
  "feedback_captured", "completed", "stopped", "failed",
];

function getBaseUrl(): string {
  return process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "";
}

async function sendFollowup(rr: ReviewRequest): Promise<{ sent: boolean; error?: string }> {
  // Re-fetch to get latest status (guard against race conditions)
  const fresh = await storage.getReviewRequestById(rr.id);
  if (!fresh) return { sent: false, error: "Review request not found" };

  // Stop condition: terminal status
  if (TERMINAL_STATUSES.includes(fresh.status)) {
    return { sent: false, error: `Terminal status: ${fresh.status}` };
  }

  // Stop condition: client has reminders disabled
  if (fresh.client_id) {
    try {
      const svc = await storage.getClientReputationService(fresh.client_id);
      if (svc?.metadata?.reputation_settings?.reminders_enabled === false) {
        return { sent: false, error: "Reminders disabled by client" };
      }
    } catch { /* proceed if lookup fails */ }
  }

  // Stop condition: sequence already complete
  if (fresh.sequence_step >= MAX_SEQUENCE_STEP) {
    // Mark as completed — we've sent all follow-ups
    await storage.updateReviewRequest(fresh.id, {
      status: "completed",
      completed_at: new Date(),
      next_followup_at: null,
    });
    return { sent: false, error: "Sequence complete" };
  }

  const nextStep = fresh.sequence_step + 1;
  const baseUrl = getBaseUrl();
  const feedbackUrl = `${baseUrl}/review/${fresh.access_token}`;
  const payload = fresh.payload as any;
  const businessName = payload?.business_name || "your service provider";
  const customerName = fresh.customer_name || "there";

  let sendOk = false;
  let sendError: string | undefined;

  // Try email
  if (fresh.channel === "email" && fresh.customer_email) {
    const transporter = getEmailTransporter();
    if (!transporter) {
      sendError = "SMTP not configured";
    } else {
      const html = buildReminderEmailHtml({
        customerName,
        businessName,
        feedbackUrl,
        step: nextStep,
      });
      const subject = getReminderSubject(businessName, nextStep);

      try {
        await transporter.sendMail({
          from: `WeFixTrades <${getFromAddress()}>`,
          to: fresh.customer_email,
          subject,
          html,
        });
        sendOk = true;
      } catch (err: any) {
        sendError = err.message;
      }
    }
  }

  // Try SMS (if email not used or not available)
  if (!sendOk && fresh.channel === "sms" && fresh.customer_phone) {
    if (!isTwilioConfigured()) {
      sendError = sendError || "Twilio not configured";
    } else {
      const smsBody = getReminderSmsBody({
        customerName,
        businessName,
        feedbackUrl,
        step: nextStep,
      });
      try {
        const sid = await sendSMS(fresh.customer_phone, smsBody, "sms");
        if (fresh.lead_id) {
          await storeSmsMessage({
            lead_id: fresh.lead_id,
            calculator_id: (payload?.calculator_id) || null,
            direction: "outbound",
            channel: "sms",
            body: smsBody,
            to_number: fresh.customer_phone,
            twilio_sid: sid,
            is_ai: false,
          });
        }
        sendOk = true;
      } catch (err: any) {
        sendError = err.message;
      }
    }
  }

  if (!sendOk && !sendError) {
    sendError = "No valid contact channel";
  }

  if (sendOk) {
    // Schedule next follow-up or mark sequence done
    const nextNextStep = nextStep + 1;
    const hasMore = nextNextStep <= MAX_SEQUENCE_STEP;
    const nextFollowupAt = hasMore
      ? new Date(Date.now() + (STEP_DELAYS_MS[nextNextStep as keyof typeof STEP_DELAYS_MS] || STEP_DELAYS_MS[2]))
      : null;

    await storage.updateReviewRequest(fresh.id, {
      sequence_step: nextStep,
      status: hasMore ? "sent" : "completed",
      next_followup_at: nextFollowupAt,
      completed_at: hasMore ? null : new Date(),
    });

    return { sent: true };
  }

  // Send failed — increment attempts, maybe mark failed
  const attempts = (fresh.attempts || 0) + 1;
  await storage.updateReviewRequest(fresh.id, {
    last_error: sendError,
    attempts,
    status: attempts >= (fresh.max_attempts || 3) ? "failed" : "sent",
  });

  return { sent: false, error: sendError };
}

/**
 * Main worker function — called by scheduler every minute.
 * Picks up review requests with a due next_followup_at and processes them.
 */
export async function processReviewFollowups(): Promise<{ processed: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;
  let skipped = 0;

  const dueRequests = await storage.fetchDueReviewFollowups(20);
  if (dueRequests.length === 0) return { processed: 0, skipped: 0, errors: [] };

  for (const rr of dueRequests) {
    try {
      const result = await sendFollowup(rr);
      if (result.sent) {
        processed++;
      } else {
        skipped++;
        if (result.error) {
          log.info(`[ReviewFollowup] Skipped #${rr.id}: ${result.error}`);
        }
      }
    } catch (err: any) {
      errors.push(`ReviewFollowup #${rr.id}: ${err.message}`);
      log.error(`[ReviewFollowup] Error #${rr.id}:`, err.message);
    }
  }

  return { processed, skipped, errors };
}
