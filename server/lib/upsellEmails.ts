/**
 * Upsell/follow-up emails — sent 7 days after SiteLaunch or WebFix delivery.
 *
 * Uses the transactional email shell for consistent branding. Each function
 * sends a single email pitching WebCare as the natural next step after a
 * one-time delivery service completes.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { respectPreferences } from "./notificationPreferences";
import { createLogger } from "./logger";

const log = createLogger("UpsellEmails");

function getBaseUrl(): string {
  return process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
}

/**
 * Post-SiteLaunch upsell — sent 7 days after delivery.
 * Pitches WebCare for ongoing maintenance.
 */
export async function sendPostSiteLaunchUpsell(
  recipientEmail: string,
  data: { businessName: string; portalUrl: string },
  clientId?: number,
): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("No email transporter — skipping SiteLaunch upsell");
    return false;
  }

  if (clientId != null && !(await respectPreferences(clientId, "email", "marketing"))) {
    log.info(`[upsell-sitelaunch] Skipped — client #${clientId} disabled marketing email`);
    return false;
  }

  const base = getBaseUrl();
  const webcareUrl = `${base}/products/webcare`;

  const subject = "Your site's been live a week — here's how to keep it running perfectly";

  const bodyHtml = `
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 16px;">
      Congratulations — your new website has been live for a week now, and we hope it's already making a great impression on your customers.
    </p>
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 16px;">
      Now that the build is done, here's what most trades businesses run into next:
    </p>
    <ul style="font-size:14px;color:#CDD1D6;line-height:1.8;margin:0 0 16px;padding-left:20px;">
      <li><strong style="color:#F0F0F0;">Content updates</strong> — new services, seasonal offers, team changes</li>
      <li><strong style="color:#F0F0F0;">Security patches</strong> — WordPress and plugin updates that can't wait</li>
      <li><strong style="color:#F0F0F0;">Speed & uptime</strong> — keeping load times fast and the site online 24/7</li>
    </ul>
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 4px;">
      <strong style="color:#F0F0F0;">WebCare</strong> handles all of this for you — monitoring, updates, security checks, and content changes — so your site stays sharp without you thinking about it.
    </p>
  `;

  const html = buildTransactionalEmail({
    recipientEmail,
    subjectForTitle: subject,
    headerTagline: "Website follow-up",
    eyebrow: "YOUR SITE IS LIVE",
    headline: `Great news, ${data.businessName}`,
    bodyHtml,
    cta: {
      label: "Learn about WebCare",
      url: webcareUrl,
      style: "primary",
    },
    supportNote: `Questions? Just reply to this email or visit your <a href="${data.portalUrl}" style="color:#0d3cfc;text-decoration:none;">client portal</a>.`,
  });

  const text = buildPlainText({
    headline: `Great news, ${data.businessName}`,
    intro: "Your new website has been live for a week now. Here's what to keep in mind going forward.",
    bodyText:
      "Common post-launch needs:\n" +
      "- Content updates (new services, seasonal offers)\n" +
      "- Security patches (WordPress & plugin updates)\n" +
      "- Speed & uptime monitoring\n\n" +
      "WebCare handles all of this for you — monitoring, updates, security checks, and content changes.",
    ctaLabel: "Learn about WebCare",
    ctaUrl: webcareUrl,
    supportNote: `Questions? Visit your portal: ${data.portalUrl}`,
  });

  try {
    await transporter.sendMail({
      from: `"WeFixTrades" <${getFromAddress()}>`,
      to: recipientEmail,
      subject,
      html,
      text,
    });
    log.info("SiteLaunch upsell sent", { to: recipientEmail, businessName: data.businessName });
    return true;
  } catch (err: any) {
    log.error("SiteLaunch upsell send failed", { error: err.message, to: recipientEmail });
    return false;
  }
}

/**
 * Post-WebFix upsell — sent 7 days after delivery.
 * Pitches WebCare for ongoing maintenance.
 */
export async function sendPostWebFixUpsell(
  recipientEmail: string,
  data: { businessName: string; portalUrl: string },
  clientId?: number,
): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("No email transporter — skipping WebFix upsell");
    return false;
  }

  if (clientId != null && !(await respectPreferences(clientId, "email", "marketing"))) {
    log.info(`[upsell-webfix] Skipped — client #${clientId} disabled marketing email`);
    return false;
  }

  const base = getBaseUrl();
  const webcareUrl = `${base}/products/webcare`;

  const subject = "Your website fixes are holding up — want to keep it that way?";

  const bodyHtml = `
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 16px;">
      It's been a week since we wrapped up your WebFix project, and your improvements should be humming along nicely — faster pages, cleaner SEO, tighter security.
    </p>
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 16px;">
      The thing is, websites don't stay fixed forever. Plugins update, hosting configs drift, and new issues creep in over time. Most trades businesses hit a snag within 3-6 months of a one-time fix.
    </p>
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 16px;">
      <strong style="color:#F0F0F0;">WebCare</strong> keeps your site in top shape year-round:
    </p>
    <ul style="font-size:14px;color:#CDD1D6;line-height:1.8;margin:0 0 16px;padding-left:20px;">
      <li>24/7 uptime monitoring with instant alerts</li>
      <li>Automated security patches and SSL health checks</li>
      <li>Monthly content changes included</li>
      <li>Priority support when something breaks</li>
    </ul>
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 4px;">
      Think of it as insurance for all the work we just did.
    </p>
  `;

  const html = buildTransactionalEmail({
    recipientEmail,
    subjectForTitle: subject,
    headerTagline: "Website follow-up",
    eyebrow: "FIXES DELIVERED",
    headline: `Your site's in great shape, ${data.businessName}`,
    bodyHtml,
    cta: {
      label: "Add WebCare",
      url: webcareUrl,
      style: "primary",
    },
    supportNote: `Questions? Just reply to this email or visit your <a href="${data.portalUrl}" style="color:#0d3cfc;text-decoration:none;">client portal</a>.`,
  });

  const text = buildPlainText({
    headline: `Your site's in great shape, ${data.businessName}`,
    intro: "It's been a week since your WebFix project wrapped up. Your improvements should be running smoothly.",
    bodyText:
      "Websites don't stay fixed forever. Plugins update, configs drift, and new issues creep in.\n\n" +
      "WebCare keeps your site in top shape year-round:\n" +
      "- 24/7 uptime monitoring\n" +
      "- Automated security patches and SSL health checks\n" +
      "- Monthly content changes included\n" +
      "- Priority support when something breaks",
    ctaLabel: "Add WebCare",
    ctaUrl: webcareUrl,
    supportNote: `Questions? Visit your portal: ${data.portalUrl}`,
  });

  try {
    await transporter.sendMail({
      from: `"WeFixTrades" <${getFromAddress()}>`,
      to: recipientEmail,
      subject,
      html,
      text,
    });
    log.info("WebFix upsell sent", { to: recipientEmail, businessName: data.businessName });
    return true;
  } catch (err: any) {
    log.error("WebFix upsell send failed", { error: err.message, to: recipientEmail });
    return false;
  }
}
