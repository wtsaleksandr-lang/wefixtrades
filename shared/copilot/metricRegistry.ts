/**
 * Wave 26.6 — Centralized metric registry shared between dashboards + Copilot.
 *
 * Maps (product, key) → { label, helpText, improvementTips, unit, format }.
 *
 * The KpiGauge instances on each product dashboard read their helpText +
 * improvementTips from THIS registry (via getMetricMeta()) so they never
 * drift from what the Copilot tells the customer. The Copilot server builds
 * a DashboardContext (server/services/copilot/metricsContext.ts) by
 * combining live values from the existing dashboard-kpis routes with the
 * meta strings here, then injects the result into the system prompt.
 *
 * Add a new metric:
 *   1. Add the key to the appropriate product map below.
 *   2. Reference it from the dashboard (getMetricMeta) and from the
 *      product's metric-builder in server/services/copilot/metricsContext.ts.
 *   3. UiPrimitivesDemo Wave 26.6 panel automatically picks it up.
 */

export type DashboardProduct =
  | "contentflow"
  | "rankflow"
  | "socialsync"
  | "tradeline"
  | "mapguard"
  | "reputationshield";

export interface MetricMeta {
  /** Customer-facing label (matches the KpiGauge label). */
  label: string;
  /** One-line plain-English explanation of what the metric means. */
  helpText: string;
  /** 2-4 concrete tips for improving the metric. */
  improvementTips: string[];
  /** Optional unit suffix used when rendering for the Copilot prompt
   *  (e.g. "%", "calls", "platforms"). Frontend gauges have their own unit
   *  prop — this is purely for the prompt string. */
  unit?: string;
  /** Optional formatter applied to the raw value before it's placed into
   *  the prompt. Defaults to `String(value)`. Use this for cents → dollars
   *  conversions, decimal rounding, etc. */
  format?: (value: number | string) => string;
}

const formatCents = (v: number | string): string => {
  const cents = typeof v === "number" ? v : Number(v) || 0;
  return `$${(cents / 100).toFixed(2)}`;
};

const formatDollars = (v: number | string): string => {
  const n = typeof v === "number" ? v : Number(v) || 0;
  return `$${n.toFixed(2)}`;
};

/* ─── Per-product metric maps ─────────────────────────────────────────── */

const CONTENTFLOW: Record<string, MetricMeta> = {
  articlesThisMonth: {
    label: "Articles this month",
    helpText: "Total approved articles in the last 30 days.",
    improvementTips: [
      "Approve drafts faster from the inbox",
      "Set content style preferences for higher first-pass approval",
      "Increase tier to raise monthly quota",
    ],
    unit: "articles",
  },
  approvalRate: {
    label: "Approval rate",
    helpText: "% of AI drafts you approve vs reject.",
    improvementTips: [
      "Refine content style preferences",
      "Use AI co-pilot Tighten/Add CTA suggestions",
      "Train the AI on your voice via Brand Voice settings",
    ],
    unit: "%",
  },
  detectionScore: {
    label: "Human-likeness",
    helpText: "Inverse of ZeroGPT AI-detection probability. Higher = more human-like.",
    improvementTips: [
      "Run articles through humanization pass",
      "Add personal anecdotes via Localize action",
      "Increase brand voice training data",
    ],
    unit: "%",
  },
  distributionReach: {
    label: "Distribution reach",
    helpText: "Number of distinct platforms posted to in last 30 days.",
    improvementTips: [
      "Connect more social accounts in SocialSync",
      "Enable auto-publish on RankFlow",
      "Upgrade tier to increase platform allowance",
    ],
    unit: "platforms",
  },
};

const RANKFLOW: Record<string, MetricMeta> = {
  avgPosition: {
    label: "Avg position",
    helpText: "Average rank across tracked keywords on Google.",
    improvementTips: [
      "Publish more SEO-aware articles",
      "Improve content score on existing articles",
      "Build citations via Citation Builder",
    ],
  },
  keywordsImproved: {
    label: "Keywords improved",
    helpText: "Keywords that climbed in rank this month.",
    improvementTips: [
      "Focus on near-page-1 keywords (positions 8-15) for quickest wins",
      "Auto-Optimize underperforming articles",
      "Check competitor cards for content gaps",
    ],
    unit: "keywords",
  },
  seoScore: {
    label: "SEO score",
    helpText: "Aggregated SEO health across all tracked pages.",
    improvementTips: [
      "Fix meta gaps highlighted by AI Brain panel",
      "Add internal links between content cluster articles",
      "Improve page speed via WebFix",
    ],
    unit: "/100",
  },
};

const SOCIALSYNC: Record<string, MetricMeta> = {
  postsThisWeek: {
    label: "Posts this week",
    helpText: "Approved + scheduled posts across all platforms.",
    improvementTips: [
      "Approve pending drafts faster",
      "Connect more social accounts to spread content",
      "Enable auto-schedule from ContentFlow",
    ],
    unit: "posts",
  },
  avgEngagementRate: {
    label: "Engagement rate",
    helpText:
      "Likes + comments + shares / impressions across the last 30 days. Empty until impressions data is collected.",
    improvementTips: [
      "Post during best-time slots (gauge in calendar)",
      "Use platform-specific previews to optimize per-channel",
      "Add hashtag suggestions via AI co-pilot",
    ],
    unit: "%",
  },
  approvalBacklog: {
    label: "Approval backlog",
    helpText: "Pending posts awaiting your approval. Low is good.",
    improvementTips: [
      "Use bulk approve on similar drafts",
      "Refine ContentFlow style settings to reduce rejection rate",
      "Set up auto-approve rules for trusted draft types",
    ],
    unit: "posts",
  },
  whatsappMessagesThisWeek: {
    label: "WhatsApp this week",
    helpText: "Direct customer messages received via WhatsApp Business this week.",
    improvementTips: [
      "Promote WhatsApp on your website + business cards",
      "Enable AI auto-reply for common questions",
      "Add WhatsApp link to email signatures",
    ],
    unit: "messages",
  },
};

const TRADELINE: Record<string, MetricMeta> = {
  answeredToday: {
    label: "Answered today",
    helpText:
      "Calls today answered by your AI receptionist. Higher means fewer missed customers.",
    improvementTips: [
      "Promote your phone number on every page of your site",
      "Add click-to-call buttons to MapGuard listings",
      "Run AdFlow campaigns with the phone CTA",
    ],
    unit: "calls",
  },
  bookingsThisMonth: {
    label: "Bookings this month",
    helpText: "Calls that ended with a confirmed appointment booking.",
    improvementTips: [
      "Review voice persona for warmth",
      "Check booking funnel for biggest dropoff stage",
      "Adjust quote calculator integration in QuoteQuick",
    ],
    unit: "bookings",
  },
  callsToday: {
    label: "Calls today",
    helpText: "Inbound calls answered by your AI receptionist today.",
    improvementTips: [
      "Promote your phone number on every page of your site",
      "Add click-to-call buttons to MapGuard listings",
      "Run AdFlow campaigns with the phone CTA",
    ],
    unit: "calls",
  },
  costPerBooking: {
    label: "Cost per booking",
    helpText: "What each new booking costs via TradeLine. Lower is better.",
    improvementTips: [
      "Increase call volume (top of funnel)",
      "Improve booking conversion (qualified → booked)",
      "Compare against your average job value",
    ],
    format: formatDollars,
  },
  estimatedMissedRevenue: {
    label: "Estimated missed revenue",
    helpText:
      "Estimated revenue lost to missed calls (missed × average job value). TradeLine reduces this towards zero.",
    improvementTips: [
      "Ensure after-hours mode is enabled",
      "Verify forwarding rules cover all peak windows",
      "Promote SMS fallback in the voice greeting",
    ],
    format: formatCents,
  },
};

/* MapGuard + ReputationShield are placeholder maps for now — these
 * products plug in via the same registry when their dashboards land. */
const MAPGUARD: Record<string, MetricMeta> = {};
const REPUTATIONSHIELD: Record<string, MetricMeta> = {};

const REGISTRY: Record<DashboardProduct, Record<string, MetricMeta>> = {
  contentflow: CONTENTFLOW,
  rankflow: RANKFLOW,
  socialsync: SOCIALSYNC,
  tradeline: TRADELINE,
  mapguard: MAPGUARD,
  reputationshield: REPUTATIONSHIELD,
};

/* ─── Public API ──────────────────────────────────────────────────────── */

/** Lookup meta for a metric. Returns undefined if (product, key) isn't registered. */
export function getMetricMeta(
  product: DashboardProduct,
  key: string,
): MetricMeta | undefined {
  return REGISTRY[product]?.[key];
}

/** All metric keys registered for a product. */
export function listMetricKeys(product: DashboardProduct): string[] {
  return Object.keys(REGISTRY[product] ?? {});
}

/** Render a metric's value for the Copilot system prompt. */
export function formatMetricValue(
  meta: MetricMeta,
  value: number | string,
): string {
  const formatted = meta.format ? meta.format(value) : String(value);
  return meta.unit ? `${formatted} ${meta.unit}` : formatted;
}

/** Full registry — used by the UiPrimitivesDemo preview panel. */
export const METRIC_REGISTRY: Readonly<typeof REGISTRY> = REGISTRY;

/** Known dashboard pagePath → product mapping. Used both client-side
 *  (PortalChatWidget picks the right product when sending pageContext) and
 *  server-side (defense-in-depth when only pagePath is sent). */
export function productFromPagePath(pagePath: string | undefined | null): DashboardProduct | undefined {
  if (!pagePath) return undefined;
  if (pagePath.startsWith("/portal/contentflow") || pagePath.startsWith("/admin/contentflow")) return "contentflow";
  if (pagePath.startsWith("/portal/rankflow") || pagePath.startsWith("/admin/rankflow")) return "rankflow";
  if (pagePath.startsWith("/portal/socialsync") || pagePath.startsWith("/admin/socialsync")) return "socialsync";
  if (pagePath.startsWith("/portal/tradeline") || pagePath.startsWith("/admin/tradeline")) return "tradeline";
  if (pagePath.startsWith("/portal/mapguard") || pagePath.startsWith("/admin/mapguard")) return "mapguard";
  if (pagePath.startsWith("/portal/reputationshield") || pagePath.startsWith("/admin/reputationshield")) return "reputationshield";
  return undefined;
}
