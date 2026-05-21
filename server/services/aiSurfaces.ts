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
  business_operator: "business_operator",
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
  business_operator: 5000,
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
  business_operator: "Business Operator",
};
