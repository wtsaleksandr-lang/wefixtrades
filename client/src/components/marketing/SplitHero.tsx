/**
 * SplitHero — Wave 13 shared hero (BrightLocal / Rekord pattern).
 *
 * Used on:
 *  - All 12 product pages (slug-keyed hero animation on the right)
 *  - All solutions/per-trade pages (trade-keyed hero animation on the right)
 *
 * Layout:
 *  - Desktop: 55% / 45% split, left text + right animation
 *  - Mobile: stacks vertically, animation goes BELOW text
 *
 * Polish (Alex 2026-05-26):
 *  - Top-left chip in WHITE (smaller text, uppercase, mono)
 *  - LIFTED title (reduced top padding from 88px → 64px)
 *  - Subtitle kept (1 line ideal)
 *  - 2px gaps inside CTA cluster
 *  - Animation respects prefers-reduced-motion (each animation owns its fallback)
 *  - DESIGN-SYSTEM compliant: semantic tokens only, no raw hex, no hover-shift
 */

import { type CSSProperties, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { Reveal, MONO, SANS } from "@/components/effortel-blocks";

export type SplitHeroProps = {
  /** Small uppercase mono chip in the top-left corner (e.g. "MAPGUARD" or "FOR PLUMBERS"). */
  chip: string;
  /** Hero title (~48-56px). React node so callers can include accent spans / line breaks. */
  title: ReactNode;
  /** Single-line subtitle directly below the title. */
  subtitle: string;
  /** Primary CTA — required. */
  ctaPrimary: { label: string; href: string };
  /** Secondary CTA — optional. */
  ctaSecondary?: { label: string; href: string };
  /** Right-side animated visual. The component owns its own height + reduced-motion fallback. */
  animation: ReactNode;
  /** Background variant. Defaults to "dark". */
  variant?: "dark" | "light";
};

export default function SplitHero({
  chip,
  title,
  subtitle,
  ctaPrimary,
  ctaSecondary,
  animation,
  variant = "dark",
}: SplitHeroProps) {
  const isLight = variant === "light";
  const bgGradient = isLight
    ? "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(13,60,252,0.04) 0%, transparent 60%)"
    : "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(13,60,252,0.10) 0%, transparent 60%)";
  const titleColor = isLight ? "#111827" : mkt.onDark;
  const subColor = isLight ? "#6B7280" : mkt.onDarkMuted;

  return (
    <section
      data-testid="split-hero"
      style={{
        padding: "64px 24px 96px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: bgGradient,
        }}
      />
      <div
        className="split-hero-grid"
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          position: "relative",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.22fr) minmax(0, 1fr)",
          gap: 48,
          alignItems: "center",
        }}
      >
        {/* LEFT — chip + title + subtitle + CTAs */}
        <div className="split-hero-text" style={{ minWidth: 0 }}>
          <Reveal>
            <span
              data-testid="split-hero-chip"
              style={{
                display: "inline-block",
                fontFamily: MONO,
                fontSize: 12,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                /* WHITE chip per Alex 2026-05-26 — out of the way of the title. */
                color: mkt.onDark,
                marginBottom: 18,
                opacity: 0.92,
              }}
            >
              {chip}
            </span>
          </Reveal>
          <Reveal delay={0.06}>
            <h1
              data-testid="split-hero-title"
              style={{
                fontSize: "clamp(36px, 5.2vw, 56px)",
                fontWeight: 700,
                lineHeight: 1.04,
                letterSpacing: "-0.03em",
                color: titleColor,
                margin: 0,
                marginBottom: 18,
                maxWidth: 560,
                fontFamily: SANS,
              }}
            >
              {title}
            </h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p
              data-testid="split-hero-subtitle"
              style={{
                fontSize: 17,
                lineHeight: 1.5,
                color: subColor,
                maxWidth: 520,
                margin: 0,
                marginBottom: 28,
              }}
            >
              {subtitle}
            </p>
          </Reveal>
          <Reveal delay={0.18}>
            {/* CTA cluster — 2px gap between buttons per global UI rule. */}
            <div
              data-testid="split-hero-cta-cluster"
              style={{
                display: "flex",
                gap: 2,
                flexWrap: "wrap",
                alignItems: "stretch",
              }}
            >
              <CtaLink href={ctaPrimary.href} className="wft-hover-border-white" style={ctaPrimaryStyle}>
                {ctaPrimary.label} <ArrowRight size={16} />
              </CtaLink>
              {ctaSecondary && (
                <CtaLink href={ctaSecondary.href} className="wft-hover-border-white" style={ctaGhostStyle}>
                  {ctaSecondary.label}
                </CtaLink>
              )}
            </div>
          </Reveal>
        </div>

        {/* RIGHT — animated visual. Self-contained: each animation handles
            its own height, reduced-motion fallback, and theme. */}
        <div
          className="split-hero-anim"
          data-testid="split-hero-animation"
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minWidth: 0,
            maxHeight: 500,
          }}
        >
          {animation}
        </div>
      </div>

      <style>{`
        @media (max-width: 960px) {
          .split-hero-grid {
            grid-template-columns: 1fr !important;
            gap: 32px !important;
          }
          .split-hero-text { order: 1; }
          .split-hero-anim { order: 2; max-height: none !important; }
          .split-hero-text h1,
          .split-hero-text p { max-width: 100% !important; }
        }
      `}</style>
    </section>
  );
}

/* ─── CtaLink — wouter Link for paths, plain <a> for #hash anchors.
   Mirrors the helper in EffortelProductPage so hash-only hrefs scroll
   natively instead of being treated as a route. */
function CtaLink({
  href,
  children,
  className,
  style,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  if (href.startsWith("#")) {
    return (
      <a href={href} className={className} style={style}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} style={style}>
      {children}
    </Link>
  );
}

/* ─── CTA styles — match EffortelProductPage's ctaPrimary / ctaGhost so
   the buttons feel native to the rest of the marketing surface. */
const ctaPrimaryStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  padding: "14px 22px",
  borderRadius: 10,
  background: mkt.accent,
  color: mkt.onDark,
  fontFamily: MONO,
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  textDecoration: "none",
  textAlign: "center",
  lineHeight: 1.2,
  maxWidth: "100%",
  whiteSpace: "normal",
  overflowWrap: "break-word",
};

const ctaGhostStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  padding: "14px 22px",
  borderRadius: 10,
  background: "transparent",
  color: mkt.onDark,
  fontFamily: MONO,
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  textDecoration: "none",
  border: `1px solid ${mkt.onDarkBorder}`,
  textAlign: "center",
  lineHeight: 1.2,
  maxWidth: "100%",
  whiteSpace: "normal",
  overflowWrap: "break-word",
};
