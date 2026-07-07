/**
 * Single source of truth for the marketing primary CTA.
 *
 * Both the top MarketingNav and the bottom MarketingStickyBar must use these
 * values so the canonical "start building" call-to-action has ONE label and
 * ONE destination everywhere. Destination is /wizard — jump straight into
 * building. `shortLabel` is for the space-constrained sticky bar.
 */
export const PRIMARY_CTA = {
  label: "Start free — no card",
  shortLabel: "Start free",
  href: "/wizard",
} as const;
