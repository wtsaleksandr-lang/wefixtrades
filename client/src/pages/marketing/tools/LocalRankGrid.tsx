/**
 * /tools/local-rank-grid — free single-shot geo-grid rank scan.
 *
 * Customer enters business name + city + target keyword. Backend
 * geocodes the city, generates 25 grid points (5x5) at ~5km radius,
 * runs a keyword search per grid point through Serper with a per-point
 * lat/lng + location_canonical, and surfaces the rank-per-cell as a
 * CSS-based heatmap (no map library — keeps the bundle lean).
 *
 * Backend: POST /api/tools/local-rank-grid. Cross-links to MapGuard for
 * continuous monitoring on top of this one-shot snapshot. Sibling to
 * CitationChecker / LocalSearchChecker (Wave 1) — reuses FreeToolLayout.
 *
 * Wave 6A — BrightLocal-parity polish:
 *   - hover popover per pin shows top-3 businesses ranking at that exact
 *     lat/lng (Serper top results, kept by the backend)
 *   - "Average rank" widget above the grid + TOP 3 pill when applicable
 *   - "Who's outranking you nearby" competitor sidebar to the right
 *     (stacks below on mobile) — top-3 distinct businesses owning #1
 *     most frequently across the 25 points, enriched with Google rating
 *     + review count via the Places API
 *   - upsell nudge at the bottom positioned as "want this MONITORED" —
 *     the hybrid free-vs-MapGuard decision (Q1: free gets visible
 *     polish; multi-keyword + history remain the MapGuard moat).
 *
 * Per-PR-#814 color guard: inline styles use rgb(255,255,255) — NOT #fff.
 */
import { useMemo, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import FreeToolLayout from "@/components/marketing/FreeToolLayout";
import {
  FreeToolFormField,
  FreeToolFormFieldStyles,
} from "@/components/marketing/FreeToolFormField";
import { PageMeta } from "@/components/seo/PageMeta";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { AlertCircle, ArrowRight, Star, Trophy } from "lucide-react";

const TOOL_PATH = "/tools/local-rank-grid";

const FAQ_ITEMS = [
  {
    question: "What is a geo-grid rank scan?",
    answer:
      "Google's local results vary by the searcher's exact location. A geo-grid scan runs the same search from 25 different points around your city so you can see where you rank in the Local Pack — not just from one address. A business can show up #1 at its own door and disappear 3 km away.",
  },
  {
    question: "How big is the grid?",
    answer:
      "5x5 grid (25 points) within a ~5km radius of the city center. That's the same density Local Falcon, GMBspy, and BrightLocal use for their single-shot grids — dense enough to find dead zones, wide enough to cover a real service area.",
  },
  {
    question: "What do the colors mean?",
    answer:
      "Green (1-3) means you're in the Local Pack at that point. Yellow (4-10) means top page but below the pack. Orange (11-20) means deep results. Red (missed) means you're not in the top 20 at all from that point — that's a coverage gap worth closing.",
  },
  {
    question: "Is this real-time?",
    answer:
      "Yes — every grid point is a live Google search at the moment you submit the form. No cached data. Results take ~15-25 seconds because we run 25 separate searches in parallel and wait for the slowest one.",
  },
  {
    question: "How does this differ from MapGuard?",
    answer:
      "This is a one-shot snapshot — useful to see where you stand right now. MapGuard runs the same grid (plus more keywords) every day, stores the history, surfaces rank drops, posts to your GBP, and responds to reviews. This tool answers \"where do I rank?\" — MapGuard answers \"how do I rank higher, automatically?\"",
  },
];

interface GridPointTopResult {
  rank: number;
  name: string;
  rating: number | null;
  reviewsCount: number | null;
}

interface GridPoint {
  lat: number;
  lng: number;
  /** 1-20 if found in organic results, null if not in top 20. */
  rank: number | null;
  /** 1-N if found in the Local Pack / Maps results, null otherwise. */
  mapRank: number | null;
  /** Top 3 businesses Serper returned for this exact lat/lng. */
  topResults: GridPointTopResult[];
}

interface Competitor {
  name: string;
  wonAtPoints: number;
  rating: number | null;
  reviewsCount: number | null;
  address: string | null;
}

interface RankGridResult {
  gridPoints: GridPoint[];
  summary: {
    avgRank: number | null;
    top3Count: number;
    missedCount: number;
  };
  center: { lat: number; lng: number; address?: string };
  competitors: Competitor[];
}

/**
 * Map a rank to the heatmap color band. Mirrors the rank legend in the
 * FAQ + below the grid. Greens are Local-Pack territory (1-3), yellows
 * are page-1-but-below-the-pack (4-10), orange is deep results (11-20),
 * red is "we couldn't find you at all from this point".
 *
 * Note (color guard): these are data-vis tokens — rank-band colors are
 * a fixed semantic palette akin to traffic-light coding. Acceptable per
 * the project rule: hardcoded colors only where they encode meaning
 * that has no token (rank bands, gauge bands).
 */
function rankColor(rank: number | null): { bg: string; fg: string; label: string } {
  if (rank == null) return { bg: "#DC2626", fg: "rgb(255,255,255)", label: "—" };
  if (rank <= 3) return { bg: "#16A34A", fg: "rgb(255,255,255)", label: String(rank) };
  if (rank <= 10) return { bg: "#EAB308", fg: "#111827", label: String(rank) };
  return { bg: "#F97316", fg: "rgb(255,255,255)", label: String(rank) };
}

export default function LocalRankGrid() {
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RankGridResult | null>(null);
  /** Which grid cell index (0-24) currently shows its hover popover. */
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);

  const faqSchemaItems = useMemo(() => FAQ_ITEMS.map((f) => ({ question: f.question, answer: f.answer })), []);
  useFaqSchema(faqSchemaItems);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setHoveredCell(null);
    if (!businessName.trim() || !city.trim() || !keyword.trim()) {
      setError("Business name, city, and target keyword are all required.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/tools/local-rank-grid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, city, keyword }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Scan failed.");
      setResult({
        gridPoints: data.gridPoints || [],
        summary: data.summary || { avgRank: null, top3Count: 0, missedCount: 0 },
        center: data.center || { lat: 0, lng: 0 },
        competitors: data.competitors || [],
      });
    } catch (err: any) {
      setError(err?.message || "Scan failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <form onSubmit={submit}>
      <FreeToolFormFieldStyles />
      {/* DESIGN-SYSTEM compliance (2026-05-25 audit). */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <FreeToolFormField
          id="rankgrid-business"
          label="Business name"
          value={businessName}
          onChange={setBusinessName}
          required
          autoComplete="organization"
          testId="input-rankgrid-business"
          helpText="Your Google Business Profile name exactly — we match it inside each grid-point search to find your rank."
        />
        <FreeToolFormField
          id="rankgrid-city"
          label="City"
          value={city}
          onChange={setCity}
          required
          placeholder="Denver, CO"
          autoComplete="address-level2"
          testId="input-rankgrid-city"
          helpText="Where you operate. We anchor the 5×5 grid around this city center at ~5km radius."
        />
        <FreeToolFormField
          id="rankgrid-keyword"
          label="Target keyword"
          value={keyword}
          onChange={setKeyword}
          required
          placeholder="plumber near me"
          testId="input-rankgrid-keyword"
          helpText="Which keyword to check ranks against — e.g. 'plumber near me'."
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        data-testid="button-rankgrid-submit"
        style={{
          marginTop: 2,
          width: "100%",
          padding: "14px 16px",
          borderRadius: 12,
          background: loading ? "rgba(13,60,252,0.6)" : "rgb(13,60,252)",
          color: "rgb(255,255,255)",
          fontSize: 15,
          fontWeight: 700,
          border: "none",
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Scanning 25 grid points…" : "Scan rank across 5×5 grid"}
      </button>
      {error && (
        <div style={{ marginTop: 8, color: "rgb(185,28,28)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </form>
  );

  // Wave 6A — average rank widget + competitor sidebar are computed
  // here once so they share the same `result` snapshot as the grid.
  const inTop3Anywhere = result ? (result.summary.top3Count > 0) : false;

  // Build the 5x5 heatmap from the response's 25 grid points. Points come
  // back in row-major order (top-left → bottom-right) — we render them
  // straight into a CSS grid so the spatial relationship reads at a glance.
  const resultPanel = result ? (
    <div style={{
      background: "rgb(255,255,255)",
      border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: 18,
      padding: 20,
      boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgb(13,60,252)" }}>
          Rank grid snapshot
        </div>
        <div style={{ fontSize: 13, color: "rgba(0,0,0,0.65)" }}>
          <strong style={{ color: "rgb(22,163,74)" }}>{result.summary.top3Count}</strong> in Local Pack ·{" "}
          <strong style={{ color: "rgb(185,28,28)" }}>{result.summary.missedCount}</strong> dead zones
        </div>
      </div>

      {/* Wave 6A layout — desktop: avg-rank + grid (2fr) | competitor sidebar (1fr).
          Mobile: stacks. The avg-rank widget sits to the left/above the grid
          per the BrightLocal screenshot — a single "Average rank" card with the
          large number + "across 25 scan points" + TOP 3 pill when applicable. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: 16,
          alignItems: "start",
        }}
        className="rankgrid-result-grid"
      >
        <div>
          {/* Average rank widget (top-left of the grid area). */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderRadius: 14,
              background: "rgba(13,60,252,0.04)",
              border: "1px solid rgba(13,60,252,0.14)",
              marginBottom: 12,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(0,0,0,0.55)" }}>
                Average rank
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: "rgb(17,24,39)", lineHeight: 1.1 }} data-testid="text-rankgrid-avg">
                {result.summary.avgRank != null ? result.summary.avgRank.toFixed(1) : "—"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", marginTop: 2 }}>
                across 25 scan points
              </div>
            </div>
            {inTop3Anywhere && (
              <div
                data-testid="badge-rankgrid-top3"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(22,163,74,0.12)",
                  color: "rgb(22,163,74)",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  border: "1px solid rgba(22,163,74,0.32)",
                }}
              >
                <Trophy size={12} /> Top 3
              </div>
            )}
          </div>

          {/* Heatmap. Each cell is hoverable — on hover we show a small
              floating card with the top-3 Local Pack businesses for that
              exact lat/lng. The popover anchors to the cell via
              position:relative on the cell + position:absolute on the
              card. Click anywhere else (or mouse-leave) to dismiss. */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 6,
              aspectRatio: "1 / 1",
              maxWidth: 420,
              margin: "0 auto",
              position: "relative",
            }}
            aria-label="5 by 5 rank grid heatmap"
            role="img"
          >
            {result.gridPoints.map((p, i) => {
              // mapRank is preferred (Local Pack rank) — fall back to organic
              // rank for the color cell when the business isn't in the Maps
              // results but does appear in organic.
              const display = p.mapRank ?? p.rank;
              const c = rankColor(display);
              const isHovered = hoveredCell === i;
              return (
                <div
                  key={i}
                  data-testid={`rankgrid-cell-${i}`}
                  onMouseEnter={() => setHoveredCell(i)}
                  onMouseLeave={() => setHoveredCell((prev) => (prev === i ? null : prev))}
                  onClick={() => setHoveredCell((prev) => (prev === i ? null : i))}
                  style={{
                    background: c.bg,
                    color: c.fg,
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: 18,
                    aspectRatio: "1 / 1",
                    // DESIGN-SYSTEM: selected = OUTLINE not bright fill.
                    boxShadow: isHovered
                      ? "0 0 0 2px rgb(13,60,252), 0 6px 18px rgba(0,0,0,0.18)"
                      : "inset 0 0 0 1px rgba(0,0,0,0.08)",
                    position: "relative",
                    cursor: "pointer",
                    transition: "box-shadow 0.12s ease",
                  }}
                  title={`Lat ${p.lat.toFixed(4)}, Lng ${p.lng.toFixed(4)}`}
                >
                  {c.label}
                  {isHovered && (
                    <GridPinPopover
                      point={p}
                      displayRank={display}
                      cellIndex={i}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 16, display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap", fontSize: 11, color: "rgba(0,0,0,0.6)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, background: "rgb(22,163,74)", borderRadius: 2, display: "inline-block" }} /> 1–3 Local Pack
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, background: "rgb(234,179,8)", borderRadius: 2, display: "inline-block" }} /> 4–10
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, background: "rgb(249,115,22)", borderRadius: 2, display: "inline-block" }} /> 11–20
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, background: "rgb(220,38,38)", borderRadius: 2, display: "inline-block" }} /> Not in top 20
            </span>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: "rgba(0,0,0,0.5)", lineHeight: 1.5, textAlign: "center" }}>
            Center: {result.center.address || `${result.center.lat.toFixed(4)}, ${result.center.lng.toFixed(4)}`}.
            Each cell is a live Google search from that exact lat/lng — hover to see who ranks there.
          </div>
        </div>

        {/* Competitor sidebar — right side of the grid. Stacks below the
            grid on mobile via the media query in the inline <style> at
            the bottom of this panel. */}
        <CompetitorSidebar competitors={result.competitors} />
      </div>

      {/* Wave 6A — MapGuard upsell nudge. Reframed per Alex's Q1 (hybrid):
          free tool keeps the polish; MapGuard adds the multi-keyword +
          history + AI Insights moat. CTA: "See MapGuard plans". */}
      <div
        style={{
          marginTop: 22,
          padding: "16px 18px",
          borderRadius: 14,
          background: "linear-gradient(135deg, rgba(13,60,252,0.06), rgba(13,60,252,0.02))",
          border: "1px solid rgba(13,60,252,0.18)",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgb(13,60,252)", marginBottom: 4 }}>
          Track this daily
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgb(17,24,39)", marginBottom: 8 }}>
          Want this monitored daily across your full keyword list?
        </div>
        <ul
          style={{
            margin: "0 0 12px 0",
            paddingLeft: 18,
            fontSize: 13,
            color: "rgba(0,0,0,0.7)",
            lineHeight: 1.6,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <li>All your keywords tracked weekly across the same 5×5 grid</li>
          <li>Historical rank trend by location — see where you're gaining or losing</li>
          <li>AI Insights — automated recommendations on what to fix next</li>
        </ul>
        <a
          href="/products/mapguard"
          data-testid="link-rankgrid-mapguard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgb(13,60,252)",
            color: "rgb(255,255,255)",
            padding: "8px 14px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          See MapGuard plans <ArrowRight size={14} />
        </a>
      </div>

      {/* Responsive: collapse the right sidebar below the grid on narrow viewports. */}
      <style>{`
        @media (max-width: 720px) {
          .rankgrid-result-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  ) : null;

  return (
    <MarketingLayout>
      <PageMeta
        title="Free Local Rank Grid — see where your business ranks across a 5×5 city grid"
        description="Free geo-grid scan: enter your business name + city + target keyword and see where you rank in Google's Local Pack from 25 points around the city. Heatmap of dead zones + competitor sidebar included."
        canonical={TOOL_PATH}
        keywords={["local rank grid", "geo grid rank tracker", "google local pack tracker", "local serp grid scan", "map rank checker"]}
      />
      <FreeToolLayout
        eyebrow="Free Tool"
        title="Local Rank Grid"
        subtitle="See where your business ranks in Google's Local Pack across a 5×5 grid around your city — find the dead zones competitors are stealing from you."
        path={TOOL_PATH}
        breadcrumbLabel="Local Rank Grid"
        heroImageSrc="/ai-thumbnails/tools/local-rank-grid-hero.png"
        heroImageAlt="Isometric grid heatmap with rank pins over a city map"
        form={form}
        result={resultPanel}
      >
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)", marginTop: 0 }}>Why one address isn't enough</h2>
        <p>
          When a customer searches "plumber near me" from their kitchen vs
          three suburbs over, Google can show two completely different Local
          Packs. A business can be #1 at its own front door and totally
          invisible 3 km away. A single-address rank check tells you almost
          nothing about your real local visibility.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>How the grid works</h2>
        <p>
          We geocode your city, drop 25 points in a 5×5 grid covering a ~5km
          radius around the center, then run your target keyword as a live
          Google search from each point. For every cell we record where (if
          at all) your business appears in the top 20 — both Maps Local Pack
          and organic. The heatmap turns red where you're missing.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>Reading the heatmap</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>Green (1-3)</strong>: you're in the Local Pack from this point. Customers searching here see you in the 3-pack with photo + reviews + call button.</li>
          <li><strong>Yellow (4-10)</strong>: top page but below the pack. Customers who scroll past the map see you, but most don't scroll.</li>
          <li><strong>Orange (11-20)</strong>: page 2 territory. Effectively invisible for high-intent local searches.</li>
          <li><strong>Red</strong>: not in the top 20 at all. A real coverage gap.</li>
        </ul>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>What to do with the gaps</h2>
        <p>
          The quickest wins from a grid scan: (1) fix GBP service-area
          coverage if red cells cluster on one side; (2) chase citations and
          backlinks from publishers in the dead-zone neighborhoods; (3)
          create location-specific content / landing pages naming those
          neighborhoods explicitly. The same grid scan in 30 days will tell
          you if those moves worked.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>Want daily monitoring?</h2>
        <p>
          This is a one-shot snapshot. <a href="/products/mapguard" style={{ color: "rgb(13,60,252)", textDecoration: "underline" }}>MapGuard</a>{" "}
          runs the same grid every day across your full keyword list, stores
          the history, and alerts you the moment rank drops. From $99/mo.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>Frequently asked questions</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i}>
              <div style={{ fontWeight: 700, color: "rgb(17,24,39)", marginBottom: 4 }}>{item.question}</div>
              <div style={{ color: "rgba(0,0,0,0.62)" }}>{item.answer}</div>
            </div>
          ))}
        </div>
      </FreeToolLayout>
    </MarketingLayout>
  );
}

/* ─── Hover popover ─────────────────────────────────────────────────── */

/**
 * Wave 6A — small floating card anchored above a hovered grid cell. Lists
 * the top-3 Local Pack businesses for that exact lat/lng. Position is
 * computed so the popover never overflows the right edge of the grid
 * (cells 4, 9, 14, 19, 24 — anchor to the right instead of the left).
 */
function GridPinPopover({
  point,
  displayRank,
  cellIndex,
}: {
  point: GridPoint;
  displayRank: number | null;
  cellIndex: number;
}) {
  const isRightEdge = cellIndex % 5 === 4;
  const isLeftEdge = cellIndex % 5 === 0;
  const isTopRow = cellIndex < 5;
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      data-testid={`rankgrid-popover-${cellIndex}`}
      style={{
        position: "absolute",
        zIndex: 5,
        // Stack ABOVE the cell on bottom rows, BELOW on the top row so
        // the popover never escapes the grid container.
        top: isTopRow ? "calc(100% + 6px)" : "auto",
        bottom: isTopRow ? "auto" : "calc(100% + 6px)",
        left: isRightEdge ? "auto" : (isLeftEdge ? 0 : "50%"),
        right: isRightEdge ? 0 : "auto",
        transform: isRightEdge || isLeftEdge ? "none" : "translateX(-50%)",
        background: "rgb(255,255,255)",
        color: "rgb(17,24,39)",
        borderRadius: 12,
        padding: "10px 12px",
        boxShadow: "0 12px 32px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)",
        minWidth: 220,
        textAlign: "left",
        fontWeight: 500,
        fontSize: 12,
        // The popover sits inside a small clickable square; make sure the
        // pointer stays usable inside the card.
        cursor: "default",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgb(13,60,252)", marginBottom: 4 }}>
        Found at {displayRank != null ? `#${displayRank}` : "—"}
      </div>
      <div style={{ fontSize: 11, color: "rgba(0,0,0,0.55)", marginBottom: 6 }}>
        Top 3 at this point
      </div>
      {point.topResults.length === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>No Local Pack data.</div>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
          {point.topResults.map((r) => (
            <li
              key={`${cellIndex}-${r.rank}-${r.name}`}
              style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 12 }}
            >
              <span style={{ fontWeight: 800, color: "rgba(0,0,0,0.55)", minWidth: 16 }}>#{r.rank}</span>
              <span style={{ flex: 1, color: "rgb(17,24,39)", lineHeight: 1.35 }}>{r.name}</span>
              {r.rating != null && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: "rgba(0,0,0,0.55)", fontSize: 11 }}>
                  <Star size={12} fill="rgb(234,179,8)" strokeWidth={0} />
                  {r.rating.toFixed(1)}
                  {r.reviewsCount != null && (
                    <span style={{ color: "rgba(0,0,0,0.4)" }}>({r.reviewsCount})</span>
                  )}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ─── Competitor sidebar ───────────────────────────────────────────── */

/**
 * Wave 6A — "Who's outranking you nearby" sidebar. Top-3 distinct
 * competitor businesses (by #1 frequency across the 25 grid points),
 * enriched with rating + review count from the Google Places API.
 *
 * No fabricated counts — empty values render as a discreet em-dash.
 */
function CompetitorSidebar({ competitors }: { competitors: Competitor[] }) {
  return (
    <aside
      data-testid="rankgrid-competitor-sidebar"
      style={{
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 14,
        padding: "14px 14px 6px 14px",
        background: "rgba(248,250,252,1)",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(0,0,0,0.55)" }}>
        Who's outranking you nearby
      </div>
      <div style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", marginTop: 2, marginBottom: 10 }}>
        Top-3 businesses owning #1 across the grid
      </div>
      {competitors.length === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", padding: "8px 0" }}>
          No competitor data — you may already own this grid.
        </div>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {competitors.map((c, i) => (
            <li
              key={c.name + i}
              data-testid={`rankgrid-competitor-${i}`}
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                background: "rgb(255,255,255)",
                border: "1px solid rgba(0,0,0,0.06)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "rgb(17,24,39)", lineHeight: 1.3 }}>
                  {c.name}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "rgba(0,0,0,0.5)",
                    background: "rgba(0,0,0,0.04)",
                    padding: "2px 6px",
                    borderRadius: 6,
                    whiteSpace: "nowrap",
                  }}
                  title={`Ranked #1 at ${c.wonAtPoints} of 25 grid points`}
                >
                  #1 × {c.wonAtPoints}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(0,0,0,0.55)" }}>
                {c.rating != null ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                    <Star size={12} fill="rgb(234,179,8)" strokeWidth={0} />
                    <span style={{ fontWeight: 600, color: "rgb(17,24,39)" }}>{c.rating.toFixed(1)}</span>
                  </span>
                ) : (
                  <span>—</span>
                )}
                {c.reviewsCount != null && (
                  <span>· {c.reviewsCount.toLocaleString()} reviews</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
