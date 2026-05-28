/**
 * QuoteQuick Monthly Recap email — Wave 75.
 *
 * Sent by `quotequickMonthlyDigest` worker on the 1st of each month.
 * Subject: "Your QuoteQuick report — <Month Year>: $X captured".
 *
 * Hero KPI: conversion-rate semi-gauge (views → completions over last
 * 30 days). Secondary: best revenue day sparkline-with-peak (last 14d).
 * Tertiary: monthly quotes bar series (6 months, current highlighted).
 *
 * Closes the "what did QuoteQuick generate for me this month?" reporting
 * gap. Composition pattern mirrors webcareMonthlyDigestEmail.
 */

import { db } from "../db";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { clients } from "@shared/schemas/adminCrm";
import { calculators, leads } from "@shared/schemas/db";
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { isEmailUnsubscribed } from "./unsubscribeStorage";
import { createLogger } from "./logger";
import {
  generateSemiGaugePng,
  generateSparklineWithPeakPng,
  generateMonthlyBarSeriesPng,
} from "../services/emailCharts";
import {
  buildReportShell,
  buildReportHero,
  buildSemiGaugeCard,
  buildSparklinePeakCard,
  buildMonthlyBarCard,
  buildRecommendations,
  buildCtaButton,
  buildMetricGlossary,
  deriveHeaderBadge,
  type HeaderBadge,
} from "./reportShell";
import {
  computeQuotequickConversionRate,
  computeQuotequickBestRevenueDay,
  computeQuotequickMonthlyQuotes,
} from "../routes/portal/quotequick/wave73KpiStats";

const log = createLogger("QuoteQuickDigest");

/* ─── Public types ─── */

export interface QuotequickMonthlyDigestData {
  client_id: number;
  business_name: string;
  recipient_email: string;
  period_label: string;
  conversion: Awaited<ReturnType<typeof computeQuotequickConversionRate>>;
  peak: Awaited<ReturnType<typeof computeQuotequickBestRevenueDay>>;
  monthly: Awaited<ReturnType<typeof computeQuotequickMonthlyQuotes>>;
  // Calendar-month aggregates
  quotes_generated: number;
  quotes_completed: number;
  deposits_captured_cents: number;
}

export interface DigestSendResult {
  sent: boolean;
  reason?: string;
  quotes_generated: number;
}

/* ─── Compile ─── */

export async function compileQuotequickMonthlyDigest(
  clientId: number,
  start: Date,
  end: Date,
): Promise<{
  conversion: Awaited<ReturnType<typeof computeQuotequickConversionRate>>;
  peak: Awaited<ReturnType<typeof computeQuotequickBestRevenueDay>>;
  monthly: Awaited<ReturnType<typeof computeQuotequickMonthlyQuotes>>;
  quotes_generated: number;
  quotes_completed: number;
  deposits_captured_cents: number;
}> {
  const [conversion, peak, monthly] = await Promise.all([
    computeQuotequickConversionRate(clientId),
    computeQuotequickBestRevenueDay(clientId),
    computeQuotequickMonthlyQuotes(clientId, 6),
  ]);

  // Resolve the client's calculators via clients.user_id → calculators.user_id
  // (matching the Wave 73a pattern). Then aggregate the calendar-month
  // leads to drive the bullet highlights.
  const [client] = await db
    .select({ user_id: clients.user_id })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  let quotesGenerated = 0;
  let quotesCompleted = 0;
  let depositsCapturedCents = 0;

  if (client?.user_id) {
    const calcs = await db
      .select({ id: calculators.id })
      .from(calculators)
      .where(eq(calculators.user_id, client.user_id));
    const calcIds = calcs.map((c) => c.id);

    if (calcIds.length > 0) {
      const monthlyLeads = await db
        .select({
          status: leads.status,
          quote_amount: leads.quote_amount,
          won_value: leads.won_value,
        })
        .from(leads)
        .where(
          and(
            inArray(leads.calculator_id, calcIds),
            gte(leads.created_date, start),
            lt(leads.created_date, end),
          ),
        );

      quotesGenerated = monthlyLeads.length;
      for (const l of monthlyLeads) {
        if (l.status === "deposit_paid" || l.status === "won") {
          quotesCompleted += 1;
          // won_value in cents (P1-3) — fall back to quote_amount when missing.
          depositsCapturedCents += l.won_value ?? l.quote_amount ?? 0;
        } else if (l.status === "qualified" || l.status === "replied") {
          quotesCompleted += 1; // count engaged leads as completion-equivalent
        }
      }
    }
  }

  return {
    conversion,
    peak,
    monthly,
    quotes_generated: quotesGenerated,
    quotes_completed: quotesCompleted,
    deposits_captured_cents: depositsCapturedCents,
  };
}

/* ─── Compose ─── */

function formatUsdFromCents(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 10_000) return `$${(dollars / 1_000).toFixed(0)}k`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}k`;
  return `$${Math.round(dollars).toLocaleString("en-US")}`;
}

interface ComposeOpts {
  data: QuotequickMonthlyDigestData;
  portalUrl: string;
  conversionChartUrl: string | null;
  peakChartUrl: string | null;
  monthlyChartUrl: string | null;
}

export function composeQuotequickMonthlyDigest(o: ComposeOpts): {
  subject: string;
  html: string;
  badge: HeaderBadge;
} {
  const d = o.data;

  const isConvReal = d.conversion.data_status === "real";
  const conversionValue = d.conversion.value;
  const conversionLow = isConvReal && conversionValue < 30;

  const badge: HeaderBadge = deriveHeaderBadge({
    primaryDelta: { shown: false, pctText: "", rose: false, good: true },
    critical: conversionLow,
  });

  const depositsStr = formatUsdFromCents(d.deposits_captured_cents);

  // Subject + headline scale on the strongest signal.
  const subject = d.deposits_captured_cents > 0
    ? `Your QuoteQuick ${d.period_label} report — ${depositsStr} captured`
    : d.quotes_generated > 0
      ? `Your QuoteQuick ${d.period_label} report — ${d.quotes_generated} quote${d.quotes_generated === 1 ? "" : "s"} generated`
      : `Your QuoteQuick ${d.period_label} report`;

  const headline = d.quotes_generated > 0
    ? `${d.quotes_generated} quote${d.quotes_generated === 1 ? "" : "s"} generated this month`
    : "QuoteQuick standing by";

  const summary = (() => {
    if (d.deposits_captured_cents > 0) {
      return `${d.quotes_completed} of ${d.quotes_generated} quote${d.quotes_generated === 1 ? "" : "s"} completed, ${depositsStr} captured in deposits.`;
    }
    if (d.quotes_generated > 0) {
      return `${d.quotes_generated} quote${d.quotes_generated === 1 ? "" : "s"} generated this month, ${d.quotes_completed} progressed to a follow-up.`;
    }
    return "No quotes registered this period. The widget remains live and ready.";
  })();

  /* ─── Hero KPI: conversion-rate semi-gauge ─── */
  // Show only on real data — the illustrative gauge would be misleading.
  const conversionCard = isConvReal
    ? buildSemiGaugeCard({
        chartUrl: o.conversionChartUrl,
        label: "Conversion rate (views → quotes)",
        value: conversionValue,
        max: 100,
        verdict: d.conversion.verdict,
        advice: d.conversion.advice,
      })
    : "";

  /* ─── Secondary: best revenue day sparkline ─── */
  const peakCard = d.peak.data_status === "real"
    ? buildSparklinePeakCard({
        chartUrl: o.peakChartUrl,
        title: "Best revenue day (last 14 days)",
        data: d.peak.data,
        peakIndex: d.peak.peakIndex,
        peakLabel: d.peak.peakLabel,
      })
    : "";

  /* ─── Tertiary: monthly quotes bar (6 months) ─── */
  // Only render on real data — a 6-month synthetic bar would mislead.
  const monthlyCard = d.monthly.data_status === "real"
    ? buildMonthlyBarCard({
        chartUrl: o.monthlyChartUrl,
        title: "Quotes generated per month",
        bars: d.monthly.data.map((b) => ({
          label: b.label,
          value: b.value,
          highlight: b.highlighted === true,
        })),
        caption: `${d.quotes_generated} quote${d.quotes_generated === 1 ? "" : "s"} this month.`,
      })
    : "";

  /* ─── Recommendations ─── */
  const recs: string[] = [];
  if (conversionLow) {
    recs.push("Conversion is below 30% — try a shorter form, add a social-proof badge, or A/B-test the first question.");
  }
  if (d.quotes_generated > 0 && d.quotes_completed === 0) {
    recs.push("Quotes are landing but not converting — review your follow-up email sequence and pricing presentation.");
  }
  if (d.quotes_generated >= 10 && d.deposits_captured_cents === 0) {
    recs.push("Activate Stripe deposit capture — customers who pay upfront convert ~3× higher than those quoted only.");
  }
  if (recs.length === 0 && d.deposits_captured_cents > 0) {
    recs.push("Strong month — hold the configuration and keep nurturing repeat visitors.");
  }
  if (recs.length === 0) {
    recs.push("Drive more traffic to your calculator — paid search and a footer link from your website are the two highest-leverage moves.");
  }

  const body = [
    buildReportHero({
      eyebrow: "Monthly quotes recap",
      headline,
      period: d.period_label,
      businessName: d.business_name,
      summary,
    }),
    conversionCard,
    peakCard,
    monthlyCard,
    buildRecommendations({ title: "What to optimize next month", items: recs.slice(0, 3) }),
    buildCtaButton({ href: `${o.portalUrl}/portal/quotequick`, label: "Open your QuoteQuick dashboard" }),
    buildMetricGlossary({
      metrics: ["Conversion rate", "Quotes generated", "Deposits captured"],
      customDefs: {
        "Conversion rate": "Calculator viewers who completed and submitted a quote (last 30 days).",
        "Quotes generated": "Total quote submissions through your calculator this period.",
        "Deposits captured": "Upfront payments customers made to lock in their quote.",
      },
    }),
  ]
    .filter(Boolean)
    .join("");

  const html = buildReportShell({
    product: "QuoteQuick Report",
    badge,
    body,
    recipientEmail: d.recipient_email,
  });

  return { subject, html, badge };
}

/* ─── Send ─── */

const QUOTEQUICK_FROM_NAME = "WeFixTrades QuoteQuick";

export async function sendQuotequickMonthlyDigest(opts: {
  clientId: number;
  recipientEmail: string;
  businessName: string;
  periodLabel: string;
  monthStart: Date;
  monthEnd: Date;
}): Promise<DigestSendResult> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("SMTP not configured — skipping QuoteQuick digest");
    return { sent: false, reason: "smtp_not_configured", quotes_generated: 0 };
  }

  if (await isEmailUnsubscribed(opts.recipientEmail)) {
    return { sent: false, reason: "recipient_unsubscribed", quotes_generated: 0 };
  }

  const compiled = await compileQuotequickMonthlyDigest(
    opts.clientId,
    opts.monthStart,
    opts.monthEnd,
  );

  // Empty-data skip: no quotes this month AND no real conversion data.
  if (
    compiled.quotes_generated === 0 &&
    compiled.conversion.data_status !== "real"
  ) {
    return { sent: false, reason: "no_activity_this_month", quotes_generated: 0 };
  }

  const baseUrl =
    process.env.APP_URL ||
    process.env.APP_PUBLIC_URL ||
    "https://wefixtrades.com";

  const periodSlug = opts.periodLabel.replace(/\s+/g, "-").toLowerCase();

  const conversionChartUrl = compiled.conversion.data_status === "real"
    ? await generateSemiGaugePng({
        cacheKey: `quotequick-conv-c${opts.clientId}-${periodSlug}`,
        value: compiled.conversion.value,
        max: 100,
      })
    : null;

  const peakChartUrl = compiled.peak.data_status === "real"
    ? await generateSparklineWithPeakPng({
        cacheKey: `quotequick-peak-c${opts.clientId}-${periodSlug}`,
        data: compiled.peak.data,
        peakIndex: compiled.peak.peakIndex,
        peakLabel: compiled.peak.peakLabel,
      })
    : null;

  const monthlyChartUrl = compiled.monthly.data_status === "real"
    ? await generateMonthlyBarSeriesPng({
        cacheKey: `quotequick-monthly-c${opts.clientId}-${periodSlug}`,
        bars: compiled.monthly.data.map((b) => ({
          label: b.label,
          value: b.value,
          highlight: b.highlighted === true,
        })),
      })
    : null;

  const data: QuotequickMonthlyDigestData = {
    client_id: opts.clientId,
    business_name: opts.businessName,
    recipient_email: opts.recipientEmail,
    period_label: opts.periodLabel,
    conversion: compiled.conversion,
    peak: compiled.peak,
    monthly: compiled.monthly,
    quotes_generated: compiled.quotes_generated,
    quotes_completed: compiled.quotes_completed,
    deposits_captured_cents: compiled.deposits_captured_cents,
  };

  const { subject, html } = composeQuotequickMonthlyDigest({
    data,
    portalUrl: baseUrl,
    conversionChartUrl,
    peakChartUrl,
    monthlyChartUrl,
  });

  try {
    await transporter.sendMail({
      from: `${QUOTEQUICK_FROM_NAME} <${getFromAddress()}>`,
      to: opts.recipientEmail,
      replyTo: "support@wefixtrades.com",
      subject,
      html,
    });
    log.info("QuoteQuick digest sent", {
      clientId: opts.clientId,
      period: opts.periodLabel,
    });
    return { sent: true, quotes_generated: compiled.quotes_generated };
  } catch (err: any) {
    log.error("QuoteQuick digest send failed", {
      clientId: opts.clientId,
      error: err?.message,
    });
    return {
      sent: false,
      reason: `send_failed: ${err?.message}`,
      quotes_generated: compiled.quotes_generated,
    };
  }
}

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
