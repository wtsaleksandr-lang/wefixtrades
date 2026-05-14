/**
 * Cancellation confirmation email with a lightweight 1-click exit survey.
 *
 * Sent when:
 *  - Stripe reports `customer.subscription.deleted` (canceled via Stripe / portal)
 *  - Admin marks a client_service as cancelled
 *  - Customer hits cancel from the portal (future)
 *
 * The exit survey is intentionally tiny: a single-reason select rendered
 * as clickable links that GET back to our /api/exit-survey/:token endpoint.
 * Any feedback we get is better than the usual cancel-with-no-signal.
 *
 * Idempotent via client_services.metadata.cancellation_email_sent_at.
 */

import crypto from "crypto";
import { db } from "../db";
import { clients, clientServices, serviceCatalog } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildLegalFooter, buildEmailHeader, buildChatBubble } from "./emailFooter";
import { createLogger } from "./logger";

const log = createLogger("CancellationEmail");

interface SendParams {
  clientServiceId: number;
  cancellationContext?: "stripe" | "admin" | "portal" | "system";
}

const EXIT_REASONS = [
  { id: "too_expensive", label: "Too expensive" },
  { id: "didnt_deliver", label: "Didn't deliver results" },
  { id: "too_hard_to_use", label: "Too hard to use" },
  { id: "found_alternative", label: "Found a better alternative" },
  { id: "not_right_time", label: "Not the right time for my business" },
  { id: "other", label: "Something else" },
] as const;

function buildHtml(params: {
  contactName: string;
  serviceName: string;
  accessUntil: string | null;
  surveyBaseUrl: string;
  supportEmail: string;
  recipientEmail: string;
}): string {
  const reasonLinks = EXIT_REASONS.map(r =>
    `<a href="${params.surveyBaseUrl}?reason=${r.id}" style="display:block;padding:10px 14px;margin-bottom:6px;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:8px;color:#CDD1D6;font-size:13px;text-decoration:none;">
      ${r.label}
    </a>`
  ).join("");

  return `
    <div style="font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0B0F14;padding:40px 16px;">
      <div style="max-width:520px;margin:0 auto;">
        ${buildEmailHeader()}
        <div style="background:#151A21;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:36px 28px;">
          <p style="font-size:12px;font-weight:700;color:#8B919A;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Your cancellation is confirmed</p>
          <h1 style="font-size:22px;font-weight:700;color:#F0F0F0;margin:0 0 10px;line-height:1.3;">
            We're sorry to see you go, ${params.contactName.split(" ")[0] || "there"}
          </h1>
          <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 18px;">
            Your <strong style="color:#F0F0F0;">${params.serviceName}</strong> has been cancelled. No further charges will be made.
            ${params.accessUntil ? ` You'll keep access until <strong style="color:#F0F0F0;">${params.accessUntil}</strong>.` : ""}
          </p>

          <p style="font-size:13px;color:#8B919A;line-height:1.6;margin:0 0 24px;">
            Your data is kept for 90 days in case you want to come back — reactivating is a single purchase away and picks up exactly where you left off. After 90 days it's anonymized per our privacy policy.
          </p>

          <div style="border-top:1px solid rgba(255,255,255,0.06);margin:24px 0 20px;"></div>

          <p style="font-size:13px;font-weight:600;color:#F0F0F0;margin:0 0 8px;">One tiny favor — why are you leaving?</p>
          <p style="font-size:12px;color:#8B919A;line-height:1.5;margin:0 0 14px;">
            Click one. It helps us fix what drove you away, and we promise not to follow up unless you want us to.
          </p>

          ${reasonLinks}

          <div style="border-top:1px solid rgba(255,255,255,0.06);margin:24px 0 14px;"></div>
          <p style="font-size:12px;color:#8B919A;line-height:1.6;margin:0;">
            Changed your mind? Just reply to this email — we can reactivate in minutes. Or reach us at <a href="mailto:${params.supportEmail}" style="color:#0d3cfc;text-decoration:none;">${params.supportEmail}</a>.
          </p>
        </div>
        ${buildChatBubble()}
        ${buildLegalFooter({ recipientEmail: params.recipientEmail })}
      </div>
    </div>
  `;
}

export async function sendCancellationEmail(params: SendParams): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("[cancellation-email] SMTP not configured — skipping");
    return false;
  }

  const [cs] = await db.select().from(clientServices).where(eq(clientServices.id, params.clientServiceId)).limit(1);
  if (!cs) return false;

  // Idempotency
  const csMeta = (cs.metadata as any) || {};
  if (csMeta.cancellation_email_sent_at) {
    log.info(`[cancellation-email] Already sent for client_service #${params.clientServiceId}`);
    return false;
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, cs.client_id)).limit(1);
  if (!client?.contact_email) return false;

  const [svc] = await db.select().from(serviceCatalog).where(eq(serviceCatalog.id, cs.service_id)).limit(1);
  const serviceName = svc?.name || cs.service_id;

  // Generate a survey token so we can credit feedback to this specific cancellation
  // Reuses metadata — no new table needed
  const surveyToken = crypto.randomBytes(18).toString("base64url");

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const supportEmail = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress();
  const contactName = client.contact_name || client.business_name || "there";

  // For monthly plans cancelled now, customer retains access to period end.
  // We don't currently track period_end on client_services, so show it only if
  // available from the subscription metadata.
  const accessUntil: string | null = null;

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: client.contact_email,
      replyTo: supportEmail,
      subject: `Your ${serviceName} cancellation is confirmed`,
      html: buildHtml({
        contactName,
        serviceName,
        accessUntil,
        surveyBaseUrl: `${baseUrl}/api/exit-survey/${surveyToken}`,
        supportEmail,
        recipientEmail: client.contact_email,
      }),
    });

    // Record email sent + survey token
    await db.update(clientServices)
      .set({
        metadata: {
          ...csMeta,
          cancellation_email_sent_at: new Date().toISOString(),
          cancellation_context: params.cancellationContext || "unknown",
          exit_survey_token: surveyToken,
        },
        updated_at: new Date(),
      } as any)
      .where(eq(clientServices.id, cs.id));

    log.info(`[cancellation-email] Sent to ${client.contact_email} for ${serviceName}`);
    return true;
  } catch (err: any) {
    log.error(`[cancellation-email] Send failed:`, err.message);
    return false;
  }
}
