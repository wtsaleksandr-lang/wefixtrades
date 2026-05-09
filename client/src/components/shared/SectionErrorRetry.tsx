/**
 * Inline error fallback for a sub-section of a page that has its own
 * data query. Used when a sub-query fails but the parent page still
 * loaded fine — instead of letting the section render blank or broken,
 * we show a compact retry card.
 *
 * Pairs with TanStack Query's `isError` + `refetch`:
 *
 *   const { data, isError, refetch } = useQuery({ ... });
 *
 *   {isError && <SectionErrorRetry title="TradeLine status" onRetry={refetch} />}
 *   {!isError && data && <RealContent ... />}
 */

import { AlertTriangle, RefreshCw } from "lucide-react";

export function SectionErrorRetry({
  title,
  message,
  onRetry,
  variant = "portal",
}: {
  /** What this section is — surfaced in the message (e.g. "TradeLine status"). */
  title: string;
  /** Optional override of the default body copy. */
  message?: string;
  /** Refetch fn from the failing query. */
  onRetry?: () => void;
  /**
   * Tonal variant. `portal` (default) is the cool-grey card surface used
   * across the customer portal; `admin` is the white card used in
   * the operator dashboard. They look almost identical — just ensures
   * the border-radius / padding match each surface's house style.
   */
  variant?: "portal" | "admin";
}) {
  const isAdmin = variant === "admin";
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        padding: isAdmin ? "16px 20px" : "16px 18px",
        borderRadius: isAdmin ? 12 : 14,
        background: isAdmin ? "#FEF7F0" : "rgba(248, 113, 113, 0.06)",
        border: isAdmin ? "1px solid #F5DDC3" : "1px solid rgba(248, 113, 113, 0.30)",
      }}
    >
      <AlertTriangle
        size={18}
        strokeWidth={1.8}
        style={{ color: isAdmin ? "#B45309" : "#DC2626", flexShrink: 0, marginTop: 2 }}
        aria-hidden
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 600,
            color: isAdmin ? "#7C2D12" : "#991B1B",
          }}
        >
          Couldn't load {title.toLowerCase()}
        </p>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12,
            lineHeight: 1.5,
            color: isAdmin ? "#9A3412" : "#7F1D1D",
          }}
        >
          {message ??
            "The rest of the page loaded, but this section couldn't fetch its data. It's probably a transient network blip — try the retry."}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              marginTop: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 8,
              border: isAdmin ? "1px solid #D97706" : "1px solid rgba(220, 38, 38, 0.55)",
              background: "transparent",
              color: isAdmin ? "#B45309" : "#DC2626",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 180ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = isAdmin
                ? "rgba(217, 119, 6, 0.08)"
                : "rgba(220, 38, 38, 0.06)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            <RefreshCw size={12} strokeWidth={2.2} />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
