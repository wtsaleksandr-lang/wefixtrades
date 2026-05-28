/**
 * TradeLine Monthly Recap email — Wave 75.
 *
 * Sent by `tradelineMonthlyDigest` worker on the 1st of each month.
 * Subject format: "Your TradeLine report — <Month Year>: X calls handled".
 *
 * Hero KPI: CSAT semi-gauge (last-30-day proxy via answered-share + booking
 * bonus, matching the Wave 73a compute pattern). Secondary: answered-vs-
 * missed two-bar comparison for the calendar month. Tertiary: peak call
 * hour sparkline (rendered only when real data exists).
 *
 * Closes the "what did the AI receptionist do for me this month?"
 * reporting gap. Composition pattern mirrors webcareMonthlyDigestEmail.
 */

import { db } from "../db";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { clients, clientServices } from "@shared/schemas/adminCrm";
import { tradelineCallLog } from "@shared/schemas/adminCrm";
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { isEmailUnsubscribed } from "./unsubscribeStorage";
import { createLogger } from "./logger";
import {
  generateSemiGaugePng,
  generateBarComparisonPng,
  generateSparklineWithPeakPng,
} from "../services/emailCharts";
import {
  buildReportShell,
  buildReportHero,
  buildSemiGaugeCard,
  buildBarComparisonCard,
  buildSparklinePeakCard,
  buildRecommendations,
  buildCtaButton,
  buildMetricGlossary,
  deriveHeaderBadge,
  type HeaderBadge,
} from "./reportShell";
import {
  computeTradelineCsat,
  computeTradelinePeakCallHour,
} from "../routes/portal/tradeline/wave73KpiStats";

const log = createLogger("TradeLineDigest");

/* ─── Public types ─── */

export interface TradelineMonthlyDigestData {
  client_id: number;
  business_name: string;
  recipient_email: string;
  period_label: string;
  csat: Awaited<ReturnType<typeof computeTradelineCsat>>;
  peak: Awaited<ReturnType<typeof computeTradelinePeakCallHour>>;
  calls_total: number;
  calls_answered: number;
  calls_missed: number;
  bookings_captured: number;
  // Approximate hours saved — average answered call duration in seconds
  // × answered count, fenced to whole hours. Only computed when we have
  // real call data.
  approx_hours_saved: number;
}

export interface DigestSendResult {
  sent: boolean;
  reason?: string;
  calls_total: number;
}

/* ─── Compile (calendar-month aggregates over tradeline_call_log) ─── */

export async function compileTradelineMonthlyDigest(
  clientId: number,
  start: Date,
  end: Date,
): Promise<{
  csat: Awaited<ReturnType<typeof computeTradelineCsat>>;
  peak: Awaited<ReturnType<typeof computeTradelinePeakCallHour>>;
  calls_total: number;
  calls_answered: number;
  calls_missed: number;
  bookings_captured: number;
  approx_hours_saved: number;
}> {
  // Reuse Wave 73a computes for the 30-day CSAT proxy + 30-day peak hour.
  const [csat, peak] = await Promise.all([
    computeTradelineCsat(clientId),
    computeTradelinePeakCallHour(clientId),
  ]);

  // Pull this calendar month's call stats from tradeline_call_log via the
  // client's tradeline client_services. If the client has no tradeline
  // services, the monthly aggregates are zeroed.
  const csRows = await db
    .select({ id: clientServices.id })
    .from(clientServices)
    .where(
      and(
        eq(clientServices.client_id, clientId),
        sql`${clientServices.service_id} LIKE 'tradeline%'`,
      ),
    );
  const csIds = csRows.map((r) => r.id);

  if (csIds.length === 0) {
    return {
      csat,
      peak,
      calls_total: 0,
      calls_answered: 0,
      calls_missed: 0,
      bookings_captured: 0,
      approx_hours_saved: 0,
    };
  }

  const csInList = sql`${tradelineCallLog.client_service_id} IN (${sql.join(
    csIds.map((id) => sql`${id}`),
    sql`, `,
  )})`;

  const [agg] = await db
    .select({
      total: sql<number>`count(*)::int`,
      answered: sql<number>`count(*) FILTER (WHERE outcome IN ('answered','transferred'))::int`,
      missed: sql<number>`count(*) FILTER (WHERE outcome IN ('missed','voicemail','failed'))::int`,
      booked: sql<number>`count(*) FILTER (WHERE (transcript_json->>'booking_created' = 'true' OR summary ILIKE '%booked%' OR summary ILIKE '%appointment%'))::int`,
      answered_seconds: sql<number>`COALESCE(SUM(CASE WHEN outcome IN ('answered','transferred') THEN COALESCE(duration_seconds, 0) ELSE 0 END), 0)::int`,
    })
    .from(tradelineCallLog)
    .where(
      and(
        csInList,
        gte(tradelineCallLog.created_at, start),
        lt(tradelineCallLog.created_at, end),
      ),
    );

  const callsTotal = Number(agg?.total ?? 0);
  const callsAnswered = Number(agg?.answered ?? 0);
  const callsMissed = Number(agg?.missed ?? 0);
  const bookingsCaptured = Number(agg?.booked ?? 0);
  const answeredSeconds = Number(agg?.answered_seconds ?? 0);
  // Hours-saved estimate: every answered call we handled was a call the
  // trade did NOT have to take themselves. Round to whole hours.
  const approxHoursSaved = Math.floor(answeredSeconds / 3600);

  return {
    csat,
    peak,
    calls_total: callsTotal,
    calls_answered: callsAnswered,
    calls_missed: callsMissed,
    bookings_captured: bookingsCaptured,
    approx_hours_saved: approxHoursSaved,
  };
}

/* ─── Compose ─── */

interface ComposeOpts {
  data: TradelineMonthlyDigestData;
  portalUrl: string;
  csatChartUrl: string | null;
  callsChartUrl: string | null;
  peakChartUrl: string | null;
}

export function composeTradelineMonthlyDigest(o: ComposeOpts): {
  subject: string;
  html: string;
  badge: HeaderBadge;
} {
  const d = o.data;

  const csatValue = d.csat.value;
  const isCsatReal = d.csat.data_status === "real";
  const csatLow = isCsatReal && csatValue < 80;

  const badge: HeaderBadge = deriveHeaderBadge({
    primaryDelta: { shown: false, pctText: "", rose: false, good: true },
    critical: csatLow,
  });

  // Subject + headline scaling on the strongest signal.
  const subject = d.calls_total > 0
    ? `Your TradeLine ${d.period_label} report — ${d.calls_total} call${d.calls_total === 1 ? "" : "s"} handled`
    : `Your TradeLine ${d.period_label} report`;

  const headline = d.calls_total > 0
    ? `${d.calls_total} call${d.calls_total === 1 ? "" : "s"} handled this month`
    : "TradeLine standing by";

  const summary = (() => {
    if (d.calls_total >= 20) {
      return `Busy month. ${d.calls_answered} answered, ${d.bookings_captured} booking${d.bookings_captured === 1 ? "" : "s"} captured${d.approx_hours_saved > 0 ? `, ~${d.approx_hours_saved} hour${d.approx_hours_saved === 1 ? "" : "s"} saved` : ""}.`;
    }
    if (d.calls_total > 0) {
      return `${d.calls_answered} of ${d.calls_total} call${d.calls_total === 1 ? "" : "s"} answered${d.bookings_captured > 0 ? `, ${d.bookings_captured} booking${d.bookings_captured === 1 ? "" : "s"} captured` : ""}.`;
    }
    return "No inbound calls registered this period. The AI receptionist remains live and ready.";
  })();

  /* ─── Hero KPI: CSAT semi-gauge ─── */
  // Show only when real data exists — otherwise the gauge is misleading.
  const csatCard = isCsatReal
    ? buildSemiGaugeCard({
        chartUrl: o.csatChartUrl,
        label: "Customer satisfaction score (CSAT)",
        value: csatValue,
        max: 100,
        verdict: d.csat.verdict,
        advice: d.csat.advice,
      })
    : "";

  /* ─── Secondary: answered vs missed two-bar comparison ─── */
  // Show only when we have real calls.
  const callsCard = d.calls_total > 0
    ? buildBarComparisonCard({
        chartUrl: o.callsChartUrl,
        title: "Calls answered vs missed",
        items: [
          { label: "Answered", value: d.calls_answered, tone: "good" },
          { label: "Missed", value: d.calls_missed, tone: "warn" },
        ],
      })
    : "";

  /* ─── Tertiary: peak call hour sparkline ─── */
  const peakCard = d.peak.data_status === "real"
    ? buildSparklinePeakCard({
        chartUrl: o.peakChartUrl,
        title: "Peak call hour (last 30 days)",
        data: d.peak.data,
        peakIndex: d.peak.peakIndex,
        peakLabel: d.peak.peakLabel,
      })
    : "";

  /* ─── Recommendations ─── */
  const recs: string[] = [];
  if (csatLow) {
    recs.push("CSAT is below the 80 threshold — review the AI escalation rules and recent transcripts; we'll tune the prompt next cycle.");
  }
  if (d.calls_total > 0 && d.calls_missed > d.calls_answered) {
    recs.push("Missed-call ratio is elevated — extend AI coverage hours or enable after-hours voicemail capture.");
  }
  if (d.calls_total >= 10 && d.bookings_captured / Math.max(d.calls_total, 1) < 0.2) {
    recs.push("Booking-capture rate is below 20% — consider adding a stronger booking CTA into the AI greeting.");
  }
  if (recs.length === 0 && d.calls_total > 0) {
    recs.push("Hold the configuration steady — answer rates and CSAT are in a healthy range.");
  }
  if (recs.length === 0) {
    recs.push("Drive more inbound calls to TradeLine — every answered call is a billable conversation saved.");
  }

  const body = [
    buildReportHero({
      eyebrow: "Monthly call recap",
      headline,
      period: d.period_label,
      businessName: d.business_name,
      summary,
    }),
    csatCard,
    callsCard,
    peakCard,
    buildRecommendations({ title: "What we're tuning next month", items: recs.slice(0, 3) }),
    buildCtaButton({ href: `${o.portalUrl}/portal/tradeline`, label: "Open your TradeLine dashboard" }),
    buildMetricGlossary({
      metrics: ["CSAT", "Calls answered", "Bookings captured"],
      customDefs: {
        "CSAT": "Customer satisfaction score — derived from answered-share and booking rate over the last 30 days.",
        "Calls answered": "Inbound calls handled by your AI receptionist or routed to staff this period.",
        "Bookings captured": "Calls that ended with an appointment, deposit, or scheduled callback.",
      },
    }),
  ]
    .filter(Boolean)
    .join("");

  const html = buildReportShell({
    product: "TradeLine Report",
    badge,
    body,
    recipientEmail: d.recipient_email,
  });

  return { subject, html, badge };
}

/* ─── Send ─── */

const TRADELINE_FROM_NAME = "WeFixTrades TradeLine";

export async function sendTradelineMonthlyDigest(opts: {
  clientId: number;
  recipientEmail: string;
  businessName: string;
  periodLabel: string;
  /** Bounds for the calendar-month aggregate. */
  monthStart: Date;
  monthEnd: Date;
}): Promise<DigestSendResult> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("SMTP not configured — skipping TradeLine digest");
    return { sent: false, reason: "smtp_not_configured", calls_total: 0 };
  }

  if (await isEmailUnsubscribed(opts.recipientEmail)) {
    return { sent: false, reason: "recipient_unsubscribed", calls_total: 0 };
  }

  const compiled = await compileTradelineMonthlyDigest(
    opts.clientId,
    opts.monthStart,
    opts.monthEnd,
  );

  // Empty-data skip: no calls and no real CSAT data → skip the send.
  if (compiled.calls_total === 0 && compiled.csat.data_status !== "real") {
    return { sent: false, reason: "no_activity_this_month", calls_total: 0 };
  }

  const baseUrl =
    process.env.APP_URL ||
    process.env.APP_PUBLIC_URL ||
    "https://wefixtrades.com";

  const periodSlug = opts.periodLabel.replace(/\s+/g, "-").toLowerCase();

  const csatChartUrl = compiled.csat.data_status === "real"
    ? await generateSemiGaugePng({
        cacheKey: `tradeline-csat-c${opts.clientId}-${periodSlug}`,
        value: compiled.csat.value,
        max: 100,
      })
    : null;

  const callsChartUrl = compiled.calls_total > 0
    ? await generateBarComparisonPng({
        cacheKey: `tradeline-calls-c${opts.clientId}-${periodSlug}`,
        items: [
          { label: "Answered", value: compiled.calls_answered, color: "#10b981" },
          { label: "Missed", value: compiled.calls_missed, color: "#ef4444" },
        ],
      })
    : null;

  const peakChartUrl = compiled.peak.data_status === "real"
    ? await generateSparklineWithPeakPng({
        cacheKey: `tradeline-peak-c${opts.clientId}-${periodSlug}`,
        data: compiled.peak.data,
        peakIndex: compiled.peak.peakIndex,
        peakLabel: compiled.peak.peakLabel,
      })
    : null;

  const data: TradelineMonthlyDigestData = {
    client_id: opts.clientId,
    business_name: opts.businessName,
    recipient_email: opts.recipientEmail,
    period_label: opts.periodLabel,
    csat: compiled.csat,
    peak: compiled.peak,
    calls_total: compiled.calls_total,
    calls_answered: compiled.calls_answered,
    calls_missed: compiled.calls_missed,
    bookings_captured: compiled.bookings_captured,
    approx_hours_saved: compiled.approx_hours_saved,
  };

  const { subject, html } = composeTradelineMonthlyDigest({
    data,
    portalUrl: baseUrl,
    csatChartUrl,
    callsChartUrl,
    peakChartUrl,
  });

  try {
    await transporter.sendMail({
      from: `${TRADELINE_FROM_NAME} <${getFromAddress()}>`,
      to: opts.recipientEmail,
      replyTo: "support@wefixtrades.com",
      subject,
      html,
    });
    log.info("TradeLine digest sent", {
      clientId: opts.clientId,
      period: opts.periodLabel,
    });
    return { sent: true, calls_total: compiled.calls_total };
  } catch (err: any) {
    log.error("TradeLine digest send failed", {
      clientId: opts.clientId,
      error: err?.message,
    });
    return {
      sent: false,
      reason: `send_failed: ${err?.message}`,
      calls_total: compiled.calls_total,
    };
  }
}

/** Helper exposed for the worker — keeps the worker thin. */
export async function lookupClientContact(
  clientId: number,
): Promise<{ business_name: string; contact_email: string | null } | null> {
  const [row] = await db
    .select({
      business_name: clients.business_name,
      contact_email: clients.contact_email,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  return row ?? null;
}
