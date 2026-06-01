import { useState, useEffect, useRef, useCallback } from "react";
import { Calculator, PhoneCall, MapPin, Gauge, Check, Clock } from "lucide-react";

const TABS = [
  {
    key: "billing",
    label: "QuoteQuick",
    icon: Calculator,
    accentColor: "#f87171",
    iconColor: "#f87171",
    badgeBg: "#fee0e0",
    title: "QuoteQuick — Instant Quotes",
    desc: "Customers get accurate prices on your website, 24/7. Every quote captures a lead with name, email, and phone. Live in 5 minutes — works alongside Jobber, Housecall Pro, or anything else.",
    features: [
      "Live on your website 24/7",
      "Captures name, email & phone",
      "Set up in 5 minutes",
    ],
  },
  {
    key: "charging",
    label: "TradeLine",
    icon: PhoneCall,
    accentColor: "#f7b430",
    iconColor: "#f7b430",
    badgeBg: "#fee09f",
    title: "TradeLine — 24/7 Receptionist",
    desc: "AI answers every call and chat — even at 2 AM. Quotes the job, books the appointment, texts the caller back. Replaces a $240/month answering service for a fraction of the cost.",
    features: [
      "Answers every call & chat",
      "Books the appointment",
      "Texts the caller back",
    ],
  },
  {
    key: "catalog",
    label: "MapGuard",
    icon: MapPin,
    accentColor: "#22b07c",
    iconColor: "#22b07c",
    badgeBg: "#d4f5d0",
    title: "MapGuard — Google Maps Visibility",
    desc: "We monitor your Google Business Profile every week and fix issues before customers see them. Wrong hours, broken images, suspensions — handled. You show up where customers are searching.",
    features: [
      "Weekly Google Profile checks",
      "Fixes issues before customers see",
      "Lands you in the Top-3 pack",
    ],
  },
  {
    key: "events",
    label: "WebFix",
    icon: Gauge,
    accentColor: "#0d3cfc",
    iconColor: "#0d3cfc",
    badgeBg: "#E6EAFF",
    title: "WebFix — Site Speed & SEO",
    desc: "We turn your site from slow and invisible to fast and ranked. Audit, fix, monitor. Lighthouse scores climb from 40s to 90s — and your Google rank follows.",
    features: [
      "Audit, fix, then monitor",
      "Lighthouse 40s → 90s",
      "Rankings follow speed",
    ],
  },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const CYCLE_MS = 8000;
const BUTTON_H = 44; // height of each button strip (px)
const SLIDER_H = 560; // total slider height (px) — taller to fit feature cards
const GAP = 4;
const BADGE_SIZE = 40; // icon badge width/height (px)

/* ── per-tab mockup panels — accurate to each real product ───────────── */

const CARD_SHADOW = "0 8px 24px rgba(34,40,42,0.12)";

/** QuoteQuick — an instant on-site quote calculator that captures the lead. */
function QuoteQuickMockup() {
  return (
    <div data-theme="light" style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        width: 240, background: "rgba(255,255,255,0.94)", borderRadius: 16,
        padding: "18px 16px", boxShadow: CARD_SHADOW,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#9CA3AF", textTransform: "uppercase" }}>Instant Quote</span>
          <span style={{ fontSize: 10, background: "rgba(16,185,129,0.12)", color: "#10B981", borderRadius: 6, padding: "3px 8px", fontWeight: 700 }}>Live</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 10 }}>Bathroom renovation</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {["80 sq ft", "Mid-range", "Tiled"].map((c) => (
            <span key={c} style={{ fontSize: 10, fontWeight: 600, color: "#E05C6A", background: "rgba(224,92,106,0.10)", borderRadius: 999, padding: "4px 9px" }}>{c}</span>
          ))}
        </div>
        {[["Labour", "$2,800"], ["Materials", "$1,450"]].map(([label, amt]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F3F4F6" }}>
            <span style={{ fontSize: 11, color: "#6B7280" }}>{label}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#111827" }}>{amt}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "10px 0 12px" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Your estimate</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>$4,250</span>
        </div>
        <div style={{ background: "#E05C6A", borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "white" }}>Book this job</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "white" }}>→</span>
        </div>
      </div>
      <div style={{
        position: "absolute", right: 0, bottom: 0,
        background: "#22282a", borderRadius: 16, padding: "12px 14px",
        boxShadow: CARD_SHADOW, minWidth: 150,
      }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>New lead captured</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 2 }}>Jordan M.</div>
        <div style={{ fontSize: 10, color: "#34D399" }}>just now · phone + email</div>
      </div>
    </div>
  );
}

/** TradeLine — AI receptionist answering a call, booking, texting back. */
function TradeLineMockup() {
  const lines = [
    { who: "AI", text: "Thanks for calling! How can I help?", me: true },
    { who: "Caller", text: "Need a quote for a water heater.", me: false },
    { who: "AI", text: "Got it — booking you for Tue 9 AM.", me: true },
  ];
  return (
    <div data-theme="light" style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        width: 244, background: "rgba(255,255,255,0.94)", borderRadius: 16,
        padding: "16px 14px", boxShadow: CARD_SHADOW,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>+1 (415) 678-2345</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: "#10B981", background: "rgba(16,185,129,0.12)", borderRadius: 999, padding: "3px 8px" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981" }} /> AI answering
          </span>
        </div>
        {lines.map((l, idx) => (
          <div key={idx} style={{ display: "flex", justifyContent: l.me ? "flex-start" : "flex-end", marginBottom: 7 }}>
            <span style={{
              maxWidth: "82%", fontSize: 11, lineHeight: 1.4, padding: "7px 10px", borderRadius: 12,
              background: l.me ? "#EEF2FF" : "#F3F4F6",
              color: l.me ? "#1e3a8a" : "#374151",
              borderBottomLeftRadius: l.me ? 3 : 12,
              borderBottomRightRadius: l.me ? 12 : 3,
            }}>{l.text}</span>
          </div>
        ))}
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, background: "#ECFDF5", borderRadius: 10, padding: "9px 11px" }}>
          <Clock size={14} color="#10B981" strokeWidth={2.4} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#047857" }}>Booked · Tue 9:00 AM</span>
        </div>
      </div>
      <div style={{
        position: "absolute", right: 0, bottom: 0,
        width: 150, background: "#22282a", borderRadius: 16, padding: "12px 12px 16px",
        boxShadow: CARD_SHADOW,
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ position: "relative", width: 46, height: 46, flexShrink: 0 }}>
            <div className="cs-pulse-ring" />
            <div className="cs-pulse-ring" />
            <div style={{
              position: "relative", zIndex: 1, width: 46, height: 46, borderRadius: "50%",
              background: "linear-gradient(135deg, #34D399 0%, #10B981 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 16px rgba(16,185,129,0.4)",
            }}>
              <PhoneCall size={20} color="white" strokeWidth={1.5} />
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#F9FAFB" }}>Answered in 1 ring</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>0 missed today</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** MapGuard — a local-rank geo-grid + Google Business Profile health. */
function MapGuardMockup() {
  // 5×5 rank grid — greens (top-3), ambers (mid), one red gap.
  const grid = [
    1, 1, 2, 3, 1,
    1, 2, 1, 4, 2,
    2, 1, 1, 2, 3,
    1, 3, 2, 5, 11,
    2, 1, 4, 8, 14,
  ];
  const dotColor = (r: number) => (r <= 3 ? "#16a34a" : r <= 10 ? "#eab308" : "#dc2626");
  return (
    <div data-theme="light" style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        width: 238, background: "rgba(255,255,255,0.94)", borderRadius: 16,
        padding: "16px 16px", boxShadow: CARD_SHADOW,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#9CA3AF", textTransform: "uppercase" }}>Local rank grid</span>
          <span style={{ fontSize: 10, background: "rgba(22,163,74,0.12)", color: "#16a34a", borderRadius: 6, padding: "3px 8px", fontWeight: 700 }}>Top 3</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 7, marginBottom: 14 }}>
          {grid.map((r, i) => (
            <div key={i} style={{
              aspectRatio: "1 / 1", borderRadius: 999, background: dotColor(r),
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 800, color: "white",
            }}>{r >= 21 ? "20+" : r}</div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Avg map rank</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#16a34a", letterSpacing: "-0.02em" }}>1.3</span>
        </div>
      </div>
      <div style={{
        position: "absolute", right: 0, bottom: 0,
        background: "#22282a", borderRadius: 16, padding: "12px 14px",
        boxShadow: CARD_SHADOW, minWidth: 150,
      }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 7 }}>Profile health</div>
        {[["Hours", true], ["Photos", true], ["Posts", true]].map(([label]) => (
          <div key={label as string} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Check size={12} color="#34D399" strokeWidth={3} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#F9FAFB" }}>{label}</span>
          </div>
        ))}
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Monitored weekly</div>
      </div>
    </div>
  );
}

/** WebFix — a Lighthouse performance score climbing 42 → 98. */
function WebFixMockup() {
  const R = 30;
  const C = 2 * Math.PI * R;
  const score = 98;
  return (
    <div data-theme="light" style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        width: 232, background: "rgba(255,255,255,0.94)", borderRadius: 16,
        padding: "16px 16px", boxShadow: CARD_SHADOW,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#9CA3AF", textTransform: "uppercase" }}>Lighthouse</span>
          <span style={{ fontSize: 10, background: "rgba(13,60,252,0.10)", color: "#0d3cfc", borderRadius: 6, padding: "3px 8px", fontWeight: 700 }}>Audited</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          <div style={{ position: "relative", width: 76, height: 76, flexShrink: 0 }}>
            <svg width="76" height="76" viewBox="0 0 76 76">
              <circle cx="38" cy="38" r={R} fill="none" stroke="#E5E7EB" strokeWidth="7" />
              <circle cx="38" cy="38" r={R} fill="none" stroke="#10B981" strokeWidth="7" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} transform="rotate(-90 38 38)" />
            </svg>
            <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 20, fontWeight: 800, color: "#111827" }}>{score}</span>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 2 }}>Performance</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700 }}>
              <span style={{ color: "#dc2626" }}>42</span>
              <span style={{ color: "#9CA3AF" }}>→</span>
              <span style={{ color: "#16a34a" }}>98</span>
            </div>
          </div>
        </div>
        {[["Largest paint", "0.9s"], ["SEO", "100"], ["Accessibility", "96"]].map(([label, val]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #F3F4F6" }}>
            <span style={{ fontSize: 11, color: "#6B7280" }}>{label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a" }}>{val}</span>
          </div>
        ))}
      </div>
      <div style={{
        position: "absolute", right: 0, bottom: 0,
        background: "#22282a", borderRadius: 16, padding: "12px 14px",
        boxShadow: CARD_SHADOW, minWidth: 138,
      }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>Load time</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#34D399" }}>0.9s</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>p75 · mobile</div>
      </div>
    </div>
  );
}

/** Feature/benefit cards shown beside each tab's mockup. */
function FeatureList({ items, color }: { items: readonly string[]; color: string }) {
  return (
    <div data-theme="light" style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 18 }}>
      {items.map((f) => (
        <div key={f} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 11px", borderRadius: 10,
          background: "rgba(255,255,255,0.6)", border: "1px solid rgba(34,40,42,0.08)",
        }}>
          <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, background: color, display: "grid", placeItems: "center" }}>
            <Check size={12} color="white" strokeWidth={3} />
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#22282a", lineHeight: 1.3 }}>{f}</span>
        </div>
      ))}
    </div>
  );
}

const MOCKUPS: Record<TabKey, React.ReactNode> = {
  billing: <QuoteQuickMockup />,
  charging: <TradeLineMockup />,
  catalog: <MapGuardMockup />,
  events: <WebFixMockup />,
};

/* ── main component ──────────────────────────────────────────────────── */

export default function CapabilitiesShowcase() {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const startCycle = useCallback((idx: number) => {
    setActive(idx);
    setProgress(0);
    startRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(elapsed / CYCLE_MS, 1);
      setProgress(pct);
      if (pct >= 1) startCycle((idx + 1) % TABS.length);
    }, 50);
  }, []);

  useEffect(() => {
    startCycle(0);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startCycle]);

  const CARD_TOP = BUTTON_H + 4; // button height + gap

  return (
    <section
      data-testid="capabilities-showcase"
      style={{
        background: "#92a6b0",
        /* compression: trimmed padding (was 80/64). */
        padding: isMobile ? "48px 16px" : "56px 28px",
        borderRadius: "28px 28px 0 0",
        marginTop: -28,
        position: "relative",
        zIndex: 1,
      }}
    >
      <style>{`
        @keyframes cs-pulse {
          0%   { transform: scale(1);   opacity: 0.55; }
          100% { transform: scale(2.4); opacity: 0;    }
        }
        .cs-pulse-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: rgba(52, 211, 153, 0.35);
          animation: cs-pulse 1.8s ease-out infinite;
          pointer-events: none;
        }
        .cs-pulse-ring:nth-child(2) {
          animation-delay: 0.9s;
        }
        /* Exact Effortel easing: cubic-bezier(0.632, -0.005, 0, 1.007) */
        .cs-button-outter {
          transition: flex-grow 0.65s cubic-bezier(0.632, -0.005, 0, 1.007);
        }
        .cs-content-item {
          transition: opacity 0.4s ease, transform 0.4s ease;
        }
        .cs-content-item.cs-visible {
          opacity: 1;
          transform: translateY(0);
        }
        .cs-content-item.cs-hidden {
          opacity: 0;
          transform: translateY(1em);
        }
        /* Mobile accordion open/close */
        .cs-mob-content {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.42s cubic-bezier(0.4, 0, 0.2, 1);
          border-radius: 0;
          background: transparent;
          border: none;
          overflow: hidden;
        }
        .cs-mob-content.cs-mob-open {
          grid-template-rows: 1fr;
        }
        .cs-mob-content > div {
          overflow: hidden;
        }
        .cs-mob-text {
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.3s ease 0.15s, transform 0.3s ease 0.15s;
        }
        .cs-mob-open .cs-mob-text {
          opacity: 1;
          transform: translateY(0);
        }
        .cs-mob-visual {
          opacity: 0;
          transition: opacity 0.3s ease 0.28s;
        }
        .cs-mob-open .cs-mob-visual {
          opacity: 1;
        }

        @media (prefers-reduced-motion: reduce) {
          @keyframes cs-pulse { 0%, 100% { transform: none; opacity: 0.55; } }
          .cs-pulse-ring { animation: none; }
          .cs-mob-visual { transition: none; }
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* ── heading ───────────────────────────────────────── */}
        <div style={{ textAlign: "left", marginBottom: 20 }}>
          <div style={{
            fontSize: "0.8em",
            letterSpacing: "0.12em",
            fontWeight: 800,
            fontFamily: "monospace",
            textTransform: "uppercase" as const,
            color: "#92a6b0",
            opacity: 0.7,
            marginBottom: 8,
          }}>
            [ Efficiency, Scalability, and Agility ]
          </div>
          <h2 style={{ margin: 0 }}>
            <span style={{
              display: "block",
              fontSize: "clamp(32px, 4.5vw, 54px)",
              fontWeight: 800,
              lineHeight: 1.05,
              color: "#394247",
            }}>
              The four tools
            </span>
            <span style={{
              display: "block",
              fontSize: "clamp(34px, 4.8vw, 58px)",
              fontWeight: 800,
              lineHeight: 1.05,
              color: "#22282a",
            }}>
              that pay back fastest.
            </span>
          </h2>
        </div>

        {/* ── mobile accordion ──────────────────────────────── */}
        {isMobile && (
          <div role="tablist" aria-label="Capability tabs" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {TABS.map((t, i) => {
              const Icon = t.icon;
              const isActive = i === active;
              return (
                <div key={t.key} style={{
                  borderRadius: 14,
                  background: isActive ? "rgba(255,255,255,0.30)" : "transparent",
                  border: "1px solid rgba(255,255,255,0.22)",
                  overflow: "hidden",
                }}>
                  {/* button strip */}
                  {/* aria fix: was role="button" with aria-selected (invalid
                   * combo per WAI-ARIA — aria-selected is allowed on tab /
                   * option / gridcell only). Switched to role="tab" since
                   * this IS a tab strip. */}
                  <div
                    role="tab"
                    aria-selected={isActive}
                    tabIndex={isActive ? 0 : -1}
                    data-testid={`cs-tab-${t.key}`}
                    onClick={() => startCycle(i)}
                    style={{
                      height: BUTTON_H,
                      borderRadius: 12,
                      background: "transparent",
                      border: "none",
                      boxShadow: "none",
                      display: "flex",
                      alignItems: "center",
                      padding: 3, gap: 10,
                      cursor: "pointer",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {/* timeline fill */}
                    <div style={{
                      position: "absolute", inset: 0,
                      background: "rgba(255,255,255,0.42)",
                      width: isActive ? `${progress * 100}%` : "0%",
                      transition: isActive ? "width 60ms linear" : "none",
                      borderRadius: "inherit", zIndex: 0,
                    }} />
                    {/* icon badge */}
                    <div style={{
                      width: BADGE_SIZE, height: BADGE_SIZE,
                      borderRadius: 10, background: t.badgeBg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, position: "relative", zIndex: 1,
                    }}>
                      <Icon size={16} color="#22282a" strokeWidth={2} />
                    </div>
                    {/* label */}
                    <span style={{
                      position: "relative", zIndex: 2,
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 12, fontWeight: 500, color: "#394247",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.06em",
                      paddingRight: 14,
                    }}>
                      {t.label}
                    </span>
                  </div>

                  {/* expandable content */}
                  <div className={`cs-mob-content${isActive ? " cs-mob-open" : ""}`}>
                    <div>
                      {/* text */}
                      <div className="cs-mob-text" style={{ padding: "24px 20px 16px" }}>
                        <h3 style={{
                          fontSize: 20, fontWeight: 700, lineHeight: 1.25,
                          color: "#0F1E23", letterSpacing: "-0.02em", margin: "0 0 12px",
                        }}>
                          {t.title}
                        </h3>
                        <p style={{
                          fontSize: 14, lineHeight: 1.65,
                          color: "rgba(15,30,35,0.62)", margin: 0,
                        }}>
                          {t.desc}
                        </p>
                        <FeatureList items={t.features} color={t.accentColor} />
                      </div>
                      {/* mockup — fixed height so absolute-positioned cards work */}
                      <div className="cs-mob-visual" style={{
                        height: 280, position: "relative",
                        margin: "0 20px 24px",
                        borderRadius: 12,
                        overflow: "hidden",
                      }}>
                        {MOCKUPS[t.key as TabKey]}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── desktop horizontal accordion ──────────────────── */}
        {!isMobile && (
        <div
          className="cs-slider"
          style={{
            position: "relative",
            height: SLIDER_H,
          }}
        >
          {/* background card behind content area */}
          <div style={{
            position: "absolute",
            top: CARD_TOP + 2, left: 0, right: 0, bottom: 0,
            background: "#f5fcff",
            border: "1px solid #d5e1e7",
            borderRadius: 10,
            boxShadow: "0 1px 3px rgba(34,40,42,0.06)",
          }} />

          {/* buttons row */}
          <div
            role="tablist"
            aria-label="Capability tabs"
            className="cs-buttons-wrap"
            style={{
              position: "relative", zIndex: 2,
              display: "flex", flexDirection: "row", gap: GAP,
            }}
          >
            {TABS.map((t, i) => {
              const Icon = t.icon;
              const isActive = i === active;
              return (
                <div
                  key={t.key}
                  className={`cs-button-outter${isActive ? " cs-active" : ""}`}
                  style={{ flexGrow: isActive ? 2 : 1, flexShrink: 0, flexBasis: 0, minWidth: 0 }}
                >
                  {/* aria fix: same as mobile sibling — role="tab" so
                   * aria-selected is valid (was role="button"). */}
                  <div
                    role="tab"
                    aria-selected={isActive}
                    tabIndex={isActive ? 0 : -1}
                    data-testid={`cs-tab-${t.key}`}
                    onClick={() => startCycle(i)}
                    style={{
                      height: BUTTON_H, borderRadius: 10,
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.22)",
                      boxShadow: "none",
                      display: "flex", alignItems: "center",
                      padding: 3, gap: 10,
                      cursor: "pointer", position: "relative", overflow: "hidden",
                    }}
                  >
                    {/* timeline fill */}
                    <div style={{
                      position: "absolute", inset: 0,
                      background: "rgba(255,255,255,0.42)",
                      width: isActive ? `${progress * 100}%` : "0%",
                      transition: isActive ? "width 60ms linear" : "none",
                      borderRadius: "inherit", zIndex: 0,
                    }} />
                    {/* icon badge */}
                    <div style={{
                      width: BADGE_SIZE, height: BADGE_SIZE,
                      borderRadius: 10, background: t.badgeBg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, position: "relative", zIndex: 1,
                    }}>
                      <Icon size={16} color="#22282a" strokeWidth={2} />
                    </div>
                    <span style={{
                      position: "relative", zIndex: 2,
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 12, fontWeight: 500, color: "#394247",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.06em",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      paddingRight: 14,
                    }}>
                      {t.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* content layer */}
          <div style={{
            position: "absolute", top: CARD_TOP + GAP,
            left: 0, right: 0, bottom: 0, zIndex: 1,
          }}>
            {TABS.map((t, i) => {
              const isActive = i === active;
              return (
                <div
                  key={t.key}
                  className="cs-content-area"
                  style={{
                    position: "absolute", inset: 0,
                    display: "flex", flexDirection: "row",
                    opacity: isActive ? 1 : 0,
                    transition: "opacity 0.35s ease",
                    pointerEvents: isActive ? "auto" : "none",
                  }}
                >
                  <div
                    className={`cs-content-item ${isActive ? "cs-visible" : "cs-hidden"}`}
                    style={{
                      flex: "0 0 38%",
                      display: "flex", flexDirection: "column", justifyContent: "center",
                      padding: "40px 28px 40px 48px",
                      transitionDelay: isActive ? "0.35s" : "0s",
                    }}
                  >
                    <h3 style={{
                      fontSize: "clamp(20px, 2.2vw, 28px)", fontWeight: 700,
                      lineHeight: 1.2, color: "#22282a",
                      letterSpacing: "-0.02em", margin: "0 0 16px",
                    }}>
                      {t.title}
                    </h3>
                    <p style={{
                      fontSize: 15, lineHeight: 1.7,
                      color: "#5f6f77", margin: 0,
                    }}>
                      {t.desc}
                    </p>
                    <FeatureList items={t.features} color={t.accentColor} />
                  </div>
                  <div
                    className={`cs-content-item ${isActive ? "cs-visible" : "cs-hidden"}`}
                    style={{
                      flex: "0 0 62%",
                      padding: "28px 44px 36px 16px",
                      transitionDelay: isActive ? "0.5s" : "0s",
                    }}
                  >
                    {MOCKUPS[t.key as TabKey]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}

      </div>
    </section>
  );
}
