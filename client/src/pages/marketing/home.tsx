import { useEffect, useState } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import {
  Zap, Calendar, Bot, MessageSquare, ChevronDown, CheckCircle2,
  MapPin, TrendingUp, Star, ArrowRight, Play,
} from "lucide-react";

const C = {
  navy: "#0B1F3A",
  navyLight: "#132D4F",
  sage: "#2D6A4F",
  sageDark: "#1B4332",
  sageLight: "#40916C",
  sageTint: "#F0F7F4",
  sageAccent: "#D1FAE5",
  blue: "#2563EB",
  gold: "#F59E0B",
  bg: "#FFFFFF",
  bgGray: "#F8FAFC",
  bgGrayDark: "#F1F5F9",
  heading: "#0F172A",
  body: "#334155",
  muted: "#64748B",
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
};

const SHADOW = {
  card: "0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05)",
  cardHover: "0 8px 40px rgba(0,0,0,0.10)",
  hero: "0 24px 80px rgba(0,0,0,0.24)",
};

const TICKER_ITEMS = [
  "⚡ Electricians", "🔧 Plumbers", "🏠 Roofers", "🧹 Cleaners",
  "❄️ HVAC", "🌿 Landscapers", "🎨 Painters", "🪵 Flooring",
  "⚡ Electricians", "🔧 Plumbers", "🏠 Roofers", "🧹 Cleaners",
  "❄️ HVAC", "🌿 Landscapers", "🎨 Painters", "🪵 Flooring",
];

const FEATURES = [
  {
    id: "quotes",
    icon: Zap,
    title: "Instant Quote Engine",
    body: "Customers get accurate trade-specific estimates in seconds — no phone tag, no waiting.",
    testId: "feature-card-quotes",
    delay: "100",
    color: "#2D6A4F",
    bg: "#F0F7F4",
  },
  {
    id: "booking",
    icon: Calendar,
    title: "Booking + Deposit System",
    body: "Convert estimates into confirmed jobs with calendar booking and Stripe deposit collection.",
    testId: "feature-card-booking",
    delay: "200",
    color: "#2563EB",
    bg: "#EFF6FF",
  },
  {
    id: "ai",
    icon: Bot,
    title: "AI Chat & Voice Employees",
    body: "24/7 customer engagement, lead capture, and live estimates — even while you sleep.",
    testId: "feature-card-ai",
    delay: "300",
    color: "#7C3AED",
    bg: "#F5F3FF",
  },
  {
    id: "sms",
    icon: MessageSquare,
    title: "SMS & WhatsApp Follow-Ups",
    body: "Automated sequences that re-engage cold leads and recover jobs you'd otherwise lose.",
    testId: "feature-card-sms",
    delay: "400",
    color: "#DB2777",
    bg: "#FDF2F8",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Pick a Template",
    body: "Choose from 6 high-converting calculator templates designed for trades.",
    testId: "step-1",
  },
  {
    num: "02",
    title: "Define Pricing Logic",
    body: "Set your rates and formulas. Our AI validates accuracy and suggests improvements.",
    testId: "step-2",
  },
  {
    num: "03",
    title: "Publish & Embed",
    body: "Get an instant hosted page or copy an embed snippet for your existing website.",
    testId: "step-3",
  },
];

const TESTIMONIALS = [
  {
    stars: 5,
    quote: "Went from zero online bookings to 23 confirmed jobs in our first month. The deposit feature alone changed our cash flow.",
    name: "Jake M.",
    role: "Owner, Metro Plumbing Co.",
    delay: "100",
  },
  {
    stars: 5,
    quote: "The AI employee answers leads at 2am while I sleep. We've captured 40 more leads per month than before.",
    name: "Sarah T.",
    role: "Director, Sparkle Cleaning Services",
    delay: "250",
  },
  {
    stars: 5,
    quote: "Setup took 15 minutes. We've collected over $14,000 in deposits since going live. This tool pays for itself.",
    name: "Mike R.",
    role: "Founder, Ridge Roofing",
    delay: "400",
  },
];

const PRICING_TIERS = [
  {
    name: "FREE",
    price: "$0",
    label: "Get started today",
    features: ["1 calculator", "Hosted page", "50 leads/mo"],
    border: "rgba(255,255,255,0.1)",
    badge: null,
    badgeBg: null,
  },
  {
    name: "STARTER",
    price: "$99",
    label: "For growing businesses",
    features: ["1 calculator", "Custom branding", "Email follow-ups"],
    border: "rgba(255,255,255,0.1)",
    badge: null,
    badgeBg: null,
  },
  {
    name: "PRO",
    price: "$199",
    label: "Most popular",
    features: ["3 calculators", "AI Employee", "SMS & WhatsApp"],
    border: "#2D6A4F",
    badge: "Most Popular",
    badgeBg: "#2D6A4F",
  },
  {
    name: "ELITE",
    price: "$299",
    label: "For agencies",
    features: ["Unlimited", "White-label", "Priority support"],
    border: "#F59E0B",
    badge: "Agency",
    badgeBg: "#F59E0B",
  },
];

const SERVICES_TEASE = [
  {
    icon: MapPin,
    title: "Google Maps Optimization",
    desc: "Get found by local customers searching for your trade. GMB, citations, reviews.",
    price: "From $299/mo",
    color: "#2D6A4F",
    bg: "#F0F7F4",
  },
  {
    icon: TrendingUp,
    title: "Website SEO + Speed",
    desc: "Rank higher. Convert better. Fast-loading pages that turn visitors into leads.",
    price: "From $199/mo",
    color: "#2563EB",
    bg: "#EFF6FF",
  },
  {
    icon: Star,
    title: "Reputation + Social",
    desc: "Reviews, automated responses, and social posts — all handled for you.",
    price: "From $349/mo",
    color: "#7C3AED",
    bg: "#F5F3FF",
  },
];

function HeroMockup() {
  return (
    <div
      className="mkt-float"
      data-testid="hero-mockup"
      style={{
        background: "rgba(15, 29, 52, 0.85)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 24,
        padding: 28,
        width: "100%",
        maxWidth: 420,
        boxShadow: SHADOW.hero,
      }}
    >
      {/* Panel 1 — Estimate */}
      <div
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 14,
          padding: "16px 20px",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "#D1FAE5",
              color: "#065F46",
              borderRadius: 20,
              padding: "3px 10px",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            ✓ Estimate Ready
          </span>
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.02em" }}>
          $1,240 – $1,680
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
          Bathroom Renovation · Standard finish · 2 rooms
        </div>
      </div>

      {/* Connector */}
      <div style={{ display: "flex", alignItems: "center", padding: "4px 24px", gap: 6, marginBottom: 12 }}>
        <div style={{ width: 2, height: 20, background: C.sage, borderRadius: 1, margin: "0 auto" }} />
      </div>

      {/* Panel 2 — Booking */}
      <div
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 14,
          padding: "16px 20px",
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", marginBottom: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Book a Time
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {["M", "T", "W", "T", "F"].map((d, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "8px 0",
                borderRadius: 8,
                background: i === 1 ? C.sage : "rgba(255,255,255,0.06)",
                color: i === 1 ? "#FFFFFF" : "rgba(255,255,255,0.5)",
                fontSize: 12,
                fontWeight: i === 1 ? 700 : 400,
              }}
            >
              {d}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>9:00 AM — Confirmed</span>
          <span style={{ fontSize: 11, background: "#D1FAE5", color: "#065F46", borderRadius: 20, padding: "3px 10px", fontWeight: 700 }}>$200 deposit ✓</span>
        </div>
      </div>

      {/* Connector */}
      <div style={{ padding: "4px 24px", marginBottom: 12 }}>
        <div style={{ width: 2, height: 20, background: C.sage, borderRadius: 1, margin: "0 auto" }} />
      </div>

      {/* Panel 3 — AI chat */}
      <div
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 14,
          padding: "16px 20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #2D6A4F, #40916C)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Bot size={14} color="#FFFFFF" />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF" }}>AI Employee</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Online now</span>
            </div>
          </div>
        </div>
        <div
          style={{
            background: "rgba(45,106,79,0.2)",
            borderRadius: "12px 12px 12px 4px",
            padding: "10px 14px",
            fontSize: 13,
            color: "rgba(255,255,255,0.85)",
            lineHeight: 1.5,
          }}
        >
          Hi! I can give you an exact quote and book your appointment right now 👋
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, body, testId, delay, color, bg }: typeof FEATURES[0]) {
  return (
    <div
      data-testid={testId}
      data-reveal="fade-up"
      data-delay={delay}
      className="mkt-feature-card"
      style={{
        background: "#FFFFFF",
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: "32px 28px",
        boxShadow: SHADOW.card,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <Icon size={24} color={color} />
      </div>
      <h3
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: C.heading,
          marginBottom: 10,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h3>
      <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.65, margin: 0 }}>
        {body}
      </p>
    </div>
  );
}

function BookingMockup() {
  const days = [
    { d: 15, avail: true }, { d: 16, avail: false }, { d: 17, avail: true },
    { d: 18, avail: true, sel: true }, { d: 19, avail: false }, { d: 20, avail: true }, { d: 21, avail: true },
  ];
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: `1px solid ${C.border}`,
        borderRadius: 20,
        padding: 28,
        boxShadow: SHADOW.card,
        maxWidth: 380,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 2 }}>Book a slot</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.heading }}>March 2026</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, background: C.sageTint, color: C.sage, padding: "4px 12px", borderRadius: 20 }}>
          7 slots left
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 20 }}>
        {days.map(({ d, avail, sel }, i) => (
          <div
            key={i}
            style={{
              textAlign: "center",
              padding: "8px 0",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: sel ? 700 : 500,
              background: sel ? C.sage : avail ? "#F8FAFC" : "transparent",
              color: sel ? "#FFFFFF" : avail ? C.heading : C.border,
              border: sel ? "none" : avail ? `1px solid ${C.border}` : "none",
              cursor: avail ? "pointer" : "default",
            }}
          >
            {d}
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {["9:00 AM", "11:00 AM"].map((t, i) => (
          <div
            key={t}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 14px",
              borderRadius: 10,
              background: i === 0 ? C.sage : "#F8FAFC",
              border: i === 0 ? "none" : `1px solid ${C.border}`,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: i === 0 ? "#FFFFFF" : C.heading }}>{t}</span>
            {i === 0 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>Selected ✓</span>}
          </div>
        ))}
        <div style={{ background: "#D1FAE5", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#065F46" }}>Deposit collected</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#065F46" }}>$200 ✓</span>
        </div>
      </div>
    </div>
  );
}

function TemplateMockup() {
  const templates = [
    { name: "Classic Single", color: "#EFF6FF", accent: "#2563EB" },
    { name: "Two Column", color: "#F0F7F4", accent: "#2D6A4F" },
    { name: "Multi-Step", color: "#F5F3FF", accent: "#7C3AED" },
    { name: "Package Cards", color: "#FDF2F8", accent: "#DB2777" },
    { name: "Range + Gate", color: "#FFFBEB", accent: "#D97706" },
    { name: "Book First", color: "#F0FDF4", accent: "#16A34A" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 380 }}>
      {templates.map(({ name, color, accent }) => (
        <div
          key={name}
          className="mkt-feature-card"
          style={{
            background: color,
            borderRadius: 12,
            padding: "16px 14px",
            border: `1px solid ${accent}22`,
            boxShadow: SHADOW.card,
          }}
        >
          <div style={{ width: 28, height: 4, background: accent, borderRadius: 2, marginBottom: 10, opacity: 0.8 }} />
          <div style={{ width: "80%", height: 3, background: accent, borderRadius: 2, marginBottom: 6, opacity: 0.3 }} />
          <div style={{ width: "60%", height: 3, background: accent, borderRadius: 2, marginBottom: 14, opacity: 0.2 }} />
          <div style={{ fontSize: 11, fontWeight: 600, color: accent }}>{name}</div>
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  useScrollReveal();

  useEffect(() => {
    document.title = "QuickQuotePro — Estimates, Booking & AI for Trades";
  }, []);

  return (
    <MarketingLayout>
      {/* ═══════════════════════════════════════
          SECTION 1 — HERO
      ═══════════════════════════════════════ */}
      <section
        data-testid="hero-section"
        style={{
          background: `linear-gradient(160deg, ${C.navy} 0%, #0F2744 55%, #1a3550 100%)`,
          padding: "80px 28px 96px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle background orbs */}
        <div
          style={{
            position: "absolute", top: -80, right: -80, width: 500, height: 500,
            borderRadius: "50%", background: "rgba(45,106,79,0.12)", pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute", bottom: -100, left: -60, width: 360, height: 360,
            borderRadius: "50%", background: "rgba(37,99,235,0.08)", pointerEvents: "none",
          }}
        />

        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 64,
            alignItems: "center",
          }}
          className="hero-grid"
        >
          {/* Left text block */}
          <div>
            {/* Badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(45,106,79,0.25)",
                border: "1px solid rgba(45,106,79,0.4)",
                borderRadius: 20,
                padding: "5px 14px",
                marginBottom: 28,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6EE7B7", letterSpacing: "0.02em" }}>
                ✦ Trusted by Trades Worldwide
              </span>
            </div>

            <h1
              data-testid="hero-headline"
              style={{
                fontSize: "clamp(36px, 4.5vw, 60px)",
                fontWeight: 800,
                color: "#FFFFFF",
                lineHeight: 1.08,
                letterSpacing: "-0.03em",
                marginBottom: 24,
              }}
            >
              Software That Turns{" "}
              <span style={{ color: "#6EE7B7" }}>Visitors</span>{" "}
              Into Booked Jobs{" "}
              <span style={{ color: "#6EE7B7" }}>Automatically</span>
            </h1>

            <p
              style={{
                fontSize: "clamp(16px, 1.8vw, 20px)",
                color: "rgba(255,255,255,0.65)",
                lineHeight: 1.65,
                marginBottom: 40,
                maxWidth: 520,
              }}
            >
              Instant quotes, smart booking, and AI employees — built for trades businesses that want more jobs without more admin.
            </p>

            {/* CTA Buttons */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 36 }}>
              <Link
                href="/Wizard"
                data-testid="button-start-free-hero"
                className="mkt-btn-primary"
                style={{
                  padding: "14px 30px",
                  borderRadius: 10,
                  background: C.sage,
                  color: "#FFFFFF",
                  fontSize: 15,
                  fontWeight: 700,
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Start Free — No Credit Card
              </Link>
              <Link
                href="/demo"
                data-testid="button-view-demo-hero"
                className="mkt-btn-ghost"
                style={{
                  padding: "14px 28px",
                  borderRadius: 10,
                  background: "transparent",
                  color: "#FFFFFF",
                  fontSize: 15,
                  fontWeight: 600,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: "1.5px solid rgba(255,255,255,0.3)",
                }}
              >
                <Play size={14} fill="currentColor" />
                View Live Demo
              </Link>
            </div>

            {/* Trade category pills */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["Plumbers", "Roofers", "Electricians", "Cleaners", "Home Services"].map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "rgba(255,255,255,0.45)",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 20,
                    padding: "4px 12px",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Right mockup */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <HeroMockup />
          </div>
        </div>

        {/* Scroll cue */}
        <div
          style={{
            position: "absolute",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Scroll</span>
          <ChevronDown size={18} color="rgba(255,255,255,0.3)" className="mkt-scroll-cue" />
        </div>

        {/* Mobile hero responsive override */}
        <style>{`
          @media (max-width: 820px) {
            .hero-grid {
              grid-template-columns: 1fr !important;
              gap: 48px !important;
              text-align: center;
            }
            .hero-grid > div:last-child {
              justify-content: center !important;
            }
          }
        `}</style>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 2 — TICKER
      ═══════════════════════════════════════ */}
      <div
        style={{
          background: C.bgGray,
          borderTop: `1px solid ${C.border}`,
          borderBottom: `1px solid ${C.border}`,
          padding: "18px 0",
          overflow: "hidden",
        }}
      >
        <div className="mkt-ticker-track">
          {TICKER_ITEMS.map((item, i) => (
            <span
              key={i}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: C.muted,
                padding: "0 36px",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════
          SECTION 3 — FEATURE GRID
      ═══════════════════════════════════════ */}
      <section
        data-testid="features-section"
        style={{ background: "#FFFFFF", padding: "96px 28px" }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }} data-reveal="fade-up">
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.sage,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              Capabilities
            </div>
            <h2
              style={{
                fontSize: "clamp(28px, 3.5vw, 42px)",
                fontWeight: 800,
                color: C.heading,
                letterSpacing: "-0.02em",
                marginBottom: 16,
              }}
            >
              Capabilities that book jobs
            </h2>
            <p style={{ fontSize: 17, color: C.muted, maxWidth: 520, margin: "0 auto" }}>
              Everything a trades business needs to convert website visitors into confirmed revenue.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 24,
            }}
          >
            {FEATURES.map((f) => <FeatureCard key={f.id} {...f} />)}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 4 — HOW IT WORKS
      ═══════════════════════════════════════ */}
      <section
        data-testid="how-it-works-section"
        style={{ background: C.bgGray, padding: "96px 28px" }}
      >
        <div style={{ maxWidth: 960, margin: "0 auto", textAlign: "center" }}>
          <div data-reveal="fade-up">
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.sage,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              How It Works
            </div>
            <h2
              style={{
                fontSize: "clamp(28px, 3.5vw, 40px)",
                fontWeight: 800,
                color: C.heading,
                letterSpacing: "-0.02em",
                marginBottom: 64,
              }}
            >
              Live in under 10 minutes
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8, position: "relative" }}>
            {/* Connecting line — desktop only */}
            <style>{`
              @media (min-width: 700px) {
                .step-connector {
                  position: absolute;
                  top: 32px;
                  left: calc(16.66% + 20px);
                  right: calc(16.66% + 20px);
                  height: 2px;
                  background: linear-gradient(90deg, transparent, ${C.border}, transparent);
                  pointer-events: none;
                }
              }
              @media (max-width: 699px) {
                .step-connector { display: none; }
              }
            `}</style>
            <div className="step-connector" />

            {STEPS.map(({ num, title, body, testId }, i) => (
              <div
                key={testId}
                data-testid={testId}
                data-reveal="fade-up"
                data-delay={String(i * 150)}
                style={{ padding: "0 16px", textAlign: "center", position: "relative" }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: "#FFFFFF",
                    border: `2px solid ${C.border}`,
                    boxShadow: `0 0 0 10px ${C.sageTint}, ${SHADOW.card}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 24px",
                    fontSize: 20,
                    fontWeight: 800,
                    color: C.sage,
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  {num}
                </div>
                <h3
                  style={{
                    fontSize: 19,
                    fontWeight: 700,
                    color: C.heading,
                    marginBottom: 10,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {title}
                </h3>
                <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.65, margin: 0 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 5 — SOCIAL PROOF
      ═══════════════════════════════════════ */}
      <section style={{ background: "#FFFFFF", padding: "96px 28px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }} data-reveal="fade-up">
            <h2
              style={{
                fontSize: "clamp(26px, 3vw, 38px)",
                fontWeight: 800,
                color: C.heading,
                letterSpacing: "-0.02em",
                marginBottom: 12,
              }}
            >
              Loved by Trades &amp; Growing Businesses Worldwide
            </h2>
            <p style={{ fontSize: 16, color: C.muted }}>
              Real results from real trades businesses.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 24,
            }}
          >
            {TESTIMONIALS.map(({ stars, quote, name, role, delay }) => (
              <div
                key={name}
                data-reveal="fade-up"
                data-delay={delay}
                className="mkt-feature-card"
                style={{
                  background: C.bgGray,
                  border: `1px solid ${C.border}`,
                  borderRadius: 16,
                  padding: "28px 24px",
                  boxShadow: SHADOW.card,
                }}
              >
                <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
                  {Array.from({ length: stars }).map((_, i) => (
                    <span key={i} style={{ fontSize: 16, color: "#F59E0B" }}>★</span>
                  ))}
                </div>
                <p
                  style={{
                    fontSize: 15,
                    color: C.body,
                    lineHeight: 1.65,
                    fontStyle: "italic",
                    marginBottom: 20,
                  }}
                >
                  "{quote}"
                </p>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.heading }}>{name}</div>
                  <div style={{ fontSize: 13, color: C.muted }}>{role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 6 — FEATURE BREAKDOWN (Alternating)
      ═══════════════════════════════════════ */}

      {/* Block A — AI Employee */}
      <section
        data-testid="feature-section-ai"
        style={{ background: C.bgGray, padding: "96px 28px" }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 80,
            alignItems: "center",
          }}
          className="alt-grid"
        >
          <div data-reveal="fade-left">
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.sage,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              AI Employee
            </div>
            <h2
              style={{
                fontSize: "clamp(26px, 3vw, 38px)",
                fontWeight: 800,
                color: C.heading,
                letterSpacing: "-0.02em",
                marginBottom: 18,
                lineHeight: 1.15,
              }}
            >
              Never miss a lead — even at 2am
            </h2>
            <p style={{ fontSize: 16, color: C.body, lineHeight: 1.7, marginBottom: 28 }}>
              Your AI employee chats with website visitors, answers questions, generates instant estimates, and books appointments — automatically, around the clock.
            </p>
            {["Web Chat & Voice", "SMS & WhatsApp messaging", "Escalate to you when needed"].map((b) => (
              <div key={b} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <CheckCircle2 size={18} color={C.sage} />
                <span style={{ fontSize: 15, color: C.body, fontWeight: 500 }}>{b}</span>
              </div>
            ))}
            <Link
              href="/product"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginTop: 24,
                fontSize: 15,
                fontWeight: 700,
                color: C.sage,
                textDecoration: "none",
              }}
            >
              See AI Employee <ArrowRight size={16} />
            </Link>
          </div>

          {/* AI Chat Mockup */}
          <div data-reveal="fade-right" style={{ display: "flex", justifyContent: "center" }}>
            <div
              style={{
                background: C.navy,
                borderRadius: 20,
                padding: 24,
                width: "100%",
                maxWidth: 380,
                boxShadow: SHADOW.hero,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #2D6A4F, #40916C)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Bot size={16} color="#FFFFFF" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>AI Employee</div>
                  <div style={{ fontSize: 11, color: "#22C55E" }}>● Online</div>
                </div>
              </div>
              {[
                { text: "Hi! Can I get a quote for repainting my lounge?", user: true },
                { text: "Of course! How large is the room (m²), and are we painting walls only or ceiling too?", user: false },
                { text: "About 30m², walls only.", user: true },
                { text: "Based on 30m², I estimate $680 – $920. Want to lock in a time?", user: false },
              ].map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: m.user ? "flex-end" : "flex-start",
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      maxWidth: "80%",
                      padding: "10px 14px",
                      borderRadius: m.user ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                      background: m.user ? C.sage : "rgba(255,255,255,0.08)",
                      fontSize: 13,
                      color: "#FFFFFF",
                      lineHeight: 1.5,
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <div style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                  Type a message…
                </div>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: C.sage, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <ArrowRight size={16} color="#FFFFFF" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <style>{`
          @media (max-width: 820px) { .alt-grid { grid-template-columns: 1fr !important; gap: 40px !important; } }
        `}</style>
      </section>

      {/* Block B — Booking */}
      <section
        data-testid="feature-section-booking"
        style={{ background: "#FFFFFF", padding: "96px 28px" }}
      >
        <div
          className="alt-grid"
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 80,
            alignItems: "center",
          }}
        >
          <div data-reveal="fade-left" style={{ display: "flex", justifyContent: "center" }}>
            <BookingMockup />
          </div>
          <div data-reveal="fade-right">
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.blue,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              Booking Engine
            </div>
            <h2
              style={{
                fontSize: "clamp(26px, 3vw, 38px)",
                fontWeight: 800,
                color: C.heading,
                letterSpacing: "-0.02em",
                marginBottom: 18,
                lineHeight: 1.15,
              }}
            >
              Turn estimates into paid bookings
            </h2>
            <p style={{ fontSize: 16, color: C.body, lineHeight: 1.7, marginBottom: 28 }}>
              Embed a booking calendar directly into your estimate flow. Customers pick a time, pay a deposit via Stripe, and you're notified instantly — no phone calls needed.
            </p>
            {["Calendar-based slot selection", "Stripe deposit collection", "Automated confirmation emails"].map((b) => (
              <div key={b} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <CheckCircle2 size={18} color={C.blue} />
                <span style={{ fontSize: 15, color: C.body, fontWeight: 500 }}>{b}</span>
              </div>
            ))}
            <Link
              href="/product"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginTop: 24,
                fontSize: 15,
                fontWeight: 700,
                color: C.blue,
                textDecoration: "none",
              }}
            >
              See Booking Engine <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Block C — Templates */}
      <section
        data-testid="feature-section-templates"
        style={{ background: C.bgGray, padding: "96px 28px" }}
      >
        <div
          className="alt-grid"
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 80,
            alignItems: "center",
          }}
        >
          <div data-reveal="fade-left">
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#7C3AED",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              Templates
            </div>
            <h2
              style={{
                fontSize: "clamp(26px, 3vw, 38px)",
                fontWeight: 800,
                color: C.heading,
                letterSpacing: "-0.02em",
                marginBottom: 18,
                lineHeight: 1.15,
              }}
            >
              Pick a template, go live today
            </h2>
            <p style={{ fontSize: 16, color: C.body, lineHeight: 1.7, marginBottom: 28 }}>
              Choose from 6 professionally designed calculator templates built specifically for trades. Single-page, multi-step, package selector — all mobile-optimised and conversion-tested.
            </p>
            {["6 high-converting templates", "Mobile-first, fully responsive", "Trade-specific recommendations"].map((b) => (
              <div key={b} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <CheckCircle2 size={18} color="#7C3AED" />
                <span style={{ fontSize: 15, color: C.body, fontWeight: 500 }}>{b}</span>
              </div>
            ))}
            <Link
              href="/templates"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginTop: 24,
                fontSize: 15,
                fontWeight: 700,
                color: "#7C3AED",
                textDecoration: "none",
              }}
            >
              Browse Templates <ArrowRight size={16} />
            </Link>
          </div>
          <div data-reveal="fade-right" style={{ display: "flex", justifyContent: "center" }}>
            <TemplateMockup />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 7 — PRICING TEASER
      ═══════════════════════════════════════ */}
      <section
        data-testid="pricing-teaser-section"
        style={{
          background: `linear-gradient(160deg, ${C.navy} 0%, #0F2744 100%)`,
          padding: "96px 28px",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }} data-reveal="fade-up">
            <h2
              style={{
                fontSize: "clamp(26px, 3vw, 40px)",
                fontWeight: 800,
                color: "#FFFFFF",
                letterSpacing: "-0.02em",
                marginBottom: 12,
              }}
            >
              Simple pricing that scales with you
            </h2>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.55)" }}>
              Start for free. Upgrade when you're ready.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 20,
              marginBottom: 40,
            }}
          >
            {PRICING_TIERS.map(({ name, price, label, features, border, badge, badgeBg }, i) => (
              <div
                key={name}
                data-reveal="fade-up"
                data-delay={String(i * 100)}
                className="mkt-tier-card"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: `1.5px solid ${border}`,
                  borderRadius: 16,
                  padding: "28px 24px",
                  position: "relative",
                }}
              >
                {badge && (
                  <div
                    style={{
                      position: "absolute",
                      top: -12,
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: badgeBg!,
                      color: "#FFFFFF",
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "4px 14px",
                      borderRadius: 20,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {badge}
                  </div>
                )}
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                  {name}
                </div>
                <div style={{ fontSize: 36, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.02em", marginBottom: 6 }}>
                  {price}
                  <span style={{ fontSize: 14, fontWeight: 400, color: "rgba(255,255,255,0.4)" }}>/mo</span>
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 20 }}>{label}</div>
                {features.map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ color: "#6EE7B7", fontSize: 12 }}>✓</span>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>{f}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center" }}>
            <Link
              href="/pricing"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "13px 28px",
                borderRadius: 10,
                border: "1.5px solid rgba(255,255,255,0.25)",
                color: "#FFFFFF",
                fontSize: 15,
                fontWeight: 600,
                textDecoration: "none",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => ((e.target as HTMLElement).style.background = "rgba(255,255,255,0.08)")}
              onMouseLeave={(e) => ((e.target as HTMLElement).style.background = "transparent")}
            >
              View Full Pricing <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 8 — SERVICES TEASE
      ═══════════════════════════════════════ */}
      <section
        data-testid="services-tease-section"
        style={{ background: "#FFFFFF", padding: "96px 28px" }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }} data-reveal="fade-up">
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.sage,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              Growth Services
            </div>
            <h2
              style={{
                fontSize: "clamp(26px, 3vw, 38px)",
                fontWeight: 800,
                color: C.heading,
                letterSpacing: "-0.02em",
                marginBottom: 14,
              }}
            >
              We handle the marketing. You handle the jobs.
            </h2>
            <p style={{ fontSize: 16, color: C.muted, maxWidth: 520, margin: "0 auto" }}>
              Optional done-for-you growth services to drive more traffic into your new quote calculator.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 24,
              marginBottom: 48,
            }}
          >
            {SERVICES_TEASE.map(({ icon: Icon, title, desc, price, color, bg }, i) => (
              <div
                key={title}
                data-reveal="fade-up"
                data-delay={String(i * 150)}
                className="mkt-feature-card"
                style={{
                  background: "#FFFFFF",
                  border: `1px solid ${C.border}`,
                  borderRadius: 16,
                  padding: "28px 24px",
                  boxShadow: SHADOW.card,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    background: bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 18,
                  }}
                >
                  <Icon size={22} color={color} />
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: C.heading, marginBottom: 8 }}>
                  {title}
                </h3>
                <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, marginBottom: 16 }}>{desc}</p>
                <div style={{ fontSize: 13, fontWeight: 600, color }}>
                  {price}
                </div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center" }}>
            <Link
              href="/services"
              className="mkt-btn-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "13px 28px",
                borderRadius: 10,
                background: C.sageTint,
                color: C.sage,
                fontSize: 15,
                fontWeight: 700,
                textDecoration: "none",
                border: `1.5px solid ${C.sage}33`,
              }}
            >
              Explore All Services <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 9 — BIG CTA
      ═══════════════════════════════════════ */}
      <section
        data-testid="cta-band"
        style={{
          background: `linear-gradient(135deg, ${C.sage} 0%, ${C.sageDark} 100%)`,
          padding: "120px 28px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 680, margin: "0 auto" }} data-reveal="scale">
          <h2
            style={{
              fontSize: "clamp(32px, 4vw, 52px)",
              fontWeight: 800,
              color: "#FFFFFF",
              letterSpacing: "-0.02em",
              marginBottom: 18,
              lineHeight: 1.1,
            }}
          >
            Ready to Get More Booked Jobs?
          </h2>
          <p
            style={{
              fontSize: 18,
              color: "rgba(255,255,255,0.72)",
              lineHeight: 1.65,
              marginBottom: 44,
              maxWidth: 520,
              margin: "0 auto 44px",
            }}
          >
            Join thousands of trades businesses using QuickQuotePro to automate leads, bookings, and follow-ups.
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/Wizard"
              data-testid="button-start-free-cta"
              className="mkt-btn-primary"
              style={{
                display: "inline-block",
                padding: "15px 36px",
                borderRadius: 10,
                background: "#FFFFFF",
                color: C.sage,
                fontSize: 16,
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              Start Free
            </Link>
            <Link
              href="/contact"
              className="mkt-btn-ghost"
              style={{
                display: "inline-block",
                padding: "15px 32px",
                borderRadius: 10,
                background: "transparent",
                color: "#FFFFFF",
                fontSize: 16,
                fontWeight: 600,
                textDecoration: "none",
                border: "1.5px solid rgba(255,255,255,0.4)",
              }}
            >
              Talk to Sales
            </Link>
          </div>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 24 }}>
            No credit card required · Live in 10 minutes · Cancel anytime
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}
