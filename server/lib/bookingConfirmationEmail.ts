/**
 * BookFlow booking confirmation emails.
 *
 * Two emails using the transactional shell:
 * 1. To customer: "Your booking is confirmed"
 * 2. To tradesperson: "New booking received"
 */

import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { createLogger } from "./logger";
import { queueEmail } from "../services/emailQueueService";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { clients } from "@shared/schema";

const log = createLogger("BookFlowEmail");

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatTime(date: Date): string {
  return date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/* ─── Customer Confirmation ─── */

interface CustomerEmailParams {
  customerEmail?: string | null;
  customerName: string;
  businessName: string;
  serviceName?: string | null;
  startTime: Date;
  endTime: Date;
  address?: string | null;
  confirmationMessage?: string;
  slug?: string;
  appointmentId: number;
}

export async function sendBookingConfirmationToCustomer(params: CustomerEmailParams): Promise<void> {
  const transporter = getEmailTransporter();
  if (!transporter || !params.customerEmail) {
    log.debug("Skipping customer email — no transporter or email", {
      hasTransporter: !!transporter,
      hasEmail: !!params.customerEmail,
    });
    return;
  }

  const dateStr = formatDateTime(params.startTime);

  const detailRows: string[] = [];
  detailRows.push(makeRow("Date & Time", dateStr));
  if (params.serviceName) detailRows.push(makeRow("Service", params.serviceName));
  detailRows.push(makeRow("Business", params.businessName));
  if (params.address) detailRows.push(makeRow("Address", params.address));

  const bodyHtml = `
    <div style="background:#0F141A;border:1px solid rgba(255,255,255,0.10);border-radius:10px;padding:18px 16px;margin:0 0 16px;">
      ${detailRows.join("")}
    </div>
    ${params.confirmationMessage
      ? `<p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 8px;">${params.confirmationMessage}</p>`
      : ""
    }
  `;

  const baseUrl = process.env.APP_URL
    || process.env.APP_PUBLIC_URL
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://wefixtrades.com");

  const cancelUrl = params.slug
    ? `${baseUrl}/book/${params.slug}?cancel=${params.appointmentId}`
    : undefined;

  const html = buildTransactionalEmail({
    recipientEmail: params.customerEmail,
    subjectForTitle: "Your Booking is Confirmed",
    headline: "Your booking is confirmed",
    intro: `Hi ${params.customerName}, your appointment has been booked successfully.`,
    bodyHtml,
    ...(cancelUrl
      ? {
          cta: { label: "Need to Cancel?", url: cancelUrl },
          ctaFinePrint: "Click above if you need to cancel or reschedule.",
        }
      : {}),
    supportNote: `Questions? Reply to this email or contact ${params.businessName} directly.`,
  });

  const text = buildPlainText({
    headline: "Your Booking is Confirmed",
    intro: `Hi ${params.customerName}, your appointment has been booked successfully.`,
    bodyText: [
      `Date & Time: ${dateStr}`,
      params.serviceName ? `Service: ${params.serviceName}` : null,
      `Business: ${params.businessName}`,
      params.address ? `Address: ${params.address}` : null,
      params.confirmationMessage ? `\n${params.confirmationMessage}` : null,
    ].filter(Boolean).join("\n"),
    ...(cancelUrl ? { ctaLabel: "Need to cancel?", ctaUrl: cancelUrl } : {}),
  });

  try {
    await queueEmail(params.customerEmail!, `Booking Confirmed — ${params.businessName}`, html, text, { source: "booking_confirmation", entity_type: "appointment", entity_id: params.appointmentId });
    log.info("Queued booking confirmation to customer", { email: params.customerEmail });
  } catch (err: any) {
    log.error("Failed to queue customer confirmation email", { error: err.message });
    throw err;
  }
}

/* ─── Tradesperson Notification ─── */

interface TradespersonEmailParams {
  clientId: number;
  businessName: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  serviceName?: string | null;
  startTime: Date;
  endTime: Date;
  address?: string | null;
  notes?: string | null;
}

export async function sendBookingNotificationToTradesperson(params: TradespersonEmailParams): Promise<void> {
  const [client] = await db
    .select({
      contact_email: clients.contact_email,
      contact_phone: clients.contact_phone,
    })
    .from(clients)
    .where(eq(clients.id, params.clientId))
    .limit(1);

  if (!client) {
    log.warn("Client not found for tradesperson notification", { clientId: params.clientId });
    return;
  }

  const dateStr = formatDateTime(params.startTime);

  // Send email notification
  const transporter = getEmailTransporter();
  if (transporter && client.contact_email) {
    const detailRows: string[] = [];
    detailRows.push(makeRow("Customer", params.customerName));
    if (params.customerPhone) detailRows.push(makeRow("Phone", params.customerPhone));
    if (params.customerEmail) detailRows.push(makeRow("Email", params.customerEmail));
    if (params.serviceName) detailRows.push(makeRow("Service", params.serviceName));
    detailRows.push(makeRow("Date & Time", dateStr));
    if (params.address) detailRows.push(makeRow("Address", params.address));
    if (params.notes) detailRows.push(makeRow("Notes", params.notes));

    const bodyHtml = `
      <div style="background:#0F141A;border:1px solid rgba(255,255,255,0.10);border-radius:10px;padding:18px 16px;margin:0 0 16px;">
        ${detailRows.join("")}
      </div>
    `;

    const html = buildTransactionalEmail({
      recipientEmail: client.contact_email,
      subjectForTitle: "New Booking Received",
      eyebrow: "New Booking",
      headline: `${params.customerName} booked an appointment`,
      bodyHtml,
      supportNote: "This is an automated notification from BookFlow.",
    });

    const text = buildPlainText({
      headline: "New Booking Received",
      bodyText: [
        `Customer: ${params.customerName}`,
        params.customerPhone ? `Phone: ${params.customerPhone}` : null,
        params.customerEmail ? `Email: ${params.customerEmail}` : null,
        params.serviceName ? `Service: ${params.serviceName}` : null,
        `Date & Time: ${dateStr}`,
        params.address ? `Address: ${params.address}` : null,
        params.notes ? `Notes: ${params.notes}` : null,
      ].filter(Boolean).join("\n"),
    });

    try {
      await transporter.sendMail({
        from: getFromAddress(),
        to: client.contact_email,
        subject: `New Booking — ${params.customerName}`,
        html,
        text,
      });
      log.info("Sent booking notification to tradesperson", { email: client.contact_email });
    } catch (err: any) {
      log.error("Failed to send tradesperson notification email", { error: err.message });
    }
  }

  // SMS notification via Twilio (if configured and phone available)
  if (client.contact_phone && process.env.TWILIO_ACCOUNT_SID) {
    try {
      const twilio = await import("twilio");
      const twilioClient = twilio.default(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN,
      );

      const smsBody = [
        `New booking: ${params.customerName}`,
        params.serviceName ? `Service: ${params.serviceName}` : null,
        `When: ${dateStr}`,
        params.customerPhone ? `Phone: ${params.customerPhone}` : null,
        params.address ? `Address: ${params.address}` : null,
      ].filter(Boolean).join("\n");

      await twilioClient.messages.create({
        body: smsBody,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: client.contact_phone,
      });

      log.info("Sent booking SMS to tradesperson", { phone: client.contact_phone });
    } catch (err: any) {
      log.error("Failed to send tradesperson SMS", { error: err.message });
    }
  }
}

/* ─── Helpers ─── */

function makeRow(label: string, value: string): string {
  return `<div style="margin:0 0 10px;">
    <span style="font-size:11px;font-weight:700;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;">${label}</span><br/>
    <span style="font-size:14px;color:#F0F0F0;">${value}</span>
  </div>`;
}
