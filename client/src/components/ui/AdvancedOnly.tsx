/**
 * Wave 36 — Tesla Simplification.
 * Wave 36.5 — per-element granular toggles.
 *
 * Wrapper that hides its children unless the user has unlocked them.
 *
 * Resolution order (handled in `useDisplayPreferences().isVisible`):
 *   1. If `elementId` is set AND the user has an explicit boolean override
 *      for it → that wins.
 *   2. Else fall back to the product/mode check: Advanced mode ON AND
 *      `<product>_show_advanced` toggle ON.
 *
 * Usage
 * ─────
 *   // Product-level (backwards compatible — existing call sites unchanged).
 *   <AdvancedOnly product="contentflow">
 *     <SecondaryAnalyticsCard />
 *   </AdvancedOnly>
 *
 *   // Element-level — user can opt-in to just this element from
 *   // Settings → Display, without flipping the whole product to Advanced.
 *   <AdvancedOnly product="contentflow" elementId="contentflow.ai-detection-tile">
 *     <AIDetectionTile />
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
import type { DisplayElementId } from "@shared/userPreferences/elementRegistry";

type AdvancedOnlyProps = {
  product: AdvancedProductKey;
  /**
   * Optional stable element id registered in `shared/userPreferences/elementRegistry.ts`.
   * When set, the user can opt-in to just this element from Settings → Display
   * (overriding the product/mode logic both ways).
   */
  elementId?: DisplayElementId;
  /** Optional fallback to render in Simple mode. Almost always omit — the point is to render nothing. */
  fallback?: ReactNode;
  children: ReactNode;
};

export function AdvancedOnly({ product, elementId, fallback = null, children }: AdvancedOnlyProps) {
  const { isVisible } = useDisplayPreferences();
  if (!isVisible(product, elementId)) return <>{fallback}</>;
  return <>{children}</>;
}

export default AdvancedOnly;
