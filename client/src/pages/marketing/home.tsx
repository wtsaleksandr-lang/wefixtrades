import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import gsap from "gsap";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
// WorkflowDemo removed in round 8 — covered by AutomationDiagram.
import { mkt, colors, shadows, typography } from "@/theme/tokens";
import HeroGridGlow from "@/components/marketing/HeroGridGlow";
import ReviewsSection from "@/components/home/ReviewsSection";
import HeroTradeDivider from "@/components/marketing/HeroTradeDivider";
import TrustMarquee from "@/components/marketing/TrustMarquee";
import CapabilitiesShowcase from "@/components/marketing/CapabilitiesShowcase";
import StickyStackCards from "@/components/marketing/StickyStackCards";
import ServiceStackTimeline from "@/components/marketing/ServiceStackTimeline";
// FeatureCards + PillarAnimation removed in round 8 — covered by the
// 3-type sections (CapabilitiesShowcase + StickyStackCards + ServiceStackTimeline).
import CTASection from "@/components/marketing/CTASection";
import TrustSection from "@/components/marketing/TrustSection";
import GlobeSection from "@/components/marketing/globe/GlobeSection";
// ServiceCards removed in round 8 — covered by ServiceStackTimeline.
import { SurfaceSection } from "@/components/marketing/SurfaceSection";
import BuiltForRotator from "@/components/marketing/BuiltForRotator";
import AutomationDiagram from "@/components/marketing/AutomationDiagram";
import {
  Zap, Check,
  ArrowRight, Star,
  Phone, ThumbsUp, Mail, Target,
  MapPin, Briefcase, Award, Hammer,
  Calculator, PhoneCall, RefreshCw, Wrench,
} from "lucide-react";



const FLOW_SERVICES = [
  { label: "Instant Estimates on Your Site", sub: "Give prices in seconds", icon: Calculator, color: mkt.accent },
  { label: "Calls & Messages Answered 24/7", sub: "No missed jobs", icon: PhoneCall, color: mkt.cyan },
  { label: "Rank Higher on Google Maps", sub: "Show up when customers search", icon: MapPin, color: mkt.orange },
  { label: "Automatic Review Requests", sub: "Turn jobs into 5-star reviews", icon: Star, color: "#A3D190" },
  { label: "Quote Follow-ups Sent Automatically", sub: "No chasing leads", icon: RefreshCw, color: mkt.cyan },
  { label: "Website Speed & Fixes Handled", sub: "We keep it running fast", icon: Wrench, color: mkt.orange },
];

const FLOW_OUTCOMES = [
  { label: "More booked jobs", sub: "Turn more quotes into paying work", icon: Target, color: mkt.accent },
  { label: "Missed calls recovered", sub: "Capture every enquiry", icon: Phone, color: mkt.cyan },
  { label: "Faster estimates", sub: "Quotes delivered in seconds", icon: Zap, color: mkt.orange },
  { label: "More 5-star reviews", sub: "Build trust automatically", icon: Award, color: "#A3D190" },
  { label: "You focus on the work", sub: "Less admin, more tools", icon: Hammer, color: mkt.accent },
];

const FL = { cardW: 240, cardH: 56, gap: 10, connW: 52, centerR: 58, iconBox: 36 };

function FlowCard({ label, sub, icon: Icon, color }: { label: string; sub: string; icon: typeof Zap; color: string }) {
  return (
    <div
      className="flow-node"
      style={{
        display: "flex", alignItems: "center", gap: 10,
        background: mkt.surface, border: `1px solid ${mkt.border}`, borderRadius: 12,
        padding: "0 14px",
        width: FL.cardW, height: FL.cardH,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        boxSizing: "border-box",
      }}
    >
      <div style={{
        width: FL.iconBox, height: FL.iconBox, borderRadius: 10,
        background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
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
            <circle r="3" fill={mkt.accent} opacity="0.55">
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
      {/* Hidden for now — re-enable by removing display:"none" */}
      <div className="flow-map-desktop" style={{
        display: "none", alignItems: "center", justifyContent: "center", gap: 0, minHeight: maxH,
      }}>
        <div style={{ display: "grid", gridAutoRows: FL.cardH, rowGap: FL.gap, alignItems: "center", justifyItems: "end" }}>
          {FLOW_SERVICES.map((s) => <FlowCard key={s.label} {...s} />)}
        </div>
        <FlowConnectorSvg count={FLOW_SERVICES.length} direction="left" />
        <div className="flow-center-node" style={{
          width: FL.centerR * 2, height: FL.centerR * 2, borderRadius: "50%",
          background: `linear-gradient(135deg, ${mkt.accent} 0%, ${mkt.accentDark} 100%)`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          boxShadow: `0 8px 32px ${mkt.accentGlow}`,
          position: "relative", zIndex: 2, flexShrink: 0,
        }}>
          <Briefcase size={24} color={mkt.buttonText} strokeWidth={1.5} />
          <span style={{ fontSize: 10, fontWeight: 700, color: mkt.buttonText, marginTop: 6, textAlign: "center", lineHeight: 1.2 }}>Your<br />Business</span>
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
              background: mkt.surface, border: `1px solid ${mkt.border}`, borderRadius: 10,
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
          background: `linear-gradient(135deg, ${mkt.accent} 0%, ${mkt.accentDark} 100%)`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          boxShadow: `0 8px 32px ${mkt.accentGlow}`,
        }}>
          <Briefcase size={20} color={mkt.buttonText} strokeWidth={1.5} />
          <span style={{ fontSize: 9, fontWeight: 700, color: mkt.buttonText, marginTop: 3, textAlign: "center", lineHeight: 1.2 }}>Your<br />Business</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ width: 1.5, height: 18, background: mkt.accentGlow }} />
          <ArrowRight size={14} color={mkt.accent} strokeWidth={1.5} style={{ transform: "rotate(90deg)" }} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {FLOW_OUTCOMES.map(({ label, icon: OIcon, color }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: mkt.surface, border: `1px solid ${mkt.border}`, borderRadius: 10,
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

/* ── Hero email capture form ── */
function HeroEmailCapture() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg("Please enter a valid email address");
      setStatus("error");
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch("/api/demo-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          trade: "general",
          source_tool: "hero_audit",
          source_page: "homepage",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("success");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="hero-enter" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 24px", borderRadius: 14, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", maxWidth: 480, margin: "0 auto" }}>
        <Check size={16} color="#10B981" strokeWidth={2.5} />
        <span style={{ fontSize: 14, fontWeight: 600, color: "#10B981", fontFamily: typography.fontFamily }}>
          We'll send your free website audit shortly.
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="hero-enter hero-email-form" style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", maxWidth: 520, margin: "0 auto" }}>
      <input
        type="email"
        placeholder="Enter your email for a free website audit"
        value={email}
        onChange={(e) => { setEmail(e.target.value); if (status === "error") setStatus("idle"); }}
        style={{
          flex: 1, minWidth: 220, padding: "12px 16px", borderRadius: 12,
          border: status === "error" ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.06)", color: mkt.text, fontSize: 14,
          fontFamily: typography.fontFamily, outline: "none",
          transition: "border-color 0.2s",
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(102,232,250,0.4)"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = status === "error" ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.12)"; }}
      />
      <button
        type="submit"
        disabled={status === "loading"}
        style={{
          padding: "12px 24px", borderRadius: 12, border: "none",
          background: mkt.accent, color: mkt.dark, fontSize: 14, fontWeight: 700,
          fontFamily: typography.fontFamily, cursor: status === "loading" ? "wait" : "pointer",
          transition: "background 0.2s", whiteSpace: "nowrap",
          opacity: status === "loading" ? 0.7 : 1,
        }}
      >
        {status === "loading" ? "Sending..." : "Get My Free Audit"}
      </button>
      {status === "error" && (
        <div style={{ width: "100%", fontSize: 12, color: "#EF4444", marginTop: 4, textAlign: "center" }}>
          {errorMsg}
        </div>
      )}
    </form>
  );
}

/* ── Exit-intent popup ──
   DISABLED — too aggressive. Was firing at 30s on mobile and on any
   upward mouse motion on desktop. Owner found it annoying. To re-enable
   later, remove the early-return below. */
function ExitIntentPopup() {
  // Disabled — was firing aggressively (30s on mobile, any upward mouse
  // motion on desktop). To restore, pull from git history.
  return null;
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
    .flow-map-desktop { display: none !important; } /* already hidden inline */
    .flow-map-mobile { display: none !important; }
  }
  @keyframes flowPulse {
    0%, 100% { box-shadow: 0 8px 32px ${mkt.accentGlow}; }
    50% { box-shadow: 0 8px 40px rgba(102,232,250,0.35); }
  }
  .flow-center-node { animation: flowPulse 3s ease-in-out infinite; }
  .flow-node { transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .flow-node:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.20) !important; }
  @media (max-width: 768px) {
    .hero-section-responsive { padding: 110px 20px 40px !important; }
    .hero-subtext { font-size: 16px !important; }
  }
  @media (max-width: 640px) {
    .hero-section-responsive { padding: 105px 18px 32px !important; }
    .hero-subtext { margin-bottom: 24px !important; }
    .hero-email-form { flex-direction: column !important; }
    .hero-email-form input { min-width: 0 !important; }
    .hero-stats-strip { gap: 16px !important; }
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
    .hero-cta-row { gap: 8px !important; }
    .hero-cta-row .cta-arrow-btn__text { font-size: 10px !important; }
    .built-for-chip { height: 28px !important; padding: 4px 10px !important; gap: 6px !important; }
    .built-for-chip .bf-label { font-size: 11px !important; }
    .built-for-chip .bf-window { height: 16px !important; width: 130px !important; }
    .built-for-chip .bf-window * { font-size: 11px !important; }
  }
  @media (min-width: 641px) {
    .hero-pill-label-full { display: inline !important; }
    .hero-pill-label-short { display: none !important; }
  }
  @media (max-width: 640px) {
    .hero-safe-zone {
      width: 92% !important;
      height: 60% !important;
    }
  }
  /* Hero shell — Cloudflare-style framed container */
  .hero-first-screen-zone {
    min-height: 640px;
  }
  @media (min-width: 768px) {
    .hero-first-screen-zone {
      min-height: 720px;
    }
  }
  /* Backdrop responsive gaps */
  @media (max-width: 768px) {
    .hero-shell-backdrop {
      padding: 6px 4px 0 !important;
    }
    .hero-first-screen-zone {
      border-radius: 20px !important;
    }
  }
  @media (max-width: 430px) {
    .hero-shell-backdrop {
      padding: 6px 3px 0 !important;
    }
    .hero-first-screen-zone {
      border-radius: 18px !important;
    }
  }
  /* Tablet: hero zone + 150px divider = 100svh */
  @media (max-width: 1024px) {
    .hero-first-screen-zone {
      min-height: calc(100svh - 150px);
    }
  }
  /* Mobile: hero zone + 130px divider = 100svh */
  @media (max-width: 640px) {
    .hero-first-screen-zone {
      min-height: calc(100svh - 130px);
    }
  }
  /* Common mobile viewport class (around 390x844): keep first fold on hero + trade divider */
  @media (max-width: 430px) {
    .hero-first-screen-zone {
      min-height: calc(100svh - 72px);
      padding-bottom: clamp(56px, 9svh, 92px);
    }
  }
`;

export default function HomePage() {
  useScrollReveal();
  const heroRef = useRef<HTMLDivElement>(null);
  const [hasWebGL] = useState<boolean>(() => {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl"));
  });

  useEffect(() => {
    document.title = "WeFixTrades — Trades Businesses Get 3x More Leads";
  }, []);

  // Hero entrance stagger — Effortel style
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = heroRef.current;
    if (!el) return;
    const targets = el.querySelectorAll(".hero-enter");
    gsap.fromTo(
      targets,
      { y: 36, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.78,
        stagger: 0.13,
        ease: "cubic-bezier(0.526, 0.007, 0, 0.989)",
        delay: 0.1,
      }
    );
  }, []);

  return (
    <MarketingLayout>
      <style>{RESPONSIVE_CSS}</style>

      {/* Outer page background behind hero shell */}
      <div className="hero-shell-backdrop" style={{ background: mkt.darkBg, padding: "6px 6px 0", position: "relative" as const, zIndex: 1 }}>
      {/* Shared grid zone — covers hero + trust marquee seamlessly */}
      <div className="hero-first-screen-zone" style={{ position: "relative", background: mkt.darkBg, overflow: "hidden", display: "flex", flexDirection: "column", width: "100%", borderRadius: 24, border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 20px 60px rgba(0,0,0,0.25), 0 4px 20px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
        {/* Subtle inner lighting overlay */}
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(255,255,255,0.02), rgba(0,0,0,0.2))", pointerEvents: "none", zIndex: 0, borderRadius: "inherit" }} />
        <HeroGridGlow className="hero-grid-glow" />

        {/* Built-for rotator — top-left, below navbar */}
        <div style={{ position: "absolute", top: 56, left: 28, zIndex: 3 }}>
          <BuiltForRotator />
        </div>

      <section
        data-testid="hero-section"
        className="hero-section-responsive"
        style={{
          background: "transparent",
          padding: "132px 28px 56px",
          marginTop: -8,
          position: "relative",
        }}
      >

        <div
          aria-hidden="true"
          className="hero-safe-zone"
          style={{
            position: "absolute",
            left: "50%",
            top: "45%",
            transform: "translate(-50%, -50%)",
            width: "70%",
            maxWidth: 1000,
            height: "55%",
            background: `radial-gradient(ellipse at center, rgba(34,40,42,0.95) 0%, rgba(34,40,42,0.82) 20%, rgba(34,40,42,0.58) 38%, rgba(34,40,42,0.22) 58%, rgba(34,40,42,0.06) 74%, transparent 90%)`,
            pointerEvents: "none",
            zIndex: 1,
          }}
        />

        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "32%", left: "50%", transform: "translate(-50%, -50%)",
            width: 800, height: 500,
            background: `radial-gradient(ellipse at center, rgba(102,232,250,0.08) 0%, rgba(102,232,250,0.03) 40%, transparent 70%)`,
            pointerEvents: "none",
            zIndex: 1,
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
            background: rgba(102,232,250, 0.22);
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
              rgba(102,232,250,0) 0%,
              rgba(102,232,250,0.85) 45%,
              rgba(102,232,250,0) 100%
            );
            animation: wf_underline_beam 6.25s ease-in-out infinite;
            z-index: 1;
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
              rgba(255,255,255,0.06) 38%,
              rgba(255,255,255,0.35) 50%,
              rgba(255,255,255,0.06) 62%,
              rgba(255,255,255,0) 100%
            );
            animation: wf_shimmer_sweep 4.6s ease-in-out infinite;
          }
          .wf-cta-shimmer > * {
            position: relative;
            z-index: 2;
          }
          @media (prefers-reduced-motion: reduce) {
            .wf-cta-shimmer::after {
              animation: none !important;
              opacity: 0 !important;
            }
          }
        `}</style>

        <div ref={heroRef} style={{ maxWidth: 900, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 2 }}>
          <div
            data-testid="hero-headline"
            className="hero-enter"
            style={{
              textAlign: "center",
              marginBottom: 36,
            }}
          >
            <h1
              style={{
                fontSize: "clamp(28px, 4.5vw, 44px)",
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                margin: 0,
                color: mkt.text,
                fontFamily: typography.fontFamily,
              }}
            >
              Trades businesses using WeFixTrades
            </h1>

            <h1
              style={{
                position: "relative",
                fontSize: "clamp(32px, 5.6vw, 56px)",
                fontWeight: 800,
                lineHeight: 1.02,
                letterSpacing: "-0.02em",
                margin: 0,
                marginTop: 6,
                fontFamily: typography.fontFamily,
                color: mkt.accent,
              }}
            >
              <span
                className="wf-underline mkt-gradient-text"
                style={{
                  position: "relative",
                  zIndex: 2,
                }}
              >
                get 3x more leads
              </span>

              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 1,
                  background:
                    "radial-gradient(closest-side, rgba(102,232,250,0.15), rgba(102,232,250,0.06) 42%, transparent 78%)",
                  filter: "blur(30px)",
                  opacity: 0.65,
                  pointerEvents: "none",
                }}
              />
            </h1>
          </div>

          <p
            data-testid="hero-subtext"
            className="hero-subtext hero-enter"
            style={{
              maxWidth: 640,
              margin: "0 auto",
              marginTop: 26,
              marginBottom: 32,
              fontSize: 16,
              lineHeight: 1.6,
              fontWeight: 450,
              color: mkt.textMuted,
              textAlign: "center",
              fontFamily: typography.fontFamily,
            }}
          >
            AI-powered tools that answer calls, collect reviews, post on social media, and fix your SEO — so you can focus on the job.
          </p>

          {/* Email capture form */}
          <HeroEmailCapture />

          {/* Stats strip */}
          <div className="hero-enter hero-stats-strip" style={{
            display: "flex", justifyContent: "center", gap: 32, flexWrap: "wrap",
            marginTop: 28, marginBottom: 64,
          }}>
            {[
              { value: "500+", label: "leads generated" },
              { value: "4.8★", label: "average review score" },
              { value: "24/7", label: "AI phone answering" },
            ].map((stat) => (
              <div key={stat.label} style={{ textAlign: "center", minWidth: 120 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: mkt.accent, fontFamily: typography.fontFamily, letterSpacing: "-0.02em" }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: mkt.textMuted, marginTop: 2 }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

        </div>

      </section>

      <div style={{ marginTop: "auto", paddingTop: 34 }}>
        <TrustMarquee />
      </div>
      </div>{/* end shared grid zone */}
      </div>{/* end hero shell backdrop */}
      <HeroTradeDivider />
      {/* Three product showcase types covering all 12 products: */}
      <CapabilitiesShowcase />        {/* 4 money-makers */}
      <StickyStackCards />            {/* 4 growth tools */}
      <ServiceStackTimeline />        {/* 4 done-for-you */}
      {/* Removed legacy sections (PillarAnimation, FeatureCards, ServiceCards,
          WorkflowDemo) — they duplicated the 3-type story above and broke the
          V7 visual cohesion as the user scrolled. AutomationDiagram remains as
          the interactive "How it works" deep-dive. */}
      {hasWebGL && <GlobeSection />}
      <SurfaceSection overlap className="py-4">
        <ReviewsSection />
      </SurfaceSection>
      <AutomationDiagram />
      <TrustSection />
      <CTASection />
      <ExitIntentPopup />
    </MarketingLayout>
  );
}
