import { useEffect } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import TypingReplace from "@/components/marketing/TypingReplace";
import {
  Zap, Calendar, Bot, MessageSquare, ChevronDown, CheckCircle2,
  MapPin, TrendingUp, Star, ArrowRight, Play, Globe, Share2,
} from "lucide-react";

/* ─── Design tokens ─── */
const C = {
  navy:       "#2B2B2B",
  navyLight:  "#333333",
  sage:       "#4A7C6F",
  sageDark:   "#3B6358",
  sageLight:  "#5E9485",
  sageTint:   "#EFF5F2",
  sageAccent: "#D1E8DF",
  blue:       "#5A7C91",
  gold:       "#C9A760",
  bg:         "#FFFFFF",
  bgGray:     "#F7F7F6",
  bgGrayAlt:  "#F3F3F2",
  heading:    "#111111",
  body:       "#444444",
  muted:      "#6B6B6B",
  border:     "#E5E5E3",
  borderLight:"#F0F0EE",
};

const SHADOW = {
  card:  "0 1px 3px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.04)",
  hero:  "0 16px 48px rgba(0,0,0,0.08)",
  float: "0 8px 32px rgba(0,0,0,0.06)",
};

/* ─── Static data ─── */
const TYPING_WORDS = ["Plumbers", "Roofers", "Electricians", "Cleaners", "HVAC Pros"];

const TICKER_ITEMS = [
  "⚡ Electricians", "🔧 Plumbers", "🏠 Roofers", "🧹 Cleaners",
  "❄️ HVAC", "🌿 Landscapers", "🎨 Painters", "🪵 Flooring",
  "⚡ Electricians", "🔧 Plumbers", "🏠 Roofers", "🧹 Cleaners",
  "❄️ HVAC", "🌿 Landscapers", "🎨 Painters", "🪵 Flooring",
];

const FEATURES = [
  {
    id: "quotes", icon: Zap,
    title: "Instant Quote Engine",
    body: "Customers get accurate trade-specific estimates in seconds — no phone tag, no waiting.",
    testId: "feature-card-quotes", delay: "100",
    iconBg: "linear-gradient(135deg, #4A7C6F 0%, #3B6358 100%)",
  },
  {
    id: "booking", icon: Calendar,
    title: "Booking + Deposit System",
    body: "Convert estimates into confirmed jobs with calendar booking and Stripe deposit collection.",
    testId: "feature-card-booking", delay: "200",
    iconBg: "linear-gradient(135deg, #5A7C91 0%, #4A6B7E 100%)",
  },
  {
    id: "ai", icon: Bot,
    title: "AI Chat Employees",
    body: "24/7 customer engagement, lead capture, and live estimates — even while you sleep.",
    testId: "feature-card-ai", delay: "300",
    iconBg: "linear-gradient(135deg, #8B7CB5 0%, #6E5F9E 100%)",
  },
  {
    id: "sms", icon: MessageSquare,
    title: "SMS & WhatsApp Follow-Ups",
    body: "Automated sequences that re-engage cold leads and recover jobs you'd otherwise lose.",
    testId: "feature-card-sms", delay: "400",
    iconBg: "linear-gradient(135deg, #B5707F 0%, #9E5F6E 100%)",
  },
];

const STEPS = [
  { num: "01", title: "Pick a Template", body: "Choose from 6 high-converting calculator templates designed for your trade.", testId: "step-1" },
  { num: "02", title: "Define Pricing Logic", body: "Set your rates and formulas. Our AI validates accuracy and suggests improvements.", testId: "step-2" },
  { num: "03", title: "Publish & Embed", body: "Get an instant hosted page or copy an embed snippet for your existing website.", testId: "step-3" },
];

const TESTIMONIALS = [
  {
    quote: "Went from zero online bookings to 23 confirmed jobs in our first month. The deposit feature alone changed our cash flow.",
    name: "Jake M.", role: "Owner, Metro Plumbing Co.", delay: "100",
  },
  {
    quote: "The AI employee answers leads at 2am while I sleep. We've captured 40 more leads per month than before.",
    name: "Sarah T.", role: "Director, Sparkle Cleaning Services", delay: "250",
  },
  {
    quote: "Setup took 15 minutes. We've collected over $14,000 in deposits since going live. This tool pays for itself.",
    name: "Mike R.", role: "Founder, Ridge Roofing", delay: "400",
  },
];

const PRICING_TIERS = [
  { name: "FREE",    price: "$0",   label: "Get started today",      features: ["1 calculator", "Hosted page", "50 leads/mo"],         border: "rgba(255,255,255,0.1)",  badge: null,           badgeBg: null },
  { name: "STARTER", price: "$99",  label: "For growing businesses", features: ["1 calculator", "Custom branding", "Email follow-ups"], border: "rgba(255,255,255,0.1)",  badge: null,           badgeBg: null },
  { name: "PRO",     price: "$199", label: "Most popular",           features: ["3 calculators", "AI Employee", "SMS & WhatsApp"],      border: C.sage,                   badge: "Most Popular", badgeBg: C.sage },
  { name: "ELITE",   price: "$299", label: "For agencies",           features: ["Unlimited", "White-label", "Priority support"],        border: C.gold,                   badge: "Agency",       badgeBg: C.gold },
];

const SERVICES_TEASE = [
  { icon: MapPin,     title: "Google Maps Optimization", desc: "Get found by local customers searching for your trade. GMB, citations, reviews.", price: "From $299/mo", iconBg: "linear-gradient(135deg, #4A7C6F, #5E9485)" },
  { icon: TrendingUp, title: "Website SEO + Speed",      desc: "Rank higher. Convert better. Fast-loading pages that turn visitors into leads.",  price: "From $199/mo", iconBg: "linear-gradient(135deg, #5A7C91, #4A6B7E)" },
  { icon: Star,       title: "Reputation + Social",      desc: "Reviews, automated responses, and social posts — all handled for you.",           price: "From $349/mo", iconBg: "linear-gradient(135deg, #8B7CB5, #6E5F9E)" },
];

/* ─── Sub-components ─── */

function FeatureCard({ icon: Icon, title, body, testId, delay, iconBg }: typeof FEATURES[0]) {
  return (
    <div
      data-testid={testId}
      data-reveal="fade-up"
      data-delay={delay}
      className="mkt-feature-card"
      style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16, padding: "32px 28px", boxShadow: SHADOW.card }}
    >
      <div style={{
        width: 52, height: 52, borderRadius: "50%", background: iconBg,
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20,
      }}>
        <Icon size={24} color="#FFFFFF" />
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: C.heading, marginBottom: 10, letterSpacing: "-0.01em" }}>{title}</h3>
      <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.65, margin: 0 }}>{body}</p>
    </div>
  );
}

function HeroMockup() {
  return (
    <div
      className="mkt-float"
      data-testid="hero-mockup"
      style={{
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, boxShadow: SHADOW.hero,
      }}
    >
      {/* Panel 1 — Estimate */}
      <div style={{ background: C.bgGray, border: `1px solid ${C.borderLight}`, borderRadius: 14, padding: "16px 20px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: C.sageAccent, color: C.sageDark, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
            ✓ Estimate Ready
          </span>
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: C.heading, letterSpacing: "-0.02em" }}>$1,240 – $1,680</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Bathroom Renovation · 2 hours</div>
      </div>

      {/* Connector */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <div style={{ width: 2, height: 20, background: `linear-gradient(to bottom, ${C.sage}, ${C.sageLight})`, borderRadius: 2 }} />
      </div>

      {/* Panel 2 — Booking */}
      <div style={{ background: C.bgGray, border: `1px solid ${C.borderLight}`, borderRadius: 14, padding: "14px 20px", marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>Book a Time</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => (
            <div key={d} style={{
              flex: 1, textAlign: "center", padding: "6px 0", borderRadius: 8, fontSize: 11, fontWeight: i === 1 ? 700 : 400,
              background: i === 1 ? C.sage : C.bgGrayAlt,
              color: i === 1 ? "#FFFFFF" : C.muted,
            }}>{d}</div>
          ))}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.sage }}>9:00 AM — Confirmed ✓</div>
      </div>

      {/* Connector */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <div style={{ width: 2, height: 20, background: `linear-gradient(to bottom, ${C.sage}, ${C.sageLight})`, borderRadius: 2 }} />
      </div>

      {/* Panel 3 — AI */}
      <div style={{ background: C.bgGray, border: `1px solid ${C.borderLight}`, borderRadius: 14, padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg, ${C.sage}, ${C.sageLight})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Bot size={13} color="#FFFFFF" />
          </div>
          <div style={{ fontSize: 12, color: C.body, lineHeight: 1.45 }}>
            Hi! I can help you schedule or get an exact quote 👋
          </div>
        </div>
      </div>
    </div>
  );
}

function AiChatMockup() {
  const messages = [
    { text: "Hi! Can I get a quote for repainting my lounge?", user: true },
    { text: "Of course! How large is the room (m²)?", user: false },
    { text: "About 30m², walls only.", user: true },
    { text: "Based on 30m², I estimate $680 – $920. Want to lock in a time?", user: false },
  ];
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, width: "100%", maxWidth: 380, boxShadow: SHADOW.hero }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${C.borderLight}` }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg, ${C.sage}, ${C.sageLight})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Bot size={16} color="#FFFFFF" />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.heading }}>AI Employee</div>
          <div style={{ fontSize: 11, color: C.sage }}>● Online</div>
        </div>
      </div>
      {messages.map((m, i) => (
        <div key={i} style={{ display: "flex", justifyContent: m.user ? "flex-end" : "flex-start", marginBottom: 10 }}>
          <div style={{
            maxWidth: "82%", padding: "10px 14px",
            borderRadius: m.user ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
            background: m.user ? C.sage : C.bgGray,
            fontSize: 13, color: m.user ? "#FFFFFF" : C.body, lineHeight: 1.5,
          }}>{m.text}</div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <div style={{ flex: 1, background: C.bgGray, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: C.muted }}>
          Type a message…
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: C.sage, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <ArrowRight size={16} color="#FFFFFF" />
        </div>
      </div>
    </div>
  );
}

function BookingMockup() {
  const days = [
    { d: 15, avail: true }, { d: 16, avail: false }, { d: 17, avail: true },
    { d: 18, avail: true, sel: true }, { d: 19, avail: false }, { d: 20, avail: true }, { d: 21, avail: true },
  ];
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 20, padding: 28, boxShadow: SHADOW.card, maxWidth: 380 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 2 }}>Book a slot</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.heading }}>March 2026</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, background: C.sageTint, color: C.sage, padding: "4px 12px", borderRadius: 20 }}>7 slots left</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 20 }}>
        {days.map(({ d, avail, sel }: any, i) => (
          <div key={i} style={{
            textAlign: "center", padding: "8px 0", borderRadius: 10,
            fontSize: 13, fontWeight: sel ? 700 : 500,
            background: sel ? C.sage : avail ? C.bgGrayAlt : "transparent",
            color: sel ? "#FFFFFF" : avail ? C.heading : C.border,
            border: sel ? "none" : avail ? `1px solid ${C.border}` : "none",
          }}>{d}</div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {["9:00 AM", "11:00 AM"].map((t, i) => (
          <div key={t} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 14px", borderRadius: 10,
            background: i === 0 ? C.sage : C.bgGrayAlt,
            border: i === 0 ? "none" : `1px solid ${C.border}`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: i === 0 ? "#FFFFFF" : C.heading }}>{t}</span>
            {i === 0 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>Selected ✓</span>}
          </div>
        ))}
        <div style={{ background: C.sageAccent, borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#065F46" }}>Deposit collected</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#065F46" }}>$200 ✓</span>
        </div>
      </div>
    </div>
  );
}

function TemplateMockup() {
  const templates = [
    { name: "Classic Single", color: "#F0F4F3", accent: "#5A7C91" },
    { name: "Two Column",     color: C.sageTint, accent: C.sage },
    { name: "Multi-Step",     color: "#F3F1F7", accent: "#8B7CB5" },
    { name: "Package Cards",  color: "#F5F0F2", accent: "#B5707F" },
    { name: "Range + Gate",   color: "#F5F3EE", accent: "#C9A760" },
    { name: "Book First",     color: "#F0F5F2", accent: "#5E9485" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 380 }}>
      {templates.map(({ name, color, accent }) => (
        <div key={name} className="mkt-feature-card" style={{ background: color, borderRadius: 12, padding: "16px 14px", border: `1px solid ${accent}22`, boxShadow: SHADOW.card }}>
          <div style={{ width: 28, height: 4, background: accent, borderRadius: 2, marginBottom: 10, opacity: 0.85 }} />
          <div style={{ width: "80%", height: 3, background: accent, borderRadius: 2, marginBottom: 6, opacity: 0.3 }} />
          <div style={{ width: "60%", height: 3, background: accent, borderRadius: 2, marginBottom: 14, opacity: 0.2 }} />
          <div style={{ fontSize: 11, fontWeight: 600, color: accent }}>{name}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── Shared inline responsive CSS ─── */
const FLOW_ITEMS = [
  { icon: MapPin, label: "Google Maps" },
  { icon: Zap, label: "WeFixTrades" },
  { icon: Calendar, label: "Booking" },
  { icon: Bot, label: "24/7 Assistant" },
  { icon: Globe, label: "Website" },
];

const RESPONSIVE_CSS = `
  @media (max-width: 820px) {
    .hero-grid { grid-template-columns: 1fr !important; gap: 48px !important; text-align: center; }
    .hero-grid > div:last-child { justify-content: center !important; }
    .alt-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
  }
  @media (min-width: 700px) {
    .step-line {
      position: absolute; top: 32px;
      left: calc(16.66% + 20px); right: calc(16.66% + 20px);
      height: 2px;
      background: linear-gradient(90deg, transparent, ${C.border}, transparent);
    }
  }
  @media (max-width: 699px) {
    .step-line { display: none; }
    .flow-row { flex-direction: column !important; gap: 0 !important; }
    .flow-connector-h { display: none !important; }
    .flow-connector-v { display: block !important; }
  }
`;

/* ─── Page ─── */
export default function HomePage() {
  useScrollReveal();

  useEffect(() => {
    document.title = "WeFixTrades — Estimates, Booking & AI for Trades";
  }, []);

  return (
    <MarketingLayout>
      <style>{RESPONSIVE_CSS}</style>

      {/* ═══════════════════════════════════════
          SECTION 1 — HERO (full viewport)
      ═══════════════════════════════════════ */}
      <section
        data-testid="hero-section"
        style={{
          background: "linear-gradient(180deg, #F7F7F6 0%, #FFFFFF 100%)",
          minHeight: "calc(100vh - 72px)",
          padding: "100px 28px 120px",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          className="hero-grid"
          style={{ maxWidth: 1200, margin: "0 auto", width: "100%", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 80, alignItems: "center" }}
        >
          {/* Left — text */}
          <div>
            {/* Trust badge */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.sageTint, border: `1px solid ${C.sageAccent}`, borderRadius: 9999, padding: "6px 16px", marginBottom: 36 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.sage, letterSpacing: "0.02em" }}>✦ Trusted by Trades Worldwide</span>
            </div>

            <h1
              data-testid="hero-headline"
              style={{ fontSize: "clamp(40px, 5vw, 68px)", fontWeight: 800, color: C.heading, lineHeight: 1.06, letterSpacing: "-0.035em", marginBottom: 28 }}
            >
              One System.{" "}
              <span style={{ color: C.sage }}>More Jobs.</span>{" "}
              Zero Extra Work.
            </h1>

            <div style={{ marginTop: 10, marginBottom: 28, minHeight: 54 }}>
              <TypingReplace
                words={TYPING_WORDS}
                color={C.sage}
                fontSize="clamp(22px, 2.6vw, 38px)"
              />
            </div>

            <p style={{ fontSize: "clamp(16px, 1.8vw, 20px)", color: C.muted, lineHeight: 1.7, marginBottom: 32, maxWidth: 540 }}>
              We've already connected everything for you — quotes, bookings, Google visibility, 24/7 assistant, website and follow-ups. You just run your business.
            </p>

            {/* Benefit badges */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 40 }}>
              {["More Booked Jobs", "Less Admin Stress", "Everything Connected", "Works 24/7"].map((b) => (
                <div key={b} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.bgGrayAlt, border: `1px solid ${C.border}`, borderRadius: 9999, padding: "7px 16px" }}>
                  <CheckCircle2 size={14} color={C.sage} strokeWidth={2.5} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.body }}>{b}</span>
                </div>
              ))}
            </div>

            {/* CTA buttons */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <Link
                href="/Wizard"
                data-testid="button-start-free-hero"
                className="mkt-btn-primary"
                style={{ padding: "16px 36px", borderRadius: 9999, background: C.sage, color: "#FFFFFF", fontSize: 16, fontWeight: 700, textDecoration: "none", display: "inline-block" }}
              >
                Start Free — No Credit Card
              </Link>
              <Link
                href="/demo"
                data-testid="button-view-demo-hero"
                className="mkt-btn-ghost"
                style={{ padding: "16px 32px", borderRadius: 9999, background: "transparent", color: C.heading, fontSize: 16, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, border: `1.5px solid ${C.border}` }}
              >
                <Play size={14} fill="currentColor" /> View Live Demo
              </Link>
            </div>
          </div>

          {/* Right — floating mockup */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <HeroMockup />
          </div>
        </div>

        {/* Scroll cue */}
        <div style={{ position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.5 }}>Scroll</span>
          <ChevronDown size={18} color={C.muted} className="mkt-scroll-cue" style={{ opacity: 0.5 }} />
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 1.5 — VISUAL FLOW DIAGRAM
      ═══════════════════════════════════════ */}
      <section style={{ background: C.bg, padding: "80px 28px 64px", borderTop: `1px solid ${C.borderLight}` }}>
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <div
            className="flow-row"
            data-reveal="fade-up"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, flexWrap: "nowrap" }}
          >
            {FLOW_ITEMS.map(({ icon: Icon, label }, i) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                {/* Icon + Label */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, minWidth: 80 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: "50%", background: C.bg,
                    border: `1px solid ${C.border}`, display: "flex", alignItems: "center",
                    justifyContent: "center", boxShadow: SHADOW.card,
                  }}>
                    <Icon size={22} color={C.muted} strokeWidth={1.5} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, whiteSpace: "nowrap" }}>{label}</span>
                </div>
                {/* Horizontal connector (hidden on mobile) */}
                {i < FLOW_ITEMS.length - 1 && (
                  <>
                    <div
                      className="flow-connector-h mkt-flow-line"
                      style={{ width: 40, height: 1, background: C.border, flexShrink: 0, marginBottom: 28 }}
                    />
                    <div
                      className="flow-connector-v"
                      style={{ display: "none", width: 1, height: 28, background: C.border, margin: "0 auto" }}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
          <div data-reveal="fade-up" data-delay="200" style={{ marginTop: 36 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.heading }}>Your Trade Business</span>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 2 — TICKER
      ═══════════════════════════════════════ */}
      <div style={{ background: C.bgGrayAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "20px 0", overflow: "hidden" }}>
        <div className="mkt-ticker-track">
          {TICKER_ITEMS.map((item, i) => (
            <span key={i} style={{ fontSize: 13, fontWeight: 600, color: C.muted, padding: "0 36px", whiteSpace: "nowrap", flexShrink: 0 }}>
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════
          SECTION 3 — FEATURE CARDS GRID
      ═══════════════════════════════════════ */}
      <section data-testid="features-section" style={{ background: C.bg, padding: "112px 28px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }} data-reveal="fade-up">
            <div style={{ fontSize: 11, fontWeight: 700, color: C.sage, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
              Capabilities
            </div>
            <h2 style={{ fontSize: "clamp(28px, 3.5vw, 40px)", fontWeight: 800, color: C.heading, letterSpacing: "-0.02em", marginBottom: 16 }}>
              Capabilities that book jobs
            </h2>
            <p style={{ fontSize: 17, color: C.muted, maxWidth: 520, margin: "0 auto" }}>
              Everything a trades business needs to convert website visitors into confirmed revenue.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
            {FEATURES.map((f) => <FeatureCard key={f.id} {...f} />)}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 4 — HOW IT WORKS
      ═══════════════════════════════════════ */}
      <section data-testid="how-it-works-section" style={{ background: C.bgGray, padding: "112px 28px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", textAlign: "center" }}>
          <div data-reveal="fade-up">
            <div style={{ fontSize: 11, fontWeight: 700, color: C.sage, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
              How It Works
            </div>
            <h2 style={{ fontSize: "clamp(28px, 3.5vw, 40px)", fontWeight: 800, color: C.heading, letterSpacing: "-0.02em", marginBottom: 64 }}>
              Live in under 10 minutes
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8, position: "relative" }}>
            <div className="step-line" />
            {STEPS.map(({ num, title, body, testId }, i) => (
              <div key={testId} data-testid={testId} data-reveal="scale" data-delay={String(i * 150)} style={{ padding: "0 16px", textAlign: "center", position: "relative" }}>
                <div style={{
                  width: 64, height: 64, borderRadius: "50%", background: C.bg,
                  border: `2px solid ${C.border}`,
                  boxShadow: `0 0 0 10px ${C.sageTint}, ${SHADOW.card}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 24px", fontSize: 20, fontWeight: 800, color: C.sage, position: "relative", zIndex: 1,
                }}>
                  {num}
                </div>
                <h3 style={{ fontSize: 19, fontWeight: 700, color: C.heading, marginBottom: 10, letterSpacing: "-0.01em" }}>{title}</h3>
                <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.65, margin: 0 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 5 — SOCIAL PROOF
      ═══════════════════════════════════════ */}
      <section style={{ background: C.bg, padding: "112px 28px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }} data-reveal="fade-up">
            <h2 style={{ fontSize: "clamp(26px, 3vw, 38px)", fontWeight: 800, color: C.heading, letterSpacing: "-0.02em", marginBottom: 12 }}>
              Loved by Trades &amp; Growing Businesses Worldwide
            </h2>
            <p style={{ fontSize: 16, color: C.muted }}>Real results from real trades businesses.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
            {TESTIMONIALS.map(({ quote, name, role, delay }) => (
              <div
                key={name}
                data-reveal="fade-up"
                data-delay={delay}
                className="mkt-feature-card"
                style={{ background: C.bgGrayAlt, border: `1px solid ${C.border}`, borderRadius: 16, padding: "28px 24px", boxShadow: SHADOW.card }}
              >
                <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
                  {Array.from({ length: 5 }).map((_, i) => <span key={i} style={{ fontSize: 16, color: C.gold }}>★</span>)}
                </div>
                <p style={{ fontSize: 15, color: C.body, lineHeight: 1.65, fontStyle: "italic", marginBottom: 20 }}>"{quote}"</p>
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
      <section data-testid="feature-section-ai" style={{ background: C.bgGray, padding: "112px 28px" }}>
        <div className="alt-grid" style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
          {/* Text LEFT */}
          <div data-reveal="fade-left">
            <div style={{ fontSize: 11, fontWeight: 700, color: C.sage, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>AI Employee</div>
            <h2 style={{ fontSize: "clamp(26px, 3vw, 38px)", fontWeight: 800, color: C.heading, letterSpacing: "-0.02em", marginBottom: 18, lineHeight: 1.15 }}>
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
            <Link href="/product" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 24, fontSize: 15, fontWeight: 700, color: C.sage, textDecoration: "none" }}>
              See AI Employee <ArrowRight size={16} />
            </Link>
          </div>
          {/* Mockup RIGHT */}
          <div data-reveal="fade-right" style={{ display: "flex", justifyContent: "center" }}>
            <AiChatMockup />
          </div>
        </div>
      </section>

      {/* Block B — Booking */}
      <section data-testid="feature-section-booking" style={{ background: C.bg, padding: "112px 28px" }}>
        <div className="alt-grid" style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
          {/* Mockup LEFT */}
          <div data-reveal="fade-right" style={{ display: "flex", justifyContent: "center" }}>
            <BookingMockup />
          </div>
          {/* Text RIGHT */}
          <div data-reveal="fade-left">
            <div style={{ fontSize: 11, fontWeight: 700, color: C.blue, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>Booking engine</div>
            <h2 style={{ fontSize: "clamp(26px, 3vw, 38px)", fontWeight: 800, color: C.heading, letterSpacing: "-0.02em", marginBottom: 18, lineHeight: 1.15 }}>
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
            <Link href="/product" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 24, fontSize: 15, fontWeight: 700, color: C.blue, textDecoration: "none" }}>
              See Booking Engine <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Block C — Templates */}
      <section data-testid="feature-section-templates" style={{ background: C.bgGray, padding: "112px 28px" }}>
        <div className="alt-grid" style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
          {/* Text LEFT */}
          <div data-reveal="fade-left">
            <div style={{ fontSize: 11, fontWeight: 700, color: "#8B7CB5", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>Templates</div>
            <h2 style={{ fontSize: "clamp(26px, 3vw, 38px)", fontWeight: 800, color: C.heading, letterSpacing: "-0.02em", marginBottom: 18, lineHeight: 1.15 }}>
              Pick a template, go live today
            </h2>
            <p style={{ fontSize: 16, color: C.body, lineHeight: 1.7, marginBottom: 28 }}>
              Choose from 6 professionally designed calculator templates built specifically for trades. Single-page, multi-step, package selector — all mobile-optimised and conversion-tested.
            </p>
            {["6 high-converting templates", "Mobile-first, fully responsive", "Trade-specific recommendations"].map((b) => (
              <div key={b} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <CheckCircle2 size={18} color="#8B7CB5" />
                <span style={{ fontSize: 15, color: C.body, fontWeight: 500 }}>{b}</span>
              </div>
            ))}
            <Link href="/templates" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 24, fontSize: 15, fontWeight: 700, color: "#8B7CB5", textDecoration: "none" }}>
              Browse Templates <ArrowRight size={16} />
            </Link>
          </div>
          {/* Mockup RIGHT */}
          <div data-reveal="fade-right" style={{ display: "flex", justifyContent: "center" }}>
            <TemplateMockup />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 7 — PRICING TEASER
      ═══════════════════════════════════════ */}
      <section data-testid="pricing-teaser-section" style={{ background: "linear-gradient(160deg, #2B2B2B 0%, #1A1A1A 100%)", padding: "112px 28px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }} data-reveal="fade-up">
            <h2 style={{ fontSize: "clamp(26px, 3vw, 40px)", fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.02em", marginBottom: 12 }}>
              Simple pricing that scales with you
            </h2>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.55)" }}>Start for free. Upgrade when you're ready.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20, marginBottom: 40 }}>
            {PRICING_TIERS.map(({ name, price, label, features, border, badge, badgeBg }, i) => (
              <div
                key={name}
                data-reveal="fade-up"
                data-delay={String(i * 100)}
                className="mkt-tier-card"
                style={{ background: "rgba(255,255,255,0.05)", border: `1.5px solid ${border}`, borderRadius: 16, padding: "28px 24px", position: "relative" }}
              >
                {badge && (
                  <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: badgeBg!, color: "#FFFFFF", fontSize: 11, fontWeight: 700, padding: "4px 14px", borderRadius: 20, whiteSpace: "nowrap" }}>
                    {badge}
                  </div>
                )}
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>{name}</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.02em", marginBottom: 6 }}>
                  {price}<span style={{ fontSize: 14, fontWeight: 400, color: "rgba(255,255,255,0.4)" }}>/mo</span>
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 20 }}>{label}</div>
                {features.map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ color: C.sageLight, fontSize: 12 }}>✓</span>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>{f}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center" }}>
            <Link
              href="/pricing"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 10, border: "1.5px solid rgba(255,255,255,0.25)", color: "#FFFFFF", fontSize: 15, fontWeight: 600, textDecoration: "none", transition: "all 0.2s ease" }}
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
      <section data-testid="services-tease-section" style={{ background: C.bgGray, padding: "112px 28px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }} data-reveal="fade-up">
            <div style={{ fontSize: 11, fontWeight: 700, color: C.sage, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>Growth Services</div>
            <h2 style={{ fontSize: "clamp(26px, 3vw, 38px)", fontWeight: 800, color: C.heading, letterSpacing: "-0.02em", marginBottom: 14 }}>
              We handle the marketing. You handle the jobs.
            </h2>
            <p style={{ fontSize: 16, color: C.muted, maxWidth: 520, margin: "0 auto" }}>
              Optional done-for-you growth services to drive more traffic into your new quote calculator.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24, marginBottom: 48 }}>
            {SERVICES_TEASE.map(({ icon: Icon, title, desc, price, iconBg }, i) => (
              <div
                key={title}
                data-reveal="fade-up"
                data-delay={String(i * 150)}
                className="mkt-feature-card"
                style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16, padding: "28px 24px", boxShadow: SHADOW.card }}
              >
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                  <Icon size={22} color="#FFFFFF" />
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: C.heading, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, marginBottom: 16 }}>{desc}</p>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.sage }}>{price}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center" }}>
            <Link
              href="/services"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 10, background: C.sageTint, color: C.sage, fontSize: 15, fontWeight: 700, textDecoration: "none", border: `1.5px solid ${C.sage}33` }}
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
        style={{ background: `linear-gradient(135deg, ${C.sage} 0%, ${C.sageDark} 100%)`, padding: "136px 28px", textAlign: "center" }}
      >
        <div style={{ maxWidth: 680, margin: "0 auto" }} data-reveal="scale">
          <h2 style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.02em", marginBottom: 18, lineHeight: 1.1 }}>
            Ready to Get More Booked Jobs?
          </h2>
          <p style={{ fontSize: 18, color: "rgba(255,255,255,0.72)", lineHeight: 1.65, marginBottom: 44, maxWidth: 520, margin: "0 auto 44px" }}>
            Join thousands of trades businesses using QuickQuotePro to automate leads, bookings, and follow-ups.
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/Wizard"
              data-testid="button-start-free-cta"
              className="mkt-btn-primary"
              style={{ display: "inline-block", padding: "15px 36px", borderRadius: 10, background: "#FFFFFF", color: C.sage, fontSize: 16, fontWeight: 800, textDecoration: "none" }}
            >
              Start Free
            </Link>
            <Link
              href="/contact"
              className="mkt-btn-ghost"
              style={{ display: "inline-block", padding: "15px 32px", borderRadius: 10, background: "transparent", color: "#FFFFFF", fontSize: 16, fontWeight: 600, textDecoration: "none", border: "1.5px solid rgba(255,255,255,0.4)" }}
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
