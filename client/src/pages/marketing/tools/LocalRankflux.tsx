/**
 * /tools/local-rankflux — Google Local algorithm volatility tracker.
 *
 * Wave 17 — Moz deprecated their public MozCast RSS feed (404). The
 * backend now runs a 3-tier fallback chain off the same MozCast
 * surface (HTML scrape → cached → Semrush Sensor embed → unavailable
 * pill). This page renders the appropriate variant based on the
 * `source` field in the API response:
 *
 *   - "mozcast" / "cached":   render the SVG gauge + 7-day bar chart.
 *   - "semrush-embed":        render an iframe to Semrush's official
 *                             Sensor widget (no scrape, no paid API).
 *   - "unavailable":          render a grey "Data temporarily
 *                             unavailable — checking again in 1 hour"
 *                             pill. Never crash.
 *
 * The page also renders:
 *   3) An email subscribe form (single email + 3 cadence checkboxes).
 *      POST /api/tools/rankflux-subscribe; confirmation email is queued
 *      via emailOrchestrator; daily/weekly/urgent dispatch is in
 *      server/jobs/rankfluxAlertWorker.ts (cron @ 09:30 UTC).
 *   4) A "Why we built this" / "Free forever" / "Built into MapGuard"
 *      borrowed-credibility band (Alex Q3: tech-stack + transparency,
 *      no fake testimonials or customer counts).
 *
 * Per-PR-#814 color guard: inline styles use rgb()/rgba() — NOT raw hex
 * (except where data-vis bands encode meaning).
 */
import { useEffect, useMemo, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import FreeToolLayout from "@/components/marketing/FreeToolLayout";
import {
  FreeToolFormField,
  FreeToolFormFieldStyles,
} from "@/components/marketing/FreeToolFormField";
import { PageMeta } from "@/components/seo/PageMeta";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { Activity, ShieldCheck, ExternalLink, Loader2, CheckCircle2 } from "lucide-react";

const TOOL_PATH = "/tools/local-rankflux";

const FAQ_ITEMS = [
  {
    question: "What is Local Rankflux?",
    answer:
      "A daily index of how much Google's local search algorithm is shuffling rankings. We mirror Moz's industry-standard MozCast index (0–10 scale) — high volatility means SERPs are churning that day, low means the algorithm is quiet.",
  },
  {
    question: "Why does volatility matter to trade businesses?",
    answer:
      "If your phone has gone quiet, the first question is: did MY ranking drop, or is the whole local pack shifting? A high-volatility day means Google rolled out an update — don't panic about a single day's drop. A low-volatility day with a phone-call drop means something specific to YOUR profile changed.",
  },
  {
    question: "Where does the data come from?",
    answer:
      "Moz's public MozCast page (https://moz.com/mozcast) — the de-facto industry standard for Google algorithm volatility, refreshed daily. We cache it for up to 24 hours to be a good neighbour, and re-render bands locally so the colour rubric matches the rest of WeFixTrades. If MozCast is briefly unreachable, we fall back to the official Semrush Sensor widget so the page is never blank.",
  },
  {
    question: "Is there an email alert?",
    answer:
      "Yes. Subscribe below — pick daily digest, weekly digest, urgent-only, or any combination. Urgent fires whenever MozCast is HIGH (≥ 8.0). No password, no email gate to view the score itself.",
  },
  {
    question: "Does MapGuard use this data?",
    answer:
      "Yes. The same volatility signal triggers per-customer rank re-checks inside MapGuard — when MozCast spikes, we re-scan that customer's keywords so they know within hours whether THEIR ranks moved.",
  },
];

interface RankfluxDay {
  date: string;
  score: number;
  scorePct: number;
  band: "LOW" | "MEDIUM" | "HIGH";
}

type RankfluxSource = "mozcast" | "semrush-embed" | "cached" | "unavailable";

interface RankfluxResponse {
  source: RankfluxSource;
  sourceUrl: string;
  /** Present only when source === "semrush-embed". */
  embedUrl?: string;
  /** Nullable when source === "semrush-embed" or "unavailable". */
  todayScore: number | null;
  todayBand: RankfluxDay["band"] | null;
  todayDate: string | null;
  last7d: RankfluxDay[];
  updatedAt: string;
}

/**
 * Data-vis bands — fixed semantic palette akin to traffic lights. These
 * are the only hardcoded hex tokens on this page and they encode meaning
 * with no semantic-token equivalent (gauge / chart bands).
 */
const SCORE_BAND_COLORS = {
  LOW: "#22C55E",
  MEDIUM: "#F59E0B",
  HIGH: "#EF4444",
} as const;

function colorForScore10(score10: number): string {
  if (score10 >= 8) return SCORE_BAND_COLORS.HIGH;
  if (score10 >= 6) return "#F97316";
  if (score10 >= 3) return SCORE_BAND_COLORS.MEDIUM;
  return SCORE_BAND_COLORS.LOW;
}

export default function LocalRankflux() {
  const [data, setData] = useState<RankfluxResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(null);

  const faqSchemaItems = useMemo(() => FAQ_ITEMS.map((f) => ({ question: f.question, answer: f.answer })), []);
  useFaqSchema(faqSchemaItems);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tools/local-rankflux")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d?.ok) throw new Error(d?.error || "Failed to load.");
        setData(d as RankfluxResponse);
      })
      .catch((err) => { if (!cancelled) setError(err?.message || "Failed to load."); });
    return () => { cancelled = true; };
  }, []);

  const selectedDay = data && selectedDayIdx != null ? data.last7d[selectedDayIdx] : null;
  const hasGaugeData =
    data &&
    (data.source === "mozcast" || data.source === "cached") &&
    typeof data.todayScore === "number" &&
    data.todayBand &&
    data.todayDate;

  const form = (
    <div>
      {/* Section A — gauge / fallback. */}
      <div style={{ textAlign: "center", padding: "10px 0 4px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(0,0,0,0.55)", marginBottom: 4 }}>
          Today's Google Local Volatility
        </div>
        {!data && !error && (
          <div style={{ fontSize: 14, color: "rgba(0,0,0,0.5)", padding: "32px 0" }}>
            <Loader2 size={16} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 6 }} className="animate-spin" />
            Loading MozCast…
          </div>
        )}
        {error && (
          <div style={{ fontSize: 14, color: "rgb(185,28,28)", padding: "16px 0" }}>{error}</div>
        )}
        {data && hasGaugeData && (
          <>
            <VolatilityGauge score10={data.todayScore as number} />
            <div style={{ fontSize: 13, color: "rgba(0,0,0,0.5)", marginTop: 6 }}>
              {new Date(data.todayDate as string).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
              {" · "}
              <a href={data.sourceUrl} target="_blank" rel="noreferrer noopener" style={{ color: "rgba(0,0,0,0.55)", textDecoration: "underline" }}>
                source: MozCast <ExternalLink size={12} style={{ display: "inline-block", verticalAlign: "middle" }} />
              </a>
              {data.source === "cached" && (
                <span style={{ marginLeft: 8, fontSize: 11, color: "rgba(0,0,0,0.45)" }} data-testid="rankflux-cached-pill">
                  · cached
                </span>
              )}
            </div>
          </>
        )}
        {data && data.source === "semrush-embed" && (
          <SemrushSensorEmbed embedUrl={data.embedUrl || "https://www.semrush.com/sensor/widget/?country=US&category=overall"} />
        )}
        {data && data.source === "unavailable" && (
          <div
            data-testid="rankflux-unavailable-pill"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: 999,
              background: "rgba(0,0,0,0.04)",
              border: "1px solid rgba(0,0,0,0.1)",
              color: "rgba(0,0,0,0.6)",
              fontSize: 13,
              margin: "24px 0",
            }}
          >
            Data temporarily unavailable — checking again in 1 hour.
          </div>
        )}
      </div>

      {/* Section B — 7-day bar chart (only when we have day-by-day data). */}
      {data?.last7d && data.last7d.length > 0 && (data.source === "mozcast" || data.source === "cached") && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(0,0,0,0.55)", marginBottom: 8, textAlign: "center" }}>
            Past 7 days · click a bar for detail
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 6, height: 130, padding: "0 8px" }}>
            {data.last7d.map((d, i) => {
              const isToday = i === data.last7d.length - 1;
              const isSelected = selectedDayIdx === i;
              const heightPct = Math.max(8, Math.min(100, d.scorePct));
              const bandColor = colorForScore10(d.score);
              const dt = new Date(d.date);
              const dayOfWeek = dt.toLocaleDateString(undefined, { weekday: "short" });
              const dayOfMonth = dt.getUTCDate();
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setSelectedDayIdx(isSelected ? null : i)}
                  data-testid={`rankflux-bar-${i}`}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                  title={`${d.date}: ${d.score.toFixed(1)} / 10 — ${d.band}`}
                >
                  <div style={{ fontSize: 11, color: isToday ? "rgb(17,24,39)" : "rgba(0,0,0,0.55)", fontWeight: isToday ? 700 : 600 }}>
                    {d.score.toFixed(1)}
                  </div>
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                    <div
                      style={{
                        width: "70%",
                        height: `${heightPct}%`,
                        background: bandColor,
                        borderRadius: 6,
                        // Today gets a darker (less-translucent) bar; selected gets a 2px outline.
                        opacity: isToday ? 1 : 0.75,
                        // DESIGN-SYSTEM: selected = outline NOT fill change.
                        boxShadow: isSelected ? "0 0 0 2px rgb(13,60,252)" : "none",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(0,0,0,0.55)", fontWeight: 600 }}>{dayOfWeek}</div>
                  <div style={{ fontSize: 10, color: "rgba(0,0,0,0.4)" }}>{dayOfMonth}</div>
                </button>
              );
            })}
          </div>
          {selectedDay && (
            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(13,60,252,0.05)",
                border: "1px solid rgba(13,60,252,0.16)",
                fontSize: 13,
                color: "rgb(17,24,39)",
                lineHeight: 1.5,
              }}
              data-testid="rankflux-selected-day"
            >
              <strong>{new Date(selectedDay.date).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric" })}</strong>
              {" — "}
              MozCast {selectedDay.score.toFixed(1)}/10 ({selectedDay.band}).{" "}
              {selectedDay.band === "HIGH"
                ? "Likely a Google update — wait before changing your profile."
                : selectedDay.band === "MEDIUM"
                ? "Normal day-to-day churn — investigate only persistent drops."
                : "Algorithm quiet — any drop is likely YOUR business specifically."}
            </div>
          )}
        </div>
      )}

      {/* Section C — subscribe form. */}
      <RankfluxSubscribeForm />
    </div>
  );

  return (
    <MarketingLayout>
      <PageMeta
        title="Local Rankflux — Google Local Algorithm Volatility Tracker"
        description="Track Google's local search algorithm volatility day-by-day via the MozCast index. See whether yesterday's ranking shuffle was algorithm-wide chaos or a quiet day — and subscribe to alerts."
        canonical={TOOL_PATH}
        keywords={["google local algorithm tracker", "local seo volatility", "rankflux", "mozcast mirror", "google algorithm update tracker"]}
      />
      <FreeToolLayout
        eyebrow="Free Tool"
        title="Local Rankflux"
        subtitle="A daily index of how much Google's local search algorithm is shuffling rankings — so you know whether your ranking drop is you, or everyone."
        path={TOOL_PATH}
        breadcrumbLabel="Local Rankflux"
        heroImageSrc="/ai-thumbnails/tools/local-rankflux-hero.png"
        heroImageAlt="Semicircular gauge dial showing local search volatility"
        form={form}
      >
        {/* Borrowed-credibility band — per Alex Q3, NO fake testimonials,
            NO fake customer counts, NO fake star ratings. Tech-stack
            quality + transparency + product integration only. */}
        <BorrowedCredibilityBand />

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)", marginTop: 0 }}>What Local Rankflux measures</h2>
        <p>
          Google's local search algorithm doesn't sit still. Some weeks it's
          quiet — businesses' positions are essentially fixed. Other weeks
          Google rolls out an update (named or unnamed) and local-pack
          rankings shuffle dramatically. Local Rankflux mirrors Moz's
          industry-standard MozCast index so you can see the shuffle at a
          glance, on a 0–10 scale banded into LOW / MEDIUM / HIGH.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>Why you care</h2>
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

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>How to read the bands</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>LOW (0-3)</strong>: Algorithm is quiet. If your ranking dropped, look at your own profile / competitors.</li>
          <li><strong>MEDIUM (3-6)</strong>: Normal day-to-day churn. Some movement, nothing to panic about.</li>
          <li><strong>HIGH (6-10)</strong>: Likely a Google update in progress. Hold steady — wait 3-7 days for things to settle before changing your profile.</li>
        </ul>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>Want to track YOUR rankings?</h2>
        <p>
          Local Rankflux measures the algorithm. To measure your own
          rankings — and have the MozCast signal automatically trigger a
          re-check of your keywords — run <a href="/products/mapguard" style={{ color: "rgb(13,60,252)", textDecoration: "underline" }}>MapGuard</a>.
          The same volatility data on this page feeds MapGuard's per-customer
          recheck scheduler.
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

/* ─── Gauge ────────────────────────────────────────────────────────── */

/**
 * Semicircular SVG gauge — needle at MozCast score (0..10). Bands
 * green/yellow/orange/red mirror the bar-chart palette. SVG keeps the
 * bundle lean (no extra dep) and renders crisply at any size.
 */
function VolatilityGauge({ score10 }: { score10: number }) {
  // SVG canvas: 240x140, semicircle centered at (120, 130), radius 100.
  // The needle starts pointing at -180° (left) and rotates clockwise to
  // 0° (right). MozCast score 0..10 → angle -180..0.
  const safeScore = Math.max(0, Math.min(10, score10));
  const angleDeg = -180 + (safeScore / 10) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  const needleLength = 86;
  const needleX = 120 + needleLength * Math.cos(angleRad);
  const needleY = 130 + needleLength * Math.sin(angleRad);
  const color = colorForScore10(safeScore);
  const band = safeScore >= 8 ? "HIGH" : safeScore >= 3 ? "MEDIUM" : "LOW";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }} data-testid="rankflux-gauge">
      <svg viewBox="0 0 240 150" width="220" height="138" aria-label={`Volatility gauge ${safeScore.toFixed(1)} of 10`} role="img">
        {/* Band arcs — paint each band as a thick stroked arc, segmented
            green / yellow / orange / red across the 0..180° half-circle. */}
        <GaugeArc startScore={0} endScore={3} color={SCORE_BAND_COLORS.LOW} />
        <GaugeArc startScore={3} endScore={6} color={SCORE_BAND_COLORS.MEDIUM} />
        <GaugeArc startScore={6} endScore={8} color="#F97316" />
        <GaugeArc startScore={8} endScore={10} color={SCORE_BAND_COLORS.HIGH} />

        {/* Tick labels at 0, 3, 6, 8, 10. */}
        {[0, 3, 6, 8, 10].map((v) => {
          const a = (-180 + (v / 10) * 180) * (Math.PI / 180);
          const x = 120 + 110 * Math.cos(a);
          const y = 130 + 110 * Math.sin(a);
          return (
            <text key={v} x={x} y={y} fontSize="10" textAnchor="middle" fill="rgba(0,0,0,0.5)">{v}</text>
          );
        })}

        {/* Needle. */}
        <line x1="120" y1="130" x2={needleX} y2={needleY} stroke="rgb(17,24,39)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="120" cy="130" r="7" fill="rgb(17,24,39)" />
      </svg>
      <div style={{ marginTop: -6, display: "flex", alignItems: "baseline", gap: 8 }}>
        <Activity size={20} color={color} />
        <span data-testid="text-rankflux-score" style={{ fontSize: 36, fontWeight: 900, color, letterSpacing: "-0.02em" }}>
          {safeScore.toFixed(1)}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(0,0,0,0.55)" }}>/ 10</span>
        <span data-testid="text-rankflux-band" style={{ fontSize: 14, fontWeight: 700, color }}>{band}</span>
      </div>
    </div>
  );
}

/* ─── Semrush Sensor fallback embed ────────────────────────────────── */

/**
 * Wave 17 fallback: when the MozCast scrape has been failing for >24h
 * and our cache is stale, we render the official Semrush Sensor widget
 * inline. No paid API, no scrape — just an iframe to Semrush's own
 * public embed. Wrapped in our card styling so it doesn't look pasted.
 */
function SemrushSensorEmbed({ embedUrl }: { embedUrl: string }) {
  return (
    <div
      data-testid="rankflux-semrush-embed"
      style={{
        position: "relative",
        marginTop: 8,
        padding: 12,
        borderRadius: 14,
        background: "rgb(255,255,255)",
        border: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 12,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "rgba(0,0,0,0.55)",
        }}
      >
        Live source · Semrush Sensor
      </div>
      <div style={{ paddingTop: 22 }}>
        <iframe
          title="Semrush Sensor — Google volatility (US, overall)"
          src={embedUrl}
          width="100%"
          height="260"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          style={{ border: "none", borderRadius: 10, background: "rgb(255,255,255)" }}
        />
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: "rgba(0,0,0,0.5)", textAlign: "center" }}>
        MozCast is briefly unreachable — showing Semrush's Sensor signal instead.
      </div>
    </div>
  );
}

function GaugeArc({ startScore, endScore, color }: { startScore: number; endScore: number; color: string }) {
  const a0 = (-180 + (startScore / 10) * 180) * (Math.PI / 180);
  const a1 = (-180 + (endScore / 10) * 180) * (Math.PI / 180);
  const r = 92;
  const x0 = 120 + r * Math.cos(a0);
  const y0 = 130 + r * Math.sin(a0);
  const x1 = 120 + r * Math.cos(a1);
  const y1 = 130 + r * Math.sin(a1);
  const largeArc = endScore - startScore > 5 ? 1 : 0;
  return (
    <path
      d={`M ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1}`}
      stroke={color}
      strokeWidth="14"
      fill="none"
      strokeLinecap="butt"
    />
  );
}

/* ─── Subscribe form ───────────────────────────────────────────────── */

function RankfluxSubscribeForm() {
  const [email, setEmail] = useState("");
  const [daily, setDaily] = useState(false);
  const [weekly, setWeekly] = useState(true);
  const [urgent, setUrgent] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }
    if (!daily && !weekly && !urgent) {
      setError("Pick at least one alert cadence.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/tools/rankflux-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, daily, weekly, urgent }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Subscribe failed.");
      setDone(true);
    } catch (err: any) {
      setError(err?.message || "Subscribe failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div
        data-testid="rankflux-subscribe-done"
        style={{
          marginTop: 18,
          padding: "14px 16px",
          borderRadius: 14,
          background: "rgba(34,197,94,0.06)",
          border: "1px solid rgba(34,197,94,0.32)",
          color: "rgb(22,101,52)",
          fontSize: 14,
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          You're in. We'll send a confirmation to <strong>{email}</strong> shortly.
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 18 }} data-testid="rankflux-subscribe-form">
      <FreeToolFormFieldStyles />
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(0,0,0,0.55)", marginBottom: 6 }}>
        Get email alerts
      </div>
      <FreeToolFormField
        id="rankflux-email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        required
        autoComplete="email"
        placeholder="you@yourtrade.com"
        testId="input-rankflux-email"
        helpText="We'll only use this for the alert cadences you pick. One-click unsubscribe in every email."
      />
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, marginBottom: 8 }}>
        <CadenceCheckbox label="Daily digest" checked={daily} onChange={setDaily} testId="checkbox-rankflux-daily" />
        <CadenceCheckbox label="Weekly digest" checked={weekly} onChange={setWeekly} testId="checkbox-rankflux-weekly" />
        <CadenceCheckbox label="Urgent only (HIGH band)" checked={urgent} onChange={setUrgent} testId="checkbox-rankflux-urgent" />
      </div>
      <button
        type="submit"
        disabled={loading}
        data-testid="button-rankflux-subscribe"
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: 12,
          background: loading ? "rgba(13,60,252,0.6)" : "rgb(13,60,252)",
          color: "rgb(255,255,255)",
          fontSize: 14,
          fontWeight: 700,
          border: "none",
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Subscribing…" : "Subscribe to alerts"}
      </button>
      {error && (
        <div style={{ marginTop: 6, color: "rgb(185,28,28)", fontSize: 13 }}>{error}</div>
      )}
    </form>
  );
}

function CadenceCheckbox({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        color: "rgb(17,24,39)",
        cursor: "pointer",
        padding: "6px 10px",
        borderRadius: 8,
        border: checked ? "2px solid rgb(13,60,252)" : "1px solid rgba(0,0,0,0.12)",
        background: checked ? "rgba(13,60,252,0.04)" : "rgb(255,255,255)",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
        style={{ accentColor: "rgb(13,60,252)" }}
      />
      {label}
    </label>
  );
}

/* ─── Borrowed-credibility band ────────────────────────────────────── */

function BorrowedCredibilityBand() {
  const cards = [
    {
      title: "Why we built this",
      body: "MozCast is the industry-standard volatility index (Moz tracks ~10,000 SERPs daily). We mirror it so you don't need a Moz login — and so we can re-render the bands in the same palette as the rest of WeFixTrades.",
      cta: { label: "View MozCast source", href: "https://moz.com/mozcast", external: true },
    },
    {
      title: "Free forever",
      body: "No email gate to view the score. The subscribe form below is purely for alerts. Your email is stored only against the cadences you pick — unsubscribe wipes it.",
    },
    {
      title: "Built into MapGuard",
      body: "The same volatility data triggers per-customer rank-recheck inside MapGuard. When MozCast spikes, MapGuard re-scans your keywords so you know within hours whether YOUR ranks moved.",
      cta: { label: "See MapGuard", href: "/products/mapguard" },
    },
  ];
  return (
    <section
      data-testid="rankflux-credibility-band"
      style={{
        margin: "16px 0 28px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
      }}
    >
      {cards.map((c) => (
        <div
          key={c.title}
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.08)",
            background: "rgb(255,255,255)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgb(13,60,252)" }}>
            <ShieldCheck size={12} /> {c.title}
          </div>
          <div style={{ fontSize: 13, color: "rgba(0,0,0,0.7)", lineHeight: 1.55 }}>{c.body}</div>
          {c.cta && (
            <a
              href={c.cta.href}
              target={c.cta.external ? "_blank" : undefined}
              rel={c.cta.external ? "noreferrer noopener" : undefined}
              style={{
                marginTop: 4,
                fontSize: 12,
                fontWeight: 600,
                color: "rgb(13,60,252)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {c.cta.label}
              {c.cta.external && <ExternalLink size={12} />}
            </a>
          )}
        </div>
      ))}
    </section>
  );
}
