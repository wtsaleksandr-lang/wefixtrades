/**
 * Wave 36 — Tesla Simplification.
 * Wave 36.5 — per-element granular toggles.
 *
 * Hook for the Display Mode (Simple / Advanced) preferences. Reads from
 * `GET /api/portal/settings/display`, exposes a mutation against
 * `PATCH /api/portal/settings/display`, and provides the resolution
 * predicates used by the `<AdvancedOnly>` wrapper across every dashboard.
 *
 * Behaviour
 * ─────────
 *   • Wave 43 — Advanced is now the default. While loading or on error,
 *     every advanced section is treated as VISIBLE (returns true). The
 *     prior Tesla rule ("Simple by default") buried every KPI/chart/inbox
 *     and the user could not see tonight's UI work without flipping a
 *     toggle. The new floor is Advanced; Simple is opt-in.
 *   • The hook is cheap to mount in many components — TanStack Query
 *     dedupes the request under a single queryKey.
 *
 * Predicates
 * ──────────
 *   • `isVisible(product, elementId?)` — full resolver (element override
 *     wins, then product/mode). Use this from new code.
 *   • `isAdvanced(product)` — legacy product/mode-only check, retained for
 *     backwards compatibility with callers that don't have an element id.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_DISPLAY_PREFERENCES,
  type AdvancedProductKey,
  type DisplayPreferences,
  type DisplayPreferencesPatch,
  isAdvancedVisible,
  isElementVisible,
} from "@shared/userPreferences/displayMode";
import type { DisplayElementId } from "@shared/userPreferences/elementRegistry";
import { apiRequest } from "@/lib/queryClient";

const QUERY_KEY = ["/api/portal/settings/display"] as const;

type DisplayResponse = {
  preferences: DisplayPreferences;
  defaults: DisplayPreferences;
};

export function useDisplayPreferences() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<DisplayResponse>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/portal/settings/display", { credentials: "include" });
      if (!res.ok) {
        // 401 / 403 / network — fall back to defaults so the dashboard
        // renders in Simple mode rather than erroring out.
        return { preferences: DEFAULT_DISPLAY_PREFERENCES, defaults: DEFAULT_DISPLAY_PREFERENCES };
      }
      return res.json();
    },
    staleTime: 60_000,
  });

  const prefs: DisplayPreferences = data?.preferences ?? DEFAULT_DISPLAY_PREFERENCES;

  const mutation = useMutation({
    mutationFn: async (patch: DisplayPreferencesPatch) => {
      const res = await apiRequest("PATCH", "/api/portal/settings/display", patch);
      return res.json() as Promise<{ preferences: DisplayPreferences }>;
    },
    onSuccess: (next) => {
      queryClient.setQueryData<DisplayResponse>(QUERY_KEY, (prev) => ({
        preferences: next.preferences,
        defaults: prev?.defaults ?? DEFAULT_DISPLAY_PREFERENCES,
      }));
    },
  });

  /**
   * Predicate used by the `<AdvancedOnly>` wrapper (legacy form). Both the
   * global mode AND the product-specific toggle must be true. Wave 43:
   * returns TRUE while loading / on error — Advanced-by-default is the
   * new floor so dashboards never render half-empty during a slow prefs
   * fetch or 401 fallback.
   */
  function isAdvanced(productKey: AdvancedProductKey): boolean {
    if (isLoading || error) return true;
    return isAdvancedVisible(prefs, productKey);
  }

  /**
   * Wave 36.5 — full resolver. Per-element override wins; otherwise falls
   * back to the product/mode check. Wave 43: returns TRUE while loading
   * (Advanced-by-default floor).
   */
  function isVisible(
    productKey: AdvancedProductKey,
    elementId?: DisplayElementId,
  ): boolean {
    if (isLoading || error) return true;
    return isElementVisible(prefs, productKey, elementId);
  }

  return {
    preferences: prefs,
    isLoading,
    isAdvancedMode: prefs.mode === "advanced",
    isAdvanced,
    isVisible,
    updatePreferences: mutation.mutate,
    updateAsync: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
