/**
 * /tools/local-rank-tracker — multi-engine single-business rank checker
 * (Wave 6F).
 *
 * Distinct from /tools/local-rank-grid (5×5 geo heatmap). This is a
 * single-business, multi-engine rank look-up: enter business name + keyword
 * + city, get back your position on Google Web, Brave (Bing-equivalent), and
 * Google Maps Local Pack — plus the top 3 competitors outranking you on each
 * engine.
 *
 * No Apple Maps tab — Apple does not publish a public Maps SERP API. A
 * "coming Q4 2026" disclaimer sits at the bottom in case anyone asks.
 *
 * Backend: POST /api/tools/local-rank-tracker (server/routes/freeToolsRoutes.ts)
 *   → 3 parallel searchSerp() calls (google_web, bing_equivalent, google_maps)
 *     via the Wave 6.5 orchestrator.
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
import {
  AlertCircle,
  ArrowRight,
  Eye,
  Globe,
  MapPin,
  Search,
  Star,
  Target,
  Trophy,
} from "lucide-react";
import { Link } from "wouter";
import { MonthlyBarSeries } from "@/components/ui/visual-primitives";

const TOOL_PATH = "/tools/local-rank-tracker";

type EngineKey = "googleWeb" | "braveWeb" | "googleMaps";

interface EngineCardData {
  key: EngineKey;
  label: string;
  helper: string;
  icon: React.ReactNode;
  accent: string;
}

const ENGINES: EngineCardData[] = [
  {
    key: "googleWeb",
    label: "Google Web",
    helper: "Top 10 organic blue links",
    icon: <Search size={20} />,
    accent: "rgb(13,60,252)",
  },
  {
    key: "braveWeb",
    label: "Brave Web",
    helper: "Bing-equivalent index — privacy SE",
    icon: <Globe size={20} />,
    accent: "rgb(251,113,36)",
  },
  {
    key: "googleMaps",
    label: "Google Maps Local Pack",
    helper: "The 3-pack of map results",
    icon: <MapPin size={20} />,
    accent: "rgb(34,197,94)",
  },
];

const FAQ_ITEMS = [
  {
    question: "How is this different from the Local Rank Grid?",
    answer:
      "The Local Rank Grid scans a 5×5 grid of GPS points around your city to show how your map rank changes block-by-block. The Local Rank Tracker is a single-point, multi-engine snapshot — your position on Google Web, Brave's Bing-equivalent index, and the Google Maps Local Pack from one query. Use the Grid for service-area heatmaps; use the Tracker for a quick \"where am I right now\" across all engines.",
  },
  {
    question: "Why Brave instead of Bing?",
    answer:
      "Microsoft retired the Bing Search v7 API in August 2025. Brave's Search API serves the same underlying index (Brave licensed Microsoft's index in 2024) at a higher free tier and with no enterprise paperwork. For users, the SERP composition is functionally identical to Bing.",
  },
  {
    question: "Where's Apple Maps?",
    answer:
      "Apple does not publish a public Maps Search API — there is no honest way to query Apple Maps rankings programmatically without scraping (which is against their TOS and unreliable at scale). We're tracking the situation; if Apple ships an API we'll add the tab the same week.",
  },
  {
    question: "How accurate is the fuzzy business-name match?",
    answer:
      "We normalise both the business name you enter and each result title — lowercase, strip punctuation, collapse whitespace — then check for substring inclusion. \"Joe's Plumbing & Heating\" matches \"Joes Plumbing\" or \"Joe's Plumbing & Heating LLC\". If your business name is generic (\"ABC Plumbing\"), include the city in the name to disambiguate.",
  },
  {
    question: "What does 'not in top 20' mean?",
    answer:
      "We pull the top 20 results from each engine. If we don't find your business in those 20, we show 'Not in top 20'. Beyond position 20 the click-through rate is effectively zero, so for ranking-decision purposes 'not in top 20' = 'not ranking'.",
  },
];

interface CompetitorRow {
  position: number;
  title: string;
  rating?: number;
  reviewCount?: number;
}

interface EngineResult {
  position: number | null;
  totalChecked: number;
  competitors: CompetitorRow[];
  provider: string;
  cached: boolean;
  error?: string;
}

interface RankTrackerResponse {
  businessName: string;
  keyword: string;
  location: string;
  engines: Record<EngineKey, EngineResult>;
}

export default function LocalRankTracker() {
  const [businessName, setBusinessName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RankTrackerResponse | null>(null);

  const faqSchemaItems = useMemo(
    () => FAQ_ITEMS.map((f) => ({ question: f.question, answer: f.answer })),
    [],
  );
  useFaqSchema(faqSchemaItems);

  const jsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Local Rank Tracker",
      applicationCategory: "SEOApplication",
      operatingSystem: "Web",
      description:
        "Free multi-engine local rank checker — see your business position on Google Web, Brave (Bing-equivalent), and Google Maps Local Pack from a single search.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    }),
    [],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!businessName.trim() || !keyword.trim() || !location.trim()) {
      setError("Business name, keyword, and location are all required.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/tools/local-rank-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, keyword, location }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Rank check failed.");
      setResult({
        businessName: data.businessName,
        keyword: data.keyword,
        location: data.location,
        engines: data.engines,
      });
    } catch (err: any) {
      setError(err?.message || "Rank check failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  /* ─── Hero illustration — 3 engine circles with icons ───────────────── */
  const HeroIllustration = () => (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        right: -8,
        top: 0,
        display: "none",
        pointerEvents: "none",
      }}
      className="lrt-hero-illustration"
    >
      <style>{`
        @media (min-width: 900px) {
          .lrt-hero-illustration { display: flex !important; }
        }
      `}</style>
      {ENGINES.map((eng, i) => (
        <div
          key={eng.key}
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.85)",
            border: `1.5px solid ${eng.accent}`,
            color: eng.accent,
            marginLeft: i === 0 ? 0 : -12,
            boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
          }}
        >
          {eng.icon}
        </div>
      ))}
    </div>
  );

  const form = (
    <form onSubmit={submit}>
      <FreeToolFormFieldStyles />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <FreeToolFormField
          id="rt-business"
          label="Business name"
          value={businessName}
          onChange={setBusinessName}
          required
          placeholder="Joe's Plumbing"
          testId="input-rt-business"
          helpText="Your business name as it appears on your Google Business Profile. Include city if your name is generic."
        />
        <FreeToolFormField
          id="rt-keyword"
          label="Target keyword"
          value={keyword}
          onChange={setKeyword}
          required
          placeholder="emergency plumber"
          testId="input-rt-keyword"
          helpText="The phrase you want to rank for. Try a high-intent query a customer would actually type."
        />
        <FreeToolFormField
          id="rt-location"
          label="City / location"
          value={location}
          onChange={setLocation}
          required
          placeholder="Austin, TX"
          testId="input-rt-location"
          helpText="City + state, postcode, or any locality string. The search is run from this location."
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        data-testid="button-rt-submit"
        style={{
          marginTop: 12,
          width: "100%",
          padding: "14px 16px",
          borderRadius: 12,
          background: loading ? "rgba(34,197,94,0.6)" : "rgb(34,197,94)",
          color: "rgb(255,255,255)",
          fontSize: 15,
          fontWeight: 700,
          border: "none",
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Checking your rank…" : "Check my rank"}
      </button>
      {error && (
        <div style={{ marginTop: 8, color: "rgb(185,28,28)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </form>
  );

  /* ─── Engine result card ────────────────────────────────────────────── */
  const EngineCard = ({ engine, data }: { engine: EngineCardData; data: EngineResult }) => {
    const inTop10 = data.position != null && data.position <= 10;
    const positionLabel =
      data.position != null
        ? `#${data.position}`
        : data.error
        ? "Unavailable"
        : `Not in top ${data.totalChecked || 20}`;
    return (
      <div
        data-testid={`engine-card-${engine.key}`}
        style={{
          background: "rgb(255,255,255)",
          border: `1px solid ${inTop10 ? engine.accent : "rgba(0,0,0,0.08)"}`,
          borderRadius: 18,
          padding: 18,
          boxShadow: inTop10
            ? `0 10px 30px ${engine.accent}1a`
            : "0 10px 30px rgba(0,0,0,0.06)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: `${engine.accent}14`,
              color: engine.accent,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {engine.icon}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "rgb(17,24,39)" }}>{engine.label}</div>
            <div style={{ fontSize: 11, color: "rgba(0,0,0,0.5)" }}>{engine.helper}</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div
            style={{
              fontSize: 32,
              fontWeight: 900,
              color: inTop10 ? engine.accent : "rgba(0,0,0,0.45)",
              lineHeight: 1,
            }}
          >
            {positionLabel}
          </div>
          {inTop10 && (
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: engine.accent,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Trophy size={12} /> Top 10
            </div>
          )}
        </div>

        {data.competitors.length > 0 && (
          <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(0,0,0,0.45)", marginBottom: 6 }}>
              Outranking you
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.competitors.slice(0, 3).map((c) => (
                <div key={`${c.position}-${c.title}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: engine.accent, width: 24 }}>#{c.position}</span>
                  <span style={{ flex: 1, color: "rgb(17,24,39)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                  {c.rating != null && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "rgba(0,0,0,0.55)", fontSize: 12 }}>
                      <Star size={12} fill="rgb(251,191,36)" stroke="rgb(251,191,36)" /> {c.rating}
                      {c.reviewCount != null && <span style={{ opacity: 0.7 }}>({c.reviewCount})</span>}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: "auto" }}>
          via {data.provider}{data.cached ? " (cached)" : ""}
        </div>
      </div>
    );
  };

  // Wave 73b — cross-engine visibility KPI card. Position is inverted
  // (lower rank = better) so the bar reflects "visibility": a #1 spot
  // gets a 20-unit bar, "not ranking / unavailable" gets 0. Highlight
  // the strongest engine.
  const visibilityBars = result
    ? ENGINES.map((eng) => {
        const r = result.engines[eng.key];
        const visibility = r.position != null ? Math.max(0, 21 - r.position) : 0;
        return { label: eng.label.replace(" Local Pack", ""), value: visibility, raw: r };
      })
    : [];
  const peakVisibility = visibilityBars.reduce((m, b) => (b.value > m ? b.value : m), 0);
  const monthlyBars = visibilityBars.map((b) => ({
    label: b.label,
    value: b.value,
    highlighted: b.value > 0 && b.value === peakVisibility,
  }));
  // Format the tooltip value back into "rank #N" or "Not in top 20".
  const formatRankTooltip = (n: number) => (n > 0 ? `Rank #${21 - n}` : "Not in top 20");

  const resultPanel = result ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Wave 73b — visibility-across-engines KPI card. */}
      <div
        data-testid="rank-tracker-kpi-card"
        style={{
          padding: 16,
          border: "1px solid rgba(0,0,0,0.06)",
          borderRadius: 14,
          background: "rgb(255,255,255)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
        }}
      >
        <MonthlyBarSeries
          bars={monthlyBars}
          lede="Visibility across engines"
          caption="Taller bar = stronger rank. Hover for the raw position."
          color="emerald"
          formatValue={formatRankTooltip}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
        }}
      >
        {ENGINES.map((eng) => (
          <EngineCard key={eng.key} engine={eng} data={result.engines[eng.key]} />
        ))}
      </div>

      {/* MapGuard cross-link — subtle nudge, not aggressive */}
      <div
        style={{
          marginTop: 4,
          padding: "16px 18px",
          borderRadius: 14,
          background: "linear-gradient(135deg, rgba(34,197,94,0.06), rgba(13,60,252,0.04))",
          border: "1px solid rgba(34,197,94,0.18)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgb(34,197,94)", marginBottom: 4 }}>
            Track this continuously
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "rgb(17,24,39)", marginBottom: 2 }}>
            MapGuard — multi-engine rank monitoring + AI insights
          </div>
          <div style={{ fontSize: 13, color: "rgba(0,0,0,0.6)" }}>
            Daily rechecks across all 3 engines, drop alerts to your inbox, and AI-suggested fixes when you slip.
          </div>
        </div>
        <Link
          href="/products/mapguard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgb(34,197,94)",
            color: "rgb(255,255,255)",
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          See MapGuard <ArrowRight size={14} />
        </Link>
      </div>

      {/* Apple Maps disclaimer */}
      <div
        data-testid="apple-maps-disclaimer"
        style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", textAlign: "center", marginTop: 4 }}
      >
        Apple Maps tracking coming Q4 2026 (pending public Apple Maps SERP API)
      </div>
    </div>
  ) : null;

  /* ─── "Why Local Rank Tracker is your perfect partner" 3-column ────── */
  const WhyPartner = (
    <>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)", marginTop: 0 }}>Why Local Rank Tracker is your perfect partner</h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginTop: 12,
          marginBottom: 24,
        }}
      >
        {[
          {
            num: "01",
            title: "See the Local Map Pack",
            body: "Track your Google Business Profile in those coveted top three map spots — the highest-converting real estate in local search.",
            icon: <MapPin size={20} />,
          },
          {
            num: "02",
            title: "Multi-engine visibility",
            body: "Google plus Brave's Bing-equivalent index in one view, so you can optimise for both without paying for two tools.",
            icon: <Eye size={20} />,
          },
          {
            num: "03",
            title: "Eye-spy a competitor",
            body: "See exactly who's outranking you on each engine, with their rating and review count, so you know what to beat.",
            icon: <Target size={20} />,
          },
        ].map((card) => (
          <div
            key={card.num}
            style={{
              padding: 16,
              borderRadius: 14,
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgb(34,197,94)", letterSpacing: "0.08em" }}>{card.num}</span>
              <span style={{ color: "rgb(34,197,94)" }}>{card.icon}</span>
            </div>
            <div style={{ fontWeight: 700, color: "rgb(17,24,39)", marginBottom: 4 }}>{card.title}</div>
            <div style={{ fontSize: 13, color: "rgba(0,0,0,0.62)", lineHeight: 1.55 }}>{card.body}</div>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <MarketingLayout>
      <PageMeta
        title="Local Rank Tracker — Free multi-engine local rank checker"
        description="Check your local SEO rank on Google Web, Brave (Bing-equivalent), and Google Maps Local Pack — all in one free search. See competitors outranking you."
        canonical={TOOL_PATH}
        keywords={["local rank tracker", "multi engine rank checker", "google maps rank tracker", "brave search rank", "local seo position checker"]}
        jsonLd={jsonLd}
      />
      <FreeToolLayout
        eyebrow="Free Tool"
        title="Keep a pulse on your performance"
        subtitle="Local Rank Tracker shows where you stand on Google, Brave (Bing-equivalent index), and Google Maps. Real-time visibility, no signup."
        path={TOOL_PATH}
        breadcrumbLabel="Local Rank Tracker"
        form={
          <div style={{ position: "relative" }}>
            <HeroIllustration />
            {form}
          </div>
        }
        result={resultPanel}
      >
        {WhyPartner}

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>How it works</h2>
        <p>
          Enter your business name, the keyword you want to rank for, and the
          city. The tool fires 3 parallel SERP queries through the Wave 6.5
          orchestrator — Google Web, Brave (Bing-equivalent), and Google Maps —
          fuzzy-matches your business name against each result list, and
          returns your position plus the top 3 businesses ranking above you on
          each engine. End-to-end: usually under 4 seconds.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>Why three engines, not one?</h2>
        <p>
          Google still owns ~85% of US search, but ignoring Brave + Maps leaves
          two real revenue streams on the table:
        </p>
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>Brave Search</strong> indexes 1B+ pages/day and serves the privacy-focused audience that overlaps heavily with high-trust buyer personas.</li>
          <li><strong>Google Maps Local Pack</strong> drives the majority of "near me" mobile conversion — it's the 3-pack that sits above organic on every mobile local-intent search.</li>
        </ul>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>Want continuous monitoring?</h2>
        <p>
          This is a one-shot rank check.{" "}
          <Link href="/products/mapguard" style={{ color: "rgb(13,60,252)", textDecoration: "underline" }}>
            MapGuard
          </Link>{" "}
          re-runs the same multi-engine check every day, alerts you the moment
          you drop out of the top 3, and ships an AI-suggested fix list with
          each alert — so a rank slip becomes a same-day fix instead of a
          month-long bleed.
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
