import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import WorkflowDemo from "@/components/marketing/WorkflowDemo";
import StackedFlowCards from "@/components/marketing/StackedFlowCards";
import { mkt, colors, shadows, typography } from "@/theme/tokens";
import TrustStrip from "@/components/home/TrustStrip";
import ReviewsSection from "@/components/home/ReviewsSection";
import TradeMinutesSection from "@/components/sections/TradeMinutesSection";
import {
  Zap, Cpu, MessageCircle, Check,
  ArrowRight, Shield, Star, Clock, Sparkles,
  Phone, ThumbsUp, Mail, Target,
  MapPin, Briefcase, Award, Hammer,
  Calculator, PhoneCall, RefreshCw, Wrench,
} from "lucide-react";

const TOOLS = [
  {
    id: "quickquote",
    icon: Zap,
    title: "QuickQuotePro",
    body: "Embed instant quotes on your website. Visitors get a price in seconds — you get their details automatically.",
    href: "/product/quickquote",
    iconBg: mkt.accentTint,
    iconColor: mkt.accent,
    cardBg: mkt.accentTint,
  },
  {
    id: "assistants",
    icon: Cpu,
    title: "24/7 Assistants",
    body: "Never miss a call or chat. Your assistant handles enquiries, provides quotes, and captures leads — even at 2am.",
    href: "/product/assistants",
    iconBg: "rgba(139,124,181,0.08)",
    iconColor: "#8B7CB5",
    cardBg: "rgba(139,124,181,0.08)",
  },
  {
    id: "followups",
    icon: MessageCircle,
    title: "Follow-ups + Reviews",
    body: "Auto reminders, quote follow-ups, and review requests that run in the background — converting more quotes into jobs.",
    href: "/product/assistants",
    iconBg: mkt.cyanTint,
    iconColor: mkt.cyan,
    cardBg: mkt.cyanTint,
  },
  {
    id: "visibility",
    icon: Shield,
    title: "Visibility",
    body: "Google Maps, website speed, reputation monitoring, and social posts — all handled so customers find you first.",
    href: "/solutions/visibility",
    iconBg: mkt.orangeTint,
    iconColor: mkt.orange,
    cardBg: mkt.orangeTint,
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
  { name: "PRO",     price: "$199", label: "Most popular",           features: ["3 calculators", "24/7 Assistant", "SMS & WhatsApp"],   border: mkt.accent,               badge: "Most Popular", badgeBg: mkt.accent },
];

const HERO_PILLS = [
  { icon: Zap, label: "Instant Estimates", mobileLabel: "Instant Estimates" },
  { icon: Phone, label: "24/7 Call & Chat Answering", mobileLabel: "24/7 Call & Chat" },
  { icon: Mail, label: "Automatic Follow-ups", mobileLabel: "Auto Follow-ups" },
  { icon: ThumbsUp, label: "Review Boost", mobileLabel: "Review Boost" },
];

const HERO_TRADES = [
  "Plumbers",
  "HVAC Contractors",
  "Electricians",
  "Roofers",
  "Garage Door Pros",
  "Painters",
] as const;

const quoteFlowSteps = [
  {
    title: "Customer clicks your Google link",
    subtitle: "They land on your website or Google Business Profile.",
    badge: "Entry",
  },
  {
    title: "Instant quote shown",
    subtitle: "They answer a few questions and get pricing instantly.",
    badge: "QuickQuote",
  },
  {
    title: "Lead notification sent",
    subtitle: "You receive SMS + email with job details.",
    badge: "Alert",
  },
  {
    title: "Automated follow-ups",
    subtitle: "2 reminders + final message with discount.",
    badge: "Automation",
  },
  {
    title: "Job booked",
    subtitle: "Appointment confirmed automatically.",
    badge: "Win",
  },
];

const FLOW_SERVICES = [
  { label: "Instant Estimates on Your Site", sub: "Give prices in seconds", icon: Calculator, color: mkt.accent },
  { label: "Calls & Messages Answered 24/7", sub: "No missed jobs", icon: PhoneCall, color: mkt.cyan },
  { label: "Rank Higher on Google Maps", sub: "Show up when customers search", icon: MapPin, color: mkt.orange },
  { label: "Automatic Review Requests", sub: "Turn jobs into 5-star reviews", icon: Star, color: "#8B7CB5" },
  { label: "Quote Follow-ups Sent Automatically", sub: "No chasing leads", icon: RefreshCw, color: mkt.cyan },
  { label: "Website Speed & Fixes Handled", sub: "We keep it running fast", icon: Wrench, color: mkt.orange },
];

const FLOW_OUTCOMES = [
  { label: "More booked jobs", sub: "Turn more quotes into paying work", icon: Target, color: mkt.accent },
  { label: "Missed calls recovered", sub: "Capture every enquiry", icon: Phone, color: mkt.cyan },
  { label: "Faster estimates", sub: "Quotes delivered in seconds", icon: Zap, color: mkt.orange },
  { label: "More 5-star reviews", sub: "Build trust automatically", icon: Award, color: "#8B7CB5" },
  { label: "You focus on the work", sub: "Less admin, more tools", icon: Hammer, color: mkt.accent },
];

const FL = { cardW: 240, cardH: 56, gap: 10, connW: 52, centerR: 58, iconBox: 36 };

function FlowCard({ label, sub, icon: Icon, color }: { label: string; sub: string; icon: typeof Zap; color: string }) {
  return (
    <div
      className="flow-node"
      style={{
        display: "flex", alignItems: "center", gap: 10,
        background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 12,
        padding: "0 14px",
        width: FL.cardW, height: FL.cardH,
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        boxSizing: "border-box",
      }}
    >
      <div style={{
        width: FL.iconBox, height: FL.iconBox, borderRadius: 10,
        background: `${color}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon size={16} color={color} strokeWidth={1.5} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: mkt.text, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        <div style={{ fontSize: 10.5, fontWeight: 500, color: mkt.textMuted, lineHeight: 1.3, whiteSpace: "nowrap" }}>{sub}</div>
      </div>
    </div>
  );
}

function FlowConnectorSvg({ count, direction }: { count: number; direction: "left" | "right" }) {
  const totalH = count * FL.cardH + (count - 1) * FL.gap;
  const centerY = totalH / 2;
  const w = FL.connW;
  const cpOff = w * 0.45;

  return (
    <svg width={w} height={totalH} style={{ overflow: "visible", flexShrink: 0, display: "block" }} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => {
        const anchorY = i * (FL.cardH + FL.gap) + FL.cardH / 2;
        const pathId = `fpath-${direction}-${i}`;
        const pathD = direction === "left"
          ? `M 0 ${anchorY} C ${cpOff} ${anchorY}, ${w - cpOff} ${centerY}, ${w} ${centerY}`
          : `M 0 ${centerY} C ${cpOff} ${centerY}, ${w - cpOff} ${anchorY}, ${w} ${anchorY}`;
        return (
          <g key={i}>
            <path d={pathD} stroke={mkt.accentGlow} strokeWidth="1.5" fill="none" id={pathId} />
            <circle r="3" fill={mkt.accent} opacity="0.45">
              <animateMotion dur={`${2.8 + i * 0.35}s`} repeatCount="indefinite" begin={`${i * 0.4}s`}>
                <mpath href={`#${pathId}`} />
              </animateMotion>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

function FlowMapHero() {
  const svcH = FLOW_SERVICES.length * FL.cardH + (FLOW_SERVICES.length - 1) * FL.gap;
  const outH = FLOW_OUTCOMES.length * FL.cardH + (FLOW_OUTCOMES.length - 1) * FL.gap;
  const maxH = Math.max(svcH, outH);

  return (
    <div data-testid="flow-map-hero" style={{ position: "relative", maxWidth: 1000, margin: "0 auto" }}>
      <div className="flow-map-desktop" style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 0, minHeight: maxH,
      }}>
        <div style={{ display: "grid", gridAutoRows: FL.cardH, rowGap: FL.gap, alignItems: "center", justifyItems: "end" }}>
          {FLOW_SERVICES.map((s) => <FlowCard key={s.label} {...s} />)}
        </div>
        <FlowConnectorSvg count={FLOW_SERVICES.length} direction="left" />
        <div className="flow-center-node" style={{
          width: FL.centerR * 2, height: FL.centerR * 2, borderRadius: "50%",
          background: `linear-gradient(135deg, ${mkt.accent} 0%, ${mkt.accentHover} 100%)`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          boxShadow: `0 8px 32px ${mkt.accentGlow}`,
          position: "relative", zIndex: 2, flexShrink: 0,
        }}>
          <Briefcase size={24} color={mkt.onDark} strokeWidth={1.5} />
          <span style={{ fontSize: 10, fontWeight: 700, color: mkt.onDark, marginTop: 4, textAlign: "center", lineHeight: 1.2 }}>Your<br />Business</span>
        </div>
        <FlowConnectorSvg count={FLOW_OUTCOMES.length} direction="right" />
        <div style={{ display: "grid", gridAutoRows: FL.cardH, rowGap: FL.gap, alignItems: "center", justifyItems: "start" }}>
          {FLOW_OUTCOMES.map((o) => <FlowCard key={o.label} {...o} />)}
        </div>
      </div>

      <div className="flow-map-mobile" style={{ display: "none", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {FLOW_SERVICES.map(({ label, icon: SIcon, color }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 10,
              padding: "8px 12px", fontSize: 12, fontWeight: 600, color: mkt.text,
            }}>
              <SIcon size={14} color={color} strokeWidth={1.5} /> {label}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ width: 1.5, height: 18, background: mkt.accentGlow }} />
          <ArrowRight size={14} color={mkt.accent} strokeWidth={1.5} style={{ transform: "rotate(90deg)" }} />
        </div>
        <div className="flow-center-node" style={{
          width: 88, height: 88, borderRadius: "50%",
          background: `linear-gradient(135deg, ${mkt.accent} 0%, ${mkt.accentHover} 100%)`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          boxShadow: `0 8px 32px ${mkt.accentGlow}`,
        }}>
          <Briefcase size={20} color={mkt.onDark} strokeWidth={1.5} />
          <span style={{ fontSize: 9, fontWeight: 700, color: mkt.onDark, marginTop: 3, textAlign: "center", lineHeight: 1.2 }}>Your<br />Business</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ width: 1.5, height: 18, background: mkt.accentGlow }} />
          <ArrowRight size={14} color={mkt.accent} strokeWidth={1.5} style={{ transform: "rotate(90deg)" }} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {FLOW_OUTCOMES.map(({ label, icon: OIcon, color }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 10,
              padding: "8px 12px", fontSize: 12, fontWeight: 600, color: mkt.text,
            }}>
              <OIcon size={14} color={color} strokeWidth={1.5} /> {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const RESPONSIVE_CSS = `
  .mkt-btn-primary:focus-visible, .mkt-btn-ghost:focus-visible {
    outline: 2px solid ${mkt.accent};
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
  @media (max-width: 820px) {
    .flow-map-desktop { display: none !important; }
    .flow-map-mobile { display: flex !important; }
  }
  @keyframes flowPulse {
    0%, 100% { box-shadow: 0 8px 32px ${mkt.accentGlow}; }
    50% { box-shadow: 0 8px 40px rgba(47,107,255,0.35); }
  }
  .flow-center-node { animation: flowPulse 3s ease-in-out infinite; }
  .flow-node { transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .flow-node:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.08) !important; }
  @media (max-width: 640px) {
    .hero-section-responsive { padding: 56px 18px 48px !important; }
    .hero-pills-grid { grid-template-columns: 1fr 1fr !important; gap: 6px !important; }
    .hero-pill {
      height: 34px !important;
      padding: 8px 12px !important;
      font-size: 11px !important;
      gap: 6px !important;
      border-radius: 12px !important;
    }
    .hero-pill svg { width: 13px !important; height: 13px !important; }
    .hero-pill-label-full { display: none !important; }
    .hero-pill-label-short { display: inline !important; }
    .hero-subtext { font-size: 15px !important; margin-bottom: 28px !important; }
    .hero-cta-row { gap: 10px !important; }
    .hero-cta-row a { padding: 12px 24px !important; font-size: 14px !important; }
    .built-for-chip { height: 28px !important; padding: 4px 10px !important; gap: 6px !important; }
    .built-for-chip .bf-label { font-size: 11px !important; }
    .built-for-chip .bf-window { height: 16px !important; width: 130px !important; }
    .built-for-chip .bf-window * { font-size: 11px !important; }
  }
  @media (min-width: 641px) {
    .hero-pill-label-full { display: inline !important; }
    .hero-pill-label-short { display: none !important; }
  }
`;

export default function HomePage() {
  useScrollReveal();

  const [tradeIndex, setTradeIndex] = useState(1);
  const HERO_TRUST_LINES: ReactNode[] = [
    "Trusted by local trade's businesses.",
    "Voted as best automation tool in Canada.",
    <><span style={{ color: "#E8A317" }}>★</span> 4.7 user satisfaction score.</>,
  ];
  const [trustIndex, setTrustIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTradeIndex((prev) => (prev + 1) % HERO_TRADES.length);
    }, 2600);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTrustIndex((i) => (i + 1) % HERO_TRUST_LINES.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

  const prevTrade = HERO_TRADES[(tradeIndex - 1 + HERO_TRADES.length) % HERO_TRADES.length];
  const currTrade = HERO_TRADES[tradeIndex];
  const nextTrade = HERO_TRADES[(tradeIndex + 1) % HERO_TRADES.length];

  useEffect(() => {
    document.title = "WeFixTrades — More Booked Jobs, Automatically";
  }, []);

  return (
    <MarketingLayout>
      <style>{RESPONSIVE_CSS}</style>

      <section
        data-testid="hero-section"
        className="hero-section-responsive"
        style={{
          background: mkt.surface,
          padding: "98px 28px 80px",
          marginTop: -8,
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
            background: `radial-gradient(ellipse at center, ${mkt.accentTint} 0%, transparent 70%)`,
            pointerEvents: "none",
          }}
        />

        <style>{`
          @keyframes wf_underline_beam {
            0% { transform: translateX(-30%); opacity: 0; }
            8% { opacity: 0.95; }
            70% { opacity: 0.95; }
            100% { transform: translateX(130%); opacity: 0; }
          }
          .wf-underline {
            position: relative;
            display: inline-block;
          }
          .wf-underline::before {
            content: "";
            position: absolute;
            left: 0;
            right: 0;
            bottom: -10px;
            height: 3px;
            border-radius: 999px;
            background: rgba(59, 130, 246, 0.22);
            z-index: 0;
          }
          .wf-underline::after {
            content: "";
            position: absolute;
            left: 0;
            bottom: -10px;
            height: 3px;
            width: 34%;
            border-radius: 999px;
            background: linear-gradient(
              90deg,
              rgba(255, 70, 70, 0) 0%,
              rgba(255, 70, 70, 0.85) 45%,
              rgba(255, 70, 70, 0) 100%
            );
            animation: wf_underline_beam 6.25s ease-in-out infinite;
            z-index: 1;
          }
          @media (prefers-reduced-motion: reduce) {
            .wf-underline::after {
              animation: none !important;
              opacity: 0 !important;
            }
          }
          @keyframes wf_shimmer_sweep {
            0%   { transform: translateX(-140%) skewX(-18deg); opacity: 0; }
            8%   { opacity: 0.85; }
            32%  { opacity: 0.85; }
            40%  { opacity: 0; }
            100% { transform: translateX(240%) skewX(-18deg); opacity: 0; }
          }
          .wf-cta-shimmer {
            position: relative;
            overflow: hidden;
            isolation: isolate;
          }
          .wf-cta-shimmer::after {
            content: "";
            position: absolute;
            inset: 0;
            z-index: 1;
            pointer-events: none;
            background: linear-gradient(
              90deg,
              rgba(255,255,255,0) 0%,
              rgba(255,255,255,0.08) 38%,
              rgba(255,255,255,0.45) 50%,
              rgba(255,255,255,0.08) 62%,
              rgba(255,255,255,0) 100%
            );
            animation: wf_shimmer_sweep 4.6s ease-in-out infinite;
          }
          .wf-cta-shimmer > * {
            position: relative;
            z-index: 2;
          }
          .wf-pill-shimmer {
            position: relative;
            overflow: hidden;
            isolation: isolate;
          }
          .wf-pill-shimmer::after {
            content: "";
            position: absolute;
            inset: -30% -60%;
            z-index: 0;
            pointer-events: none;
            background: linear-gradient(
              90deg,
              rgba(47,107,255,0) 0%,
              rgba(47,107,255,0.08) 40%,
              rgba(47,107,255,0.22) 50%,
              rgba(47,107,255,0.08) 60%,
              rgba(47,107,255,0) 100%
            );
            animation: wf_shimmer_sweep 6.0s ease-in-out infinite;
            opacity: 0.9;
          }
          @media (prefers-reduced-motion: reduce) {
            .wf-cta-shimmer::after,
            .wf-pill-shimmer::after {
              animation: none !important;
              opacity: 0 !important;
            }
          }
        `}</style>

        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center", position: "relative" }}>
          <div
            data-testid="hero-headline"
            style={{
              textAlign: "center",
              marginBottom: 24,
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                margin: "0 auto",
                marginBottom: 16,
                maxWidth: "min(92vw, 760px)",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "rgba(47,107,255,0.85)",
                  boxShadow: "0 0 0 4px rgba(47,107,255,0.12)",
                  flexShrink: 0,
                }}
                aria-hidden
              />
              <span
                key={trustIndex}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "rgba(0,0,0,0.70)",
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  opacity: 1,
                  transition: "opacity 180ms ease, transform 180ms ease",
                }}
              >
                {HERO_TRUST_LINES[trustIndex]}
              </span>
            </div>

            <h1
              style={{
                fontSize: "clamp(32px, 5.5vw, 56px)",
                fontWeight: 700,
                lineHeight: 1.06,
                letterSpacing: "-0.02em",
                margin: 0,
                color: mkt.text,
                fontFamily: typography.fontFamily,
              }}
            >
              More booked jobs
            </h1>

            <h1
              style={{
                position: "relative",
                fontSize: "clamp(34px, 6.2vw, 64px)",
                fontWeight: 800,
                lineHeight: 1.02,
                letterSpacing: "-0.02em",
                margin: 0,
                marginTop: 4,
                fontFamily: typography.fontFamily,
                color: mkt.accent,
              }}
            >
              <span
                className="wf-underline"
                style={{
                  position: "relative",
                  zIndex: 2,
                  background: `linear-gradient(180deg, ${mkt.accent} 0%, ${mkt.accentHover} 100%)`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                On autopilot
              </span>

              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 1,
                  background:
                    "radial-gradient(closest-side, rgba(47,107,255,0.18), rgba(47,107,255,0.09) 42%, transparent 78%)",
                  filter: "blur(30px)",
                  opacity: 0.65,
                  pointerEvents: "none",
                }}
              />
            </h1>
          </div>

          <div
            data-testid="hero-pills"
            className="hero-pills-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, auto)",
              gap: 10,
              justifyContent: "center",
              marginBottom: 28,
            }}
          >
            {HERO_PILLS.map(({ icon: PillIcon, label, mobileLabel }) => (
              <div
                key={label}
                className="hero-pill"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  padding: "10px 16px",
                  height: 44,
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.65)",
                  border: "1px solid rgba(0,0,0,0.06)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: mkt.text,
                  boxSizing: "border-box",
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 10px rgba(0,0,0,0.06)",
                  cursor: "default",
                  transition: "all 140ms ease",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = "translateY(-2px)";
                  el.style.boxShadow = "0 10px 24px rgba(0,0,0,0.10)";
                  el.style.background = "rgba(255,255,255,0.95)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = "translateY(0px)";
                  el.style.boxShadow = "0 4px 10px rgba(0,0,0,0.06)";
                  el.style.background = "rgba(255,255,255,0.65)";
                }}
              >
                <PillIcon size={15} color={mkt.accent} strokeWidth={1.5} style={{ flexShrink: 0, transition: "transform 140ms ease" }} />
                <span className="hero-pill-label-full">{label}</span>
                <span className="hero-pill-label-short" style={{ display: "none" }}>{mobileLabel}</span>
              </div>
            ))}
          </div>

          <p
            data-testid="hero-subtext"
            className="hero-subtext"
            style={{
              maxWidth: 640,
              margin: "0 auto",
              marginTop: 16,
              marginBottom: 36,
              fontSize: 16,
              lineHeight: 1.6,
              fontWeight: 450,
              color: mkt.textMuted,
              textAlign: "center",
              fontFamily: typography.fontFamily,
            }}
          >
            Customers get answers. You get booked. Everything runs in the background.
          </p>

          <div className="hero-cta-row" style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/Wizard"
              data-testid="button-try-free-hero"
              className="mkt-btn-primary wf-cta-shimmer"
              style={{
                padding: "14px 34px",
                borderRadius: 14,
                background: `linear-gradient(180deg, ${mkt.accent} 0%, ${mkt.accentHover} 100%)`,
                color: mkt.onDark,
                fontSize: 15,
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-block",
                border: "1px solid rgba(255,255,255,0.18)",
                boxShadow: "0 16px 40px rgba(47,107,255,0.28), inset 0 1px 0 rgba(255,255,255,0.25)",
                transform: "translateY(0px)",
                transition: "transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "translateY(-1px)";
                el.style.boxShadow = "0 20px 48px rgba(47,107,255,0.34), inset 0 1px 0 rgba(255,255,255,0.30)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "translateY(0px)";
                el.style.boxShadow = "0 16px 40px rgba(47,107,255,0.28), inset 0 1px 0 rgba(255,255,255,0.25)";
              }}
            >
              <span>Try It Free</span>
            </Link>
            <Link
              href="/product"
              data-testid="button-see-pricing-hero"
              className="mkt-btn-ghost"
              style={{
                padding: "14px 28px",
                borderRadius: 14,
                background: "transparent",
                color: mkt.text,
                fontSize: 15,
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: `1.5px solid ${mkt.border}`,
                transition: "border-color 0.2s ease, background 0.2s ease",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = "rgba(0,0,0,0.15)";
                el.style.background = "rgba(0,0,0,0.02)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = mkt.border;
                el.style.background = "transparent";
              }}
            >
              See Pricing
            </Link>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: 12,
            }}
          >
            <div
              data-testid="built-for-rotator"
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 14px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.78)",
                border: "1px solid rgba(0,0,0,0.08)",
                boxShadow: "0 10px 26px rgba(0,0,0,0.08)",
                overflow: "hidden",
                minWidth: 260,
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "rgba(0,0,0,0.55)",
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}
              >
                Built for
              </span>

              <div
                style={{
                  position: "relative",
                  height: 18,
                  width: 170,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -14,
                    left: 0,
                    right: 0,
                    textAlign: "center",
                    fontSize: 11,
                    fontWeight: 650,
                    color: "rgba(29,78,216,0.55)",
                    opacity: 0.18,
                    transform: "scale(0.98)",
                    filter: "blur(0.1px)",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                  }}
                >
                  {prevTrade}
                </div>

                <div
                  key={currTrade}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    textAlign: "center",
                    fontSize: 12,
                    fontWeight: 750,
                    color: mkt.accentHover,
                    opacity: 1,
                    transform: "translateY(0px)",
                    transition: "opacity 220ms ease, transform 220ms ease",
                    whiteSpace: "nowrap",
                  }}
                >
                  {currTrade}
                </div>

                <div
                  style={{
                    position: "absolute",
                    bottom: -14,
                    left: 0,
                    right: 0,
                    textAlign: "center",
                    fontSize: 11,
                    fontWeight: 650,
                    color: "rgba(29,78,216,0.55)",
                    opacity: 0.18,
                    transform: "scale(0.98)",
                    filter: "blur(0.1px)",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                  }}
                >
                  {nextTrade}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 56 }}>
          <FlowMapHero />
        </div>
      </section>

      <TradeMinutesSection />
      <TrustStrip />
      <ReviewsSection />

      <section data-testid="workflow-section" style={{ background: mkt.surface, padding: "112px 28px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div data-reveal="fade-up" style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 16 }}>
              From lead → quote → booking → review <span style={{ color: mkt.accent }}>(automatic)</span>
            </h2>
            <p style={{ fontSize: 17, color: mkt.textMuted, lineHeight: 1.65, maxWidth: 600 }}>
              Four steps that run on autopilot. Click each to see how it works.
            </p>
          </div>
          <div data-reveal="fade-up" data-delay="100">
            <WorkflowDemo />
          </div>
        </div>
      </section>

      <section
        data-testid="quote-flow-section"
        style={{
          padding: "100px 28px",
          background: mkt.surface,
        }}
      >
        <div
          className="grid md:grid-cols-2 gap-16 items-center"
          style={{
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          <div data-reveal="fade-up">
            <h2
              style={{
                fontSize: "clamp(28px, 4vw, 44px)",
                fontWeight: 800,
                color: mkt.text,
                lineHeight: 1.1,
                marginBottom: 18,
              }}
            >
              See how a job turns into revenue.
            </h2>

            <p
              style={{
                fontSize: 16,
                lineHeight: 1.6,
                color: mkt.textMuted,
                maxWidth: 440,
              }}
            >
              From first click to confirmed booking — your system handles the quoting,
              follow-ups, and reminders automatically.
            </p>
          </div>

          <div data-reveal="fade-up" data-delay="100" style={{ display: "flex", justifyContent: "center" }}>
            <StackedFlowCards steps={quoteFlowSteps} mkt={mkt} />
          </div>
        </div>
      </section>

      <section data-testid="tools-section" style={{ background: mkt.bg, padding: "112px 28px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div data-reveal="fade-up" style={{ marginBottom: 48, textAlign: "center" }}>
            <h2 style={{ fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 16 }}>
              Tools that power growth
            </h2>
            <p style={{ fontSize: 17, color: mkt.textMuted, lineHeight: 1.65, maxWidth: 560, margin: "0 auto" }}>
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
                    <h3 style={{ fontSize: 20, fontWeight: 700, color: mkt.text, letterSpacing: "-0.01em" }}>{tool.title}</h3>
                    <p style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.65, margin: 0, flex: 1 }}>{tool.body}</p>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                      <span
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 8,
                          padding: "10px 20px", borderRadius: 14,
                          background: mkt.overlay, color: mkt.text,
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

      <section data-testid="trust-section" style={{ background: mkt.surface, padding: "112px 28px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24, marginBottom: 72 }}>
            {TRUST_BADGES.map(({ icon: Icon, text, sub }, i) => (
              <div
                key={text}
                data-testid={`trust-badge-${i}`}
                data-reveal="fade-up"
                data-delay={String(i * 100)}
                style={{
                  background: mkt.bg,
                  border: `1px solid ${mkt.border}`,
                  borderRadius: 16,
                  padding: "28px 24px",
                  textAlign: "center",
                  boxShadow: shadows.card,
                }}
              >
                <div style={{ width: 52, height: 52, borderRadius: 14, background: mkt.accentTint, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <Icon size={24} color={mkt.accent} strokeWidth={1.5} />
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: mkt.text, marginBottom: 6 }}>{text}</div>
                <div style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.5 }}>{sub}</div>
              </div>
            ))}
          </div>

          <div data-reveal="fade-up">
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h3 style={{ fontSize: "clamp(22px, 2.5vw, 30px)", fontWeight: 600, color: mkt.text, letterSpacing: "-0.02em", marginBottom: 8 }}>
                What trades businesses are saying
              </h3>
              <p style={{ fontSize: 13, color: mkt.textMuted, fontStyle: "italic" }}>Example reviews (replace with real reviews)</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
              {TESTIMONIALS.map(({ quote, name, role }, i) => (
                <div
                  key={name}
                  data-testid={`testimonial-${i}`}
                  data-reveal="fade-up"
                  data-delay={String(i * 100)}
                  className="mkt-feature-card"
                  style={{ background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 16, padding: "28px 24px", boxShadow: shadows.card }}
                >
                  <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
                    {Array.from({ length: 5 }).map((_, j) => <span key={j} style={{ fontSize: 16, color: mkt.orange }}>★</span>)}
                  </div>
                  <p style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.65, fontStyle: "italic", marginBottom: 20 }}>"{quote}"</p>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: mkt.text }}>{name}</div>
                    <div style={{ fontSize: 13, color: mkt.textMuted }}>{role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section data-testid="pricing-teaser-section" style={{ background: `linear-gradient(160deg, ${mkt.darkHover} 0%, ${mkt.dark} 100%)`, padding: "112px 28px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }} data-reveal="fade-up">
            <h2 style={{ fontSize: "clamp(26px, 3vw, 40px)", fontWeight: 600, color: mkt.onDark, letterSpacing: "-0.025em", marginBottom: 12 }}>
              Simple pricing that scales with you
            </h2>
            <p style={{ fontSize: 17, color: mkt.onDarkFaint }}>Start for free. Upgrade when you're ready.</p>
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
                  <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: badgeBg!, color: mkt.onDark, fontSize: 11, fontWeight: 700, padding: "4px 14px", borderRadius: 20, whiteSpace: "nowrap" }}>
                    {badge}
                  </div>
                )}
                <div style={{ fontSize: 11, fontWeight: 700, color: mkt.onDarkFaint, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>{name}</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: mkt.onDark, letterSpacing: "-0.02em", marginBottom: 6 }}>
                  {price}<span style={{ fontSize: 14, fontWeight: 400, color: mkt.onDarkFaint }}>/mo</span>
                </div>
                <div style={{ fontSize: 13, color: mkt.onDarkFaint, marginBottom: 20 }}>{label}</div>
                {features.map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ color: mkt.accent, fontSize: 12 }}>✓</span>
                    <span style={{ fontSize: 13, color: mkt.onDarkMuted }}>{f}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 13, color: mkt.onDarkFaint, marginBottom: 28 }}>
              Calls/SMS usage billed at cost (you control limits).
            </p>
            <Link
              href="/product"
              data-testid="button-see-plans"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 14, border: "1.5px solid rgba(255,255,255,0.25)", color: mkt.onDark, fontSize: 15, fontWeight: 600, textDecoration: "none", transition: "all 0.2s ease" }}
              onMouseEnter={(e) => ((e.target as HTMLElement).style.background = "rgba(255,255,255,0.08)")}
              onMouseLeave={(e) => ((e.target as HTMLElement).style.background = "transparent")}
            >
              See plans <ArrowRight size={16} strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </section>

      <section
        data-testid="cta-band"
        style={{ background: `linear-gradient(135deg, ${mkt.accent} 0%, ${mkt.accentHover} 100%)`, padding: "136px 28px", textAlign: "center" }}
      >
        <div style={{ maxWidth: 680, margin: "0 auto" }} data-reveal="scale">
          <h2 style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.025em", marginBottom: 18, lineHeight: 1.1 }}>
            Ready to get more booked jobs?
          </h2>
          <p style={{ fontSize: 18, color: mkt.onDarkMuted, lineHeight: 1.65, marginBottom: 44, maxWidth: 520, margin: "0 auto 44px" }}>
            Join thousands of trades businesses using QuickQuotePro to automate quotes, bookings, and follow-ups.
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/Wizard"
              data-testid="button-try-free-cta"
              className="mkt-btn-primary"
              style={{ display: "inline-block", padding: "15px 36px", borderRadius: 14, background: mkt.onDark, color: mkt.accent, fontSize: 16, fontWeight: 700, textDecoration: "none" }}
            >
              Try Free
            </Link>
            <Link
              href="/demo"
              data-testid="button-try-demo-cta"
              className="mkt-btn-ghost"
              style={{ display: "inline-block", padding: "15px 32px", borderRadius: 14, background: "transparent", color: mkt.onDark, fontSize: 16, fontWeight: 600, textDecoration: "none", border: "1.5px solid rgba(255,255,255,0.4)" }}
            >
              Try Demo
            </Link>
          </div>
          <p style={{ fontSize: 13, color: mkt.onDarkFaint, marginTop: 24 }}>
            No credit card required · Live in 10 minutes · Cancel anytime
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}
