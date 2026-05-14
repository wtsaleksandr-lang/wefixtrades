import { useEffect } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import {
  Zap, Calendar, Bot, MessageSquare, LayoutDashboard, Palette,
  Check, ArrowRight, Play, Users, TrendingUp, ChevronRight,
} from "lucide-react";
import { mkt, colors, shadows } from "@/theme/tokens";


const CAPABILITIES = [
  {
    icon: Zap,
    title: "Instant Quote Engine",
    body: "Trade-specific pricing formulas, 10 pricing types, AI-validated accuracy — instant results every time.",
    color: mkt.accent, bg: mkt.accentTint, testId: "cap-quotes", delay: "100",
  },
  {
    icon: Calendar,
    title: "Booking + Deposits",
    body: "Turn estimates into confirmed jobs. Customers pick a time, pay a deposit via Stripe — no phone calls.",
    color: colors.accent.blue, bg: colors.accent.blueTint, testId: "cap-booking", delay: "200",
  },
  {
    icon: Bot,
    title: "AI Employee",
    body: "24/7 chat and voice assistant that answers questions, generates estimates, and books appointments.",
    color: "#7C3AED", bg: "#F5F3FF", testId: "cap-ai", delay: "300",
  },
  {
    icon: MessageSquare,
    title: "SMS & WhatsApp",
    body: "Automated follow-ups, lead recovery, and two-way conversations powered by Twilio AI.",
    color: "#DB2777", bg: "#FDF2F8", testId: "cap-sms", delay: "400",
  },
];

const FLOW_STEPS = [
  { label: "Visitor", sub: "Lands on your site", icon: Users, color: colors.accent.blue },
  { label: "Estimate", sub: "Gets instant price", icon: Zap, color: mkt.accent },
  { label: "Books", sub: "Pays deposit online", icon: Calendar, color: "#7C3AED" },
  { label: "AI follows up", sub: "SMS & chat reminders", icon: Bot, color: mkt.orange },
  { label: "Confirmed Job", sub: "Revenue secured", icon: TrendingUp, color: "#059669" },
];

interface DeepSection {
  id: string;
  label: string;
  title: string;
  body: string;
  bullets: string[];
  cta: string;
  ctaHref: string;
  labelColor: string;
  bulletColor: string;
  ctaColor: string;
  testId: string;
  mockup: () => JSX.Element;
}

function EstimateMockup() {
  return (
    <div style={{ background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 20, padding: 28, boxShadow: shadows.md, maxWidth: 380 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: mkt.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20 }}>
        Bathroom Renovation Quote
      </div>
      {[
        { label: "Room size", value: "12m²", type: "pill" },
        { label: "Finish grade", value: "Standard", type: "pill" },
        { label: "Tiles included", value: "Yes", type: "pill" },
      ].map(({ label, value }) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 14, color: mkt.textMuted }}>{label}</span>
          <span style={{ fontSize: 13, fontWeight: 600, background: mkt.surface, border: `1px solid ${mkt.border}`, borderRadius: 8, padding: "4px 12px", color: mkt.text }}>{value}</span>
        </div>
      ))}
      <div style={{ borderTop: `1px solid ${mkt.border}`, margin: "20px 0" }} />
      <div style={{ background: mkt.accent, borderRadius: 14, padding: "20px 24px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 6 }}>Your Estimate</div>
        <div style={{ fontSize: 36, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.02em" }}>$1,240 – $1,680</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>Calculated in 0.2s · Valid for 7 days</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <div style={{ flex: 1, background: mkt.accent, borderRadius: 10, padding: "11px", textAlign: "center", fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>
          Book Now
        </div>
        <div style={{ flex: 1, background: mkt.surface, border: `1px solid ${mkt.border}`, borderRadius: 10, padding: "11px", textAlign: "center", fontSize: 13, fontWeight: 600, color: mkt.textMuted }}>
          Get Full Quote
        </div>
      </div>
    </div>
  );
}

function AiMockup() {
  const messages = [
    { text: "What would it cost to repaint my 3-bedroom house?", user: true },
    { text: "I can get you an accurate estimate right now. Are we talking interior only, or exterior as well?", user: false },
    { text: "Just interior, walls and ceiling.", user: true },
    { text: "For 3 bedrooms, interior walls + ceiling — I estimate $2,400 – $3,100. Want to lock in a date?", user: false },
  ];
  return (
    <div style={{ background: mkt.dark, borderRadius: 20, padding: 24, maxWidth: 380, boxShadow: shadows.xl }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: mkt.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Bot size={17} color="#FFFFFF" strokeWidth={1.5} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>AI Employee</div>
          <div style={{ fontSize: 11, color: mkt.success, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: mkt.success, display: "inline-block" }} />
            Online 24/7
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {["SMS", "WA"].map(ch => (
            <span key={ch} style={{ fontSize: 10, fontWeight: 700, background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", padding: "2px 8px", borderRadius: 20 }}>{ch}</span>
          ))}
        </div>
      </div>
      {messages.map((m, i) => (
        <div key={i} style={{ display: "flex", justifyContent: m.user ? "flex-end" : "flex-start", marginBottom: 10 }}>
          <div style={{
            maxWidth: "82%",
            padding: "9px 13px",
            borderRadius: m.user ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
            background: m.user ? mkt.accent : "rgba(255,255,255,0.08)",
            fontSize: 12.5,
            color: "#FFFFFF",
            lineHeight: 1.55,
          }}>
            {m.text}
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <div style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px 13px", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          Type a message…
        </div>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: mkt.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <ArrowRight size={15} color="#FFFFFF" strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}

function BookingMockup() {
  const days = [14,15,16,17,18,19,20].map((d, i) => ({ d, sel: i === 3, avail: i !== 1 && i !== 5 }));
  return (
    <div style={{ background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 20, padding: 28, boxShadow: shadows.md, maxWidth: 380 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: mkt.textMuted, marginBottom: 2 }}>Select a slot</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: mkt.text }}>March 2026</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, background: mkt.accentTint, color: mkt.accent, padding: "4px 12px", borderRadius: 20 }}>Stripe deposits on</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 18 }}>
        {days.map(({ d, sel, avail }, i) => (
          <div key={i} style={{
            textAlign: "center", padding: "8px 0", borderRadius: 9,
            fontSize: 13, fontWeight: sel ? 700 : 500,
            background: sel ? mkt.accent : avail ? mkt.surface : "transparent",
            color: sel ? "#FFFFFF" : avail ? mkt.text : mkt.border,
            border: sel ? "none" : avail ? `1px solid ${mkt.border}` : "none",
          }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        {["9:00 AM", "11:30 AM", "2:00 PM"].map((t, i) => (
          <div key={t} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 14px", borderRadius: 10,
            background: i === 0 ? mkt.accent : mkt.surface,
            border: i === 0 ? "none" : `1px solid ${mkt.border}`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: i === 0 ? "#FFFFFF" : mkt.text }}>{t}</span>
            {i === 0 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>Selected ✓</span>}
          </div>
        ))}
      </div>
      <div style={{ background: mkt.accentTint, borderRadius: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#065F46" }}>Deposit via Stripe</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: "#065F46" }}>$200 ✓</span>
      </div>
    </div>
  );
}

function AnalyticsMockup() {
  const stats = [
    { label: "Views", val: "1,284", delta: "+18%", up: true },
    { label: "Leads", val: "147", delta: "+32%", up: true },
    { label: "Bookings", val: "38", delta: "+41%", up: true },
    { label: "Revenue", val: "$7,600", delta: "+28%", up: true },
  ];
  const funnelSteps = [
    { label: "Views", w: "100%", color: colors.accent.blue },
    { label: "Estimates", w: "68%", color: mkt.accent },
    { label: "Leads", w: "42%", color: "#7C3AED" },
    { label: "Bookings", w: "24%", color: mkt.orange },
    { label: "Paid", w: "18%", color: "#059669" },
  ];
  return (
    <div style={{ background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 20, padding: 24, boxShadow: shadows.md, maxWidth: 400 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: mkt.text, marginBottom: 16 }}>Dashboard — Last 30 Days</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        {stats.map(({ label, val, delta, up }) => (
          <div key={label} style={{ background: mkt.surface, border: `1px solid ${mkt.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: mkt.textMuted, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: mkt.text, letterSpacing: "-0.01em" }}>{val}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: up ? "#059669" : "#DC2626", marginTop: 2 }}>{delta} vs last month</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: mkt.textMuted, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>Conversion Funnel</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {funnelSteps.map(({ label, w, color }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 60, fontSize: 12, color: mkt.textMuted, flexShrink: 0 }}>{label}</div>
            <div style={{ flex: 1, background: mkt.surface, borderRadius: 4, height: 8, overflow: "hidden" }}>
              <div style={{ width: w, height: "100%", background: color, borderRadius: 4, transition: "width 1s ease" }} />
            </div>
            <div style={{ width: 36, fontSize: 11, fontWeight: 600, color, textAlign: "right", flexShrink: 0 }}>{w}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateMockup() {
  const templates = [
    { name: "Classic Single", color: colors.accent.blueTint, accent: colors.accent.blue },
    { name: "Two Column", color: mkt.accentTint, accent: mkt.accent },
    { name: "Multi-Step", color: "#F5F3FF", accent: "#7C3AED" },
    { name: "Package Cards", color: "#FDF2F8", accent: "#DB2777" },
    { name: "Range + Lead Gate", color: mkt.orangeTint, accent: mkt.orange },
    { name: "Estimate + Book", color: "#F0FDF4", accent: "#16A34A" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 380 }}>
      {templates.map(({ name, color, accent }) => (
        <div key={name} className="mkt-feature-card" style={{
          background: color, borderRadius: 12, padding: "16px 14px",
          border: `1px solid ${accent}22`, boxShadow: shadows.card,
        }}>
          <div style={{ width: 28, height: 4, background: accent, borderRadius: 2, marginBottom: 10, opacity: 0.8 }} />
          <div style={{ width: "80%", height: 3, background: accent, borderRadius: 2, marginBottom: 6, opacity: 0.3 }} />
          <div style={{ width: "60%", height: 3, background: accent, borderRadius: 2, marginBottom: 14, opacity: 0.2 }} />
          <div style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: "0.02em" }}>{name}</div>
        </div>
      ))}
    </div>
  );
}

const DEEP_SECTIONS: DeepSection[] = [
  {
    id: "estimates",
    label: "Quote Engine",
    title: "Instant, Accurate Estimates — Every Time",
    body: "Our pricing engine supports 10 formula families covering every trade scenario. Customers get an accurate range in seconds. You get leads that already know your prices — reducing tyre-kickers and speeding up close rates.",
    bullets: [
      "10 pricing formula types (fixed, hourly, area-based, tiered + more)",
      "AI-validated to flag configuration errors before you go live",
      "6 mobile-first calculator templates with slider inputs",
      "Embed as hosted page, script, iframe, or button popup",
    ],
    cta: "Start Building",
    ctaHref: "/Wizard",
    labelColor: mkt.accent,
    bulletColor: mkt.accent,
    ctaColor: mkt.accent,
    testId: "deep-section-estimates",
    mockup: EstimateMockup,
  },
  {
    id: "ai",
    label: "AI Employee",
    title: "Your 24/7 Sales & Support Employee",
    body: "Train your AI employee with your services, pricing, availability, and tone — using a simple structured form. It handles inquiries, generates live estimates, books appointments, and escalates to you when a human touch is needed.",
    bullets: [
      "14-day free trial — no code required to activate",
      "Channels: Web chat, SMS, WhatsApp (all in one brain)",
      "Function calling: generate estimate, check slots, create booking",
      "Escalates to your phone or email when needed",
    ],
    cta: "See AI Employee",
    ctaHref: "/product",
    labelColor: "#7C3AED",
    bulletColor: "#7C3AED",
    ctaColor: "#7C3AED",
    testId: "deep-section-ai",
    mockup: AiMockup,
  },
  {
    id: "booking",
    label: "Booking Engine",
    title: "Convert Estimates Into Paid Appointments",
    body: "Once a customer sees their estimate, they can immediately book a time and pay a deposit — all within your calculator. No phone tag, no chasing. Stripe Connect handles payments; you get notified the moment a booking is confirmed.",
    bullets: [
      "Real-time slot availability managed from your dashboard",
      "Stripe deposit collection — prevent no-shows automatically",
      "Double-booking prevention built in",
      "Confirmation emails to customer + business on every booking",
    ],
    cta: "Explore Booking",
    ctaHref: "/product",
    labelColor: colors.accent.blue,
    bulletColor: colors.accent.blue,
    ctaColor: colors.accent.blue,
    testId: "deep-section-booking",
    mockup: BookingMockup,
  },
  {
    id: "analytics",
    label: "Analytics Dashboard",
    title: "Track Every Lead, Booking & Revenue Dollar",
    body: "Your dashboard gives you a real-time view of your entire sales pipeline — from first visit to paid booking. See where leads drop off, which calculators perform best, and what follow-up sequences drive the most revenue.",
    bullets: [
      "Views → Estimates → Leads → Bookings → Payments funnel",
      "Weekly email summary reports delivered automatically",
      "Export leads to CSV for your CRM",
      "AI conversation transcripts + message thread history",
    ],
    cta: "See All Features",
    ctaHref: "/pricing",
    labelColor: "#D97706",
    bulletColor: "#D97706",
    ctaColor: "#D97706",
    testId: "deep-section-analytics",
    mockup: AnalyticsMockup,
  },
  {
    id: "templates",
    label: "Templates",
    title: "6 High-Converting Templates, Ready to Deploy",
    body: "Stop starting from scratch. Choose from 6 trade-optimised calculator layouts. Our template engine auto-recommends the best layout for your trade category. Swap anytime — your pricing logic stays intact.",
    bullets: [
      "6 templates: single-page, two-column, multi-step, packages, range+gate, estimate+book",
      "Trade auto-selection — AI recommends the best template for you",
      "Slider inputs replace steppers for a premium feel",
      "White-label: custom domain, your branding, no QuoteQuick Pro logo",
    ],
    cta: "Browse Templates",
    ctaHref: "/templates",
    labelColor: "#DB2777",
    bulletColor: "#DB2777",
    ctaColor: "#DB2777",
    testId: "deep-section-templates",
    mockup: TemplateMockup,
  },
];

export default function ProductPage() {
  useScrollReveal();

  useEffect(() => {
    document.title = "Product — QuoteQuick Pro | Everything Trades Need to Convert Leads";
  }, []);

  return (
    <MarketingLayout>
      <div data-testid="product-page" style={{ overflowX: "hidden" }}>

        {/* ═══════════════════════════════════
            SECTION 1 — HERO
        ═══════════════════════════════════ */}
        <section
          data-testid="product-hero"
          style={{
            background: `linear-gradient(160deg, ${mkt.dark} 0%, #0F2744 55%, #1a3550 100%)`,
            padding: "80px 28px 96px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: -100, right: -60, width: 500, height: 500, borderRadius: "50%", background: "rgba(47,107,255,0.08)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -80, left: -80, width: 400, height: 400, borderRadius: "50%", background: "rgba(47,107,255,0.07)", pointerEvents: "none" }} />

          <div
            className="hero-grid"
            style={{
              maxWidth: 1200,
              margin: "0 auto",
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 64,
              alignItems: "center",
            }}
          >
            <div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "rgba(47,107,255,0.20)", border: "1px solid rgba(47,107,255,0.35)",
                borderRadius: 20, padding: "5px 14px", marginBottom: 28,
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#6EE7B7", letterSpacing: "0.02em" }}>
                  ✦ Full Platform Overview
                </span>
              </div>

              <h1
                data-testid="product-headline"
                style={{
                  fontSize: "clamp(34px, 4vw, 56px)",
                  fontWeight: 700,
                  color: "#FFFFFF",
                  lineHeight: 1.1,
                  letterSpacing: "-0.035em",
                  marginBottom: 22,
                }}
              >
                Everything You Need To Turn{" "}
                <span style={{ color: "#6EE7B7" }}>Visitors</span>{" "}
                Into{" "}
                <span style={{ color: "#6EE7B7" }}>Booked Jobs</span>
              </h1>

              <p style={{
                fontSize: "clamp(16px, 1.8vw, 19px)",
                color: "rgba(255,255,255,0.62)",
                lineHeight: 1.65,
                marginBottom: 40,
                maxWidth: 500,
              }}>
                QuoteQuick Pro combines instant estimates, booking, AI employees, and automation into one conversion engine built specifically for trades.
              </p>

              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <Link
                  href="/Wizard"
                  data-testid="product-cta-start"
                  className="mkt-btn-primary"
                  style={{
                    padding: "14px 30px", fontSize: 15, textDecoration: "none",
                    display: "inline-block",
                  }}
                >
                  Start Free
                </Link>
                <Link
                  href="/demo"
                  data-testid="product-cta-demo"
                  className="mkt-btn-ghost"
                  style={{
                    padding: "14px 26px", borderRadius: 10, background: "transparent",
                    color: "#FFFFFF", fontSize: 15, fontWeight: 600, textDecoration: "none",
                    display: "inline-flex", alignItems: "center", gap: 8,
                    border: "1.5px solid rgba(255,255,255,0.28)",
                  }}
                >
                  <Play size={13} fill="currentColor" />
                  View Demo
                </Link>
              </div>
            </div>

            {/* Hero mockup — stacked estimate + booking + AI panels */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div
                className="mkt-float"
                style={{
                  background: "rgba(12,24,44,0.85)", backdropFilter: "blur(20px)",
                  border: "1px solid rgba(255,255,255,0.09)", borderRadius: 24,
                  padding: 26, width: "100%", maxWidth: 400, boxShadow: shadows.xl,
                }}
              >
                {/* Estimate result */}
                <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, padding: "16px 20px", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, background: mkt.accentTint, color: "#065F46", borderRadius: 20, padding: "3px 10px" }}>✓ Estimate Ready</span>
                  <div style={{ fontSize: 30, fontWeight: 800, color: "#FFF", letterSpacing: "-0.02em", marginTop: 8 }}>$1,240 – $1,680</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>Bathroom Reno · 12m² · Standard</div>
                </div>
                <div style={{ height: 20, display: "flex", alignItems: "center", padding: "0 24px" }}>
                  <div style={{ width: 2, height: "100%", background: mkt.accent, borderRadius: 1, margin: "0 auto" }} />
                </div>
                {/* Calendar */}
                <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, padding: "14px 18px", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Book a Slot</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["M","T","W","T","F"].map((d, i) => (
                      <div key={i} style={{
                        flex: 1, textAlign: "center", padding: "7px 0", borderRadius: 8,
                        background: i === 1 ? mkt.accent : "rgba(255,255,255,0.07)",
                        color: i === 1 ? "#FFF" : "rgba(255,255,255,0.45)",
                        fontSize: 12, fontWeight: i === 1 ? 700 : 400,
                      }}>{d}</div>
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>9:00 AM — Confirmed</span>
                    <span style={{ fontSize: 11, background: mkt.accentTint, color: "#065F46", padding: "2px 10px", borderRadius: 20, fontWeight: 700 }}>$200 ✓</span>
                  </div>
                </div>
                <div style={{ height: 20, display: "flex", alignItems: "center", padding: "0 24px" }}>
                  <div style={{ width: 2, height: "100%", background: mkt.accent, borderRadius: 1, margin: "0 auto" }} />
                </div>
                {/* AI bubble */}
                <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, padding: "14px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 10, background: mkt.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Bot size={13} color="#FFF" strokeWidth={1.5} />
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#FFF" }}>AI Employee <span style={{ color: mkt.success }}>●</span></div>
                  </div>
                  <div style={{ background: "rgba(47,107,255,0.20)", borderRadius: "10px 10px 10px 3px", padding: "9px 12px", fontSize: 12.5, color: "rgba(255,255,255,0.82)", lineHeight: 1.5 }}>
                    Great! Your booking is confirmed. See you Tuesday at 9am 👋
                  </div>
                </div>
              </div>
            </div>
          </div>

          <style>{`
            @media (max-width: 820px) {
              .hero-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
              .hero-grid > div:last-child { justify-content: center !important; }
            }
          `}</style>
        </section>

        {/* ═══════════════════════════════════
            SECTION 2 — CORE CAPABILITIES
        ═══════════════════════════════════ */}
        <section data-testid="capabilities-section" style={{ background: mkt.bg, padding: "96px 28px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 56 }} data-reveal="fade-up">
              <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                Core Platform
              </div>
              <h2 style={{ fontSize: "clamp(26px, 3.5vw, 40px)", fontWeight: 600, color: mkt.text, letterSpacing: "-0.025em", marginBottom: 14 }}>
                Four engines. One platform. Zero friction.
              </h2>
              <p style={{ fontSize: 17, color: mkt.textMuted, maxWidth: 520, margin: "0 auto" }}>
                Each module is powerful alone. Together, they create a fully automated sales machine.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 24 }}>
              {CAPABILITIES.map(({ icon: Icon, title, body, color, bg, testId, delay }) => (
                <div
                  key={testId}
                  data-testid={testId}
                  data-reveal="fade-up"
                  data-delay={delay}
                  className="mkt-feature-card"
                  style={{
                    background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 16,
                    padding: "32px 28px", boxShadow: shadows.card,
                  }}
                >
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                    <Icon size={24} color={color} strokeWidth={1.5} />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: mkt.text, marginBottom: 10, letterSpacing: "-0.01em" }}>{title}</h3>
                  <p style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.65, margin: 0 }}>{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════
            SECTION 3 — HOW IT CONNECTS
        ═══════════════════════════════════ */}
        <section data-testid="flow-section" style={{ background: mkt.surface, padding: "96px 28px" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 64 }} data-reveal="fade-up">
              <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                The Automation Flow
              </div>
              <h2 style={{ fontSize: "clamp(26px, 3.5vw, 40px)", fontWeight: 600, color: mkt.text, letterSpacing: "-0.025em", marginBottom: 14 }}>
                How every visitor becomes a confirmed job
              </h2>
              <p style={{ fontSize: 16, color: mkt.textMuted, maxWidth: 480, margin: "0 auto" }}>
                Each step in the flow is automated. You only need to show up to do the actual job.
              </p>
            </div>

            {/* Flow diagram */}
            <div style={{ position: "relative" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, 1fr)",
                  gap: 0,
                  alignItems: "flex-start",
                  position: "relative",
                }}
                className="flow-grid"
              >
                {FLOW_STEPS.map(({ label, sub, icon: Icon, color }, i) => (
                  <div
                    key={label}
                    data-reveal="scale"
                    data-delay={String(i * 120)}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 8px", position: "relative" }}
                  >
                    {/* Arrow connector (desktop only, hidden on mobile via CSS) */}
                    {i < FLOW_STEPS.length - 1 && (
                      <div className="flow-connector" style={{
                        position: "absolute",
                        top: 28,
                        left: "calc(50% + 32px)",
                        right: "calc(-50% + 32px)",
                        height: 2,
                        background: mkt.border,
                        opacity: 0.25,
                        zIndex: 0,
                      }} />
                    )}

                    {/* Icon container */}
                    <div style={{
                      width: 60, height: 60, borderRadius: 14,
                      background: `${color}18`, border: `2px solid ${color}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginBottom: 14, position: "relative", zIndex: 1,
                      boxShadow: `0 0 0 8px ${color}0A`,
                    }}>
                      <Icon size={24} color={color} strokeWidth={1.5} />
                    </div>

                    <div style={{ fontSize: 14, fontWeight: 700, color: mkt.text, textAlign: "center", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 12, color: mkt.textMuted, textAlign: "center", lineHeight: 1.4 }}>{sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Automation bullets */}
            <div
              data-reveal="fade-up"
              style={{
                marginTop: 64,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16,
              }}
            >
              {[
                { icon: "⚡", title: "Instant estimates", body: "No waiting. Result shown in under a second after the customer fills in their details." },
                { icon: "📅", title: "Automatic booking", body: "Available slots shown in real-time. Stripe collects the deposit immediately." },
                { icon: "🤖", title: "AI follow-ups", body: "Leads who didn't book receive automated SMS or email nudges — all configurable." },
                { icon: "📊", title: "Full visibility", body: "Every interaction tracked. See your full pipeline at a glance in the dashboard." },
              ].map(({ icon, title, body }) => (
                <div
                  key={title}
                  style={{
                    background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 14, padding: "20px 18px",
                    boxShadow: shadows.card,
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 10 }}>{icon}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: mkt.text, marginBottom: 6 }}>{title}</div>
                  <div style={{ fontSize: 13, color: mkt.textMuted, lineHeight: 1.6 }}>{body}</div>
                </div>
              ))}
            </div>

            <style>{`
              @media (max-width: 700px) {
                .flow-grid { grid-template-columns: 1fr 1fr !important; gap: 24px !important; }
                .flow-connector { display: none !important; }
              }
            `}</style>
          </div>
        </section>

        {/* ═══════════════════════════════════
            SECTION 4 — DEEP FEATURE SECTIONS
        ═══════════════════════════════════ */}
        {DEEP_SECTIONS.map(({ id, label, title, body, bullets, cta, ctaHref, labelColor, bulletColor, ctaColor, testId, mockup: Mockup }, i) => {
          const isOdd = i % 2 !== 0;
          return (
            <section
              key={id}
              data-testid={testId}
              style={{ background: isOdd ? mkt.surface : mkt.bg, padding: "96px 28px" }}
            >
              <div
                className="alt-grid"
                style={{
                  maxWidth: 1200, margin: "0 auto",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 80, alignItems: "center",
                }}
              >
                {/* Text column */}
                <div
                  data-reveal={isOdd ? "fade-right" : "fade-left"}
                  style={{ order: isOdd ? 2 : 0 }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: labelColor, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                    {label}
                  </div>
                  <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 600, color: mkt.text, letterSpacing: "-0.025em", marginBottom: 16, lineHeight: 1.15 }}>
                    {title}
                  </h2>
                  <p style={{ fontSize: 16, color: mkt.textMuted, lineHeight: 1.7, marginBottom: 28 }}>
                    {body}
                  </p>
                  {bullets.map((b) => (
                    <div key={b} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                      <Check size={16} color={bulletColor} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 14.5, color: mkt.textMuted, lineHeight: 1.5 }}>{b}</span>
                    </div>
                  ))}
                  <Link
                    href={ctaHref}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 24, fontSize: 15, fontWeight: 700, color: ctaColor, textDecoration: "none" }}
                  >
                    {cta} <ArrowRight size={15} strokeWidth={1.5} />
                  </Link>
                </div>

                {/* Mockup column */}
                <div
                  data-reveal={isOdd ? "fade-left" : "fade-right"}
                  style={{ display: "flex", justifyContent: "center", order: isOdd ? 0 : 2 }}
                >
                  <Mockup />
                </div>
              </div>

              <style>{`
                @media (max-width: 820px) {
                  .alt-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
                  .alt-grid > div { order: unset !important; }
                }
              `}</style>
            </section>
          );
        })}

        {/* ═══════════════════════════════════
            SECTION 5 — FINAL CTA
        ═══════════════════════════════════ */}
        <section
          data-testid="product-cta-band"
          style={{
            background: `linear-gradient(135deg, ${mkt.accent} 0%, ${mkt.accentHover} 100%)`,
            padding: "120px 28px",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 640, margin: "0 auto" }} data-reveal="scale">
            <h2 style={{ fontSize: "clamp(30px, 4vw, 48px)", fontWeight: 700, color: "#FFFFFF", letterSpacing: "-0.025em", marginBottom: 16, lineHeight: 1.1 }}>
              Ready To Automate Your Sales Process?
            </h2>
            <p style={{ fontSize: 18, color: "rgba(255,255,255,0.7)", lineHeight: 1.65, marginBottom: 44, maxWidth: 480, margin: "0 auto 44px" }}>
              Start free in under 10 minutes. No code, no credit card, no lock-in.
            </p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href="/Wizard"
                data-testid="product-cta-start-bottom"
                className="mkt-btn-primary"
                style={{
                  display: "inline-block", padding: "15px 36px", fontSize: 16, textDecoration: "none",
                }}
              >
                Start Free
              </Link>
              <Link
                href="/contact"
                className="mkt-btn-ghost"
                style={{
                  display: "inline-block", padding: "15px 32px", borderRadius: 14,
                  background: "transparent", color: "#FFFFFF", fontSize: 16, fontWeight: 600,
                  textDecoration: "none", border: "1.5px solid rgba(255,255,255,0.38)",
                }}
              >
                Talk to Sales
              </Link>
            </div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 24 }}>
              No credit card required · Takes 10 minutes · Cancel anytime
            </p>
          </div>
        </section>

      </div>
    </MarketingLayout>
  );
}
