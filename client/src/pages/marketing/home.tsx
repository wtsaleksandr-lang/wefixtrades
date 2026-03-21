import { useEffect, useRef } from "react";
import { Link } from "wouter";
import gsap from "gsap";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import WorkflowDemo from "@/components/marketing/WorkflowDemo";
import { mkt, colors, shadows, typography } from "@/theme/tokens";
import HeroGridGlow from "@/components/marketing/HeroGridGlow";
import ReviewsSection from "@/components/home/ReviewsSection";
import HeroTradeDivider from "@/components/marketing/HeroTradeDivider";
import TrustMarquee from "@/components/marketing/TrustMarquee";
import CapabilitiesShowcase from "@/components/marketing/CapabilitiesShowcase";
import StickyStackCards from "@/components/marketing/StickyStackCards";
import FeatureCards from "@/components/marketing/FeatureCards";
import PillarAnimation from "@/components/sections/PillarAnimation";
import CTASection from "@/components/marketing/CTASection";
import TrustSection from "@/components/marketing/TrustSection";
import GlobeSection from "@/components/marketing/globe/GlobeSection";
import { SurfaceSection } from "@/components/marketing/SurfaceSection";
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
    .hero-section-responsive { padding: 96px 20px 40px !important; }
    .hero-subtext { font-size: 16px !important; }
  }
  @media (max-width: 640px) {
    .hero-section-responsive { padding: 88px 18px 32px !important; }
    .hero-subtext { margin-bottom: 32px !important; }
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
  /* Backdrop responsive side padding */
  .hero-shell-backdrop {
    padding-top: 0;
    padding-bottom: 0;
  }
  @media (max-width: 768px) {
    .hero-shell-backdrop {
      padding: 2px 2px 0 2px !important;
    }
    .hero-first-screen-zone {
      border-radius: 20px !important;
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

  useEffect(() => {
    document.title = "WeFixTrades — More Booked Jobs, Automatically";
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
      <div className="hero-shell-backdrop" style={{ background: "#F5F7F8", padding: "0 24px", position: "relative" as const, zIndex: 1 }}>
      {/* Shared grid zone — covers hero + trust marquee seamlessly */}
      <div className="hero-first-screen-zone" style={{ position: "relative", background: mkt.bg, overflow: "hidden", display: "flex", flexDirection: "column", maxWidth: 1400, margin: "0 auto", borderRadius: 24, border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 20px 60px rgba(0,0,0,0.25), 0 4px 20px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
        {/* Subtle inner lighting overlay */}
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(255,255,255,0.02), rgba(0,0,0,0.2))", pointerEvents: "none", zIndex: 0, borderRadius: 24 }} />
        <HeroGridGlow className="hero-grid-glow" />

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

        <div ref={heroRef} style={{ maxWidth: 720, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 2 }}>
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
                fontSize: "clamp(30px, 5vw, 50px)",
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
                On autopilot
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
              marginBottom: 52,
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

          <div className="hero-cta-row hero-enter" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 96 }}>
            {/* Bold solid arrow matching effortel's arrow shape */}
            {(() => {
              const BoldArrow = () => (
                <svg width="13" height="13" viewBox="0 0 31 31" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd" d="M18.9493 17.8324L3.43262 17.8324L3.43262 12.2443L18.9493 12.2443L11.2915 4.5865L15.2429 0.63509L26.4851 11.8772C28.2309 13.6231 28.2309 16.4536 26.4851 18.1995L15.1423 29.5425L11.1909 25.5911L18.9493 17.8324Z" />
                </svg>
              );
              return (
                <>
                  <Link href="/product" data-testid="button-services-hero" className="cta-arrow-btn" style={{ textDecoration: "none" }}>
                    <span className="cta-arrow-btn__text">Services</span>
                    <span className="cta-arrow-btn__square" />
                    <span className="cta-arrow-btn__arrow-out"><BoldArrow /></span>
                    <span className="cta-arrow-btn__arrow-in"><BoldArrow /></span>
                  </Link>
                  <Link href="/Wizard" data-testid="button-product-hero" className="cta-arrow-btn cta-arrow-btn--primary" style={{ textDecoration: "none" }}>
                    <span className="cta-arrow-btn__text">Product</span>
                    <span className="cta-arrow-btn__square" />
                    <span className="cta-arrow-btn__arrow-out"><BoldArrow /></span>
                    <span className="cta-arrow-btn__arrow-in"><BoldArrow /></span>
                  </Link>
                </>
              );
            })()}
          </div>

        </div>

      </section>

      <div style={{ marginTop: "auto", paddingTop: 34 }}>
        <TrustMarquee />
      </div>
      </div>{/* end shared grid zone */}
      </div>{/* end hero shell backdrop */}
      <HeroTradeDivider />
      <CapabilitiesShowcase />
      <StickyStackCards />
      <PillarAnimation />
      <FeatureCards />
      {/* <GlobeSection /> */}
      <SurfaceSection overlap className="py-8">
        <ReviewsSection />
      </SurfaceSection>

      <section data-testid="workflow-section" style={{ background: mkt.surfaceAlt, padding: "112px 28px", borderRadius: "28px 28px 0 0", marginTop: -28, position: "relative", zIndex: 4 }}>
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



      <TrustSection />
      <CTASection />
    </MarketingLayout>
  );
}
