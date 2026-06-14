/**
 * Service catalog used by audit recommendations and service matching.
 * Prices and features derived from shared/pricing.ts (single source of truth).
 */
import {
  SITELAUNCH, TRADELINE, QUOTEQUICK, MAPGUARD,
  REPUTATIONSHIELD, SOCIALSYNC, WEBFIX, RANKFLOW, WEBCARE, ADFLOW, CONTENTFLOW,
  lowestMonthly, formatPrice,
  type ProductDef,
} from "./pricing";

export type Service = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  priceLabel: string;
  billingPeriod: "monthly" | "one-time";
  category: "visibility" | "leads" | "reputation" | "automation" | "website";
  fixesIssues: string[];
  features: string[];
  isPopular?: boolean;
};

export const SERVICES: Service[] = [
  {
    id: "mapguard-setup",
    name: "MapSetup\u2122",
    tagline: "One-time Google Business Profile optimisation sprint",
    description:
      "We audit and rebuild your Google Business Profile from scratch — fixing every gap that's hurting your local ranking and costing you calls.",
    price: MAPGUARD.setup!,
    priceLabel: `${formatPrice(MAPGUARD.setup!)} one-time`,
    billingPeriod: "one-time",
    category: "visibility",
    fixesIssues: [
      "not-in-maps-pack",
      "low-visibility",
      "no-gbp-description",
      "low-search-ranking",
    ],
    features: MAPGUARD.tiers[0].features,
  },
  {
    id: "mapguard-ongoing",
    name: MAPGUARD.name + " Ongoing",
    tagline: "Fully managed Google Maps visibility — monitoring, fixing, improving",
    description:
      "We monitor your rankings weekly, fix issues as they arise, and execute optimization work every month. You receive clear reports showing your progress.",
    price: lowestMonthly(MAPGUARD)!,
    priceLabel: `From ${formatPrice(lowestMonthly(MAPGUARD)!)}/mo`,
    billingPeriod: "monthly",
    category: "visibility",
    fixesIssues: [
      "not-in-maps-pack",
      "low-visibility",
      "low-search-ranking",
      "no-gbp-description",
    ],
    features: [
      ...MAPGUARD.tiers[1].features,
      ...MAPGUARD.tiers[2].features.filter(f => !MAPGUARD.tiers[1].features.includes(f)).map(f => `${f} (Pro)`),
    ],
    isPopular: true,
  },
  {
    id: "reputationshield",
    name: REPUTATIONSHIELD.name,
    tagline: REPUTATIONSHIELD.tagline,
    description:
      "Automated review requests after completed jobs, AI-powered review responses, negative review alerts, and a client-facing reputation dashboard.",
    price: lowestMonthly(REPUTATIONSHIELD)!,
    priceLabel: `From ${formatPrice(lowestMonthly(REPUTATIONSHIELD)!)}/mo`,
    billingPeriod: "monthly",
    category: "reputation",
    fixesIssues: [
      "low-reviews",
      "bad-rating",
      "low-visibility",
    ],
    features: [
      ...REPUTATIONSHIELD.tiers[0].features,
      ...REPUTATIONSHIELD.tiers[1].features.filter(f => !REPUTATIONSHIELD.tiers[0].features.includes(f)).map(f => `${f} (Pro)`),
    ],
  },
  {
    id: "tradeline",
    name: TRADELINE.name,
    tagline: TRADELINE.tagline,
    description:
      "Never miss a lead. TradeLine handles AI call answering, SMS replies, missed call auto-response, and follow-ups — with included minutes on every plan.",
    price: lowestMonthly(TRADELINE)!,
    priceLabel: `From ${formatPrice(lowestMonthly(TRADELINE)!)}/mo`,
    billingPeriod: "monthly",
    category: "leads",
    fixesIssues: [
      "no-after-hours",
      "low-demand-coverage",
      "no-quote-tool",
    ],
    features: TRADELINE.tiers[0].features.filter(f => !f.includes("minutes")),
    isPopular: true,
  },
  {
    id: "webfix",
    name: WEBFIX.name,
    tagline: WEBFIX.tagline,
    description:
      "One-time website fixes covering speed, SEO structure, and Google Maps profile cleanup.",
    price: WEBFIX.tiers[0].price,
    priceLabel: `${formatPrice(WEBFIX.tiers[0].price)} one-time`,
    billingPeriod: "one-time",
    category: "website",
    fixesIssues: [
      "slow-website",
      "low-search-ranking",
      "low-visibility",
    ],
    features: WEBFIX.tiers[0].features,
  },
  {
    id: "rankflow",
    name: RANKFLOW.name,
    tagline: RANKFLOW.tagline,
    description:
      "Done-for-you local SEO that improves your search visibility every month.",
    price: lowestMonthly(RANKFLOW)!,
    priceLabel: `From ${formatPrice(lowestMonthly(RANKFLOW)!)}/mo`,
    billingPeriod: "monthly",
    category: "visibility",
    fixesIssues: [
      "low-search-ranking",
      "low-visibility",
    ],
    features: RANKFLOW.tiers[0].features,
  },
  {
    id: "webcare",
    name: WEBCARE.name,
    tagline: WEBCARE.tagline,
    description:
      "Automated website health monitoring, uptime checks, security scanning, and CMS patch management.",
    price: lowestMonthly(WEBCARE)!,
    priceLabel: `From ${formatPrice(lowestMonthly(WEBCARE)!)}/mo`,
    billingPeriod: "monthly",
    category: "website",
    fixesIssues: [
      "slow-website",
      "low-visibility",
    ],
    features: WEBCARE.tiers[0].features,
  },
  {
    id: "sitelaunch",
    name: SITELAUNCH.name,
    tagline: SITELAUNCH.tagline,
    // Wave 11D D3 — 14-day TradeLine + QuoteQuick trial bonus DROPPED.
    description:
      "A fast, mobile-first, SEO-ready website designed to convert visitors into leads. 5–7 pages with mobile optimization, speed optimization, basic SEO, contact forms, and QuoteQuick embed.",
    price: SITELAUNCH.tiers[0].price,
    priceLabel: `${formatPrice(SITELAUNCH.tiers[0].price)} one-time`,
    billingPeriod: "one-time",
    category: "website",
    fixesIssues: [
      "no-website",
      "slow-website",
      "low-search-ranking",
      "low-visibility",
    ],
    features: SITELAUNCH.tiers[0].features,
  },
  {
    id: "quotequick",
    name: QUOTEQUICK.name,
    tagline: QUOTEQUICK.tagline,
    description:
      "An embeddable quote calculator that gives visitors instant estimates — turning browsers into warm leads before they pick up the phone.",
    price: lowestMonthly(QUOTEQUICK)!,
    priceLabel: `From ${formatPrice(lowestMonthly(QUOTEQUICK)!)}/mo`,
    billingPeriod: "monthly",
    category: "leads",
    fixesIssues: [
      "no-quote-tool",
      "low-demand-coverage",
    ],
    features: [
      ...QUOTEQUICK.tiers[0].features,
      ...QUOTEQUICK.tiers[1].features.filter(f => !QUOTEQUICK.tiers[0].features.includes(f)).map(f => `${f} (Pro)`),
    ],
  },
  {
    id: "socialsync",
    name: SOCIALSYNC.name,
    tagline: SOCIALSYNC.tagline,
    description:
      "AI-generated social media content published automatically to Facebook, Instagram, and Google Business Profile. Full autopilot posting.",
    price: lowestMonthly(SOCIALSYNC)!,
    priceLabel: `From ${formatPrice(lowestMonthly(SOCIALSYNC)!)}/mo`,
    billingPeriod: "monthly",
    category: "visibility",
    fixesIssues: [
      "low-visibility",
      "low-search-ranking",
    ],
    features: [
      ...SOCIALSYNC.tiers[0].features,
      ...SOCIALSYNC.tiers[1].features.filter(f => !SOCIALSYNC.tiers[0].features.includes(f)).map(f => `${f} (Growth)`),
    ],
  },
  {
    id: "contentflow",
    name: CONTENTFLOW.name,
    tagline: CONTENTFLOW.tagline,
    description:
      "Standalone AI content engine — articles, social posts, and Google Business Profile updates generated in your brand voice and auto-published across every channel. Sold on its own; no SocialSync or RankFlow subscription required.",
    price: lowestMonthly(CONTENTFLOW)!,
    priceLabel: `From ${formatPrice(lowestMonthly(CONTENTFLOW)!)}/mo`,
    billingPeriod: "monthly",
    category: "visibility",
    fixesIssues: [
      "low-visibility",
      "low-search-ranking",
    ],
    features: [
      ...CONTENTFLOW.tiers[0].features,
      ...CONTENTFLOW.tiers[1].features.filter(f => !CONTENTFLOW.tiers[0].features.includes(f)).map(f => `${f} (Studio)`),
    ],
  },
  {
    id: "adflow",
    name: ADFLOW.name,
    tagline: ADFLOW.tagline,
    description:
      "Managed ad campaigns, delivered by our agency partners. WeFixTrades manages the relationship — your agency handles campaign setup, optimization, and reporting. Monthly performance reports delivered to your inbox.",
    price: lowestMonthly(ADFLOW)!,
    priceLabel: `From ${formatPrice(lowestMonthly(ADFLOW)!)}/mo`,
    billingPeriod: "monthly",
    category: "leads",
    fixesIssues: [
      "no-ads",
      "low-visibility",
      "low-demand-coverage",
    ],
    features: [
      ...ADFLOW.tiers[0].features,
      ...ADFLOW.tiers[1].features.filter(f => !ADFLOW.tiers[0].features.includes(f)).map(f => `${f} (Growth)`),
    ],
  },
  {
    // Wave 11D D2 (locked 2026-05-26) — BookFlow is NOT sold standalone; it's
    // the booking feature included with every QuoteQuick plan (see the matching
    // reframe in client/src/config/products.ts). The old standalone entry here
    // ("$5.89/mo", price 589 — cents that every consumer read as dollars) was a
    // residual: it surfaced in chat recommendation cards and the portal catalog
    // as a purchasable SKU that has no service_catalog row, so checkout 400s.
    // Kept in the catalog for chat-assistant knowledge, priced as included.
    id: "bookflow",
    name: "BookFlow",
    tagline: "Online booking — included with QuoteQuick",
    description:
      "The booking experience inside QuoteQuick — included free with every QuoteQuick plan. Customers book directly from your website, quote widget, or AI assistant. Not sold standalone.",
    price: 0,
    priceLabel: "Included with QuoteQuick",
    billingPeriod: "monthly",
    category: "leads",
    fixesIssues: [
      "no-after-hours",
      "low-demand-coverage",
    ],
    features: [
      "Public booking page with your brand",
      "Working hours and service configuration",
      "Automatic confirmation emails",
      "SMS notifications for new bookings",
      "Integrates with QuoteQuick and TradeLine",
      "Customer self-service cancellation",
    ],
  },
];

// Services that should not appear in audit-tool recommendations even
// though they exist in the catalog. BookFlow has no standalone tier
// SKU in the checkout catalog (see AUDIT_SERVICE_TO_CATALOG_SKU in
// client/src/pages/marketing/ReportView.tsx), so recommending it gives
// the visitor a "Buy services" CTA that 400s on Unknown service.
// Today BookFlow is only sold bundled into adjacent products, so we
// hide it from audit recs rather than ship a broken purchase path.
const AUDIT_EXCLUDED_SERVICE_IDS = new Set<string>(["bookflow"]);

/* ──────────────────────────────────────────────────────────────────────────
 * Per-item billing metadata (Free-Audit Wave 2, Agent D — Task 1).
 *
 * The conversion audit found ReportView.tsx hardcoded "/mo" on the checkout
 * CTA while service cards correctly say "one-time", so a $397 one-time fix
 * showed as "$397/mo" at checkout. Each Service already carries a typed
 * `billingPeriod`; this helper exposes the rendering primitives (suffix /
 * cadence noun) off that field so the report + checkout read ONE source of
 * truth instead of re-deriving the cadence per call-site.
 *
 * Contract for Agent A (ReportView.tsx): given a service id (or a Service),
 * call getServiceBillingMeta(...) and render `priceSuffix` after the price.
 * Never hardcode "/mo" again.
 * ────────────────────────────────────────────────────────────────────────── */
export type BillingMeta = {
  billingPeriod: "monthly" | "one-time";
  /** Suffix to append after a price, e.g. "/mo" or "" for one-time. */
  priceSuffix: string;
  /** Human cadence noun, e.g. "per month" / "one-time". */
  cadence: string;
  /** True when this is a recurring (monthly) charge. */
  isRecurring: boolean;
};

export function billingMetaForPeriod(period: "monthly" | "one-time"): BillingMeta {
  const isRecurring = period === "monthly";
  return {
    billingPeriod: period,
    priceSuffix: isRecurring ? "/mo" : "",
    cadence: isRecurring ? "per month" : "one-time",
    isRecurring,
  };
}

/** Resolve billing metadata for a service id OR a Service object. Falls back
 * to one-time meta for an unknown id so a missing match never renders "/mo"
 * on a charge that isn't recurring. */
export function getServiceBillingMeta(serviceOrId: string | Service): BillingMeta {
  const svc = typeof serviceOrId === "string"
    ? SERVICES.find(s => s.id === serviceOrId)
    : serviceOrId;
  // Unknown id → safest default is one-time (no recurring suffix on an
  // unmatched charge). Known service → honor its declared period.
  return billingMetaForPeriod(svc?.billingPeriod ?? "one-time");
}

/* ──────────────────────────────────────────────────────────────────────────
 * Per-trade average ticket (Free-Audit Wave 2, Agent D — Task 2).
 *
 * Canonical trade → mid-range job value, lifted to @shared so BOTH the server
 * (server/auditRoutes.ts revenue-loss floor) and the client (ReportView.tsx
 * revenue math) compute from one table instead of two diverging copies. The
 * server previously had only an 8-trade JOB_VALUES map; this covers 30+ trades
 * with the same values the report UI already used. Conservative mid-range,
 * not best-case — these feed a customer-facing dollar figure.
 * ────────────────────────────────────────────────────────────────────────── */

/** Conservative cross-trade floor when the trade isn't in the table. */
export const DEFAULT_AVG_TICKET = 250;

/** Trade (normalized key) → mid-range job value in whole dollars. */
export const TRADE_AVG_TICKET: Record<string, number> = {
  plumbing: 450,
  plumber: 450,
  hvac: 800,
  electrical: 500,
  electrician: 500,
  roofing: 12000,
  roofer: 12000,
  cleaning: 220,
  "house-cleaning": 220,
  landscaping: 600,
  landscaper: 600,
  painting: 1800,
  painter: 1800,
  flooring: 2500,
  carpentry: 900,
  remodeling: 8000,
  handyman: 300,
  pestcontrol: 220,
  "pest-control": 220,
  pool: 250,
  pools: 250,
  locksmith: 180,
  appliance: 280,
  garagedoor: 380,
  "garage-door": 380,
  fencing: 2200,
  concrete: 3500,
  pavers: 5000,
  excavation: 4500,
  septic: 600,
  solar: 16000,
  windows: 3500,
  siding: 8000,
  gutter: 1100,
  chimney: 600,
};

/** Normalize a free-text trade label to a TRADE_AVG_TICKET key. */
export function tradeTicketKey(trade?: string | null): string {
  return (trade || "").toString().toLowerCase().replace(/[^a-z0-9-]/g, "");
}

/** Resolve a trade's average ticket, falling back to DEFAULT_AVG_TICKET. */
export function avgTicketForTrade(trade?: string | null): number {
  return TRADE_AVG_TICKET[tradeTicketKey(trade)] || DEFAULT_AVG_TICKET;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Real per-business revenue-loss floor (Free-Audit Wave 2, Agent D — Task 2).
 *
 * The conversion audit found the report shows a hardcoded "5–15 leads /
 * $800–$2,400" placeholder when the real demand-gap math computes 0 — a fake
 * business-specific number. This computes an HONEST floor: a conservative
 * missed-lead estimate × the trade's average ticket. When there is genuinely
 * no measurable loss, `isReal` is false so the UI can positive-frame
 * ("capturing demand well — defend it") instead of showing an invented loss.
 *
 * Contract for Agent A (ReportView.tsx):
 *   estimatedRevenueLoss: { low: number; high: number; isReal: boolean;
 *                           monthlyMissedLeads: number; avgTicket: number;
 *                           basis: "demand-gap" | "floor" | "none" }
 *   - isReal === true  → render the $low–$high/mo figure as business-specific.
 *   - isReal === false → low/high are 0; show the positive-frame copy, NOT a
 *                        dollar loss.
 * ────────────────────────────────────────────────────────────────────────── */
export type RevenueLossEstimate = {
  low: number;
  high: number;
  isReal: boolean;
  /** Missed leads/month the estimate is built from (0 when isReal=false). */
  monthlyMissedLeads: number;
  /** Average ticket used for the math (for transparent UI captions). */
  avgTicket: number;
  /** Where the number came from: measured demand gap, computed floor, or none. */
  basis: "demand-gap" | "floor" | "none";
};

/** Round a dollar amount to the nearest $100 for clean display bands. */
function roundTo100(n: number): number {
  return Math.max(0, Math.round(n / 100) * 100);
}

/**
 * Compute an honest revenue-loss estimate.
 *
 * @param trade        free-text trade label (resolved via avgTicketForTrade)
 * @param demandLoss   the measured demand-gap revenue loss, if any
 *                     (from calculateDemandGaps — already trade-aware).
 *                     Pass null/zero when no gap was measured.
 * @param missedLeads  conservative missed-lead estimate for the floor path.
 *                     When demand-gap math is zero but the business has clear
 *                     capture gaps, callers pass a small floor (e.g. 1–3).
 */
export function computeRevenueLoss(args: {
  trade?: string | null;
  demandLoss?: { low?: number; high?: number; monthlyMissedLeads?: number } | null;
  floorMissedLeads?: number;
}): RevenueLossEstimate {
  const avgTicket = avgTicketForTrade(args.trade);

  // 1) Prefer the measured demand-gap loss when it's a real positive number.
  const dl = args.demandLoss;
  if (dl && ((dl.low ?? 0) > 0 || (dl.high ?? 0) > 0)) {
    return {
      low: roundTo100(dl.low ?? 0),
      high: roundTo100(dl.high ?? 0),
      isReal: true,
      monthlyMissedLeads: Math.round(dl.monthlyMissedLeads ?? 0),
      avgTicket,
      basis: "demand-gap",
    };
  }

  // 2) Fall back to a conservative computed floor from avg ticket, but ONLY
  //    when the caller supplied a real missed-lead count (> 0). The band is
  //    intentionally tight (1 missed lead low → floorMissedLeads high) so it
  //    reads as a defensible floor, not a hype number.
  const floorLeads = Math.max(0, Math.floor(args.floorMissedLeads ?? 0));
  if (floorLeads > 0) {
    return {
      low: roundTo100(1 * avgTicket),
      high: roundTo100(floorLeads * avgTicket),
      isReal: true,
      monthlyMissedLeads: floorLeads,
      avgTicket,
      basis: "floor",
    };
  }

  // 3) Genuinely no measurable loss → positive-frame, never a fake number.
  return {
    low: 0,
    high: 0,
    isReal: false,
    monthlyMissedLeads: 0,
    avgTicket,
    basis: "none",
  };
}

export function getServicesForIssues(issues: string[]): Service[] {
  if (!issues.length) return [];
  const scored = SERVICES
    .filter(service => !AUDIT_EXCLUDED_SERVICE_IDS.has(service.id))
    .map(service => ({
      service,
      matchCount: service.fixesIssues.filter(i => issues.includes(i)).length
    }))
    .filter(s => s.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount);
  const seenCategories = new Set<string>();
  const deduplicated = scored.filter(({ service }) => {
    if (seenCategories.has(service.category)) return false;
    seenCategories.add(service.category);
    return true;
  });
  return deduplicated.slice(0, 3).map(s => s.service);
}
