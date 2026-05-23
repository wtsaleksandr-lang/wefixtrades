/**
 * Wave BF-6 — MapSnapshot shell component.
 *
 * Renders the three states of the free GBP rank-grid + audit tool:
 *   intake  → name + keywords + map confirm
 *   loading → CTA-pulse spinner while the server resolves the place + grid
 *   results → 5x5 SVG heatmap + 10-card audit scorecard + CTAs to MapGuard
 *
 * Designed to be embedded inside MapSnapshot (main page) and
 * MapSnapshotByTrade (per-trade SEO landings). The shared component owns all
 * state so the SEO pages stay shallow.
 *
 * No new dependencies — pure SVG over Google Static Maps URLs (string only,
 * no API call) so we don't pull in leaflet/mapbox.
 *
 * CONTRAST-2 — this whole component is light-theme locked (white card on
 * marketing background). Each top-level JSX root carries data-theme="light"
 * so the lint exempts the intentional #fff / #000 / white literals inside.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, MapPin, Compass } from "lucide-react";
import RankGridHelpModal from "@/components/marketing/RankGridHelpModal";

const BRAND_PRIMARY = "#0d3cfc";
const BRAND_INK = "#1E1E1E";

/* ─── Rank-tier color system (calm, muted — not neon) ───
 * Each tier maps a rank range to a soft background, dark-enough text for
 * AA contrast on that background, and a ring color for hover. Kept here as
 * a single source of truth so the legend, cells, and insight callouts agree.
 */
type RankTier = {
  key: "top3" | "top10" | "top20" | "beyond";
  label: string;
  blurb: string;
  bg: string;
  text: string;
  ring: string;
  dot: string;
};
const RANK_TIERS: RankTier[] = [
  {
    key: "top3",
    label: "Top 3",
    blurb: "Nearly every searcher sees you",
    bg: "#ecfdf5",
    text: "#047857",
    ring: "#10b981",
    dot: "#10b981",
  },
  {
    key: "top10",
    label: "Top 10",
    blurb: "Most searchers see you",
    bg: "#eff6ff",
    text: "#1d4ed8",
    ring: "#3b82f6",
    dot: "#3b82f6",
  },
  {
    key: "top20",
    label: "Top 20",
    blurb: "Some searchers see you",
    bg: "#fffbeb",
    text: "#b45309",
    ring: "#f59e0b",
    dot: "#f59e0b",
  },
  {
    key: "beyond",
    label: "Beyond 20",
    blurb: "Those searchers go to competitors",
    bg: "#fef2f2",
    text: "#b91c1c",
    ring: "#ef4444",
    dot: "#ef4444",
  },
];
const tierForRank = (r: number): RankTier => {
  if (r <= 3) return RANK_TIERS[0];
  if (r <= 10) return RANK_TIERS[1];
  if (r <= 20) return RANK_TIERS[2];
  return RANK_TIERS[3];
};

export type HeatmapCell = {
  row: number;
  col: number;
  lat: number;
  lng: number;
  keyword: string;
  rank: number;
  distanceKm: number;
};

export type AuditCard = {
  id: string;
  label: string;
  status: "good" | "warn" | "fail";
  score: number;
  details: string;
  ctaCardName?: string;
};

export type SnapshotResult = {
  slug: string;
  businessName: string;
  address?: string;
  lat: number;
  lng: number;
  keywords: string[];
  heatmap: HeatmapCell[];
  audit: AuditCard[];
  source: "real" | "mock";
};

/* ─── Tokens helper ─── */
const sticky = {
  position: "sticky" as const,
  top: 0,
  zIndex: 10,
  background: "#fff",
};

/* ─── Floating label input (reused QQ pattern) ─── */
function FloatingLabelInput({
  id,
  label,
  value,
  onChange,
  required,
  type = "text",
  ariaDescribedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  ariaDescribedBy?: string;
}) {
  return (
    <div data-theme="light" style={{ position: "relative" }}>
      <input
        id={id}
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder=" "
        aria-label={label}
        aria-describedby={ariaDescribedBy}
        className="peer w-full px-3 pt-5 pb-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors"
      />
      <label
        htmlFor={id}
        className={
          "absolute left-3 pointer-events-none transition-all duration-150 " +
          "top-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 " +
          "peer-placeholder-shown:top-2.5 peer-placeholder-shown:text-sm " +
          "peer-placeholder-shown:font-normal peer-placeholder-shown:normal-case " +
          "peer-placeholder-shown:tracking-normal peer-placeholder-shown:text-gray-400 " +
          "peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-semibold " +
          "peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-brand-blue"
        }
      >
        {label}
        {required && <span className="text-red-400 ml-1 normal-case">*</span>}
      </label>
    </div>
  );
}

/* ─── Keyword chip picker ─── */
const DEFAULT_KEYWORD_SUGGESTIONS = [
  "near me",
  "emergency",
  "best",
  "24 hour",
  "affordable",
  "in [city]",
];

function KeywordChips({
  base,
  keywords,
  onChange,
}: {
  base: string;
  keywords: string[];
  onChange: (k: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const v = raw.trim().slice(0, 60);
    if (!v || keywords.includes(v) || keywords.length >= 5) return;
    onChange([...keywords, v]);
    setDraft("");
  };
  const remove = (k: string) => onChange(keywords.filter((x) => x !== k));

  const suggestions = useMemo(() => {
    const trade = (base || "service").toLowerCase().trim();
    return DEFAULT_KEYWORD_SUGGESTIONS.map((s) =>
      s.includes("[") ? s : `${trade} ${s}`,
    ).filter((s) => !keywords.includes(s));
  }, [base, keywords]);

  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#6b7280",
          marginBottom: 6,
        }}
      >
        Keywords to rank for (up to 5)
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {keywords.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => remove(k)}
            style={{
              border: `1px solid ${BRAND_PRIMARY}`,
              background: `${BRAND_PRIMARY}10`,
              color: BRAND_PRIMARY,
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
            aria-label={`Remove keyword ${k}`}
          >
            {k} ×
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder="e.g. emergency plumber"
          aria-label="Add keyword"
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
          style={{ flex: 1 }}
        />
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={!draft.trim() || keywords.length >= 5}
          style={{
            background: BRAND_PRIMARY,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "0 14px",
            fontSize: 13,
            fontWeight: 600,
            cursor: keywords.length >= 5 ? "not-allowed" : "pointer",
            opacity: keywords.length >= 5 ? 0.5 : 1,
          }}
        >
          Add
        </button>
      </div>
      {keywords.length < 3 && suggestions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {suggestions.slice(0, 4).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              style={{
                border: "1px solid #e5e7eb",
                background: "#fff",
                color: "#374151",
                padding: "3px 9px",
                borderRadius: 999,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Loading spinner (BD-3l CTA-pulse style) ─── */
function LoadingPulse({ keyword }: { keyword?: string }) {
  const [stepIdx, setStepIdx] = useState(0);
  const steps = useMemo(
    () => [
      "Finding your business on Google",
      "Sampling 25 grid points around you",
      `Checking rank for "${keyword || "your service"}"`,
      "Auditing your Google Business Profile",
      "Compiling your scorecard",
    ],
    [keyword],
  );

  useEffect(() => {
    const motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!motionOK) return;
    const t = setInterval(() => {
      setStepIdx((i) => (i + 1) % steps.length);
    }, 2400);
    return () => clearInterval(t);
  }, [steps.length]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: "48px 24px",
        textAlign: "center",
        minHeight: 280,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 64,
          height: 64,
          margin: "0 auto 24px",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${BRAND_PRIMARY}30 0%, transparent 70%)`,
          animation: "mapsnap-pulse 1.6s ease-in-out infinite",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 16,
            borderRadius: "50%",
            background: BRAND_PRIMARY,
            opacity: 0.85,
          }}
        />
      </div>
      <div style={{ fontSize: 14, color: "#374151", fontWeight: 500 }}>
        {steps[stepIdx]}…
      </div>
      <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>
        This takes about 10–25 seconds
      </div>
      <style>{`
        @keyframes mapsnap-pulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.15); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [role="status"] > div[aria-hidden="true"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

/* ─── Premium rank-grid view ───
 * Effortel-style polish: generous whitespace, soft rounded corners on the
 * card AND on every cell, calm tier colors, cascade reveal animation
 * (motion-safe), hover ring, center MapPin marker, compass axis hints,
 * legend with tier blurbs, and best/worst/average insight callouts.
 *
 * Light-theme locked — the whole subtree sits under data-theme="light"
 * (carried by the outermost wrapper in MapSnapshotShell). All raw color
 * literals here are intentional palette tokens, not theme bypasses.
 */
function HeatmapView({ result, trade }: { result: SnapshotResult; trade?: string }) {
  const cells = result.heatmap;
  const grid = 5;
  // Compute summary stats once. Distances are already in km from the API;
  // we present miles for North-American visitors (the audit copy is US-/EU-
  // friendly but mph + ZIPs read more familiar than km outside Europe).
  const kmToMi = (km: number) => km * 0.621371;
  const stats = useMemo(() => {
    const total = cells.length;
    let top3 = 0;
    let top10 = 0; // top-10 inclusive of top-3
    let top20 = 0; // top-20 inclusive of top-10
    let best = cells[0];
    let worst = cells[0];
    let rankSum = 0;
    for (const c of cells) {
      if (c.rank <= 3) top3++;
      if (c.rank <= 10) top10++;
      if (c.rank <= 20) top20++;
      if (!best || c.rank < best.rank) best = c;
      if (!worst || c.rank > worst.rank) worst = c;
      rankSum += Math.min(c.rank, 21);
    }
    const beyond = total - top20;
    const avg = total > 0 ? rankSum / total : 0;
    // Top-3 strict, then top-10 minus top-3, etc. for "exactly in this tier".
    const exTop3 = top3;
    const exTop10 = top10 - top3;
    const exTop20 = top20 - top10;
    const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
    return {
      total,
      avg,
      best,
      worst,
      tiers: {
        top3: { count: exTop3, pct: pct(exTop3) },
        top10: { count: exTop10, pct: pct(exTop10) },
        top20: { count: exTop20, pct: pct(exTop20) },
        beyond: { count: beyond, pct: pct(beyond) },
      },
    };
  }, [cells]);

  const directionFromCenter = (row: number, col: number): string => {
    // 5×5 grid → center is (2, 2). Map row/col delta to a compass direction.
    const dr = row - 2;
    const dc = col - 2;
    if (dr === 0 && dc === 0) return "right at your address";
    const ns = dr < 0 ? "north" : dr > 0 ? "south" : "";
    const ew = dc < 0 ? "west" : dc > 0 ? "east" : "";
    return `${ns}${ew}`.trim() || "nearby";
  };

  const describeCell = (c: HeatmapCell): string => {
    const miles = kmToMi(c.distanceKm);
    const dir = directionFromCenter(c.row, c.col);
    const milesLabel = miles < 0.15 ? "right here" : `${miles.toFixed(1)} mi ${dir}`;
    return `Rank #${c.rank >= 21 ? "20+" : c.rank} · ${milesLabel}`;
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Plain-English summary */}
      <div
        role="region"
        aria-label="Rank grid summary"
        style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 14,
          padding: "14px 16px",
          display: "grid",
          gap: 4,
        }}
      >
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Average rank in your area
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: BRAND_INK, lineHeight: 1 }}>
            {stats.avg ? stats.avg.toFixed(1) : "—"}
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            across <strong style={{ color: BRAND_INK }}>{stats.total}</strong> sampled spots
          </div>
        </div>
        <p style={{ fontSize: 13, color: "#475569", margin: "6px 0 0", lineHeight: 1.55 }}>
          Out of {stats.total} spots around your service area, you're top-3 in{" "}
          <strong style={{ color: RANK_TIERS[0].text }}>{stats.tiers.top3.count}</strong> ({stats.tiers.top3.pct}%),
          top-10 in <strong style={{ color: RANK_TIERS[1].text }}>{stats.tiers.top10.count + stats.tiers.top3.count}</strong>{" "}
          ({stats.tiers.top10.pct + stats.tiers.top3.pct}%), and not ranking
          in <strong style={{ color: RANK_TIERS[3].text }}>{stats.tiers.beyond.count}</strong>{" "}
          ({stats.tiers.beyond.pct}%). That last group represents customers your competitors are reaching but you're not.
        </p>
      </div>

      {/* Grid card with compass axes */}
      <div
        style={{
          position: "relative",
          background: "#fff",
          border: "1px solid #eef2f7",
          borderRadius: 20,
          padding: "28px 24px 24px",
          boxShadow:
            "0 1px 2px rgba(13,60,252,0.04), 0 8px 24px rgba(15,23,42,0.06)",
        }}
        aria-label={`Rank grid for ${result.businessName}${trade ? ` (${trade})` : ""}`}
      >
        {/* North label */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 8,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "#94a3b8",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Compass size={12} aria-hidden="true" /> N
        </div>
        {/* South */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: 8,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "#94a3b8",
          }}
        >
          S
        </div>
        {/* West */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "50%",
            left: 8,
            transform: "translateY(-50%)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "#94a3b8",
          }}
        >
          W
        </div>
        {/* East */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "50%",
            right: 8,
            transform: "translateY(-50%)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "#94a3b8",
          }}
        >
          E
        </div>

        <div
          role="grid"
          aria-label="Rank cells"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${grid}, minmax(0, 1fr))`,
            gap: 8,
            maxWidth: 380,
            margin: "0 auto",
          }}
        >
          {cells.map((c) => {
            const tier = tierForRank(c.rank);
            const label = c.rank >= 21 ? "20+" : String(c.rank);
            const isCenter = c.row === 2 && c.col === 2;
            // Cascade index: top-left → bottom-right. Cap delay so a full
            // 25-cell sweep finishes inside 750ms even at 30ms/cell.
            const cascadeIdx = c.row * grid + c.col;
            const delayMs = Math.min(cascadeIdx * 30, 720);
            return (
              <div
                key={`${c.row}-${c.col}`}
                role="gridcell"
                aria-label={describeCell(c)}
                title={describeCell(c)}
                data-testid={`rank-cell-${c.row}-${c.col}`}
                className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 duration-300"
                style={{
                  position: "relative",
                  aspectRatio: "1 / 1",
                  borderRadius: 12,
                  background: tier.bg,
                  border: `1px solid ${tier.ring}33`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  cursor: "default",
                  transition:
                    "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
                  animationDelay: `${delayMs}ms`,
                  animationFillMode: "both",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.03)";
                  e.currentTarget.style.boxShadow = `0 0 0 2px ${tier.ring}55, 0 6px 14px rgba(15,23,42,0.08)`;
                  e.currentTarget.style.borderColor = `${tier.ring}99`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.borderColor = `${tier.ring}33`;
                }}
              >
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: tier.text,
                    lineHeight: 1,
                  }}
                >
                  {label}
                </span>
                {isCenter ? (
                  <span
                    aria-label="Your address"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 2,
                      fontSize: 10,
                      fontWeight: 600,
                      color: BRAND_PRIMARY,
                    }}
                  >
                    <MapPin size={12} aria-hidden="true" /> you
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: 10,
                      color: "#94a3b8",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {kmToMi(c.distanceKm).toFixed(1)} mi
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div
        role="region"
        aria-label="Rank tier legend"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 8,
        }}
      >
        {RANK_TIERS.map((t) => (
          <div
            key={t.key}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "10px 12px",
              background: t.bg,
              borderRadius: 12,
              border: `1px solid ${t.ring}33`,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: t.dot,
                marginTop: 4,
                flexShrink: 0,
              }}
            />
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{t.label}</span>
              <span style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>{t.blurb}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Insight callouts: best, worst, opportunity */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        {stats.best && (
          <div
            style={{
              padding: "12px 14px",
              border: "1px solid #d1fae5",
              background: "#ecfdf5",
              borderRadius: 12,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#047857" }}>
              Best cell
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: BRAND_INK, marginTop: 4 }}>
              Rank #{stats.best.rank}
            </div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
              {kmToMi(stats.best.distanceKm).toFixed(1)} mi{" "}
              {directionFromCenter(stats.best.row, stats.best.col)}
            </div>
          </div>
        )}
        {stats.worst && (
          <div
            style={{
              padding: "12px 14px",
              border: "1px solid #fee2e2",
              background: "#fef2f2",
              borderRadius: 12,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#b91c1c" }}>
              Biggest opportunity
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: BRAND_INK, marginTop: 4 }}>
              Rank #{stats.worst.rank >= 21 ? "20+" : stats.worst.rank}
            </div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
              {kmToMi(stats.worst.distanceKm).toFixed(1)} mi{" "}
              {directionFromCenter(stats.worst.row, stats.worst.col)}
            </div>
          </div>
        )}
        <div
          style={{
            padding: "12px 14px",
            border: "1px solid #e0e7ff",
            background: "#eef2ff",
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND_PRIMARY }}>
            Quick win
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: BRAND_INK, marginTop: 4, lineHeight: 1.4 }}>
            Earn reviews from customers near the red cells
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
            Each local review nudges those areas up.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Audit scorecard ─── */
function AuditScorecard({ audit, slug }: { audit: AuditCard[]; slug?: string }) {
  return (
    <div
      role="region"
      aria-label="Audit scorecard"
      style={{ display: "grid", gap: 10, marginTop: 20 }}
    >
      {audit.map((card) => {
        const color =
          card.status === "good" ? "#16a34a" : card.status === "warn" ? "#f59e0b" : "#dc2626";
        const bg =
          card.status === "good" ? "#f0fdf4" : card.status === "warn" ? "#fffbeb" : "#fef2f2";
        const showFix = card.status !== "good";
        const ctaName = card.ctaCardName || card.id;
        return (
          <div
            key={card.id}
            style={{
              border: "1px solid #e5e7eb",
              borderLeft: `4px solid ${color}`,
              borderRadius: 10,
              padding: "12px 14px",
              background: bg,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: BRAND_INK }}>
                {card.label}
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color,
                  whiteSpace: "nowrap",
                }}
              >
                {card.score}/100
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#4b5563", marginTop: 4, lineHeight: 1.45 }}>
              {card.details}
            </div>
            {showFix && (
              <a
                href={`/products/mapguard?utm_source=map-snapshot&utm_medium=audit-card&utm_campaign=${ctaName}${slug ? `&utm_content=${slug}` : ""}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  color: BRAND_PRIMARY,
                  marginTop: 8,
                  textDecoration: "none",
                }}
              >
                Fix with MapGuard <ExternalLink size={12} />
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main shell ─── */
export function MapSnapshotShell({
  trade,
  initialBusinessName,
  initialResult,
  readOnly,
  autoSubmit,
}: {
  trade?: string;
  initialBusinessName?: string;
  initialResult?: SnapshotResult;
  readOnly?: boolean;
  /**
   * When the shell is mounted inside the Free Audit "Rank Grid" tab the
   * business has already been resolved upstream — auto-run the snapshot
   * on first paint instead of forcing the visitor to re-type the name.
   * Only fires once per mount and only when initialBusinessName is set.
   */
  autoSubmit?: boolean;
}) {
  const [state, setState] = useState<"intake" | "loading" | "results">(
    initialResult ? "results" : "intake",
  );
  const [businessName, setBusinessName] = useState(initialBusinessName || "");
  const [keywords, setKeywords] = useState<string[]>(
    trade ? [`${trade} near me`] : [],
  );
  const [result, setResult] = useState<SnapshotResult | null>(initialResult || null);
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const autoSubmitFired = useRef(false);

  useEffect(() => {
    if (state === "results" && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [state]);

  const submit = async () => {
    setError(null);
    if (!businessName.trim()) {
      setError("Enter your business name to start.");
      return;
    }
    if (keywords.length === 0) {
      setError("Add at least one keyword you want to rank for.");
      return;
    }
    setState("loading");
    try {
      const res = await fetch("/api/tools/map-snapshot/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName: businessName.trim(), keywords }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status})`);
      }
      const data: SnapshotResult = await res.json();
      setResult(data);
      setState("results");
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
      setState("intake");
    }
  };

  // Auto-run when invoked from the Free Audit "Rank Grid" tab — the
  // upstream form has already resolved the business + city so we shouldn't
  // make the visitor re-type. Fires exactly once per mount.
  useEffect(() => {
    if (
      autoSubmit &&
      !autoSubmitFired.current &&
      initialBusinessName &&
      keywords.length > 0 &&
      state === "intake"
    ) {
      autoSubmitFired.current = true;
      submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmit, initialBusinessName, keywords.length]);

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        background: "#fff",
        borderRadius: 16,
        overflow: "clip",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        border: "1px solid #e5e7eb",
      }}
    >
      {/* Sticky header trust strip */}
      <div
        style={{
          ...sticky,
          padding: "12px 20px",
          borderBottom: "1px solid #f1f5f9",
          background: "#fff",
          fontSize: 12,
          color: "#6b7280",
          textAlign: "center",
        }}
      >
        Used by 2,400+ trade businesses to fix their Google Maps ranking
      </div>

      <div style={{ padding: "24px 20px 100px" }}>
        {state === "intake" && (
          <div role="region" aria-label="Audit intake">
            <h2
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: BRAND_INK,
                marginBottom: 6,
                marginTop: 0,
              }}
            >
              Get your free Google Maps rank snapshot
            </h2>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20, marginTop: 0 }}>
              See exactly where you rank across a 5×5 grid around your business — and what's
              dragging you down.
            </p>

            <div style={{ display: "grid", gap: 2, marginBottom: 14 }}>
              <FloatingLabelInput
                id="map-snap-business"
                label="Business name"
                value={businessName}
                onChange={setBusinessName}
                required
              />
            </div>

            <KeywordChips base={trade || ""} keywords={keywords} onChange={setKeywords} />

            {error && (
              <div
                role="alert"
                style={{
                  marginTop: 14,
                  padding: "8px 12px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  color: "#991b1b",
                  fontSize: 12,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              style={{
                marginTop: 18,
                width: "100%",
                background: BRAND_PRIMARY,
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "14px",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Run my free snapshot
            </button>

            <div
              style={{
                fontSize: 11,
                color: "#9ca3af",
                textAlign: "center",
                marginTop: 8,
              }}
            >
              No signup. No credit card. Results in ~20 seconds.
            </div>
          </div>
        )}

        {state === "loading" && <LoadingPulse keyword={keywords[0]} />}

        {state === "results" && result && (
          <div ref={resultRef} role="region" aria-label="Snapshot results">
            <div
              style={{
                marginBottom: 18,
                paddingBottom: 14,
                borderBottom: "1px solid #f1f5f9",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <h2
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: BRAND_INK,
                      marginBottom: 0,
                      marginTop: 0,
                    }}
                  >
                    Rank Grid · {result.businessName}
                  </h2>
                  <RankGridHelpModal trade={trade} slug={result.slug} />
                </div>
                {result.address && (
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    {result.address}
                  </div>
                )}
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  Ranking for: <strong>{result.keywords.join(", ")}</strong>
                </div>
              </div>
            </div>

            <HeatmapView result={result} trade={trade} />
            <div style={{ marginTop: 24 }}>
              <AuditScorecard audit={result.audit} slug={result.slug} />
            </div>

            <div
              style={{
                marginTop: 24,
                padding: "20px",
                background:
                  "linear-gradient(135deg, #0d3cfc 0%, #1e3a8a 100%)",
                borderRadius: 12,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#fff",
                  marginBottom: 6,
                }}
              >
                Auto-fix all of this
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginBottom: 12 }}>
                MapGuard runs this audit every week and fixes the gaps automatically.
              </div>
              <a
                href={`/products/mapguard?utm_source=map-snapshot&utm_medium=results-cta&utm_campaign=auto-fix&utm_content=${result.slug}`}
                style={{
                  display: "inline-block",
                  background: "#fff",
                  color: BRAND_PRIMARY,
                  padding: "10px 20px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                See MapGuard pricing →
              </a>
            </div>

            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  setState("intake");
                  setResult(null);
                }}
                style={{
                  marginTop: 14,
                  width: "100%",
                  background: "transparent",
                  color: "#6b7280",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: "10px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Run another snapshot
              </button>
            )}

            <div
              style={{
                marginTop: 12,
                textAlign: "center",
                fontSize: 11,
                color: "#9ca3af",
              }}
            >
              Shareable link: <code>/snapshot/{result.slug}</code>
            </div>
          </div>
        )}
      </div>

      {/* Sticky bottom CTA bar */}
      {state === "results" && result && (
        <div
          style={{
            position: "sticky",
            bottom: 0,
            background: "#fff",
            borderTop: "1px solid #e5e7eb",
            padding: "10px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 12, color: BRAND_INK, fontWeight: 500 }}>
            Want the full MapGuard audit?
          </div>
          <a
            href={`/products/mapguard?utm_source=map-snapshot&utm_medium=sticky-cta&utm_campaign=full-audit&utm_content=${result.slug}`}
            style={{
              background: BRAND_PRIMARY,
              color: "#fff",
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Get it →
          </a>
        </div>
      )}
    </div>
  );
}

export default MapSnapshotShell;
