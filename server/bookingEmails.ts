import nodemailer from "nodemailer";
import type { Booking, Calculator } from "@shared/schema";
import { getEmailTransporter, getFromAddress } from "./lib/emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./lib/transactionalShell";

/**
 * Standalone transporter for the BUSINESS notification (out of scope for
 * Sprint 2C cleanup — it's an admin-style internal notification to the
 * calculator owner, scheduled for Sprint 2D admin-shell migration).
 */
function getLegacyBusinessTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  return date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export async function sendBookingConfirmationToCustomer(booking: Booking, calculator: Calculator): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter || !booking.customer_email) return false;

  const businessName = calculator.business_name;
  const dateDisplay = formatDate(booking.date);
  const timeDisplay = formatTime(booking.time);
  const quoteDisplay = booking.quote_amount ? `$${booking.quote_amount}` : "";
  const depositDisplay = booking.deposit_amount ? `$${booking.deposit_amount}` : "";

  const detailRow = (label: string, value: string, valueColor?: string) => `
    <tr>
      <td style="padding:6px 0;font-size:12px;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;width:120px;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:${valueColor || "#F0F0F0"};font-weight:600;text-align:right;">${value}</td>
    </tr>`;

  const html = buildTransactionalEmail({
    recipientEmail: booking.customer_email,
    subjectForTitle: `Booking Confirmed — ${dateDisplay} at ${timeDisplay}`,
    eyebrow: "Booking confirmed",
    headline: "Your appointment is set",
    intro: `Your appointment with <strong style="color:#F0F0F0;">${businessName}</strong> has been confirmed.`,
    bodyHtml: `
      <table style="width:100%;border-collapse:collapse;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 14px;">
        ${detailRow("Date", dateDisplay)}
        ${detailRow("Time", timeDisplay)}
        ${quoteDisplay ? detailRow("Estimated quote", quoteDisplay) : ""}
        ${booking.deposit_paid && depositDisplay ? detailRow("Deposit paid", depositDisplay, "#66E8FA") : ""}
      </table>`,
    supportNote: `If you need to reschedule or cancel, please contact <strong style="color:#CDD1D6;font-weight:600;">${businessName}</strong> directly.`,
    showDividerBeforeSupport: true,
  });

  try {
    await transporter.sendMail({
      from: `${businessName} <${getFromAddress()}>`,
      to: booking.customer_email,
      subject: `Booking Confirmed — ${dateDisplay} at ${timeDisplay}`,
      html,
      text: buildPlainText({
        headline: "Your appointment is set",
        intro: `Your appointment with ${businessName} has been confirmed.`,
        bodyText: [
          `Date: ${dateDisplay}`,
          `Time: ${timeDisplay}`,
          quoteDisplay ? `Estimated quote: ${quoteDisplay}` : "",
          booking.deposit_paid && depositDisplay ? `Deposit paid: ${depositDisplay}` : "",
        ].filter(Boolean).join("\n"),
        supportNote: `If you need to reschedule or cancel, please contact ${businessName} directly.`,
      }),
    });
    return true;
  } catch (err) {
    console.error("[BookingEmail] Failed to send customer confirmation:", err);
    return false;
  }
}

export async function sendBookingNotificationToBusiness(booking: Booking, calculator: Calculator): Promise<boolean> {
  const transporter = getLegacyBusinessTransporter();
  const calcSettings = (calculator.calculator_settings as any) || {};
  const businessEmail = calcSettings.lead_form?.delivery?.primary_email || calculator.owner_email;
  if (!transporter || !businessEmail) return false;

  const dateDisplay = formatDate(booking.date);
  const timeDisplay = formatTime(booking.time);
  const quoteDisplay = booking.quote_amount ? `$${booking.quote_amount}` : "N/A";
  const depositDisplay = booking.deposit_amount ? `$${booking.deposit_amount}` : "$0";

  const html = `
    <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px;">
      <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">New Booking Received</h1>
      <p style="color: #666; font-size: 14px; margin-bottom: 24px;">A customer has booked an appointment.</p>
      <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <div style="margin-bottom: 12px;"><span style="color: #888; font-size: 12px; text-transform: uppercase;">Customer</span><br/><strong style="font-size: 15px;">${booking.customer_name}</strong></div>
        ${booking.customer_email ? `<div style="margin-bottom: 12px;"><span style="color: #888; font-size: 12px; text-transform: uppercase;">Email</span><br/><strong style="font-size: 15px;">${booking.customer_email}</strong></div>` : ""}
        ${booking.customer_phone ? `<div style="margin-bottom: 12px;"><span style="color: #888; font-size: 12px; text-transform: uppercase;">Phone</span><br/><strong style="font-size: 15px;">${booking.customer_phone}</strong></div>` : ""}
        <div style="margin-bottom: 12px;"><span style="color: #888; font-size: 12px; text-transform: uppercase;">Date & Time</span><br/><strong style="font-size: 15px;">${dateDisplay} at ${timeDisplay}</strong></div>
        <div style="margin-bottom: 12px;"><span style="color: #888; font-size: 12px; text-transform: uppercase;">Quote</span><br/><strong style="font-size: 15px;">${quoteDisplay}</strong></div>
        <div><span style="color: #888; font-size: 12px; text-transform: uppercase;">Deposit</span><br/><strong style="font-size: 15px;">${booking.deposit_paid ? `${depositDisplay} (paid)` : "Not required"}</strong></div>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || "noreply@estimate.ai",
      to: businessEmail,
      subject: `New Booking: ${booking.customer_name} — ${dateDisplay} at ${timeDisplay}`,
      html,
    });
    return true;
  } catch (err) {
    console.error("[BookingEmail] Failed to send business notification:", err);
    return false;
  }
}
