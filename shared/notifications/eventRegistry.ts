/**
 * Universal notification event registry — Wave 32.
 *
 * Single source of truth for every notification-eligible event across
 * all 9 WeFixTrades products. Replaces the per-product event lists that
 * Waves 27-31 each defined in their own `notificationSettings.ts`
 * routes. The per-product routes still exist for backwards-compat
 * reads, but new fan-out goes through this registry + the central
 * dispatcher in `server/services/notifications/dispatch.ts`.
 *
 * The registry deliberately keeps event keys identical to the legacy
 * per-product keys so existing rows in `clients.metadata.*_notifications`
 * continue to work without a data migration. The unified UI reads from
 * these per-product blobs first, falling back to the registry defaults
 * if a customer hasn't yet expressed a preference for a given event.
 *
 * Adding a new event:
 *   1. Append a row below with a stable `key` (snake_case).
 *   2. Pick `defaultChannels` carefully — these become the customer's
 *      default opt-in. Critical events: email + web_push (never SMS by
 *      default — SMS requires explicit `sms_opt_in`).
 *   3. The central dispatcher picks up the new event automatically.
 */

export const NOTIFICATION_PRODUCTS = [
  "contentflow",
  "rankflow",
  "socialsync",
  "tradeline",
  "mapguard",
  "reputationshield",
  "quotequick",
  "adflow",
  "webcare",
] as const;
export type NotificationProduct = (typeof NOTIFICATION_PRODUCTS)[number];

export const NOTIFICATION_CHANNELS = ["email", "sms", "web_push"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type NotificationSeverity = "info" | "warning" | "critical";

export interface NotificationEvent {
  key: string;
  product: NotificationProduct;
  label: string;
  description: string;
  defaultChannels: NotificationChannel[];
  severity: NotificationSeverity;
  /**
   * If true, the dispatcher will dedupe by (customer, event, day-bucket).
   * Use for high-frequency events that risk spam (rank drops, anomalies).
   */
  dedupePerDay?: boolean;
}

export const PRODUCT_LABELS: Record<NotificationProduct, string> = {
  contentflow: "ContentFlow",
  rankflow: "RankFlow",
  socialsync: "SocialSync",
  tradeline: "TradeLine",
  mapguard: "MapGuard",
  reputationshield: "ReputationShield",
  quotequick: "QuoteQuick",
  adflow: "AdFlow",
  webcare: "WebCare",
};

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  email: "Email",
  sms: "SMS",
  web_push: "Web push",
};

/**
 * Per-product metadata blob keys inside `clients.metadata` where Waves
 * 27-31 currently persist preferences. The unified UI reads/writes the
 * legacy blobs so we don't lose existing customer choices on rollout.
 */
export const PRODUCT_METADATA_KEY: Record<NotificationProduct, string> = {
  contentflow: "contentflow_notifications",
  rankflow: "rankflow_notifications",
  socialsync: "socialsync_notifications",
  tradeline: "tradeline_notifications",
  mapguard: "mapguard_notifications",
  reputationshield: "reputationshield_notifications",
  quotequick: "quotequick_notifications",
  adflow: "adflow_notifications",
  webcare: "webcare_notifications",
};

export const NOTIFICATION_EVENTS: NotificationEvent[] = [
  // ─── ContentFlow ─────────────────────────────────────────────────────
  {
    key: "draft_ready_for_review",
    product: "contentflow",
    label: "Draft ready for review",
    description: "A new article draft is waiting for your review.",
    defaultChannels: ["email"],
    severity: "info",
  },
  {
    key: "publish_blocked_quality_gate",
    product: "contentflow",
    label: "Publish blocked by quality gate",
    description: "An article failed the quality / brand-voice gate and needs a human look.",
    defaultChannels: ["email", "web_push"],
    severity: "warning",
  },
  {
    key: "monthly_quota_80pct",
    product: "contentflow",
    label: "Monthly quota at 80%",
    description: "You've used 80% of this month's content quota.",
    defaultChannels: ["email"],
    severity: "info",
  },

  // ─── RankFlow ────────────────────────────────────────────────────────
  {
    key: "rank_drop_organic",
    product: "rankflow",
    label: "Organic rank dropped",
    description: "A tracked keyword dropped 3+ positions in organic search.",
    defaultChannels: ["email", "web_push"],
    severity: "warning",
    dedupePerDay: true,
  },
  {
    key: "rank_gain_top10",
    product: "rankflow",
    label: "New top-10 ranking",
    description: "A tracked keyword just broke into the top 10.",
    defaultChannels: ["email"],
    severity: "info",
  },
  {
    key: "weekly_ranking_report",
    product: "rankflow",
    label: "Weekly ranking report",
    description: "Your weekly RankFlow performance summary just landed.",
    defaultChannels: ["email"],
    severity: "info",
  },

  // ─── SocialSync ──────────────────────────────────────────────────────
  {
    key: "post_publish_failed",
    product: "socialsync",
    label: "Post failed to publish",
    description: "A scheduled social post couldn't go out — usually an OAuth refresh.",
    defaultChannels: ["email", "web_push"],
    severity: "warning",
  },
  {
    key: "post_high_engagement",
    product: "socialsync",
    label: "Post has high engagement",
    description: "A post is trending — 2x your normal engagement rate.",
    defaultChannels: ["email"],
    severity: "info",
  },

  // ─── TradeLine ───────────────────────────────────────────────────────
  {
    key: "missed_call",
    product: "tradeline",
    label: "Missed call",
    description: "TradeLine answered a call you missed — full transcript inside.",
    defaultChannels: ["email", "web_push"],
    severity: "info",
  },
  {
    key: "new_voicemail",
    product: "tradeline",
    label: "New voicemail",
    description: "A new voicemail with AI transcript is waiting.",
    defaultChannels: ["email", "web_push"],
    severity: "info",
  },
  {
    key: "hot_lead_detected",
    product: "tradeline",
    label: "Hot lead detected",
    description: "AI flagged a high-intent caller — usually ready to book.",
    defaultChannels: ["email", "web_push"],
    severity: "warning",
  },

  // ─── MapGuard (Wave 27 keys preserved) ───────────────────────────────
  {
    key: "rank_drop_top3",
    product: "mapguard",
    label: "Drop out of top 3",
    description: "Customer loses a Map Pack slot on any monitored keyword × pin.",
    defaultChannels: ["email", "web_push"],
    severity: "warning",
    dedupePerDay: true,
  },
  {
    key: "citation_nap_mismatch",
    product: "mapguard",
    label: "Citation NAP mismatch",
    description: "Name / address / phone changes detected on a tracked directory listing.",
    defaultChannels: ["email"],
    severity: "warning",
  },
  {
    key: "new_negative_review",
    product: "mapguard",
    label: "New negative review",
    description: "1-3 star review detected via ReputationShield (cross-product).",
    defaultChannels: ["email", "web_push"],
    severity: "warning",
  },
  {
    key: "competitor_outranked",
    product: "mapguard",
    label: "Competitor outranked you",
    description: "A monitored competitor moves ahead of you on a tracked keyword.",
    defaultChannels: ["email"],
    severity: "info",
    dedupePerDay: true,
  },

  // ─── ReputationShield (Wave 28 keys preserved) ───────────────────────
  {
    key: "new_review",
    product: "reputationshield",
    label: "Any new review",
    description: "Fired when a fresh review is detected on any monitored platform.",
    defaultChannels: ["email"],
    severity: "info",
  },
  {
    key: "negative_review",
    product: "reputationshield",
    label: "Negative review (1-3 stars)",
    description: "Same-day alert for low ratings so you can respond before the customer churns.",
    defaultChannels: ["email", "web_push"],
    severity: "critical",
  },
  {
    key: "five_star_review",
    product: "reputationshield",
    label: "5-star review",
    description: "Celebrate the wins. Optional — many owners leave this off.",
    defaultChannels: [],
    severity: "info",
  },
  {
    key: "no_reviews_7d",
    product: "reputationshield",
    label: "No reviews in 7 days",
    description: "Light nudge — your review velocity has stalled for a week.",
    defaultChannels: [],
    severity: "info",
  },
  {
    key: "no_reviews_14d",
    product: "reputationshield",
    label: "No reviews in 14 days",
    description: "Stronger nudge — 2+ weeks without a review impacts ranking.",
    defaultChannels: ["email"],
    severity: "warning",
  },

  // ─── QuoteQuick (Wave 29 keys preserved) ─────────────────────────────
  {
    key: "quote_viewed",
    product: "quotequick",
    label: "Quote viewed",
    description: "Fired when a customer opens a shareable quote URL. Off by default — can be noisy.",
    defaultChannels: [],
    severity: "info",
  },
  {
    key: "quote_started",
    product: "quotequick",
    label: "Quote started",
    description: "Customer began filling out the widget. Useful as an early signal.",
    defaultChannels: [],
    severity: "info",
  },
  {
    key: "quote_completed",
    product: "quotequick",
    label: "Quote completed",
    description: "Customer reached the final step. The most reliable lead signal.",
    defaultChannels: ["email", "web_push"],
    severity: "info",
  },
  {
    key: "deposit_paid",
    product: "quotequick",
    label: "Deposit paid",
    description: "Customer paid the deposit via Stripe. Job is locked in.",
    defaultChannels: ["email", "web_push"],
    severity: "info",
  },
  {
    key: "quote_expired",
    product: "quotequick",
    label: "Quote expired",
    description: "Quote went past its deadline without action — time to follow up.",
    defaultChannels: ["email"],
    severity: "info",
  },

  // ─── AdFlow (Wave 30 keys preserved) ─────────────────────────────────
  {
    key: "anomaly_detected",
    product: "adflow",
    label: "Anomaly detected",
    description: "An ad campaign behaved very differently than expected — usually worth investigating.",
    defaultChannels: ["email", "web_push"],
    severity: "warning",
    dedupePerDay: true,
  },
  {
    key: "daily_spend_exceeded",
    product: "adflow",
    label: "Daily spend over limit",
    description: "Today's ad spend went above the cap you set.",
    defaultChannels: ["email", "web_push"],
    severity: "warning",
  },
  {
    key: "campaign_paused",
    product: "adflow",
    label: "Campaign paused",
    description: "Fires whenever a campaign gets paused — either by you, by the AI, or by your ops team.",
    defaultChannels: ["email"],
    severity: "info",
  },
  {
    key: "new_lead_from_ad",
    product: "adflow",
    label: "New lead from an ad",
    description: "Customer reached you via one of your paid ads. Useful as a real-time pulse.",
    defaultChannels: ["email", "web_push"],
    severity: "info",
  },
  {
    key: "weekly_report_ready",
    product: "adflow",
    label: "Weekly report ready",
    description: "Your weekly performance summary just landed.",
    defaultChannels: ["email"],
    severity: "info",
  },

  // ─── WebCare (Wave 31 keys preserved) ────────────────────────────────
  {
    key: "security_incident",
    product: "webcare",
    label: "Security incident",
    description: "Malware, brute-force spikes, or any other event that drops your security grade.",
    defaultChannels: ["email", "web_push"],
    severity: "critical",
  },
  {
    key: "backup_failed",
    product: "webcare",
    label: "Backup failed",
    description: "Nightly backup couldn't complete — usually a host or storage issue.",
    defaultChannels: ["email", "web_push"],
    severity: "warning",
  },
  {
    key: "site_went_down",
    product: "webcare",
    label: "Site went down",
    description: "Our uptime check failed. Deduped to one alert per 4 hours per site.",
    defaultChannels: ["email", "web_push"],
    severity: "critical",
    dedupePerDay: true,
  },
  {
    key: "vulnerability_detected",
    product: "webcare",
    label: "Vulnerability detected",
    description: "A known CVE affects an installed plugin, theme, or WordPress core.",
    defaultChannels: ["email", "web_push"],
    severity: "warning",
  },
  {
    key: "maintenance_complete",
    product: "webcare",
    label: "Maintenance complete",
    description: "Heads-up after we apply a batch of plugin / theme / core updates.",
    defaultChannels: ["email"],
    severity: "info",
  },
  {
    key: "monthly_digest_ready",
    product: "webcare",
    label: "Monthly report ready",
    description: "Your 5-number monthly report just landed.",
    defaultChannels: ["email"],
    severity: "info",
  },
];

/** Group events by product for the unified UI's per-product sections. */
export function getEventsByProduct(): Record<NotificationProduct, NotificationEvent[]> {
  const out = Object.fromEntries(
    NOTIFICATION_PRODUCTS.map((p) => [p, [] as NotificationEvent[]]),
  ) as Record<NotificationProduct, NotificationEvent[]>;
  for (const ev of NOTIFICATION_EVENTS) out[ev.product].push(ev);
  return out;
}

/** Resolve one event by (product, key). Returns undefined if not in registry. */
export function findEvent(product: NotificationProduct, key: string): NotificationEvent | undefined {
  return NOTIFICATION_EVENTS.find((e) => e.product === product && e.key === key);
}

/** Default channel map for a single event, as `{email, sms, web_push}`. */
export function defaultChannelMap(ev: NotificationEvent): Record<NotificationChannel, boolean> {
  return {
    email: ev.defaultChannels.includes("email"),
    sms: ev.defaultChannels.includes("sms"),
    web_push: ev.defaultChannels.includes("web_push"),
  };
}
