/**
 * /tools/local-rankflux — Google Local algorithm volatility tracker.
 *
 * STUB IMPLEMENTATION (Wave 1). The backend currently returns a
 * deterministic synthetic 7-day series (server/routes/freeToolsRoutes.ts
 * `localRankfluxHandler`). The real metric requires a daily cron that:
 *
 *   1. Runs a fixed matrix of keywords × locations through Serper.
 *   2. Stores the SERP positions in Postgres (`rankflux_observations`).
 *   3. Day-over-day computes a Spearman / Kendall shuffle score across
 *      the matrix to produce a 0..100 volatility index.
 *   4. Bands the index into LOW / MEDIUM / HIGH.
 *
 * That work is P2 (post-launch). For now the page ships as an SEO entry
 * point — it targets "google local algorithm tracker" + "local seo
 * volatility" queries even with stub data, and the disclaimer is
 * surfaced honestly so visitors know what they're looking at.
 */
import { useEffect, useMemo, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import FreeToolLayout from "@/components/marketing/FreeToolLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { Activity, AlertTriangle } from "lucide-react";

const TOOL_PATH = "/tools/local-rankflux";

const FAQ_ITEMS = [
  {
    question: "What is Local Rankflux?",
    answer:
      "Local Rankflux is a daily index of how much the Google local search algorithm is shuffling rankings. High volatility means SERPs are churning — businesses moving up and down dramatically day-over-day. Low volatility means the algorithm is quiet.",
  },
  {
    question: "Why does volatility matter to trade businesses?",
    answer:
      "If you notice your phone has gone quiet, the first question is: did MY ranking drop, or is the whole local pack shifting? A high-volatility day means Google rolled out an update — don't panic about a single day's drop. A low-volatility day with a phone-call drop means something specific to YOUR profile changed.",
  },
  {
    question: "How is the score calculated?",
    answer:
      "The full implementation tracks a matrix of trade keywords across major US metros through the Google SERP, daily. Day-over-day position shuffles are scored 0-100. We're currently rolling out the daily tracking infrastructure — the score below is a placeholder until the live data lands.",
  },
  {
    question: "When will live data ship?",
    answer:
      "The daily SERP-tracking cron is on the P2 roadmap (post-launch). The page is live now so we can capture search demand from \"google algorithm tracker\" and \"local seo volatility\" queries; the data behind it goes live as soon as the cron + database table land.",
  },
  {
    question: "Are there alternatives?",
    answer:
      "MozCast, Semrush Sensor, and Algoroo all track Google algorithm volatility for general organic SERPs. None of them track local-pack volatility specifically — that's the gap we're building toward.",
  },
];

interface RankfluxDay {
  date: string;
  score: number;
  band: "LOW" | "MEDIUM" | "HIGH";
}

const BAND_COLOR: Record<RankfluxDay["band"], string> = {
  LOW: "#22C55E",
  MEDIUM: "#F59E0B",
  HIGH: "#EF4444",
};

export default function LocalRankflux() {
  const [data, setData] = useState<{ volatility: RankfluxDay["band"]; score: number; last7d: RankfluxDay[]; updatedAt: string; isStub?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const faqSchemaItems = useMemo(() => FAQ_ITEMS.map((f) => ({ question: f.question, answer: f.answer })), []);
  useFaqSchema(faqSchemaItems);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tools/local-rankflux")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d?.ok) throw new Error(d?.error || "Failed to load.");
        setData({ volatility: d.volatility, score: d.score, last7d: d.last7d || [], updatedAt: d.updatedAt, isStub: d.isStub });
      })
      .catch((err) => { if (!cancelled) setError(err?.message || "Failed to load."); });
    return () => { cancelled = true; };
  }, []);

  const yesterdayBand = data?.volatility;
  const yesterdayScore = data?.score ?? 0;
  const yesterdayColor = yesterdayBand ? BAND_COLOR[yesterdayBand] : "rgba(0,0,0,0.2)";

  const form = (
    <div>
      <div style={{ textAlign: "center", padding: "10px 0 4px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(0,0,0,0.5)", marginBottom: 8 }}>
          Yesterday's Google Local Volatility
        </div>
        {!data && !error && (
          <div style={{ fontSize: 14, color: "rgba(0,0,0,0.5)" }}>Loading…</div>
        )}
        {error && (
          <div style={{ fontSize: 14, color: "#B91C1C" }}>{error}</div>
        )}
        {data && (
          <>
            <div style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: 10,
              padding: "12px 24px",
              borderRadius: 18,
              background: `${yesterdayColor}1A`,
              border: `1px solid ${yesterdayColor}55`,
            }}>
              <Activity size={20} color={yesterdayColor} />
              <span style={{ fontSize: 36, fontWeight: 900, color: yesterdayColor, letterSpacing: "-0.02em" }} data-testid="text-rankflux-band">
                {yesterdayBand}
              </span>
              <span style={{ fontSize: 16, color: "rgba(0,0,0,0.5)" }}>{yesterdayScore}/100</span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginTop: 10 }}>
              Last updated: {new Date(data.updatedAt).toLocaleString()}
            </div>
          </>
        )}
      </div>

      {data?.last7d && data.last7d.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(0,0,0,0.5)", marginBottom: 8, textAlign: "center" }}>
            Past 7 days
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 6, height: 110, padding: "0 8px" }}>
            {data.last7d.map((d) => {
              const heightPct = Math.max(8, Math.min(100, d.score));
              return (
                <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 10, color: "rgba(0,0,0,0.5)", fontWeight: 600 }}>{d.score}</div>
                  <div
                    title={`${d.date}: ${d.score}/100 — ${d.band}`}
                    style={{
                      width: "100%",
                      height: `${heightPct}%`,
                      background: BAND_COLOR[d.band],
                      borderRadius: 6,
                      opacity: 0.75,
                    }}
                  />
                  <div style={{ fontSize: 10, color: "rgba(0,0,0,0.4)" }}>{d.date.slice(5)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data?.isStub && (
        <div style={{
          marginTop: 16,
          padding: "10px 12px",
          borderRadius: 12,
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.25)",
          fontSize: 12,
          color: "#92400E",
          lineHeight: 1.55,
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            <strong>Placeholder data.</strong> Live daily SERP tracking is on
            the P2 roadmap. Numbers shown are deterministic placeholders so
            this page works as an SEO entry point until the tracking cron
            ships.
          </span>
        </div>
      )}
    </div>
  );

  return (
    <MarketingLayout>
      <PageMeta
        title="Local Rankflux — Google Local Algorithm Volatility Tracker"
        description="Track Google's local search algorithm volatility day-by-day. See whether yesterday's ranking shuffle was MozCast-style chaos or a quiet day — and what it means for your trade business."
        canonical={TOOL_PATH}
        keywords={["google local algorithm tracker", "local seo volatility", "rankflux", "google algorithm update tracker", "local serp volatility"]}
      />
      <FreeToolLayout
        eyebrow="Free Tool"
        title="Local Rankflux"
        subtitle="A daily index of how much Google's local search algorithm is shuffling rankings — so you know whether your ranking drop is you, or everyone."
        path={TOOL_PATH}
        breadcrumbLabel="Local Rankflux"
        form={form}
      >
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E", marginTop: 0 }}>What Local Rankflux measures</h2>
        <p>
          Google's local search algorithm doesn't sit still. Some weeks it's
          quiet — businesses' positions are essentially fixed. Other weeks
          Google rolls out an update (named or unnamed) and local-pack
          rankings shuffle dramatically. Local Rankflux tracks how much
          shuffle is happening, expressed as a 0-100 index banded into LOW
          / MEDIUM / HIGH.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>Why you care</h2>
        <p>
          If your phone goes quiet for a week, the first question is: <em>did
          MY ranking drop, or is the whole local pack reshuffling?</em> A
          HIGH-volatility day means Google rolled an update — don't panic
          about a single day's number. A LOW-volatility day with a
          phone-call drop means something specific to YOUR business changed
          (a new competitor, a profile edit, a review pattern shift).
          Volatility context turns "I'm panicking about my ranking" into
          "I know exactly where to investigate."
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>How the score is built</h2>
        <p>
          The full pipeline (currently rolling out) runs a fixed matrix of
          common trade keywords across major US metros through Google's
          local SERP, every morning, and measures the day-over-day shuffle
          across the matrix. A position-1 result that drops to position-4
          contributes more shuffle than a position-9 result that drops to
          position-10. The aggregate shuffle score gets normalised to 0-100
          and banded.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>How to read the bands</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>LOW (0-39)</strong>: Algorithm is quiet. If your ranking dropped, look at your own profile / competitors.</li>
          <li><strong>MEDIUM (40-64)</strong>: Normal day-to-day churn. Some movement, nothing to panic about.</li>
          <li><strong>HIGH (65-100)</strong>: Likely a Google update in progress. Hold steady — wait 3-7 days for things to settle before changing your profile.</li>
        </ul>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>Want to track YOUR rankings?</h2>
        <p>
          Local Rankflux measures the algorithm. To measure your own
          rankings, run the <a href="/tools/free-audit" style={{ color: "#0d3cfc", textDecoration: "underline" }}>Full
          WeFixTrades Audit</a> ($9.80) — it tracks 20 keywords for your
          trade, stores rank history, and overlays it against volatility so
          you know exactly when to act and when to wait.
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
