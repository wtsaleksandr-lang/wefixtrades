import { useState, useEffect, useRef, useCallback } from "react";
import { Phone, FileText, Star, MapPin } from "lucide-react";

const TABS = [
  {
    key: "calls",
    label: "CALLS",
    icon: Phone,
    iconBg: "rgba(250,78,29,0.12)",
    iconColor: "#FA4E1D",
    fillColor: "rgba(250,78,29,0.14)",
    title: "Calls handled instantly",
    desc: "When customers call, they get a response right away — even when you're on the job. Every opportunity is captured and organized.",
    cards: [
      { text: "Incoming call", accent: "#FA4E1D" },
      { text: "Call captured", accent: "#10B981" },
      { text: "Follow-up scheduled", accent: "#0d3cfc" },
    ],
  },
  {
    key: "quotes",
    label: "QUOTES",
    icon: FileText,
    iconBg: "rgba(250,190,40,0.14)",
    iconColor: "#D4A017",
    fillColor: "rgba(250,190,40,0.18)",
    title: "Quotes delivered immediately",
    desc: "Customers can request pricing directly from your website without waiting for a callback.",
    cards: [
      { text: "Service selected", accent: "#D4A017" },
      { text: "Price range", accent: "#0d3cfc" },
      { text: "Quote ready", accent: "#10B981" },
    ],
  },
  {
    key: "reviews",
    label: "REVIEWS",
    icon: Star,
    iconBg: "rgba(16,185,129,0.12)",
    iconColor: "#10B981",
    fillColor: "rgba(16,185,129,0.14)",
    title: "Reviews collected automatically",
    desc: "After the job is done, customers are prompted to leave a review, helping build a stronger reputation over time.",
    cards: [
      { text: "★★★★★", accent: "#F59E0B" },
      { text: "Customer feedback received", accent: "#10B981" },
      { text: "Review published", accent: "#0d3cfc" },
    ],
  },
  {
    key: "visibility",
    label: "VISIBILITY",
    icon: MapPin,
    iconBg: "rgba(13,60,252,0.14)",
    iconColor: "#0b34d6",
    fillColor: "rgba(13,60,252,0.16)",
    title: "Stay visible where customers search",
    desc: "Your business information and customer feedback stay active and up to date, helping more customers find you.",
    cards: [
      { text: "Business listing", accent: "#0d3cfc" },
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
      <style>{`
        .sh-tab-btn {
          transition: background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
        }
        .sh-tab-btn:hover {
          background: rgba(255,255,255,0.55) !important;
        }
        .sh-content-fade {
          animation: shFadeIn 0.35s ease forwards;
        }
        @keyframes shFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 700px) {
          .sh-tab-row { flex-wrap: wrap !important; justify-content: flex-start !important; }
          .sh-tab-btn { flex: 1 1 calc(50% - 6px) !important; }
          .sh-panel-grid { grid-template-columns: 1fr !important; }
          .sh-cards-col { justify-content: center !important; }
        }
      `}</style>

      <div style={{ maxWidth: 1120, margin: "0 auto" }}>

        {/* ── eyebrow ───────────────────────────────────────── */}
        <div
          style={{
            fontSize: 12,
            letterSpacing: "0.18em",
            fontWeight: 600,
            textTransform: "uppercase" as const,
            color: "rgba(15,30,35,0.50)",
            marginBottom: 18,
            textAlign: "center",
          }}
        >
          Built for trades
        </div>

        {/* ── tab bar ───────────────────────────────────────── */}
        <div
          className="sh-tab-row"
          role="tablist"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 20,
          }}
        >
          {TABS.map((t, i) => {
            const Icon = t.icon;
            const isActive = i === active;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={isActive}
                data-testid={`sh-tab-${t.key}`}
                onClick={() => startCycle(i)}
                className="sh-tab-btn"
                style={{
                  position: "relative",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 16px 8px 8px",
                  borderRadius: 14,
                  background: isActive
                    ? "rgba(255,255,255,0.45)"
                    : "rgba(255,255,255,0.30)",
                  border: `1px solid ${isActive
                    ? "rgba(255,255,255,0.75)"
                    : "rgba(255,255,255,0.45)"}`,
                  boxShadow: isActive
                    ? "0 2px 12px rgba(0,0,0,0.08)"
                    : "none",
                  cursor: "pointer",
                  textAlign: "left" as const,
                  outline: "none",
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
                      background: t.fillColor,
                      borderRadius: "inherit",
                      transition: "width 60ms linear",
                      pointerEvents: "none",
                      zIndex: 0,
                    }}
                  />
                )}
                <div
                  style={{
                    position: "relative",
                    zIndex: 1,
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: t.iconBg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={20} color={t.iconColor} strokeWidth={1.8} />
                </div>
                <span
                  style={{
                    position: "relative",
                    zIndex: 1,
                    fontSize: 13,
                    letterSpacing: "0.12em",
                    fontWeight: 600,
                    textTransform: "uppercase" as const,
                    color: "#1C2B33",
                  }}
                >
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── content panel ─────────────────────────────────── */}
        <div
          style={{
            background: "rgba(255,255,255,0.55)",
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.65)",
            padding: "48px 52px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          }}
        >
          <div
            className="sh-panel-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 3fr",
              gap: 48,
              alignItems: "center",
            }}
          >
            {/* left: text */}
            <div key={tab.key} className="sh-content-fade">
              <h2
                style={{
                  fontSize: "clamp(22px, 2.8vw, 32px)",
                  fontWeight: 700,
                  lineHeight: 1.2,
                  color: "#0F1E23",
                  letterSpacing: "-0.02em",
                  margin: "0 0 16px",
                }}
              >
                {tab.title}
              </h2>
              <p
                style={{
                  fontSize: 16,
                  lineHeight: 1.6,
                  color: "rgba(15,30,35,0.65)",
                  margin: 0,
                  maxWidth: 420,
                }}
              >
                {tab.desc}
              </p>
            </div>

            {/* right: cards */}
            <div
              key={`${tab.key}-cards`}
              className="sh-content-fade sh-cards-col"
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              {tab.cards.map((card, ci) => (
                <div
                  key={ci}
                  style={{
                    background: "rgba(255,255,255,0.75)",
                    border: "1px solid rgba(255,255,255,0.65)",
                    borderRadius: 18,
                    padding: "18px 20px",
                    boxShadow: "0 20px 50px rgba(15,23,42,0.10)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
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
                  <span style={{ fontSize: 15, fontWeight: 500, color: "#1C2B33" }}>
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
