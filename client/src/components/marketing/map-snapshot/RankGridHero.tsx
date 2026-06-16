/**
 * Shared rank-grid HERO — the credibility signal. Promotes the old single
 * average-rank badge into the industry-standard THREE-stat block used by all
 * three rank-grid surfaces (MapSnapshotShell HeatmapView, /tools LocalRankGrid,
 * mapguard RankGridMap):
 *
 *   SoLV  — Share of Local Voice  = % of grid cells ranking Top 3 (Map Pack)
 *   ARP   — Average Rank Position = avg rank where the business APPEARS
 *   ATRP  — Average Total Rank    = avg rank across ALL cells (legacy "avg")
 *
 * These are the same three numbers Local Falcon / BrightLocal headline, so the
 * grid reads as a professional-grade scan rather than a toy. Each stat carries
 * a plain-English one-line caption. Big SoLV is the lead metric; ARP/ATRP sit
 * beside it. A thin High/Med/Low ratio bar + verdict line anchor the block.
 *
 * Color guard: rgb()/rgba() ONLY (this is imported by rgb()-only surfaces).
 * The number hue reuses rankPinColor's gradient via rankPinRgb so the hero and
 * the pins agree on what "good" looks like. Reduced-motion safe (no motion here).
 */
import { rankPinRgb, computeRankGridMetrics } from "./rankGridProjection";

export interface RankGridHeroProps {
  /**
   * Per-cell ranks (1 = best, null = unranked / not in top 20). When provided,
   * SoLV/ARP/ATRP are computed from this directly — the preferred path. Cells
   * that couldn't be checked (provider throttle) should be omitted entirely.
   */
  ranks?: (number | null)[];
  /**
   * Legacy fallback — average map rank, used only when `ranks` is absent
   * (kept so older call sites don't break). null = no ranked cells.
   */
  avg?: number | null;
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
const INK = "rgb(17, 24, 39)";
const SUBTLE = "rgb(100, 116, 139)";

function StatCell({
  value,
  unit,
  label,
  caption,
  accent,
  accentSoft,
  big,
  compact,
}: {
  value: string;
  unit?: string;
  label: string;
  caption: string;
  accent: string;
  accentSoft: string;
  big?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 3,
        padding: compact ? "8px 10px" : "10px 12px",
        borderRadius: 12,
        background: big ? accentSoft : "rgb(248, 250, 252)",
        border: big
          ? `1px solid ${accent.replace("rgb", "rgba").replace(")", ", 0.28)")}`
          : "1px solid rgb(238, 242, 247)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: SUBTLE,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span
          style={{
            fontSize: big ? (compact ? 30 : 38) : compact ? 22 : 28,
            fontWeight: 900,
            lineHeight: 1,
            color: big ? accent : INK,
            letterSpacing: "-0.02em",
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: big ? 16 : 13, fontWeight: 800, color: big ? accent : SUBTLE }}>
            {unit}
          </span>
        )}
      </div>
      <div style={{ fontSize: 10.5, color: SUBTLE, lineHeight: 1.35 }}>{caption}</div>
    </div>
  );
}

export function RankGridHero({
  ranks,
  avg,
  high,
  med,
  low,
  total,
  compact = false,
  className,
}: RankGridHeroProps) {
  // Prefer computing the trio from per-cell ranks. When a caller hasn't wired
  // `ranks` yet, fall back to deriving SoLV from the High bucket + ATRP from the
  // legacy avg, so the hero still renders something honest.
  const metrics = ranks
    ? computeRankGridMetrics(ranks)
    : {
        solv: total > 0 ? Math.round((high / total) * 100) : null,
        arp: avg ?? null,
        atrp: avg ?? null,
        total,
        appeared: high + med + low,
        top3: high,
      };

  // SoLV drives the accent color (green when you own the pack, red when you
  // don't) — it's the headline number. Map 0–100% onto the rank gradient
  // inversely (100% SoLV ≈ rank 1, 0% ≈ deep red).
  const solvRank =
    metrics.solv == null ? null : Math.max(1, Math.round(20 - (metrics.solv / 100) * 19));
  const [r, g, b] = rankPinRgb(solvRank);
  const accent = rgb(r, g, b);
  const accentSoft = `rgba(${r}, ${g}, ${b}, 0.10)`;
  const accentRing = `rgba(${r}, ${g}, ${b}, 0.28)`;

  const verdict =
    metrics.atrp == null || metrics.total === 0
      ? "Not ranking in the top 20 anywhere yet"
      : (metrics.solv ?? 0) > 0
        ? `Top 3 in ${metrics.top3} of ${metrics.total} zones`
        : metrics.appeared > 0
          ? `Appearing in ${metrics.appeared} zones · none in the Local Pack`
          : `Outside the top 20 across all ${metrics.total} zones`;

  const denom = Math.max(high + med + low, 1);
  const seg = [
    { w: (high / denom) * 100, color: rgb(22, 163, 74) },
    { w: (med / denom) * 100, color: rgb(234, 179, 8) },
    { w: (low / denom) * 100, color: rgb(220, 38, 38) },
  ];

  const fmt1 = (n: number | null) => (n == null ? "—" : n.toFixed(1));

  return (
    <div
      data-testid="rankgrid-hero"
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compact ? 8 : 12,
        padding: compact ? "10px 12px" : "14px 16px",
        borderRadius: 16,
        background: "rgb(255, 255, 255)",
        border: `1px solid ${accentRing}`,
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
      }}
    >
      {/* The three industry-standard stats */}
      <div
        style={{
          display: "flex",
          gap: compact ? 6 : 8,
          alignItems: "stretch",
        }}
      >
        <StatCell
          big
          compact={compact}
          accent={accent}
          accentSoft={accentSoft}
          value={metrics.solv == null ? "—" : String(metrics.solv)}
          unit={metrics.solv == null ? undefined : "%"}
          label="SoLV"
          caption="Share of Local Voice — cells where you're Top 3"
        />
        <StatCell
          compact={compact}
          accent={accent}
          accentSoft={accentSoft}
          value={fmt1(metrics.arp)}
          label="ARP"
          caption="Avg rank where you appear"
        />
        <StatCell
          compact={compact}
          accent={accent}
          accentSoft={accentSoft}
          value={fmt1(metrics.atrp)}
          label="ATRP"
          caption="Avg rank across every cell"
        />
      </div>

      {/* Verdict + High/Med/Low ratio bar */}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: compact ? 13 : 14,
            fontWeight: 800,
            color: INK,
            lineHeight: 1.25,
          }}
        >
          {verdict}
        </div>
        <div
          aria-hidden="true"
          style={{
            display: "flex",
            marginTop: 8,
            height: 7,
            borderRadius: 999,
            overflow: "hidden",
            background: "rgb(238, 242, 247)",
          }}
        >
          {seg.map((s, i) =>
            s.w > 0 ? (
              <span key={i} style={{ width: `${s.w}%`, background: s.color }} />
            ) : null,
          )}
        </div>
        <div
          style={{
            display: "flex",
            gap: 14,
            marginTop: 6,
            fontSize: 11,
            color: SUBTLE,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>
            <strong style={{ color: "rgb(22, 163, 74)" }}>{high}</strong> High
          </span>
          <span>
            <strong style={{ color: "rgb(202, 138, 4)" }}>{med}</strong> Med
          </span>
          <span>
            <strong style={{ color: "rgb(220, 38, 38)" }}>{low}</strong> Low
          </span>
        </div>
      </div>
    </div>
  );
}
