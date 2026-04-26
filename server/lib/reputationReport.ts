/**
 * ReputationShield monthly/periodic review report.
 * Aggregates real data per client and builds an HTML email.
 */

import { db } from "../db";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { monitoredReviews, reviewRequests, clients } from "@shared/schema";
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildLegalFooter } from "./emailFooter";

/* ─── Data Aggregation ─── */

export interface ReportData {
  businessName: string;
  contactEmail: string;
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  // Reviews
  totalReviews: number;
  averageRating: number;
  newReviewsCount: number;
  reviewsWithoutResponse: number;
  lowRatingNoResponse: number;
  // Requests
  requestsSent: number;
  feedbackCaptured: number;
  routedPositive: number;
  // Highlighted review
  bestReview: { reviewerName: string; rating: number; text: string } | null;
}

export async function aggregateReportData(
  clientId: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<ReportData | null> {
  // Get client
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client || !client.contact_email) return null;

  // Reviews stats (all time)
  const [allTimeStats] = await db.select({
    total: sql<number>`count(*)::int`,
    avgRating: sql<number>`coalesce(round(avg(${monitoredReviews.rating})::numeric, 2), 0)::float`,
    noResponse: sql<number>`count(*) filter (where ${monitoredReviews.response_text} is null)::int`,
    lowNoResponse: sql<number>`count(*) filter (where ${monitoredReviews.rating} <= 2 and ${monitoredReviews.response_text} is null)::int`,
  }).from(monitoredReviews).where(eq(monitoredReviews.client_id, clientId));

  // New reviews in period
  const [periodStats] = await db.select({
    newCount: sql<number>`count(*)::int`,
  }).from(monitoredReviews).where(and(
    eq(monitoredReviews.client_id, clientId),
    gte(monitoredReviews.first_seen_at, periodStart),
  ));

  // Review requests in period
  const [requestStats] = await db.select({
    sent: sql<number>`count(*) filter (where ${reviewRequests.status} != 'pending')::int`,
    feedbackCaptured: sql<number>`count(*) filter (where ${reviewRequests.internal_feedback} is not null)::int`,
    routedPositive: sql<number>`count(*) filter (where ${reviewRequests.status} = 'routed_positive')::int`,
  }).from(reviewRequests).where(and(
    eq(reviewRequests.client_id, clientId),
    gte(reviewRequests.created_at, periodStart),
  ));

  // Best review in period (highest rated, longest text)
  const [bestReview] = await db.select({
    reviewerName: monitoredReviews.reviewer_name,
    rating: monitoredReviews.rating,
    text: monitoredReviews.review_text,
  }).from(monitoredReviews).where(and(
    eq(monitoredReviews.client_id, clientId),
    gte(monitoredReviews.first_seen_at, periodStart),
    sql`${monitoredReviews.rating} >= 4`,
    sql`${monitoredReviews.review_text} is not null`,
    sql`length(${monitoredReviews.review_text}) > 20`,
  )).orderBy(desc(monitoredReviews.rating), sql`length(${monitoredReviews.review_text}) desc`)
    .limit(1);

  // Period label
  const periodLabel = `${periodStart.toLocaleDateString("en-GB", { day: "numeric", month: "long" })} – ${periodEnd.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;

  return {
    businessName: client.business_name,
    contactEmail: client.contact_email,
    periodLabel,
    periodStart,
    periodEnd,
    totalReviews: allTimeStats?.total ?? 0,
    averageRating: allTimeStats?.avgRating ?? 0,
    newReviewsCount: periodStats?.newCount ?? 0,
    reviewsWithoutResponse: allTimeStats?.noResponse ?? 0,
    lowRatingNoResponse: allTimeStats?.lowNoResponse ?? 0,
    requestsSent: requestStats?.sent ?? 0,
    feedbackCaptured: requestStats?.feedbackCaptured ?? 0,
    routedPositive: requestStats?.routedPositive ?? 0,
    bestReview: bestReview?.text ? {
      reviewerName: bestReview.reviewerName,
      rating: bestReview.rating,
      text: bestReview.text.slice(0, 300),
    } : null,
  };
}

/* ─── HTML Email Template ─── */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function starsHtml(rating: number): string {
  let s = "";
  for (let i = 1; i <= 5; i++) {
    s += `<span style="color:${i <= rating ? "#FBBF24" : "#3D434A"};font-size:16px;">&#9733;</span>`;
  }
  return s;
}

export function buildReportEmailHtml(data: ReportData, portalUrl: string): { subject: string; html: string } {
  const subject = `Your review report for ${esc(data.businessName)} — ${data.periodLabel}`;

  const metricRow = (label: string, value: string | number, color?: string) =>
    `<tr>
      <td style="padding:9px 0;font-size:14px;color:#8B919A;border-bottom:1px solid rgba(255,255,255,0.06);">${label}</td>
      <td style="padding:9px 0;font-size:14px;font-weight:700;color:${color || "#F0F0F0"};text-align:right;border-bottom:1px solid rgba(255,255,255,0.06);">${value}</td>
    </tr>`;

  const bestReviewSection = data.bestReview
    ? `<tr><td style="padding:0 28px 18px;">
        <div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.25);border-radius:10px;padding:14px 16px;">
          <div style="margin-bottom:6px;">${starsHtml(data.bestReview.rating)}</div>
          <p style="font-size:13px;color:#86EFAC;line-height:1.55;margin:0 0 6px;">&ldquo;${esc(data.bestReview.text)}&rdquo;</p>
          <p style="font-size:12px;color:#8B919A;margin:0;">— ${esc(data.bestReview.reviewerName)}</p>
        </div>
      </td></tr>`
    : "";

  const attentionSection = data.lowRatingNoResponse > 0
    ? `<tr><td style="padding:0 28px 18px;">
        <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:12px 16px;font-size:13px;color:#FCA5A5;line-height:1.55;">
          <strong style="color:#F0F0F0;">${data.lowRatingNoResponse}</strong> low-rating review${data.lowRatingNoResponse !== 1 ? "s" : ""} still need${data.lowRatingNoResponse === 1 ? "s" : ""} a response. Replying quickly shows customers you care.
        </div>
      </td></tr>`
    : "";

  const noDataNote = data.newReviewsCount === 0 && data.requestsSent === 0
    ? `<tr><td style="padding:0 28px 18px;">
        <p style="font-size:13px;color:#8B919A;line-height:1.55;margin:0;">No new activity this period. Review requests will generate more reviews over time.</p>
      </td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
<div style="background:#0B0F14;padding:40px 16px;">
<div style="max-width:560px;margin:0 auto;">
  <div style="text-align:center;margin-bottom:24px;">
    <span style="display:inline-block;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:12px;font-weight:800;padding:5px 16px;border-radius:999px;letter-spacing:0.06em;">WeFixTrades · ReputationShield</span>
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#151A21;border:1px solid rgba(255,255,255,0.06);border-radius:16px;overflow:hidden;">
  <!-- Header -->
  <tr><td style="padding:24px 28px 18px;border-bottom:1px solid rgba(255,255,255,0.06);">
    <div style="font-size:11px;font-weight:700;color:#66E8FA;text-transform:uppercase;letter-spacing:0.06em;">Review Report</div>
    <div style="font-size:18px;font-weight:700;color:#F0F0F0;margin-top:4px;">${esc(data.businessName)}</div>
    <div style="font-size:12px;color:#8B919A;margin-top:4px;letter-spacing:0.04em;">${esc(data.periodLabel)}</div>
  </td></tr>

  <!-- Average rating block -->
  <tr><td style="padding:20px 28px 8px;">
    <div style="background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:18px;text-align:center;">
      <div style="font-size:32px;font-weight:800;color:#F0F0F0;letter-spacing:-0.5px;">${data.averageRating}</div>
      <div style="margin-top:6px;">${starsHtml(Math.round(data.averageRating))}</div>
      <div style="font-size:11px;color:#8B919A;margin-top:6px;text-transform:uppercase;letter-spacing:0.06em;">Average Rating</div>
    </div>
  </td></tr>

  <!-- Metrics table -->
  <tr><td style="padding:16px 28px 4px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${metricRow("New reviews this period", data.newReviewsCount > 0 ? `+${data.newReviewsCount}` : "0", data.newReviewsCount > 0 ? "#22C55E" : undefined)}
      ${metricRow("Total tracked reviews", data.totalReviews)}
      ${metricRow("Review requests sent", data.requestsSent)}
      ${data.feedbackCaptured > 0 ? metricRow("Issues captured privately", data.feedbackCaptured, "#A78BFA") : ""}
      ${data.routedPositive > 0 ? metricRow("Happy customers sent to Google", data.routedPositive, "#22C55E") : ""}
      ${metricRow("Reviews awaiting reply", data.reviewsWithoutResponse, data.reviewsWithoutResponse > 0 ? "#F59E0B" : undefined)}
    </table>
  </td></tr>
  <tr><td style="height:18px;"></td></tr>

  ${bestReviewSection}
  ${attentionSection}
  ${noDataNote}

  <!-- CTA -->
  <tr><td style="padding:0 28px 28px;text-align:center;">
    <a href="${portalUrl}/portal/reviews" style="display:inline-block;background:#66E8FA;color:#0B0F14;font-size:14px;font-weight:700;padding:13px 28px;border-radius:10px;text-decoration:none;">
      View Full Dashboard
    </a>
    <p style="font-size:11px;color:#555B63;margin:14px 0 0;">You can adjust report settings in your portal.</p>
  </td></tr>
  </table>
  ${buildLegalFooter()}
</div>
</div>
</body></html>`;

  return { subject, html };
}

/* ─── Send Report ─── */

export async function sendReputationReport(data: ReportData, portalUrl: string): Promise<{ ok: boolean; error?: string }> {
  const transporter = getEmailTransporter();
  if (!transporter) return { ok: false, error: "SMTP not configured" };
  if (!data.contactEmail) return { ok: false, error: "No contact email" };

  const { subject, html } = buildReportEmailHtml(data, portalUrl);

  try {
    await transporter.sendMail({
      from: `ReputationShield <${getFromAddress()}>`,
      to: data.contactEmail,
      subject,
      html,
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
