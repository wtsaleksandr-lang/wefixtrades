/**
 * ReputationShield monthly/periodic review report.
 * Aggregates real data per client and builds an HTML email.
 */

import { db } from "../db";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { monitoredReviews, reviewRequests, clients } from "@shared/schema";
import { getEmailTransporter, getFromAddress } from "./emailTransport";

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
    s += `<span style="color:${i <= rating ? "#FBBF24" : "#D1D5DB"};font-size:16px;">&#9733;</span>`;
  }
  return s;
}

export function buildReportEmailHtml(data: ReportData, portalUrl: string): { subject: string; html: string } {
  const subject = `Your review report for ${esc(data.businessName)} — ${data.periodLabel}`;

  const metricRow = (label: string, value: string | number, color?: string) =>
    `<tr>
      <td style="padding:8px 0;font-size:14px;color:#6B7280;border-bottom:1px solid #F3F4F6;">${label}</td>
      <td style="padding:8px 0;font-size:14px;font-weight:600;color:${color || "#1a1a2e"};text-align:right;border-bottom:1px solid #F3F4F6;">${value}</td>
    </tr>`;

  const bestReviewSection = data.bestReview
    ? `<tr><td style="padding:20px 28px;">
        <div style="background:#F0FFF4;border:1px solid #BBF7D0;border-radius:8px;padding:14px 16px;">
          <div style="margin-bottom:6px;">${starsHtml(data.bestReview.rating)}</div>
          <p style="font-size:13px;color:#166534;line-height:1.5;margin:0 0 6px;">&ldquo;${esc(data.bestReview.text)}&rdquo;</p>
          <p style="font-size:12px;color:#6B7280;margin:0;">— ${esc(data.bestReview.reviewerName)}</p>
        </div>
      </td></tr>`
    : "";

  const attentionSection = data.lowRatingNoResponse > 0
    ? `<tr><td style="padding:0 28px 16px;">
        <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#991B1B;line-height:1.5;">
          <strong>${data.lowRatingNoResponse}</strong> low-rating review${data.lowRatingNoResponse !== 1 ? "s" : ""} still need${data.lowRatingNoResponse === 1 ? "s" : ""} a response. Replying quickly shows customers you care.
        </div>
      </td></tr>`
    : "";

  const noDataNote = data.newReviewsCount === 0 && data.requestsSent === 0
    ? `<tr><td style="padding:0 28px 16px;">
        <p style="font-size:13px;color:#6B7280;line-height:1.5;">No new activity this period. Review requests will generate more reviews over time.</p>
      </td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
  <!-- Header -->
  <tr><td style="padding:24px 28px;background:#1A1A2E;">
    <div style="font-size:18px;font-weight:800;color:#FFFFFF;">ReputationShield</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:2px;">Review Report for ${esc(data.businessName)}</div>
  </td></tr>

  <!-- Period -->
  <tr><td style="padding:20px 28px 4px;">
    <div style="font-size:12px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.04em;">${esc(data.periodLabel)}</div>
  </td></tr>

  <!-- Summary -->
  <tr><td style="padding:12px 28px 4px;">
    <div style="display:flex;gap:16px;text-align:center;">
      <div style="flex:1;background:#F9FAFB;border-radius:8px;padding:14px 8px;">
        <div style="font-size:24px;font-weight:700;color:#1a1a2e;">${data.averageRating}</div>
        <div style="margin-top:2px;">${starsHtml(Math.round(data.averageRating))}</div>
        <div style="font-size:11px;color:#6B7280;margin-top:4px;">Average Rating</div>
      </div>
    </div>
  </td></tr>

  <!-- Metrics table -->
  <tr><td style="padding:16px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${metricRow("New reviews this period", data.newReviewsCount > 0 ? `+${data.newReviewsCount}` : "0", data.newReviewsCount > 0 ? "#16A34A" : undefined)}
      ${metricRow("Total tracked reviews", data.totalReviews)}
      ${metricRow("Review requests sent", data.requestsSent)}
      ${data.feedbackCaptured > 0 ? metricRow("Issues captured privately", data.feedbackCaptured, "#7C3AED") : ""}
      ${data.routedPositive > 0 ? metricRow("Happy customers sent to Google", data.routedPositive, "#16A34A") : ""}
      ${metricRow("Reviews awaiting reply", data.reviewsWithoutResponse, data.reviewsWithoutResponse > 0 ? "#F59E0B" : undefined)}
    </table>
  </td></tr>

  ${bestReviewSection}
  ${attentionSection}
  ${noDataNote}

  <!-- CTA -->
  <tr><td style="padding:8px 28px 24px;text-align:center;">
    <a href="${portalUrl}/portal/reviews" style="display:inline-block;background:#00D4C8;color:#1A1A2E;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;">
      View Full Dashboard
    </a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:16px 28px;background:#F9FAFB;text-align:center;">
    <p style="font-size:11px;color:#9CA3AF;margin:0;">Sent by ReputationShield &bull; WeFixTrades</p>
    <p style="font-size:10px;color:#D1D5DB;margin:4px 0 0;">You can adjust report settings in your portal.</p>
  </td></tr>
</table>
</td></tr>
</table>
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
