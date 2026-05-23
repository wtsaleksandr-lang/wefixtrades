import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* ── dot grid shared style ───────────────────────────────────────────── */
const dotGrid: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.055) 0.8px, transparent 0.8px)",
  backgroundSize: "16px 16px",
  pointerEvents: "none",
};

/* ── icon container ───────────────────────────────────────────────────── */
function IconBox({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="dark" style={{
      width: 36, height: 36,
      background: "rgba(0,212,168,0.12)",
      border: "1px solid rgba(0,212,168,0.2)",
      borderRadius: 8,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      {children}
    </div>
  );
}

/* ── inline SVG icons ─────────────────────────────────────────────────── */
function IconBolt() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00D4A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00D4A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
function IconStar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00D4A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

/* ── Cell 2 mockup: Invoice card ──────────────────────────────────────── */
function InvoiceMockup() {
  return (
    <div style={{ background: "#1e2522", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", padding: "14px 16px", width: "100%", maxWidth: 300 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>Invoice #1042</span>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: "#0d3cfc", background: "rgba(13,60,252,0.12)", border: "1px solid rgba(13,60,252,0.2)", padding: "2px 8px", borderRadius: 4 }}>SENT</span>
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>Bathroom Renovation</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Due: 15 Mar</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>£1,240.00</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: "78%", height: "100%", background: "#00D4A8", borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap" }}>78% collected</span>
      </div>
    </div>
  );
}

/* ── Cell 3 mockup: Stat widgets ──────────────────────────────────────── */
function StatWidgets() {
  return (
    <div style={{ display: "flex", gap: 10, width: "100%" }}>
      {[
        { value: "£12,480", label: "This month" },
        { value: "94%", label: "On-time" },
      ].map((s, i) => (
        <div key={i} style={{
          flex: 1, background: "#1e2522", borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.08)",
          padding: "14px 16px",
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em", marginBottom: 4 }}>{s.value}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Cell 6 mockup: Branding portal ──────────────────────────────────── */
function BrandMockup() {
  return (
    <div style={{ background: "#1e2522", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", padding: "14px 16px", width: "100%", maxWidth: 300 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ width: 24, height: 24, borderRadius: 4, background: "rgba(13,60,252,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 10, color: "#0d3cfc", fontWeight: 700 }}>A</span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>AcePlumbing</span>
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Quote for: Sarah Johnson</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>Kitchen Tap Replacement</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>£180</span>
      </div>
      <div style={{ background: "rgba(0,212,168,0.15)", border: "1px solid rgba(0,212,168,0.25)", borderRadius: 6, padding: "7px 0", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#00D4A8" }}>
        Accept Quote →
      </div>
    </div>
  );
}

/* ── Bento cell types ─────────────────────────────────────────────────── */
type BentoCell =
  | { type: "icon"; size: "small"; icon: React.ReactNode; title: string; body: string }
  | { type: "feature"; size: "large"; title: string; body: string; visual: React.ReactNode };

const CELLS: BentoCell[] = [
  // Row 1
  {
    type: "icon", size: "small",
    icon: <IconBolt />,
    title: "Instant Quotes",
    body: "Send professional estimates in seconds — from any device, on any job site.",
  },
  {
    type: "feature", size: "large",
    title: "Get paid faster",
    body: "Automated invoicing, payment reminders, and online payment links sent directly to your customers.",
    visual: <InvoiceMockup />,
  },
  // Row 2
  {
    type: "feature", size: "large",
    title: "Know your numbers",
    body: "Real-time revenue tracking, job completion rates, and customer insights — all in one dashboard.",
    visual: <StatWidgets />,
  },
  {
    type: "icon", size: "small",
    icon: <IconBell />,
    title: "Never miss a lead",
    body: "Instant notifications for new enquiries, follow-ups sent automatically.",
  },
  // Row 3
  {
    type: "icon", size: "small",
    icon: <IconStar />,
    title: "Win more reviews",
    body: "Automated review requests sent after every completed job.",
  },
  {
    type: "feature", size: "large",
    title: "Your brand, your tools",
    body: "White-label your customer portal, quotes, and invoices with your own logo and colors.",
    visual: <BrandMockup />,
  },
];

const ROWS = [
  CELLS.slice(0, 2),
  CELLS.slice(2, 4),
  CELLS.slice(4, 6),
];

/* ── Card components ─────────────────────────────────────────────────── */
const CARD_BG = "#1A1F21";
const CARD_BORDER = "rgba(255,255,255,0.07)";

function SmallCell({ cell, mobile }: { cell: Extract<BentoCell, { type: "icon" }>; mobile: boolean }) {
  return (
    <div style={{
      flexBasis: mobile ? "100%" : "33.333%",
      flexShrink: mobile ? undefined : 0,
      background: CARD_BG,
      borderRadius: 20,
      border: `1px solid ${CARD_BORDER}`,
      padding: 24,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={dotGrid} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
        <IconBox>{cell.icon}</IconBox>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: 0, lineHeight: 1.3 }}>{cell.title}</h3>
        <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, margin: 0 }}>{cell.body}</p>
      </div>
    </div>
  );
}

function LargeCell({ cell, mobile }: { cell: Extract<BentoCell, { type: "feature" }>; mobile: boolean }) {
  return (
    <div style={{
      flex: 1,
      background: CARD_BG,
      borderRadius: 20,
      border: `1px solid ${CARD_BORDER}`,
      padding: 24,
      display: "flex",
      flexDirection: mobile ? "column" : "row",
      gap: 20,
      alignItems: mobile ? "flex-start" : "center",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={dotGrid} />
      <div style={{ position: "relative", zIndex: 1, flex: "0 0 auto", maxWidth: mobile ? "100%" : 220 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: "0 0 10px", lineHeight: 1.3 }}>{cell.title}</h3>
        <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, margin: 0 }}>{cell.body}</p>
      </div>
      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", width: mobile ? "100%" : undefined }}>
        {cell.visual}
      </div>
    </div>
  );
}

/* ── main component ───────────────────────────────────────────────────── */
export default function BentoGrid() {
  const [mobile, setMobile] = useState(false);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const headingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      if (headingRef.current) {
        gsap.fromTo(
          headingRef.current,
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, duration: 0.7, ease: "power2.out", scrollTrigger: { trigger: headingRef.current, start: "top 88%" } }
        );
      }
      rowRefs.current.forEach((rowEl) => {
        if (!rowEl) return;
        gsap.fromTo(
          Array.from(rowEl.children) as HTMLElement[],
          { opacity: 0, y: 36 },
          { opacity: 1, y: 0, duration: 0.65, ease: "power2.out", stagger: 0.12, scrollTrigger: { trigger: rowEl, start: "top 86%" } }
        );
      });
    });
    return () => ctx.revert();
  }, []);

  return (
    <section
      data-testid="bento-grid"
      style={{
        background: "#22282A",
        padding: mobile ? "64px 16px 100px" : "80px 28px 140px",
        position: "relative",
        zIndex: 8,
      }}
    >
      {/* Heading */}
      <div ref={headingRef} style={{ maxWidth: 680, margin: "0 auto 56px", textAlign: "center", opacity: 0 }}>
        <div style={{
          fontFamily: "monospace", fontSize: 11, fontWeight: 600,
          letterSpacing: "0.12em", textTransform: "uppercase",
          color: "#00D4A8", marginBottom: 18, opacity: 0.8,
        }}>
          [ FROM VISION TO REALITY ]
        </div>
        <h2 style={{
          fontSize: "clamp(28px, 3.5vw, 44px)", fontWeight: 700,
          color: "#fff", letterSpacing: "-0.025em", lineHeight: 1.1, marginBottom: 16,
        }}>
          Everything you need to run a modern trades business
        </h2>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.45)", lineHeight: 1.65, maxWidth: 520, margin: "0 auto" }}>
          Quotes, invoices, dashboards, and customer tools — all in one place, built for tradespeople.
        </p>
      </div>

      {/* Grid */}
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {ROWS.map((rowCells, ri) => (
          <div
            key={ri}
            ref={(el) => { rowRefs.current[ri] = el; }}
            style={{ display: "flex", flexDirection: mobile ? "column" : "row", gap: 16 }}
          >
            {rowCells.map((cell, ci) =>
              cell.type === "icon"
                ? <SmallCell key={ci} cell={cell} mobile={mobile} />
                : <LargeCell key={ci} cell={cell} mobile={mobile} />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
