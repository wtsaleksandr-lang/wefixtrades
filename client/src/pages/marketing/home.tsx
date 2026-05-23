import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { Link } from "wouter";
import gsap from "gsap";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
// WorkflowDemo removed in round 8 — covered by AutomationDiagram.
import { mkt, colors, shadows, typography } from "@/theme/tokens";
import HeroGridGlow from "@/components/marketing/HeroGridGlow";
import IntegrationsTrustStrip from "@/components/marketing/IntegrationsTrustStrip";
import HeroProductPreview from "@/components/marketing/HeroProductPreview";
/* Removed: TrustMarquee (used fabricated customer logos — dishonest trust
 * signal that would fail any "google these companies" sniff test) and the
 * triple-row animated HeroTradeDivider (visual noise; the "Built for"
 * cycling badge already names the trade). */
import { SurfaceSection } from "@/components/marketing/SurfaceSection";
import BuiltForRotator from "@/components/marketing/BuiltForRotator";
import TrustSection from "@/components/marketing/TrustSection";
import CTASection from "@/components/marketing/CTASection";
import {
  Zap, Check,
  ArrowRight, Star,
  Phone, ThumbsUp, Mail, Target,
  MapPin, Briefcase, Award, Hammer,
  Calculator, PhoneCall, RefreshCw, Wrench,
} from "lucide-react";

/* ─── Below-the-fold heavy components — lazy-loaded ───
 *
 * These render below the hero and add ~hundreds of KB to the JS bundle.
 * React.lazy + Suspense defers their parse/eval until the chunk arrives.
 * Suspense fallbacks reserve approximate heights to minimise CLS during
 * the late-load. GlobeSection is doubly conditional (hasWebGL) — lazy
 * also keeps the Three.js bundle entirely out of non-WebGL devices.
 */
const CapabilitiesShowcase = lazy(() => import("@/components/marketing/CapabilitiesShowcase"));
const StickyStackCards = lazy(() => import("@/components/marketing/StickyStackCards"));
const ServiceStackTimeline = lazy(() => import("@/components/marketing/ServiceStackTimeline"));
const GlobeSection = lazy(() => import("@/components/marketing/globe/GlobeSection"));
const ReviewsSection = lazy(() => import("@/components/home/ReviewsSection"));
const AutomationDiagram = lazy(() => import("@/components/marketing/AutomationDiagram"));

/* Fallback boxes — reserve typical rendered heights so the page doesn't
 * jump when the lazy chunk arrives. Tuned for desktop; mobile heights are
 * smaller but the CLS impact is the same proportion. */
const lazyFallback = (minHeight: number) => (
  <div aria-hidden="true" style={{ minHeight, background: "transparent" }} />
);



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
    <div data-theme="light" data-testid="flow-map-hero" style={{ position: "relative", maxWidth: 1000, margin: "0 auto" }}>
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
        onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(13,60,252,0.4)"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = status === "error" ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.12)"; }}
      />
      <button
        type="submit"
        disabled={status === "loading"}
        style={{
          padding: "12px 24px", borderRadius: 10, border: "none",
          background: mkt.ctaBg, color: mkt.ctaText, fontSize: 14, fontWeight: 500,
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
  /* Direction C: 2-column hero — copy left, animated product preview right.
   * Collapses to single centered column below 960px so the preview stacks
   * underneath the copy on tablets and phones. */
  .hero-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 48px;
    align-items: center;
    text-align: left;
  }
  .hero-copy-col { text-align: left; }
  .hero-preview-col { display: flex; justify-content: flex-end; }
  @media (max-width: 960px) {
    .hero-grid { grid-template-columns: 1fr; gap: 36px; text-align: center; }
    .hero-copy-col { text-align: center; }
    .hero-preview-col { justify-content: center; }
    .hero-cta-row { justify-content: center; }
  }
  .hero-cta-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  /* Mobile (≤640px): keep the two hero CTAs on one row instead of stacking.
   * flex-wrap: nowrap + flex: 1 1 0 + min-width: 0 lets both buttons share
   * the row width without overflow on 360–414px viewports. Padding is
   * tightened to keep the ≥44px tap target while shrinking horizontally. */
  @media (max-width: 640px) {
    .hero-cta-row {
      flex-wrap: nowrap !important;
      gap: 10px !important;
      width: 100%;
      max-width: 100%;
    }
    .hero-cta-row > .hero-cta-primary,
    .hero-cta-row > .hero-cta-secondary {
      flex: 1 1 0;
      min-width: 0;
      padding: 13px 14px;
      justify-content: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 13px;
    }
    .hero-cta-row > .hero-cta-primary > span,
    .hero-cta-row > .hero-cta-secondary > span {
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
  }
  /* DOSS pattern: cream off-white primary CTA, no blue glow.
   * Hover is a subtle color deepening (no halo, no transform stack).
   * font-weight 500 matches DOSS's "confident not shouty" tone. */
  .hero-cta-primary {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 14px 22px; border-radius: 10px;
    background: ${mkt.ctaBg}; color: ${mkt.ctaText};
    font-size: 14px; font-weight: 500; letter-spacing: 0.01em;
    text-decoration: none; border: none; cursor: pointer;
    transition: background 0.2s ease, transform 0.15s ease;
  }
  .hero-cta-primary:hover { background: ${mkt.ctaBgHover}; transform: translateY(-1px); }
  .hero-cta-primary:active { transform: translateY(1px); }
  .hero-cta-primary:focus-visible { outline: 2px solid ${mkt.focusRing}; outline-offset: 2px; }
  .hero-cta-secondary {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 14px 22px; border-radius: 10px;
    background: transparent;
    color: ${mkt.ctaSecondaryText}; border: 1px solid ${mkt.ctaSecondaryBorder};
    font-size: 14px; font-weight: 500;
    text-decoration: none; cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease;
  }
  .hero-cta-secondary:hover { background: ${mkt.ctaSecondaryBgHover}; border-color: ${mkt.ctaSecondaryBorderHover}; }
  .hero-cta-secondary:focus-visible { outline: 2px solid ${mkt.focusRing}; outline-offset: 2px; }
  .hero-cta-note { font-size: 12px; color: ${mkt.textMuted}; }

  /* ─── W-HERO warm-canvas variants (Alex variant 04) ───
   * Scoped to the homepage hero only. Primary is the deep brand blue on
   * cream with a subtle inset highlight + drop shadow. Secondary is a
   * ghost outline that fills to slate-100 on hover. */
  .hero-cta-primary-warm {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 14px 22px; border-radius: 10px;
    background: ${mkt.accent}; color: #FFFFFF;
    font-size: 14px; font-weight: 600; letter-spacing: 0.01em;
    text-decoration: none; cursor: pointer;
    border: 0.5px solid rgba(15,23,42,0.06);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.18),
      0 4px 14px rgba(13,60,252,0.28),
      0 1px 2px rgba(15,23,42,0.06);
    transition: background 0.18s ease, transform 0.15s ease, box-shadow 0.18s ease;
  }
  .hero-cta-primary-warm:hover {
    background: ${mkt.accentHover};
    transform: translateY(-1px);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.22),
      0 6px 20px rgba(13,60,252,0.34),
      0 2px 4px rgba(15,23,42,0.08);
  }
  .hero-cta-primary-warm:active { transform: translateY(0); }
  .hero-cta-primary-warm:focus-visible { outline: 2px solid ${mkt.accent}; outline-offset: 3px; }
  .hero-cta-secondary-warm {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 14px 22px; border-radius: 10px;
    background: transparent;
    color: #334155;
    border: 1.5px solid ${mkt.warmHairlineStrong};
    font-size: 14px; font-weight: 600;
    text-decoration: none; cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  }
  .hero-cta-secondary-warm:hover {
    background: rgba(15,23,42,0.04);
    border-color: rgba(15,23,42,0.32);
    color: ${mkt.onWarm};
  }
  .hero-cta-secondary-warm:focus-visible { outline: 2px solid ${mkt.accent}; outline-offset: 3px; }
  .hero-cta-note-warm { font-size: 12px; color: ${mkt.onWarmFaint}; }
  /* Warm-variant CTA row keeps the same mobile collapse rules. */
  .hero-cta-row > .hero-cta-primary-warm,
  .hero-cta-row > .hero-cta-secondary-warm { box-sizing: border-box; }
  @media (max-width: 640px) {
    .hero-cta-row > .hero-cta-primary-warm,
    .hero-cta-row > .hero-cta-secondary-warm {
      flex: 1 1 0;
      min-width: 0;
      padding: 13px 14px;
      justify-content: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 13px;
    }
  }
  /* Warm hero subtle canvas-noise overlay — drawn over the cream base.
   * Uses a tiny inline SVG to avoid an extra asset round-trip. */
  .hero-warm-noise {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.55;
    mix-blend-mode: multiply;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.35  0 0 0 0 0.32  0 0 0 0 0.26  0 0 0 0.18 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
    background-size: 160px 160px;
    z-index: 0;
  }
  /* Top + bottom hairlines that "frame" the warm hero section. */
  .hero-warm-hairline {
    position: absolute;
    left: 8%; right: 8%;
    height: 1px;
    background: linear-gradient(90deg, transparent, ${mkt.warmHairlineStrong} 18%, ${mkt.warmHairlineStrong} 82%, transparent);
    opacity: 0.55;
    pointer-events: none;
    z-index: 1;
  }
  /* Bottom transition: 80px gradient strip fading cream → dark slate
   * so the hand-off to the IntegrationsTrustStrip on dark is buttery,
   * not a hard color edge. */
  .hero-warm-fade {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    height: 96px;
    background: linear-gradient(to bottom, rgba(243,237,223,0) 0%, rgba(40,46,49,0.18) 55%, ${mkt.darkBg} 100%);
    pointer-events: none;
    z-index: 2;
  }
  /* Scoped headline polish for warm hero — micro text-shadow for that
   * "premium printed page" feel without smudging the type. */
  .hero-warm-headline {
    text-shadow: 0 1px 2px rgba(15,23,42,0.04);
  }
  @media (max-width: 820px) {
    .flow-map-desktop { display: none !important; } /* already hidden inline */
    .flow-map-mobile { display: none !important; }
  }
  @keyframes flowPulse {
    0%, 100% { box-shadow: 0 8px 32px ${mkt.accentGlow}; }
    50% { box-shadow: 0 8px 40px rgba(13,60,252,0.35); }
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

      {/* Outer page background behind hero shell — kept dark slate so the
       * cream hero reads as a "warm canvas island" framed by the rest of
       * the site palette (Alex variant 04 / W-HERO). */}
      <div className="hero-shell-backdrop" style={{ background: mkt.darkBg, padding: "6px 6px 0", position: "relative" as const, zIndex: 1 }}>
      {/* Warm-canvas hero zone — cream base + low-opacity canvas noise.
       * IntegrationsTrustStrip lives OUTSIDE this zone (on dark) so the
       * cream doesn't have to deal with white-text integration logos. */}
      <div className="hero-first-screen-zone" style={{ position: "relative", background: mkt.warmCanvas, overflow: "hidden", display: "flex", flexDirection: "column", width: "100%", borderRadius: 24, border: `1px solid ${mkt.warmHairline}`, boxShadow: "0 20px 60px rgba(15,23,42,0.18), 0 4px 20px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.45)" }}>
        {/* Canvas noise — subtle texture so it doesn't read as flat beige. */}
        <div aria-hidden="true" className="hero-warm-noise" />
        {/* Top hairline — slate-blue, "framed printed page" feel. */}
        <div aria-hidden="true" className="hero-warm-hairline" style={{ top: 18 }} />
        <HeroGridGlow className="hero-grid-glow" />

        {/* Built-for rotator — top-left, below navbar (onWarm variant) */}
        <div style={{ position: "absolute", top: 56, left: 28, zIndex: 3 }}>
          <BuiltForRotator variant="onWarm" />
        </div>

      <section
        data-testid="hero-section"
        className="hero-section-responsive"
        style={{
          background: "transparent",
          padding: "132px 28px 96px",
          marginTop: -8,
          position: "relative",
        }}
      >

        {/* Warm cream centre wash — a barely-visible lighter ellipse behind
         * the copy. Same role as the previous dark `hero-safe-zone` but
         * tonally inverted so the headline gets a soft halo, not a smudge. */}
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
            background: `radial-gradient(ellipse at center, rgba(255,253,247,0.85) 0%, rgba(255,253,247,0.55) 28%, rgba(255,253,247,0.22) 55%, transparent 80%)`,
            pointerEvents: "none",
            zIndex: 1,
          }}
        />

        {/* Soft brand-blue ambient glow — keeps the accent connection
         * to the rest of the brand without being garish on cream. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "32%", left: "50%", transform: "translate(-50%, -50%)",
            width: 800, height: 500,
            background: `radial-gradient(ellipse at center, rgba(13,60,252,0.06) 0%, rgba(13,60,252,0.025) 40%, transparent 70%)`,
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
            background: rgba(13,60,252, 0.22);
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
              rgba(13,60,252,0) 0%,
              rgba(13,60,252,0.85) 45%,
              rgba(13,60,252,0) 100%
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

        <div ref={heroRef} style={{ maxWidth: 1200, margin: "0 auto", position: "relative", zIndex: 2 }}>
          <div className="hero-grid">
            {/* Left column — copy + CTAs */}
            <div className="hero-copy-col">
              <div
                data-testid="hero-headline"
                className="hero-enter"
                style={{ marginBottom: 16 }}
              >
                <h1
                  className="hero-warm-headline"
                  style={{
                    fontSize: "clamp(28px, 4.5vw, 44px)",
                    fontWeight: 700,
                    lineHeight: 1.1,
                    letterSpacing: "-0.02em",
                    margin: 0,
                    color: mkt.onWarm,
                    fontFamily: typography.fontFamily,
                  }}
                >
                  You're on the job.
                </h1>

                <h1
                  className="hero-warm-headline"
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
                    style={{ position: "relative", zIndex: 2 }}
                  >
                    WeFixTrades runs your office.
                  </span>

                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      zIndex: 1,
                      background:
                        "radial-gradient(closest-side, rgba(13,60,252,0.15), rgba(13,60,252,0.06) 42%, transparent 78%)",
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
                  maxWidth: 520,
                  marginTop: 12,
                  marginBottom: 20,
                  fontSize: 16,
                  lineHeight: 1.6,
                  fontWeight: 450,
                  color: mkt.onWarmMuted,
                  fontFamily: typography.fontFamily,
                }}
              >
                AI answers calls 24/7, sends quotes in seconds, requests reviews, and fixes your Google ranking. Built for trades. Working while you work.
              </p>

              <div className="hero-enter hero-cta-row">
                <Link href="/Wizard" className="hero-cta-primary-warm wf-cta-shimmer" data-testid="hero-cta-primary">
                  {/* Wave L H1 — shortened from "Start free — no card" so it
                   * doesn't truncate on 390px mobile. The "no card required"
                   * note is still present below as `hero-cta-note`. */}
                  <span>Start free</span>
                  <ArrowRight size={16} strokeWidth={2.5} />
                </Link>
                <Link href="/demo" className="hero-cta-secondary-warm" data-testid="hero-cta-secondary">
                  <span>Watch demo</span>
                </Link>
              </div>
              <div className="hero-enter" style={{ marginTop: 12 }}>
                <span className="hero-cta-note-warm">
                  Free 14-day trial · Cancel anytime · Setup in under 10 minutes
                </span>
              </div>
            </div>

            {/* Right column — animated product preview */}
            <div className="hero-preview-col hero-enter">
              <HeroProductPreview />
            </div>
          </div>
        </div>

      </section>

      {/* Bottom hairline — mirrors the top hairline so the cream hero
       * reads as a deliberate "framed" island, not a half-finished band. */}
      <div aria-hidden="true" className="hero-warm-hairline" style={{ bottom: 100 }} />
      {/* Cream → dark slate gradient fade. Lives INSIDE the cream zone
       * so the transition happens before the hero's rounded bottom edge
       * meets the outer dark backdrop. */}
      <div aria-hidden="true" className="hero-warm-fade" />
      </div>{/* end warm-canvas hero zone */}

      {/* Integrations trust strip — pulled OUT of the cream zone and sat
       * on the existing dark backdrop so its white-on-dark logos work as
       * designed. The cream fade above flows smoothly into this strip. */}
      <div style={{ paddingTop: 28, paddingBottom: 4 }}>
        <IntegrationsTrustStrip />
      </div>
      </div>{/* end hero shell backdrop */}
      {/* HeroTradeDivider removed in the C-direction premium rewrite —
       * the cycling "Built for: <trade>" badge above the headline already
       * names the trade. */}

      {/* Free-audit lead magnet — demoted out of the hero so the primary
       * CTAs (Start free / See demo) own the first fold. Kept as a quiet
       * secondary capture for visitors who aren't ready to sign up but
       * will trade an email for a Google audit. */}
      <section
        data-testid="hero-audit-section"
        style={{
          background: mkt.darkBg,
          padding: "56px 24px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <div
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 999,
              background: "rgba(13,60,252,0.08)",
              border: "1px solid rgba(13,60,252,0.18)",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: mkt.accent,
              fontFamily: "'DM Mono', monospace",
              marginBottom: 16,
            }}
          >
            <Star size={12} strokeWidth={2.5} /> Free for trade businesses
          </div>
          <h2
            style={{
              fontSize: "clamp(22px, 3vw, 30px)",
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.015em",
              margin: 0,
              marginBottom: 10,
              color: mkt.text,
              fontFamily: typography.fontFamily,
            }}
          >
            Not ready to sign up? Get a free website &amp; Google audit instead.
          </h2>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.5,
              color: mkt.textMuted,
              maxWidth: 560,
              margin: "0 auto 22px",
              fontFamily: typography.fontFamily,
            }}
          >
            We'll send a one-page report: what's costing you leads, where your Google ranking is leaking, and the 3 fastest fixes. No call required.
          </p>
          <HeroEmailCapture />
        </div>
      </section>

      {/* Three product showcase types covering all 12 products — each lazy-
          loaded to keep the initial home.tsx bundle small. Suspense fallback
          heights reserve approximate rendered space to minimise CLS. */}
      <Suspense fallback={lazyFallback(720)}>
        <CapabilitiesShowcase />        {/* 4 money-makers */}
      </Suspense>
      <Suspense fallback={lazyFallback(640)}>
        <StickyStackCards />            {/* 4 growth tools */}
      </Suspense>
      <Suspense fallback={lazyFallback(640)}>
        <ServiceStackTimeline />        {/* 4 done-for-you */}
      </Suspense>
      {/* Removed legacy sections (PillarAnimation, FeatureCards, ServiceCards,
          WorkflowDemo) — they duplicated the 3-type story above and broke the
          V7 visual cohesion as the user scrolled. AutomationDiagram remains as
          the interactive "How it works" deep-dive. */}
      {hasWebGL && (
        <Suspense fallback={lazyFallback(560)}>
          <GlobeSection />
        </Suspense>
      )}
      <SurfaceSection overlap className="py-4">
        <Suspense fallback={lazyFallback(480)}>
          <ReviewsSection />
        </Suspense>
      </SurfaceSection>
      <Suspense fallback={lazyFallback(560)}>
        <AutomationDiagram />
      </Suspense>
      <TrustSection />
      <CTASection />
      <ExitIntentPopup />
    </MarketingLayout>
  );
}
