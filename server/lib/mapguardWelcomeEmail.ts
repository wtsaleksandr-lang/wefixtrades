/**
 * MapGuard welcome email — sent immediately after a customer provisions
 * any MapGuard tier (Setup / Basic / Pro). Mirrors the
 * ReputationShield + AdFlow welcome patterns; before this PR, MapGuard
 * was the only paid product without a welcome email, which is the root
 * of "did anything happen?" support tickets right after checkout.
 *
 * The first GBP scan + task creation happens inside
 * `kickoffMapguardService`. This email simply tells the customer that
 * happened and sets expectations for the next 24 hours.
 *
 * Idempotency: caller-side. We don't track sent state here — the
 * webhook call site fires once per checkout.session.completed which is
 * itself idempotent via the client_services existing-row check.
 */
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";

const log = createLogger("MapguardWelcome");

export interface MapguardWelcomeData {
  recipientEmail: string;
  businessName: string;
  clientServiceId: number;
  /** "setup" | "basic" | "pro" — derived from the service_id slug. */
  tierLabel: string;
}

export async function sendMapguardWelcomeEmail(data: MapguardWelcomeData): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("No email transporter — skipping MapGuard welcome email");
    return false;
  }

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const portalUrl = `${baseUrl}/portal/mapguard`;
  const subject = "Welcome to MapGuard — your Google Maps audit starts now";

  const timelineHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
          <div style="font-size:11px;font-weight:700;color:#0d3cfc;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Within 6 hours</div>
          <div style="font-size:14px;color:#CDD1D6;line-height:1.5;">Our team kicks off your first Google Business Profile audit + visibility scan.</div>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
          <div style="font-size:11px;font-weight:700;color:#0d3cfc;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Within 24 hours</div>
          <div style="font-size:14px;color:#CDD1D6;line-height:1.5;">First grid scan results land in your portal — you'll see where you currently rank across your service area.</div>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
          <div style="font-size:11px;font-weight:700;color:#0d3cfc;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Week 1</div>
          <div style="font-size:14px;color:#CDD1D6;line-height:1.5;">Profile fixes shipped: categories, services, photos, business description. Before/after report delivered.</div>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;">
          <div style="font-size:11px;font-weight:700;color:#0d3cfc;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Ongoing</div>
          <div style="font-size:14px;color:#CDD1D6;line-height:1.5;">Weekly visibility scans, Google Business posts, and profile-accuracy checks — all managed.</div>
        </td>
      </tr>
    </table>
  `;

  const bodyHtml = `
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 16px;">
      Welcome aboard — MapGuard <strong style="color:#F0F0F0;">${escapeHtml(data.tierLabel)}</strong> is active for <strong style="color:#F0F0F0;">${escapeHtml(data.businessName)}</strong>. Here's what happens next:
    </p>
    ${timelineHtml}
    <p style="font-size:13px;color:#8B919A;line-height:1.6;margin:0;">
      You'll receive an email when your first grid scan completes. In the meantime, your portal already shows your provisioned service and onboarding tasks.
    </p>
  `;

  const html = buildTransactionalEmail({
    recipientEmail: data.recipientEmail,
    subjectForTitle: subject,
    headerTagline: "Getting started",
    eyebrow: "WELCOME TO MAPGUARD",
    headline: "Your Google Maps audit starts now",
    bodyHtml,
    cta: {
      label: "Open my MapGuard portal",
      url: portalUrl,
      style: "primary",
    },
    supportNote: `Questions? Reply to this email or write to <a href="mailto:support@wefixtrades.com" style="color:#0d3cfc;text-decoration:none;">support@wefixtrades.com</a> — a real person reads every message.`,
  });

  const text = buildPlainText({
    headline: "Welcome to MapGuard",
    intro: `MapGuard ${data.tierLabel} is active for ${data.businessName}.`,
    bodyText: [
      "Within 6 hours: First Google Business Profile audit kicks off.",
      "Within 24 hours: First grid scan results in your portal.",
      "Week 1: Profile fixes shipped, before/after report delivered.",
      "Ongoing: Weekly scans, posts, and profile-accuracy checks.",
    ].join("\n"),
    ctaLabel: "Open my MapGuard portal",
    ctaUrl: portalUrl,
    supportNote: "Questions? Reply to this email or write to support@wefixtrades.com.",
  });

  try {
    await transporter.sendMail({
      from: `"WeFixTrades MapGuard" <${getFromAddress()}>`,
      to: data.recipientEmail,
      subject,
      html,
      text,
    });
    log.info("MapGuard welcome email sent", { to: data.recipientEmail, csId: data.clientServiceId });
    return true;
  } catch (err: any) {
    log.error("MapGuard welcome email send failed", { error: err.message, csId: data.clientServiceId });
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
