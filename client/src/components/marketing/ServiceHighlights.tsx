import { useState, useEffect, useRef, useCallback } from "react";
import { Phone, FileText, Star, MapPin } from "lucide-react";

const TABS = [
  {
    key: "calls",
    label: "CALLS",
    icon: Phone,
    iconBg: "rgba(250,78,29,0.12)",
    iconColor: "#FA4E1D",
    title: "Calls handled instantly",
    desc: "When customers call, they get a response right away — even when you're on the job. Every opportunity is captured and organized.",
    cards: [
      { text: "Incoming call", accent: "#FA4E1D" },
      { text: "Call captured", accent: "#10B981" },
      { text: "Follow-up scheduled", accent: "#2F6BFF" },
    ],
  },
  {
    key: "quotes",
    label: "QUOTES",
    icon: FileText,
    iconBg: "rgba(250,190,40,0.14)",
    iconColor: "#D4A017",
    title: "Quotes delivered immediately",
    desc: "Customers can request pricing directly from your website without waiting for a callback.",
    cards: [
      { text: "Service selected", accent: "#D4A017" },
      { text: "Price range", accent: "#2F6BFF" },
      { text: "Quote ready", accent: "#10B981" },
    ],
  },
  {
    key: "reviews",
    label: "REVIEWS",
    icon: Star,
    iconBg: "rgba(16,185,129,0.12)",
    iconColor: "#10B981",
    title: "Reviews collected automatically",
    desc: "After the job is done, customers are prompted to leave a review, helping build a stronger reputation over time.",
    cards: [
      { text: "★★★★★", accent: "#F59E0B" },
      { text: "Customer feedback received", accent: "#10B981" },
      { text: "Review published", accent: "#2F6BFF" },
    ],
  },
  {
    key: "visibility",
    label: "VISIBILITY",
    icon: MapPin,
    iconBg: "rgba(102,232,250,0.14)",
    iconColor: "#54A1AB",
    title: "Stay visible where customers search",
    desc: "Your business information and customer feedback stay active and up to date, helping more customers find you.",
    cards: [
      { text: "Business listing", accent: "#2F6BFF" },
      { text: "Rating score", accent: "#F59E0B" },
      { text: "Visibility indicator", accent: "#10B981" },
    ],
  },
] as const;

const CYCLE_MS = 6000;

export default function ServiceHighlights() {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(Date.now());

  const startCycle = useCallback((idx: number) => {
    setActive(idx);
    setProgress(0);
    startRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(elapsed / CYCLE_MS, 1);
      setProgress(pct);
      if (pct >= 1) {
        const next = (idx + 1) % TABS.length;
        startCycle(next);
      }
    }, 50);
  }, []);

  useEffect(() => {
    startCycle(0);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startCycle]);

  const handleClick = (i: number) => {
    startCycle(i);
  };

  const tab = TABS[active];

  return (
    <section
      data-testid="service-highlights"
      className="service-highlights"
      style={{
        background: "#A7B6BF",
        padding: "100px 28px",
        position: "relative",
      }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
        }}
      >
        <div
          className="sh-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "220px 1fr 320px",
            gap: 64,
            alignItems: "start",
          }}
        >
          <div className="sh-tabs" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {TABS.map((t, i) => {
              const Icon = t.icon;
              const isActive = i === active;
              return (
                <button
                  key={t.key}
                  data-testid={`sh-tab-${t.key}`}
                  onClick={() => handleClick(i)}
                  className="sh-tab-btn"
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 18px",
                    borderRadius: 16,
                    background: isActive ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.40)",
                    border: `1px solid ${isActive ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.50)"}`,
                    cursor: "pointer",
                    overflow: "hidden",
                    textAlign: "left",
                    width: "100%",
                    transition: "background 0.3s ease, border-color 0.3s ease",
                  }}
                >
                  {isActive && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${progress * 100}%`,
                        background: "linear-gradient(90deg, rgba(95,209,220,0.25), rgba(47,107,255,0.25))",
                        borderRadius: "inherit",
                        transition: "width 60ms linear",
                        pointerEvents: "none",
                      }}
                    />
                  )}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: t.iconBg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    <Icon size={18} color={t.iconColor} strokeWidth={1.8} />
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      letterSpacing: "0.12em",
                      fontWeight: 600,
                      textTransform: "uppercase" as const,
                      color: "#1C2B33",
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="sh-content" style={{ paddingTop: 8 }}>
            <div
              style={{
                fontSize: 12,
                letterSpacing: "0.18em",
                fontWeight: 600,
                textTransform: "uppercase" as const,
                color: "rgba(15,30,35,0.50)",
                marginBottom: 18,
              }}
            >
              Built for trades
            </div>
            <div
              key={tab.key}
              className="sh-content-fade"
            >
              <h2
                style={{
                  fontSize: "clamp(28px, 3.5vw, 44px)",
                  fontWeight: 600,
                  lineHeight: 1.2,
                  color: "#0F1E23",
                  marginBottom: 18,
                  letterSpacing: "-0.02em",
                }}
              >
                {tab.title}
              </h2>
              <p
                style={{
                  fontSize: 18,
                  lineHeight: 1.55,
                  maxWidth: 520,
                  color: "rgba(15,30,35,0.70)",
                  margin: 0,
                }}
              >
                {tab.desc}
              </p>
            </div>
          </div>

          <div className="sh-visual" style={{ paddingTop: 16 }}>
            <div
              key={tab.key}
              className="sh-visual-fade"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {tab.cards.map((card, ci) => (
                <div
                  key={ci}
                  className="sh-float-card"
                  style={{
                    background: "rgba(255,255,255,0.75)",
                    border: "1px solid rgba(255,255,255,0.65)",
                    borderRadius: 18,
                    padding: "18px 20px",
                    boxShadow: "0 20px 50px rgba(15,23,42,0.10)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    animationDelay: `${ci * 0.8}s`,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: card.accent,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 500,
                      color: "#1C2B33",
                    }}
                  >
                    {card.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
