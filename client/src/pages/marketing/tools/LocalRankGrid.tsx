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
import { AlertCircle, ArrowRight } from "lucide-react";

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

interface GridPoint {
  lat: number;
  lng: number;
  /** 1-20 if found in organic results, null if not in top 20. */
  rank: number | null;
  /** 1-N if found in the Local Pack / Maps results, null otherwise. */
  mapRank: number | null;
}

interface RankGridResult {
  gridPoints: GridPoint[];
  summary: {
    avgRank: number | null;
    top3Count: number;
    missedCount: number;
  };
  center: { lat: number; lng: number; address?: string };
}

/**
 * Map a rank to the heatmap color band. Mirrors the rank legend in the
 * FAQ + below the grid. Greens are Local-Pack territory (1-3), yellows
 * are page-1-but-below-the-pack (4-10), orange is deep results (11-20),
 * red is "we couldn't find you at all from this point".
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

  const faqSchemaItems = useMemo(() => FAQ_ITEMS.map((f) => ({ question: f.question, answer: f.answer })), []);
  useFaqSchema(faqSchemaItems);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
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
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0d3cfc" }}>
          Rank grid snapshot
        </div>
        <div style={{ fontSize: 13, color: "rgba(0,0,0,0.65)" }}>
          {result.summary.avgRank != null ? (
            <>
              Avg rank <strong style={{ color: "#111827" }}>{result.summary.avgRank.toFixed(1)}</strong> ·{" "}
            </>
          ) : null}
          <strong style={{ color: "#16A34A" }}>{result.summary.top3Count}</strong> in Local Pack ·{" "}
          <strong style={{ color: "#B91C1C" }}>{result.summary.missedCount}</strong> dead zones
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 6,
          aspectRatio: "1 / 1",
          maxWidth: 420,
          margin: "0 auto",
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
          return (
            <div
              key={i}
              data-testid={`rankgrid-cell-${i}`}
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
                boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
              }}
              title={`Lat ${p.lat.toFixed(4)}, Lng ${p.lng.toFixed(4)} — rank ${c.label}`}
            >
              {c.label}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap", fontSize: 11, color: "rgba(0,0,0,0.6)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: "#16A34A", borderRadius: 2, display: "inline-block" }} /> 1–3 Local Pack
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: "#EAB308", borderRadius: 2, display: "inline-block" }} /> 4–10
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: "#F97316", borderRadius: 2, display: "inline-block" }} /> 11–20
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: "#DC2626", borderRadius: 2, display: "inline-block" }} /> Not in top 20
        </span>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "rgba(0,0,0,0.5)", lineHeight: 1.5, textAlign: "center" }}>
        Center: {result.center.address || `${result.center.lat.toFixed(4)}, ${result.center.lng.toFixed(4)}`}.
        Each cell is a live Google search from that exact lat/lng — no caching.
      </div>

      {/* MapGuard cross-link — the upsell target for this single-shot tool.
          The free FreeToolLayout wrapper already shows a generic Full-Audit
          CTA below; this one is rank-grid-specific so the messaging stays
          tight (one keyword now → multi-keyword daily monitoring + alerts). */}
      <div
        style={{
          marginTop: 18,
          padding: "16px 18px",
          borderRadius: 14,
          background: "linear-gradient(135deg, rgba(13,60,252,0.06), rgba(13,60,252,0.02))",
          border: "1px solid rgba(13,60,252,0.18)",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0d3cfc", marginBottom: 4 }}>
          Track this daily
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 6 }}>
          Want this monitored daily across multiple keywords + alert on rank drops?
        </div>
        <div style={{ fontSize: 13, color: "rgba(0,0,0,0.62)", marginBottom: 10, lineHeight: 1.55 }}>
          MapGuard runs this same 5×5 grid every day across your full keyword list,
          stores history, alerts you when rank drops, and posts to your GBP to
          fight back automatically. From $99/mo.
        </div>
        <a
          href="/products/mapguard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#0d3cfc",
            color: "rgb(255,255,255)",
            padding: "8px 14px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          See MapGuard <ArrowRight size={14} />
        </a>
      </div>
    </div>
  ) : null;

  return (
    <MarketingLayout>
      <PageMeta
        title="Free Local Rank Grid — see where your business ranks across a 5×5 city grid"
        description="Free geo-grid scan: enter your business name + city + target keyword and see where you rank in Google's Local Pack from 25 points around the city. Heatmap of dead zones included."
        canonical={TOOL_PATH}
        keywords={["local rank grid", "geo grid rank tracker", "google local pack tracker", "local serp grid scan", "map rank checker"]}
      />
      <FreeToolLayout
        eyebrow="Free Tool"
        title="Local Rank Grid"
        subtitle="See where your business ranks in Google's Local Pack across a 5×5 grid around your city — find the dead zones competitors are stealing from you."
        path={TOOL_PATH}
        breadcrumbLabel="Local Rank Grid"
        form={form}
        result={resultPanel}
      >
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E", marginTop: 0 }}>Why one address isn't enough</h2>
        <p>
          When a customer searches "plumber near me" from their kitchen vs
          three suburbs over, Google can show two completely different Local
          Packs. A business can be #1 at its own front door and totally
          invisible 3 km away. A single-address rank check tells you almost
          nothing about your real local visibility.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>How the grid works</h2>
        <p>
          We geocode your city, drop 25 points in a 5×5 grid covering a ~5km
          radius around the center, then run your target keyword as a live
          Google search from each point. For every cell we record where (if
          at all) your business appears in the top 20 — both Maps Local Pack
          and organic. The heatmap turns red where you're missing.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>Reading the heatmap</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>Green (1-3)</strong>: you're in the Local Pack from this point. Customers searching here see you in the 3-pack with photo + reviews + call button.</li>
          <li><strong>Yellow (4-10)</strong>: top page but below the pack. Customers who scroll past the map see you, but most don't scroll.</li>
          <li><strong>Orange (11-20)</strong>: page 2 territory. Effectively invisible for high-intent local searches.</li>
          <li><strong>Red</strong>: not in the top 20 at all. A real coverage gap.</li>
        </ul>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>What to do with the gaps</h2>
        <p>
          The quickest wins from a grid scan: (1) fix GBP service-area
          coverage if red cells cluster on one side; (2) chase citations and
          backlinks from publishers in the dead-zone neighborhoods; (3)
          create location-specific content / landing pages naming those
          neighborhoods explicitly. The same grid scan in 30 days will tell
          you if those moves worked.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>Want daily monitoring?</h2>
        <p>
          This is a one-shot snapshot. <a href="/products/mapguard" style={{ color: "#0d3cfc", textDecoration: "underline" }}>MapGuard</a>{" "}
          runs the same grid every day across your full keyword list, stores
          the history, and alerts you the moment rank drops. From $99/mo.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>Frequently asked questions</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i}>
              <div style={{ fontWeight: 700, color: "#111827", marginBottom: 4 }}>{item.question}</div>
              <div style={{ color: "rgba(0,0,0,0.62)" }}>{item.answer}</div>
            </div>
          ))}
        </div>
      </FreeToolLayout>
    </MarketingLayout>
  );
}
