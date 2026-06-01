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
import { ExternalLink, MapPin } from "lucide-react";
import RankGridHelpModal from "@/components/marketing/RankGridHelpModal";

const BRAND_PRIMARY = "#0d3cfc";
const BRAND_INK = "#1E1E1E";

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

/* ─── Static-map rank-grid helpers (Web Mercator projection) ───
 * Projects each grid cell's lat/lng onto the pixel space of the server-proxied
 * Google Static Map (/api/audit/static-map) so the numbered rank pins line up
 * with the real streets behind them — the API key stays server-side. */
const SM_TILE = 256;
const SM_W = 600;
const SM_H = 440;
const lngToWorldX = (lng: number) => ((lng + 180) / 360) * SM_TILE;
const latToWorldY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  const n = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
  return n * SM_TILE;
};
const worldYToLat = (wy: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * wy) / SM_TILE))) * 180) / Math.PI;
/* green → yellow → red gradient across rank 1..20 (matches the reference). */
const rankPinColor = (rank: number): string => {
  const t = Math.max(0, Math.min(1, (rank - 1) / 19));
  const g = [22, 163, 74];
  const y = [234, 179, 8];
  const r = [220, 38, 38];
  const mix = (a: number[], b: number[], u: number) =>
    a.map((v, i) => Math.round(v + (b[i] - v) * u));
  const c = t < 0.5 ? mix(g, y, t / 0.5) : mix(y, r, (t - 0.5) / 0.5);
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

/* ─── Premium rank-grid view ───
 * Real Google-map background (server-proxied) with geo-projected, color-coded
 * numbered rank pins, a "Results for: <query>" header, the green Average Map
 * Rank badge, and a High/Med/Low distribution legend — matches the canonical
 * geo-grid reference. Best/worst/quick-win callouts follow beneath the map.
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

  // Real-map projection — fit all cells in the static-map viewport, then map
  // each lat/lng to a pixel coordinate so the pins sit over the right streets.
  const map = useMemo(() => {
    const lats = cells.map((c) => c.lat);
    const lngs = cells.map((c) => c.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const centerLng = (minLng + maxLng) / 2;
    const centerLat = worldYToLat(
      (latToWorldY(minLat) + latToWorldY(maxLat)) / 2,
    );
    const spanX = Math.abs(lngToWorldX(maxLng) - lngToWorldX(minLng));
    const spanY = Math.abs(latToWorldY(maxLat) - latToWorldY(minLat));
    const PAD = 0.82;
    const zx = spanX > 0 ? Math.log2((SM_W * PAD) / spanX) : 20;
    const zy = spanY > 0 ? Math.log2((SM_H * PAD) / spanY) : 20;
    let zoom = Math.floor(Math.min(zx, zy));
    if (!Number.isFinite(zoom)) zoom = 13;
    zoom = Math.max(8, Math.min(16, zoom));
    const scale = Math.pow(2, zoom);
    const cwx = lngToWorldX(centerLng) * scale;
    const cwy = latToWorldY(centerLat) * scale;
    const project = (lat: number, lng: number) => ({
      x: lngToWorldX(lng) * scale - cwx + SM_W / 2,
      y: latToWorldY(lat) * scale - cwy + SM_H / 2,
    });
    return { centerLat, centerLng, zoom, project };
  }, [cells]);

  const mapSrc = `/api/audit/static-map?lat=${map.centerLat.toFixed(6)}&lng=${map.centerLng.toFixed(6)}&zoom=${map.zoom}&w=${SM_W}&h=${SM_H}`;
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

  // High / Med / Low buckets for the header legend bars (matches reference).
  const hml = useMemo(() => {
    let high = 0;
    let med = 0;
    let low = 0;
    for (const c of cells) {
      if (c.rank <= 3) high++;
      else if (c.rank <= 10) med++;
      else low++;
    }
    return { high, med, low, max: Math.max(high, med, low, 1) };
  }, [cells]);

  const query =
    result.keywords?.[0] || (trade ? `${trade} near me` : "near me");
  const avgColor = rankPinColor(stats.avg || 1);

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
      {/* Header: query on the left, High/Med/Low distribution bars on the right */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, color: BRAND_INK, lineHeight: 1.3 }}>
          Results for:{" "}
          <span style={{ color: BRAND_PRIMARY }}>&ldquo;{query}&rdquo;</span>
        </div>
        <div
          role="region"
          aria-label="Rank distribution"
          style={{ display: "grid", gap: 6, minWidth: 210 }}
        >
          {[
            { label: "High-ranking Points", count: hml.high, color: "#16a34a" },
            { label: "Med-ranking Points", count: hml.med, color: "#eab308" },
            { label: "Low-ranking Points", count: hml.low, color: "#dc2626" },
          ].map((row) => (
            <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#475569", width: 118, flexShrink: 0 }}>
                {row.label}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: BRAND_INK,
                  width: 20,
                  textAlign: "right",
                  flexShrink: 0,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {row.count}
              </span>
              <span
                aria-hidden="true"
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 999,
                  background: "#eef2f7",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    display: "block",
                    height: "100%",
                    width: `${Math.round((row.count / hml.max) * 100)}%`,
                    background: row.color,
                    borderRadius: 999,
                  }}
                />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Real Google map (server-proxied) with geo-projected rank pins */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: `${SM_W} / ${SM_H}`,
          borderRadius: 18,
          overflow: "hidden",
          border: "1px solid #e2e8f0",
          background: "#eef2f7",
          boxShadow:
            "0 1px 2px rgba(13,60,252,0.04), 0 8px 24px rgba(15,23,42,0.06)",
        }}
        aria-label={`Rank grid map for ${result.businessName}${trade ? ` (${trade})` : ""}`}
      >
        {!mapFailed && (
          <img
            src={mapSrc}
            alt=""
            aria-hidden="true"
            onLoad={() => setMapLoaded(true)}
            onError={() => setMapFailed(true)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: mapLoaded ? 1 : 0,
              transition: "opacity 400ms ease",
            }}
          />
        )}

        {/* Average Map Rank badge — top-left, color-coded by the average */}
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            zIndex: 3,
            background: avgColor,
            borderRadius: 12,
            padding: "8px 12px",
            color: "#fff",
            boxShadow: "0 4px 12px rgba(15,23,42,0.18)",
            textAlign: "center",
            minWidth: 64,
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>
            {stats.avg ? stats.avg.toFixed(1) : "—"}
          </div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.04em",
              marginTop: 3,
              opacity: 0.95,
            }}
          >
            Average Map Rank
          </div>
        </div>

        {/* Numbered, color-coded rank pins */}
        {cells.map((c) => {
          const p = map.project(c.lat, c.lng);
          const label = c.rank >= 21 ? "20+" : String(c.rank);
          const cascadeIdx = c.row * grid + c.col;
          const delayMs = Math.min(cascadeIdx * 24, 600);
          return (
            <div
              key={`${c.row}-${c.col}`}
              data-testid={`rank-pin-${c.row}-${c.col}`}
              aria-label={describeCell(c)}
              title={describeCell(c)}
              className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-75 duration-300"
              style={{
                position: "absolute",
                left: `${(p.x / SM_W) * 100}%`,
                top: `${(p.y / SM_H) * 100}%`,
                transform: "translate(-50%, -50%)",
                zIndex: 2,
                width: "clamp(20px, 4.6vw, 28px)",
                height: "clamp(20px, 4.6vw, 28px)",
                borderRadius: 999,
                background: rankPinColor(c.rank),
                border: "1.5px solid rgba(255,255,255,0.92)",
                boxShadow: "0 1px 3px rgba(15,23,42,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: "clamp(9px, 2vw, 12px)",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                animationDelay: `${delayMs}ms`,
                animationFillMode: "both",
              }}
            >
              {label}
            </div>
          );
        })}

        {/* Your business marker */}
        {(() => {
          const p = map.project(result.lat, result.lng);
          return (
            <div
              aria-label="Your business location"
              title={result.businessName}
              style={{
                position: "absolute",
                left: `${(p.x / SM_W) * 100}%`,
                top: `${(p.y / SM_H) * 100}%`,
                transform: "translate(-50%, -50%)",
                zIndex: 4,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 26,
                height: 26,
                borderRadius: 999,
                background: "#fff",
                border: `2px solid ${BRAND_PRIMARY}`,
                boxShadow: "0 2px 6px rgba(15,23,42,0.3)",
              }}
            >
              <MapPin size={14} color={BRAND_PRIMARY} aria-hidden="true" />
            </div>
          );
        })()}
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
        ★★★★★ Built for plumbers, electricians, HVAC, roofers, and cleaners
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
