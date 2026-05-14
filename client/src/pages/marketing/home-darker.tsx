/**
 * Home page — DARKER PREVIEW VARIANT (route /home-darker)
 *
 * Side-by-side comparison build. Same content + structure as /home, but
 * with these top-level overrides:
 *   - Accent: cyan → primary blue (#0d3cfc / #0b34d6 hover-dark)
 *   - Page/section backgrounds: teal-dark family → flat dark grays
 *     (#161616, #1C1C1C, #242424, #A39E99 warm contrast)
 *   - No glow effects on buttons (kept flat shadows only)
 *
 * Inner components (HeroProductPreview, CapabilitiesShowcase,
 * StickyStackCards, ServiceStackTimeline, AutomationDiagram, etc.) keep
 * their own imports of the global `mkt` token, so their card-level
 * colors are UNCHANGED — per the comparison brief.
 *
 * Implementation note: the `mkt` import is aliased to `baseMkt` and a
 * local `const mkt` shadows it with overrides. Everything downstream in
 * this file resolves `mkt.X` to the local override; the original tokens
 * file is untouched.
 */
import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { Link } from "wouter";
import gsap from "gsap";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
// WorkflowDemo removed in round 8 — covered by AutomationDiagram.
import { mkt as baseMkt, colors, shadows, typography } from "@/theme/tokens";

/* Local theme override for this preview. Inherits everything from
 * baseMkt then swaps the colors named in the comparison brief. */
const mkt = {
  ...baseMkt,
  // Accent family — blue replaces cyan
  accent: "#0d3cfc",
  accentHover: "#0d3cfc",
  accentDark: "#0b34d6",
  accentTint: "rgba(13,60,252,0.10)",
  accentGlow: "transparent",          // kills glow halos that used accentGlow
  // Dark backgrounds — flat grays
  darkBg: "#161616",                  // darkest, page background
  sectionLight: "#242424",            // medium gray section
  sectionLighter: "#1C1C1C",          // slightly above darkBg
  frost: "rgba(36,36,36,0.85)",       // translucent overlay matching #242424
  // Buttons — use new accent
  buttonBg: "#0d3cfc",
  buttonText: "#FFFFFF",
  buttonHoverBg: "#0b34d6",
  // mkt.cyan is referenced for some flow-card icons — fold it into the
  // new accent so the page palette stays consistent in the comparison.
  cyan: "#0d3cfc",
  cyanTint: "rgba(13,60,252,0.10)",
  // Reserved for sections that want a warm contrast block — not auto-applied
  // anywhere; available if a section explicitly opts in via `mkt.warmContrast`.
  warmContrast: "#A39E99",
} as const;
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
        onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(13,60,252,0.4)"; }}
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
  .hero-cta-primary {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 14px 22px; border-radius: 12px;
    background: ${mkt.accent}; color: #FFFFFF;
    font-size: 14px; font-weight: 700; letter-spacing: 0.01em;
    text-decoration: none; border: none; cursor: pointer;
    transition: transform 0.15s ease, background 0.2s ease;
    /* DARKER PREVIEW: no glow halo — flat hover state only */
  }
  .hero-cta-primary:hover { transform: translateY(-1px); background: ${mkt.accentDark}; }
  .hero-cta-secondary {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 14px 22px; border-radius: 12px;
    background: rgba(255,255,255,0.06);
    color: ${mkt.text}; border: 1px solid rgba(255,255,255,0.12);
    font-size: 14px; font-weight: 600;
    text-decoration: none; cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease;
  }
  .hero-cta-secondary:hover { background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.22); }
  .hero-cta-note { font-size: 12px; color: ${mkt.textMuted}; }
  @media (max-width: 820px) {
    .flow-map-desktop { display: none !important; } /* already hidden inline */
    .flow-map-mobile { display: none !important; }
  }
  /* DARKER PREVIEW: flowPulse glow neutralized — no glowing buttons rule */
  @keyframes flowPulse {
    0%, 100% { box-shadow: none; }
    50% { box-shadow: none; }
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

export default function HomePageDarker() {
  useScrollReveal();
  const heroRef = useRef<HTMLDivElement>(null);
  const [hasWebGL] = useState<boolean>(() => {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl"));
  });

  useEffect(() => {
    document.title = "WeFixTrades [DARKER PREVIEW] — variant for color comparison";
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
            background: `radial-gradient(ellipse at center, rgba(13,60,252,0.08) 0%, rgba(13,60,252,0.03) 40%, transparent 70%)`,
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
                style={{ marginBottom: 24 }}
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
                  You're on the job.
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
                  marginTop: 18,
                  marginBottom: 28,
                  fontSize: 16,
                  lineHeight: 1.6,
                  fontWeight: 450,
                  color: mkt.textMuted,
                  fontFamily: typography.fontFamily,
                }}
              >
                AI answers calls 24/7, sends quotes in seconds, requests reviews, and fixes your Google ranking. Built for trades. Working while you work.
              </p>

              <div className="hero-enter hero-cta-row">
                <Link href="/Wizard" className="hero-cta-primary wf-cta-shimmer" data-testid="hero-cta-primary">
                  <span>Start free — no card</span>
                  <ArrowRight size={16} strokeWidth={2.5} />
                </Link>
                <Link href="/demo" className="hero-cta-secondary" data-testid="hero-cta-secondary">
                  <span>See 2-min demo</span>
                </Link>
              </div>
              <div className="hero-enter" style={{ marginTop: 12 }}>
                <span className="hero-cta-note">
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

      <div style={{ marginTop: "auto", paddingTop: 34 }}>
        <IntegrationsTrustStrip />
      </div>
      </div>{/* end shared grid zone */}
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
            <Star size={11} strokeWidth={2.5} /> Free for trade businesses
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
