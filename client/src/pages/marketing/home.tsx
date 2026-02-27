import { useEffect } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import WorkflowDemo from "@/components/marketing/WorkflowDemo";
import {
  Zap, Cpu, MessageCircle, Check,
  ArrowRight, Shield, Star, Clock, Sparkles,
  Phone, ThumbsUp, Mail, Target,
} from "lucide-react";

const C = {
  bg:         "#FFFFFF",
  surface:    "#F7F7F6",
  surface2:   "#F3F3F2",
  text:       "#111111",
  textMuted:  "#6B6B6B",
  textFaint:  "#999999",
  border:     "#E5E5E3",
  borderLight:"#F0F0EE",
  accent:     "#33956A",
  accentHover:"#2B7D58",
  accentSoft: "rgba(51,149,106,0.12)",
  accentLine: "rgba(51,149,106,0.25)",
  blue:       "#5A7C91",
  gold:       "#C9A760",
  purple:     "#8B7CB5",
  heading:    "#111111",
  body:       "#444444",
  muted:      "#6B6B6B",
  sage:       "#33956A",
  sageDark:   "#2B7D58",
  sageLight:  "#4DAD7E",
  sageTint:   "#EFF5F2",
  sageAccent: "#D1E8DF",
  bgGray:     "#F7F7F6",
  bgGrayAlt:  "#F3F3F2",
  green:      "#33956A",
  greenDark:  "#2B7D58",
  warmGray:   "#F2F2F0",
  warmGrayAlt:"#EAEAE8",
};

const SHADOW = {
  card:  "0 1px 3px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.04)",
  hero:  "0 16px 48px rgba(0,0,0,0.08)",
};

const TOOLS = [
  {
    id: "quickquote",
    icon: Zap,
    title: "QuickQuotePro",
    body: "Embed instant quotes on your website. Visitors get a price in seconds — you get their details automatically.",
    href: "/product/quickquote",
    iconBg: "#EFF5F2",
    iconColor: "#33956A",
    cardBg: "#EFF5F2",
  },
  {
    id: "assistants",
    icon: Cpu,
    title: "24/7 Assistants",
    body: "Never miss a call or chat. Your assistant handles enquiries, provides quotes, and captures leads — even at 2am.",
    href: "/product/assistants",
    iconBg: "#F0EDF5",
    iconColor: "#8B7CB5",
    cardBg: "#F0EDF5",
  },
  {
    id: "followups",
    icon: MessageCircle,
    title: "Follow-ups + Reviews",
    body: "Auto reminders, quote follow-ups, and review requests that run in the background — converting more quotes into jobs.",
    href: "/product/assistants",
    iconBg: "#E8EFF5",
    iconColor: "#5A7C91",
    cardBg: "#E8EFF5",
  },
  {
    id: "visibility",
    icon: Shield,
    title: "Visibility",
    body: "Google Maps, website speed, reputation monitoring, and social posts — all handled so customers find you first.",
    href: "/solutions/visibility",
    iconBg: "#FDF0E8",
    iconColor: "#C9A760",
    cardBg: "#FDF0E8",
  },
];

const TRUST_BADGES = [
  { icon: Clock, text: "No contracts", sub: "Cancel anytime, no questions asked" },
  { icon: Sparkles, text: "Live in under 10 minutes", sub: "From sign-up to embedded on your site" },
  { icon: Star, text: "Built for busy trades", sub: "Plumbers, roofers, cleaners & more" },
];

const TESTIMONIALS = [
  {
    quote: "Went from zero online bookings to 23 confirmed jobs in our first month. The deposit feature alone changed our cash flow.",
    name: "Jake M.", role: "Owner, Metro Plumbing Co.",
  },
  {
    quote: "The 24/7 assistant answers leads at 2am while I sleep. We've captured 40 more leads per month than before.",
    name: "Sarah T.", role: "Director, Sparkle Cleaning Services",
  },
  {
    quote: "Setup took 15 minutes. We've collected over $14,000 in deposits since going live. This tool pays for itself.",
    name: "Mike R.", role: "Founder, Ridge Roofing",
  },
];

const PRICING_TIERS = [
  { name: "FREE",    price: "$0",   label: "Get started today",      features: ["1 calculator", "Hosted page", "50 leads/mo"],         border: "rgba(255,255,255,0.1)",  badge: null,           badgeBg: null },
  { name: "STARTER", price: "$99",  label: "For growing businesses", features: ["1 calculator", "Custom branding", "Email follow-ups"], border: "rgba(255,255,255,0.1)",  badge: null,           badgeBg: null },
  { name: "PRO",     price: "$199", label: "Most popular",           features: ["3 calculators", "24/7 Assistant", "SMS & WhatsApp"],   border: C.sage,                   badge: "Most Popular", badgeBg: C.sage },
];

const HERO_PILLS = [
  { icon: Zap, label: "Instant Estimates" },
  { icon: Phone, label: "24/7 Call & Chat Answering" },
  { icon: Mail, label: "Automatic Follow-ups" },
  { icon: ThumbsUp, label: "Review Boost" },
];

const RESPONSIVE_CSS = `
  .mkt-btn-primary:focus-visible, .mkt-btn-ghost:focus-visible {
    outline: 2px solid #2B7D58;
    outline-offset: 2px;
  }
  @keyframes heroPillIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .hero-pill {
    opacity: 0;
    animation: heroPillIn 0.4s cubic-bezier(0.4,0,0.2,1) forwards;
  }
  .hero-pill:nth-child(1) { animation-delay: 0.15s; }
  .hero-pill:nth-child(2) { animation-delay: 0.3s; }
  .hero-pill:nth-child(3) { animation-delay: 0.45s; }
  .hero-pill:nth-child(4) { animation-delay: 0.6s; }
  @media (max-width: 640px) {
    .hero-pills-row { flex-wrap: wrap !important; }
  }
`;

export default function HomePage() {
  useScrollReveal();

  useEffect(() => {
    document.title = "WeFixTrades — More Booked Jobs, Automatically";
  }, []);

  return (
    <MarketingLayout>
      <style>{RESPONSIVE_CSS}</style>

      {/* ═══ HERO ═══ */}
      <section
        data-testid="hero-section"
        style={{
          background: C.warmGray,
          padding: "88px 28px 80px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "38%", left: "50%", transform: "translate(-50%, -50%)",
            width: 600, height: 400,
            background: "radial-gradient(ellipse at center, rgba(51,149,106,0.06) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center", position: "relative" }}>
          <h1
            data-testid="hero-headline"
            style={{
              fontSize: "clamp(44px, 6vw, 76px)",
              fontWeight: 800,
              color: C.heading,
              lineHeight: 1.04,
              letterSpacing: "-0.04em",
              marginBottom: 32,
            }}
          >
            More <span style={{ color: C.green }}>booked jobs</span>.<br />
            Automatically.
          </h1>

          <div
            data-testid="hero-pills"
            className="hero-pills-row"
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "center",
              flexWrap: "nowrap",
              marginBottom: 28,
            }}
          >
            {HERO_PILLS.map(({ icon: PillIcon, label }) => (
              <div
                key={label}
                className="hero-pill"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "8px 16px",
                  height: 38,
                  borderRadius: 9999,
                  background: "rgba(255,255,255,0.65)",
                  border: "1px solid rgba(0,0,0,0.06)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: C.heading,
                  whiteSpace: "nowrap",
                  boxSizing: "border-box",
                }}
              >
                <PillIcon size={15} color={C.sage} strokeWidth={1.5} />
                {label}
              </div>
            ))}
          </div>

          <p
            data-testid="hero-subtext"
            style={{
              fontSize: 18,
              color: "rgba(17,17,17,0.62)",
              lineHeight: 1.65,
              maxWidth: 480,
              margin: "0 auto 36px",
              fontWeight: 400,
            }}
          >
            Customers get answers. You get booked.{" "}
            Everything runs in the background.
          </p>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/Wizard"
              data-testid="button-try-free-hero"
              className="mkt-btn-primary"
              style={{
                padding: "14px 34px",
                borderRadius: 9999,
                background: "#256E4C",
                color: "#FFFFFF",
                fontSize: 15,
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-block",
                transition: "background 0.2s ease, box-shadow 0.2s ease",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "#1F5F40";
                el.style.boxShadow = "0 4px 16px rgba(37,110,76,0.25)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "#256E4C";
                el.style.boxShadow = "none";
              }}
            >
              Try It Free
            </Link>
            <Link
              href="/product"
              data-testid="button-see-pricing-hero"
              className="mkt-btn-ghost"
              style={{
                padding: "14px 28px",
                borderRadius: 9999,
                background: "transparent",
                color: C.heading,
                fontSize: 15,
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: `1.5px solid ${C.border}`,
                transition: "border-color 0.2s ease, background 0.2s ease",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = "rgba(0,0,0,0.15)";
                el.style.background = "rgba(0,0,0,0.02)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = C.border;
                el.style.background = "transparent";
              }}
            >
              See Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 1 — WORKFLOW ═══ */}
      <section data-testid="workflow-section" style={{ background: C.warmGrayAlt, padding: "112px 28px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div data-reveal="fade-up" style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 700, color: C.heading, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 16 }}>
              From lead → quote → booking → review <span style={{ color: C.green }}>(automatic)</span>
            </h2>
            <p style={{ fontSize: 17, color: "rgba(17,17,17,0.72)", lineHeight: 1.65, maxWidth: 600 }}>
              Four steps that run on autopilot. Click each to see how it works.
            </p>
          </div>
          <div data-reveal="fade-up" data-delay="100">
            <WorkflowDemo />
          </div>
        </div>
      </section>

      {/* ═══ SECTION 2 — TOOLS THAT POWER GROWTH ═══ */}
      <section data-testid="tools-section" style={{ background: C.warmGray, padding: "112px 28px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div data-reveal="fade-up" style={{ marginBottom: 48, textAlign: "center" }}>
            <h2 style={{ fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 700, color: C.heading, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 16 }}>
              Tools that power growth
            </h2>
            <p style={{ fontSize: 17, color: "rgba(17,17,17,0.72)", lineHeight: 1.65, maxWidth: 560, margin: "0 auto" }}>
              Everything a trades business needs to win more jobs — in one platform.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }} className="tools-grid">
            {TOOLS.map((tool, i) => {
              const Icon = tool.icon;
              return (
                <Link
                  key={tool.id}
                  href={tool.href}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div
                    data-testid={`tool-card-${tool.id}`}
                    data-reveal="fade-up"
                    data-delay={String(i * 100)}
                    className="mkt-feature-card"
                    style={{
                      background: tool.cardBg,
                      borderRadius: 20,
                      padding: "32px 28px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                      height: "100%",
                      cursor: "pointer",
                      transition: "box-shadow 0.3s ease",
                    }}
                  >
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: `${tool.iconColor}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon size={24} color={tool.iconColor} strokeWidth={1.5} />
                    </div>
                    <h3 style={{ fontSize: 20, fontWeight: 700, color: C.heading, letterSpacing: "-0.01em" }}>{tool.title}</h3>
                    <p style={{ fontSize: 15, color: C.body, lineHeight: 1.65, margin: 0, flex: 1 }}>{tool.body}</p>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                      <span
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 8,
                          padding: "10px 20px", borderRadius: 9999,
                          background: "rgba(0,0,0,0.06)", color: C.heading,
                          fontSize: 14, fontWeight: 600,
                        }}
                      >
                        Explore
                        <span style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.08)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                          <ArrowRight size={14} strokeWidth={2} />
                        </span>
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          <style>{`@media (max-width: 620px) { .tools-grid { grid-template-columns: 1fr !important; } }`}</style>
        </div>
      </section>

      {/* ═══ SECTION 3 — TRUST BLOCK ═══ */}
      <section data-testid="trust-section" style={{ background: C.warmGrayAlt, padding: "112px 28px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24, marginBottom: 72 }}>
            {TRUST_BADGES.map(({ icon: Icon, text, sub }, i) => (
              <div
                key={text}
                data-testid={`trust-badge-${i}`}
                data-reveal="fade-up"
                data-delay={String(i * 100)}
                style={{
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 16,
                  padding: "28px 24px",
                  textAlign: "center",
                  boxShadow: SHADOW.card,
                }}
              >
                <div style={{ width: 52, height: 52, borderRadius: 14, background: C.sageTint, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <Icon size={24} color={C.green} strokeWidth={1.5} />
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.heading, marginBottom: 6 }}>{text}</div>
                <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>{sub}</div>
              </div>
            ))}
          </div>

          <div data-reveal="fade-up">
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h3 style={{ fontSize: "clamp(22px, 2.5vw, 30px)", fontWeight: 600, color: C.heading, letterSpacing: "-0.02em", marginBottom: 8 }}>
                What trades businesses are saying
              </h3>
              <p style={{ fontSize: 13, color: C.muted, fontStyle: "italic" }}>Example reviews (replace with real reviews)</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
              {TESTIMONIALS.map(({ quote, name, role }, i) => (
                <div
                  key={name}
                  data-testid={`testimonial-${i}`}
                  data-reveal="fade-up"
                  data-delay={String(i * 100)}
                  className="mkt-feature-card"
                  style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16, padding: "28px 24px", boxShadow: SHADOW.card }}
                >
                  <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
                    {Array.from({ length: 5 }).map((_, j) => <span key={j} style={{ fontSize: 16, color: C.gold }}>★</span>)}
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
        </div>
      </section>

      {/* ═══ SECTION 4 — PRICING TEASER ═══ */}
      <section data-testid="pricing-teaser-section" style={{ background: "linear-gradient(160deg, #2B2B2B 0%, #1A1A1A 100%)", padding: "112px 28px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }} data-reveal="fade-up">
            <h2 style={{ fontSize: "clamp(26px, 3vw, 40px)", fontWeight: 600, color: "#FFFFFF", letterSpacing: "-0.025em", marginBottom: 12 }}>
              Simple pricing that scales with you
            </h2>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.55)" }}>Start for free. Upgrade when you're ready.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, marginBottom: 32 }}>
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
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 28 }}>
              Calls/SMS usage billed at cost (you control limits).
            </p>
            <Link
              href="/product"
              data-testid="button-see-plans"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 9999, border: "1.5px solid rgba(255,255,255,0.25)", color: "#FFFFFF", fontSize: 15, fontWeight: 600, textDecoration: "none", transition: "all 0.2s ease" }}
              onMouseEnter={(e) => ((e.target as HTMLElement).style.background = "rgba(255,255,255,0.08)")}
              onMouseLeave={(e) => ((e.target as HTMLElement).style.background = "transparent")}
            >
              See plans <ArrowRight size={16} strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 5 — FINAL CTA ═══ */}
      <section
        data-testid="cta-band"
        style={{ background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenDark} 100%)`, padding: "136px 28px", textAlign: "center" }}
      >
        <div style={{ maxWidth: 680, margin: "0 auto" }} data-reveal="scale">
          <h2 style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 700, color: "#FFFFFF", letterSpacing: "-0.025em", marginBottom: 18, lineHeight: 1.1 }}>
            Ready to get more booked jobs?
          </h2>
          <p style={{ fontSize: 18, color: "rgba(255,255,255,0.72)", lineHeight: 1.65, marginBottom: 44, maxWidth: 520, margin: "0 auto 44px" }}>
            Join thousands of trades businesses using QuickQuotePro to automate quotes, bookings, and follow-ups.
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/Wizard"
              data-testid="button-try-free-cta"
              className="mkt-btn-primary"
              style={{ display: "inline-block", padding: "15px 36px", borderRadius: 9999, background: "#FFFFFF", color: C.green, fontSize: 16, fontWeight: 700, textDecoration: "none" }}
            >
              Try Free
            </Link>
            <Link
              href="/demo"
              data-testid="button-try-demo-cta"
              className="mkt-btn-ghost"
              style={{ display: "inline-block", padding: "15px 32px", borderRadius: 9999, background: "transparent", color: "#FFFFFF", fontSize: 16, fontWeight: 600, textDecoration: "none", border: "1.5px solid rgba(255,255,255,0.4)" }}
            >
              Try Demo
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
