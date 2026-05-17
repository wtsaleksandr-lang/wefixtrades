/**
 * MapGuard setup-tier freelancer brief.
 *
 * MapSetup™ ($397 one-time) is the only MapGuard SKU where the
 * heavy-lifting work (profile rebuild, photo refresh, NAP cleanup) is
 * partially outsourced to a vetted freelancer. When the customer
 * checks out and the kickoff fires, this module fires a single
 * structured email to MAPGUARD_SETUP_FREELANCER_EMAIL with everything
 * the freelancer needs to start: client info, GBP place ID, target
 * city, trade, plus a one-shot deep link back to the admin task list.
 *
 * No UI, no portal — pure transactional email. The freelancer marks
 * their work done by closing the kickoff tasks in the admin CRM (the
 * MapGuard kickoff already creates those tasks for `mapguard-setup`).
 */
import { getEmailTransporter, getFromAddress } from "../../lib/emailTransport";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { clients, clientServices } from "@shared/schemas/adminCrm";
import { createLogger } from "../../lib/logger";

const log = createLogger("MapGuardSetupBrief");

const FREELANCER_EMAIL = process.env.MAPGUARD_SETUP_FREELANCER_EMAIL;
const APP_URL = process.env.APP_URL || process.env.PUBLIC_URL || "https://wefixtrades.com";

interface BriefInput {
  clientId: number;
  clientServiceId: number;
  kickoffTaskTitles: string[];
}

/**
 * Sends the brief. Best-effort — failures are logged but never thrown.
 * Returns true if sent, false on any skip / failure (so the caller
 * doesn't block the kickoff flow).
 */
export async function sendMapguardSetupBrief(input: BriefInput): Promise<boolean> {
  if (!FREELANCER_EMAIL) {
    log.info("MAPGUARD_SETUP_FREELANCER_EMAIL not configured, skipping brief", {
      client_service_id: input.clientServiceId,
    });
    return false;
  }

  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("SMTP not configured, skipping freelancer brief", {
      client_service_id: input.clientServiceId,
    });
    return false;
  }

  const [client] = await db
    .select({
      id: clients.id,
      business_name: clients.business_name,
      contact_name: clients.contact_name,
      contact_email: clients.contact_email,
      contact_phone: clients.contact_phone,
      website_url: clients.website_url,
      google_place_id: clients.google_place_id,
      trade_type: clients.trade_type,
      metadata: clients.metadata,
    })
    .from(clients)
    .where(eq(clients.id, input.clientId))
    .limit(1);

  if (!client) {
    log.error("Client not found for setup brief", { client_id: input.clientId });
    return false;
  }

  const meta = (client.metadata as Record<string, any> | null) || {};
  const city = meta.city || meta.service_area || "(not provided)";
  const adminUrl = `${APP_URL}/admin/crm/clients/${client.id}?tab=mapguard`;
  const gmapsUrl = client.google_place_id
    ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(client.google_place_id)}`
    : null;

  const subject = `MapSetup brief — ${client.business_name}`;

  const taskList = input.kickoffTaskTitles.length
    ? input.kickoffTaskTitles.map((t, i) => `  ${i + 1}. ${t}`).join("\n")
    : "  (no kickoff tasks recorded)";

  const text = [
    `New MapSetup customer ready for first-pass work.`,
    ``,
    `Business: ${client.business_name}`,
    `Trade:    ${client.trade_type || "(unspecified)"}`,
    `City:     ${city}`,
    `Website:  ${client.website_url || "(none)"}`,
    `Place ID: ${client.google_place_id || "(not collected yet — backfill from audit)"}`,
    gmapsUrl ? `Maps:     ${gmapsUrl}` : "",
    ``,
    `Customer contact (only escalate via the admin CRM, do not contact directly):`,
    `  Name:  ${client.contact_name || "(not provided)"}`,
    `  Email: ${client.contact_email || "(not provided)"}`,
    `  Phone: ${client.contact_phone || "(not provided)"}`,
    ``,
    `Kickoff tasks queued in admin CRM:`,
    taskList,
    ``,
    `Open this customer in the admin CRM to mark tasks complete:`,
    `  ${adminUrl}`,
    ``,
    `— WeFixTrades automation`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #0d3cfc; margin: 0 0 16px 0;">MapSetup brief</h2>
  <p style="margin: 0 0 16px 0;">New customer is ready for first-pass work.</p>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
    <tr><td style="padding: 6px 0; color: #6b7280; width: 100px;">Business</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(client.business_name)}</td></tr>
    <tr><td style="padding: 6px 0; color: #6b7280;">Trade</td><td style="padding: 6px 0;">${escapeHtml(client.trade_type || "(unspecified)")}</td></tr>
    <tr><td style="padding: 6px 0; color: #6b7280;">City</td><td style="padding: 6px 0;">${escapeHtml(city)}</td></tr>
    <tr><td style="padding: 6px 0; color: #6b7280;">Website</td><td style="padding: 6px 0;">${client.website_url ? `<a href="${escapeAttr(client.website_url)}">${escapeHtml(client.website_url)}</a>` : "(none)"}</td></tr>
    <tr><td style="padding: 6px 0; color: #6b7280;">Place ID</td><td style="padding: 6px 0; font-family: monospace; font-size: 12px;">${escapeHtml(client.google_place_id || "(not collected yet)")}</td></tr>
    ${gmapsUrl ? `<tr><td style="padding: 6px 0; color: #6b7280;">Maps</td><td style="padding: 6px 0;"><a href="${escapeAttr(gmapsUrl)}">View on Google Maps</a></td></tr>` : ""}
  </table>

  <p style="margin: 16px 0 8px 0; font-weight: 600; color: #1f2937;">Kickoff tasks queued</p>
  <ol style="margin: 0 0 16px 18px; padding: 0; color: #374151;">
    ${input.kickoffTaskTitles.map((t) => `<li style="margin-bottom: 4px;">${escapeHtml(t)}</li>`).join("")}
  </ol>

  <p style="margin: 24px 0;">
    <a href="${escapeAttr(adminUrl)}" style="display: inline-block; background: #0d3cfc; color: white; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-weight: 500;">
      Open customer in admin CRM →
    </a>
  </p>

  <p style="margin: 16px 0 0 0; color: #9ca3af; font-size: 12px;">
    Mark tasks complete in the admin CRM, not by replying. Do not contact the customer directly —
    all communication goes through WeFixTrades ops.
  </p>
</body></html>`;

  try {
    await transporter.sendMail({
      from: `WeFixTrades MapGuard <${getFromAddress()}>`,
      to: FREELANCER_EMAIL,
      subject,
      text,
      html,
    });
    log.info("MapSetup freelancer brief sent", {
      client_id: client.id,
      client_service_id: input.clientServiceId,
      to: FREELANCER_EMAIL.replace(/(.{2}).+(@.+)/, "$1***$2"),
    });
    return true;
  } catch (err: any) {
    log.error("Failed to send MapSetup freelancer brief", {
      client_service_id: input.clientServiceId,
      error: err.message,
    });
    return false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
