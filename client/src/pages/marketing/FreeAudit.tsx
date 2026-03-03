import { useEffect, useMemo, useRef, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { colors } from "@/theme/tokens";
import { Search, MapPin, Globe, Star, AlertTriangle, CheckCircle2, ArrowRight, ChevronDown, Phone, Image } from "lucide-react";

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
  mobile: { score: number | null };
  desktop: { score: number | null };
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

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(0,0,0,0.07)",
  borderRadius: 18,
  boxShadow: "0 6px 24px rgba(0,0,0,0.05)",
};

function speedColor(s: number | null) {
  if (s === null) return colors.textMuted;
  if (s >= 90) return "#22C55E";
  if (s >= 50) return "#F59E0B";
  return "#EF4444";
}

function visibilityColor(s: number) {
  if (s >= 80) return "#22C55E";
  if (s >= 55) return "#F59E0B";
  return "#EF4444";
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

  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);
  const [planTab, setPlanTab] = useState<"7" | "30">("7");

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
      setExpandedIssue(null);
      setPlanTab("7");

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

  const scoreLabel = useMemo(() => {
    if (!report) return null;
    const s = report.scores.localVisibility;
    if (s >= 85) return "Excellent";
    if (s >= 70) return "Good";
    if (s >= 55) return "Average";
    return "Needs work";
  }, [report]);

  const currentStep = busyStep(busy);

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
          max-width: 1100px;
          margin: 0 auto;
          padding: 110px 16px 80px;
        }
        @media (min-width: 980px) {
          .audit-container { padding: 120px 24px 80px; }
        }
        .audit-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }
        @media (min-width: 980px) {
          .audit-grid {
            grid-template-columns: 420px 1fr;
            gap: 18px;
          }
        }
        .audit-right {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        @media (min-width: 980px) {
          .audit-right {
            position: sticky;
            top: 96px;
            align-self: start;
            gap: 16px;
          }
        }
        .audit-left {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .audit-input:focus {
          border-color: #0C67FF !important;
          box-shadow: 0 0 0 4px rgba(12,103,255,0.16) !important;
        }
        .audit-suggestion:hover {
          background: rgba(12,103,255,0.06) !important;
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
          background: linear-gradient(90deg, transparent, #0C67FF, transparent);
          animation: audit-shimmer-move 1.4s ease-in-out infinite;
        }
        @keyframes audit-shimmer-move {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .audit-issue-body {
          overflow: hidden;
          max-height: 0;
          transition: max-height 0.3s ease, opacity 0.25s ease;
          opacity: 0;
        }
        .audit-issue-body.open {
          max-height: 300px;
          opacity: 1;
        }
        .audit-tab {
          padding: 7px 16px;
          border-radius: 10px;
          border: none;
          background: transparent;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          color: rgba(0,0,0,0.55);
          transition: background 0.15s, color 0.15s;
        }
        .audit-tab.active {
          background: rgba(0,0,0,0.06);
          color: #141414;
        }
        .audit-photos {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        @media (min-width: 980px) {
          .audit-photos {
            grid-template-columns: repeat(4, 1fr);
          }
        }
        .audit-photo {
          aspect-ratio: 4/3;
          border-radius: 12px;
          object-fit: cover;
          width: 100%;
          background: rgba(0,0,0,0.04);
        }
        .audit-meter {
          height: 8px;
          border-radius: 8px;
          background: rgba(0,0,0,0.07);
          overflow: hidden;
        }
        .audit-meter-fill {
          height: 100%;
          border-radius: 8px;
          background: linear-gradient(90deg, #0C67FF, #0757E6);
          transition: width 0.8s ease;
        }
        .audit-cta-card {
          position: relative;
          border-radius: 18px;
          padding: 2px;
          background: linear-gradient(135deg, rgba(12,103,255,0.25), rgba(12,103,255,0.08), rgba(12,103,255,0.25));
        }
        .audit-cta-inner {
          background: #fff;
          border-radius: 16px;
          padding: 20px;
        }
        .audit-cta-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 22px;
          border-radius: 14px;
          border: none;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
          text-decoration: none;
        }
        .audit-cta-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.12);
        }
        @media (max-width: 979px) {
          .audit-cta-btns {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .audit-cta-btn {
            width: 100%;
          }
        }
        @media (min-width: 980px) {
          .audit-cta-btns {
            display: flex;
            gap: 12px;
          }
        }
      `}</style>

      <div className="audit-page">
        <div className="audit-container">
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <h1
              data-testid="text-audit-title"
              style={{
                fontSize: "clamp(30px, 5vw, 40px)",
                fontWeight: 900,
                letterSpacing: "-0.02em",
                color: colors.text,
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
              <span style={{ opacity: 0.4 }}>\u00b7</span>
              <span>No signup</span>
              <span style={{ opacity: 0.4 }}>\u00b7</span>
              <span>Takes ~30 seconds</span>
            </div>
          </div>

          {!report && !busy && (
            <div style={{ maxWidth: 560, margin: "0 auto" }}>
              <div
                style={{
                  ...CARD,
                  background: "rgba(255,255,255,0.78)",
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
                      color: colors.text,
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
                        border: "2px solid rgba(12,103,255,0.2)",
                        borderTopColor: "#0C67FF",
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

              {predictions.length > 0 && (
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
                          background: "#0C67FF",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: 14,
                            color: colors.text,
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
            </div>
          )}

          {busy && (
            <div style={{ maxWidth: 480, margin: "0 auto" }}>
              <div style={{ ...CARD, padding: 20 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: colors.text,
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
                              border: "2px solid rgba(12,103,255,0.3)",
                              borderTopColor: "#0C67FF",
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
            </div>
          )}

          {(report || (business && !busy)) && (
            <div className="audit-grid" ref={reportRef}>
              <div className="audit-left">
                {business && (
                  <div
                    data-testid="card-business-info"
                    style={{ ...CARD, padding: 18 }}
                  >
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: colors.text,
                        marginBottom: 4,
                      }}
                    >
                      {business.name}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 13,
                        color: "rgba(0,0,0,0.55)",
                        marginBottom: 10,
                      }}
                    >
                      <MapPin size={13} />
                      {business.formattedAddress}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 14,
                        fontSize: 13,
                        color: colors.text,
                        marginBottom: business.photos.length > 0 ? 14 : 0,
                      }}
                    >
                      {business.rating !== null && (
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Star
                            size={14}
                            style={{ color: "#E8A317", fill: "#E8A317" }}
                          />
                          {business.rating} ({business.reviewsCount})
                        </span>
                      )}
                      {business.website ? (
                        <a
                          href={business.website}
                          target="_blank"
                          rel="noreferrer"
                          data-testid="link-business-website"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            color: colors.accent,
                            textDecoration: "none",
                          }}
                        >
                          <Globe size={13} />
                          Website
                        </a>
                      ) : (
                        <span style={{ color: "rgba(0,0,0,0.40)" }}>
                          No website
                        </span>
                      )}
                      {business.phone && (
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            color: "rgba(0,0,0,0.55)",
                          }}
                        >
                          <Phone size={13} />
                          {business.phone}
                        </span>
                      )}
                    </div>
                    {business.photos.length > 0 ? (
                      <div className="audit-photos">
                        {business.photos.slice(0, 4).map((src, i) => (
                          <img
                            key={i}
                            src={src}
                            alt=""
                            className="audit-photo"
                            data-testid={`img-business-photo-${i}`}
                          />
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "14px 0 4px",
                          fontSize: 13,
                          color: "rgba(0,0,0,0.35)",
                        }}
                      >
                        <Image size={16} />
                        No photos available
                      </div>
                    )}
                  </div>
                )}

                <div
                  style={{
                    ...CARD,
                    padding: 16,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Search
                    size={16}
                    strokeWidth={1.75}
                    style={{ color: "rgba(0,0,0,0.35)", flexShrink: 0 }}
                  />
                  <input
                    data-testid="input-audit-search-inline"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search another business\u2026"
                    className="audit-input"
                    style={{
                      flex: 1,
                      height: 40,
                      borderRadius: 12,
                      border: "1px solid rgba(0,0,0,0.10)",
                      padding: "0 12px",
                      fontSize: 14,
                      fontWeight: 500,
                      outline: "none",
                      background: "rgba(0,0,0,0.02)",
                      transition: "border-color 0.2s, box-shadow 0.2s",
                      color: colors.text,
                    }}
                  />
                </div>

                {predictions.length > 0 && report && (
                  <div
                    style={{
                      borderRadius: 16,
                      background: "rgba(255,255,255,0.92)",
                      border: "1px solid rgba(0,0,0,0.10)",
                      boxShadow: "0 18px 50px rgba(0,0,0,0.10)",
                      maxHeight: 280,
                      overflowY: "auto",
                    }}
                  >
                    {predictions.map((p, i) => (
                      <button
                        key={p.placeId}
                        data-testid={`button-place-inline-${p.placeId}`}
                        className="audit-suggestion"
                        onClick={() => runAudit(p.placeId)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "10px 14px",
                          background: "transparent",
                          border: "none",
                          borderBottom:
                            i < predictions.length - 1
                              ? "1px solid rgba(0,0,0,0.05)"
                              : "none",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          transition: "background 0.12s",
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: "#0C67FF",
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: 13,
                              color: colors.text,
                            }}
                          >
                            {p.name}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "rgba(0,0,0,0.45)",
                            }}
                          >
                            {p.formattedAddress}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {report && (
                <div className="audit-right">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 14,
                    }}
                  >
                    <div
                      data-testid="card-visibility-score"
                      style={{ ...CARD, padding: 20 }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "rgba(0,0,0,0.42)",
                          marginBottom: 8,
                        }}
                      >
                        Local Visibility
                      </div>
                      <div
                        style={{
                          fontSize: "clamp(42px, 5vw, 52px)",
                          fontWeight: 900,
                          lineHeight: 1,
                          color: colors.text,
                          marginBottom: 8,
                        }}
                      >
                        {report.scores.localVisibility}
                      </div>
                      <span
                        data-testid="badge-score-label"
                        style={{
                          display: "inline-block",
                          padding: "4px 12px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                          background: `${visibilityColor(report.scores.localVisibility)}18`,
                          color: visibilityColor(report.scores.localVisibility),
                          marginBottom: 12,
                        }}
                      >
                        {scoreLabel}
                      </span>
                      <div className="audit-meter">
                        <div
                          className="audit-meter-fill"
                          style={{
                            width: `${report.scores.localVisibility}%`,
                            background: `linear-gradient(90deg, ${visibilityColor(report.scores.localVisibility)}, ${visibilityColor(report.scores.localVisibility)}cc)`,
                          }}
                        />
                      </div>
                    </div>

                    <div
                      data-testid="card-speed-scores"
                      style={{ ...CARD, padding: 20 }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "rgba(0,0,0,0.42)",
                          marginBottom: 12,
                        }}
                      >
                        Website Speed
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        {[
                          {
                            label: "Mobile",
                            score: report.scores.websiteSpeedMobile,
                          },
                          {
                            label: "Desktop",
                            score: report.scores.websiteSpeedDesktop,
                          },
                        ].map(({ label, score }) => (
                          <div
                            key={label}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "8px 12px",
                              borderRadius: 12,
                              background: "rgba(0,0,0,0.025)",
                              border: "1px solid rgba(0,0,0,0.05)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  background: speedColor(score),
                                }}
                              />
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "rgba(0,0,0,0.60)",
                                }}
                              >
                                {label}
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: 20,
                                fontWeight: 800,
                                color:
                                  score !== null
                                    ? colors.text
                                    : "rgba(0,0,0,0.25)",
                              }}
                            >
                              {score ?? "\u2014"}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "rgba(0,0,0,0.38)",
                          marginTop: 8,
                          fontStyle: "italic",
                        }}
                      >
                        {report.scores.websiteSpeedMobile === null
                          ? "No website linked"
                          : "Mobile matters most"}
                      </div>
                    </div>
                  </div>

                  {report.issues.length > 0 && (
                    <div
                      data-testid="card-issues"
                      style={{ ...CARD, padding: 18 }}
                    >
                      <h3
                        style={{
                          margin: "0 0 12px",
                          fontSize: 16,
                          fontWeight: 800,
                          color: colors.text,
                        }}
                      >
                        Top Issues
                      </h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {report.issues.map((issue, idx) => {
                          const isHigh = issue.severity === "High";
                          const borderClr = isHigh
                            ? "rgba(220,0,0,0.22)"
                            : "rgba(200,120,0,0.22)";
                          const bgClr = isHigh
                            ? "rgba(220,0,0,0.04)"
                            : "rgba(200,120,0,0.04)";
                          const barClr = isHigh ? "#EF4444" : "#F59E0B";
                          const open = expandedIssue === idx;

                          return (
                            <div
                              key={idx}
                              data-testid={`card-issue-${idx}`}
                              style={{
                                border: `1px solid ${borderClr}`,
                                background: bgClr,
                                borderRadius: 14,
                                overflow: "hidden",
                                position: "relative",
                                paddingLeft: 4,
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: 4,
                                  background: barClr,
                                  borderRadius: "14px 0 0 14px",
                                }}
                              />
                              <button
                                data-testid={`button-issue-toggle-${idx}`}
                                onClick={() =>
                                  setExpandedIssue(open ? null : idx)
                                }
                                style={{
                                  width: "100%",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 10,
                                  padding: "12px 14px 12px 12px",
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                  <AlertTriangle
                                    size={15}
                                    style={{ color: barClr, flexShrink: 0 }}
                                  />
                                  <span
                                    style={{
                                      fontWeight: 800,
                                      fontSize: 14,
                                      color: colors.text,
                                    }}
                                  >
                                    {issue.title}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 800,
                                      padding: "2px 8px",
                                      borderRadius: 8,
                                      background: isHigh
                                        ? "rgba(239,68,68,0.10)"
                                        : "rgba(245,158,11,0.10)",
                                      color: isHigh ? "#DC2626" : "#D97706",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.05em",
                                    }}
                                  >
                                    {issue.severity}
                                  </span>
                                  <ChevronDown
                                    size={14}
                                    style={{
                                      color: "rgba(0,0,0,0.35)",
                                      transition: "transform 0.2s",
                                      transform: open
                                        ? "rotate(180deg)"
                                        : "rotate(0)",
                                    }}
                                  />
                                </div>
                              </button>
                              <div
                                className={`audit-issue-body ${open ? "open" : ""}`}
                              >
                                <div
                                  style={{
                                    padding: "0 14px 14px 12px",
                                    fontSize: 13,
                                    lineHeight: 1.55,
                                  }}
                                >
                                  <div
                                    style={{
                                      color: "rgba(0,0,0,0.58)",
                                      marginBottom: 6,
                                    }}
                                  >
                                    {issue.impact}
                                  </div>
                                  <div style={{ color: colors.text }}>
                                    <strong>Fix:</strong> {issue.fix}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {report.quickWins.length > 0 && (
                    <div
                      data-testid="card-quick-wins"
                      style={{ ...CARD, padding: 18 }}
                    >
                      <h3
                        style={{
                          margin: "0 0 12px",
                          fontSize: 16,
                          fontWeight: 800,
                          color: colors.text,
                        }}
                      >
                        Quick Wins
                      </h3>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        {report.quickWins.map((win, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 10,
                              fontSize: 13,
                              color: colors.text,
                              lineHeight: 1.55,
                            }}
                          >
                            <CheckCircle2
                              size={15}
                              style={{
                                color: "#22C55E",
                                marginTop: 2,
                                flexShrink: 0,
                              }}
                            />
                            {win}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div
                    data-testid="card-action-plan"
                    style={{ ...CARD, padding: 18 }}
                  >
                    <h3
                      style={{
                        margin: "0 0 12px",
                        fontSize: 16,
                        fontWeight: 800,
                        color: colors.text,
                      }}
                    >
                      Action Plan
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        marginBottom: 14,
                        background: "rgba(0,0,0,0.03)",
                        borderRadius: 12,
                        padding: 3,
                      }}
                    >
                      <button
                        data-testid="button-tab-7days"
                        className={`audit-tab ${planTab === "7" ? "active" : ""}`}
                        onClick={() => setPlanTab("7")}
                      >
                        Next 7 Days
                      </button>
                      <button
                        data-testid="button-tab-30days"
                        className={`audit-tab ${planTab === "30" ? "active" : ""}`}
                        onClick={() => setPlanTab("30")}
                      >
                        Next 30 Days
                      </button>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {(planTab === "7"
                        ? report.actionPlan.next7Days
                        : report.actionPlan.next30Days
                      ).map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                            fontSize: 13,
                            color: colors.text,
                            lineHeight: 1.55,
                          }}
                        >
                          <ArrowRight
                            size={14}
                            style={{
                              color: colors.accent,
                              marginTop: 3,
                              flexShrink: 0,
                            }}
                          />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="audit-cta-card">
                    <div className="audit-cta-inner">
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: 17,
                          color: colors.text,
                          marginBottom: 6,
                        }}
                      >
                        Ready to improve your visibility?
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          color: "rgba(0,0,0,0.55)",
                          marginBottom: 16,
                          lineHeight: 1.5,
                        }}
                      >
                        Our team can fix these issues and get you more
                        calls, leads, and bookings.
                      </div>
                      <div className="audit-cta-btns">
                        <a
                          href="/contact"
                          data-testid="link-cta-maps"
                          className="audit-cta-btn"
                          style={{
                            background: "#0C67FF",
                            color: "#fff",
                          }}
                        >
                          Fix My Google Maps
                          <ArrowRight size={15} />
                        </a>
                        <a
                          href="/contact"
                          data-testid="link-cta-website"
                          className="audit-cta-btn"
                          style={{
                            background: "rgba(0,0,0,0.05)",
                            color: colors.text,
                          }}
                        >
                          Boost My Website
                          <ArrowRight size={15} />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </MarketingLayout>
  );
}
