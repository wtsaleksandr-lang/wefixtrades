/**
 * MapGuard Setup-Completion Upsell
 *
 * When a `mapguard-setup` (one_time) service finishes, the customer's
 * monitoring stops cold. There's no recurring scan, no weekly retention
 * email, no portal data — they just disappear from MapGuard. The portal
 * page silently flips to "MapGuard is not active on your account."
 *
 * Pre-launch audit flagged this as a real CX hole: the customer paid
 * for a setup project, finished it, and gets no nudge to continue with
 * Basic/Pro monitoring. This module provides:
 *
 *   1. A one-shot completion-and-upsell email triggered when the service
 *      transitions to `completed`. Idempotent via
 *      metadata.upsell_email_sent.
 *   2. A portal-side status query so the React layer can surface a
 *      banner instead of the bland empty state when the customer has a
 *      completed setup but no active monthly plan.
 *   3. A dismiss endpoint to suppress the banner once the customer has
 *      seen and acknowledged it.
 *
 * No new schema — flags live in `clientServices.metadata`:
 *   - upsell_email_sent: ISO timestamp when the one-shot email went out
 *   - upsell_dismissed:  true if the customer dismissed the portal banner
 */

import { db } from "../db";
import { clients, clientServices } from "@shared/schemas/adminCrm";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { isEmailUnsubscribed } from "../lib/unsubscribeStorage";
import { createLogger } from "../lib/logger";

const log = createLogger("MapguardUpsell");

const APP_URL = process.env.APP_URL
  || process.env.APP_PUBLIC_URL
  || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://wefixtrades.com");

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ═══════════════════════════════════════════
   STATE QUERIES
   ═══════════════════════════════════════════ */

interface CompletedSetupSummary {
  cs_id: number;
  completed_at: Date | null;
  upsell_email_sent: boolean;
  upsell_dismissed: boolean;
}

/** Find the most recently completed mapguard-setup service for a client. */
async function findCompletedSetup(clientId: number): Promise<CompletedSetupSummary | null> {
  const [row] = await db.select({
    id: clientServices.id,
    completed_at: clientServices.completed_at,
    metadata: clientServices.metadata,
  })
    .from(clientServices)
    .where(and(
      eq(clientServices.client_id, clientId),
      eq(clientServices.service_id, "mapguard-setup"),
      eq(clientServices.status, "completed"),
    ))
    .orderBy(desc(clientServices.completed_at))
    .limit(1);

  if (!row) return null;
  const meta = (row.metadata as Record<string, any>) || {};
  return {
    cs_id: row.id,
    completed_at: row.completed_at,
    upsell_email_sent: !!meta.upsell_email_sent,
    upsell_dismissed: meta.upsell_dismissed === true,
  };
}

/** Does the client already have an active monthly plan? */
async function hasActiveMonthlyPlan(clientId: number): Promise<boolean> {
  const [row] = await db.select({ id: clientServices.id })
    .from(clientServices)
    .where(and(
      eq(clientServices.client_id, clientId),
      eq(clientServices.status, "active"),
      eq(clientServices.enabled, true),
      sql`${clientServices.service_id} IN ('mapguard-basic', 'mapguard-pro')`,
    ))
    .limit(1);
  return !!row;
}

export interface UpsellStatus {
  should_show: boolean;
  completed_at: string | null;
  /** Days since completion. Null when no completed setup exists. */
  days_since_completion: number | null;
}

/**
 * Portal-side: should we render the "your setup is complete, continue
 * monitoring?" banner? True iff the client has a completed setup AND no
 * active monthly plan AND hasn't dismissed.
 */
export async function getUpsellStatus(clientId: number): Promise<UpsellStatus> {
  const setup = await findCompletedSetup(clientId);
  if (!setup) return { should_show: false, completed_at: null, days_since_completion: null };

  if (setup.upsell_dismissed) {
    return {
      should_show: false,
      completed_at: setup.completed_at?.toISOString() ?? null,
      days_since_completion: setup.completed_at ? daysBetween(setup.completed_at, new Date()) : null,
    };
  }

  if (await hasActiveMonthlyPlan(clientId)) {
    return {
      should_show: false,
      completed_at: setup.completed_at?.toISOString() ?? null,
      days_since_completion: setup.completed_at ? daysBetween(setup.completed_at, new Date()) : null,
    };
  }

  return {
    should_show: true,
    completed_at: setup.completed_at?.toISOString() ?? null,
    days_since_completion: setup.completed_at ? daysBetween(setup.completed_at, new Date()) : null,
  };
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / 86_400_000);
}

/* ═══════════════════════════════════════════
   DISMISS
   ═══════════════════════════════════════════ */

export async function dismissUpsell(clientId: number): Promise<{ ok: boolean }> {
  const setup = await findCompletedSetup(clientId);
  if (!setup) return { ok: false };

  await db.update(clientServices)
    .set({
      metadata: sql`COALESCE(${clientServices.metadata}, '{}'::jsonb) || ${JSON.stringify({ upsell_dismissed: true, upsell_dismissed_at: new Date().toISOString() })}::jsonb`,
      updated_at: new Date(),
    })
    .where(eq(clientServices.id, setup.cs_id));

  return { ok: true };
}

/* ═══════════════════════════════════════════
   ONE-SHOT COMPLETION EMAIL
   ═══════════════════════════════════════════ */

interface UpsellEmailContext {
  businessName: string;
  contactEmail: string;
  csId: number;
}

async function loadEmailContext(clientId: number, csId: number): Promise<UpsellEmailContext | null> {
  const [row] = await db.select({
    business_name: clients.business_name,
    contact_email: clients.contact_email,
  })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!row || !row.contact_email) return null;
  return {
    businessName: row.business_name,
    contactEmail: row.contact_email,
    csId,
  };
}

function buildUpsellEmail(ctx: UpsellEmailContext): { subject: string; html: string; text: string } {
  const subject = `MapGuard setup complete — keep your visibility protected, ${ctx.businessName}`;
  const plansUrl = `${APP_URL}/portal/services`;
  const dashboardUrl = `${APP_URL}/portal/mapguard`;

  const text = `Hi ${ctx.businessName},

Your MapGuard setup project is complete. Your Google Business profile,
listings, and visibility groundwork are all in place.

What happens next is up to you. Your setup ends here unless you continue
with monthly monitoring:

  • Basic — weekly visibility scans + alerting on rating, reviews, and
    keyword drops. We catch problems before your customers do.
  • Pro — everything in Basic, plus monthly competitor tracking, faster
    response on detected issues, and priority supplier execution.

Pick a plan: ${plansUrl}
Open your dashboard: ${dashboardUrl}

— The WeFixTrades MapGuard team
`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:'Inter',Arial,sans-serif;margin:0;padding:0;background:#F3F4F6;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="padding:20px 28px;background:#2D6A4F;">
    <p style="color:#d1fae5;font-size:11px;font-weight:700;letter-spacing:0.05em;margin:0;">MAPGUARD SETUP COMPLETE</p>
    <p style="color:#ffffff;font-size:16px;font-weight:600;margin:6px 0 0;">${esc(ctx.businessName)}</p>
  </td></tr>
  <tr><td style="padding:24px 28px;">
    <p style="font-size:14px;color:#374151;margin:0 0 12px;">Your MapGuard setup project is complete. Your Google Business profile, listings, and visibility groundwork are all in place.</p>
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">What happens next is up to you. Your setup ends here unless you continue with monthly monitoring:</p>
    <ul style="margin:0 0 20px;padding-left:18px;line-height:1.7;color:#374151;font-size:14px;">
      <li><b>Basic</b> — weekly visibility scans + alerting on rating, reviews, and keyword drops.</li>
      <li><b>Pro</b> — everything in Basic, plus competitor tracking, faster issue response, and priority execution.</li>
    </ul>
  </td></tr>
  <tr><td style="padding:0 28px 24px;text-align:center;">
    <a href="${plansUrl}" style="display:inline-block;background:#2D6A4F;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin-right:8px;">See Plans</a>
    <a href="${dashboardUrl}" style="display:inline-block;background:#ffffff;color:#2D6A4F;padding:11px 27px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;border:1px solid #2D6A4F;">Open Dashboard</a>
  </td></tr>
  <tr><td style="padding:12px 28px;background:#f9fafb;text-align:center;border-top:1px solid #e5e7eb;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">MapGuard &middot; WeFixTrades</p>
  </td></tr>
</table>
</body></html>`;

  return { subject, html, text };
}

/**
 * Fire-and-forget upsell trigger called by storage.checkAndCompleteService
 * when a mapguard-setup row flips to status='completed'. Idempotent: marks
 * `metadata.upsell_email_sent` after a successful send, so a webhook
 * replay or manual cascade re-fire never sends a duplicate. Honors global
 * unsubscribe list (CAN-SPAM).
 */
export async function fireSetupCompletionUpsell(clientId: number, clientServiceId: number): Promise<{ sent: boolean; reason?: string }> {
  try {
    // Re-load the completed setup to read current metadata (avoid relying
    // on stale caller-supplied state).
    const setup = await findCompletedSetup(clientId);
    if (!setup || setup.cs_id !== clientServiceId) {
      return { sent: false, reason: "completed_setup_not_found" };
    }
    if (setup.upsell_email_sent) {
      return { sent: false, reason: "already_sent" };
    }

    // If the client already has an active basic/pro plan (e.g. they
    // upgraded mid-setup), don't bother nudging them.
    if (await hasActiveMonthlyPlan(clientId)) {
      // Mark sent anyway so we don't keep checking on every cascade tick.
      await db.update(clientServices)
        .set({
          metadata: sql`COALESCE(${clientServices.metadata}, '{}'::jsonb) || ${JSON.stringify({ upsell_email_sent: new Date().toISOString(), upsell_skipped_reason: "already_on_monthly" })}::jsonb`,
          updated_at: new Date(),
        })
        .where(eq(clientServices.id, clientServiceId));
      return { sent: false, reason: "already_on_monthly" };
    }

    const ctx = await loadEmailContext(clientId, clientServiceId);
    if (!ctx) return { sent: false, reason: "no_contact_email" };

    if (await isEmailUnsubscribed(ctx.contactEmail)) {
      // Don't send; mark as sent so we don't retry — unsubscribe is sticky.
      await db.update(clientServices)
        .set({
          metadata: sql`COALESCE(${clientServices.metadata}, '{}'::jsonb) || ${JSON.stringify({ upsell_email_sent: new Date().toISOString(), upsell_skipped_reason: "unsubscribed" })}::jsonb`,
          updated_at: new Date(),
        })
        .where(eq(clientServices.id, clientServiceId));
      return { sent: false, reason: "unsubscribed" };
    }

    const transporter = getEmailTransporter();
    if (!transporter) return { sent: false, reason: "smtp_not_configured" };

    const { subject, html, text } = buildUpsellEmail(ctx);
    await transporter.sendMail({
      from: getFromAddress(),
      to: ctx.contactEmail,
      subject,
      html,
      text,
    });

    // Stamp success so we never re-send.
    await db.update(clientServices)
      .set({
        metadata: sql`COALESCE(${clientServices.metadata}, '{}'::jsonb) || ${JSON.stringify({ upsell_email_sent: new Date().toISOString() })}::jsonb`,
        updated_at: new Date(),
      })
      .where(eq(clientServices.id, clientServiceId));

    log.info(`[mapguard-upsell] Sent setup-completion upsell to ${ctx.contactEmail} (cs=${clientServiceId})`);
    return { sent: true };
  } catch (err: any) {
    log.error(`[mapguard-upsell] Failed to send completion upsell for client=${clientId} cs=${clientServiceId}: ${err.message}`);
    return { sent: false, reason: "send_error" };
  }
}
