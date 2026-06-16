/**
 * Shared average-rank HERO stat — promotes the old small corner badge into a
 * premium hero block used by all three rank-grid surfaces (MapSnapshotShell
 * HeatmapView, /tools LocalRankGrid, mapguard RankGridMap). Big color-coded
 * average number + a one-line verdict + a thin High/Med/Low ratio bar.
 *
 * Color guard: rgb()/rgba() ONLY (this is imported by rgb()-only surfaces).
 * The number hue reuses rankPinColor's gradient via rankPinRgb so the hero and
 * the pins agree on what "good" looks like.
 */
import { rankPinRgb } from "./rankGridProjection";

export interface RankGridHeroProps {
  /** Average map rank (1 = best). null = no ranked cells. */
  avg: number | null;
  /** Cells ranking in the Local Pack (1–3). */
  high: number;
  /** Cells ranking 4–10. */
  med: number;
  /** Cells ranking 11+ / not in top 20. */
  low: number;
  /** Total cells (for the verdict denominator). */
  total: number;
  /** Optional compact variant (tighter padding for small embeds). */
  compact?: boolean;
  className?: string;
}

const rgb = (r: number, g: number, b: number) => `rgb(${r}, ${g}, ${b})`;

export function RankGridHero({
  avg,
  high,
  med,
  low,
  total,
  compact = false,
  className,
}: RankGridHeroProps) {
  const [r, g, b] = rankPinRgb(avg == null ? null : Math.round(avg));
  const accent = rgb(r, g, b);
  const accentSoft = `rgba(${r}, ${g}, ${b}, 0.10)`;
  const accentRing = `rgba(${r}, ${g}, ${b}, 0.28)`;

  const verdict =
    avg == null
      ? "Not ranking in the top 20 anywhere yet"
      : high > 0
        ? `Top 3 in ${high} of ${total} zones`
        : med > 0
          ? `Best zones rank 4–10 · none in the Local Pack`
          : `Outside the top 10 across all ${total} zones`;

  const denom = Math.max(high + med + low, 1);
  const seg = [
    { w: (high / denom) * 100, color: rgb(22, 163, 74) },
    { w: (med / denom) * 100, color: rgb(234, 179, 8) },
    { w: (low / denom) * 100, color: rgb(220, 38, 38) },
  ];

  return (
    <div
      data-testid="rankgrid-hero"
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: compact ? 12 : 16,
        padding: compact ? "10px 14px" : "14px 18px",
        borderRadius: 16,
        background: "rgb(255,255,255)",
        border: `1px solid ${accentRing}`,
        boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
      }}
    >
      {/* Big average number in an accent chip */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minWidth: compact ? 64 : 76,
          padding: compact ? "6px 10px" : "8px 14px",
          borderRadius: 14,
          background: accentSoft,
        }}
      >
        <div
          data-testid="rankgrid-hero-avg"
          style={{
            fontSize: compact ? 40 : 56,
            fontWeight: 900,
            lineHeight: 1,
            color: accent,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
          }}
        >
          {avg != null ? avg.toFixed(1) : "—"}
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "rgb(100,116,139)",
          }}
        >
          Avg Rank
        </div>
      </div>

      {/* Verdict + ratio bar */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: compact ? 14 : 16,
            fontWeight: 800,
            color: "rgb(17,24,39)",
            lineHeight: 1.25,
          }}
        >
          {verdict}
        </div>
        <div
          aria-hidden="true"
          style={{
            display: "flex",
            marginTop: 10,
            height: 7,
            borderRadius: 999,
            overflow: "hidden",
            background: "rgb(238,242,247)",
          }}
        >
          {seg.map((s, i) =>
            s.w > 0 ? (
              <span
                key={i}
                style={{
                  width: `${s.w}%`,
                  background: s.color,
                }}
              />
            ) : null,
          )}
        </div>
        <div
          style={{
            display: "flex",
            gap: 14,
            marginTop: 7,
            fontSize: 11,
            color: "rgb(100,116,139)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>
            <strong style={{ color: "rgb(22,163,74)" }}>{high}</strong> High
          </span>
          <span>
            <strong style={{ color: "rgb(202,138,4)" }}>{med}</strong> Med
          </span>
          <span>
            <strong style={{ color: "rgb(220,38,38)" }}>{low}</strong> Low
          </span>
        </div>
      </div>
    </div>
  );
}
