import { useState, useEffect, useRef, useCallback } from "react";
import { Receipt, Zap, Layers, Bell, PhoneCall } from "lucide-react";

const TABS = [
  {
    key: "billing",
    label: "Billing",
    icon: Receipt,
    accentColor: "#f87171",
    iconColor: "#f87171",
    badgeBg: "#fee0e0",
    sectorBg: "rgba(224, 92, 106, 0.30)",
    timelineBg: "rgba(224, 92, 106, 0.22)",
    title: "Billing Management",
    desc: "Streamline your invoicing and payment collection with automated billing workflows that reduce manual effort and improve cash flow.",
  },
  {
    key: "charging",
    label: "Charging",
    icon: Zap,
    accentColor: "#f7b430",
    iconColor: "#f7b430",
    badgeBg: "#fee09f",
    sectorBg: "rgba(212, 160, 23, 0.32)",
    timelineBg: "rgba(212, 160, 23, 0.22)",
    title: "Online Charging System",
    desc: "AI-powered insights that predict customer needs and drive personalized experiences across every touchpoint.",
  },
  {
    key: "catalog",
    label: "Catalog",
    icon: Layers,
    accentColor: "#4ade80",
    iconColor: "#4ade80",
    badgeBg: "#d4f5d0",
    sectorBg: "rgba(45, 184, 124, 0.30)",
    timelineBg: "rgba(45, 184, 124, 0.22)",
    title: "Product Catalog",
    desc: "Manage your complete service and product catalog with dynamic pricing and real-time availability across all channels.",
  },
  {
    key: "events",
    label: "Events",
    icon: Bell,
    accentColor: "#66e8fa",
    iconColor: "#66e8fa",
    badgeBg: "#dcf7fd",
    sectorBg: "rgba(59, 181, 200, 0.30)",
    timelineBg: "rgba(59, 181, 200, 0.22)",
    title: "Events & Notifications",
    desc: "Real-time event processing and intelligent notification routing that keeps your teams informed and customers engaged.",
  },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const CYCLE_MS = 8000;
const BUTTON_H = 44; // height of each button strip (px)
const SLIDER_H = 490; // total slider height (px)
const GAP = 4;
const BADGE_SIZE = 34; // icon badge width/height (px)

/* ── per-tab mockup panels ───────────────────────────────────────────── */

function BillingMockup() {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        width: 220,
        background: "rgba(255,255,255,0.92)",
        borderRadius: 16,
        padding: "18px 16px",
        boxShadow: "0 8px 24px rgba(34,40,42,0.12)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#9CA3AF", textTransform: "uppercase" }}>Invoice</span>
          <span style={{ fontSize: 10, background: "rgba(224,92,106,0.12)", color: "#E05C6A", borderRadius: 6, padding: "3px 8px", fontWeight: 600 }}>Due</span>
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#111827", letterSpacing: "-0.02em", marginBottom: 4 }}>$2,480.00</div>
        <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 14 }}>Due 15 Mar 2026</div>
        {[["Service Fee", "$1,800.00"], ["Tax (GST)", "$480.00"], ["Discount", "–$200.00"]].map(([label, amt]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F3F4F6" }}>
            <span style={{ fontSize: 11, color: "#6B7280" }}>{label}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#111827" }}>{amt}</span>
          </div>
        ))}
        <div style={{ marginTop: 12, background: "rgba(224,92,106,0.08)", borderRadius: 10, padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#E05C6A" }}>Pay Now</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#E05C6A" }}>→</span>
        </div>
      </div>
      <div style={{
        position: "absolute", right: 0, bottom: 0,
        background: "#22282a", borderRadius: 16, padding: "12px 14px",
        boxShadow: "0 8px 24px rgba(34,40,42,0.12)", minWidth: 140,
      }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>Last payment</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#34D399", marginBottom: 3 }}>$1,200.00</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>2 days ago · Stripe</div>
      </div>
    </div>
  );
}

function ChargingMockup() {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        width: 210,
        background: "rgba(255,255,255,0.92)",
        borderRadius: 16,
        padding: "16px 14px",
        boxShadow: "0 8px 24px rgba(34,40,42,0.12)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
              <div key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: "#111827", letterSpacing: "-0.02em" }}>€0.00</span>
          <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: 4 }}>/min</span>
        </div>
        {["COUNTRY", "CALL TYPE", "ZONE"].map((label) => (
          <div key={label} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "7px 10px", borderRadius: 8,
            background: "#F9FAFB", border: "1px solid #E5E7EB", marginBottom: 6,
          }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: "#9CA3AF", letterSpacing: "0.06em" }}>{label}</span>
            <span style={{ fontSize: 16, color: "#D1D5DB", fontWeight: 300, lineHeight: 1 }}>+</span>
          </div>
        ))}
      </div>
      <div style={{
        position: "absolute", right: 0, bottom: 0,
        width: 150, background: "#22282a", borderRadius: 16, padding: "12px 12px 16px",
        boxShadow: "0 8px 24px rgba(34,40,42,0.12)",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ position: "relative", width: 46, height: 46, flexShrink: 0 }}>
            {/* pulse rings */}
            <div className="cs-pulse-ring" />
            <div className="cs-pulse-ring" />
            {/* phone button */}
            <div style={{
              position: "relative", zIndex: 1,
              width: 46, height: 46, borderRadius: "50%",
              background: "linear-gradient(135deg, #34D399 0%, #10B981 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 16px rgba(16,185,129,0.4)",
            }}>
              <PhoneCall size={18} color="white" strokeWidth={1.5} />
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#F9FAFB" }}>+1 (415) 678-2345</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>Calling</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CatalogMockup() {
  const items = [
    { name: "Voice Bundle Pro", price: "$49/mo", badge: "Active", badgeColor: "#10B981" },
    { name: "Data Pack 10GB", price: "$29/mo", badge: "Active", badgeColor: "#10B981" },
    { name: "SMS Gateway", price: "$19/mo", badge: "Draft", badgeColor: "#9CA3AF" },
  ];
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        width: 230, background: "rgba(255,255,255,0.92)", borderRadius: 16,
        padding: "16px 14px", boxShadow: "0 8px 24px rgba(34,40,42,0.12)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#9CA3AF", textTransform: "uppercase" }}>Product Catalog</span>
          <span style={{ fontSize: 10, background: "rgba(45,184,124,0.12)", color: "#2DB87C", borderRadius: 6, padding: "3px 8px", fontWeight: 600 }}>3 active</span>
        </div>
        {items.map(({ name, price, badge, badgeColor }) => (
          <div key={name} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "9px 10px", borderRadius: 10,
            background: "#F9FAFB", border: "1px solid #E5E7EB", marginBottom: 7,
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{name}</div>
              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{price}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: badgeColor, background: `${badgeColor}18`, borderRadius: 6, padding: "3px 8px" }}>{badge}</span>
          </div>
        ))}
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px", borderRadius: 10, border: "1.5px dashed #D1D5DB" }}>
          <span style={{ fontSize: 16, color: "#9CA3AF", fontWeight: 300 }}>+</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF" }}>Add product</span>
        </div>
      </div>
      <div style={{
        position: "absolute", right: 0, bottom: 0,
        background: "#22282a", borderRadius: 16, padding: "12px 14px",
        boxShadow: "0 8px 24px rgba(34,40,42,0.12)", minWidth: 130,
      }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>Catalog sync</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#34D399" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "#F9FAFB" }}>Live · 3 systems</span>
        </div>
      </div>
    </div>
  );
}

function EventsMockup() {
  const events = [
    { label: "Call initiated", time: "0ms", color: "#3BB5C8" },
    { label: "Auth passed", time: "12ms", color: "#10B981" },
    { label: "Rate applied", time: "18ms", color: "#D4A017" },
    { label: "CDR written", time: "34ms", color: "#2DB87C" },
  ];
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        width: 230, background: "rgba(255,255,255,0.92)", borderRadius: 16,
        padding: "16px 14px", boxShadow: "0 8px 24px rgba(34,40,42,0.12)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#9CA3AF", textTransform: "uppercase" }}>Event Stream</span>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34D399" }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: "#34D399" }}>Live</span>
          </div>
        </div>
        {events.map(({ label, time, color }) => (
          <div key={label} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 8,
            background: "#F9FAFB", border: "1px solid #E5E7EB", marginBottom: 5,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: "#374151", flex: 1 }}>{label}</span>
            <span style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "monospace" }}>{time}</span>
          </div>
        ))}
        <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "#F3F4F6", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: "#6B7280" }}>Events today</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#111827" }}>24,891</span>
        </div>
      </div>
      <div style={{
        position: "absolute", right: 0, bottom: 0,
        background: "#22282a", borderRadius: 16, padding: "12px 14px",
        boxShadow: "0 8px 24px rgba(34,40,42,0.12)", minWidth: 136,
      }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>Avg latency</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#3BB5C8" }}>22ms</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>p99 · last 5 min</div>
      </div>
    </div>
  );
}

const MOCKUPS: Record<TabKey, React.ReactNode> = {
  billing: <BillingMockup />,
  charging: <ChargingMockup />,
  catalog: <CatalogMockup />,
  events: <EventsMockup />,
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
        padding: isMobile ? "64px 16px" : "80px 28px",
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
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* ── heading ───────────────────────────────────────── */}
        <div style={{ textAlign: "left", marginBottom: 32 }}>
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
              Unparalleled
            </span>
            <span style={{
              display: "block",
              fontSize: "clamp(34px, 4.8vw, 58px)",
              fontWeight: 800,
              lineHeight: 1.05,
              color: "#22282a",
            }}>
              BSS/OSS Capabilities
            </span>
          </h2>
        </div>

        {/* ── mobile accordion ──────────────────────────────── */}
        {isMobile && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                  <div
                    role="button"
                    aria-selected={isActive}
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
                      <Icon size={17} color="#22282a" strokeWidth={2} />
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
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          {/* background card behind content area */}
          <div style={{
            position: "absolute",
            top: CARD_TOP, left: 0, right: 0, bottom: 0,
            background: "#f5fcff",
            border: "1px solid #d5e1e7",
            borderRadius: 10,
            boxShadow: "0 1px 3px rgba(34,40,42,0.06)",
          }} />

          {/* buttons row */}
          <div
            className="cs-buttons-wrap"
            style={{
              position: "relative", zIndex: 2,
              display: "flex", flexDirection: "row", gap: GAP,
              borderBottom: "1px solid #d5e1e7",
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
                  <div
                    role="button"
                    aria-selected={isActive}
                    data-testid={`cs-tab-${t.key}`}
                    onClick={() => startCycle(i)}
                    style={{
                      height: BUTTON_H, borderRadius: 10,
                      background: "transparent",
                      border: "1px solid #d5e1e7",
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
                      <Icon size={17} color="#22282a" strokeWidth={2} />
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
