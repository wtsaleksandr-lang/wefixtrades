import { useState, useRef } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Search, AlertTriangle, CheckCircle, TrendingUp, Smartphone, Monitor, Clock, Lock, Gauge, Zap } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";

/* ─── Types ─── */
interface SEOIssue {
  title: string;
  severity: "high" | "medium" | "low";
  description: string;
}

interface SEORecommendation {
  title: string;
  impact: "high" | "medium" | "low";
  description: string;
}

interface AnalysisResult {
  score: string;
  speedScore: number | null;
  mobileScore: number | null;
  desktopScore: number | null;
  mobile: { score: number; fcp: number | null; lcp: number | null; tbt: number | null; cls: number | null } | null;
  desktop: { score: number; fcp: number | null; lcp: number | null; tbt: number | null; cls: number | null } | null;
  issues: SEOIssue[];
  recommendations: SEORecommendation[];
}

/* ─── Grade colors ─── */
function gradeColor(grade: string): string {
  switch (grade) {
    case "A": return "#10B981";
    case "B": return "#0d3cfc";
    case "C": return "#F7B430";
    case "D": return "#F97316";
    case "F": return "#EF4444";
    default: return mkt.textMuted;
  }
}

function gradeGlow(grade: string): string {
  const c = gradeColor(grade);
  return `0 0 40px ${c}33, 0 0 80px ${c}15`;
}

/* ─── Severity badge ─── */
function SeverityBadge({ level }: { level: string }) {
  const config: Record<string, { color: string; bg: string; label: string }> = {
    high: { color: "#EF4444", bg: "rgba(239,68,68,0.12)", label: "High" },
    medium: { color: "#F7B430", bg: "rgba(247,180,48,0.12)", label: "Medium" },
    low: { color: "#10B981", bg: "rgba(16,185,129,0.12)", label: "Low" },
  };
  const c = config[level] || config.low;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: c.color,
        background: c.bg,
        padding: "3px 8px",
        borderRadius: 6,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
      }}
    >
      {c.label}
    </span>
  );
}

/* ─── Score ring ─── */
function ScoreRing({ score, label, size = 80 }: { score: number | null; label: string; size?: number }) {
  if (score === null) {
    return (
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            border: `3px solid ${mkt.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 8px",
          }}
        >
          <span style={{ fontSize: size * 0.25, color: mkt.textMuted, fontWeight: 600 }}>--</span>
        </div>
        <span style={{ fontSize: 12, color: mkt.textMuted, fontWeight: 500 }}>{label}</span>
      </div>
    );
  }

  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 50 ? "C" : score >= 30 ? "D" : "F";
  const color = gradeColor(grade);
  const circumference = 2 * Math.PI * (size / 2 - 4);
  const offset = circumference - (score / 100) * circumference;

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ position: "relative", width: size, height: size, margin: "0 auto 8px" }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - 4}
            fill="none"
            stroke={mkt.border}
            strokeWidth={3}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - 4}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1.5s ease" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: size * 0.28, fontWeight: 700, color }}>{score}</span>
        </div>
      </div>
      <span style={{ fontSize: 12, color: mkt.textMuted, fontWeight: 500 }}>{label}</span>
    </div>
  );
}

/* ─── Metric bar ─── */
function MetricRow({ icon, label, value, unit, good }: { icon: React.ReactNode; label: string; value: string; unit: string; good: boolean | null }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 0",
        borderBottom: `1px solid ${mkt.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ color: mkt.textMuted }}>{icon}</div>
        <span style={{ fontSize: 14, color: mkt.text, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: good === null ? mkt.textMuted : good ? "#10B981" : "#F7B430" }}>
          {value}
        </span>
        <span style={{ fontSize: 12, color: mkt.textMuted }}>{unit}</span>
      </div>
    </div>
  );
}

/* ─── Email gate ─── */
function EmailGate({ onSubmit }: { onSubmit: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await fetch("/api/demo-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          trade: "seo",
          source_tool: "rankflow-demo",
          source_page: "/demos/rankflow",
        }),
      });
    } catch {
      // Non-blocking
    }
    setSubmitting(false);
    onSubmit();
  };

  return (
    <div
      style={{
        background: `linear-gradient(135deg, rgba(13,60,252,0.06) 0%, rgba(13,60,252,0.02) 100%)`,
        border: `1px solid ${mkt.accent}`,
        borderRadius: 20,
        padding: "36px 28px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: "rgba(13,60,252,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 16px",
        }}
      >
        <Lock size={24} color={mkt.accent} />
      </div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: mkt.text, marginBottom: 8, letterSpacing: "-0.02em" }}>
        Get the full SEO report
      </h3>
      <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.55, marginBottom: 20 }}>
        Enter your email to unlock detailed recommendations and a custom fix plan.
      </p>
      <div style={{ display: "flex", gap: 10, maxWidth: 380, margin: "0 auto" }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="you@business.com"
          style={{
            flex: 1,
            padding: "12px 16px",
            borderRadius: 10,
            border: `1px solid ${error ? "rgba(239,68,68,0.5)" : mkt.border}`,
            background: mkt.bg,
            color: mkt.text,
            fontSize: 14,
            outline: "none",
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            padding: "12px 20px",
            borderRadius: 10,
            border: "none",
            background: mkt.accent,
            color: mkt.dark,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            opacity: submitting ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {submitting ? "..." : "Unlock Report"}
        </button>
      </div>
      {error && <p style={{ fontSize: 12, color: "#EF4444", marginTop: 8 }}>{error}</p>}
    </div>
  );
}

/* ─── Main ─── */
export default function RankFlowDemo() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [emailUnlocked, setEmailUnlocked] = useState(false);
  const [scanPhase, setScanPhase] = useState("");
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleAnalyze = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please enter a website URL");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);
    setScanPhase("Connecting to website...");

    // Simulate progressive scan phases
    const phases = [
      { text: "Analyzing page speed...", delay: 2000 },
      { text: "Checking mobile responsiveness...", delay: 4000 },
      { text: "Evaluating SEO structure...", delay: 6000 },
      { text: "Generating recommendations...", delay: 8000 },
    ];
    const timers = phases.map((p) =>
      setTimeout(() => setScanPhase(p.text), p.delay)
    );

    try {
      const resp = await fetch("/api/demos/rankflow/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Analysis failed");
      setResult(data);
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    } catch (err: any) {
      setError(err.message || "Failed to analyze. Please check the URL and try again.");
    } finally {
      setLoading(false);
      setScanPhase("");
      timers.forEach(clearTimeout);
    }
  };

  return (
    <MarketingLayout>
      <style>{`
        @keyframes scanPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes scanLine {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(280px); opacity: 0; }
        }
        @keyframes scoreReveal {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.08); }
          100% { transform: scale(1); opacity: 1; }
        }
        .rankflow-input:focus {
          border-color: ${mkt.accent} !important;
          box-shadow: 0 0 0 3px rgba(13,60,252,0.15) !important;
        }
        .analyze-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(13,60,252,0.25);
        }
      `}</style>

      <div data-testid="rankflow-demo-page">
        {/* Hero */}
        <section
          style={{
            background: `linear-gradient(160deg, ${mkt.dark} 0%, #0F2744 55%, #1a3550 100%)`,
            padding: "100px 28px 72px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -100,
              left: "50%",
              transform: "translateX(-50%)",
              width: 600,
              height: 600,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(13,60,252,0.08) 0%, transparent 65%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
            <Link
              href="/demos"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 600,
                color: mkt.onDarkFaint,
                textDecoration: "none",
                marginBottom: 28,
              }}
            >
              <ArrowLeft size={14} />
              Back to Demo Center
            </Link>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(13,60,252,0.10)",
                border: `1px solid rgba(13,60,252,0.25)`,
                borderRadius: 20,
                padding: "5px 14px",
                marginBottom: 20,
              }}
            >
              <Search size={12} color={mkt.accent} />
              <span style={{ fontSize: 12, fontWeight: 700, color: mkt.accent, letterSpacing: "0.04em" }}>
                INSTANT SEO ANALYSIS
              </span>
            </div>

            <h1
              data-testid="text-rankflow-demo-title"
              style={{
                fontSize: "clamp(32px, 4.5vw, 52px)",
                fontWeight: 700,
                color: mkt.onDark,
                lineHeight: 1.08,
                letterSpacing: "-0.035em",
                marginBottom: 16,
              }}
            >
              Free SEO Health Check
            </h1>
            <p
              style={{
                fontSize: "clamp(15px, 1.7vw, 18px)",
                color: mkt.onDarkFaint,
                lineHeight: 1.65,
                maxWidth: 540,
              }}
            >
              Enter your website URL and get an instant SEO score with actionable recommendations.
              See how your site stacks up in speed, mobile, and search visibility.
            </p>
          </div>
        </section>

        {/* URL input */}
        <section style={{ background: mkt.bg, padding: "56px 28px 40px" }}>
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            <div
              style={{
                background: mkt.surface,
                border: `1px solid ${mkt.border}`,
                borderRadius: 20,
                padding: "28px 24px",
              }}
            >
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: mkt.text,
                  marginBottom: 6,
                  letterSpacing: "-0.02em",
                }}
              >
                Analyze your website
              </h2>
              <p style={{ fontSize: 14, color: mkt.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
                We will check page speed, mobile-friendliness, and SEO structure.
              </p>

              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <Search
                    size={16}
                    color={mkt.textMuted}
                    style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}
                  />
                  <input
                    className="rankflow-input"
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                    placeholder="yourwebsite.com"
                    style={{
                      width: "100%",
                      padding: "14px 16px 14px 40px",
                      borderRadius: 12,
                      border: `1px solid ${mkt.border}`,
                      background: mkt.bg,
                      color: mkt.text,
                      fontSize: 15,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <button
                  className="analyze-btn"
                  onClick={handleAnalyze}
                  disabled={loading}
                  style={{
                    padding: "14px 24px",
                    borderRadius: 12,
                    border: "none",
                    background: mkt.accent,
                    color: mkt.dark,
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: loading ? "wait" : "pointer",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease",
                    opacity: loading ? 0.7 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {loading ? "Analyzing..." : "Analyze My SEO"}
                </button>
              </div>

              {error && (
                <p style={{ fontSize: 13, color: "#EF4444", marginTop: 10 }}>{error}</p>
              )}
            </div>
          </div>
        </section>

        {/* Loading scanner */}
        {loading && (
          <section style={{ background: mkt.bg, padding: "0 28px 56px" }}>
            <div style={{ maxWidth: 560, margin: "0 auto" }}>
              <div
                style={{
                  background: mkt.surface,
                  border: `1px solid ${mkt.border}`,
                  borderRadius: 16,
                  padding: "40px 28px",
                  textAlign: "center",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Scan line */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: `linear-gradient(90deg, transparent, ${mkt.accent}, transparent)`,
                    animation: "scanLine 2s ease-in-out infinite",
                  }}
                />

                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    background: "rgba(13,60,252,0.10)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 20px",
                    animation: "scanPulse 2s ease infinite",
                  }}
                >
                  <Search size={24} color={mkt.accent} />
                </div>

                <h3 style={{ fontSize: 18, fontWeight: 700, color: mkt.text, marginBottom: 8 }}>
                  Scanning your website
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    color: mkt.accent,
                    fontWeight: 500,
                    animation: "scanPulse 1.5s ease infinite",
                  }}
                >
                  {scanPhase}
                </p>

                {/* Progress dots */}
                <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 20 }}>
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: mkt.accent,
                        opacity: 0.3,
                        animation: `scanPulse 1.2s ease infinite`,
                        animationDelay: `${i * 0.2}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Results */}
        {result && !loading && (
          <section ref={resultsRef} style={{ background: mkt.bg, padding: "0 28px 64px" }}>
            <div style={{ maxWidth: 640, margin: "0 auto" }}>

              {/* Overall grade */}
              <div
                style={{
                  background: mkt.surface,
                  border: `1px solid ${mkt.border}`,
                  borderRadius: 20,
                  padding: "40px 28px",
                  textAlign: "center",
                  marginBottom: 20,
                  animation: "scoreReveal 0.6s ease forwards",
                }}
              >
                <div
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: "50%",
                    border: `4px solid ${gradeColor(result.score)}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 16px",
                    boxShadow: gradeGlow(result.score),
                  }}
                >
                  <span
                    style={{
                      fontSize: 44,
                      fontWeight: 700,
                      color: gradeColor(result.score),
                      lineHeight: 1,
                    }}
                  >
                    {result.score}
                  </span>
                </div>
                <h2
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: mkt.text,
                    marginBottom: 6,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Overall SEO Score
                </h2>
                <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.5 }}>
                  {result.score === "A"
                    ? "Great job! Your site is performing well."
                    : result.score === "B"
                    ? "Good foundation, but there is room for improvement."
                    : result.score === "C"
                    ? "Average performance. Several issues need attention."
                    : "Your site has significant issues affecting visibility."}
                </p>
              </div>

              {/* Speed scores */}
              <div
                style={{
                  background: mkt.surface,
                  border: `1px solid ${mkt.border}`,
                  borderRadius: 16,
                  padding: "28px 24px",
                  marginBottom: 20,
                }}
              >
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: mkt.text,
                    marginBottom: 20,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Gauge size={20} color={mkt.accent} />
                  Performance Scores
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 24,
                    justifyItems: "center",
                  }}
                >
                  <ScoreRing score={result.mobileScore} label="Mobile" size={90} />
                  <ScoreRing score={result.desktopScore} label="Desktop" size={90} />
                </div>

                {/* Core Web Vitals */}
                {(result.mobile || result.desktop) && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: mkt.textMuted, marginBottom: 8, letterSpacing: "0.03em" }}>
                      CORE WEB VITALS
                    </div>
                    {result.mobile?.fcp !== null && (
                      <MetricRow
                        icon={<Zap size={16} />}
                        label="First Contentful Paint"
                        value={String(result.mobile?.fcp ?? result.desktop?.fcp ?? "--")}
                        unit="s"
                        good={result.mobile?.fcp != null ? result.mobile.fcp < 1.8 : null}
                      />
                    )}
                    {result.mobile?.lcp !== null && (
                      <MetricRow
                        icon={<Clock size={16} />}
                        label="Largest Contentful Paint"
                        value={String(result.mobile?.lcp ?? result.desktop?.lcp ?? "--")}
                        unit="s"
                        good={result.mobile?.lcp != null ? result.mobile.lcp < 2.5 : null}
                      />
                    )}
                    {result.mobile?.tbt !== null && (
                      <MetricRow
                        icon={<Smartphone size={16} />}
                        label="Total Blocking Time"
                        value={String(result.mobile?.tbt ?? result.desktop?.tbt ?? "--")}
                        unit="ms"
                        good={result.mobile?.tbt != null ? result.mobile.tbt < 200 : null}
                      />
                    )}
                    {result.mobile?.cls !== null && (
                      <MetricRow
                        icon={<Monitor size={16} />}
                        label="Cumulative Layout Shift"
                        value={String((result.mobile?.cls ?? result.desktop?.cls ?? 0).toFixed(3))}
                        unit=""
                        good={result.mobile?.cls != null ? result.mobile.cls < 0.1 : null}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Top issues */}
              <div
                style={{
                  background: mkt.surface,
                  border: `1px solid ${mkt.border}`,
                  borderRadius: 16,
                  padding: "28px 24px",
                  marginBottom: 20,
                }}
              >
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: mkt.text,
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <AlertTriangle size={20} color="#F7B430" />
                  Top Issues Found
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {result.issues.map((issue, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "14px 16px",
                        background: mkt.bg,
                        border: `1px solid ${mkt.border}`,
                        borderRadius: 12,
                        opacity: 0,
                        animation: `scoreReveal 0.4s ease forwards`,
                        animationDelay: `${0.3 + i * 0.15}s`,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: mkt.text }}>{issue.title}</span>
                        <SeverityBadge level={issue.severity} />
                      </div>
                      <p style={{ fontSize: 13, color: mkt.textMuted, lineHeight: 1.5, margin: 0 }}>
                        {issue.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Email gate */}
              {!emailUnlocked && (
                <EmailGate onSubmit={() => setEmailUnlocked(true)} />
              )}

              {/* Full recommendations (after email) */}
              {emailUnlocked && result.recommendations.length > 0 && (
                <div
                  style={{
                    background: mkt.surface,
                    border: `1px solid ${mkt.border}`,
                    borderRadius: 16,
                    padding: "28px 24px",
                    marginBottom: 20,
                    animation: "scoreReveal 0.5s ease forwards",
                  }}
                >
                  <h3
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: mkt.text,
                      marginBottom: 16,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <TrendingUp size={20} color="#10B981" />
                    Recommended Fixes
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {result.recommendations.map((rec, i) => (
                      <div
                        key={i}
                        style={{
                          padding: "14px 16px",
                          background: mkt.bg,
                          border: `1px solid ${mkt.border}`,
                          borderRadius: 12,
                          opacity: 0,
                          animation: `scoreReveal 0.4s ease forwards`,
                          animationDelay: `${i * 0.12}s`,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <CheckCircle size={16} color="#10B981" />
                          <span style={{ fontSize: 14, fontWeight: 600, color: mkt.text }}>{rec.title}</span>
                          <SeverityBadge level={rec.impact} />
                        </div>
                        <p style={{ fontSize: 13, color: mkt.textMuted, lineHeight: 1.5, margin: 0, paddingLeft: 24 }}>
                          {rec.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA */}
              {emailUnlocked && (
                <div
                  style={{
                    padding: "28px 24px",
                    background: `linear-gradient(135deg, rgba(13,60,252,0.06) 0%, rgba(13,60,252,0.02) 100%)`,
                    border: `1px solid ${mkt.border}`,
                    borderRadius: 16,
                    textAlign: "center",
                  }}
                >
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: mkt.text, marginBottom: 8 }}>
                    Want us to fix these issues?
                  </h3>
                  <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.55, marginBottom: 20 }}>
                    RankFlow handles keyword targeting, page optimization, and local SEO every month
                    so your rankings keep improving.
                  </p>
                  <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                    <Link
                      href="/wizard"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "12px 24px",
                        borderRadius: 10,
                        background: mkt.accent,
                        color: mkt.dark,
                        fontSize: 14,
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      Start RankFlow <ArrowRight size={14} />
                    </Link>
                    <Link
                      href="/products/rankflow"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "12px 24px",
                        borderRadius: 10,
                        background: "transparent",
                        color: mkt.text,
                        fontSize: 14,
                        fontWeight: 600,
                        textDecoration: "none",
                        border: `1px solid ${mkt.border}`,
                      }}
                    >
                      Learn More
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Bottom CTA */}
        <section
          style={{
            background: `linear-gradient(135deg, ${mkt.accent} 0%, ${mkt.accentHover} 100%)`,
            padding: "64px 28px",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 520, margin: "0 auto" }}>
            <h2
              style={{
                fontSize: "clamp(22px, 3vw, 34px)",
                fontWeight: 700,
                color: mkt.dark,
                letterSpacing: "-0.025em",
                marginBottom: 12,
                lineHeight: 1.12,
              }}
            >
              Stop guessing. Start ranking.
            </h2>
            <p
              style={{
                fontSize: 15,
                color: "rgba(23,24,24,0.7)",
                lineHeight: 1.55,
                marginBottom: 28,
              }}
            >
              RankFlow handles your local SEO every month so you can focus on jobs.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href="/wizard"
                style={{
                  display: "inline-block",
                  padding: "14px 32px",
                  borderRadius: 9999,
                  background: mkt.dark,
                  color: mkt.accent,
                  fontSize: 15,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Start Free Trial
              </Link>
              <Link
                href="/pricing"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "14px 24px",
                  borderRadius: 9999,
                  background: "transparent",
                  color: mkt.dark,
                  fontSize: 15,
                  fontWeight: 600,
                  textDecoration: "none",
                  border: "1.5px solid rgba(23,24,24,0.2)",
                }}
              >
                View Pricing
              </Link>
            </div>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}
