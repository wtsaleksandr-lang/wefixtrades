import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

/**
 * Account-level paid signal for portal feature gates.
 *
 * Reuses the QuoteQuick quota endpoint — GET /api/portal/quotequick/usage —
 * which already resolves the account's plan tier across every calculator it
 * owns via `isPaidTier()` (shared/quotequickQuota.ts) and returns
 * `{ tier: "free" | "paid", ... }`. That makes it the single account-scoped
 * "is this account paid" source the QuotaMeter already trusts, so the
 * free-tools gate agrees with the quote-quota meter on the same numbers.
 *
 * Admins with the per-session "Preview as Pro" override (adminProPreview)
 * are treated as paid so internal review sees the unlocked experience.
 *
 * FAIL-SAFE: if the tier can't be determined (loading, network error, or a
 * malformed response) `isPaid` is `false` — i.e. the caller LOCKS the paid
 * feature rather than giving it away. `isLoading` lets callers show a spinner
 * instead of a flash of the locked state while the first fetch resolves.
 */

interface QuotaUsageResponse {
  tier?: "free" | "paid";
  limit?: number | null;
}

export interface UseIsPaidResult {
  /** True only when the account is confirmed paid. Defaults to false. */
  isPaid: boolean;
  /** True while the tier is still resolving (first fetch in flight). */
  isLoading: boolean;
}

export function useIsPaid(): UseIsPaidResult {
  const { adminProPreview } = useAuth();

  const { data, isLoading, isError } = useQuery<QuotaUsageResponse>({
    queryKey: ["/api/portal/quotequick/usage"],
    queryFn: async () => {
      const res = await fetch("/api/portal/quotequick/usage", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load account tier");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Admin Preview-as-Pro override unlocks regardless of the account tier.
  if (adminProPreview) {
    return { isPaid: true, isLoading: false };
  }

  // Fail-safe: any error → locked (not loading, so the gate renders the upsell
  // rather than spinning forever).
  if (isError) {
    return { isPaid: false, isLoading: false };
  }

  if (isLoading || !data) {
    return { isPaid: false, isLoading };
  }

  const isPaid = data.tier === "paid" || data.limit === null;
  return { isPaid, isLoading: false };
}
