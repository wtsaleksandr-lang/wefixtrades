import { useEffect } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import {
  Zap, Calendar, Bot, MessageSquare, LayoutDashboard, Palette,
  Check, ArrowRight, Play, Users, TrendingUp, ChevronRight,
} from "lucide-react";
import { mkt, colors, shadows } from "@/theme/tokens";

const C = {
  navy: mkt.dark,
  navyLight: mkt.darkHover,
  sage: mkt.accent,
  sageDark: mkt.accentHover,
  sageLight: mkt.accent,
  sageTint: mkt.accentTint,
  sageAccent: mkt.accentTint,
  blue: colors.accent.blue,
  blueTint: colors.accent.blueTint,
  purple: "#7C3AED",
  purpleTint: "#F5F3FF",
  pink: "#DB2777",
  pinkTint: "#FDF2F8",
  orange: mkt.orange,
  orangeTint: mkt.orangeTint,
  gold: mkt.warning,
  bg: mkt.bg,
  bgGray: mkt.surface,
  bgGrayDark: mkt.surface,
  heading: mkt.text,
  body: mkt.textMuted,
  muted: mkt.textMuted,
  border: mkt.border,
  borderLight: mkt.borderLight,
};

const SHADOW = {
  card: shadows.card,
  hero: shadows.xl,
  md: shadows.md,
};

const CAPABILITIES = [
  {
    icon: Zap,
    title: "Instant Quote Engine",
    body: "Trade-specific pricing formulas, 10 pricing types, AI-validated accuracy — instant results every time.",
    color: C.sage, bg: C.sageTint, testId: "cap-quotes", delay: "100",
  },
  {
    icon: Calendar,
    title: "Booking + Deposits",
    body: "Turn estimates into confirmed jobs. Customers pick a time, pay a deposit via Stripe — no phone calls.",
    color: C.blue, bg: C.blueTint, testId: "cap-booking", delay: "200",
  },
  {
    icon: Bot,
    title: "AI Employee",
    body: "24/7 chat and voice assistant that answers questions, generates estimates, and books appointments.",
    color: C.purple, bg: C.purpleTint, testId: "cap-ai", delay: "300",
  },
  {
    icon: MessageSquare,
    title: "SMS & WhatsApp",
    body: "Automated follow-ups, lead recovery, and two-way conversations powered by Twilio AI.",
    color: C.pink, bg: C.pinkTint, testId: "cap-sms", delay: "400",
  },
];

const FLOW_STEPS = [
  { label: "Visitor", sub: "Lands on your site", icon: Users, color: C.blue },
  { label: "Estimate", sub: "Gets instant price", icon: Zap, color: C.sage },
  { label: "Books", sub: "Pays deposit online", icon: Calendar, color: C.purple },
  { label: "AI follows up", sub: "SMS & chat reminders", icon: Bot, color: C.orange },
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
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 20, padding: 28, boxShadow: SHADOW.md, maxWidth: 380 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20 }}>
        Bathroom Renovation Quote
      </div>
      {[
        { label: "Room size", value: "12m²", type: "pill" },
        { label: "Finish grade", value: "Standard", type: "pill" },
        { label: "Tiles included", value: "Yes", type: "pill" },
      ].map(({ label, value }) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 14, color: C.body }}>{label}</span>
          <span style={{ fontSize: 13, fontWeight: 600, background: C.bgGray, border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 12px", color: C.heading }}>{value}</span>
        </div>
      ))}
      <div style={{ borderTop: `1px solid ${C.border}`, margin: "20px 0" }} />
      <div style={{ background: C.sage, borderRadius: 14, padding: "20px 24px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 6 }}>Your Estimate</div>
        <div style={{ fontSize: 36, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.02em" }}>$1,240 – $1,680</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>Calculated in 0.2s · Valid for 7 days</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <div style={{ flex: 1, background: C.sage, borderRadius: 10, padding: "11px", textAlign: "center", fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>
          Book Now
        </div>
        <div style={{ flex: 1, background: C.bgGray, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px", textAlign: "center", fontSize: 13, fontWeight: 600, color: C.body }}>
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
    <div style={{ background: C.navy, borderRadius: 20, padding: 24, maxWidth: 380, boxShadow: SHADOW.hero }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: C.sage, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Bot size={17} color="#FFFFFF" strokeWidth={1.5} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>AI Employee</div>
          <div style={{ fontSize: 11, color: "#4A7C6F", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4A7C6F", display: "inline-block" }} />
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
            background: m.user ? C.sage : "rgba(255,255,255,0.08)",
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
        <div style={{ width: 34, height: 34, borderRadius: 10, background: C.sage, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <ArrowRight size={15} color="#FFFFFF" strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}

function BookingMockup() {
  const days = [14,15,16,17,18,19,20].map((d, i) => ({ d, sel: i === 3, avail: i !== 1 && i !== 5 }));
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 20, padding: 28, boxShadow: SHADOW.md, maxWidth: 380 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 2 }}>Select a slot</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.heading }}>March 2026</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, background: C.sageTint, color: C.sage, padding: "4px 12px", borderRadius: 20 }}>Stripe deposits on</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 18 }}>
        {days.map(({ d, sel, avail }, i) => (
          <div key={i} style={{
            textAlign: "center", padding: "8px 0", borderRadius: 9,
            fontSize: 13, fontWeight: sel ? 700 : 500,
            background: sel ? C.sage : avail ? C.bgGray : "transparent",
            color: sel ? "#FFFFFF" : avail ? C.heading : C.border,
            border: sel ? "none" : avail ? `1px solid ${C.border}` : "none",
          }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        {["9:00 AM", "11:30 AM", "2:00 PM"].map((t, i) => (
          <div key={t} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 14px", borderRadius: 10,
            background: i === 0 ? C.sage : C.bgGray,
            border: i === 0 ? "none" : `1px solid ${C.border}`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: i === 0 ? "#FFFFFF" : C.heading }}>{t}</span>
            {i === 0 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>Selected ✓</span>}
          </div>
        ))}
      </div>
      <div style={{ background: C.sageAccent, borderRadius: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between" }}>
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
    { label: "Views", w: "100%", color: C.blue },
    { label: "Estimates", w: "68%", color: C.sage },
    { label: "Leads", w: "42%", color: C.purple },
    { label: "Bookings", w: "24%", color: C.orange },
    { label: "Paid", w: "18%", color: "#059669" },
  ];
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, boxShadow: SHADOW.md, maxWidth: 400 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.heading, marginBottom: 16 }}>Dashboard — Last 30 Days</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        {stats.map(({ label, val, delta, up }) => (
          <div key={label} style={{ background: C.bgGray, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.heading, letterSpacing: "-0.01em" }}>{val}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: up ? "#059669" : "#DC2626", marginTop: 2 }}>{delta} vs last month</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>Conversion Funnel</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {funnelSteps.map(({ label, w, color }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 60, fontSize: 12, color: C.muted, flexShrink: 0 }}>{label}</div>
            <div style={{ flex: 1, background: C.bgGray, borderRadius: 4, height: 8, overflow: "hidden" }}>
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
    { name: "Classic Single", color: C.blueTint, accent: C.blue },
    { name: "Two Column", color: C.sageTint, accent: C.sage },
    { name: "Multi-Step", color: C.purpleTint, accent: C.purple },
    { name: "Package Cards", color: C.pinkTint, accent: C.pink },
    { name: "Range + Lead Gate", color: C.orangeTint, accent: C.orange },
    { name: "Estimate + Book", color: "#F0FDF4", accent: "#16A34A" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 380 }}>
      {templates.map(({ name, color, accent }) => (
        <div key={name} className="mkt-feature-card" style={{
          background: color, borderRadius: 12, padding: "16px 14px",
          border: `1px solid ${accent}22`, boxShadow: SHADOW.card,
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
    labelColor: C.sage,
    bulletColor: C.sage,
    ctaColor: C.sage,
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
    labelColor: C.purple,
    bulletColor: C.purple,
    ctaColor: C.purple,
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
    labelColor: C.blue,
    bulletColor: C.blue,
    ctaColor: C.blue,
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
      "White-label: custom domain, your branding, no QuickQuotePro logo",
    ],
    cta: "Browse Templates",
    ctaHref: "/templates",
    labelColor: C.pink,
    bulletColor: C.pink,
    ctaColor: C.pink,
    testId: "deep-section-templates",
    mockup: TemplateMockup,
  },
];

export default function ProductPage() {
  useScrollReveal();

  useEffect(() => {
    document.title = "Product — QuickQuotePro | Everything Trades Need to Convert Leads";
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
            background: `linear-gradient(160deg, ${C.navy} 0%, #0F2744 55%, #1a3550 100%)`,
            padding: "80px 28px 96px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: -100, right: -60, width: 500, height: 500, borderRadius: "50%", background: "rgba(45,106,79,0.1)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -80, left: -80, width: 400, height: 400, borderRadius: "50%", background: "rgba(37,99,235,0.07)", pointerEvents: "none" }} />

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
                background: "rgba(45,106,79,0.25)", border: "1px solid rgba(45,106,79,0.4)",
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
                QuickQuotePro combines instant estimates, booking, AI employees, and automation into one conversion engine built specifically for trades.
              </p>

              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <Link
                  href="/Wizard"
                  data-testid="product-cta-start"
                  className="mkt-btn-primary"
                  style={{
                    padding: "14px 30px", borderRadius: 10, background: C.sage,
                    color: "#FFFFFF", fontSize: 15, fontWeight: 700, textDecoration: "none",
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
                  padding: 26, width: "100%", maxWidth: 400, boxShadow: SHADOW.hero,
                }}
              >
                {/* Estimate result */}
                <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, padding: "16px 20px", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, background: C.sageAccent, color: "#065F46", borderRadius: 20, padding: "3px 10px" }}>✓ Estimate Ready</span>
                  <div style={{ fontSize: 30, fontWeight: 800, color: "#FFF", letterSpacing: "-0.02em", marginTop: 8 }}>$1,240 – $1,680</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>Bathroom Reno · 12m² · Standard</div>
                </div>
                <div style={{ height: 20, display: "flex", alignItems: "center", padding: "0 24px" }}>
                  <div style={{ width: 2, height: "100%", background: C.sage, borderRadius: 1, margin: "0 auto" }} />
                </div>
                {/* Calendar */}
                <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, padding: "14px 18px", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Book a Slot</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["M","T","W","T","F"].map((d, i) => (
                      <div key={i} style={{
                        flex: 1, textAlign: "center", padding: "7px 0", borderRadius: 8,
                        background: i === 1 ? C.sage : "rgba(255,255,255,0.07)",
                        color: i === 1 ? "#FFF" : "rgba(255,255,255,0.45)",
                        fontSize: 12, fontWeight: i === 1 ? 700 : 400,
                      }}>{d}</div>
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>9:00 AM — Confirmed</span>
                    <span style={{ fontSize: 11, background: C.sageAccent, color: "#065F46", padding: "2px 10px", borderRadius: 20, fontWeight: 700 }}>$200 ✓</span>
                  </div>
                </div>
                <div style={{ height: 20, display: "flex", alignItems: "center", padding: "0 24px" }}>
                  <div style={{ width: 2, height: "100%", background: C.sage, borderRadius: 1, margin: "0 auto" }} />
                </div>
                {/* AI bubble */}
                <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, padding: "14px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 10, background: C.sage, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Bot size={13} color="#FFF" strokeWidth={1.5} />
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#FFF" }}>AI Employee <span style={{ color: "#4A7C6F" }}>●</span></div>
                  </div>
                  <div style={{ background: "rgba(45,106,79,0.25)", borderRadius: "10px 10px 10px 3px", padding: "9px 12px", fontSize: 12.5, color: "rgba(255,255,255,0.82)", lineHeight: 1.5 }}>
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
        <section data-testid="capabilities-section" style={{ background: C.bg, padding: "96px 28px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 56 }} data-reveal="fade-up">
              <div style={{ fontSize: 11, fontWeight: 700, color: C.sage, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                Core Platform
              </div>
              <h2 style={{ fontSize: "clamp(26px, 3.5vw, 40px)", fontWeight: 600, color: C.heading, letterSpacing: "-0.025em", marginBottom: 14 }}>
                Four engines. One platform. Zero friction.
              </h2>
              <p style={{ fontSize: 17, color: C.muted, maxWidth: 520, margin: "0 auto" }}>
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
                    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16,
                    padding: "32px 28px", boxShadow: SHADOW.card,
                  }}
                >
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                    <Icon size={24} color={color} strokeWidth={1.5} />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: C.heading, marginBottom: 10, letterSpacing: "-0.01em" }}>{title}</h3>
                  <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.65, margin: 0 }}>{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════
            SECTION 3 — HOW IT CONNECTS
        ═══════════════════════════════════ */}
        <section data-testid="flow-section" style={{ background: C.bgGray, padding: "96px 28px" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 64 }} data-reveal="fade-up">
              <div style={{ fontSize: 11, fontWeight: 700, color: C.sage, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                The Automation Flow
              </div>
              <h2 style={{ fontSize: "clamp(26px, 3.5vw, 40px)", fontWeight: 600, color: C.heading, letterSpacing: "-0.025em", marginBottom: 14 }}>
                How every visitor becomes a confirmed job
              </h2>
              <p style={{ fontSize: 16, color: C.muted, maxWidth: 480, margin: "0 auto" }}>
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
                        background: C.border,
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

                    <div style={{ fontSize: 14, fontWeight: 700, color: C.heading, textAlign: "center", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 12, color: C.muted, textAlign: "center", lineHeight: 1.4 }}>{sub}</div>
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
                    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 18px",
                    boxShadow: SHADOW.card,
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 10 }}>{icon}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.heading, marginBottom: 6 }}>{title}</div>
                  <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{body}</div>
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
              style={{ background: isOdd ? C.bgGray : C.bg, padding: "96px 28px" }}
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
                  <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 600, color: C.heading, letterSpacing: "-0.025em", marginBottom: 16, lineHeight: 1.15 }}>
                    {title}
                  </h2>
                  <p style={{ fontSize: 16, color: C.body, lineHeight: 1.7, marginBottom: 28 }}>
                    {body}
                  </p>
                  {bullets.map((b) => (
                    <div key={b} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                      <Check size={16} color={bulletColor} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 14.5, color: C.body, lineHeight: 1.5 }}>{b}</span>
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
            background: `linear-gradient(135deg, ${C.sage} 0%, ${C.sageDark} 100%)`,
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
                  display: "inline-block", padding: "15px 36px", borderRadius: 9999,
                  background: "#FFFFFF", color: C.sage, fontSize: 16, fontWeight: 700, textDecoration: "none",
                }}
              >
                Start Free
              </Link>
              <Link
                href="/contact"
                className="mkt-btn-ghost"
                style={{
                  display: "inline-block", padding: "15px 32px", borderRadius: 9999,
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
