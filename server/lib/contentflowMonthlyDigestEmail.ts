/**
 * ContentFlow Monthly Recap email — Wave 75.
 *
 * Sent by `contentflowMonthlyDigest` worker on the 1st of each month.
 * Subject format: "Your ContentFlow report — <Month Year>: X posts, Y%↑".
 *
 * Composition mirrors webcareMonthlyDigestEmail (template-string + helper
 * functions, no React/MJML). Hero KPI is the monthly-bar card (posts
 * published / month, 6 months, current highlighted). Secondary is the
 * content-type donut (article / social_post / image / video). The
 * top-day sparkline-with-peak card is included only when real-data is
 * present — per the Wave 75 brief, monthly recaps skip illustrative
 * cards to avoid customer confusion.
 *
 * Closes the "what did ContentFlow actually do for me this month?"
 * reporting gap surfaced alongside Wave 31 (WebCare digest).
 */

import { db } from "../db";
import { eq } from "drizzle-orm";
import { clients } from "@shared/schemas/adminCrm";
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { isEmailUnsubscribed } from "./unsubscribeStorage";
import { createLogger } from "./logger";
import {
  generateMonthlyBarSeriesPng,
  generateDonutChartPng,
  generateSparklineWithPeakPng,
} from "../services/emailCharts";
import {
  buildReportShell,
  buildReportHero,
  buildMonthlyBarCard,
  buildDonutCard,
  buildSparklinePeakCard,
  buildRecommendations,
  buildCtaButton,
  buildMetricGlossary,
  deriveHeaderBadge,
  type HeaderBadge,
} from "./reportShell";
import {
  computeContentflowMonthlySeries,
  computeContentflowContentTypeSegments,
  computeContentflowTopPostEngagement,
} from "../routes/portal/contentflowWave73KpiStats";

const log = createLogger("ContentFlowDigest");

/* ─── Public types ─── */

export interface ContentflowMonthlyDigestData {
  client_id: number;
  business_name: string;
  recipient_email: string;
  period_label: string; // "May 2026"
  monthly: Awaited<ReturnType<typeof computeContentflowMonthlySeries>>;
  segments: Awaited<ReturnType<typeof computeContentflowContentTypeSegments>>;
  peak: Awaited<ReturnType<typeof computeContentflowTopPostEngagement>>;
}

export interface DigestSendResult {
  sent: boolean;
  reason?: string;
  posts_this_month: number;
}

/* ─── Helpers ─── */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pctChange(curr: number, prev: number): {
  shown: boolean;
  pctText: string;
  rose: boolean;
  good: boolean;
} {
  if (prev <= 0) return { shown: false, pctText: "", rose: false, good: true };
  const change = ((curr - prev) / prev) * 100;
  if (Math.abs(change) < 1) {
    return { shown: false, pctText: "", rose: false, good: true };
  }
  const rose = change > 0;
  return {
    shown: true,
    pctText: `${Math.round(Math.abs(change))}%`,
    rose,
    good: rose, // higher-is-better for content published
  };
}

/* ─── Compile ─── */

/**
 * Pull current data for a client's ContentFlow monthly digest. Uses the
 * Wave 73a compute functions (real / illustrative auto-detect). When the
 * helpers return illustrative-only data for the monthly hero card, we
 * treat the customer as "no activity this month" — caller skips the send.
 */
export async function compileContentflowMonthlyDigest(
  clientId: number,
  periodLabel: string,
): Promise<{
  monthly: Awaited<ReturnType<typeof computeContentflowMonthlySeries>>;
  segments: Awaited<ReturnType<typeof computeContentflowContentTypeSegments>>;
  peak: Awaited<ReturnType<typeof computeContentflowTopPostEngagement>>;
}> {
  const monthly = await computeContentflowMonthlySeries(clientId, 6);
  const segments = await computeContentflowContentTypeSegments(clientId);
  const peak = await computeContentflowTopPostEngagement(clientId);
  return { monthly, segments, peak };
}

/* ─── Compose ─── */

interface ComposeOpts {
  data: ContentflowMonthlyDigestData;
  portalUrl: string;
  monthlyChartUrl: string | null;
  segmentsChartUrl: string | null;
  peakChartUrl: string | null;
}

export function composeContentflowMonthlyDigest(o: ComposeOpts): {
  subject: string;
  html: string;
  badge: HeaderBadge;
  posts_this_month: number;
  pct_change_text: string;
} {
  const d = o.data;
  const bars = d.monthly.data;
  const current = bars[bars.length - 1]?.value ?? 0;
  const prior = bars[bars.length - 2]?.value ?? 0;
  const delta = pctChange(current, prior);

  const badge: HeaderBadge = deriveHeaderBadge({
    primaryDelta: delta,
    critical: current === 0,
  });

  // Subject + headline scaling on the strongest signal
  const subject = delta.shown
    ? `Your ContentFlow ${d.period_label} report — ${current} post${current === 1 ? "" : "s"}, ${delta.pctText}${delta.rose ? "↑" : "↓"}`
    : `Your ContentFlow ${d.period_label} report — ${current} post${current === 1 ? "" : "s"}`;

  const headline = current > 0
    ? `${current} post${current === 1 ? "" : "s"} published this month`
    : "Publishing paused this month";

  const summary = (() => {
    if (current >= 12) {
      return `Strong publishing month — ${current} pieces went live${delta.shown && delta.rose ? `, up ${delta.pctText} vs the prior month` : ""}. Keep the cadence steady.`;
    }
    if (current > 0) {
      return `${current} piece${current === 1 ? "" : "s"} shipped this month${delta.shown ? ` — ${delta.rose ? "up" : "down"} ${delta.pctText} vs prior month` : ""}.`;
    }
    return "No publishes registered this period. We'll regenerate the topic bank and queue fresh drafts for next cycle.";
  })();

  /* ─── Hero KPI: monthly-bar (real only — caller skips send if zero) ─── */
  const monthlyCard = buildMonthlyBarCard({
    chartUrl: o.monthlyChartUrl,
    title: "Posts published per month",
    bars: bars.map((b) => ({
      label: b.label,
      value: b.value,
      highlight: b.highlighted === true,
    })),
    caption: delta.shown
      ? `${current} this month — ${delta.pctText} ${delta.rose ? "higher" : "lower"} vs prior month.`
      : `${current} post${current === 1 ? "" : "s"} this month.`,
  });

  /* ─── Secondary: content-type donut (only when real data) ─── */
  const segmentsCard = d.segments.data_status === "real"
    ? buildDonutCard({
        chartUrl: o.segmentsChartUrl,
        title: "Content type mix",
        segments: d.segments.data,
      })
    : "";

  /* ─── Tertiary: top-day sparkline (only when real data) ─── */
  const peakCard = d.peak.data_status === "real"
    ? buildSparklinePeakCard({
        chartUrl: o.peakChartUrl,
        title: "Top publishing day (last 14 days)",
        data: d.peak.data,
        peakIndex: d.peak.peakIndex,
        peakLabel: d.peak.peakLabel,
      })
    : "";

  /* ─── Recommendations ─── */
  const recs: string[] = [];
  if (current === 0) {
    recs.push("Resume the publishing cadence — we'll generate a fresh batch of drafts and queue them for your approval.");
  } else if (current < 4) {
    recs.push("Step up to 4+ pieces/month — top-quartile trades see compounding traffic lifts above that threshold.");
  }
  if (d.segments.data_status === "real") {
    const dominantSegment = d.segments.data
      .slice()
      .sort((a, b) => (b.value || 0) - (a.value || 0))[0];
    if (dominantSegment && d.segments.data.length === 1) {
      recs.push(`You're concentrated on ${dominantSegment.label.toLowerCase()} — try adding a second content type next month to diversify reach.`);
    }
  }
  if (delta.shown && delta.good && parseInt(delta.pctText, 10) >= 20) {
    recs.push("Cadence is accelerating — keep the topic bank fresh so quality holds at the higher volume.");
  }
  if (recs.length === 0) {
    recs.push("Hold the cadence steady — we'll keep generating, scoring, and publishing on the established schedule.");
  }

  const body = [
    buildReportHero({
      eyebrow: "Monthly content recap",
      headline,
      period: d.period_label,
      businessName: d.business_name,
      summary,
    }),
    monthlyCard,
    segmentsCard,
    peakCard,
    buildRecommendations({ title: "What we're doing next month", items: recs.slice(0, 3) }),
    buildCtaButton({ href: `${o.portalUrl}/portal/contentflow`, label: "Open your ContentFlow dashboard" }),
    buildMetricGlossary({
      metrics: ["Posts published"],
      customDefs: {
        "Posts published": "Content pieces (articles, social posts, images, videos) we shipped for you this period.",
      },
    }),
  ]
    .filter(Boolean)
    .join("");

  const html = buildReportShell({
    product: "ContentFlow Report",
    badge,
    body,
    recipientEmail: d.recipient_email,
  });

  return {
    subject,
    html,
    badge,
    posts_this_month: current,
    pct_change_text: delta.shown ? `${delta.rose ? "+" : "-"}${delta.pctText}` : "",
  };
}

/* ─── Send ─── */

const CONTENTFLOW_FROM_NAME = "WeFixTrades ContentFlow";

/**
 * Send a ContentFlow monthly digest to one client. Fail-safe — returns
 * a structured result instead of throwing, so a single bad send never
 * blocks the worker's batch.
 */
export async function sendContentflowMonthlyDigest(opts: {
  clientId: number;
  recipientEmail: string;
  businessName: string;
  periodLabel: string;
}): Promise<DigestSendResult> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("SMTP not configured — skipping ContentFlow digest");
    return { sent: false, reason: "smtp_not_configured", posts_this_month: 0 };
  }

  if (await isEmailUnsubscribed(opts.recipientEmail)) {
    return { sent: false, reason: "recipient_unsubscribed", posts_this_month: 0 };
  }

  const { monthly, segments, peak } = await compileContentflowMonthlyDigest(
    opts.clientId,
    opts.periodLabel,
  );

  // Empty-data skip: real-data hero with zero current month → skip send.
  // Per Wave 75 brief: don't send "you had 0 posts this month".
  const currentValue = monthly.data[monthly.data.length - 1]?.value ?? 0;
  if (monthly.data_status === "illustrative" || currentValue === 0) {
    return { sent: false, reason: "no_activity_this_month", posts_this_month: 0 };
  }

  const baseUrl =
    process.env.APP_URL ||
    process.env.APP_PUBLIC_URL ||
    "https://wefixtrades.com";

  const periodSlug = opts.periodLabel.replace(/\s+/g, "-").toLowerCase();

  // Pre-render the KPI PNGs. Chart generation failures are graceful —
  // the cards still render with text-only fallbacks.
  const monthlyChartUrl = await generateMonthlyBarSeriesPng({
    cacheKey: `contentflow-monthly-c${opts.clientId}-${periodSlug}`,
    bars: monthly.data.map((b) => ({
      label: b.label,
      value: b.value,
      highlight: b.highlighted === true,
    })),
  });

  const segmentsChartUrl = segments.data_status === "real"
    ? await generateDonutChartPng({
        cacheKey: `contentflow-segments-c${opts.clientId}-${periodSlug}`,
        segments: segments.data,
      })
    : null;

  const peakChartUrl = peak.data_status === "real"
    ? await generateSparklineWithPeakPng({
        cacheKey: `contentflow-peak-c${opts.clientId}-${periodSlug}`,
        data: peak.data,
        peakIndex: peak.peakIndex,
        peakLabel: peak.peakLabel,
      })
    : null;

  const data: ContentflowMonthlyDigestData = {
    client_id: opts.clientId,
    business_name: opts.businessName,
    recipient_email: opts.recipientEmail,
    period_label: opts.periodLabel,
    monthly,
    segments,
    peak,
  };

  const { subject, html, posts_this_month } = composeContentflowMonthlyDigest({
    data,
    portalUrl: baseUrl,
    monthlyChartUrl,
    segmentsChartUrl,
    peakChartUrl,
  });

  try {
    await transporter.sendMail({
      from: `${CONTENTFLOW_FROM_NAME} <${getFromAddress()}>`,
      to: opts.recipientEmail,
      replyTo: "support@wefixtrades.com",
      subject,
      html,
    });
    log.info("ContentFlow digest sent", {
      clientId: opts.clientId,
      period: opts.periodLabel,
    });
    return { sent: true, posts_this_month };
  } catch (err: any) {
    log.error("ContentFlow digest send failed", {
      clientId: opts.clientId,
      error: err?.message,
    });
    return { sent: false, reason: `send_failed: ${err?.message}`, posts_this_month };
  }
}

/* ─── Test/preview helper (unused in prod path) ─── */

/**
 * Lookup the contact email + business name for a client by id. Exposed
 * to keep the worker thin; the worker only needs to know which clients
 * are eligible.
 */
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
