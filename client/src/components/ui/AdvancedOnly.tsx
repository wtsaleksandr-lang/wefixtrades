/**
 * Wave 36 — Tesla Simplification.
 *
 * Wrapper that hides its children unless the user has enabled Advanced
 * mode AND toggled the per-product advanced switch on. Used across all
 * 9 customer dashboards to demote power-user analytics by default.
 *
 * Usage
 * ─────
 *   <AdvancedOnly product="contentflow">
 *     <SecondaryAnalyticsCard />
 *   </AdvancedOnly>
 *
 * Crash safety
 * ────────────
 * If preferences can't load, the wrapper returns null (Simple-by-default).
 * It never throws.
 */

import { type ReactNode } from "react";
import { useDisplayPreferences } from "@/hooks/useDisplayPreferences";
import type { AdvancedProductKey } from "@shared/userPreferences/displayMode";

type AdvancedOnlyProps = {
  product: AdvancedProductKey;
  /** Optional fallback to render in Simple mode. Almost always omit — the point is to render nothing. */
  fallback?: ReactNode;
  children: ReactNode;
};

export function AdvancedOnly({ product, fallback = null, children }: AdvancedOnlyProps) {
  const { isAdvanced } = useDisplayPreferences();
  if (!isAdvanced(product)) return <>{fallback}</>;
  return <>{children}</>;
}

export default AdvancedOnly;
