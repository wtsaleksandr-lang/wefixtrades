import { useEffect, useMemo, useRef, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, colors, shadows } from "@/theme/tokens";
import { Search, MapPin, Globe, Star, AlertTriangle, CheckCircle2, ArrowRight, Loader2 } from "lucide-react";

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

function ScoreRing({
  score,
  label,
  size = 100,
}: {
  score: number;
  label: string;
  size?: number;
}) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 80 ? "#22C55E" : pct >= 55 ? "#F59E0B" : "#EF4444";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
    >
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(0,0,0,0.06)"
          strokeWidth={6}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colors.text}
          fontWeight={800}
          fontSize={size * 0.28}
        >
          {score}
        </text>
      </svg>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: colors.textMuted,
          textAlign: "center",
        }}
      >
        {label}
      </span>
    </div>
  );
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

  const scoreLabel = useMemo(() => {
    if (!report) return null;
    const s = report.scores.localVisibility;
    if (s >= 85) return "Excellent";
    if (s >= 70) return "Good";
    if (s >= 55) return "Average";
    return "Needs work";
  }, [report]);

  return (
    <MarketingLayout>
      <div
        style={{
          maxWidth: 880,
          margin: "0 auto",
          padding: "120px 24px 80px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h1
            data-testid="text-audit-title"
            style={{
              fontSize: "clamp(28px, 5vw, 42px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: colors.text,
              marginBottom: 12,
              lineHeight: 1.1,
            }}
          >
            Free Google Maps &amp; Website Audit
          </h1>
          <p
            style={{
              fontSize: 17,
              color: colors.textMuted,
              maxWidth: 520,
              margin: "0 auto",
              lineHeight: 1.5,
            }}
          >
            Search your business below and get an instant report on your Google
            Business Profile health and website speed.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            maxWidth: 600,
            margin: "0 auto 8px",
          }}
        >
          <div
            style={{
              flex: 1,
              position: "relative",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Search
              size={18}
              style={{
                position: "absolute",
                left: 14,
                color: colors.textMuted,
                pointerEvents: "none",
              }}
            />
            <input
              data-testid="input-audit-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type your business name + city\u2026"
              style={{
                width: "100%",
                height: 48,
                borderRadius: 14,
                border: `1px solid ${colors.border}`,
                padding: "0 14px 0 42px",
                fontSize: 15,
                fontWeight: 500,
                outline: "none",
                background: "#fff",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = colors.accent)
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = colors.border)
              }
            />
          </div>
          {loadingSearch && (
            <Loader2
              size={20}
              style={{ color: colors.accent, animation: "spin 1s linear infinite" }}
            />
          )}
        </div>

        {error && (
          <div
            data-testid="text-audit-error"
            style={{
              maxWidth: 600,
              margin: "12px auto 0",
              padding: "12px 16px",
              borderRadius: 14,
              background: "rgba(239,68,68,0.06)",
              border: "1px solid rgba(239,68,68,0.15)",
              color: "#B91C1C",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}

        {predictions.length > 0 && (
          <div
            style={{
              maxWidth: 600,
              margin: "8px auto 0",
              borderRadius: 14,
              border: `1px solid ${colors.border}`,
              background: "#fff",
              overflow: "hidden",
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            }}
          >
            {predictions.map((p) => (
              <button
                key={p.placeId}
                data-testid={`button-place-${p.placeId}`}
                onClick={() => runAudit(p.placeId)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "14px 16px",
                  background: "transparent",
                  border: "none",
                  borderBottom: `1px solid ${colors.border}`,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(12,103,255,0.04)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <MapPin
                  size={18}
                  style={{
                    color: colors.accent,
                    marginTop: 2,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div style={{ fontWeight: 700, color: colors.text }}>
                    {p.name}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: colors.textMuted,
                      marginTop: 2,
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
            data-testid="text-audit-loading"
            style={{
              maxWidth: 600,
              margin: "20px auto 0",
              padding: "16px 20px",
              borderRadius: 14,
              background: "rgba(12,103,255,0.05)",
              border: "1px solid rgba(12,103,255,0.12)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 15,
              fontWeight: 500,
              color: colors.accent,
            }}
          >
            <Loader2
              size={20}
              style={{ animation: "spin 1s linear infinite" }}
            />
            {busy}
          </div>
        )}

        {report && (
          <div ref={reportRef} style={{ marginTop: 32 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 16,
              }}
            >
              <div
                data-testid="card-visibility-score"
                style={{
                  padding: 24,
                  borderRadius: 16,
                  background: "#fff",
                  border: `1px solid ${colors.border}`,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <ScoreRing
                  score={report.scores.localVisibility}
                  label="Local Visibility"
                  size={110}
                />
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color:
                      report.scores.localVisibility >= 70
                        ? "#22C55E"
                        : report.scores.localVisibility >= 55
                        ? "#F59E0B"
                        : "#EF4444",
                  }}
                >
                  {scoreLabel}
                </span>
              </div>

              <div
                data-testid="card-speed-scores"
                style={{
                  padding: 24,
                  borderRadius: 16,
                  background: "#fff",
                  border: `1px solid ${colors.border}`,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: colors.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Website Speed
                </span>
                <div
                  style={{
                    display: "flex",
                    gap: 24,
                    justifyContent: "center",
                  }}
                >
                  {report.scores.websiteSpeedMobile !== null ? (
                    <ScoreRing
                      score={report.scores.websiteSpeedMobile}
                      label="Mobile"
                      size={90}
                    />
                  ) : (
                    <div
                      style={{
                        textAlign: "center",
                        color: colors.textMuted,
                        fontSize: 13,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 28,
                          fontWeight: 800,
                          color: colors.text,
                        }}
                      >
                        \u2014
                      </div>
                      Mobile
                    </div>
                  )}
                  {report.scores.websiteSpeedDesktop !== null ? (
                    <ScoreRing
                      score={report.scores.websiteSpeedDesktop}
                      label="Desktop"
                      size={90}
                    />
                  ) : (
                    <div
                      style={{
                        textAlign: "center",
                        color: colors.textMuted,
                        fontSize: 13,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 28,
                          fontWeight: 800,
                          color: colors.text,
                        }}
                      >
                        \u2014
                      </div>
                      Desktop
                    </div>
                  )}
                </div>
                {report.scores.websiteSpeedMobile === null &&
                  report.scores.websiteSpeedDesktop === null && (
                    <span
                      style={{
                        fontSize: 12,
                        color: colors.textMuted,
                        fontStyle: "italic",
                      }}
                    >
                      No website linked
                    </span>
                  )}
              </div>
            </div>

            <div
              data-testid="card-business-info"
              style={{
                marginTop: 16,
                padding: 20,
                borderRadius: 16,
                background: "#fff",
                border: `1px solid ${colors.border}`,
                boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
              }}
            >
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: colors.text,
                  marginBottom: 4,
                }}
              >
                {report.business.name}
              </div>
              <div
                style={{
                  color: colors.textMuted,
                  fontSize: 14,
                  marginBottom: 10,
                }}
              >
                {report.business.address}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 16,
                  fontSize: 14,
                  color: colors.text,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Star
                    size={15}
                    style={{ color: "#E8A317", fill: "#E8A317" }}
                  />
                  {report.business.rating ?? "\u2014"} (
                  {report.business.reviewsCount} reviews)
                </span>
                {report.business.website ? (
                  <a
                    href={report.business.website}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      color: colors.accent,
                      textDecoration: "none",
                    }}
                  >
                    <Globe size={15} />
                    Website
                  </a>
                ) : (
                  <span style={{ color: colors.textMuted }}>No website</span>
                )}
                {report.business.phone && (
                  <span style={{ color: colors.textMuted }}>
                    {report.business.phone}
                  </span>
                )}
              </div>
            </div>

            {report.issues.length > 0 && (
              <div
                data-testid="card-issues"
                style={{
                  marginTop: 16,
                  padding: 20,
                  borderRadius: 16,
                  background: "#fff",
                  border: `1px solid ${colors.border}`,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 14px",
                    fontSize: 17,
                    fontWeight: 800,
                    color: colors.text,
                  }}
                >
                  Top Issues
                </h3>
                <div
                  style={{ display: "grid", gap: 10 }}
                >
                  {report.issues.map((issue, idx) => (
                    <div
                      key={idx}
                      data-testid={`card-issue-${idx}`}
                      style={{
                        padding: 14,
                        borderRadius: 14,
                        border: `1px solid ${colors.border}`,
                        background: "rgba(0,0,0,0.015)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          marginBottom: 6,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontWeight: 700,
                            color: colors.text,
                          }}
                        >
                          <AlertTriangle
                            size={16}
                            style={{
                              color:
                                issue.severity === "High"
                                  ? "#EF4444"
                                  : "#F59E0B",
                            }}
                          />
                          {issue.title}
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            padding: "3px 8px",
                            borderRadius: 8,
                            background:
                              issue.severity === "High"
                                ? "rgba(239,68,68,0.08)"
                                : "rgba(245,158,11,0.08)",
                            color:
                              issue.severity === "High"
                                ? "#DC2626"
                                : "#D97706",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {issue.severity}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          color: colors.textMuted,
                          marginBottom: 6,
                        }}
                      >
                        {issue.impact}
                      </div>
                      <div style={{ fontSize: 14, color: colors.text }}>
                        <strong>Fix:</strong> {issue.fix}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {report.quickWins.length > 0 && (
              <div
                data-testid="card-quick-wins"
                style={{
                  marginTop: 16,
                  padding: 20,
                  borderRadius: 16,
                  background: "#fff",
                  border: `1px solid ${colors.border}`,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 14px",
                    fontSize: 17,
                    fontWeight: 800,
                    color: colors.text,
                  }}
                >
                  Quick Wins
                </h3>
                <div style={{ display: "grid", gap: 8 }}>
                  {report.quickWins.map((win, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        fontSize: 14,
                        color: colors.text,
                        lineHeight: 1.5,
                      }}
                    >
                      <CheckCircle2
                        size={16}
                        style={{
                          color: "#22C55E",
                          marginTop: 3,
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
              style={{
                marginTop: 16,
                padding: 20,
                borderRadius: 16,
                background: "#fff",
                border: `1px solid ${colors.border}`,
                boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 14px",
                  fontSize: 17,
                  fontWeight: 800,
                  color: colors.text,
                }}
              >
                Action Plan
              </h3>
              <div style={{ display: "grid", gap: 16 }}>
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: colors.accent,
                      marginBottom: 8,
                    }}
                  >
                    Next 7 Days
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {report.actionPlan.next7Days.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          fontSize: 14,
                          color: colors.text,
                          lineHeight: 1.5,
                        }}
                      >
                        <ArrowRight
                          size={14}
                          style={{
                            color: colors.accent,
                            marginTop: 4,
                            flexShrink: 0,
                          }}
                        />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: colors.accent,
                      marginBottom: 8,
                    }}
                  >
                    Next 30 Days
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {report.actionPlan.next30Days.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          fontSize: 14,
                          color: colors.text,
                          lineHeight: 1.5,
                        }}
                      >
                        <ArrowRight
                          size={14}
                          style={{
                            color: colors.accent,
                            marginTop: 4,
                            flexShrink: 0,
                          }}
                        />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div
              data-testid="card-recommended-services"
              style={{
                marginTop: 16,
                padding: 20,
                borderRadius: 16,
                background: `linear-gradient(135deg, rgba(12,103,255,0.04), rgba(12,103,255,0.08))`,
                border: "1px solid rgba(12,103,255,0.14)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 14px",
                  fontSize: 17,
                  fontWeight: 800,
                  color: colors.text,
                }}
              >
                Recommended Services
              </h3>
              <div style={{ display: "grid", gap: 10 }}>
                {report.recommendedServices.map((svc, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      background: "#fff",
                      border: `1px solid ${colors.border}`,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        color: colors.text,
                        marginBottom: 4,
                      }}
                    >
                      {svc.name}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        color: colors.textMuted,
                      }}
                    >
                      {svc.why}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </MarketingLayout>
  );
}
