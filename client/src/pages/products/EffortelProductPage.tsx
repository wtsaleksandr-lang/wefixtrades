/**
 * EffortelProductPage — V7 master template, generalized.
 *
 * Renders the full Effortel-style product page for any slug:
 *   1. HERO          per-product punchy headline + pain-point hook
 *   2. TRUST STRIP   "trusted by [trades]" with the bestFor list
 *   3. NUMBERED CARDS  4 numbered cards from product-mockups.tsx
 *   4. HOW IT WORKS  3-step setup pulled from cfg.howItWorks
 *   5. PRICING       compact tier cards from cfg.pricingSection
 *   6. FAQ           accordion (lightweight, native <details>)
 *   7. FINAL CTA     gradient closer
 *
 * Per-product hero hooks live in HERO_HOOKS — each is the pain-point + the
 * one-liner that resolves it. Trades-buyer brain: short, clear, scannable.
 */

import { useState, useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight, Phone, MessageSquare, Calendar, Star, Clock, Sparkles, Check, ChevronDown } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import CheckoutIntakeModal from "@/components/marketing/CheckoutIntakeModal";
import { mkt } from "@/theme/tokens";
import { getProductBySlug } from "@/config/products";
import { usePageMeta } from "@/lib/usePageMeta";
import {
  NumberedCard,
  BadgePill,
  Reveal,
  MONO, SANS,
} from "@/components/effortel-blocks";
import { PRODUCT_MOCKUPS, type ProductMockupSection } from "@/config/product-mockups";
import { PRODUCT_TESTIMONIALS } from "@/config/product-testimonials";
import TradeLineHeroPhone from "@/components/marketing/TradeLineHeroPhone";
import TradeLineDemoLauncher from "@/components/marketing/TradeLineDemoLauncher";
import NotFound from "@/pages/not-found";

/* ─── Per-product hero hooks ───────────────────────────────────
   { eyebrow: pain point in one line; headline: solution; sub: how. }
   Trades buyers scan. Every line earns its keep. */
const HERO_HOOKS: Record<string, { eyebrow: string; headline: ReactNode; sub: string }> = {
  tradeline: {
    eyebrow: "Every missed call is a competitor's win.",
    headline: <>Never miss a lead.<br/><span style={{ color: mkt.accent }}>Even at 2 AM.</span></>,
    sub: "AI answers every call and chat 24/7, gives instant estimates, books jobs, and follows up — automatically.",
  },
  quickquotepro: {
    eyebrow: "",
    headline: <>Instant quotes. <span style={{ color: mkt.accent }}>Live in 5 minutes.</span></>,
    sub: "Customers get accurate prices on your website 24/7. Every quote captures a lead. Live in 5 minutes — no platform switch.",
  },
  mapguard: {
    eyebrow: "Customers can't book you if they can't find you.",
    headline: <>Show up first.<br/><span style={{ color: mkt.accent }}>On Google Maps.</span></>,
    sub: "We monitor your Google Business Profile every week and fix issues before customers see them. You get the calls, not your competitors.",
  },
  reputationshield: {
    eyebrow: "One ignored bad review can cost you 22 customers.",
    headline: <>Every review answered.<br/><span style={{ color: mkt.accent }}>Within minutes.</span></>,
    sub: "AI drafts a personal reply to every Google and Facebook review. 5-stars get amplified. 1-stars get flagged to your phone.",
  },
  socialsync: {
    eyebrow: "Posting consistently is a full-time job. You already have one.",
    headline: <>Stay visible.<br/><span style={{ color: mkt.accent }}>Without lifting a finger.</span></>,
    sub: "AI drafts your weekly social posts in your voice. You approve in one tap. We handle the calendar, the captions, and the analytics.",
  },
  rankflow: {
    eyebrow: "Hiring an SEO agency? They charge $2K/mo for the same data.",
    headline: <>Outrank competitors.<br/><span style={{ color: mkt.accent }}>Without an agency.</span></>,
    sub: "Weekly keyword tracking + monthly reports that tell you exactly which pages to update. No fluff, no agency-speak.",
  },
  sitelaunch: {
    eyebrow: "Your current site looks like 2014. Visitors notice.",
    headline: <>A site that converts.<br/><span style={{ color: mkt.accent }}>Live in a week.</span></>,
    sub: "We design, build, and host a trade-tuned site that ranks on Google and turns visitors into booked jobs.",
  },
  webcare: {
    eyebrow: "Last time WordPress broke your site, you lost a day fixing it.",
    headline: <>We watch your site.<br/><span style={{ color: mkt.accent }}>So you don't have to.</span></>,
    sub: "Uptime checks every 15 minutes. Daily backups. Plugin updates auto-tested. Monthly health report.",
  },
  webfix: {
    eyebrow: "Slow website? You're invisible to Google and your visitors.",
    headline: <>From 42 to 98.<br/><span style={{ color: mkt.accent }}>In a week.</span></>,
    sub: "We audit, fix, and monitor your site speed and SEO. Lighthouse scores climb from 40s to 90s — and your Google rank follows.",
  },
  contentflow: {
    eyebrow: "Blog posts won't write themselves. Until now.",
    headline: <>Build authority.<br/><span style={{ color: mkt.accent }}>Without writing a word.</span></>,
    sub: "AI drafts trade-specific articles every month — tuned to your service area, your voice, and what's actually ranking.",
  },
  adflow: {
    eyebrow: "Most trade businesses pay $80+ per Google Ads lead. There's a way down to $20.",
    headline: <>Real ads.<br/><span style={{ color: mkt.accent }}>Real ROI.</span></>,
    sub: "Google + Meta campaigns run by a vetted ad-agency partner. Weekly tuning. Plain-English reports — no agency-speak.",
  },
  bookflow: {
    eyebrow: "Phone tag is the silent revenue killer.",
    headline: <>Customers book themselves.<br/><span style={{ color: mkt.accent }}>You just show up.</span></>,
    sub: "Self-service booking from your real calendar. Mobile dispatch view. Eight payment methods. Funds available next day.",
  },
};

export default function EffortelProductPage({ slug }: { slug: string }) {
  const cfg = getProductBySlug(slug);

  // Per-page SEO — apply the product's own title/description/canonical from
  // config/products.ts so every product page ships its own <head> meta
  // instead of the generic site title. Called before any early return to
  // keep hook order stable; falls back to neutral copy when slug is unknown.
  usePageMeta({
    title: cfg?.seoTitle ?? "Product — WeFixTrades",
    description: cfg?.seoDescription ?? "",
    canonicalPath: `/products/${slug}`,
  });

  if (!cfg) return <NotFound />;

  const sections: ProductMockupSection[] = PRODUCT_MOCKUPS[slug] ?? PRODUCT_MOCKUPS.__default;
  const hook = HERO_HOOKS[slug];

  const isTradeLine = slug === "tradeline";

  return (
    <MarketingLayout hideSiteChat={isTradeLine}>
      <div style={{ background: mkt.bg, color: mkt.onDark, fontFamily: SANS }}>

        <Hero cfg={cfg} hook={hook} slug={slug} />
        <TrustStrip cfg={cfg} />

        {/* NUMBERED CARDS */}
        <section style={{ padding: "20px 24px 80px" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
            {sections.map((s, i) => (
              <Reveal key={s.number} delay={i * 0.05}>
                <NumberedCard number={s.number} title={s.title} description={s.description} cta={s.cta}>
                  {s.mockup}
                </NumberedCard>
              </Reveal>
            ))}
          </div>
        </section>

        <HowItWorks steps={cfg.howItWorks} />

        {/* CATEGORY PILLS — outcomes summary */}
        <section style={{ padding: "20px 24px 80px" }}>
          <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {(cfg.outcomes ?? []).slice(0, 4).map((o, i) => {
              const icons = [Phone, Sparkles, Clock, Star, Calendar, MessageSquare];
              const colors = ["cyan", "lavender", "mint", "pink"] as const;
              const Icon = icons[i % icons.length];
              return <BadgePill key={o.title} label={o.title} icon={<Icon size={18} />} iconBg={colors[i % colors.length]} />;
            })}
          </div>
        </section>

        <Testimonials items={PRODUCT_TESTIMONIALS[slug] ?? []} />
        <Pricing pricing={cfg.pricingSection} primaryCta={cfg.primaryCTA} />
        <Faq items={cfg.faq ?? []} />
        <FinalCta cfg={cfg} />
        {/* TradeLine: sticky chat-input launcher replaces the standard
            sticky-mobile CTA + global SiteChatWidget. */}
        {isTradeLine
          ? <TradeLineDemoLauncher />
          : <StickyMobileCta primaryCta={cfg.primaryCTA} productName={cfg.name} />}
      </div>
    </MarketingLayout>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION: STICKY MOBILE CTA
   On screens < 768px, after the user scrolls past the hero (~600px),
   show a sticky bottom bar with the primary CTA. Hides automatically
   when the user reaches the final CTA section.
   ════════════════════════════════════════════════════════════════ */
function StickyMobileCta({ primaryCta, productName }: { primaryCta: { label: string; href: string }; productName: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const docH = document.documentElement.scrollHeight;
      const winH = window.innerHeight;
      // Show after first 600px, hide in the last 600px (so we don't double-up
      // with the in-page final CTA)
      const nearBottom = y + winH > docH - 600;
      setVisible(y > 600 && !nearBottom);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <div
        className="sticky-mcta"
        aria-hidden={!visible}
        style={{
          position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 60,
          background: mkt.dark, border: `1px solid ${mkt.onDarkBorder}`,
          borderRadius: 14,
          padding: "10px 12px",
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
          transform: visible ? "translateY(0)" : "translateY(120%)",
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "auto" : "none",
          transition: "transform 0.3s ease, opacity 0.2s ease",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: mkt.onDarkFaint, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {productName}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: mkt.onDark, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            5-min setup · No card
          </div>
        </div>
        <Link href={primaryCta.href} style={{
          padding: "12px 16px", borderRadius: 10,
          background: mkt.accent, color: "#FFFFFF",
          fontFamily: MONO, fontSize: 12, fontWeight: 700,
          letterSpacing: "0.08em", textTransform: "uppercase",
          textDecoration: "none", whiteSpace: "nowrap",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          {primaryCta.label} <ArrowRight size={13} />
        </Link>
      </div>
      <style>{`
        @media (min-width: 768px) {
          .sticky-mcta { display: none !important; }
        }
      `}</style>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION: HERO
   ════════════════════════════════════════════════════════════════ */
function Hero({ cfg, hook, slug }: { cfg: ReturnType<typeof getProductBySlug> & {}; hook?: typeof HERO_HOOKS[string]; slug: string }) {
  // TradeLine gets a premium split layout with the live phone demo.
  // Other products keep the centered text-only hero (their visuals live in
  // the numbered cards below).
  if (slug === "tradeline") {
    return (
      <section style={{ padding: "100px 24px 60px", position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(13,60,252,0.10) 0%, transparent 60%)",
        }} />
        <div className="tlhp-split" style={{
          maxWidth: 1100, margin: "0 auto", position: "relative",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 380px",
          gap: 32, alignItems: "center",
        }}>
          {/* LEFT — copy + CTAs */}
          <div className="tlhp-split-text" style={{ minWidth: 0 }}>
            <Reveal>
              <span style={{ display: "inline-block", fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: mkt.accent, marginBottom: 16 }}>
                {cfg.name}
              </span>
            </Reveal>
            {hook?.eyebrow && (
              <Reveal delay={0.04}>
                <p style={{ fontSize: 14, color: mkt.onDarkFaint, fontStyle: "italic", marginBottom: 18, maxWidth: 520 }}>
                  {hook.eyebrow}
                </p>
              </Reveal>
            )}
            <Reveal delay={0.08}>
              <h1 style={{
                fontSize: "clamp(40px, 5.4vw, 68px)", fontWeight: 700,
                lineHeight: 0.98, letterSpacing: "-0.03em",
                color: mkt.onDark, marginBottom: 22, maxWidth: 560,
              }}>
                {hook?.headline ?? cfg.shortTagline}
              </h1>
            </Reveal>
            <Reveal delay={0.12}>
              <p style={{ fontSize: 17, lineHeight: 1.55, color: mkt.onDarkMuted, maxWidth: 520, marginBottom: 32 }}>
                {hook?.sub ?? cfg.seoDescription}
              </p>
            </Reveal>
            <Reveal delay={0.16}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Link href={cfg.primaryCTA.href} className="wft-hover-border-white" style={ctaPrimary}>
                  {cfg.primaryCTA.label} <ArrowRight size={16} />
                </Link>
                {cfg.secondaryCTA && (
                  <Link href={cfg.secondaryCTA.href} style={ctaGhost}>
                    {cfg.secondaryCTA.label}
                  </Link>
                )}
              </div>
            </Reveal>
            <Reveal delay={0.20}>
              <p style={{ marginTop: 20, fontSize: 12, fontFamily: MONO, color: mkt.onDarkFaint, letterSpacing: "0.06em" }}>
                Tap the phone to pause the demo · resumes when you're ready
              </p>
            </Reveal>
          </div>

          {/* RIGHT — premium animated phone */}
          <div className="tlhp-split-phone" style={{ display: "flex", justifyContent: "center", minWidth: 0 }}>
            <TradeLineHeroPhone />
          </div>
        </div>

        <style>{`
          @media (max-width: 960px) {
            .tlhp-split {
              grid-template-columns: 1fr !important;
              gap: 40px !important;
              text-align: center;
            }
            .tlhp-split-text { order: 2; }
            .tlhp-split-phone { order: 1; }
            .tlhp-split-text h1,
            .tlhp-split-text p { margin-left: auto !important; margin-right: auto !important; }
            .tlhp-split-text > div { justify-content: center; }
          }
        `}</style>
      </section>
    );
  }

  // Default centered hero for all other products
  const isQQ = slug === "quickquotepro";
  return (
    <section style={{ padding: "120px 24px 80px", position: "relative", overflow: "hidden" }}>
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(13,60,252,0.08) 0%, transparent 60%)",
      }} />
      {isQQ && (
        <span style={{ position: "absolute", top: 24, left: 24, fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: mkt.accent }}>
          {cfg.name}
        </span>
      )}
      <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", textAlign: "center" }}>
        {!isQQ && (
          <Reveal>
            <span style={{ display: "inline-block", fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: mkt.accent, marginBottom: 16 }}>
              {cfg.name}
            </span>
          </Reveal>
        )}
        {hook?.eyebrow && (
          <Reveal delay={0.04}>
            <p style={{ fontSize: 14, color: mkt.onDarkFaint, fontStyle: "italic", marginBottom: 18, maxWidth: 540, margin: "0 auto 18px" }}>
              {hook.eyebrow}
            </p>
          </Reveal>
        )}
        <Reveal delay={0.08}>
          <h1 style={{ fontSize: isQQ ? "clamp(35px, 5.2vw, 64px)" : "clamp(44px, 6.5vw, 80px)", fontWeight: 700, lineHeight: 0.98, letterSpacing: "-0.03em", color: mkt.onDark, marginBottom: 24, maxWidth: 920, margin: "0 auto 24px" }}>
            {hook?.headline ?? cfg.shortTagline}
          </h1>
        </Reveal>
        <Reveal delay={0.12}>
          <p style={{ fontSize: 18, lineHeight: 1.5, color: mkt.onDarkMuted, maxWidth: 580, margin: "0 auto 36px" }}>
            {hook?.sub ?? cfg.seoDescription}
          </p>
        </Reveal>
        <Reveal delay={0.16}>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href={cfg.primaryCTA.href} className="wft-hover-border-white" style={ctaPrimary}>
              {cfg.primaryCTA.label} <ArrowRight size={16} />
            </Link>
            {cfg.secondaryCTA && (
              <Link href={cfg.secondaryCTA.href} className="wft-hover-border-white" style={ctaGhost}>
                {cfg.secondaryCTA.label}
              </Link>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION: TRUST STRIP
   ════════════════════════════════════════════════════════════════ */
function TrustStrip({ cfg }: { cfg: ReturnType<typeof getProductBySlug> & {} }) {
  const trades = (cfg.bestFor ?? []).slice(0, 8);
  if (trades.length === 0) return null;
  return (
    <section style={{ padding: "32px 24px", borderTop: `1px solid ${mkt.onDarkBorder}`, borderBottom: `1px solid ${mkt.onDarkBorder}`, background: "rgba(255,255,255,0.02)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <p style={{ textAlign: "center", fontSize: 11, fontFamily: MONO, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: mkt.onDarkFaint, marginBottom: 18 }}>
          Trusted by trades businesses across
        </p>
        <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          {trades.map(t => (
            <span key={t} style={{ fontSize: 13, fontWeight: 500, color: mkt.onDarkMuted, fontFamily: MONO, letterSpacing: "0.04em" }}>{t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION: HOW IT WORKS
   ════════════════════════════════════════════════════════════════ */
function HowItWorks({ steps }: { steps?: { title: string; desc: string }[] }) {
  if (!steps?.length) return null;
  return (
    <section style={{ padding: "80px 24px", background: "rgba(255,255,255,0.02)", borderTop: `1px solid var(--hairline)`, borderBottom: `1px solid var(--hairline)` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1.05, letterSpacing: "-0.025em", color: mkt.onDark, margin: 0 }}>
              How it works
            </h2>
          </div>
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${steps.length}, 1fr)`, gap: 24, position: "relative" }} className="hiw-grid">
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.06}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: mkt.accent, color: "#FFFFFF",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 700, fontFamily: MONO,
                  }}>
                    {i + 1}
                  </div>
                  {i < steps.length - 1 && (
                    <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${mkt.accent}66, transparent)` }} />
                  )}
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: mkt.onDark, marginBottom: 8, letterSpacing: "-0.01em" }}>
                  {s.title}
                </h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: mkt.onDarkMuted }}>
                  {s.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
      <style>{`
        @media (max-width: 768px) { .hiw-grid { grid-template-columns: 1fr !important; gap: 32px !important; } }
      `}</style>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION: PRICING
   ════════════════════════════════════════════════════════════════ */
function Pricing({ pricing, primaryCta }: { pricing?: { plans: any[]; note?: string; checkoutEnabled?: boolean }; primaryCta: { label: string; href: string } }) {
  // When checkoutEnabled, each tier card opens CheckoutIntakeModal
  // pre-loaded with that tier's SKU. `checkoutTier` = the open plan
  // (null = closed). Products without checkoutEnabled keep the
  // existing primaryCta link — zero behavior change.
  const [checkoutTier, setCheckoutTier] = useState<{ sku: string; name: string; price: string } | null>(null);
  if (!pricing?.plans?.length) return null;
  const checkoutEnabled = !!pricing.checkoutEnabled;
  return (
    <section id="pricing" style={{ padding: "80px 24px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1.05, letterSpacing: "-0.025em", color: mkt.onDark, margin: 0 }}>
              Pick a tier. Cancel any time.
            </h2>
          </div>
        </Reveal>
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(pricing.plans.length, 3)}, 1fr)`,
          alignItems: "stretch",
          gap: 16,
          maxWidth: pricing.plans.length === 1 ? 460 : pricing.plans.length === 2 ? 760 : 1080,
          margin: "0 auto",
        }} className="pricing-grid">
          {pricing.plans.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.06}>
              {/* Highlighted card: blue bg with WHITE text (high contrast).
                * Non-highlighted: dark surface with normal text.
                * Both cards: hover lifts + adds white border (matches the
                * brand-wide pattern landed in PR #164/#165). */}
              <div className="pricing-card" data-highlighted={p.highlighted ? "true" : "false"} style={{
                background: p.highlighted ? mkt.accent : mkt.sectionLight,
                color: p.highlighted ? "#FFFFFF" : mkt.onDark,
                borderRadius: 20, padding: "32px 24px",
                border: `1px solid ${p.highlighted ? mkt.accent : "var(--hairline)"}`,
                position: "relative",
                height: "100%",
                display: "flex", flexDirection: "column",
                transition: "transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease",
              }}>
                {p.badge && (
                  <span style={{
                    position: "absolute", top: -10, left: 24,
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                    padding: "4px 10px", borderRadius: 999,
                    background: p.highlighted ? "#FFFFFF" : mkt.accent,
                    color: p.highlighted ? mkt.accent : "#FFFFFF",
                  }}>{p.badge}</span>
                )}
                <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 8, color: "inherit" }}>{p.name}</h3>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, color: "inherit" }}>
                    {p.price}
                  </span>
                  <span style={{ fontSize: 13, opacity: 0.7, color: "inherit" }}>{p.period}</span>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 24px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                  {(p.features ?? []).slice(0, 5).map((f: string) => (
                    <li key={f} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.45, color: "inherit" }}>
                      <Check size={14} style={{ marginTop: 3, flexShrink: 0, color: p.highlighted ? "#FFFFFF" : mkt.accent }} strokeWidth={3} />
                      {f}
                    </li>
                  ))}
                </ul>
                {checkoutEnabled && p.sku ? (
                  <button
                    type="button"
                    onClick={() => setCheckoutTier({ sku: p.sku, name: p.name, price: `${p.price}${p.period}` })}
                    style={{
                      display: "block", width: "100%", textAlign: "center",
                      padding: "12px 14px", borderRadius: 10,
                      background: mkt.ctaBg,
                      color: mkt.ctaText,
                      fontSize: 13, fontWeight: 500,
                      border: "none", cursor: "pointer",
                      lineHeight: 1.25,
                      whiteSpace: "normal",
                      overflowWrap: "break-word",
                      marginTop: "auto",
                    }}
                  >
                    Get {p.name}
                  </button>
                ) : (
                  <Link href={primaryCta.href} style={{
                    display: "block", textAlign: "center",
                    padding: "12px 14px", borderRadius: 10,
                    background: mkt.ctaBg,
                    color: mkt.ctaText,
                    fontSize: 13, fontWeight: 500,
                    textDecoration: "none",
                    lineHeight: 1.25,
                    whiteSpace: "normal",
                    overflowWrap: "break-word",
                    marginTop: "auto",
                  }}>
                    {primaryCta.label}
                  </Link>
                )}
              </div>
            </Reveal>
          ))}
        </div>
        {pricing.note && (
          <p style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: mkt.onDarkFaint, fontFamily: MONO, letterSpacing: "0.04em" }}>
            {pricing.note}
          </p>
        )}
      </div>
      <style>{`
        @media (max-width: 900px) {
          .pricing-grid { grid-template-columns: 1fr !important; max-width: 460px !important; }
        }
        /* Hover: pop-out lift + white border on the card. The highlighted
         * card already has a colored border (mkt.accent); on hover it
         * gets a white outline instead so the affordance is consistent
         * across both card types. */
        .pricing-card:hover {
          transform: translateY(-6px);
          border-color: #FFFFFF !important;
          box-shadow: 0 24px 48px rgba(0,0,0,0.28);
        }
      `}</style>

      {/* Per-tier checkout — only mounts for checkoutEnabled products. */}
      <CheckoutIntakeModal
        open={!!checkoutTier}
        onClose={() => setCheckoutTier(null)}
        items={checkoutTier ? [checkoutTier.sku] : []}
        bundleName={checkoutTier?.name}
        priceLabel={checkoutTier?.price}
      />
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION: FAQ
   ════════════════════════════════════════════════════════════════ */
function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  if (!items.length) return null;
  return (
    <section style={{ padding: "80px 24px", background: "rgba(255,255,255,0.02)", borderTop: `1px solid var(--hairline)`, borderBottom: `1px solid var(--hairline)` }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1.05, letterSpacing: "-0.025em", color: mkt.onDark, margin: 0 }}>
              FAQ
            </h2>
          </div>
        </Reveal>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.slice(0, 7).map((item, i) => {
            const open = openIdx === i;
            return (
              <Reveal key={item.q} delay={i * 0.04}>
                <button
                  type="button"
                  onClick={() => setOpenIdx(open ? null : i)}
                  style={{
                    width: "100%", textAlign: "left",
                    background: open ? mkt.sectionLight : "transparent",
                    border: `1px solid ${mkt.onDarkBorder}`,
                    borderRadius: 14, padding: "18px 20px",
                    color: mkt.onDark, cursor: "pointer",
                    fontFamily: SANS, transition: "background 0.2s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{item.q}</span>
                    <ChevronDown size={18} color={mkt.accent} style={{ transition: "transform 0.2s ease", transform: open ? "rotate(180deg)" : "rotate(0)", flexShrink: 0 }} />
                  </div>
                  {open && (
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: mkt.onDarkMuted, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${mkt.onDarkBorder}` }}>
                      {item.a}
                    </p>
                  )}
                </button>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION: TESTIMONIALS
   ════════════════════════════════════════════════════════════════ */
/* Review-source label — text only, no badges/icons, per the brief.
 * `unknown` covers data entries that weren't tagged (defaults to a
 * neutral label rather than failing or hiding). */
const SOURCE_LABEL: Record<string, string> = {
  trustpilot: "Trustpilot review",
  google_maps: "Google review",
  facebook: "Facebook review",
  google: "Google review",
  internal_pilot: "Verified customer",
  case_study: "Verified customer",
};

function Testimonials({ items }: { items: { quote: string; author: string; trade: string; city: string; rating: 5; source?: string }[] }) {
  if (!items.length) return null;
  return (
    <section style={{ padding: "80px 24px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1.05, letterSpacing: "-0.025em", color: mkt.onDark, margin: 0 }}>
              Reviews
            </h2>
          </div>
        </Reveal>
        {/* Trustpilot-style review cards — no avatars, no platform badges
         * (just the source-name text under the reviewer). 7 cards per
         * product page. auto-fit grid wraps responsively from 1→4 cols. */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          maxWidth: 1180,
          margin: "0 auto",
        }}>
          {items.slice(0, 7).map((t, i) => (
            <Reveal key={t.quote} delay={i * 0.04}>
              <div className="review-card" style={{
                padding: "22px 22px",
                borderRadius: 14,
                background: mkt.sectionLight,
                border: `1px solid var(--hairline)`,
                height: "100%",
                display: "flex", flexDirection: "column", gap: 14,
                transition: "transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease",
              }}>
                <div style={{ display: "flex", gap: 2, color: "#F59E0B" }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} size={14} fill="#F59E0B" stroke="#F59E0B" />
                  ))}
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: mkt.onDark, margin: 0, flex: 1, letterSpacing: "-0.005em" }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div style={{ paddingTop: 12, borderTop: `1px solid var(--hairline)` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: mkt.onDark, marginBottom: 2 }}>{t.author}</div>
                  <div style={{ fontSize: 11, color: mkt.onDarkFaint }}>
                    {t.trade} &middot; {t.city}
                  </div>
                  <div style={{ fontSize: 10, color: mkt.onDarkFaint, marginTop: 6, opacity: 0.8 }}>
                    {SOURCE_LABEL[t.source ?? "internal_pilot"] ?? "Verified customer"}
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
      <style>{`
        .review-card:hover {
          transform: translateY(-4px);
          border-color: #FFFFFF !important;
          box-shadow: 0 16px 32px rgba(0,0,0,0.22);
        }
      `}</style>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION: FINAL CTA
   ════════════════════════════════════════════════════════════════ */
function FinalCta({ cfg }: { cfg: ReturnType<typeof getProductBySlug> & {} }) {
  return (
    <section style={{ padding: "80px 24px 80px" }}>
      <div style={{
        maxWidth: 980, margin: "0 auto",
        background: mkt.sectionLight,
        borderRadius: 28, padding: "56px 32px",
        position: "relative", overflow: "hidden",
        textAlign: "center",
      }}>
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 50% 80% at 50% 50%, rgba(13,60,252,0.10) 0%, transparent 60%)",
        }} />
        <h2 style={{ position: "relative", fontSize: "clamp(32px, 4.5vw, 52px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.025em", color: mkt.onDark, marginBottom: 18 }}>
          Ready to start with<br />
          <span style={{ color: mkt.accent }}>{cfg.name}?</span>
        </h2>
        <p style={{ position: "relative", fontSize: 16, lineHeight: 1.55, color: mkt.onDarkMuted, marginBottom: 32 }}>
          Setup is fast. No card required. Cancel anytime.
        </p>
        <Link href={cfg.primaryCTA.href} className="wft-hover-border-white" style={{ ...ctaPrimary, position: "relative", fontSize: 14, padding: "16px 32px" }}>
          {cfg.primaryCTA.label} <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}

/* ─── shared cta styles ─── */
/* Use className "wft-cta-primary" / "wft-cta-ghost" so CSS can responsively
   tighten padding + allow text wrap on small screens. The inline style is
   the desktop baseline. */
const ctaPrimary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10,
  padding: "14px 22px", borderRadius: 10,
  background: mkt.accent, color: "#FFFFFF",
  fontFamily: MONO, fontSize: 13, fontWeight: 600,
  letterSpacing: "0.08em", textTransform: "uppercase",
  textDecoration: "none",
  textAlign: "center",
  lineHeight: 1.2,
  maxWidth: "100%",
  whiteSpace: "normal",
  overflowWrap: "break-word",
};

const ctaGhost: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10,
  padding: "14px 22px", borderRadius: 10,
  background: "transparent", color: mkt.onDark,
  fontFamily: MONO, fontSize: 13, fontWeight: 600,
  letterSpacing: "0.08em", textTransform: "uppercase",
  textDecoration: "none",
  border: `1px solid ${mkt.onDarkBorder}`,
  textAlign: "center",
  lineHeight: 1.2,
  maxWidth: "100%",
  whiteSpace: "normal",
  overflowWrap: "break-word",
};
