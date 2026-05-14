/**
 * V7 page primitives — reusable building blocks that give any marketing page
 * the Effortel-style V7 look without rewriting page content.
 *
 * Drop-in pattern:
 *   <V7Hero
 *     eyebrow="Pain point in italics"
 *     headline={<>The headline.<br/><span className="muted">Soft second line.</span></>}
 *     sub="One-line how"
 *     ctas={[{ label: "Get Started", href: "/wizard" }]}
 *   />
 *   <V7Section>
 *     <V7Container>...your content...</V7Container>
 *   </V7Section>
 *   <V7Section variant="card">  // dotted-bg numbered-card style wrapper
 *     <V7Container>...</V7Container>
 *   </V7Section>
 */

import { type CSSProperties, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { Reveal, MONO, SANS } from "@/components/effortel-blocks";

/* ─── Shared CTA styles (same as EffortelProductPage) ─── */
const ctaPrimary: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10,
  padding: "14px 22px", borderRadius: 10,
  background: mkt.accent, color: mkt.dark,
  fontFamily: MONO, fontSize: 13, fontWeight: 600,
  letterSpacing: "0.08em", textTransform: "uppercase",
  textDecoration: "none", textAlign: "center",
  lineHeight: 1.2, maxWidth: "100%",
  whiteSpace: "normal", overflowWrap: "break-word",
};

const ctaGhost: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10,
  padding: "14px 22px", borderRadius: 10,
  background: "transparent", color: mkt.onDark,
  fontFamily: MONO, fontSize: 13, fontWeight: 600,
  letterSpacing: "0.08em", textTransform: "uppercase",
  textDecoration: "none", textAlign: "center",
  lineHeight: 1.2, maxWidth: "100%",
  whiteSpace: "normal", overflowWrap: "break-word",
  border: `1px solid ${mkt.onDarkBorder}`,
};

/* ════════════════════════════════════════════════════════════════
   V7Hero
   ════════════════════════════════════════════════════════════════ */
interface V7HeroProps {
  /** Mono uppercase tag above the eyebrow. Defaults to none. */
  productName?: string;
  /** Italic pain-point line above the headline. */
  eyebrow?: string;
  /** Big headline. Pass JSX to use line breaks + accent spans. */
  headline: ReactNode;
  /** Short single-line description below the headline. */
  sub?: string;
  /** Up to 2 CTAs. First is primary (cyan pill), second is ghost. */
  ctas?: { label: string; href: string }[];
  /** Optional centered visual below the CTAs (e.g. an animated demo). */
  visual?: ReactNode;
  /** Override hero background gradient. */
  glow?: boolean;
}

export function V7Hero({ productName, eyebrow, headline, sub, ctas = [], visual, glow = true }: V7HeroProps) {
  return (
    <section style={{ padding: "120px 24px 60px", position: "relative", overflow: "hidden", background: mkt.bg }}>
      {glow && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(13,60,252,0.08) 0%, transparent 60%)",
        }} />
      )}
      <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", textAlign: "center" }}>
        {productName && (
          <Reveal>
            <span style={{
              display: "inline-block", fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase",
              color: mkt.accent, marginBottom: 16,
            }}>
              {productName}
            </span>
          </Reveal>
        )}
        {eyebrow && (
          <Reveal delay={0.04}>
            <p style={{ fontSize: 14, color: mkt.onDarkFaint, fontStyle: "italic", marginBottom: 18, maxWidth: 640, margin: "0 auto 18px" }}>
              {eyebrow}
            </p>
          </Reveal>
        )}
        <Reveal delay={0.08}>
          <h1 style={{
            fontSize: "clamp(40px, 6.5vw, 80px)", fontWeight: 700, lineHeight: 1.0, letterSpacing: "-0.03em",
            color: mkt.onDark, marginBottom: 24, maxWidth: 920, margin: "0 auto 24px", fontFamily: SANS,
          }}>
            {headline}
          </h1>
        </Reveal>
        {sub && (
          <Reveal delay={0.12}>
            <p style={{ fontSize: 18, lineHeight: 1.5, color: mkt.onDarkMuted, maxWidth: 620, margin: "0 auto 36px", fontFamily: SANS }}>
              {sub}
            </p>
          </Reveal>
        )}
        {ctas.length > 0 && (
          <Reveal delay={0.16}>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              {ctas.map((c, i) => (
                <Link key={c.label} href={c.href} style={i === 0 ? ctaPrimary : ctaGhost}>
                  {c.label} {i === 0 && <ArrowRight size={16} />}
                </Link>
              ))}
            </div>
          </Reveal>
        )}
        {visual && (
          <Reveal delay={0.24}>
            <div style={{ marginTop: 56 }}>{visual}</div>
          </Reveal>
        )}
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   V7Section — styled section wrapper
   ════════════════════════════════════════════════════════════════ */
interface V7SectionProps {
  children: ReactNode;
  /** "default" = mkt.bg dark; "subtle" = slight lift; "card" = sectionLight with rounded corners. */
  variant?: "default" | "subtle" | "card";
  /** Vertical padding. Defaults to 80px. */
  padding?: number | string;
  /** Inline style override. */
  style?: CSSProperties;
  className?: string;
  id?: string;
}

export function V7Section({ children, variant = "default", padding = 80, style, className, id }: V7SectionProps) {
  const bg =
    variant === "subtle" ? "rgba(255,255,255,0.02)" :
    variant === "card" ? mkt.sectionLight :
    mkt.bg;
  return (
    <section
      id={id}
      className={className}
      style={{
        background: bg, color: mkt.onDark, fontFamily: SANS,
        padding: `${typeof padding === "number" ? `${padding}px` : padding} 24px`,
        /* PR 2: subtle-variant top/bottom borders use the warm-gray
         * hairline so V7 section transitions match the new system. */
        borderTop: variant === "subtle" ? `1px solid ${mkt.hairline}` : undefined,
        borderBottom: variant === "subtle" ? `1px solid ${mkt.hairline}` : undefined,
        ...style,
      }}
    >
      {children}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   V7Container — max-width content holder
   ════════════════════════════════════════════════════════════════ */
export function V7Container({ children, maxWidth = 1180, style }: { children: ReactNode; maxWidth?: number; style?: CSSProperties }) {
  return (
    <div style={{ maxWidth, margin: "0 auto", ...style }}>{children}</div>
  );
}

/* ════════════════════════════════════════════════════════════════
   V7SectionHeading — eyebrow + h2 + optional sub
   ════════════════════════════════════════════════════════════════ */
export function V7SectionHeading({
  eyebrow, title, sub, align = "center", style,
}: {
  eyebrow?: string;
  title: ReactNode;
  sub?: ReactNode;
  align?: "left" | "center";
  style?: CSSProperties;
}) {
  return (
    <Reveal>
      <div style={{ textAlign: align, marginBottom: 48, maxWidth: align === "center" ? 720 : undefined, margin: align === "center" ? "0 auto 48px" : "0 0 48px", ...style }}>
        {eyebrow && (
          <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: mkt.accent, marginBottom: 12 }}>
            {eyebrow}
          </p>
        )}
        <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.025em", color: mkt.onDark, marginBottom: sub ? 14 : 0, fontFamily: SANS }}>
          {title}
        </h2>
        {sub && (
          <p style={{ fontSize: 16, lineHeight: 1.55, color: mkt.onDarkMuted, fontFamily: SANS }}>
            {sub}
          </p>
        )}
      </div>
    </Reveal>
  );
}

/* ════════════════════════════════════════════════════════════════
   V7PageShell — wraps a whole page in dark mkt.bg + Satoshi
   Use for legal/docs pages where you just want the V7 wrapper
   without a hero.
   ════════════════════════════════════════════════════════════════ */
export function V7PageShell({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: mkt.bg, color: mkt.onDark, fontFamily: SANS, minHeight: "100vh", ...style }}>
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   V7FinalCta — the gradient closer used on every product page
   ════════════════════════════════════════════════════════════════ */
export function V7FinalCta({ title, sub = "Setup is fast. No card required. Cancel anytime.", primaryCta }: {
  title: ReactNode;
  sub?: string;
  primaryCta: { label: string; href: string };
}) {
  return (
    <section style={{ padding: "80px 24px 140px", background: mkt.bg }}>
      <div style={{
        maxWidth: 980, margin: "0 auto",
        background: mkt.sectionLight,
        borderRadius: 28, padding: "72px 32px",
        position: "relative", overflow: "hidden", textAlign: "center",
      }}>
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 50% 80% at 50% 50%, rgba(13,60,252,0.10) 0%, transparent 60%)",
        }} />
        <h2 style={{ position: "relative", fontSize: "clamp(32px, 4.5vw, 52px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.025em", color: mkt.onDark, marginBottom: 18, fontFamily: SANS }}>
          {title}
        </h2>
        <p style={{ position: "relative", fontSize: 16, lineHeight: 1.55, color: mkt.onDarkMuted, marginBottom: 32, fontFamily: SANS }}>
          {sub}
        </p>
        <Link href={primaryCta.href} style={{ ...ctaPrimary, position: "relative", fontSize: 14, padding: "16px 32px" }}>
          {primaryCta.label} <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}

export { ctaPrimary, ctaGhost };
