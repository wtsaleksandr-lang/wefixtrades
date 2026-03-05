import { useEffect, useMemo, useRef, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { colors } from "@/theme/tokens";
import { Search, CheckCircle2 } from "lucide-react";
import reportStyles from "./FreeAuditReport.module.css";

type Prediction = { placeId: string; name: string; formattedAddress: string };
type Business = {
  placeId: string;
  name: string;
  formattedAddress: string;
  rating: number | null;
  reviewsCount: number;
  website: string;
  phone: string;
  hours: string[];
  photos: string[];
};
type SpeedData = {
  mobile: { score: number | null; fcp?: number | null; lcp?: number | null; tbt?: number | null; cls?: number | null };
  desktop: { score: number | null; fcp?: number | null; lcp?: number | null; tbt?: number | null; cls?: number | null };
};
type Issue = {
  title: string;
  severity: "High" | "Medium";
  impact: string;
  fix: string;
};
type ReportJson = {
  business: {
    name: string;
    address: string;
    rating: number | null;
    reviewsCount: number;
    website: string;
    phone: string;
  };
  scores: {
    localVisibility: number;
    websiteSpeedMobile: number | null;
    websiteSpeedDesktop: number | null;
  };
  issues: Issue[];
  quickWins: string[];
  actionPlan: { next7Days: string[]; next30Days: string[] };
  recommendedServices: { name: string; why: string; cta: string }[];
};

async function postJSON<T>(url: string, body: any): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.ok === false)
    throw new Error(data?.error || `Request failed: ${r.status}`);
  return data as T;
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return v;
}

type ImpactLevel = "high" | "medium" | "low";
type MetricStatus = "good" | "needs" | "critical";

function impactToLevel(impact: any): ImpactLevel {
  const s = String(impact ?? "").toLowerCase();
  if (s.includes("high") || s.includes("critical")) return "high";
  if (s.includes("med") || s.includes("warn")) return "medium";
  if (s.includes("low") || s.includes("minor")) return "low";
  return "medium";
}

function fmtMs(v: any): string {
  const n = Number(v);
  if (Number.isNaN(n)) return String(v ?? "--");
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`;
  return `${Math.round(n)}ms`;
}

function fmtSec(v: any): string {
  const n = Number(v);
  if (Number.isNaN(n)) return String(v ?? "--");
  if (n < 1) return `${Math.round(n * 1000)}ms`;
  return `${n.toFixed(2)}s`;
}

function metricStatus(name: "FCP" | "LCP" | "TBT" | "CLS", raw: any): MetricStatus {
  const v = Number(raw);
  if (Number.isNaN(v)) return "needs";
  if (name === "FCP") return v <= 1.8 ? "good" : v <= 3.0 ? "needs" : "critical";
  if (name === "LCP") return v <= 2.5 ? "good" : v <= 4.0 ? "needs" : "critical";
  if (name === "TBT") return v <= 200 ? "good" : v <= 600 ? "needs" : "critical";
  return v <= 0.1 ? "good" : v <= 0.25 ? "needs" : "critical";
}

function statusLabel(s: MetricStatus): string {
  return s === "good" ? "Good" : s === "needs" ? "Needs work" : "Critical";
}

function StatusChip({ status }: { status: MetricStatus }) {
  const cls =
    status === "good"
      ? `${reportStyles.statusChip} ${reportStyles.good}`
      : status === "needs"
      ? `${reportStyles.statusChip} ${reportStyles.needs}`
      : `${reportStyles.statusChip} ${reportStyles.critical}`;
  return <span className={cls}>{statusLabel(status)}</span>;
}

function RIcon({ kind }: { kind: "star" | "pin" | "phone" | "globe" | "clock" | "info" | "mobile" | "desktop" | "issue" }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" as const };
  if (kind === "star")
    return (<svg {...common}><path d="M12 17.3l-5.4 3 1-6.1-4.4-4.3 6.1-.9L12 3.5l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-3z" stroke="currentColor" strokeWidth="1.6" /></svg>);
  if (kind === "pin")
    return (<svg {...common}><path d="M12 21s7-4.4 7-11a7 7 0 10-14 0c0 6.6 7 11 7 11z" stroke="currentColor" strokeWidth="1.6" /><path d="M12 10.2a2.2 2.2 0 100-4.4 2.2 2.2 0 000 4.4z" stroke="currentColor" strokeWidth="1.6" /></svg>);
  if (kind === "phone")
    return (<svg {...common}><path d="M7 3h3l2 5-2 1c1 3 3 5 6 6l1-2 5 2v3c0 1-1 2-2 2C10 20 4 14 4 6c0-1 1-3 3-3z" stroke="currentColor" strokeWidth="1.6" /></svg>);
  if (kind === "globe")
    return (<svg {...common}><path d="M12 22a10 10 0 100-20 10 10 0 000 20z" stroke="currentColor" strokeWidth="1.6" /><path d="M2 12h20" stroke="currentColor" strokeWidth="1.6" /><path d="M12 2c3 3 3 17 0 20" stroke="currentColor" strokeWidth="1.6" /></svg>);
  if (kind === "clock")
    return (<svg {...common}><path d="M12 22a10 10 0 100-20 10 10 0 000 20z" stroke="currentColor" strokeWidth="1.6" /><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>);
  if (kind === "info")
    return (<svg {...common}><path d="M12 22a10 10 0 100-20 10 10 0 000 20z" stroke="currentColor" strokeWidth="1.6" /><path d="M12 10v7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M12 7.2h.01" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>);
  if (kind === "mobile")
    return (<svg {...common}><path d="M8 2h8a2 2 0 012 2v16a2 2 0 01-2 2H8a2 2 0 01-2-2V4a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.6" /><path d="M11 19h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>);
  if (kind === "desktop")
    return (<svg {...common}><path d="M4 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" stroke="currentColor" strokeWidth="1.6" /><path d="M9 21h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M12 17v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>);
  return (<svg {...common}><path d="M6 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M12 6v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>);
}

function ReportView(props: {
  business: any;
  mapsIssues: any[];
  speed: any;
  onFixClick?: () => void;
  onEmailClick?: () => void;
}) {
  const { business, mapsIssues, speed, onFixClick, onEmailClick } = props;
  const [activeTab, setActiveTab] = useState<"maps" | "speed">("maps");

  const photos: string[] = Array.isArray(business?.photos) ? business.photos : [];
  const name = business?.name ?? "Business";
  const rating = business?.rating;
  const reviews = business?.reviewsCount ?? business?.reviews;
  const address = business?.formattedAddress ?? business?.address;
  const phone = business?.phone;
  const website = business?.website;
  const hours = business?.hours;

  const mobile = speed?.mobile ?? {};
  const desktop = speed?.desktop ?? {};

  function PerfBlock({ label, kind, score, data, tone }: { label: string; kind: "mobile" | "desktop"; score: any; data: any; tone: "red" | "amber" }) {
    const cardCls =
      tone === "red"
        ? `${reportStyles.perfCard} ${reportStyles.perfRed}`
        : `${reportStyles.perfCard} ${reportStyles.perfAmber}`;
    const scoreNumCls = tone === "red" ? reportStyles.scoreNumRed : reportStyles.scoreNumAmber;

    const fcp = data?.fcp ?? data?.FCP;
    const lcp = data?.lcp ?? data?.LCP;
    const tbt = data?.tbt ?? data?.TBT;
    const clsVal = data?.cls ?? data?.CLS;

    return (
      <div className={cardCls}>
        <div className={reportStyles.perfHeader}>
          <div className={reportStyles.perfLabel}>
            <span className={reportStyles.perfLabelIcon}><RIcon kind={kind} /></span>
            {label}
          </div>
        </div>
        <div className={reportStyles.scoreBlock}>
          <div className={reportStyles.scoreCaption}>Performance Score</div>
          <div className={reportStyles.scoreRow}>
            <div className={scoreNumCls}>{Number.isFinite(Number(score)) ? Math.round(Number(score)) : "--"}</div>
            <div className={reportStyles.scoreDen}>/100</div>
          </div>
        </div>
        <div className={reportStyles.metricList}>
          <div className={reportStyles.metricRow}>
            <div>
              <div className={reportStyles.metricName}>First Contentful Paint (FCP)</div>
              <div className={reportStyles.metricVal}>{fmtSec(fcp)}</div>
              <div className={reportStyles.metricDesc}>How fast the first text or image appears.</div>
            </div>
            <StatusChip status={metricStatus("FCP", fcp)} />
          </div>
          <div className={reportStyles.metricRow}>
            <div>
              <div className={reportStyles.metricName}>Largest Contentful Paint (LCP)</div>
              <div className={reportStyles.metricVal}>{fmtSec(lcp)}</div>
              <div className={reportStyles.metricDesc}>How fast the main content loads for visitors.</div>
            </div>
            <StatusChip status={metricStatus("LCP", lcp)} />
          </div>
          <div className={reportStyles.metricRow}>
            <div>
              <div className={reportStyles.metricName}>Total Blocking Time (TBT)</div>
              <div className={reportStyles.metricVal}>{fmtMs(tbt)}</div>
              <div className={reportStyles.metricDesc}>How long the page is unresponsive during loading.</div>
            </div>
            <StatusChip status={metricStatus("TBT", tbt)} />
          </div>
          <div className={reportStyles.metricRow}>
            <div>
              <div className={reportStyles.metricName}>Cumulative Layout Shift (CLS)</div>
              <div className={reportStyles.metricVal}>{Number.isFinite(Number(clsVal)) ? String(clsVal) : "--"}</div>
              <div className={reportStyles.metricDesc}>How stable the layout is (lower is better).</div>
            </div>
            <StatusChip status={metricStatus("CLS", clsVal)} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={reportStyles.page}>
      <div className={reportStyles.container}>
        <div className={reportStyles.stack}>
          <div className={`${reportStyles.card} ${reportStyles.cardPad}`}>
            <div className={reportStyles.row}>
              <div className={reportStyles.col}>
                <div className={reportStyles.h3}>{name}</div>
                <div className={`${reportStyles.body} ${reportStyles.muted}`}>Your Google Maps Profile</div>
              </div>
            </div>
            <div className={reportStyles.kvList}>
              {(rating != null || reviews != null) && (
                <div className={reportStyles.kvRow}>
                  <span className={reportStyles.kvIcon}><RIcon kind="star" /></span>
                  <span><b>{rating ?? "--"}</b></span>
                  <span className={reportStyles.muted}>{reviews != null ? `${reviews} reviews` : ""}</span>
                </div>
              )}
              {address && (
                <div className={reportStyles.kvRow}>
                  <span className={reportStyles.kvIcon}><RIcon kind="pin" /></span>
                  <span className={reportStyles.body}>{address}</span>
                </div>
              )}
              {phone && (
                <div className={reportStyles.kvRow}>
                  <span className={reportStyles.kvIcon}><RIcon kind="phone" /></span>
                  <span className={reportStyles.body}>{phone}</span>
                </div>
              )}
              {website && (
                <div className={reportStyles.kvRow}>
                  <span className={reportStyles.kvIcon}><RIcon kind="globe" /></span>
                  <a className={reportStyles.body} href={website} target="_blank" rel="noreferrer" data-testid="link-report-website">{String(website).replace(/^https?:\/\//, "")}</a>
                </div>
              )}
              {hours && Array.isArray(hours) && hours.length > 0 && (
                <div className={reportStyles.kvRow}>
                  <span className={reportStyles.kvIcon}><RIcon kind="clock" /></span>
                  <span className={reportStyles.body}>Opening Hours</span>
                </div>
              )}
            </div>
            {photos.length > 0 && (
              <div className={reportStyles.photos}>
                {photos.slice(0, 4).map((src, i) => (
                  <img key={i} className={reportStyles.photo} src={src} alt="" data-testid={`img-report-photo-${i}`} />
                ))}
              </div>
            )}
          </div>

          <div className={reportStyles.tabsWrap}>
            <button
              type="button"
              data-testid="button-tab-maps"
              className={`${reportStyles.tabBtn} ${activeTab === "maps" ? reportStyles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("maps")}
            >
              Google Maps Audit
            </button>
            <button
              type="button"
              data-testid="button-tab-speed"
              className={`${reportStyles.tabBtn} ${activeTab === "speed" ? reportStyles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("speed")}
            >
              Website SEO &amp; Speed
            </button>
          </div>

          {activeTab === "maps" && (
            <div className={reportStyles.stack}>
              <div className={reportStyles.sectionTitle}>Visibility Opportunities Detected</div>
              <div className={reportStyles.issueList}>
                {(mapsIssues ?? []).map((it, idx) => {
                  const level = impactToLevel(it?.severity ?? it?.impact);
                  const cls =
                    level === "high"
                      ? `${reportStyles.issueCard} ${reportStyles.high}`
                      : level === "medium"
                      ? `${reportStyles.issueCard} ${reportStyles.med}`
                      : `${reportStyles.issueCard} ${reportStyles.low}`;
                  const pillText = level === "high" ? "High Impact" : level === "medium" ? "Medium Impact" : "Low Impact";

                  return (
                    <div key={idx} className={cls} data-testid={`card-issue-${idx}`}>
                      <div className={reportStyles.issueIconBox}><RIcon kind="issue" /></div>
                      <div className={reportStyles.issueMain}>
                        <div className={reportStyles.issueTitle}>{it?.title ?? "Opportunity"}</div>
                        <div className={reportStyles.issueDesc}>{it?.impact ?? it?.fix ?? ""}</div>
                      </div>
                      <div className={reportStyles.impactPill}>{pillText}</div>
                    </div>
                  );
                })}
                {(!mapsIssues || mapsIssues.length === 0) && (
                  <div className={`${reportStyles.body} ${reportStyles.muted}`} style={{ padding: 8 }}>No issues detected \u2014 looking good!</div>
                )}
              </div>
            </div>
          )}

          {activeTab === "speed" && (
            <div className={reportStyles.stack}>
              <div className={reportStyles.infoBox}>
                <div className={reportStyles.infoIcon}><RIcon kind="info" /></div>
                <div>
                  <div className={reportStyles.h4}>Speed Impact</div>
                  <div className={`${reportStyles.body} ${reportStyles.muted}`}>Your website speed may be limiting conversions and local rankings.</div>
                </div>
              </div>
              <PerfBlock
                label="Mobile"
                kind="mobile"
                tone="red"
                score={mobile?.score}
                data={mobile}
              />
              <PerfBlock
                label="Desktop"
                kind="desktop"
                tone="amber"
                score={desktop?.score}
                data={desktop}
              />
              {!mobile?.score && !desktop?.score && (
                <div className={`${reportStyles.body} ${reportStyles.muted}`} style={{ padding: 8, textAlign: "center" }}>
                  No website linked \u2014 speed data unavailable.
                </div>
              )}
            </div>
          )}

          <div className={`${reportStyles.card} ${reportStyles.cardPad} ${reportStyles.ctaCard}`}>
            <div className={reportStyles.ctaTitle}>Ready to fix your local visibility?</div>
            <div className={reportStyles.ctaSub}>Professional optimization for both Google Maps and your website.</div>
            <div className={reportStyles.ctaBtns}>
              <button type="button" className={reportStyles.btnPrimary} onClick={onFixClick} data-testid="button-cta-fix">
                Fix This For Me &nbsp; \u2192
              </button>
              <button type="button" className={reportStyles.btnSecondary} onClick={onEmailClick} data-testid="button-cta-email">
                Email Me This Report
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  "Fetching business details",
  "Running website speed test",
  "Generating report",
] as const;

function busyStep(busy: string | null): number {
  if (!busy) return 0;
  if (busy.includes("speed")) return 2;
  if (busy.includes("Generating")) return 3;
  return 1;
}

export default function FreeAudit() {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);

  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const [business, setBusiness] = useState<Business | null>(null);
  const [speedData, setSpeedData] = useState<SpeedData | null>(null);
  const [report, setReport] = useState<ReportJson | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setError(null);
    setReport(null);
    setBusiness(null);
    setSpeedData(null);

    const q = debounced.trim();
    if (q.length < 2) {
      setPredictions([]);
      return;
    }

    setLoadingSearch(true);

    postJSON<{ ok: true; predictions: Prediction[] }>(
      "/api/audit/search-places",
      { query: q }
    )
      .then((d) => setPredictions(d.predictions || []))
      .catch((e) => setError(e.message || "Search failed"))
      .finally(() => setLoadingSearch(false));
  }, [debounced]);

  async function runAudit(placeId: string) {
    try {
      setError(null);
      setBusy("Fetching business details\u2026");
      setReport(null);
      setSpeedData(null);
      setPredictions([]);

      const details = await postJSON<{ ok: true; business: Business }>(
        "/api/audit/place-details",
        { placeId }
      );
      setBusiness(details.business);

      let speed: SpeedData | null = null;
      const site = (details.business.website || "").trim();
      if (site) {
        setBusy("Running website speed test\u2026");
        const ps = await postJSON<{ ok: true; speedData: SpeedData }>(
          "/api/audit/pagespeed",
          { url: site }
        );
        speed = ps.speedData;
        setSpeedData(speed);
      }

      setBusy("Generating report\u2026");
      const rep = await postJSON<{ ok: true; report_json: ReportJson }>(
        "/api/audit/generate",
        { business: details.business, speedData: speed }
      );

      setReport(rep.report_json);
      setBusy(null);

      setTimeout(() => {
        reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (e: any) {
      setBusy(null);
      setError(e?.message || "Audit failed");
    }
  }

  const currentStep = busyStep(busy);

  const reportReady = !!report;
  const UI_BUSINESS = business
    ? { ...business, reviewsCount: business.reviewsCount, address: business.formattedAddress }
    : null;
  const UI_MAPS_ISSUES = report?.issues ?? [];
  const UI_SPEED = speedData ?? { mobile: { score: null }, desktop: { score: null } };

  return (
    <MarketingLayout>
      <style>{`
        .audit-page {
          min-height: 100vh;
          background: linear-gradient(180deg, rgba(236,242,244,1) 0%, rgba(248,250,252,1) 55%, rgba(236,242,244,1) 100%);
          position: relative;
        }
        .audit-page::before {
          content: "";
          position: absolute;
          inset: 0;
          opacity: 0.045;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 200px 200px;
          pointer-events: none;
          z-index: 0;
        }
        .audit-container {
          position: relative;
          z-index: 1;
          max-width: 680px;
          margin: 0 auto;
          padding: 110px 16px 80px;
        }
        @media (min-width: 768px) {
          .audit-container { padding: 120px 24px 80px; }
        }
        .audit-input:focus {
          border-color: #2F6BFF !important;
          box-shadow: 0 0 0 4px rgba(47,107,255,0.16) !important;
        }
        .audit-suggestion:hover {
          background: rgba(47,107,255,0.06) !important;
        }
        .audit-shimmer {
          height: 4px;
          border-radius: 4px;
          background: rgba(0,0,0,0.06);
          overflow: hidden;
          position: relative;
        }
        .audit-shimmer::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 4px;
          background: linear-gradient(90deg, transparent, #2F6BFF, transparent);
          animation: audit-shimmer-move 1.4s ease-in-out infinite;
        }
        @keyframes audit-shimmer-move {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="audit-page">
        <div className="audit-container">
          {!reportReady && (
            <>
              <div style={{ textAlign: "center", marginBottom: 36 }}>
                <h1
                  data-testid="text-audit-title"
                  style={{
                    fontSize: "clamp(30px, 5vw, 40px)",
                    fontWeight: 900,
                    letterSpacing: "-0.02em",
                    color: "#141414",
                    marginBottom: 12,
                    lineHeight: 1.05,
                  }}
                >
                  Free Google Maps &amp; Website Audit
                </h1>
                <p
                  style={{
                    fontSize: 16,
                    color: "rgba(0,0,0,0.62)",
                    maxWidth: "58ch",
                    margin: "0 auto 14px",
                    lineHeight: 1.55,
                  }}
                >
                  Search your business and get an instant report on your Google
                  Business Profile health and website speed.
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    color: "rgba(0,0,0,0.48)",
                  }}
                >
                  <span>Instant report</span>
                  <span style={{ opacity: 0.4 }}>{"\u00b7"}</span>
                  <span>No signup</span>
                  <span style={{ opacity: 0.4 }}>{"\u00b7"}</span>
                  <span>Takes ~30 seconds</span>
                </div>
              </div>

              {!busy && (
                <div
                  style={{
                    background: "rgba(255,255,255,0.78)",
                    border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: 18,
                    boxShadow: "0 18px 50px rgba(0,0,0,0.08)",
                    padding: 16,
                  }}
                >
                  <div style={{ position: "relative" }}>
                    <Search
                      size={18}
                      strokeWidth={1.75}
                      style={{
                        position: "absolute",
                        left: 14,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "rgba(0,0,0,0.35)",
                        pointerEvents: "none",
                      }}
                    />
                    <input
                      data-testid="input-audit-search"
                      className="audit-input"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Type your business name + city\u2026"
                      style={{
                        width: "100%",
                        height: 46,
                        borderRadius: 14,
                        border: "1px solid rgba(0,0,0,0.10)",
                        padding: "0 14px 0 42px",
                        fontSize: 15,
                        fontWeight: 500,
                        outline: "none",
                        background: "#fff",
                        transition: "border-color 0.2s, box-shadow 0.2s",
                        color: "#141414",
                      }}
                    />
                    {loadingSearch && (
                      <div
                        style={{
                          position: "absolute",
                          right: 14,
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: 18,
                          height: 18,
                          border: "2px solid rgba(47,107,255,0.2)",
                          borderTopColor: "#2F6BFF",
                          borderRadius: "50%",
                          animation: "spin 0.7s linear infinite",
                        }}
                      />
                    )}
                  </div>

                  {error && (
                    <div
                      data-testid="text-audit-error"
                      style={{
                        marginTop: 12,
                        padding: "10px 14px",
                        borderRadius: 12,
                        background: "rgba(239,68,68,0.06)",
                        border: "1px solid rgba(239,68,68,0.14)",
                        color: "#B91C1C",
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    >
                      {error}
                    </div>
                  )}
                </div>
              )}

              {predictions.length > 0 && !busy && (
                <div
                  data-testid="list-suggestions"
                  style={{
                    marginTop: 6,
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.92)",
                    border: "1px solid rgba(0,0,0,0.10)",
                    boxShadow: "0 18px 50px rgba(0,0,0,0.10)",
                    maxHeight: 320,
                    overflowY: "auto",
                  }}
                >
                  {predictions.map((p, i) => (
                    <button
                      key={p.placeId}
                      data-testid={`button-place-${p.placeId}`}
                      className="audit-suggestion"
                      onClick={() => runAudit(p.placeId)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "12px 14px",
                        background: "transparent",
                        border: "none",
                        borderBottom:
                          i < predictions.length - 1
                            ? "1px solid rgba(0,0,0,0.05)"
                            : "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        transition: "background 0.12s",
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "#2F6BFF",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: 14,
                            color: "#141414",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {p.name}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "rgba(0,0,0,0.50)",
                            marginTop: 1,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {p.formattedAddress}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {busy && (
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid rgba(0,0,0,0.07)",
                    borderRadius: 18,
                    boxShadow: "0 6px 24px rgba(0,0,0,0.05)",
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "#141414",
                      marginBottom: 14,
                    }}
                  >
                    Running your audit\u2026 (step {currentStep} of 3)
                  </div>
                  <div className="audit-shimmer" style={{ marginBottom: 16 }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {STEPS.map((label, idx) => {
                      const step = idx + 1;
                      const done = currentStep > step;
                      const active = currentStep === step;
                      return (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            fontSize: 13,
                            fontWeight: 500,
                            color: done
                              ? "#22C55E"
                              : active
                              ? colors.accent
                              : "rgba(0,0,0,0.35)",
                          }}
                        >
                          {done ? (
                            <CheckCircle2 size={15} />
                          ) : active ? (
                            <div
                              style={{
                                width: 15,
                                height: 15,
                                border: "2px solid rgba(47,107,255,0.3)",
                                borderTopColor: "#2F6BFF",
                                borderRadius: "50%",
                                animation: "spin 0.7s linear infinite",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 15,
                                height: 15,
                                borderRadius: "50%",
                                border: "2px solid rgba(0,0,0,0.12)",
                              }}
                            />
                          )}
                          {label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {reportReady && (
            <div ref={reportRef}>
              <ReportView
                business={UI_BUSINESS}
                mapsIssues={UI_MAPS_ISSUES}
                speed={UI_SPEED}
                onFixClick={() => { window.location.href = "/contact"; }}
                onEmailClick={() => {}}
              />
            </div>
          )}
        </div>
      </div>
    </MarketingLayout>
  );
}
