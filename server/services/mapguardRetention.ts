/**
 * MapGuard Client Activity Feed & Weekly Update
 *
 * Generates client-safe activity messages from internal data.
 * Powers the portal activity feed and weekly retention emails.
 */

import { db } from "../db";
import { mapguardTasks } from "@shared/schemas/mapguard";
import { mapguardSnapshots } from "@shared/schemas/mapguardMonitoring";
import { clients, clientServices, serviceCatalog } from "@shared/schemas/adminCrm";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { createLogger } from "../lib/logger";

const log = createLogger("MapguardRetention");

/* ═══════════════════════════════════════════
   TASK TYPE → PAST TENSE CLIENT LANGUAGE
   ═══════════════════════════════════════════ */

const COMPLETED_MESSAGES: Record<string, string> = {
  baseline_audit_review: "We reviewed your visibility data and created an improvement plan",
  gbp_optimization: "We optimized your Google Business profile",
  citation_cleanup: "We improved your online listings consistency",
  review_issue_response: "We addressed your customer review issues",
  competitor_reaction: "We responded to competitor changes in your area",
  profile_content_update: "We updated your profile content for better performance",
  photo_upload: "We refreshed your business photos",
  post_scheduling: "We published new posts on your profile",
  suspension_support: "We resolved a profile issue with Google",
  monthly_report_review: "We reviewed your monthly performance",
  manual_followup: "We followed up on an improvement action",
};

/* ═══════════════════════════════════════════
   ACTIVITY FEED GENERATOR
   ═══════════════════════════════════════════ */

export interface ActivityFeedItem {
  message: string;
  type: "improvement" | "monitoring" | "growth" | "status";
  date: string;
}

export async function generateClientActivityFeed(clientId: number, limit = 8): Promise<ActivityFeedItem[]> {
  const items: ActivityFeedItem[] = [];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // 1. Completed tasks → "We did X"
  const completedTasks = await db.select({
    task_type: mapguardTasks.task_type,
    completed_at: mapguardTasks.completed_at,
  })
  .from(mapguardTasks)
  .where(and(
    eq(mapguardTasks.client_id, clientId),
    eq(mapguardTasks.status, "completed"),
    gte(mapguardTasks.completed_at, thirtyDaysAgo),
  ))
  .orderBy(desc(mapguardTasks.completed_at))
  .limit(5);

  for (const task of completedTasks) {
    const msg = COMPLETED_MESSAGES[task.task_type];
    if (msg) {
      items.push({
        message: msg,
        type: "improvement",
        date: (task.completed_at || new Date()).toISOString(),
      });
    }
  }

  // 2. Latest snapshot changes → improvements and monitoring signals
  const [latestSnap] = await db.select({
    captured_at: mapguardSnapshots.captured_at,
    changes: mapguardSnapshots.changes,
    review_count: mapguardSnapshots.review_count,
    score_total: mapguardSnapshots.score_total,
  })
  .from(mapguardSnapshots)
  .where(eq(mapguardSnapshots.client_id, clientId))
  .orderBy(desc(mapguardSnapshots.captured_at))
  .limit(1);

  if (latestSnap) {
    const changes = latestSnap.changes as any;
    const capturedAt = (latestSnap.captured_at || new Date()).toISOString();

    // Score improved
    if (changes?.score_delta > 0) {
      items.push({
        message: `Your visibility score improved by ${changes.score_delta} points`,
        type: "growth",
        date: capturedAt,
      });
    }

    // Reviews gained
    if (changes?.reviews_delta > 0) {
      items.push({
        message: `You gained ${changes.reviews_delta} new review${changes.reviews_delta !== 1 ? "s" : ""}`,
        type: "growth",
        date: capturedAt,
      });
    }

    // Rating improved
    if (changes?.rating_delta > 0) {
      items.push({
        message: `Your Google rating improved to ${((latestSnap as any).rating || 0).toFixed(1)}`,
        type: "growth",
        date: capturedAt,
      });
    }

    // Monitoring ran
    items.push({
      message: "We scanned your visibility, rankings, and competitor activity",
      type: "monitoring",
      date: capturedAt,
    });

    // Score/visibility stable or declined (softened)
    if (changes?.score_delta !== undefined && changes.score_delta <= 0 && changes.score_delta > -5) {
      items.push({
        message: "Your profile is stable — we're continuously monitoring and ready to act",
        type: "status",
        date: capturedAt,
      });
    }
  }

  // 3. Active work in progress
  const [activeCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(mapguardTasks)
    .where(and(
      eq(mapguardTasks.client_id, clientId),
      sql`${mapguardTasks.status} IN ('in_progress', 'waiting_supplier')`,
    ));

  if ((activeCount?.count || 0) > 0) {
    items.push({
      message: `We're currently working on ${activeCount!.count} improvement${activeCount!.count !== 1 ? "s" : ""} for your profile`,
      type: "improvement",
      date: new Date().toISOString(),
    });
  }

  // Sort by date (newest first) and limit
  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Deduplicate by message
  const seen = new Set<string>();
  const deduped = items.filter(item => {
    if (seen.has(item.message)) return false;
    seen.add(item.message);
    return true;
  });

  return deduped.slice(0, limit);
}

/* ═══════════════════════════════════════════
   LAST CLIENT-VISIBLE ACTIVITY DATE
   ═══════════════════════════════════════════ */

export async function getLastClientActivityDate(clientId: number): Promise<Date | null> {
  // Most recent: completed task or scan
  const [lastTask] = await db.select({ d: mapguardTasks.completed_at })
    .from(mapguardTasks)
    .where(and(eq(mapguardTasks.client_id, clientId), eq(mapguardTasks.status, "completed")))
    .orderBy(desc(mapguardTasks.completed_at)).limit(1);

  const [lastScan] = await db.select({ d: mapguardSnapshots.captured_at })
    .from(mapguardSnapshots)
    .where(eq(mapguardSnapshots.client_id, clientId))
    .orderBy(desc(mapguardSnapshots.captured_at)).limit(1);

  const dates = [lastTask?.d, lastScan?.d].filter(Boolean) as Date[];
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map(d => d.getTime())));
}

/* ═══════════════════════════════════════════
   WEEKLY SOFT UPDATE EMAIL
   ═══════════════════════════════════════════ */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendWeeklyUpdate(clientId: number, email: string, businessName: string): Promise<boolean> {
  const feed = await generateClientActivityFeed(clientId, 4);

  // Build 2-3 bullet highlights
  const bullets = feed.length > 0
    ? feed.slice(0, 3).map(f => f.message)
    : ["Your profile remains stable this week", "We're continuously monitoring your ranking and competitors"];

  // Always end with reassurance
  bullets.push("No action needed from you — we handle everything");

  // Phase-2: align with monthly-report fallback chain so weekly emails
  // and monthly reports point at the same domain.
  const portalUrl = process.env.APP_URL
    || process.env.APP_PUBLIC_URL
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://wefixtrades.com");

  const subject = `Your weekly visibility update — ${businessName}`;

  const bulletHtml = bullets.map(b => `<li style="margin-bottom:6px;color:#374151;font-size:14px;line-height:1.6;">${esc(b)}</li>`).join("");

  const html = `<!DOCTYPE html>
<html><body style="font-family:'Inter',Arial,sans-serif;margin:0;padding:0;background:#F3F4F6;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="padding:20px 28px;background:#2D6A4F;">
    <p style="color:#d1fae5;font-size:11px;font-weight:700;letter-spacing:0.05em;margin:0;">MAPGUARD WEEKLY UPDATE</p>
    <p style="color:#ffffff;font-size:16px;font-weight:600;margin:6px 0 0;">${esc(businessName)}</p>
  </td></tr>
  <tr><td style="padding:24px 28px;">
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">Here's what happened with your Google visibility this week:</p>
    <ul style="margin:0 0 20px;padding-left:18px;line-height:1.7;">${bulletHtml}</ul>
  </td></tr>
  <tr><td style="padding:0 28px 24px;text-align:center;">
    <a href="${portalUrl}/portal/mapguard" style="display:inline-block;background:#2D6A4F;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Your Dashboard</a>
  </td></tr>
  <tr><td style="padding:12px 28px;background:#f9fafb;text-align:center;border-top:1px solid #e5e7eb;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">MapGuard Weekly Update &middot; WeFixTrades</p>
  </td></tr>
</table>
</body></html>`;

  const transporter = getEmailTransporter();
  if (!transporter) return false;

  try {
    await transporter.sendMail({
      from: `"MapGuard" <${getFromAddress()}>`,
      to: email,
      subject,
      html,
    });
    return true;
  } catch (err: any) {
    log.error(`[mapguard-retention] Weekly email failed for ${businessName}:`, err.message);
    return false;
  }
}

/* ═══════════════════════════════════════════
   BATCH WEEKLY UPDATES
   ═══════════════════════════════════════════ */

export async function sendAllWeeklyUpdates(): Promise<{ sent: number; skipped: number; errors: number }> {
  const activeClients = await db.select({
    client_id: clients.id,
    contact_email: clients.contact_email,
    business_name: clients.business_name,
  })
  .from(clientServices)
  .innerJoin(clients, eq(clientServices.client_id, clients.id))
  .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
  .where(and(
    eq(clientServices.status, "active"),
    eq(clientServices.enabled, true),
    sql`${serviceCatalog.id} LIKE 'mapguard%'`,
    sql`${clients.contact_email} IS NOT NULL AND ${clients.contact_email} != ''`,
  ));

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const client of activeClients) {
    if (!client.contact_email) { skipped++; continue; }
    const ok = await sendWeeklyUpdate(client.client_id, client.contact_email, client.business_name);
    if (ok) sent++;
    else errors++;
  }

  log.info(`[mapguard-retention] Weekly updates: ${sent} sent, ${skipped} skipped, ${errors} errors`);
  return { sent, skipped, errors };
}
