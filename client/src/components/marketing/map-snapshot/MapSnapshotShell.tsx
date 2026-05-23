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
import { ExternalLink } from "lucide-react";

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

/* ─── Heatmap SVG over static map URL ─── */
function HeatmapView({ result }: { result: SnapshotResult }) {
  const cells = result.heatmap;
  const grid = 5;
  const size = 320;
  const cellSize = size / grid;

  const colorForRank = (r: number) => {
    if (r <= 3) return "#16a34a"; // green
    if (r <= 7) return "#65a30d"; // lime
    if (r <= 12) return "#facc15"; // amber
    if (r <= 18) return "#f97316"; // orange
    return "#dc2626"; // red
  };

  return (
    <div style={{ position: "relative", maxWidth: size, margin: "0 auto" }}>
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          background: "#e5e7eb",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        }}
        aria-label={`Rank heatmap for ${result.businessName}`}
      >
        {/* Map background — Static Maps URL via tile pattern. We don't make
            an API call from the client; we just render an approximate tile
            background so the SVG overlay looks anchored. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 50%, #f8fafc 100%)",
            backgroundSize: "32px 32px",
            backgroundImage:
              "linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)",
          }}
        />
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ position: "absolute", inset: 0 }}
          role="img"
          aria-label="Rank grid"
        >
          {cells.map((c) => {
            const cx = c.col * cellSize + cellSize / 2;
            const cy = c.row * cellSize + cellSize / 2;
            const fill = colorForRank(c.rank);
            const label = c.rank >= 21 ? "20+" : String(c.rank);
            return (
              <g key={`${c.row}-${c.col}`}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={cellSize * 0.36}
                  fill={fill}
                  fillOpacity={0.85}
                  stroke="#fff"
                  strokeWidth={2}
                />
                <text
                  x={cx}
                  y={cy + 4}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={700}
                  fill="#fff"
                >
                  {label}
                </text>
              </g>
            );
          })}
          {/* Center pin */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={6}
            fill={BRAND_PRIMARY}
            stroke="#fff"
            strokeWidth={2}
          />
        </svg>
      </div>
      <div
        style={{
          display: "flex",
          gap: 12,
          justifyContent: "center",
          marginTop: 12,
          fontSize: 11,
          color: "#6b7280",
          flexWrap: "wrap",
        }}
      >
        {[
          { c: "#16a34a", l: "Top 3" },
          { c: "#facc15", l: "4–12" },
          { c: "#f97316", l: "13–18" },
          { c: "#dc2626", l: "19–20+" },
        ].map((x) => (
          <span key={x.l} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: x.c, display: "inline-block" }} />
            {x.l}
          </span>
        ))}
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
}: {
  trade?: string;
  initialBusinessName?: string;
  initialResult?: SnapshotResult;
  readOnly?: boolean;
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
                marginBottom: 14,
                paddingBottom: 12,
                borderBottom: "1px solid #f1f5f9",
              }}
            >
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: BRAND_INK,
                  marginBottom: 4,
                  marginTop: 0,
                }}
              >
                {result.businessName}
              </h2>
              {result.address && (
                <div style={{ fontSize: 12, color: "#6b7280" }}>{result.address}</div>
              )}
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                Ranking for: <strong>{result.keywords.join(", ")}</strong>
              </div>
            </div>

            <HeatmapView result={result} />
            <AuditScorecard audit={result.audit} slug={result.slug} />

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
