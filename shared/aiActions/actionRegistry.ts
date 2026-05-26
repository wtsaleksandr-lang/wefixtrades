/**
 * Wave 34 — Universal AI-action registry.
 *
 * Single source of truth for every whitelisted AI-recommended action across
 * every product (portal customer-facing AND admin-facing). The central
 * dispatcher (`server/services/aiActions/dispatcher.ts`) refuses any
 * action_key that isn't in this list. The `<AIActionCard>` component
 * (`client/src/components/ui/visual-primitives/AIActionCard.tsx`) reads the
 * label / description / icon / confirmationLevel directly from these
 * entries, so the same recommendation looks consistent everywhere it
 * appears.
 *
 * **To add a new action:**
 *   1. Add an entry to AI_ACTIONS below.
 *   2. Add a handler in server/services/aiActions/handlers/<product>.ts.
 *   3. The frontend just sends `{ actionKey: "<your-key>" }` — no UI
 *      changes are needed unless the surfacing AI recommendation flow
 *      itself is new.
 *
 * Anti-pattern guard: the dispatcher does an exact string match against
 * `key`. There is no per-action permission model expressed here — that
 * lives in the product-specific handler (which still does the subscription
 * / SMS-opt-in / admin-role check).
 */

export type AIActionContext = "portal" | "admin";

export const AI_ACTION_PRODUCTS = [
  "mapguard",
  "reputationshield",
  "quotequick",
  "adflow",
  "webcare",
  "contentflow",
  "rankflow",
  "socialsync",
  "tradeline",
  // admin-only ops actions — alerts feed, etc.
  "system",
] as const;
export type AIActionProduct = (typeof AI_ACTION_PRODUCTS)[number];

/**
 * Confirmation strength shown to the user before the action fires.
 *
 *   - "none" : fire immediately on click (e.g. acknowledge, dismiss)
 *   - "soft" : single-button toast confirm (e.g. queue a draft post)
 *   - "hard" : modal confirmation with explicit "Yes, do it" click —
 *              MUST be used for destructive / irreversible / spendy actions.
 */
export type AIActionConfirmationLevel = "none" | "soft" | "hard";

export interface AIAction {
  /** Unique within (product, context). Matches what the frontend sends. */
  key: string;
  product: AIActionProduct;
  context: AIActionContext;
  /** Button label — kept short ("Pause campaign", not "Pause the campaign"). */
  label: string;
  /** One-sentence explanation surfaced in the AIActionCard subtext. */
  description: string;
  /** lucide-react icon name. Optional — the card has a default. */
  icon?: string;
  confirmationLevel: AIActionConfirmationLevel;
  /** Destructive actions get a red warning treatment + force "hard" UX. */
  destructive?: boolean;
  /** Shown to the user inline ("~30 seconds"). Optional. */
  estimatedSeconds?: number;
  /** Required param keys — dispatcher rejects calls missing them. */
  requiresParams?: string[];
}

/**
 * The whitelist itself. Mirrors the existing per-product `ACTION_IDS`
 * arrays (server/routes/portal/<product>/runAction.ts) plus the four
 * admin-alert actions from server/services/alertFixActions.ts.
 *
 * Order is mostly product-grouped — the registry never iterates "all
 * actions" outside admin debugging, so this is purely for readability.
 */
export const AI_ACTIONS: AIAction[] = [
  /* ─── MapGuard (portal) ─────────────────────────────────────────── */
  {
    key: "schedule-gbp-post",
    product: "mapguard",
    context: "portal",
    label: "Schedule GBP post",
    description: "Open ContentFlow with this Google Business Profile post pre-drafted.",
    icon: "MessageSquare",
    confirmationLevel: "none",
  },
  {
    key: "request-review",
    product: "mapguard",
    context: "portal",
    label: "Request reviews",
    description: "Queue review requests to recent customers.",
    icon: "Star",
    confirmationLevel: "soft",
    estimatedSeconds: 30,
  },
  {
    key: "fix-citation-nap",
    product: "mapguard",
    context: "portal",
    label: "Fix NAP citation",
    description: "Open Citation Builder with the directory mismatch pre-filled.",
    icon: "Wrench",
    confirmationLevel: "none",
  },
  {
    key: "start-citation-campaign",
    product: "mapguard",
    context: "portal",
    label: "Upgrade to Citation Builder",
    description: "Go to the Citation Builder upgrade page.",
    icon: "ArrowUpRight",
    confirmationLevel: "none",
  },
  {
    key: "acknowledge",
    product: "mapguard",
    context: "portal",
    label: "Acknowledge",
    description: "Dismiss this recommendation.",
    icon: "Check",
    confirmationLevel: "none",
  },

  /* ─── ReputationShield (portal) ─────────────────────────────────── */
  {
    key: "reply-to-review",
    product: "reputationshield",
    context: "portal",
    label: "Reply to review",
    description: "Open the AI draft editor for this review.",
    icon: "MessageSquare",
    confirmationLevel: "none",
  },
  {
    key: "request-reviews-batch",
    product: "reputationshield",
    context: "portal",
    label: "Request reviews (batch)",
    description: "Send review requests to your last 10 completed jobs.",
    icon: "Mail",
    confirmationLevel: "soft",
    estimatedSeconds: 60,
  },
  {
    key: "escalate-to-owner",
    product: "reputationshield",
    context: "portal",
    label: "Escalate to owner",
    description: "Forward this review to the owner email for hands-on follow-up.",
    icon: "AlertTriangle",
    confirmationLevel: "soft",
  },
  {
    key: "flag-as-fake",
    product: "reputationshield",
    context: "portal",
    label: "Flag as fake",
    description: "Open Google's review-flagging tool to complete the report.",
    icon: "Flag",
    confirmationLevel: "soft",
  },
  {
    key: "acknowledge",
    product: "reputationshield",
    context: "portal",
    label: "Acknowledge",
    description: "Dismiss this recommendation.",
    icon: "Check",
    confirmationLevel: "none",
  },

  /* ─── QuoteQuick (portal) ───────────────────────────────────────── */
  {
    key: "nudge-customer",
    product: "quotequick",
    context: "portal",
    label: "Nudge customer",
    description: "Send a follow-up to a customer who started but didn't book.",
    icon: "Send",
    confirmationLevel: "soft",
    estimatedSeconds: 30,
  },
  {
    key: "extend-quote-expiration",
    product: "quotequick",
    context: "portal",
    label: "Extend quote",
    description: "Extend this quote's deadline by 7 days.",
    icon: "CalendarPlus",
    confirmationLevel: "soft",
  },
  {
    key: "add-discount-offer",
    product: "quotequick",
    context: "portal",
    label: "Add 10% discount",
    description: "Append a 10% discount line to this quote.",
    icon: "BadgePercent",
    confirmationLevel: "hard",
  },
  {
    key: "request-feedback",
    product: "quotequick",
    context: "portal",
    label: "Request feedback",
    description: "Send a short why-didn't-you-book? survey.",
    icon: "MessageCircle",
    confirmationLevel: "soft",
  },
  {
    key: "acknowledge",
    product: "quotequick",
    context: "portal",
    label: "Acknowledge",
    description: "Dismiss this recommendation.",
    icon: "Check",
    confirmationLevel: "none",
  },

  /* ─── AdFlow (portal) ───────────────────────────────────────────── */
  {
    key: "pause-campaign",
    product: "adflow",
    context: "portal",
    label: "Pause campaign",
    description: "Queue an ops pause for this campaign. Already-spent budget isn't refunded.",
    icon: "Pause",
    confirmationLevel: "hard",
    destructive: true,
  },
  {
    key: "resume-campaign",
    product: "adflow",
    context: "portal",
    label: "Resume campaign",
    description: "Queue an ops resume for this campaign.",
    icon: "Play",
    confirmationLevel: "soft",
  },
  {
    key: "pause-underperforming-campaign",
    product: "adflow",
    context: "portal",
    label: "Pause underperformer",
    description: "Pause a campaign that's underperforming over the last 7 days.",
    icon: "Pause",
    confirmationLevel: "hard",
    destructive: true,
  },
  {
    key: "boost-winning-campaign",
    product: "adflow",
    context: "portal",
    label: "Boost winner",
    description: "Shift budget toward the highest-grade campaign.",
    icon: "TrendingUp",
    confirmationLevel: "hard",
  },
  {
    key: "swap-ad-copy",
    product: "adflow",
    context: "portal",
    label: "Swap ad copy",
    description: "Open the AI ad-copy composer to pick the winning variant.",
    icon: "Replace",
    confirmationLevel: "none",
  },
  {
    key: "expand-to-new-platform",
    product: "adflow",
    context: "portal",
    label: "Expand to new platform",
    description: "Duplicate this winning campaign onto a second platform.",
    icon: "Layers",
    confirmationLevel: "hard",
  },
  {
    key: "approve-anomaly-pause",
    product: "adflow",
    context: "portal",
    label: "Approve auto-pause",
    description: "Approve the anomaly-triggered campaign pause.",
    icon: "ShieldCheck",
    confirmationLevel: "hard",
    destructive: true,
  },
  {
    key: "approve-anomaly-boost",
    product: "adflow",
    context: "portal",
    label: "Approve budget boost",
    description: "Approve the anomaly-triggered budget boost.",
    icon: "TrendingUp",
    confirmationLevel: "hard",
  },
  {
    key: "investigate-anomaly",
    product: "adflow",
    context: "portal",
    label: "Investigate",
    description: "Open the anomaly drill-down view.",
    icon: "Search",
    confirmationLevel: "none",
  },
  {
    key: "acknowledge",
    product: "adflow",
    context: "portal",
    label: "Acknowledge",
    description: "Dismiss this recommendation.",
    icon: "Check",
    confirmationLevel: "none",
  },

  /* ─── WebCare (portal) ──────────────────────────────────────────── */
  {
    key: "apply-all-pending-updates",
    product: "webcare",
    context: "portal",
    label: "Apply pending updates",
    description: "Queue all plugin/theme/core updates. A fresh backup runs first.",
    icon: "Download",
    confirmationLevel: "hard",
    estimatedSeconds: 300,
  },
  {
    key: "clean-malware",
    product: "webcare",
    context: "portal",
    label: "Clean malware",
    description: "Request a malware sweep + remediation. Our team confirms within 4 hours.",
    icon: "ShieldAlert",
    confirmationLevel: "hard",
  },
  {
    key: "harden-security",
    product: "webcare",
    context: "portal",
    label: "Harden security",
    description: "Enable 2FA, login throttling, and file-edit lockdown.",
    icon: "ShieldCheck",
    confirmationLevel: "hard",
  },
  {
    key: "optimize-performance",
    product: "webcare",
    context: "portal",
    label: "Optimize performance",
    description: "Run image compression + CSS minify pass.",
    icon: "Zap",
    confirmationLevel: "soft",
    estimatedSeconds: 60,
  },
  {
    key: "run-backup-now",
    product: "webcare",
    context: "portal",
    label: "Backup now",
    description: "Take an on-demand backup. Logs to the maintenance feed.",
    icon: "HardDrive",
    confirmationLevel: "soft",
    estimatedSeconds: 90,
  },
  {
    key: "acknowledge",
    product: "webcare",
    context: "portal",
    label: "Acknowledge",
    description: "Dismiss this recommendation.",
    icon: "Check",
    confirmationLevel: "none",
  },

  /* ─── Admin system alerts (Wave 12D pattern) ────────────────────── */
  {
    key: "acknowledge",
    product: "system",
    context: "admin",
    label: "Acknowledge alert",
    description: "Mark the alert as acknowledged. Most common safe fix.",
    icon: "Check",
    confirmationLevel: "none",
  },
  {
    key: "retry-vapi-assistant",
    product: "system",
    context: "admin",
    label: "Retry Vapi assistant",
    description: "Re-run Vapi provisioning for the affected client_service.",
    icon: "RotateCcw",
    confirmationLevel: "soft",
  },
  {
    key: "retry-mapguard-scan",
    product: "system",
    context: "admin",
    label: "Retry MapGuard scan",
    description: "Re-run a MapGuard scan for the affected client.",
    icon: "RotateCcw",
    confirmationLevel: "soft",
  },
  {
    key: "mark-known-issue",
    product: "system",
    context: "admin",
    label: "Mark known issue",
    description: "Stash the alert as a known issue and acknowledge.",
    icon: "Archive",
    confirmationLevel: "soft",
  },
];

/** O(n) accessor — the registry is small (< 40 entries). */
export function getActionsForProduct(
  product: AIActionProduct,
  context: AIActionContext,
): AIAction[] {
  return AI_ACTIONS.filter(
    (a) => a.product === product && a.context === context,
  );
}

/**
 * Look up an action by (product, context, key). Returns `undefined`
 * if the action is not whitelisted — the dispatcher MUST treat this as
 * a 400 / refuse-to-run, never default to anything.
 */
export function getAction(
  product: AIActionProduct,
  context: AIActionContext,
  key: string,
): AIAction | undefined {
  return AI_ACTIONS.find(
    (a) => a.product === product && a.context === context && a.key === key,
  );
}

/** Stable global registry lookup — convenient for tests and admin tooling. */
export function findActionAnywhere(key: string): AIAction[] {
  return AI_ACTIONS.filter((a) => a.key === key);
}

export function isAIActionProduct(value: string): value is AIActionProduct {
  return (AI_ACTION_PRODUCTS as readonly string[]).includes(value);
}
