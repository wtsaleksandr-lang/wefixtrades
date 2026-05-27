import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Shield, Star, MessageCircle, Send, ThumbsUp, TrendingUp, Lock, ChevronRight, Bell, BarChart3, CheckCircle, SmartphoneIcon, ExternalLink } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { mkt } from "@/theme/tokens";

/* ─── Phone mockup ─── */
function PhoneMockup({ children, label }: { children: React.ReactNode; label: string }) {
  // CONTRAST-2 — phone bezel is dark-theme; page above renders inside a
  // light marketing layout. Mark this subtree so the lint exempts the
  // hardcoded #000 / #fff literals throughout the file.
  return (
    <div data-theme="dark" style={{ textAlign: "center" }}>
      <div
        style={{
          width: 280,
          margin: "0 auto",
          borderRadius: 28,
          border: `2px solid rgba(255,255,255,0.12)`,
          background: "#000",
          padding: "12px 8px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)",
        }}
      >
        {/* Notch */}
        <div
          style={{
            width: 80,
            height: 20,
            borderRadius: 10,
            background: "#000",
            margin: "0 auto 8px",
            position: "relative",
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#1a1a1a",
              position: "absolute",
              right: 12,
              top: 6,
            }}
          />
        </div>
        {/* Screen */}
        <div
          style={{
            borderRadius: 18,
            overflow: "hidden",
            background: "#fff",
            minHeight: 420,
          }}
        >
          {children}
        </div>
        {/* Home indicator */}
        <div
          style={{
            width: 100,
            height: 4,
            borderRadius: 2,
            background: "rgba(255,255,255,0.2)",
            margin: "10px auto 4px",
          }}
        />
      </div>
      <p style={{ fontSize: 13, fontWeight: 600, color: mkt.textMuted, marginTop: 14 }}>{label}</p>
    </div>
  );
}

/* ─── Step indicator ─── */
function StepNav({ current, total, onSelect }: { current: number; total: number; onSelect: (i: number) => void }) {
  const labels = ["SMS Request", "Review Page", "Dashboard"];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        marginBottom: 32,
      }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            borderRadius: 10,
            border: `1px solid ${i === current ? mkt.accent : mkt.border}`,
            background: i === current ? "rgba(13,60,252,0.10)" : "transparent",
            color: i === current ? mkt.accent : mkt.textMuted,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: i === current ? mkt.accent : mkt.surfaceAlt,
              color: i === current ? mkt.dark : mkt.textMuted,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {i + 1}
          </span>
          <span className="step-label">{labels[i]}</span>
        </button>
      ))}
    </div>
  );
}

/* ─── Stat card for dashboard ─── */
function StatCard({ label, value, change, icon }: { label: string; value: string; change?: string; icon: React.ReactNode }) {
  return (
    <div
      style={{
        background: mkt.bg,
        border: `1px solid ${mkt.border}`,
        borderRadius: 12,
        padding: "16px 14px",
        flex: 1,
        minWidth: 120,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ color: mkt.textMuted }}>{icon}</div>
        {change && (
          <span style={{ fontSize: 11, fontWeight: 600, color: "#10B981" }}>{change}</span>
        )}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: mkt.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: mkt.textMuted, marginTop: 4 }}>{label}</div>
    </div>
  );
}

/* ─── Email gate ─── */
function EmailGate({ businessName, onSubmit }: { businessName: string; onSubmit: () => void }) {
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
          company: businessName,
          trade: "reviews",
          source_tool: "reputationshield-demo",
          source_page: "/demos/reputationshield",
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
        maxWidth: 480,
        margin: "40px auto 0",
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
        Set up review requests for your business
      </h3>
      <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.55, marginBottom: 20 }}>
        Enter your email to get started with automated review requests.
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
          {submitting ? "..." : "Get Started"}
        </button>
      </div>
      {error && <p style={{ fontSize: 12, color: "#EF4444", marginTop: 8 }}>{error}</p>}
    </div>
  );
}

/* ─── Main ─── */
export default function ReputationShieldDemo() {
  const [businessName, setBusinessName] = useState("");
  const [yourName, setYourName] = useState("");
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [emailUnlocked, setEmailUnlocked] = useState(false);
  const [error, setError] = useState("");
  const [smsTyping, setSmsTyping] = useState(false);
  const [smsVisible, setSmsVisible] = useState(false);

  const displayBiz = businessName || "Your Business";
  const displayName = yourName || "there";

  const handleStart = () => {
    if (!businessName.trim() || !yourName.trim()) {
      setError("Please enter both fields to see the demo.");
      return;
    }
    setError("");
    setStarted(true);
    setSmsTyping(true);
    setTimeout(() => {
      setSmsTyping(false);
      setSmsVisible(true);
    }, 1500);
  };

  // Auto-advance typing indicator
  useEffect(() => {
    if (started && step === 0 && !smsVisible) {
      setSmsTyping(true);
      const timer = setTimeout(() => {
        setSmsTyping(false);
        setSmsVisible(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [step, started]);

  return (
    <MarketingLayout>
      <PageMeta
        title="ReputationShield Demo — see AI review responses in action"
        description="Try the ReputationShield demo. Watch AI draft personal replies to Google and Facebook reviews in your tone, flag 1-stars to your phone, and request reviews automatically."
        canonical="/demos/reputationshield"
      />
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes typingDot {
          0%, 60%, 100% { opacity: 0.3; }
          30% { opacity: 1; }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(13,60,252,0.3); }
          50% { box-shadow: 0 0 0 8px rgba(13,60,252,0); }
        }
        .repshield-input:focus {
          border-color: ${mkt.accent} !important;
          box-shadow: 0 0 0 3px rgba(13,60,252,0.15) !important;
        }
        .start-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(13,60,252,0.25);
        }
        @media (max-width: 600px) {
          .step-label { display: none; }
        }
      `}</style>

      <div data-testid="reputationshield-demo-page">
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
              top: -80,
              right: -120,
              width: 450,
              height: 450,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(16,185,129,0.10) 0%, transparent 70%)",
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
                background: "rgba(16,185,129,0.10)",
                border: "1px solid rgba(16,185,129,0.25)",
                borderRadius: 20,
                padding: "5px 14px",
                marginBottom: 20,
              }}
            >
              <Shield size={14} color="#10B981" />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#10B981", letterSpacing: "0.04em" }}>
                VISUAL DEMO
              </span>
            </div>

            <h1
              data-testid="text-reputationshield-demo-title"
              style={{
                fontSize: "clamp(32px, 4.5vw, 52px)",
                fontWeight: 700,
                color: mkt.onDark,
                lineHeight: 1.08,
                letterSpacing: "-0.035em",
                marginBottom: 16,
              }}
            >
              See ReputationShield in Action
            </h1>
            <p
              style={{
                fontSize: "clamp(15px, 1.7vw, 18px)",
                color: mkt.onDarkFaint,
                lineHeight: 1.65,
                maxWidth: 560,
              }}
            >
              Enter your business name and see exactly how automated review requests work
              — from SMS to review page to dashboard analytics.
            </p>
          </div>
        </section>

        {/* Input or demo */}
        <section style={{ background: mkt.bg, padding: "56px 28px 64px" }}>
          <div style={{ maxWidth: 800, margin: "0 auto" }}>

            {!started ? (
              /* ─── Input form ─── */
              <div
                style={{
                  maxWidth: 480,
                  margin: "0 auto",
                  background: mkt.surface,
                  border: `1px solid ${mkt.border}`,
                  borderRadius: 20,
                  padding: "32px 28px",
                }}
              >
                <h2
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: mkt.text,
                    marginBottom: 6,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Try the demo
                </h2>
                <p style={{ fontSize: 14, color: mkt.textMuted, marginBottom: 24, lineHeight: 1.5 }}>
                  See what your customers would receive after a completed job.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: mkt.textMuted, marginBottom: 6 }}>
                      Business name *
                    </label>
                    <input
                      className="repshield-input"
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g. Smith Plumbing"
                      style={{
                        width: "100%",
                        padding: "12px 16px",
                        borderRadius: 10,
                        border: `1px solid ${mkt.border}`,
                        background: mkt.bg,
                        color: mkt.text,
                        fontSize: 14,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: mkt.textMuted, marginBottom: 6 }}>
                      Your name *
                    </label>
                    <input
                      className="repshield-input"
                      type="text"
                      value={yourName}
                      onChange={(e) => setYourName(e.target.value)}
                      placeholder="e.g. John"
                      style={{
                        width: "100%",
                        padding: "12px 16px",
                        borderRadius: 10,
                        border: `1px solid ${mkt.border}`,
                        background: mkt.bg,
                        color: mkt.text,
                        fontSize: 14,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  {error && (
                    <p style={{ fontSize: 13, color: "#EF4444", margin: 0 }}>{error}</p>
                  )}

                  <button
                    className="start-btn"
                    onClick={handleStart}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      width: "100%",
                      padding: "14px 24px",
                      borderRadius: 12,
                      border: "none",
                      background: mkt.accent,
                      color: mkt.dark,
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "transform 0.2s ease, box-shadow 0.2s ease",
                    }}
                  >
                    <Shield size={16} />
                    See How It Works
                  </button>
                </div>
              </div>
            ) : (
              /* ─── Demo experience ─── */
              <div>
                <StepNav current={step} total={3} onSelect={setStep} />

                {/* Step 1: SMS mockup */}
                {step === 0 && (
                  <div style={{ animation: "fadeSlideUp 0.4s ease" }}>
                    <PhoneMockup label="What your customer receives via SMS">
                      <div style={{ padding: "16px 14px", minHeight: 420, display: "flex", flexDirection: "column" }}>
                        {/* SMS header */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            paddingBottom: 12,
                            borderBottom: "1px solid #eee",
                            marginBottom: 16,
                          }}
                        >
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: "50%",
                              background: "#10B981",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#fff",
                              fontSize: 14,
                              fontWeight: 700,
                            }}
                          >
                            {displayBiz.charAt(0)}
                          </div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{displayBiz}</div>
                            <div style={{ fontSize: 11, color: "#999" }}>via WeFixTrades</div>
                          </div>
                        </div>

                        {/* Chat messages */}
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                          {/* Incoming SMS */}
                          {smsVisible && (
                            <div
                              style={{
                                maxWidth: "85%",
                                background: "#E8F5E9",
                                borderRadius: "16px 16px 16px 4px",
                                padding: "12px 14px",
                                animation: "fadeSlideUp 0.4s ease",
                              }}
                            >
                              <p style={{ fontSize: 13, color: "#333", margin: 0, lineHeight: 1.5 }}>
                                Hi {displayName}! Thanks for choosing {displayBiz}. We hope you had a great experience!
                              </p>
                              <p style={{ fontSize: 13, color: "#333", margin: "8px 0 0", lineHeight: 1.5 }}>
                                Would you mind leaving us a quick review? It really helps our small business.
                              </p>
                              <p style={{ fontSize: 13, margin: "8px 0 0" }}>
                                <span
                                  style={{
                                    color: "#1976D2",
                                    textDecoration: "underline",
                                    fontWeight: 500,
                                    fontSize: 13,
                                  }}
                                >
                                  review.wefixtrades.com/{displayBiz.toLowerCase().replace(/\s+/g, "")}
                                </span>
                              </p>
                              <div style={{ fontSize: 10, color: "#999", marginTop: 6, textAlign: "right" }}>
                                Just now
                              </div>
                            </div>
                          )}

                          {/* Typing indicator */}
                          {smsTyping && (
                            <div
                              style={{
                                maxWidth: 60,
                                background: "#E8F5E9",
                                borderRadius: "16px 16px 16px 4px",
                                padding: "12px 14px",
                                display: "flex",
                                gap: 4,
                              }}
                            >
                              {[0, 1, 2].map((i) => (
                                <div
                                  key={i}
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: "50%",
                                    background: "#999",
                                    animation: `typingDot 1s ease infinite`,
                                    animationDelay: `${i * 0.2}s`,
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Tap to proceed */}
                        {smsVisible && (
                          <button
                            onClick={() => setStep(1)}
                            style={{
                              marginTop: 12,
                              padding: "10px 16px",
                              borderRadius: 10,
                              border: "none",
                              background: "#10B981",
                              color: "#fff",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                            }}
                          >
                            Customer taps the link <ChevronRight size={14} />
                          </button>
                        )}
                      </div>
                    </PhoneMockup>
                  </div>
                )}

                {/* Step 2: Review landing page */}
                {step === 1 && (
                  <div style={{ animation: "fadeSlideUp 0.4s ease" }}>
                    <PhoneMockup label="The review page your customer sees">
                      <div style={{ padding: 0, minHeight: 420 }}>
                        {/* Brand header */}
                        <div
                          style={{
                            background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                            padding: "24px 16px 20px",
                            textAlign: "center",
                          }}
                        >
                          <div
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 12,
                              background: "rgba(255,255,255,0.2)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              margin: "0 auto 10px",
                              color: "#fff",
                              fontSize: 18,
                              fontWeight: 700,
                            }}
                          >
                            {displayBiz.charAt(0)}
                          </div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
                            {displayBiz}
                          </div>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
                            How was your experience?
                          </div>
                        </div>

                        {/* Star rating */}
                        <div style={{ padding: "20px 16px", textAlign: "center" }}>
                          <p style={{ fontSize: 14, color: "#333", fontWeight: 500, marginBottom: 12 }}>
                            Hi {displayName}, how would you rate us?
                          </p>
                          <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                size={32}
                                fill={s <= 5 ? "#FFC107" : "none"}
                                color={s <= 5 ? "#FFC107" : "#ddd"}
                                style={{ cursor: "pointer" }}
                              />
                            ))}
                          </div>
                          <p style={{ fontSize: 11, color: "#999", marginTop: 8 }}>
                            Tap a star to rate your experience
                          </p>
                        </div>

                        {/* Shield explanation */}
                        <div
                          style={{
                            margin: "0 16px",
                            padding: "14px",
                            background: "#F0FFF4",
                            border: "1px solid #C6F6D5",
                            borderRadius: 10,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                            <Shield size={16} color="#10B981" style={{ flexShrink: 0, marginTop: 2 }} />
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#333", marginBottom: 2 }}>
                                The Shield in action
                              </div>
                              <div style={{ fontSize: 11, color: "#666", lineHeight: 1.4 }}>
                                5 stars? Customer goes to Google to leave a public review.
                                Low rating? Customer sees a private feedback form instead.
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* CTA buttons */}
                        <div style={{ padding: "16px 16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                          <button
                            style={{
                              width: "100%",
                              padding: "12px",
                              borderRadius: 10,
                              border: "none",
                              background: "#4285F4",
                              color: "#fff",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                            }}
                          >
                            <ExternalLink size={14} />
                            Leave a Google Review
                          </button>
                          <button
                            onClick={() => setStep(2)}
                            style={{
                              width: "100%",
                              padding: "10px",
                              borderRadius: 10,
                              border: "1px solid #ddd",
                              background: "#fff",
                              color: "#666",
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: "pointer",
                            }}
                          >
                            See your dashboard view →
                          </button>
                        </div>
                      </div>
                    </PhoneMockup>
                  </div>
                )}

                {/* Step 3: Dashboard mockup */}
                {step === 2 && (
                  <div style={{ animation: "fadeSlideUp 0.4s ease" }}>
                    <div
                      style={{
                        maxWidth: 640,
                        margin: "0 auto",
                        background: mkt.surface,
                        border: `1px solid ${mkt.border}`,
                        borderRadius: 20,
                        overflow: "hidden",
                      }}
                    >
                      {/* Dashboard header */}
                      <div
                        style={{
                          background: `linear-gradient(135deg, ${mkt.dark} 0%, #0F2744 100%)`,
                          padding: "20px 24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <div>
                          <h3 style={{ fontSize: 18, fontWeight: 700, color: mkt.onDark, margin: 0 }}>
                            {displayBiz} — Reviews
                          </h3>
                          <p style={{ fontSize: 12, color: mkt.onDarkFaint, margin: "4px 0 0" }}>
                            ReputationShield Dashboard
                          </p>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 12px",
                            borderRadius: 8,
                            background: "rgba(16,185,129,0.15)",
                            border: "1px solid rgba(16,185,129,0.3)",
                          }}
                        >
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", animation: "pulseGlow 2s ease infinite" }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#10B981" }}>Active</span>
                        </div>
                      </div>

                      {/* Stats */}
                      <div style={{ padding: "20px 24px" }}>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                          <StatCard icon={<Star size={16} />} label="Avg Rating" value="4.8" change="+0.2" />
                          <StatCard icon={<BarChart3 size={16} />} label="Total Reviews" value="47" change="+8" />
                          <StatCard icon={<Send size={16} />} label="Requests Sent" value="62" />
                          <StatCard icon={<Shield size={16} />} label="Shielded" value="3" />
                        </div>

                        {/* Recent reviews */}
                        <div style={{ marginBottom: 6 }}>
                          <h4 style={{ fontSize: 14, fontWeight: 700, color: mkt.text, marginBottom: 12 }}>
                            Recent Reviews
                          </h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {[
                              { name: "Sarah M.", stars: 5, text: "Excellent work! Very professional and on time. Would highly recommend.", time: "2 hours ago", responded: true },
                              { name: "James K.", stars: 5, text: "Great service, fair pricing. Will use again for sure.", time: "Yesterday", responded: false },
                              { name: "Lisa W.", stars: 4, text: "Good job overall. Minor issue resolved quickly.", time: "2 days ago", responded: true },
                            ].map((review, i) => (
                              <div
                                key={i}
                                style={{
                                  padding: "14px 16px",
                                  background: mkt.bg,
                                  border: `1px solid ${mkt.border}`,
                                  borderRadius: 12,
                                  opacity: 0,
                                  animation: `fadeSlideUp 0.4s ease forwards`,
                                  animationDelay: `${0.2 + i * 0.12}s`,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: mkt.text }}>{review.name}</span>
                                    <div style={{ display: "flex", gap: 2 }}>
                                      {Array.from({ length: review.stars }).map((_, j) => (
                                        <Star key={j} size={12} fill="#FFC107" color="#FFC107" />
                                      ))}
                                    </div>
                                  </div>
                                  <span style={{ fontSize: 11, color: mkt.textMuted }}>{review.time}</span>
                                </div>
                                <p style={{ fontSize: 13, color: mkt.textMuted, margin: 0, lineHeight: 1.5 }}>
                                  {review.text}
                                </p>
                                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                                  {review.responded ? (
                                    <span
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: "#10B981",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 4,
                                      }}
                                    >
                                      <CheckCircle size={12} /> Responded
                                    </span>
                                  ) : (
                                    <span
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: mkt.accent,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 4,
                                        cursor: "pointer",
                                      }}
                                    >
                                      <MessageCircle size={12} /> Draft AI Response
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Email gate */}
                    {!emailUnlocked && (
                      <EmailGate
                        businessName={businessName}
                        onSubmit={() => setEmailUnlocked(true)}
                      />
                    )}

                    {/* Post-unlock CTA */}
                    {emailUnlocked && (
                      <div
                        style={{
                          marginTop: 32,
                          padding: "28px 24px",
                          background: `linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(13,60,252,0.04) 100%)`,
                          border: `1px solid ${mkt.border}`,
                          borderRadius: 16,
                          textAlign: "center",
                          maxWidth: 480,
                          margin: "32px auto 0",
                          animation: "fadeSlideUp 0.4s ease",
                        }}
                      >
                        <h3 style={{ fontSize: 18, fontWeight: 700, color: mkt.text, marginBottom: 8 }}>
                          Ready to automate your reviews?
                        </h3>
                        <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.55, marginBottom: 20 }}>
                          ReputationShield sends review requests automatically after every job,
                          shields you from bad reviews, and helps you respond faster.
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
                            Start Free Trial <ArrowRight size={14} />
                          </Link>
                          <Link
                            href="/products/reputationshield"
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
                )}
              </div>
            )}
          </div>
        </section>

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
              Turn every job into a 5-star review
            </h2>
            <p
              style={{
                fontSize: 15,
                color: "rgba(23,24,24,0.7)",
                lineHeight: 1.55,
                marginBottom: 28,
              }}
            >
              Automated review requests, private feedback shield, and AI response drafts.
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
