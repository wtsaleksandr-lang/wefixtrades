import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import { mkt } from "@/theme/tokens";

gsap.registerPlugin(ScrollTrigger);

// ── Shared ────────────────────────────────────────────────────────────

// Fine dot grid — visual column only
const dotGrid: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.055) 0.8px, transparent 0.8px)",
  backgroundSize: "16px 16px",
  zIndex: 0,
  pointerEvents: "none",
};

function MockupBar() {
  return (
    <div style={{
      height: 28, background: "rgba(255,255,255,0.04)",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      display: "flex", alignItems: "center",
      padding: "0 10px", gap: 5, flexShrink: 0,
    }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.12)" }} />
      ))}
    </div>
  );
}

// ── Mockup: Jobs Dashboard ────────────────────────────────────────────

function JobsDashboardMockup() {
  const jobs = [
    { name: "Bathroom Renovation", status: "CONFIRMED", date: "12 Mar", amount: "£1,240" },
    { name: "Boiler Service",      status: "PENDING",   date: "13 Mar", amount: "£185"   },
    { name: "Kitchen Plumbing",    status: "COMPLETED", date: "10 Mar", amount: "£560"   },
    { name: "Roof Repair",         status: "CONFIRMED", date: "14 Mar", amount: "£2,100" },
    { name: "Electrical Check",    status: "PENDING",   date: "15 Mar", amount: "£95"    },
  ];

  const badge: Record<string, React.CSSProperties> = {
    CONFIRMED: { background: "rgba(0,212,168,0.15)",  color: "#00D4A8", border: "1px solid rgba(0,212,168,0.25)"  },
    PENDING:   { background: "rgba(251,191,36,0.12)", color: "#FBBF24", border: "1px solid rgba(251,191,36,0.2)"  },
    COMPLETED: { background: "rgba(99,179,237,0.12)", color: "#63B3ED", border: "1px solid rgba(99,179,237,0.2)"  },
  };

  return (
    <div style={{ background: "#1e2825", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", width: "100%", overflow: "hidden" }}>
      <MockupBar />
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr>
            {["Job", "Status", "Date", "Amount"].map(h => (
              <th key={h} style={{
                padding: "8px 12px", textAlign: "left",
                color: "rgba(255,255,255,0.3)", fontWeight: 500,
                fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job, i) => (
            <tr key={i}>
              <td style={{ padding: "9px 12px", color: "rgba(255,255,255,0.75)", borderBottom: i < jobs.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>{job.name}</td>
              <td style={{ padding: "9px 12px", borderBottom: i < jobs.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <span style={{ ...badge[job.status], display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{job.status}</span>
              </td>
              <td style={{ padding: "9px 12px", color: "rgba(255,255,255,0.35)", borderBottom: i < jobs.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>{job.date}</td>
              <td style={{ padding: "9px 12px", color: "rgba(255,255,255,0.75)", fontWeight: 600, borderBottom: i < jobs.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>{job.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Mockup: Dashboard Widgets ─────────────────────────────────────────

function DashboardWidgetsMockup() {
  const r = 22, circ = 2 * Math.PI * r;
  const charts = [
    { label: "Completion Rate", pct: 78, color: "#66E8FA" },
    { label: "On-time Rate",    pct: 92, color: "#00D4A8" },
  ];

  return (
    <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {[
        { label: "Active Jobs", value: "47",     sub: "+8 this week" },
        { label: "Revenue",     value: "£8,240", sub: "This month"   },
      ].map((c, i) => (
        <div key={i} style={{ background: "#1e2522", borderRadius: 10, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>{c.label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>{c.value}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", marginTop: 3 }}>{c.sub}</div>
        </div>
      ))}
      {charts.map((c, i) => {
        const dash = (c.pct / 100) * circ;
        return (
          <div key={i} style={{ background: "#1e2522", borderRadius: 10, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 10 }}>
            <svg width={52} height={52} style={{ flexShrink: 0 }}>
              <circle cx={26} cy={26} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={4} />
              <circle cx={26} cy={26} r={r} fill="none" stroke={c.color} strokeWidth={4}
                strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 26 26)" />
              <text x={26} y={31} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">{c.pct}%</text>
            </svg>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", lineHeight: 1.35 }}>{c.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Mockup: Quote Builder ─────────────────────────────────────────────

function QuoteBuilderMockup() {
  const items = [
    { name: "Labour",       detail: "2h × £65/h",        amount: "£130.00" },
    { name: "Materials",    detail: "Pipe fittings × 4", amount: "£48.50"  },
    { name: "Call-out fee", detail: "Fixed",              amount: "£75.00"  },
  ];

  return (
    <div style={{ background: "#1e2825", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", width: "100%", overflow: "hidden" }}>
      <MockupBar />
      <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>New Quote — Bathroom Leak</span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 600, letterSpacing: "0.07em" }}>DRAFT</span>
      </div>
      {items.map((item, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px", padding: "9px 12px", alignItems: "center", borderBottom: i < items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>{item.name}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", marginTop: 2 }}>{item.detail}</div>
          </div>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", textAlign: "right" }}>{item.amount}</span>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "rgba(102,232,250,0.06)", borderTop: "1px solid rgba(102,232,250,0.13)" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Total</span>
        <span style={{ fontSize: 17, fontWeight: 700, color: "#66E8FA" }}>£253.50</span>
      </div>
    </div>
  );
}

// ── Card data ─────────────────────────────────────────────────────────

const CARDS = [
  {
    number: "01",
    title: <>Powerful<br />Job Management</>,
    description: "Let clients book, track, and approve jobs online — reducing your admin overhead.",
    visual: <JobsDashboardMockup />,
  },
  {
    number: "02",
    title: <>Live Business<br />Dashboard</>,
    description: "See revenue, outstanding invoices, and job completion rates at a glance.",
    visual: <DashboardWidgetsMockup />,
  },
  {
    number: "03",
    title: <>Built for<br />Tradespeople</>,
    description: "Clean, fast interface that works on-site or in the office — no training needed.",
    visual: <QuoteBuilderMockup />,
  },
];

// ── Card pair: alternating layout ────────────────────────────────────

function CardPair({ card, index }: { card: typeof CARDS[0]; index: number }) {
  const isReversed = index % 2 !== 0;

  const textCol = (
    <div className="fc-text-col" style={{
      flex: "0 0 30%",
      background: "#2e3638",
      position: "relative",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: "28px 24px",
      borderRadius: 18,           // own radius — gap between columns shows bg
    }}>
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#fff", lineHeight: 1.3, letterSpacing: "-0.01em", margin: 0 }}>
          {card.title}
        </h3>
        <p style={{ fontSize: 12.5, fontWeight: 400, color: "rgba(255,255,255,0.65)", lineHeight: 1.65, margin: 0 }}>
          {card.description}
        </p>
      </div>
      {/* Number on text column for non-reversed cards */}
      {!isReversed && (
        <div style={{
          fontSize: 52, fontWeight: 700, color: "rgba(255,255,255,0.08)",
          lineHeight: 1, userSelect: "none", pointerEvents: "none",
          position: "relative", zIndex: 1,
        }}>{card.number}</div>
      )}
    </div>
  );

  const visualCol = (
    <div className="fc-visual-col" style={{
      flex: 1,
      background: "#161b1a",
      position: "relative",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      borderRadius: 18,           // own radius
    }}>
      {/* Dot grid on visual column only */}
      <div style={dotGrid} />
      <div style={{ position: "relative", zIndex: 1, width: "100%" }}>
        {card.visual}
      </div>
      {/* Number on visual column for reversed cards — bottom-right */}
      {isReversed && (
        <div style={{
          fontSize: 52, fontWeight: 700, color: "rgba(255,255,255,0.08)",
          lineHeight: 1, userSelect: "none", pointerEvents: "none",
          position: "absolute", bottom: 18, right: 22, zIndex: 1,
        }}>{card.number}</div>
      )}
    </div>
  );

  return (
    <div className="fc-card-pair" style={{
      display: "flex",
      flexDirection: "row",
      gap: 5,                     // thin gap — section bg shows through, columns each have own radius
      alignItems: "stretch",
      borderRadius: 24,
      overflow: "visible",        // let individual column radii show
    }}>
      {isReversed ? <>{visualCol}{textCol}</> : <>{textCol}{visualCol}</>}
    </div>
  );
}

// ── Responsive styles ─────────────────────────────────────────────────

const RESPONSIVE_CSS = `
  .fc-card-pair {
    min-height: 520px;
  }
  @media (max-width: 767px) {
    .fc-section {
      padding: 64px 16px !important;
    }
    .fc-container {
      gap: 32px !important;
    }
    .fc-card {
      position: relative !important;
      top: auto !important;
    }
    .fc-card-pair {
      flex-direction: column !important;
      min-height: auto !important;
      gap: 6px !important;
    }
    .fc-text-col {
      flex: none !important;
      width: 100% !important;
    }
    .fc-visual-col {
      flex: none !important;
      width: 100% !important;
      min-height: 200px !important;
    }
  }
  @media (min-width: 768px) and (max-width: 1023px) {
    .fc-section {
      padding: 96px 28px !important;
    }
    .fc-card-pair {
      min-height: 380px !important;
    }
  }
`;

// ── Main export ───────────────────────────────────────────────────────

export default function FeatureCards() {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) return;

    const ctx = gsap.context(() => {
      const cards = containerRef.current!.querySelectorAll<HTMLElement>(".fc-card");

      cards.forEach((card, i) => {
        if (i === cards.length - 1) return;

        const overlay = card.querySelector<HTMLElement>(".fc-overlay");
        const nextCard = cards[i + 1];

        ScrollTrigger.create({
          trigger: nextCard,
          start: "top 90%",       // start dimming sooner
          end: "top 40%",
          scrub: 2,
          onUpdate: (self) => {
            const p = self.progress;
            gsap.set(card, { scale: 1 - 0.04 * p, transformOrigin: "50% 0%" });
            if (overlay) gsap.set(overlay, { opacity: 0.55 * p });
          },
        });
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <section className="fc-section" style={{
      background: "#0d1514",
      padding: "96px 28px",
      position: "relative",
      borderRadius: "28px 28px 0 0",
      marginTop: -28,
      zIndex: 4,
    }}>
      <style>{RESPONSIVE_CSS}</style>
      {/* Section header */}
      <div style={{ textAlign: "center", maxWidth: 680, margin: "0 auto 88px" }}>
        <div style={{
          fontFamily: "monospace", fontSize: 11, fontWeight: 600,
          letterSpacing: "0.12em", textTransform: "uppercase",
          color: mkt.accentDark, marginBottom: 18, opacity: 0.8,
        }}>
          [ FOR YOUR TRADES BUSINESS ]
        </div>
        <h2 style={{
          fontSize: "clamp(30px, 3.5vw, 46px)", fontWeight: 700,
          color: mkt.text, letterSpacing: "-0.025em", lineHeight: 1.1, marginBottom: 18,
        }}>
          Powerful Tools for Every Job Site
        </h2>
        <p style={{ fontSize: 16, color: mkt.textMuted, lineHeight: 1.65, maxWidth: 540, margin: "0 auto" }}>
          WeFixTrades is built to simplify your workflow, speed up invoicing, and keep your customers coming back.
        </p>
      </div>

      {/* Card stack */}
      <div ref={containerRef} className="fc-container" style={{ display: "flex", flexDirection: "column", gap: 80, maxWidth: 1100, margin: "0 auto" }}>
        {CARDS.map((card, i) => (
          <div
            key={i}
            className="fc-card"
            style={{ position: "sticky", top: "5rem", transformOrigin: "50% 0%", zIndex: i + 1 }}
          >
            {/* Dim overlay — fades in as next card slides over this one */}
            <div className="fc-overlay" style={{
              position: "absolute", inset: 0, zIndex: 10,
              background: "#0d1514", opacity: 0,
              borderRadius: 18, pointerEvents: "none",
            }} />
            <CardPair card={card} index={i} />
          </div>
        ))}
      </div>
    </section>
  );
}
