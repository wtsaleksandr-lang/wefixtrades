import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* ── edit content here ───────────────────────────────────────────────── */

const SECTION_HEADING = "Exceptional Customer Experience";
const SECTION_SUBTITLE = "Built-in tools that delight customers and free your team.";

const CARDS_DATA = [
  {
    number: "01",
    accentColor: "#2563eb",
    accentBg: "#dbeafe",
    title: "Powerful Self-Service Tools",
    description:
      "Customer self-management for reduced support costs and increased satisfaction. Empower subscribers to handle account changes, billing queries, and service requests independently.",
    riveUrl:
      "https://cdn.prod.website-files.com/66e53bf67b6fc1646ce0777e/67ed2478edc45f9d6824a0f1_home___stack___customers.riv",
    reversed: false,
  },
  {
    number: "02",
    accentColor: "#0891b2",
    accentBg: "#cffafe",
    title: "Customizable Dashboards",
    description:
      "Tailored information access for optimal efficiency. Give every team the exact data views they need — operations, finance, and support all working from one unified platform.",
    riveUrl:
      "https://cdn.prod.website-files.com/66e53bf67b6fc1646ce0777e/67eabdfb3bb7821ba4c09216_home___stack___dashboards_final.riv",
    reversed: true,
  },
  {
    number: "03",
    accentColor: "#059669",
    accentBg: "#d1fae5",
    title: "Intuitive User Interface",
    description:
      "Easy navigation and user-friendly workflows for faster business growth. Reduce training time and human error with a clean, purpose-built interface your team will actually enjoy using.",
    riveUrl:
      "https://cdn.prod.website-files.com/66e53bf67b6fc1646ce0777e/67eabdfc4740322102620c37_home___stack___userinterface.riv",
    reversed: false,
  },
  {
    number: "04",
    accentColor: "#7c3aed",
    accentBg: "#ede9fe",
    title: "Automated Workflows",
    description:
      "Streamlined processes and elimination of manual tasks for strategic focus. From dunning management to service activation, automation handles the repetitive work so your team doesn't have to.",
    riveUrl:
      "https://cdn.prod.website-files.com/66e53bf67b6fc1646ce0777e/67eabdfb5cec85cbd9a56fd5_home___stack___dunning%20(1).riv",
    reversed: true,
  },
] as const;

/* ── Effortel color tokens ───────────────────────────────────────────── */
const BG = "#dfe8e6";        // --color--background (section + overlay)
const CARD_BG = "#f5fcff";   // --color--background-secondary (card)
const TEXT = "#22282a";      // --swatch--n-800
const TEXT_MUTED = "#5f6f77"; // --swatch--n-600

/* ── mockup sub-components (replace with Rive when ready) ────────────── */

function CustomerPortalMockup() {
  return (
    <div style={{ padding: 28, height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>My Account</div>
        <div style={{ fontSize: 11, background: "#dbeafe", color: "#2563eb", borderRadius: 6, padding: "3px 10px", fontWeight: 600 }}>Active</div>
      </div>
      {/* account card */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "16px 18px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", flex: 1 }}>
        <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 6, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Current Plan</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: TEXT, marginBottom: 2 }}>Business Pro</div>
        <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 14 }}>Renews 15 Apr 2026 · £480/mo</div>
        {[
          { label: "Voice lines", val: "12 / 20", pct: 60 },
          { label: "Data usage", val: "840 GB / 1 TB", pct: 84 },
          { label: "SMS credits", val: "4,200 / 5,000", pct: 84 },
        ].map(row => (
          <div key={row.label} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12, color: TEXT_MUTED }}>
              <span>{row.label}</span><span style={{ fontWeight: 600, color: TEXT }}>{row.val}</span>
            </div>
            <div style={{ height: 4, borderRadius: 4, background: "#e4edf1" }}>
              <div style={{ height: 4, borderRadius: 4, width: `${row.pct}%`, background: row.pct > 80 ? "#ef4444" : "#2563eb" }} />
            </div>
          </div>
        ))}
      </div>
      {/* actions */}
      <div style={{ display: "flex", gap: 8 }}>
        {["Upgrade plan", "Manage services", "Support"].map((lbl, i) => (
          <div key={lbl} style={{ flex: 1, textAlign: "center", borderRadius: 10, padding: "8px 4px", fontSize: 11, fontWeight: 600, background: i === 0 ? "#2563eb" : "#fff", color: i === 0 ? "#fff" : TEXT, border: i === 0 ? "none" : "1px solid #d5e1e7", cursor: "pointer" }}>
            {lbl}
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardMockup() {
  const bars = [38, 55, 44, 72, 68, 83, 90, 78, 95, 88, 92, 100];
  return (
    <div style={{ padding: 28, height: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* KPI row */}
      <div style={{ display: "flex", gap: 10 }}>
        {[
          { label: "ARR", val: "£2.4M", delta: "+18%", color: "#059669" },
          { label: "MRR", val: "£198K", delta: "+12%", color: "#059669" },
          { label: "Churn", val: "1.8%", delta: "-0.3%", color: "#059669" },
        ].map(kpi => (
          <div key={kpi.label} style={{ flex: 1, background: "#fff", borderRadius: 12, padding: "12px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4 }}>{kpi.label}</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: TEXT }}>{kpi.val}</div>
            <div style={{ fontSize: 11, color: kpi.color, fontWeight: 600, marginTop: 2 }}>{kpi.delta}</div>
          </div>
        ))}
      </div>
      {/* bar chart */}
      <div style={{ flex: 1, background: "#fff", borderRadius: 14, padding: "16px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 14 }}>Monthly Revenue</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 80 }}>
          {bars.map((h, i) => (
            <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: "3px 3px 0 0", background: i === bars.length - 1 ? "#0891b2" : "#cffafe", transition: "height 0.3s" }} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          {["Jan", "Mar", "May", "Jul", "Sep", "Nov"].map(m => (
            <div key={m} style={{ fontSize: 10, color: TEXT_MUTED }}>{m}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CatalogMockup() {
  const plans = [
    { name: "Starter", price: "£29", features: ["5 users", "100 GB", "Email support"], color: "#e4edf1", active: false },
    { name: "Business", price: "£79", features: ["25 users", "1 TB", "Priority support"], color: "#cffafe", active: true },
    { name: "Enterprise", price: "Custom", features: ["Unlimited", "10 TB", "Dedicated CSM"], color: "#e4edf1", active: false },
  ];
  return (
    <div style={{ padding: 28, height: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 6 }}>Service Catalog</div>
      {plans.map(plan => (
        <div key={plan.name} style={{ background: "#fff", border: plan.active ? "1.5px solid #0891b2" : "1px solid #d5e1e7", borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{plan.name}</div>
              {plan.active && <div style={{ fontSize: 10, background: "#cffafe", color: "#0891b2", borderRadius: 5, padding: "2px 7px", fontWeight: 700 }}>Popular</div>}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {plan.features.map(f => (
                <div key={f} style={{ fontSize: 10, color: TEXT_MUTED }}>{f}</div>
              ))}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{plan.price}</div>
            <div style={{ fontSize: 10, color: TEXT_MUTED }}>/mo</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkflowMockup() {
  const steps = [
    { icon: "📧", label: "Invoice sent", status: "done", color: "#059669" },
    { icon: "⏰", label: "Payment overdue +3d", status: "done", color: "#059669" },
    { icon: "🔔", label: "Reminder email", status: "done", color: "#059669" },
    { icon: "⏸", label: "Service suspended +7d", status: "active", color: "#f59e0b" },
    { icon: "🚫", label: "Account termination +14d", status: "pending", color: "#d1d5db" },
  ];
  return (
    <div style={{ padding: 28, height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 6 }}>Dunning Automation</div>
      <div style={{ background: "#fff", borderRadius: 14, padding: "16px 18px", flex: 1, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        {steps.map((step, i) => (
          <div key={step.label}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: step.status === "done" ? "#d1fae5" : step.status === "active" ? "#fef3c7" : "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                {step.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: step.status === "pending" ? "#9ca3af" : TEXT }}>{step.label}</div>
              </div>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: step.color }} />
            </div>
            {i < steps.length - 1 && (
              <div style={{ marginLeft: 16, width: 1, height: 16, background: "#d5e1e7" }} />
            )}
          </div>
        ))}
      </div>
      <div style={{ background: "#fff", borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <div style={{ fontSize: 12, color: TEXT_MUTED }}>Recovery rate this month</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#059669" }}>94.2%</div>
      </div>
    </div>
  );
}

const MOCKUPS = {
  "01": CustomerPortalMockup,
  "02": DashboardMockup,
  "03": CatalogMockup,
  "04": WorkflowMockup,
} as const;

/* ── main component ──────────────────────────────────────────────────── */
export default function StickyStackCards() {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const overlayRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isMobile = useRef(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const m = window.innerWidth < 768;
      isMobile.current = m;
      setMobile(m);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    isMobile.current = window.innerWidth < 768;
    if (isMobile.current) return; // no sticky stacking on mobile

    const timelines: gsap.core.Timeline[] = [];

    CARDS_DATA.forEach((_, i) => {
      if (i === CARDS_DATA.length - 1) return;
      const nextCard = cardRefs.current[i + 1];
      const card = cardRefs.current[i];
      const overlay = overlayRefs.current[i];
      if (!card || !overlay || !nextCard) return;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: nextCard,
          start: "top 88%",
          end: "top 24%",
          scrub: 0.6,
        },
      });
      tl.to(card, { scale: 0.9, y: -16, transformOrigin: "50% 0", ease: "none" }, 0);
      tl.to(overlay, { opacity: 0.6, ease: "none" }, 0);
      timelines.push(tl);
    });

    return () => {
      timelines.forEach(tl => tl.scrollTrigger?.kill());
      timelines.forEach(tl => tl.kill());
    };
  }, []);

  return (
    <section
      data-testid="sticky-stack-cards"
      style={{
        background: BG,
        padding: mobile ? "64px 16px" : "96px 28px",
        borderRadius: "28px 28px 0 0",
        marginTop: -28,
        position: "relative",
        zIndex: 2,
      }}
    >
      {/* ── heading ────────────────────────────────────────────── */}
      <div style={{ maxWidth: 720, margin: "0 auto 96px", textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: "0.18em", fontWeight: 600, textTransform: "uppercase" as const, color: TEXT_MUTED, marginBottom: 18 }}>
          {"{ Customer Experience }"}
        </div>
        <h2 style={{ margin: 0, fontSize: "clamp(30px, 4vw, 50px)", fontWeight: 400, lineHeight: 1.1, letterSpacing: "-0.025em", color: TEXT }}>
          {SECTION_HEADING}
        </h2>
        <p style={{ margin: "18px auto 0", maxWidth: 500, fontSize: 17, lineHeight: 1.65, color: TEXT_MUTED }}>
          {SECTION_SUBTITLE}
        </p>
      </div>

      {/* ── sticky card stack ───────────────────────────────────── */}
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: mobile ? 32 : 192, // 12em on desktop, compact on mobile
        }}
      >
        {CARDS_DATA.map((card, i) => {
          const VisualMockup = MOCKUPS[card.number as keyof typeof MOCKUPS];
          return (
            <div
              key={card.number}
              ref={(el) => { cardRefs.current[i] = el; }}
              style={{
                position: mobile ? "relative" : "sticky",
                top: mobile ? "auto" : 96,
                transformOrigin: "50% 0",
                willChange: mobile ? "auto" : "transform",
              }}
            >
              {/* .large__card */}
              <div
                style={{
                  background: CARD_BG,
                  borderRadius: 24,
                  padding: 2,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: mobile ? "column" : (card.reversed ? "row-reverse" : "row") as "row" | "row-reverse" | "column",
                  minHeight: mobile ? "auto" : 420,
                  boxShadow: "0 4px 32px rgba(34,40,42,0.08)",
                  border: "1px solid rgba(213,225,231,0.6)",
                }}
              >
                {/* col-33: text */}
                <div
                  style={{
                    width: mobile ? "100%" : "33.333%",
                    flexShrink: 0,
                    padding: mobile ? "28px 24px" : "36px 36px 36px 36px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    borderRight: (!mobile && !card.reversed) ? "1px solid rgba(213,225,231,0.7)" : "none",
                    borderLeft: (!mobile && card.reversed) ? "1px solid rgba(213,225,231,0.7)" : "none",
                    borderBottom: mobile ? "1px solid rgba(213,225,231,0.7)" : "none",
                  }}
                >
                  {/* number badge */}
                  <div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        background: card.accentBg,
                        fontSize: 14,
                        fontWeight: 800,
                        color: card.accentColor,
                        letterSpacing: "0.04em",
                        marginBottom: 28,
                      }}
                    >
                      {card.number}
                    </div>
                    <h3
                      style={{
                        margin: "0 0 16px",
                        fontSize: "clamp(18px, 1.8vw, 24px)",
                        fontWeight: 700,
                        lineHeight: 1.25,
                        letterSpacing: "-0.02em",
                        color: TEXT,
                      }}
                    >
                      {card.title}
                    </h3>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 14,
                        lineHeight: 1.75,
                        color: TEXT_MUTED,
                      }}
                    >
                      {card.description}
                    </p>
                  </div>
                  {/* accent line */}
                  <div
                    style={{
                      marginTop: 32,
                      height: 3,
                      width: 40,
                      borderRadius: 3,
                      background: card.accentColor,
                      opacity: 0.5,
                    }}
                  />
                </div>

                {/* col-66: visual */}
                <div
                  style={{
                    flex: 1,
                    position: "relative",
                    background: "#fff",
                    borderRadius: mobile ? "0 0 22px 22px" : (card.reversed ? "22px 0 0 22px" : "0 22px 22px 0"),
                    overflow: "hidden",
                    minHeight: mobile ? 280 : 380,
                  }}
                >
                  {/*
                    TODO: Replace with Rive component when @rive-app/react-canvas is installed:
                    import { useRive } from "@rive-app/react-canvas";
                    const { RiveComponent } = useRive({ src: card.riveUrl,
                      stateMachines: "State Machine 1", artboard: "Artboard", autoplay: true });
                    return <RiveComponent style={{ width: "100%", height: "100%" }} />;
                  */}
                  <VisualMockup />
                </div>
              </div>

              {/* overlay — GSAP animates opacity 0 → 0.6 */}
              <div
                ref={(el) => { overlayRefs.current[i] = el; }}
                style={{
                  position: "absolute",
                  inset: 0,
                  background: BG,
                  borderRadius: 24,
                  pointerEvents: "none",
                  zIndex: 5,
                  opacity: 0,
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
