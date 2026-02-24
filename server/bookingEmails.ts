import nodemailer from "nodemailer";
import type { Booking, Calculator } from "@shared/schema";

function getTransporter() {
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
  const transporter = getTransporter();
  if (!transporter || !booking.customer_email) return false;

  const businessName = calculator.business_name;
  const dateDisplay = formatDate(booking.date);
  const timeDisplay = formatTime(booking.time);
  const quoteDisplay = booking.quote_amount ? `$${booking.quote_amount}` : "";
  const depositDisplay = booking.deposit_amount ? `$${booking.deposit_amount}` : "";

  const html = `
    <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px;">
      <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">Booking Confirmed</h1>
      <p style="color: #666; font-size: 14px; margin-bottom: 24px;">Your appointment with <strong>${businessName}</strong> has been confirmed.</p>
      <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <div style="margin-bottom: 12px;"><span style="color: #888; font-size: 12px; text-transform: uppercase;">Date</span><br/><strong style="font-size: 15px;">${dateDisplay}</strong></div>
        <div style="margin-bottom: 12px;"><span style="color: #888; font-size: 12px; text-transform: uppercase;">Time</span><br/><strong style="font-size: 15px;">${timeDisplay}</strong></div>
        ${quoteDisplay ? `<div style="margin-bottom: 12px;"><span style="color: #888; font-size: 12px; text-transform: uppercase;">Estimated Quote</span><br/><strong style="font-size: 15px;">${quoteDisplay}</strong></div>` : ""}
        ${booking.deposit_paid && depositDisplay ? `<div><span style="color: #888; font-size: 12px; text-transform: uppercase;">Deposit Paid</span><br/><strong style="font-size: 15px; color: #16a34a;">${depositDisplay}</strong></div>` : ""}
      </div>
      <p style="color: #888; font-size: 13px;">If you need to reschedule or cancel, please contact ${businessName} directly.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || "noreply@estimate.ai",
      to: booking.customer_email,
      subject: `Booking Confirmed — ${dateDisplay} at ${timeDisplay}`,
      html,
    });
    return true;
  } catch (err) {
    console.error("[BookingEmail] Failed to send customer confirmation:", err);
    return false;
  }
}

export async function sendBookingNotificationToBusiness(booking: Booking, calculator: Calculator): Promise<boolean> {
  const transporter = getTransporter();
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
