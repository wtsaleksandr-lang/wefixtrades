/**
 * CellDrillDown — the Local Falcon "signature" interaction. Clicking a grid
 * cell opens a slide-out side panel (desktop) / bottom-sheet (≤640px) showing
 * the actual ranked list of businesses AT that exact scan point, with OUR
 * business highlighted and the competitors ranked above and below it.
 *
 * Shared, presentation-only, and rgb()/rgba()-ONLY so it imports cleanly into
 * the color-guarded surfaces (LocalRankGrid, RankGridMap) as well as the
 * #hex-exempt MapSnapshotShell. The caller normalises its per-cell data into
 * `CellDrillDownData` and owns open/close state.
 *
 * Accessibility: role="dialog" + aria-modal, Escape closes, body scroll locked
 * while open, the close button is auto-focused, click-on-scrim closes. Motion
 * (slide-in) is gated on prefers-reduced-motion via the inline keyframes.
 */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface DrillDownEntry {
  rank: number;
  name: string;
  rating?: number | null;
  reviewsCount?: number | null;
  /** Marks the visitor's own business so it's highlighted in the list. */
  isYou?: boolean;
}

export interface CellDrillDownData {
  /** 1-based cell label, e.g. "Cell 7" or "Pin (2,3)". */
  cellLabel: string;
  /** Plain-English location line, e.g. "1.2 mi northeast · rank #5". */
  locationLine?: string;
  /** The business's own rank at this cell (null = not in the top 20 here). */
  yourRank: number | null;
  /** The ranked list at this point (already sorted by rank ascending). */
  entries: DrillDownEntry[];
  /** True when this cell's competitor list is mock/sample data, not live. */
  isMock?: boolean;
  /** True when the cell couldn't be checked (provider throttle). */
  isUnavailable?: boolean;
}

const INK = "rgb(17, 24, 39)";
const SUBTLE = "rgb(100, 116, 139)";
const FAINT = "rgb(148, 163, 184)";
const BRAND = "rgb(13, 60, 252)";
const STAR = "rgb(234, 179, 8)";

function rankBadgeColor(rank: number | null): string {
  if (rank == null) return FAINT;
  if (rank <= 3) return "rgb(22, 163, 74)";
  if (rank <= 10) return "rgb(202, 138, 4)";
  return "rgb(220, 38, 38)";
}

export function CellDrillDown({
  data,
  onClose,
}: {
  data: CellDrillDownData | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!data) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Focus the close button so keyboard users land inside the dialog.
    const t = window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [data, onClose]);

  if (!data) return null;

  const youInList = data.entries.some((e) => e.isYou);

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Ranked businesses at ${data.cellLabel}`}
      data-testid="rankgrid-drilldown"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        // Above the marketing nav (9991) and its dropdown layer (9999). Rendered
        // via a portal to document.body so no parent transform/filter stacking
        // context can cap it (the mobile nav was bleeding through otherwise).
        zIndex: 2147483000,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        // Desktop: panel slides in from the right. Mobile: sheet rises from
        // the bottom (handled by the media query in the style tag below).
        justifyContent: "flex-end",
        alignItems: "stretch",
      }}
    >
      <style>{`
        @keyframes rankgrid-dd-slide {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes rankgrid-dd-rise {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .rankgrid-dd-panel {
          animation: rankgrid-dd-slide 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @media (max-width: 640px) {
          .rankgrid-dd-scrim { align-items: flex-end !important; justify-content: stretch !important; }
          .rankgrid-dd-panel {
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            max-height: 82vh !important;
            border-radius: 18px 18px 0 0 !important;
            animation: rankgrid-dd-rise 240ms cubic-bezier(0.22, 1, 0.36, 1) both !important;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .rankgrid-dd-panel { animation: none !important; }
        }
      `}</style>

      <div
        className="rankgrid-dd-scrim"
        style={{ display: "contents" }}
        aria-hidden="true"
      />

      <div
        className="rankgrid-dd-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 360,
          maxWidth: "92vw",
          height: "100%",
          background: "rgb(255, 255, 255)",
          boxShadow: "-12px 0 40px rgba(15, 23, 42, 0.22)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
            padding: "16px 18px 12px",
            borderBottom: "1px solid rgb(241, 245, 249)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: BRAND,
              }}
            >
              {data.cellLabel}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: INK, marginTop: 2 }}>
              {data.isUnavailable
                ? "Not checked here"
                : data.yourRank != null
                  ? `You rank #${data.yourRank} at this point`
                  : "You're not in the top 20 here"}
            </div>
            {data.locationLine && (
              <div style={{ fontSize: 12, color: SUBTLE, marginTop: 3 }}>{data.locationLine}</div>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            data-testid="rankgrid-drilldown-close"
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              borderRadius: 999,
              border: "1px solid rgb(226, 232, 240)",
              background: "rgb(255, 255, 255)",
              color: SUBTLE,
              fontSize: 18,
              lineHeight: 1,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>

        {/* Ranked list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 18px" }}>
          {data.isUnavailable ? (
            <p style={{ fontSize: 13, color: SUBTLE, lineHeight: 1.5, margin: "8px 4px" }}>
              This scan point was rate-limited by the search provider and
              couldn&rsquo;t be checked. Re-run the scan in a minute for full
              coverage.
            </p>
          ) : data.entries.length === 0 ? (
            <p style={{ fontSize: 13, color: SUBTLE, lineHeight: 1.5, margin: "8px 4px" }}>
              No Local Pack businesses captured at this point.
            </p>
          ) : (
            <>
              <div style={{ fontSize: 11, color: SUBTLE, fontWeight: 600, margin: "2px 4px 10px" }}>
                Who ranks here, top to bottom
              </div>
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {data.entries.map((e, i) => (
                  <li
                    key={`${e.rank}-${e.name}-${i}`}
                    data-testid={e.isYou ? "rankgrid-drilldown-you" : undefined}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "9px 10px",
                      borderRadius: 10,
                      background: e.isYou ? "rgba(13, 60, 252, 0.07)" : "rgb(255, 255, 255)",
                      border: e.isYou
                        ? "1.5px solid rgba(13, 60, 252, 0.45)"
                        : "1px solid rgb(238, 242, 247)",
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        background: rankBadgeColor(e.rank),
                        color: "rgb(255, 255, 255)",
                        fontSize: 12,
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {e.rank}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 13,
                          fontWeight: e.isYou ? 800 : 600,
                          color: INK,
                          lineHeight: 1.3,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {e.name}
                        {e.isYou && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 9,
                              fontWeight: 800,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              color: BRAND,
                              background: "rgba(13, 60, 252, 0.12)",
                              padding: "1px 6px",
                              borderRadius: 999,
                              verticalAlign: "middle",
                            }}
                          >
                            You
                          </span>
                        )}
                      </span>
                      {(e.rating != null || e.reviewsCount != null) && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 2, fontSize: 11, color: SUBTLE }}>
                          {e.rating != null && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill={STAR} aria-hidden="true">
                                <path d="M12 2l2.9 6.3L22 9.2l-5 4.9 1.2 7L12 17.8 5.8 21l1.2-7-5-4.9 7.1-.9z" />
                              </svg>
                              <span style={{ fontWeight: 600, color: INK }}>{e.rating.toFixed(1)}</span>
                            </span>
                          )}
                          {e.reviewsCount != null && <span>· {e.reviewsCount.toLocaleString()} reviews</span>}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>

              {/* If our business isn't in the captured list, append an honest
                  "you're below this" anchor so the visitor sees the gap. */}
              {!youInList && data.yourRank != null && (
                <div
                  data-testid="rankgrid-drilldown-you"
                  style={{
                    marginTop: 8,
                    padding: "9px 10px",
                    borderRadius: 10,
                    background: "rgba(13, 60, 252, 0.07)",
                    border: "1.5px solid rgba(13, 60, 252, 0.45)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      background: rankBadgeColor(data.yourRank),
                      color: "rgb(255, 255, 255)",
                      fontSize: 12,
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {data.yourRank}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: INK }}>
                    Your business
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: BRAND,
                        background: "rgba(13, 60, 252, 0.12)",
                        padding: "1px 6px",
                        borderRadius: 999,
                        verticalAlign: "middle",
                      }}
                    >
                      You
                    </span>
                  </span>
                </div>
              )}

              {data.isMock && (
                <div style={{ marginTop: 12, fontSize: 11, color: FAINT, lineHeight: 1.45, fontStyle: "italic" }}>
                  Sample competitor data shown for illustration — run a live scan
                  for the real Local Pack at this point.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(overlay, document.body)
    : overlay;
}
