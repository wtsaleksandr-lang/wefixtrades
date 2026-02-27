import { useEffect, useState } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import TypingReplace from "@/components/marketing/TypingReplace";
import WorkflowDemo from "@/components/marketing/WorkflowDemo";
import {
  Zap, Calendar, Cpu, MessageCircle, Check,
  ArrowRight, Shield, Star, Clock, Sparkles,
  Phone, MapPin, ThumbsUp, Globe, Mail, Wrench, Briefcase,
  Target, PhoneOff, Timer, Award, Hammer,
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

const TYPING_WORDS = ["Plumbers", "Roofers", "Electricians", "Cleaners", "HVAC Pros"];

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

const FLOW_SERVICES = [
  { label: "Instant Quotes", icon: Zap, color: "#33956A", tip: "Visitors get a price in seconds" },
  { label: "24/7 Answering", icon: Phone, color: "#5A7C91", tip: "Never miss a call or message" },
  { label: "Google Maps", icon: MapPin, color: "#C9A760", tip: "Show up when locals search" },
  { label: "Review Boost", icon: ThumbsUp, color: "#8B7CB5", tip: "Collect 5-star reviews on autopilot" },
  { label: "Follow-ups", icon: Mail, color: "#5A7C91", tip: "Auto reminders that convert quotes to jobs" },
  { label: "WebCare", icon: Globe, color: "#C9A760", tip: "Keep your site fast and secure" },
];

const FLOW_OUTCOMES = [
  { label: "More booked jobs", icon: Target, color: "#33956A", tip: "Turn more quotes into paying work" },
  { label: "Missed calls recovered", icon: PhoneOff, color: "#5A7C91", tip: "Capture every enquiry automatically" },
  { label: "Faster estimates", icon: Timer, color: "#C9A760", tip: "Quotes delivered in seconds, not hours" },
  { label: "More 5-star reviews", icon: Award, color: "#8B7CB5", tip: "Build trust with happy customer reviews" },
  { label: "You focus on the work", icon: Hammer, color: "#33956A", tip: "Less admin, more time on the tools" },
];

function FlowNode({ label, tip, icon: Icon, color }: { label: string; tip: string; icon: typeof Zap; color: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="flow-node"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: "10px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        width: "fit-content", maxWidth: 220, position: "relative",
        cursor: "default",
      }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={16} color={color} strokeWidth={1.5} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.heading, whiteSpace: "nowrap" }}>{label}</span>
      {hovered && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
          background: "#1A1A1A", color: "#FFFFFF", fontSize: 12, fontWeight: 500,
          padding: "6px 12px", borderRadius: 8, whiteSpace: "nowrap",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)", pointerEvents: "none", zIndex: 10,
        }}>
          {tip}
          <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid #1A1A1A" }} />
        </div>
      )}
    </div>
  );
}

function FlowConnectorSvg({ count, direction }: { count: number; direction: "left" | "right" }) {
  const nodeH = 52;
  const gap = 10;
  const totalH = count * nodeH + (count - 1) * gap;
  const centerY = totalH / 2;
  const w = 48;

  return (
    <svg width={w} height={totalH} style={{ overflow: "visible", flexShrink: 0 }} aria-hidden="true">
      <defs>
        <circle id={`dot-${direction}`} r="3" fill="rgba(51,149,106,0.5)" />
      </defs>
      {Array.from({ length: count }).map((_, i) => {
        const nodeY = i * (nodeH + gap) + nodeH / 2;
        const x1 = direction === "left" ? 0 : w;
        const x2 = direction === "left" ? w : 0;
        const pathId = `path-${direction}-${i}`;
        const pathD = direction === "left"
          ? `M ${x1} ${nodeY} C ${w * 0.6} ${nodeY}, ${w * 0.4} ${centerY}, ${x2} ${centerY}`
          : `M ${x1} ${centerY} C ${w * 0.6} ${centerY}, ${w * 0.4} ${nodeY}, ${x2} ${nodeY}`;
        return (
          <g key={i}>
            <path d={pathD} stroke="rgba(51,149,106,0.12)" strokeWidth="1.5" fill="none" id={pathId} />
            <use href={`#dot-${direction}`}>
              <animateMotion dur={`${2.5 + i * 0.3}s`} repeatCount="indefinite" begin={`${i * 0.4}s`}>
                <mpath href={`#${pathId}`} />
              </animateMotion>
            </use>
          </g>
        );
      })}
    </svg>
  );
}

function FlowMapHero() {
  return (
    <div data-testid="flow-map-hero" className="flow-map-container" style={{ position: "relative", maxWidth: 960, margin: "0 auto" }}>
      <div className="flow-map-desktop" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
          {FLOW_SERVICES.map((s) => (
            <FlowNode key={s.label} {...s} />
          ))}
        </div>

        <FlowConnectorSvg count={FLOW_SERVICES.length} direction="left" />

        <div className="flow-center-node" style={{
          width: 120, height: 120, borderRadius: "50%",
          background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenDark} 100%)`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          boxShadow: "0 8px 32px rgba(51,149,106,0.25)",
          position: "relative", zIndex: 2, flexShrink: 0,
        }}>
          <Briefcase size={28} color="#FFFFFF" strokeWidth={1.5} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF", marginTop: 6, textAlign: "center", lineHeight: 1.2 }}>Your<br />Business</span>
        </div>

        <FlowConnectorSvg count={FLOW_OUTCOMES.length} direction="right" />

        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
          {FLOW_OUTCOMES.map((o) => (
            <FlowNode key={o.label} {...o} />
          ))}
        </div>
      </div>

      <div className="flow-map-mobile" style={{ display: "none", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {FLOW_SERVICES.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} title={s.tip} style={{
                display: "flex", alignItems: "center", gap: 6,
                background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: "8px 12px", fontSize: 12, fontWeight: 600, color: C.heading,
              }}>
                <Icon size={14} color={s.color} strokeWidth={1.5} />
                {s.label}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 1.5, height: 24, background: "rgba(51,149,106,0.2)" }} />
          <ArrowRight size={16} color={C.sage} strokeWidth={1.5} />
        </div>
        <div className="flow-center-node" style={{
          width: 96, height: 96, borderRadius: "50%",
          background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenDark} 100%)`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          boxShadow: "0 8px 32px rgba(51,149,106,0.25)",
        }}>
          <Briefcase size={22} color="#FFFFFF" strokeWidth={1.5} />
          <span style={{ fontSize: 10, fontWeight: 700, color: "#FFFFFF", marginTop: 4, textAlign: "center", lineHeight: 1.2 }}>Your<br />Business</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 1.5, height: 24, background: "rgba(51,149,106,0.2)" }} />
          <ArrowRight size={16} color={C.sage} strokeWidth={1.5} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {FLOW_OUTCOMES.map((o) => {
            const Icon = o.icon;
            return (
              <div key={o.label} title={o.tip} style={{
                display: "flex", alignItems: "center", gap: 6,
                background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: "8px 12px", fontSize: 12, fontWeight: 600, color: C.heading,
              }}>
                <Icon size={14} color={o.color} strokeWidth={1.5} />
                {o.label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const RESPONSIVE_CSS = `
  @media (max-width: 820px) {
    .flow-map-desktop { display: none !important; }
    .flow-map-mobile { display: flex !important; }
  }
  @keyframes flowPulse {
    0%, 100% { box-shadow: 0 8px 32px rgba(51,149,106,0.25); }
    50% { box-shadow: 0 8px 40px rgba(51,149,106,0.4); }
  }
  .flow-center-node { animation: flowPulse 3s ease-in-out infinite; }
  .flow-node { transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .flow-node:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.08) !important; }
  .mkt-btn-primary:focus-visible, .mkt-btn-ghost:focus-visible {
    outline: 2px solid #2B7D58;
    outline-offset: 2px;
  }
`;

export default function HomePage() {
  useScrollReveal();

  useEffect(() => {
    document.title = "WeFixTrades — Instant Quotes, 24/7 Answering & Automations for Trades";
  }, []);

  return (
    <MarketingLayout>
      <style>{RESPONSIVE_CSS}</style>

      {/* ═══ HERO ═══ */}
      <section
        data-testid="hero-section"
        style={{
          background: C.warmGray,
          padding: "80px 28px 72px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.sageTint, border: `1px solid ${C.sageAccent}`, borderRadius: 9999, padding: "6px 16px", marginBottom: 24 }}>
            <span data-testid="badge-hero" style={{ fontSize: 12, fontWeight: 600, color: C.sage, letterSpacing: "0.02em" }}>No contracts · Cancel anytime</span>
          </div>

          <h1
            data-testid="hero-headline"
            className="hero-headline"
            style={{ fontSize: "clamp(38px, 5vw, 64px)", fontWeight: 700, color: C.heading, lineHeight: 1.08, letterSpacing: "-0.035em", marginBottom: 20, maxWidth: 620, margin: "0 auto 20px" }}
          >
            Instant Quotes. 24/7{"\u00A0"}Answering.{" "}
            More <span style={{ color: C.green }}>booked jobs</span> —{" "}
            without extra work.
          </h1>

          <p data-testid="hero-subtext" style={{ fontSize: 17, color: "rgba(17,17,17,0.72)", lineHeight: 1.65, maxWidth: 520, margin: "0 auto 28px" }}>
            Get instant quotes, 24/7 answers, and automatic follow-ups — so you book more jobs without chasing leads.
          </p>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginBottom: 28 }}>
            <Link
              href="/Wizard"
              data-testid="button-try-free-hero"
              className="mkt-btn-primary"
              style={{ padding: "14px 32px", borderRadius: 9999, background: C.greenDark, color: "#FFFFFF", fontSize: 15, fontWeight: 600, textDecoration: "none", display: "inline-block", transition: "background 0.2s ease" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#256E4C")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = C.greenDark)}
            >
              Try Free
            </Link>
            <Link
              href="/demo"
              data-testid="button-try-demo-hero"
              className="mkt-btn-ghost"
              style={{ padding: "14px 28px", borderRadius: 9999, background: "transparent", color: C.greenDark, fontSize: 15, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, border: `1.5px solid ${C.greenDark}` }}
            >
              Try Demo
            </Link>
          </div>

          <div style={{ marginBottom: 40, display: "flex", justifyContent: "center", minHeight: 44 }}>
            <TypingReplace
              words={TYPING_WORDS}
              color={C.sage}
              fontSize="clamp(20px, 2.4vw, 28px)"
            />
          </div>
        </div>

        <FlowMapHero />
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
