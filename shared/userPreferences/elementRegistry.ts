/**
 * Wave 36.5 — Per-element granular toggles.
 *
 * The canonical registry of every UI element that is hidden by default in
 * Simple mode (and conditionally revealed by the existing per-product toggle).
 *
 * Wave 36 shipped one toggle per product. Wave 36.5 lets a user opt-in to a
 * specific element by id, without flipping the whole product to Advanced.
 *
 * Resolution order — implemented by `isElementVisible()` below:
 *   1. `elementOverrides[id]` if set (true → always show; false → always hide).
 *   2. Else the existing product/mode logic from `isAdvancedVisible()`.
 *
 * Adding a new element
 * ────────────────────
 *   • Choose a stable kebab-case id `<product>.<short-name>`.
 *     Never rename — the id is persisted in clients.metadata.display_preferences.
 *   • Add the entry below.
 *   • Pass the id to the matching `<AdvancedOnly>` wrapper.
 *
 * IDs are immutable once shipped — the JSONB blob in production carries them.
 */
import type { AdvancedProductKey } from "./displayMode";

export type ElementCategory =
  | "kpi"
  | "chart"
  | "feed"
  | "action"
  | "composer"
  | "inventory";

export type DisplayElement = {
  /** Stable kebab-case id, persisted in clients.metadata.display_preferences. NEVER rename. */
  id: string;
  /** Product the element belongs to — drives the Settings → Display grouping. */
  product: AdvancedProductKey;
  /** Human-readable label shown in the Settings → Display element accordion. */
  label: string;
  /** One-line explanation of what the element shows the user. */
  description: string;
  /** UI category — drives the icon + ordering in the Settings accordion. */
  category: ElementCategory;
};

/**
 * The element registry. Order within a product reflects the visual order on
 * the dashboard (top → bottom) so the Settings accordion mirrors the page.
 */
export const DISPLAY_ELEMENTS: readonly DisplayElement[] = [
  // ─── portal (home dashboard) ───────────────────────────────────────────
  {
    id: "portal.recent-activity-feed",
    product: "portal",
    label: "Recent activity feed",
    description: "Live stream of task updates, call logs, and new leads across all services.",
    category: "feed",
  },

  // ─── contentflow ───────────────────────────────────────────────────────
  {
    id: "contentflow.ai-detection-tile",
    product: "contentflow",
    label: "AI-Detection score tile",
    description: "Letter grade for how human your AI-generated content reads. Power-user QA metric.",
    category: "kpi",
  },
  {
    id: "contentflow.distribution-reach-ring",
    product: "contentflow",
    label: "Distribution reach ring",
    description: "How many channels your latest pieces were syndicated to.",
    category: "kpi",
  },
  {
    id: "contentflow.recent-creations-grid",
    product: "contentflow",
    label: "Recent creations grid",
    description: "Thumbnail grid of your latest 8 pieces of content with quick links.",
    category: "inventory",
  },
  // Wave 72 — new KPI primitives
  {
    id: "contentflow.content-type-mix-donut",
    product: "contentflow",
    label: "Content type mix",
    description: "Donut showing the recent split between articles, social posts, images, and video.",
    category: "chart",
  },
  {
    id: "contentflow.top-post-sparkline",
    product: "contentflow",
    label: "Top-performing post sparkline",
    description: "Sparkline with peak callout for the best recent content engagement.",
    category: "chart",
  },

  // ─── rankflow ──────────────────────────────────────────────────────────
  {
    id: "rankflow.keywords-tracked-tile",
    product: "rankflow",
    label: "Keywords tracked counter",
    description: "Total keywords currently being monitored across all locations.",
    category: "kpi",
  },
  {
    id: "rankflow.top20-tile",
    product: "rankflow",
    label: "Top 20 counter",
    description: "Keywords ranked in positions 11-20 — the on-deck circle.",
    category: "kpi",
  },
  {
    id: "rankflow.pages-indexed-tile",
    product: "rankflow",
    label: "Pages indexed counter",
    description: "Total site pages Google has indexed.",
    category: "kpi",
  },
  {
    id: "rankflow.secondary-gauges",
    product: "rankflow",
    label: "Secondary gauges (avg position / keywords improved / SEO score)",
    description: "Three analyst gauges that complement the hero counter tile.",
    category: "kpi",
  },
  {
    id: "rankflow.competitor-comparison",
    product: "rankflow",
    label: "Competitor comparison grid",
    description: "Your position vs the top SERP result for each tracked keyword.",
    category: "chart",
  },
  {
    id: "rankflow.opportunity-heatmap",
    product: "rankflow",
    label: "Keyword opportunity heatmap",
    description: "Locations × keywords grid showing where you could rank with the least effort.",
    category: "chart",
  },
  {
    id: "rankflow.activity-feed",
    product: "rankflow",
    label: "Activity feed",
    description: "Recent publishes, rank moves, and SEO work in a unified timeline.",
    category: "feed",
  },
  // Wave 72 — new KPI primitives
  {
    id: "rankflow.best-spike-sparkline",
    product: "rankflow",
    label: "Best-ranking spike sparkline",
    description: "12-week sparkline highlighting your strongest ranking week.",
    category: "chart",
  },
  {
    id: "rankflow.page1-vs-page2-bars",
    product: "rankflow",
    label: "Page 1 vs Page 2 keywords",
    description: "Side-by-side bar comparison of top-10 vs positions 11-20 keyword counts.",
    category: "chart",
  },

  // ─── socialsync ────────────────────────────────────────────────────────
  {
    id: "socialsync.avg-engagement-kpi",
    product: "socialsync",
    label: "Average engagement gauge",
    description: "Average engagement rate across all platforms (jargon-heavy, hidden by default).",
    category: "kpi",
  },
  {
    id: "socialsync.whatsapp-messages-kpi",
    product: "socialsync",
    label: "WhatsApp messages this week",
    description: "Count of WhatsApp customer messages received — also covered by TradeLine.",
    category: "kpi",
  },
  {
    id: "socialsync.engagement-by-platform",
    product: "socialsync",
    label: "Engagement by platform",
    description: "Per-platform engagement gauges (FB / IG / LinkedIn) with target thresholds.",
    category: "chart",
  },
  {
    id: "socialsync.best-time-to-post",
    product: "socialsync",
    label: "Best time to post — right now",
    description: "Live score for posting in the current hour, blended with industry baselines.",
    category: "kpi",
  },
  {
    id: "socialsync.approvals-preview",
    product: "socialsync",
    label: "Awaiting your review preview",
    description: "First three pending approvals — duplicates the Approvals tab.",
    category: "feed",
  },
  // Wave 72 — new KPI primitives
  {
    id: "socialsync.platform-mix-donut",
    product: "socialsync",
    label: "Platform mix donut",
    description: "Donut chart of recent posts split by social platform.",
    category: "chart",
  },
  {
    id: "socialsync.top-post-sparkline",
    product: "socialsync",
    label: "Top-performing post sparkline",
    description: "Sparkline with peak callout for the best-engagement day.",
    category: "chart",
  },

  // ─── tradeline ─────────────────────────────────────────────────────────
  {
    id: "tradeline.cost-per-booking-card",
    product: "tradeline",
    label: "Cost-per-booking card",
    description: "AI-handling cost ÷ jobs booked, with missed-revenue estimate.",
    category: "kpi",
  },
  {
    id: "tradeline.sentiment-heatmap",
    product: "tradeline",
    label: "Call sentiment heatmap",
    description: "Per-call sentiment by segment — surfaces only when a call is selected.",
    category: "chart",
  },
  // Wave 72 — new KPI primitives
  {
    id: "tradeline.answered-vs-missed-bars",
    product: "tradeline",
    label: "Answered vs missed bars",
    description: "Side-by-side bar comparison of answered vs missed calls today.",
    category: "chart",
  },
  {
    id: "tradeline.peak-call-hour-sparkline",
    product: "tradeline",
    label: "Peak call hour sparkline",
    description: "Hourly call volume with peak hour highlighted.",
    category: "chart",
  },
  {
    id: "tradeline.calls-monthly-bars",
    product: "tradeline",
    label: "Calls per month",
    description: "Monthly bar series of call volume over the last 6 months.",
    category: "chart",
  },

  // ─── mapguard ──────────────────────────────────────────────────────────
  {
    id: "mapguard.header-actions",
    product: "mapguard",
    label: "Alerts + Full report header buttons",
    description: "Page-header shortcuts to alert prefs and the full GBP report.",
    category: "action",
  },
  {
    id: "mapguard.top3-coverage-tile",
    product: "mapguard",
    label: "Top-3 coverage tile",
    description: "Percentage of your 5×5 grid where you rank in the top 3.",
    category: "kpi",
  },
  {
    id: "mapguard.citation-health-tile",
    product: "mapguard",
    label: "Citation health tile",
    description: "Letter grade for directory consistency across NAP citations.",
    category: "kpi",
  },
  {
    id: "mapguard.gbp-health-tile",
    product: "mapguard",
    label: "GBP health tile",
    description: "Composite Google Business Profile health score with 14-day trend.",
    category: "kpi",
  },
  {
    id: "mapguard.competitor-alert-feed",
    product: "mapguard",
    label: "Competitor alert feed",
    description: "Reactive timeline of competitor rank moves and citation changes.",
    category: "feed",
  },
  // Wave 72 — new KPI primitives
  {
    id: "mapguard.citation-directory-donut",
    product: "mapguard",
    label: "Citation directory mix",
    description: "Donut chart of citations split by clean / missing / inconsistent.",
    category: "chart",
  },
  {
    id: "mapguard.best-rank-day-sparkline",
    product: "mapguard",
    label: "Best-ranking day sparkline",
    description: "Sparkline with peak callout for the best day across the geo grid.",
    category: "chart",
  },

  // ─── reputationshield ──────────────────────────────────────────────────
  {
    id: "reputationshield.header-actions",
    product: "reputationshield",
    label: "Notifications + Settings header buttons",
    description: "Page-header shortcuts to per-product notification prefs.",
    category: "action",
  },
  {
    id: "reputationshield.review-velocity-tile",
    product: "reputationshield",
    label: "Review velocity tile",
    description: "Reviews this month with 12-week sparkline. Analyst-speak metric.",
    category: "kpi",
  },
  {
    id: "reputationshield.days-since-tile",
    product: "reputationshield",
    label: "Days since last review tile",
    description: "Urgency counter — Copilot surfaces this proactively via push.",
    category: "kpi",
  },
  {
    id: "reputationshield.reply-rate-tile",
    product: "reputationshield",
    label: "Reply rate tile",
    description: "Percentage of reviews you've responded to. Internal QA metric.",
    category: "kpi",
  },
  {
    id: "reputationshield.platform-scorecard",
    product: "reputationshield",
    label: "Platform scorecard",
    description: "Per-platform rating + count + 30-day delta (Google / Yelp / Facebook / BBB).",
    category: "chart",
  },
  {
    id: "reputationshield.days-since-gauge",
    product: "reputationshield",
    label: "Days-since gauge with batch-request action",
    description: "Large gauge + 1-click 'request reviews' button.",
    category: "action",
  },
  {
    id: "reputationshield.sentiment-heatmap",
    product: "reputationshield",
    label: "Review sentiment heatmap",
    description: "Per-category sentiment across all your reviews. Power-analyst tool.",
    category: "chart",
  },
  // Wave 72 — new KPI primitives
  {
    id: "reputationshield.sentiment-mix-donut",
    product: "reputationshield",
    label: "Sentiment mix donut",
    description: "Donut chart of recent review sentiment (positive / neutral / negative).",
    category: "chart",
  },
  {
    id: "reputationshield.replied-vs-unreplied",
    product: "reputationshield",
    label: "Replied vs unreplied bars",
    description: "Side-by-side bar comparison of replied vs unreplied reviews.",
    category: "chart",
  },
  {
    id: "reputationshield.reviews-monthly-bars",
    product: "reputationshield",
    label: "New reviews per month",
    description: "Monthly bar series of new reviews over the last 6 months.",
    category: "chart",
  },

  // ─── quotequick ────────────────────────────────────────────────────────
  {
    id: "quotequick.active-embeds-ring",
    product: "quotequick",
    label: "Active embeds ring",
    description: "How many of your configured embed sites are live and accepting quotes.",
    category: "kpi",
  },
  {
    id: "quotequick.conversion-gauge-grid",
    product: "quotequick",
    label: "Conversion gauge per template",
    description: "Per-template conversion ring grid — only relevant when you have multiple templates.",
    category: "chart",
  },
  // Wave 72 — new KPI primitives
  {
    id: "quotequick.best-revenue-sparkline",
    product: "quotequick",
    label: "Best revenue day sparkline",
    description: "14-day sparkline with peak callout for the highest-revenue day.",
    category: "chart",
  },
  {
    id: "quotequick.views-vs-completions",
    product: "quotequick",
    label: "Views vs completions bars",
    description: "Side-by-side bar comparison of quote views vs completed quotes.",
    category: "chart",
  },
  {
    id: "quotequick.quotes-monthly-bars",
    product: "quotequick",
    label: "Quotes per month",
    description: "Monthly bar series of quotes sent over the last 6 months.",
    category: "chart",
  },

  // ─── adflow ────────────────────────────────────────────────────────────
  {
    id: "adflow.header-actions",
    product: "adflow",
    label: "Notifications + Setup header buttons",
    description: "Page-header shortcuts to per-product notification prefs and setup wizard.",
    category: "action",
  },
  {
    id: "adflow.cost-per-booking-sidebar",
    product: "adflow",
    label: "Cost-per-booking + jobs-booked sidebar",
    description: "Two analyst tiles next to the ROI funnel. Already implied by the funnel itself.",
    category: "kpi",
  },
  {
    id: "adflow.ad-copy-composer",
    product: "adflow",
    label: "AI ad-copy composer",
    description: "Inline composer for generating ad variants — Copilot is the canonical surface now.",
    category: "composer",
  },
  {
    id: "adflow.power-analyst-heatmaps",
    product: "adflow",
    label: "Trade + day-parting heatmaps",
    description: "Profitable-trade and day-of-week heatmaps for power-user analysis.",
    category: "chart",
  },
  // Wave 72 — new KPI primitives
  {
    id: "adflow.peak-roas-sparkline",
    product: "adflow",
    label: "Peak ROAS day sparkline",
    description: "Sparkline with peak callout for the best return-on-ad-spend day.",
    category: "chart",
  },
  {
    id: "adflow.spend-by-platform-donut",
    product: "adflow",
    label: "Ad spend by platform donut",
    description: "Donut chart of ad spend split by Google / Meta / Bing.",
    category: "chart",
  },

  // ─── webcare ───────────────────────────────────────────────────────────
  {
    id: "webcare.header-actions",
    product: "webcare",
    label: "Notifications + Setup header buttons",
    description: "Page-header shortcuts to per-product notification prefs and setup wizard.",
    category: "action",
  },
  {
    id: "webcare.performance-ring",
    product: "webcare",
    label: "Performance ring",
    description: "Lighthouse performance score (mobile + desktop) with target threshold.",
    category: "kpi",
  },
  {
    id: "webcare.backup-timeline",
    product: "webcare",
    label: "Backup timeline",
    description: "30-day backup history with 1-click 'run backup now' action.",
    category: "chart",
  },
  {
    id: "webcare.pending-updates-section",
    product: "webcare",
    label: "Pending updates + site inventory",
    description: "Pending plugin/core updates gauge alongside the full site inventory.",
    category: "inventory",
  },
  // Wave 72 — new KPI primitives
  {
    id: "webcare.incidents-monthly-bars",
    product: "webcare",
    label: "Incidents per month",
    description: "Monthly bar series of incidents over the last 6 months.",
    category: "chart",
  },
  {
    id: "webcare.uptime-sla-bars",
    product: "webcare",
    label: "Uptime SLA target vs actual",
    description: "Side-by-side bar comparison of uptime SLA target vs actual uptime.",
    category: "chart",
  },
] as const;

/** Element ids as a typed union (compile-time enforcement at the wrapper site). */
export type DisplayElementId = (typeof DISPLAY_ELEMENTS)[number]["id"];

/** Set of all known ids — used by the Zod validator and the Copilot serialiser. */
export const DISPLAY_ELEMENT_IDS: ReadonlySet<string> = new Set(
  DISPLAY_ELEMENTS.map((e) => e.id),
);

/** Lookup by id — O(1) via Map. Returns undefined for unknown ids. */
const ELEMENT_BY_ID: ReadonlyMap<string, DisplayElement> = new Map(
  DISPLAY_ELEMENTS.map((e) => [e.id, e]),
);

export function getDisplayElement(id: string): DisplayElement | undefined {
  return ELEMENT_BY_ID.get(id);
}

/** Elements grouped by product, in registry order. Used by the Settings UI. */
export function elementsByProduct(): Record<AdvancedProductKey, DisplayElement[]> {
  const out = {} as Record<AdvancedProductKey, DisplayElement[]>;
  for (const e of DISPLAY_ELEMENTS) {
    if (!out[e.product]) out[e.product] = [];
    out[e.product].push(e);
  }
  return out;
}
