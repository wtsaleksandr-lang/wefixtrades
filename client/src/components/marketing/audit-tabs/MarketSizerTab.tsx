/**
 * MarketSizerTab — Free-Audit tab #4: Service-area market sizing.
 * Backend: GET /api/audit/market-sizer.
 *
 * Shows 4 stat cards (households / median income / 5-mi competitors /
 * 25-mi competitors) and a small competitor-density bar chart at the
 * 5 / 10 / 25 mile radii. Gracefully degrades when Census data isn't
 * available (non-US businesses).
 */

import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Home, DollarSign, Users, MapPin, BarChart3 } from "lucide-react";
import AuditTabFrame, { staggerDelay } from "./AuditTabFrame";
import AuditTabHelpModal from "./AuditTabHelpModal";

interface MarketResponse {
  ok: boolean;
  households: number | null;
  medianIncome: number | null;
  competitors: { r5: number; r10: number; r25: number };
  insight: string;
  region: { country: string | null; state: string | null; county: string | null; isUs: boolean };
  unavailable?: boolean;
  reason?: string;
}

const INK = "#0d1514";
const GREY = "#6B7280";
const BRAND_PRIMARY = "#0d3cfc";

function CountUp({ value }: { value: number | null | undefined }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (value == null) return;
    const prefersReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const dur = 800;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(value * ease));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  if (value == null) return <span>—</span>;
  return <span>{shown.toLocaleString()}</span>;
}

function StatCard({
  icon,
  label,
  value,
  prefix = "",
  suffix = "",
  index,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  prefix?: string;
  suffix?: string;
  index: number;
}) {
  const [hovered, setHovered] = useState(false);
  const delay = staggerDelay(index, 750, 50);
  return (
    <div
      data-theme="light"
      className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "16px 18px",
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: 14,
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hovered ? "0 6px 14px rgba(0,0,0,0.06)" : "0 1px 2px rgba(0,0,0,0.04)",
        transition: "transform 180ms ease, box-shadow 180ms ease",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        animationDelay: `${delay}ms`,
        animationDuration: "400ms",
        animationFillMode: "backwards",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: "rgba(13,60,252,0.08)",
          color: BRAND_PRIMARY,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </div>
      <div style={{ fontSize: 11, color: GREY, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: INK, lineHeight: 1.1 }}>
        {value == null ? "—" : (
          <>
            {prefix}
            <CountUp value={value} />
            {suffix}
          </>
        )}
      </div>
    </div>
  );
}

export interface MarketSizerTabProps {
  reportId?: string | null;
}

export default function MarketSizerTab({ reportId }: MarketSizerTabProps) {
  const [state, setState] = useState<"loading" | "ready" | "error" | "empty">("loading");
  const [data, setData] = useState<MarketResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!reportId) {
      setState("error");
      setErrorMsg("This tool needs a saved report.");
      return;
    }
    const cacheKey = `market-sizer:${reportId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setData(parsed);
        setState(parsed.unavailable ? "empty" : "ready");
        return;
      }
    } catch { /* noop */ }

    let cancelled = false;
    fetch(`/api/audit/market-sizer?reportId=${encodeURIComponent(reportId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: MarketResponse) => {
        if (cancelled) return;
        if (!json.ok) throw new Error("API error");
        setData(json);
        setState(json.unavailable ? "empty" : "ready");
        try { sessionStorage.setItem(cacheKey, JSON.stringify(json)); } catch { /* noop */ }
      })
      .catch((e) => {
        if (cancelled) return;
        setErrorMsg(e?.message || "Failed to load market data.");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return [
      { radius: "5 mi", competitors: data.competitors.r5 },
      { radius: "10 mi", competitors: data.competitors.r10 },
      { radius: "25 mi", competitors: data.competitors.r25 },
    ];
  }, [data]);

  const helpSections = useMemo(
    () => [
      {
        icon: <Home size={20} />,
        title: "What this is",
        body: "A snapshot of your local market: how many households are in your service area, what they earn, and how many competing trade businesses you're up against at 5, 10, and 25 miles.",
      },
      {
        icon: <Users size={20} />,
        title: "How to read it",
        body: "Households + median income come from US Census ACS data (free, public). Competitor counts come from Google Places — businesses showing up for searches like 'plumber near me' in your area.",
      },
      {
        icon: <BarChart3 size={20} />,
        title: "Why it matters",
        body: "A 5,000-household market with 15 competitors is very different from a 50,000-household market with 3 competitors. Sizing the opportunity tells you whether to compete on price, niche, or geography.",
      },
      {
        icon: <MapPin size={20} />,
        title: "How to improve it",
        body: "You can't change the market — but you can make sure you rank above the competition that's there. MapGuard tracks your rank for every keyword in every neighbourhood and closes gaps fast.",
      },
    ],
    [],
  );

  return (
    <AuditTabFrame
      testid="audit-tab-market-sizer"
      title="Service-Area Market Sizer"
      insight={data?.insight || null}
      state={state}
      errorMessage={errorMsg || data?.reason}
      helpTrigger={
        <AuditTabHelpModal
          testid="audit-market-help"
          triggerLabel="What is the Market Sizer?"
          title="Understanding your market"
          sections={helpSections}
          cta={{ label: "Get MapGuard", href: "/products/mapguard?utm_source=audit&utm_medium=help-modal&utm_campaign=market-sizer" }}
        />
      }
      cta={
        data && data.competitors.r5 > 0
          ? {
              eyebrow: `Rank above all ${data.competitors.r5} nearby competitors`,
              pitch: "MapGuard runs a weekly rank-grid across your service area and tracks every move competitors make.",
              label: "Get MapGuard",
              href: "/products/mapguard?utm_source=audit&utm_medium=tab-cta&utm_campaign=market-sizer",
            }
          : undefined
      }
    >
      {data && (
        <>
          {/* Stat cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <StatCard
              index={0}
              icon={<Home size={16} />}
              label="Households"
              value={data.households}
            />
            <StatCard
              index={1}
              icon={<DollarSign size={16} />}
              label="Median income"
              value={data.medianIncome}
              prefix="$"
            />
            <StatCard
              index={2}
              icon={<Users size={16} />}
              label="Competitors (5 mi)"
              value={data.competitors.r5}
            />
            <StatCard
              index={3}
              icon={<MapPin size={16} />}
              label="Competitors (25 mi)"
              value={data.competitors.r25}
            />
          </div>

          {/* Competitor-density chart */}
          <div
            data-theme="light"
            data-testid="audit-market-chart"
            style={{
              padding: "14px 14px 6px",
              background: "#fff",
              border: "1px solid #E5E7EB",
              borderRadius: 14,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: GREY, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>
              Competitor density by radius
            </div>
            <div style={{ width: "100%", height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="radius" tick={{ fontSize: 12, fill: GREY }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: GREY }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(13,60,252,0.05)" }}
                    contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12 }}
                  />
                  <Bar dataKey="competitors" fill={BRAND_PRIMARY} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {!data.region.isUs && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "#FEF9C3",
                border: "1px solid #FDE68A",
                borderRadius: 10,
                fontSize: 12,
                color: "#854D0E",
                lineHeight: 1.5,
              }}
            >
              Demographics are US-only right now (Census data). Competitor counts work everywhere.
            </div>
          )}
        </>
      )}
    </AuditTabFrame>
  );
}
