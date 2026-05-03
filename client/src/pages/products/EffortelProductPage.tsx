/**
 * EffortelProductPage — the V7 template, generalized.
 *
 * Reads cfg from products.ts + per-product mockup config from product-mockups.tsx
 * Renders the Effortel-style numbered-card layout for any product slug.
 */

import { Link } from "wouter";
import { ArrowRight, Phone, MessageSquare, Calendar, Star, Clock, Sparkles } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import { getProductBySlug } from "@/config/products";
import {
  NumberedCard,
  BadgePill,
  Reveal,
  MONO, SANS,
} from "@/components/effortel-blocks";
import { PRODUCT_MOCKUPS, type ProductMockupSection } from "@/config/product-mockups";
import NotFound from "@/pages/not-found";

export default function EffortelProductPage({ slug }: { slug: string }) {
  const cfg = getProductBySlug(slug);
  if (!cfg) return <NotFound />;

  const sections: ProductMockupSection[] = PRODUCT_MOCKUPS[slug] ?? PRODUCT_MOCKUPS.__default;

  return (
    <MarketingLayout>
      <div style={{ background: mkt.bg, color: mkt.onDark, fontFamily: SANS }}>

        {/* HERO */}
        <section style={{ padding: "120px 24px 80px", position: "relative", overflow: "hidden" }}>
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(102,232,250,0.08) 0%, transparent 60%)",
          }} />
          <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", textAlign: "center" }}>
            <Reveal>
              <span style={{
                display: "inline-block",
                fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase",
                color: mkt.accent, marginBottom: 32,
              }}>
                {cfg.name}
              </span>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 style={{
                fontSize: "clamp(48px, 7vw, 88px)", fontWeight: 700, lineHeight: 0.98,
                letterSpacing: "-0.03em", color: mkt.onDark, marginBottom: 28,
                maxWidth: 920, margin: "0 auto 28px",
              }}>
                {cfg.shortTagline.includes(".")
                  ? splitHeadline(cfg.shortTagline)
                  : cfg.shortTagline}
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p style={{
                fontSize: 18, lineHeight: 1.55, color: mkt.onDarkMuted,
                maxWidth: 580, margin: "0 auto 48px",
              }}>
                {cfg.seoDescription}
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <Link href={cfg.primaryCTA.href} style={ctaPrimary}>
                  {cfg.primaryCTA.label} <ArrowRight size={16} />
                </Link>
                {cfg.secondaryCTA && (
                  <Link href={cfg.secondaryCTA.href} style={ctaGhost}>
                    {cfg.secondaryCTA.label}
                  </Link>
                )}
              </div>
            </Reveal>
          </div>
        </section>

        {/* NUMBERED CARDS */}
        <section style={{ padding: "60px 24px 80px" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
            {sections.map((s, i) => (
              <Reveal key={s.number} delay={i * 0.05}>
                <NumberedCard
                  number={s.number}
                  title={s.title}
                  description={s.description}
                  cta={s.cta}
                >
                  {s.mockup}
                </NumberedCard>
              </Reveal>
            ))}
          </div>
        </section>

        {/* CATEGORY PILLS */}
        <section style={{ padding: "40px 24px 80px" }}>
          <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {(cfg.outcomes ?? []).slice(0, 4).map((o, i) => {
              const icons = [Phone, Sparkles, Clock, Star, Calendar, MessageSquare];
              const colors = ["cyan", "lavender", "mint", "pink"] as const;
              const Icon = icons[i % icons.length];
              return (
                <BadgePill
                  key={o.title}
                  label={o.title}
                  icon={<Icon size={18} />}
                  iconBg={colors[i % colors.length]}
                />
              );
            })}
          </div>
        </section>

        {/* FINAL CTA */}
        <section style={{ padding: "60px 24px 140px" }}>
          <div style={{
            maxWidth: 980, margin: "0 auto",
            background: mkt.sectionLight,
            borderRadius: 28, padding: "80px 32px",
            position: "relative", overflow: "hidden",
            textAlign: "center",
          }}>
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: "radial-gradient(ellipse 50% 80% at 50% 50%, rgba(102,232,250,0.10) 0%, transparent 60%)",
            }} />
            <h2 style={{
              position: "relative",
              fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 700, lineHeight: 1.05,
              letterSpacing: "-0.02em", color: mkt.onDark, marginBottom: 20,
            }}>
              Ready to start with<br />
              <span style={{ color: mkt.accent }}>{cfg.name}?</span>
            </h2>
            <p style={{
              position: "relative",
              fontSize: 17, lineHeight: 1.55, color: mkt.onDarkMuted, marginBottom: 40,
            }}>
              Setup is fast. No card required. Cancel anytime.
            </p>
            <Link href={cfg.primaryCTA.href} style={{
              ...ctaPrimary, position: "relative", fontSize: 14, padding: "16px 32px",
            }}>
              {cfg.primaryCTA.label} <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}

const ctaPrimary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 12,
  padding: "16px 28px", borderRadius: 10,
  background: mkt.accent, color: mkt.dark,
  fontFamily: MONO, fontSize: 14, fontWeight: 500,
  letterSpacing: "0.12em", textTransform: "uppercase",
  textDecoration: "none",
};

const ctaGhost: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 12,
  padding: "16px 28px", borderRadius: 10,
  background: "transparent", color: mkt.onDark,
  fontFamily: MONO, fontSize: 14, fontWeight: 500,
  letterSpacing: "0.12em", textTransform: "uppercase",
  textDecoration: "none",
  border: `1px solid ${mkt.onDarkBorder}`,
};

/** Splits "Foo. Bar." into "Foo." + muted "Bar." */
function splitHeadline(s: string): React.ReactNode {
  const parts = s.split(/\.\s+/);
  if (parts.length < 2) return s;
  const first = parts[0] + ".";
  const rest = parts.slice(1).join(". ");
  return (
    <>
      {first}<br />
      <span style={{ color: mkt.onDarkMuted }}>{rest}</span>
    </>
  );
}
