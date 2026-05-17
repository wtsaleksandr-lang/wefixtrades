/**
 * Review request automation service.
 *
 * Sends polite review requests to customers after completed bookings/jobs.
 * Uses existing SMS (Twilio) and email (SMTP) infrastructure.
 *
 * Flow:
 *   1. Scan completed bookings → create pending review requests
 *   2. Worker processes pending requests at scheduled time
 *   3. Send via SMS (preferred) or email (fallback)
 *   4. Track delivery and prevent duplicates
 */
import { storage } from "../../storage";
import { logSmsCost, logEmailCost } from "../socialSync/costTracker";
import nodemailer from "nodemailer";
import type { ReviewRequest } from "@shared/schema";

/* ─── Config ─── */

/** Delay after job completion before sending review request. */
const REQUEST_DELAY_HOURS = 24;

/** Don't send to same customer within this window. */
const CUSTOMER_COOLDOWN_DAYS = 60;

/* ─── Review Link ─── */

/**
 * Get the Google review link for a client.
 * Stored in the GBP connection metadata or SocialSync profile metadata.
 */
export async function getReviewLink(clientId: number): Promise<string | null> {
  const connections = await storage.listSocialSyncConnections(clientId);
  const gbp = connections.find(c => c.platform === "google_business" && c.external_page_id);
  if (!gbp) return null;

  const metadata = (gbp.metadata as any) || {};
  // 1. Explicit manual review link (highest priority)
  if (metadata.review_link) return metadata.review_link;

  // 2. Derived from place_id
  if (metadata.place_id) {
    return `https://search.google.com/local/writereview?placeid=${metadata.place_id}`;
  }

  return null;
}

/**
 * Get detailed review link configuration state.
 */
export async function getReviewLinkConfig(clientId: number): Promise<{
  effective_link: string | null;
  source: "manual" | "derived" | "missing";
  manual_link: string | null;
  place_id: string | null;
  gbp_connected: boolean;
  location_name: string | null;
}> {
  const connections = await storage.listSocialSyncConnections(clientId);
  const gbp = connections.find(c => c.platform === "google_business");
  const metadata = (gbp?.metadata as any) || {};

  const manualLink = metadata.review_link || null;
  const placeId = metadata.place_id || null;
  const gbpConnected = gbp?.connection_status === "connected" || gbp?.connection_status === "expiring_soon";
  const locationName = metadata.selected_location?.title || null;

  let effectiveLink: string | null = null;
  let source: "manual" | "derived" | "missing" = "missing";

  if (manualLink) {
    effectiveLink = manualLink;
    source = "manual";
  } else if (placeId) {
    effectiveLink = `https://search.google.com/local/writereview?placeid=${placeId}`;
    source = "derived";
  }

  return { effective_link: effectiveLink, source, manual_link: manualLink, place_id: placeId, gbp_connected: gbpConnected, location_name: locationName };
}

/**
 * Update review link configuration.
 */
export async function updateReviewLinkConfig(
  clientId: number,
  updates: { review_link?: string | null; place_id?: string | null },
): Promise<void> {
  const connections = await storage.listSocialSyncConnections(clientId);
  const gbp = connections.find(c => c.platform === "google_business");
  if (!gbp) throw new Error("No Google Business connection found. Connect GBP first.");

  const metadata = (gbp.metadata as any) || {};

  if (updates.review_link !== undefined) {
    metadata.review_link = updates.review_link || null;
    metadata.review_link_updated_at = new Date().toISOString();
  }
  if (updates.place_id !== undefined) {
    metadata.place_id = updates.place_id || null;
  }

  await storage.upsertSocialSyncConnection({
    ...gbp,
    metadata,
  } as any);
}

/**
 * Validate a review link URL.
 */
export function validateReviewLink(url: string): { valid: boolean; error?: string } {
  if (!url || typeof url !== "string" || url.trim().length === 0) {
    return { valid: false, error: "Review link is empty" };
  }

  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { valid: false, error: "Link must use https:// or http://" };
    }
    // Check it looks like a Google review link
    const isGoogleReview = parsed.hostname.includes("google.com") || parsed.hostname.includes("g.page");
    if (!isGoogleReview) {
      return { valid: false, error: "Link does not appear to be a Google review URL. Expected google.com or g.page domain." };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

/* ─── Message Templates ─── */

function buildSmsMessage(customerName: string, businessName: string, reviewLink: string): string {
  const first = customerName.split(" ")[0] || "there";
  return `Hi ${first}! Thanks for choosing ${businessName}. If you were happy with our work, a quick Google review would mean a lot to us: ${reviewLink}`;
}

function buildEmailHtml(customerName: string, businessName: string, reviewLink: string): string {
  const first = customerName.split(" ")[0] || "there";
  return `<!DOCTYPE html>
<html><body style="font-family:'Inter',Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="padding:20px 24px;background:#0d3cfc;">
    <h1 style="color:#fff;font-size:16px;margin:0;">${businessName}</h1>
  </td></tr>
  <tr><td style="padding:24px;">
    <p style="font-size:14px;color:#333;margin:0 0 16px;">Hi ${first},</p>
    <p style="font-size:14px;color:#333;margin:0 0 16px;">Thanks for choosing us! We hope you were happy with our work.</p>
    <p style="font-size:14px;color:#333;margin:0 0 20px;">If you have a moment, a quick Google review would really help our small business. It only takes a minute:</p>
    <div style="text-align:center;margin:0 0 20px;">
      <a href="${reviewLink}" style="display:inline-block;background:#0d3cfc;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Leave a Review</a>
    </div>
    <p style="font-size:13px;color:#888;margin:0;">Thank you for your support!</p>
  </td></tr>
  <tr><td style="padding:12px 24px;background:#f9fafb;text-align:center;">
    <p style="font-size:10px;color:#9ca3af;margin:0;">${businessName} — We appreciate your business</p>
  </td></tr>
</table>
</body></html>`;
}

/* ─── SMS Delivery ─── */

async function sendSms(phone: string, message: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  try {
    const { sendSMS, isTwilioConfigured } = await import("../../twilioClient");
    if (!isTwilioConfigured()) return { success: false, error: "Twilio not configured" };
    const sid = await sendSMS(phone, message, "sms");
    return { success: true, sid };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/* ─── Email Delivery ─── */

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

async function sendEmail(
  to: string, businessName: string, customerName: string, reviewLink: string,
): Promise<{ success: boolean; error?: string }> {
  const mailer = getTransporter();
  if (!mailer) return { success: false, error: "SMTP not configured" };

  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@wefixtrades.com";
    await mailer.sendMail({
      from,
      to,
      subject: `How was your experience with ${businessName}?`,
      html: buildEmailHtml(customerName, businessName, reviewLink),
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/* ─── Eligibility Check ─── */

function buildDedupKey(clientId: number, sourceType: string, sourceId: number): string {
  return `rr:${clientId}:${sourceType}:${sourceId}`;
}

/**
 * Per-client daily review-request send caps. Tuned to keep Twilio/SendGrid
 * cost predictable per ReputationShield seat — a single misbehaving caller
 * to `enqueueFromBooking` cannot blow up the bill. Counts are taken over
 * "sent + delivered" rows whose `sent_at` falls on the current UTC day.
 */
const DAILY_SEND_CAP_SMS = 50;
const DAILY_SEND_CAP_EMAIL = 200;

async function isEligible(
  clientId: number, customerPhone: string | null, customerEmail: string | null, dedupKey: string,
): Promise<{ eligible: boolean; reason?: string }> {
  // Must have at least one contact channel — check first, cheap & most common bail.
  if (!customerPhone && !customerEmail) {
    return { eligible: false, reason: "No phone or email available" };
  }

  // 1. DNC / suppression list — single indexed lookup, fail fast.
  const suppressed = await storage.isReviewRequestSuppressed(clientId, customerEmail, customerPhone);
  if (suppressed) {
    return { eligible: false, reason: "Customer is on the review-request suppression list" };
  }

  // 2. Daily send cap — protects against runaway cost from caller bugs.
  const channel = customerPhone ? "sms" : "email";
  const sentToday = await storage.countReviewRequestSendsToday(clientId, channel);
  const cap = channel === "sms" ? DAILY_SEND_CAP_SMS : DAILY_SEND_CAP_EMAIL;
  if (sentToday >= cap) {
    return { eligible: false, reason: `Daily ${channel.toUpperCase()} send cap reached (${cap}/day)` };
  }

  // 3. Dedup against same source (booking/lead).
  const existing = await storage.getReviewRequestByDedupKey(dedupKey);
  if (existing && existing.status !== "failed") {
    return { eligible: false, reason: "Review request already sent for this job" };
  }

  // 4. Customer cooldown (same phone/email in recent window).
  if (customerPhone || customerEmail) {
    const recent = await storage.listReviewRequests(clientId, 100);
    const cutoff = Date.now() - CUSTOMER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    const recentForCustomer = recent.filter(r => {
      if (!r.sent_at || new Date(r.sent_at).getTime() < cutoff) return false;
      if (customerPhone && r.customer_phone === customerPhone) return true;
      if (customerEmail && r.customer_email === customerEmail) return true;
      return false;
    });

    if (recentForCustomer.length > 0) {
      return { eligible: false, reason: `Customer already received request within ${CUSTOMER_COOLDOWN_DAYS} days` };
    }
  }

  return { eligible: true };
}

/* ─── Enqueue from Completed Booking ─── */

export async function enqueueFromBooking(
  clientId: number,
  bookingId: number,
  customerName: string,
  customerPhone: string | null,
  customerEmail: string | null,
): Promise<{ enqueued: boolean; reason?: string }> {
  const reviewLink = await getReviewLink(clientId);
  if (!reviewLink) {
    return { enqueued: false, reason: "No review link configured for this client" };
  }

  const dedupKey = buildDedupKey(clientId, "booking", bookingId);
  const { eligible, reason } = await isEligible(clientId, customerPhone, customerEmail, dedupKey);
  if (!eligible) return { enqueued: false, reason };

  // Determine channel: prefer SMS if phone available
  const channel = customerPhone ? "sms" : "email";
  const runAt = new Date(Date.now() + REQUEST_DELAY_HOURS * 60 * 60 * 1000);

  // Get business name
  const client = await storage.getClientById(clientId);
  const businessName = client?.business_name || "our team";

  // Build message
  const messageText = channel === "sms"
    ? buildSmsMessage(customerName, businessName, reviewLink)
    : `Review request email for ${customerName}`;

  await storage.createReviewRequest({
    client_id: clientId,
    source_type: "booking",
    source_id: bookingId,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail,
    channel,
    status: "pending",
    review_link: reviewLink,
    message_text: messageText,
    run_at: runAt,
    dedup_key: dedupKey,
    attempts: 0,
    max_attempts: 2,
  } as any);

  return { enqueued: true };
}

/* ─── Process Pending Requests ─── */

export interface ProcessResult {
  processed: number;
  sent: number;
  failed: number;
  errors: string[];
}

export async function processReviewRequests(): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, sent: 0, failed: 0, errors: [] };

  const due = await storage.fetchDueReviewRequests(20);
  if (due.length === 0) return result;

  for (const req of due) {
    result.processed++;
    const client = await storage.getClientById(req.client_id);
    const businessName = client?.business_name || "our team";

    try {
      if (req.channel === "sms" && req.customer_phone) {
        const message = req.message_text || buildSmsMessage(req.customer_name || "there", businessName, req.review_link);
        const smsResult = await sendSms(req.customer_phone, message);

        if (smsResult.success) {
          logSmsCost(req.client_id).catch(() => {});
          await storage.updateReviewRequest(req.id, {
            status: "sent",
            sent_at: new Date(),
            delivery_result: { channel: "sms", sid: smsResult.sid },
            attempts: (req.attempts || 0) + 1,
          });
          result.sent++;
        } else {
          await handleFailure(req, smsResult.error || "SMS send failed");
          result.failed++;
          result.errors.push(`Request ${req.id}: SMS failed: ${smsResult.error}`);
        }
      } else if (req.channel === "email" && req.customer_email) {
        const emailResult = await sendEmail(req.customer_email, businessName, req.customer_name || "there", req.review_link);

        if (emailResult.success) {
          logEmailCost(req.client_id, "Review request email").catch(() => {});
          await storage.updateReviewRequest(req.id, {
            status: "sent",
            sent_at: new Date(),
            delivery_result: { channel: "email" },
            attempts: (req.attempts || 0) + 1,
          });
          result.sent++;
        } else {
          await handleFailure(req, emailResult.error || "Email send failed");
          result.failed++;
          result.errors.push(`Request ${req.id}: Email failed: ${emailResult.error}`);
        }
      } else {
        await storage.updateReviewRequest(req.id, {
          status: "skipped",
          failure_reason: "No valid contact for selected channel",
          attempts: (req.attempts || 0) + 1,
        });
      }
    } catch (err: any) {
      await handleFailure(req, err.message);
      result.failed++;
      result.errors.push(`Request ${req.id}: ${err.message}`);
    }
  }

  return result;
}

async function handleFailure(req: ReviewRequest, error: string): Promise<void> {
  const attempts = (req.attempts || 0) + 1;
  if (attempts >= (req.max_attempts || 2)) {
    await storage.updateReviewRequest(req.id, { status: "failed", failure_reason: error, attempts });
  } else {
    await storage.updateReviewRequest(req.id, { status: "pending", failure_reason: error, attempts });
  }
}

/* ─── Batch Scan for Completed Bookings ─── */

export async function scanCompletedBookings(): Promise<{ scanned: number; enqueued: number; errors: string[] }> {
  const result = { scanned: 0, enqueued: 0, errors: [] as string[] };

  // Get all enabled profiles
  const profiles = await storage.listEnabledSocialSyncProfiles();

  for (const profile of profiles) {
    // Check if client has a review link (GBP connected with location)
    const reviewLink = await getReviewLink(profile.client_id);
    if (!reviewLink) continue;

    // Get client's completed bookings
    // Note: bookings are linked via calculators, not directly to clients.
    // For now, we rely on manual enqueue or future booking-completion hooks.
    // This batch scan is a placeholder for when booking→client mapping exists.
  }

  return result;
}
