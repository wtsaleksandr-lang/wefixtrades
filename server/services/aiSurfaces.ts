/**
 * Centralized registry of AI "surfaces" — distinct entry points where the
 * product calls an LLM / image API. Every call site must declare its
 * surface so the system-wide gate (aiSystemGate.ts) can enforce a per-
 * surface kill switch + monthly spend cap, and ai_usage_logs.surface stays
 * consistent across the codebase.
 *
 * Adding a new surface? 1) add it to AI_SURFACES, 2) seed it in
 * migration 0026_ai_system_gates.sql, 3) wire `aiGateAllowed(surface)`
 * before the upstream call.
 *
 * Source: W-AX-1 — promote ContentFlow's product-scoped gate to system scope.
 */

export const AI_SURFACES = {
  contentflow: "contentflow",
  socialsync: "socialsync",
  mapguard: "mapguard",
  reputation: "reputation",
  reply_intelligence: "reply_intelligence",
  onboarding: "onboarding",
  inbound_classifier: "inbound_classifier",
  prospect_enrichment: "prospect_enrichment",
  supplier_dispatch: "supplier_dispatch",
  adflow_reports: "adflow_reports",
  sitelaunch: "sitelaunch",
  quotequick: "quotequick",
  quotequick_widget_ai: "quotequick_widget_ai",
  business_operator: "business_operator",
  // 2026-05-24 — added to close the surface-gate gap on the remaining
  // ungated chat() callers identified by the AI infrastructure audit.
  // Gate rows lazy-create on first call via ensureGateRow().
  wft_audit: "wft_audit",
  wft_sales: "wft_sales",
  tradeline_voice: "tradeline_voice",
  // Wave 86 — Claude vision OCR for phone-bill extraction during the
  // port-existing-number flow. Per-call ~$0.03 (Sonnet vision); gated
  // behind tier eligibility upstream so abuse risk is low.
  tradeline_port_ocr: "tradeline_port_ocr",
  ops_engine: "ops_engine",
  demo: "demo",
  // Wave 7 — AI Insights bundled with MapGuard. Generates prioritized
  // action recommendations from MapGuard/CT signals. 24h cache keeps
  // monthly spend low (~$0.10/customer/mo at full utilization).
  ai_insights: "ai_insights",
  // Wave 12A — anonymous marketing chat widget on wefixtrades.com. Visitor
  // qualification + product recommendation + lead capture. Per-IP rate-
  // limited (20 msgs/min); per-session message cap enforced server-side.
  wft_marketing_chat: "wft_marketing_chat",
} as const;

export type AiSurface = (typeof AI_SURFACES)[keyof typeof AI_SURFACES];

/** All surface names in display order for the admin dashboard. */
export const AI_SURFACE_LIST: AiSurface[] = Object.values(AI_SURFACES);

/** Default monthly budgets in CENTS — used by the migration seed AND when
 * a brand-new surface is registered at runtime without a pre-seeded row. */
export const DEFAULT_BUDGET_CENTS: Record<AiSurface, number | null> = {
  contentflow: 5000,
  socialsync: 2000,
  mapguard: 2000,
  reputation: 2000,
  reply_intelligence: 1000,
  onboarding: 500,
  inbound_classifier: 500,
  prospect_enrichment: 1000,
  supplier_dispatch: 500,
  adflow_reports: 500,
  sitelaunch: 1000,
  quotequick: 5000,
  // W-BB-1 — customer-facing widget chat (multi-step). Lower cap because
  // abuse risk is higher with anonymous customers and per-conversation cap
  // is already enforced inside the agent loop (25¢/run).
  quotequick_widget_ai: 2000,
  business_operator: 5000,
  wft_audit: 2000,
  wft_sales: 500,
  tradeline_voice: 2000,
  tradeline_port_ocr: 1000,
  ops_engine: 500,
  demo: 500,
  // 24h cache + max 1 refresh/hr/customer keeps spend bounded. Conservative
  // monthly cap; gate row will lazy-create on first call.
  ai_insights: 2000,
  // Wave 12A — anonymous marketing chat. Per-IP 20/min limiter + per-
  // session 30-message cap keeps abuse contained. $20/mo soft cap pauses
  // the surface if it ever runs hot before launch.
  wft_marketing_chat: 2000,
};

/** Human-readable display label used in the admin gates dashboard. */
export const AI_SURFACE_LABELS: Record<AiSurface, string> = {
  contentflow: "ContentFlow",
  socialsync: "SocialSync",
  mapguard: "MapGuard",
  reputation: "ReputationShield",
  reply_intelligence: "Reply Intelligence",
  onboarding: "Onboarding AI",
  inbound_classifier: "Inbound Classifier",
  prospect_enrichment: "Prospect Enrichment",
  supplier_dispatch: "Supplier Dispatch",
  adflow_reports: "AdFlow Reports",
  sitelaunch: "SiteLaunch",
  quotequick: "QuoteQuick",
  quotequick_widget_ai: "QuoteQuick Customer Chat (Multi-Step)",
  business_operator: "Business Operator",
  wft_audit: "WeFix Audit Narrative",
  wft_sales: "WeFix Sales Line",
  tradeline_voice: "TradeLine Voice",
  tradeline_port_ocr: "TradeLine Port OCR",
  ops_engine: "Ops Engine Summary",
  demo: "Public Demos",
  ai_insights: "AI Insights (MapGuard)",
  wft_marketing_chat: "Marketing Chat Widget (Anonymous)",
};
