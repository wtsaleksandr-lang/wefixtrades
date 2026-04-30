import type { Booking, Calculator } from "@shared/schema";
import { getEmailTransporter, getFromAddress } from "./lib/emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./lib/transactionalShell";
import { buildAdminAlertEmail, buildAdminAlertPlainText, ADMIN_ALERT_FROM_NAME } from "./lib/adminAlertShell";

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
    subjectForTitle: `Booking confirmed — ${dateDisplay} at ${timeDisplay}`,
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
      subject: `Booking confirmed — ${dateDisplay} at ${timeDisplay}`,
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
  const transporter = getEmailTransporter();
  const calcSettings = (calculator.calculator_settings as any) || {};
  const businessEmail = calcSettings.lead_form?.delivery?.primary_email || calculator.owner_email;
  if (!transporter || !businessEmail) return false;

  const dateDisplay = formatDate(booking.date);
  const timeDisplay = formatTime(booking.time);
  const quoteDisplay = booking.quote_amount ? `$${booking.quote_amount}` : "N/A";
  const depositDisplay = booking.deposit_amount ? `$${booking.deposit_amount}` : "$0";

  const detailRows: Array<{ label: string; value: string }> = [
    { label: "Customer", value: booking.customer_name },
  ];
  if (booking.customer_email) detailRows.push({ label: "Email", value: booking.customer_email });
  if (booking.customer_phone) detailRows.push({ label: "Phone", value: booking.customer_phone });
  detailRows.push({ label: "Date & time", value: `${dateDisplay} at ${timeDisplay}` });
  detailRows.push({ label: "Quote", value: quoteDisplay });
  detailRows.push({ label: "Deposit", value: booking.deposit_paid ? `${depositDisplay} (paid)` : "Not required" });

  const subject = `New booking: ${booking.customer_name} — ${dateDisplay} at ${timeDisplay}`;

  const html = buildAdminAlertEmail({
    subjectForTitle: subject,
    alertType: "New booking",
    alertTone: "success",
    headline: `${booking.customer_name} just booked`,
    summary: "A customer has booked an appointment via your calculator.",
    detailRows,
    footerNote: "Sent by your QuoteQuick calculator",
  });

  const text = buildAdminAlertPlainText({
    alertType: "New booking",
    headline: `${booking.customer_name} just booked`,
    summary: "A customer has booked an appointment via your calculator.",
    detailRows,
    footerNote: "Sent by your QuoteQuick calculator",
  });

  try {
    await transporter.sendMail({
      from: `${ADMIN_ALERT_FROM_NAME} <${getFromAddress()}>`,
      to: businessEmail,
      subject,
      html,
      text,
    });
    return true;
  } catch (err) {
    console.error("[BookingEmail] Failed to send business notification:", err);
    return false;
  }
}
