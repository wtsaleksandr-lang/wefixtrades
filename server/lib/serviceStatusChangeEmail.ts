/**
 * Service status-change email — covers the four admin-driven
 * lifecycle events that affect a customer's running service:
 *
 *   activated  — admin moved the service to "active"
 *   paused     — admin set status to "paused"
 *   resumed    — admin moved a paused service back to "active"
 *   cancelled  — admin set status to "cancelled" / "completed"
 *
 * One template, four state branches — keeps the messaging
 * consistent and avoids four near-duplicate files. Triggered from
 * the admin client-service status-change route. Honours the
 * customer's `service_updates` notification preference.
 *
 * Safe-fail: catches and logs SMTP errors, never throws.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { isEmailUnsubscribed } from "./unsubscribeStorage";
import { createLogger } from "./logger";

const log = createLogger("service-status-change-email");

export type ServiceStatusChangeKind = "activated" | "paused" | "resumed" | "cancelled";

export interface ServiceStatusChangeData {
  to: string;
  recipientName?: string | null;
  businessName: string;
  serviceName: string;
  kind: ServiceStatusChangeKind;
  /** Optional admin-supplied note to include in the body. */
  note?: string | null;
  /** URL to view the service in the customer portal. */
  serviceUrl: string;
  /** Optional URL to the billing page (used by the cancelled state). */
  billingUrl?: string;
}

/* Per-state copy table. Keeping it inline (rather than per-state
 * functions) makes the template very easy to skim and adjust. */
const COPY: Record<ServiceStatusChangeKind, {
  subject: (svc: string) => string;
  headline: string;
  intro: (svc: string) => string;
  ctaLabel: string;
  ctaStyle: "primary" | "block";
}> = {
  activated: {
    subject: (svc) => `${svc} is now active`,
    headline: "Your service is live",
    intro: (svc) => `Good news — your <strong>${svc}</strong> service is active and running. You can track progress and approve deliverables in your portal.`,
    ctaLabel: "Open your portal",
    ctaStyle: "primary",
  },
  paused: {
    subject: (svc) => `${svc} has been paused`,
    headline: "Your service is paused",
    intro: (svc) =>
      `We've paused your <strong>${svc}</strong> service. While paused, no new work is delivered and no recurring charges apply. Resume any time from the portal — or reply if you want to talk through it.`,
    ctaLabel: "View service",
    ctaStyle: "primary",
  },
  resumed: {
    subject: (svc) => `${svc} is back on`,
    headline: "Service resumed",
    intro: (svc) =>
      `Welcome back — your <strong>${svc}</strong> service is active again. Billing has resumed on its previous schedule.`,
    ctaLabel: "Open your portal",
    ctaStyle: "primary",
  },
  cancelled: {
    subject: (svc) => `${svc} has been cancelled`,
    headline: "Service cancelled",
    intro: (svc) =>
      `We've cancelled your <strong>${svc}</strong> service. No further charges will be made. Any final invoices already issued remain due — see your billing page if anything's outstanding.`,
    ctaLabel: "View billing",
    ctaStyle: "primary",
  },
};

export async function sendServiceStatusChangeEmail(data: ServiceStatusChangeData): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("SMTP not configured — service status email NOT sent", { to: data.to, kind: data.kind });
    return false;
  }

  /* Service-update emails are transactional, but customers can still
   * unsubscribe from the broader notification stream. Honour that. */
  if (await isEmailUnsubscribed(data.to)) {
    log.info("recipient unsubscribed — skipping service status email", { to: data.to, kind: data.kind });
    return false;
  }

  const copy = COPY[data.kind];
  const greeting = data.recipientName ? `Hi ${data.recipientName},` : `Hi ${data.businessName},`;

  /* The cancelled state's CTA points at billing — every other state
   * points at the service detail page in the portal. */
  const ctaUrl = data.kind === "cancelled" && data.billingUrl ? data.billingUrl : data.serviceUrl;

  const noteHtml = data.note
    ? `<p style="font-size:13px;color:#CDD1D6;line-height:1.6;margin:0 0 16px;padding:14px 16px;border-left:2px solid #0d3cfc;background:#0F141A;border-radius:8px;">${escapeHtml(data.note)}</p>`
    : "";

  const html = buildTransactionalEmail({
    subjectForTitle: copy.subject(data.serviceName),
    recipientEmail: data.to,
    headline: copy.headline,
    intro: `${greeting} ${copy.intro(data.serviceName)}`,
    bodyHtml: noteHtml || undefined,
    cta: {
      label: copy.ctaLabel,
      url: ctaUrl,
      style: copy.ctaStyle,
    },
    pasteLinkFallback: { url: ctaUrl },
    supportNote:
      "Questions or want this changed? Just reply to this email or reach <a href=\"mailto:support@wefixtrades.com\" style=\"color:inherit;text-decoration:underline;\">support@wefixtrades.com</a>.",
  });

  const text = buildPlainText({
    headline: copy.headline,
    intro: greeting + " " + copy.intro(data.serviceName).replace(/<[^>]+>/g, ""),
    ctaLabel: copy.ctaLabel,
    ctaUrl,
    supportNote: "Questions? Reply to this email or contact support@wefixtrades.com.",
  });

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: data.to,
      subject: copy.subject(data.serviceName),
      html,
      text,
    });
    return true;
  } catch (err) {
    log.error("Failed to send service status change email", {
      to: data.to,
      kind: data.kind,
      error: String(err),
    });
    return false;
  }
}

/** Minimal HTML-entity escape for admin-supplied note text. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
