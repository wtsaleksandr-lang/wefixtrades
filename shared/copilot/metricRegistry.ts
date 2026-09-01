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
  | "reputationshield"
  | "quotequick"
  | "adflow"
  | "webcare";

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

/* Wave 27 — MapGuard metric entries (heatmap pulse + Citation Health + GBP
 * trend + avg-rank gauge). Customer-facing labels, hover-ready help, and
 * 2-4 improvement tips per metric so Copilot can coach the operator. */
const MAPGUARD: Record<string, MetricMeta> = {
  avgRank: {
    label: "Avg rank",
    helpText:
      "Average Google position across every keyword × pin on your weekly rank-grid scan. Lower is better.",
    improvementTips: [
      "Publish locally-targeted articles via RankFlow",
      "Add city + service photos to your GBP profile",
      "Fix NAP inconsistencies surfaced in Citation Health",
    ],
    unit: "position",
  },
  top3Coverage: {
    label: "Top 3 coverage",
    helpText:
      "Percentage of the 25 grid pins where you rank in Google's local 3-pack. The Map Pack is what drives calls.",
    improvementTips: [
      "Run a Citation Builder campaign on missing directories",
      "Request fresh reviews via ReputationShield",
      "Post weekly GBP updates from ContentFlow",
    ],
    unit: "%",
  },
  citationHealth: {
    label: "Citation health",
    helpText:
      "Letter grade based on Found vs Missing vs Inconsistent listings across the directories CiteTrack actively monitors. A = 90%+ healthy.",
    improvementTips: [
      "Upgrade to Citation Builder to add missing directories",
      "Fix NAP-mismatched listings (one-click action available)",
      "Republish to top-10 industry directories monthly",
    ],
  },
  gbpHealth: {
    label: "GBP health",
    helpText:
      "Google Business Profile completeness — photos, description, hours, services, posts. 100% = every field populated.",
    improvementTips: [
      "Upload 5+ fresh photos per week",
      "Schedule weekly GBP posts from ContentFlow",
      "Keep services + categories aligned with your trade type",
    ],
    unit: "%",
  },
};
/* Wave 28 — ReputationShield metric entries. Customer-facing labels +
 * help cues + improvement tips the dashboard surfaces in KPI gauges and
 * the Copilot reads from in the system prompt. */
const REPUTATIONSHIELD: Record<string, MetricMeta> = {
  avgRating: {
    label: "Avg rating",
    helpText:
      "Average star rating across every monitored platform (Google, Yelp, Facebook, BBB). 4.7+ is the local-trades benchmark.",
    improvementTips: [
      "Request reviews from your last 10 jobs in one tap",
      "Reply to every review within 48 hours",
      "Promote your review link on invoices + signage",
    ],
    unit: "stars",
  },
  reviewVelocity: {
    label: "Reviews this month",
    helpText:
      "Count of new reviews received in the last 30 days vs the prior 30. Steady velocity is what Google rewards in local rankings.",
    improvementTips: [
      "Run a one-click batch review request after each job",
      "Enable SMS review requests for higher response rate",
      "Send a friendly follow-up to non-responders at day 4",
    ],
    unit: "reviews",
  },
  daysSinceLastReview: {
    label: "Days since last review",
    helpText:
      "Days since your most recent review on any platform. Stale review streaks (30+ days) cost ranking and trust.",
    improvementTips: [
      "Use the 1-click batch request for your last 10 completed jobs",
      "Set up automatic post-job review prompts in onboarding",
      "Promote QR codes on invoices + business cards",
    ],
    unit: "days",
  },
  replyRate: {
    label: "Reply rate",
    helpText:
      "% of recent reviews you've responded to. Replying — especially to negative reviews — boosts local pack ranking and conversion.",
    improvementTips: [
      "Use the AI draft editor to reply in under 30 seconds",
      "Enable approval-mode auto-drafts for 5-star reviews",
      "Set up notifications for negative reviews so you can intervene early",
    ],
    unit: "%",
  },
};

/* Wave 29 — QuoteQuick metric entries. Customer-facing labels + help cues
 * + improvement tips the dashboard surfaces in KPI gauges and the Copilot
 * reads from in the system prompt. */
const QUOTEQUICK: Record<string, MetricMeta> = {
  quotesSent: {
    label: "Quotes sent",
    helpText:
      "Total quotes sent in the last 30 days across every embedded widget. Higher = more top-of-funnel lead flow.",
    improvementTips: [
      "Embed the widget on every service page, not just the home page",
      "Add a floating-button embed for sticky cross-page exposure",
      "Drive paid traffic to a landing page with the widget above the fold",
    ],
    unit: "quotes",
  },
  avgDepositPaidRate: {
    label: "Deposit-paid rate",
    helpText:
      "% of sent quotes that result in a paid deposit. Industry avg for trades = 5%. 8%+ is best-in-class.",
    improvementTips: [
      "Add good/better/best package variants to the acceptance flow",
      "Reduce friction in the signature + payment steps",
      "Nudge stalled customers with the 1-click follow-up action",
    ],
    unit: "%",
  },
  revenueThisMonth: {
    label: "Revenue this month",
    helpText:
      "Total deposit revenue collected via Stripe Connect in the last 30 days.",
    improvementTips: [
      "Raise minimum deposit % on high-ticket calculators",
      "Enable the 10% same-day discount nudge for stale quotes",
      "Promote your shareable quote URL via SMS + email follow-ups",
    ],
    format: (v) => `$${(Number(v) / 100).toFixed(2)}`,
  },
  activeEmbeds: {
    label: "Active embeds",
    helpText:
      "Number of configured calculators with a live public slug. Each one is a working embed site.",
    improvementTips: [
      "Publish trade-specific landing pages with their own slug",
      "Embed on partner sites + supplier directories",
      "Activate any draft calculators that are sitting unused",
    ],
    unit: "sites",
  },
};

/* Wave 30 — AdFlow metric entries. Trade-first nouns (Money Spent, Jobs
 * Booked, Customers Reached) hide the Google Ads / Meta Ads jargon by
 * default. Power-user toggle in settings unlocks PMAX / CPA / ROAS / CTR
 * labels in a follow-up wave. */
/**
 * AdFlow is an agency-brokered managed service with NO ad-platform integration.
 * Every `*Reported` metric below is a figure the ads team reported and an ops
 * admin typed in; only `quoteRequestsFromAds` is measured by this platform.
 * The help text says which is which, because the Copilot quotes it back to the
 * customer verbatim.
 *
 * Removed with the rest of AdFlow's invented numbers:
 *   - "Trades industry average = $150" — an unsourced benchmark stated as fact.
 *   - "Revenue earned / Estimated revenue tied to ad-driven bookings" — the
 *     value behind it was bookings × a flat $250.
 *   - "Jobs booked / Bookings attributable to your ads" — the value behind it
 *     was the reported LEAD count. Leads are not booked jobs.
 *   - tips referring to campaign "grades", which no longer exist.
 */
const ADFLOW: Record<string, MetricMeta> = {
  adSpendReported: {
    label: "Ad spend (reported)",
    helpText:
      "Ad spend your ads team reported for the period, entered by hand — WeFixTrades does not connect to your ad accounts.",
    improvementTips: [
      "Ask your ads team to shift budget toward the campaigns bringing leads",
      "Agree a monthly spend cap with your ads team",
      "Check the spend against your ad platform billing — that is the source of truth",
    ],
    format: (v) => `$${(Number(v) / 100).toFixed(2)}`,
  },
  leadsReported: {
    label: "Leads (reported)",
    helpText:
      "Leads your ads team reported for the period, entered by hand. These are leads, not booked jobs.",
    improvementTips: [
      "Ask your ads team to refresh copy on campaigns that stopped producing leads",
      "Tighten the service area if leads are arriving from outside it",
      "Compare against the quote requests your WeFixTrades widget captured",
    ],
    unit: "leads",
  },
  impressionsReported: {
    label: "Impressions (reported)",
    helpText:
      "Ad impressions your ads team reported for the period, entered by hand.",
    improvementTips: [
      "High impressions with few leads usually means the audience or the offer is off",
      "Ask your ads team which keywords or audiences the impressions came from",
    ],
    unit: "impressions",
  },
  costPerLeadReported: {
    label: "Cost per lead (reported)",
    helpText:
      "Reported ad spend divided by reported leads for the period. Both figures are entered by hand.",
    improvementTips: [
      "Ask your ads team which campaign carries the highest cost per lead",
      "Agree a cost-per-lead target with your ads team and review it monthly",
    ],
    format: (v) => `$${(Number(v) / 100).toFixed(2)}`,
  },
  quoteRequestsFromAds: {
    label: "Quote requests from ads",
    helpText:
      "Quote requests your WeFixTrades widget captured in the last 30 days whose link tagging marks them as paid-ad traffic. Measured by us, not reported.",
    improvementTips: [
      "Ask your ads team to tag every ad link with utm_medium=cpc so these are counted",
      "Untagged ad clicks still reach your widget — they just cannot be attributed here",
      "Put your quote widget on the landing page the ads point at",
    ],
    unit: "requests",
  },
};

const WEBCARE: Record<string, MetricMeta> = {
  securityGrade: {
    label: "Security grade",
    // Must describe only the checks runSiteHealthCheck actually performs.
    // This previously claimed malware scanning, 2FA and password hygiene —
    // none of which WebCare measures.
    helpText:
      "A-F grade from the site health sweep: SSL certificate validity, plugin patch level, and security response headers. Shows as \"not measured\" until the first sweep runs.",
    improvementTips: [
      "Approve pending plugin & theme updates from the Maintenance Log",
      "Renew or fix the SSL certificate if it is expired or mismatched",
      "Ask us to add the missing security response headers to your site",
    ],
    unit: "/100",
  },
  uptimePct: {
    label: "Uptime",
    helpText:
      "Rolling 90-day percentage of successful uptime checks. 99.9% is the industry-standard target — anything lower means real incidents.",
    improvementTips: [
      "Move to a CDN-fronted host if drops cluster around traffic spikes",
      "Investigate the most recent fulfillment incident task",
      "Tighten the health-check cooldown so issues are caught sooner",
    ],
    unit: "%",
  },
  daysWithoutIncident: {
    label: "Days without incident",
    helpText:
      "Days since the last uptime incident detected by our 15-minute checks. Counts from your first recorded check.",
    improvementTips: [
      "Approve hardening recommendations the moment they appear",
      "Investigate the most recent uptime incident task so it does not recur",
      "Move to a more reliable host tier if outages cluster",
    ],
    unit: "days",
  },
  performanceScore: {
    label: "Performance score",
    // No Lighthouse job exists; this always renders "not measured".
    helpText:
      "Page-speed scoring is not part of WebCare today, so this stays unmeasured. Ask us if you want it added to your plan.",
    improvementTips: [],
    unit: "/100",
  },
  pendingUpdates: {
    label: "Pending updates",
    // Sourced from last_plugin_update.updates_available — plugins only.
    helpText:
      "Plugin updates found by the most recent maintenance sweep. Shows as \"not measured\" until that sweep has run at least once.",
    improvementTips: [
      "Approve 'Apply all pending updates' to clear them in one click",
      "Remove abandoned plugins that show repeated 'update available' churn",
    ],
    unit: "updates",
  },
};

const REGISTRY: Record<DashboardProduct, Record<string, MetricMeta>> = {
  contentflow: CONTENTFLOW,
  rankflow: RANKFLOW,
  socialsync: SOCIALSYNC,
  tradeline: TRADELINE,
  mapguard: MAPGUARD,
  reputationshield: REPUTATIONSHIELD,
  quotequick: QUOTEQUICK,
  adflow: ADFLOW,
  webcare: WEBCARE,
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
  if (pagePath.startsWith("/portal/quotequick") || pagePath.startsWith("/admin/quotequick")) return "quotequick";
  if (pagePath.startsWith("/portal/adflow") || pagePath.startsWith("/admin/adflow") || pagePath.startsWith("/admin/crm/adflow")) return "adflow";
  if (pagePath.startsWith("/portal/webcare") || pagePath.startsWith("/admin/crm/webcare") || pagePath.startsWith("/admin/webcare")) return "webcare";
  return undefined;
}
