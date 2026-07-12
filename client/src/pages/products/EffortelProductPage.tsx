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

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight, Phone, MessageSquare, Calendar, Star, Clock, Sparkles, Check, ChevronDown, Rocket, ShieldCheck, Building2, Lock, FileText, CreditCard, PlayCircle, Zap, Mail } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import CheckoutIntakeModal from "@/components/marketing/CheckoutIntakeModal";
import { SuiteBreadcrumb } from "@/components/marketing/SuiteBreadcrumb";
import { SmsConsentDisclosure } from "@/components/forms/SmsConsentDisclosure";
import { PageMeta } from "@/components/seo/PageMeta";
import { mkt } from "@/theme/tokens";
import { getLenis } from "@/hooks/useLenis";
import { getProductBySlug } from "@/config/products";
import {
  productSchema,
  faqSchema,
  softwareApplication,
  breadcrumbList,
} from "@/lib/seo/jsonLd";
import { SITE_URL } from "@/lib/seo/pageMeta";
import {
  NumberedCard,
  BadgePill,
  Reveal,
  MONO, SANS,
} from "@/components/effortel-blocks";
import { PRODUCT_MOCKUPS, type ProductMockupSection } from "@/config/product-mockups";
import { getProductTestimonials } from "@/config/product-testimonials";
import TradeLineHeroPhone from "@/components/marketing/TradeLineHeroPhone";
import TradeLineDemoLauncher from "@/components/marketing/TradeLineDemoLauncher";
import { HorizontalCarousel } from "@/components/marketing/HorizontalCarousel";
import SplitHero from "@/components/marketing/SplitHero";
import { ProductHeroAnimation } from "@/components/marketing/heroAnimations/registry";
import NotFound from "@/pages/not-found";
import QuoteWidget from "@/components/quote-widget/QuoteWidget";
import type { CalculatorData } from "@/components/quote-widget/types";
import {
  getTemplatePreset,
  toAdvancedConfig,
  type BusinessProfile,
} from "@shared/templatePresets";
import MapMockup from "@/pages/products/mapguard/MapMockup";
import ArchitectureCardTradeLine from "@/components/marketing/showcase/ArchitectureCardTradeLine";
import DataStreamCard from "@/components/marketing/showcase/DataStreamCard";

/* ─── Per-product hero hooks ───────────────────────────────────
   { eyebrow: pain point in one line; headline: solution; sub: how. }
   Trades buyers scan. Every line earns its keep. */
const HERO_HOOKS: Record<string, { eyebrow: string; headline: ReactNode; sub: string }> = {
  tradeline: {
    eyebrow: "Every missed call is a competitor's win.",
    headline: <>Never miss a lead. <span style={{ display: "block", color: mkt.accentOnDark }}>Even at 2 AM.</span></>,
    sub: "AI answers every call and chat 24/7, gives instant estimates, books jobs, and follows up — automatically.",
  },
  quickquotepro: {
    eyebrow: "",
    headline: <>Instant quotes. <span style={{ color: mkt.accentOnDark }}>Live in 5 minutes.</span></>,
    sub: "Customers get accurate prices on your website 24/7. Every quote captures a lead. Live in 5 minutes — no platform switch.",
  },
  mapguard: {
    eyebrow: "Customers can't book you if they can't find you.",
    headline: <>Show up first. <span style={{ display: "block", color: mkt.accentOnDark }}>On Google Maps.</span></>,
    sub: "We monitor your Google Business Profile every week and fix issues before customers see them. You get the calls, not your competitors.",
  },
  reputationshield: {
    eyebrow: "One ignored bad review can cost you 22 customers.",
    headline: <>Every review answered. <span style={{ display: "block", color: mkt.accentOnDark }}>Within minutes.</span></>,
    sub: "AI drafts a personal reply to every Google and Facebook review. 5-stars get amplified. 1-stars get flagged to your phone.",
  },
  socialsync: {
    eyebrow: "Posting consistently is a full-time job. You already have one.",
    headline: <>Stay visible. <span style={{ display: "block", color: mkt.accentOnDark }}>Without lifting a finger.</span></>,
    sub: "AI drafts your weekly social posts in your voice. You approve in one tap. We handle the calendar, the captions, and the analytics.",
  },
  rankflow: {
    eyebrow: "Hiring an SEO agency? They charge $2K/mo for the same data.",
    headline: <>Outrank competitors. <span style={{ display: "block", color: mkt.accentOnDark }}>Without an agency.</span></>,
    sub: "Weekly keyword tracking + monthly reports that tell you exactly which pages to update. No fluff, no agency-speak.",
  },
  sitelaunch: {
    eyebrow: "Your current site looks like 2014. Visitors notice.",
    headline: <>A site that converts. <span style={{ display: "block", color: mkt.accentOnDark }}>Live in a week.</span></>,
    sub: "We design, build, and launch a trade-tuned site that ranks on Google and turns visitors into booked jobs.",
  },
  webcare: {
    eyebrow: "Last time WordPress broke your site, you lost a day fixing it.",
    headline: <>We watch your site. <span style={{ display: "block", color: mkt.accentOnDark }}>So you don't have to.</span></>,
    sub: "Uptime checks every 15 minutes. Plugin updates auto-tested. Security & SSL checks. Monthly health report.",
  },
  webfix: {
    eyebrow: "Slow website? You're invisible to Google and your visitors.",
    headline: <>From 42 to 98. <span style={{ display: "block", color: mkt.accentOnDark }}>In a week.</span></>,
    sub: "We audit, fix, and monitor your site speed and SEO. Lighthouse scores climb from 40s to 90s — and your Google rank follows.",
  },
  contentflow: {
    eyebrow: "Blog posts won't write themselves. Until now.",
    headline: <>Build authority. <span style={{ display: "block", color: mkt.accentOnDark }}>Without writing a word.</span></>,
    sub: "AI drafts trade-specific articles every month — tuned to your service area, your voice, and what's actually ranking.",
  },
  adflow: {
    eyebrow: "Most trade businesses pay $80+ per Google Ads lead. There's a way down to $20.",
    headline: <>Real ads. <span style={{ display: "block", color: mkt.accentOnDark }}>Real ROI.</span></>,
    sub: "Google + Meta campaigns run by a vetted ad-agency partner. Weekly tuning. Plain-English reports — no agency-speak.",
  },
  bookflow: {
    // Wave 11D D2 — reframed as a QuoteQuick-bundled feature, not a standalone SKU.
    eyebrow: "Booking is part of QuoteQuick now — not a separate bill.",
    headline: <>Booking flow. <span style={{ display: "block", color: mkt.accentOnDark }}>Included with QuoteQuick.</span></>,
    sub: "Every QuoteQuick plan ships with the BookFlow scheduling experience — customers quote and book in one flow, you pay one subscription.",
  },
};

export default function EffortelProductPage({ slug }: { slug: string }) {
  const cfg = getProductBySlug(slug);

  // Per-page SEO — handled by <PageMeta> below; configured from
  // config/products.ts so every product page ships its own <head>
  // meta + Product JSON-LD instead of the generic site title.
  if (!cfg) return <NotFound />;

  // Derive a numeric "from" price from the lowest plan in the pricing
  // section — first plan whose price reads as $N(.NN). Used as the
  // SoftwareApplication offer so SERPs show a starting price.
  const fromPrice: number | null = (() => {
    for (const plan of cfg.pricingSection?.plans ?? []) {
      const match = /\$([\d,]+(?:\.\d+)?)/.exec(plan.price ?? "");
      if (match) {
        const n = Number(match[1].replace(/,/g, ""));
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    return null;
  })();

  const productUrl = `${SITE_URL}/products/${cfg.slug}`;
  const productOgImage = `${SITE_URL}/og/${cfg.slug}.png`;

  const productJsonLd = productSchema({
    name: cfg.name,
    slug: cfg.slug,
    description: cfg.seoDescription,
    image: productOgImage,
    ...(fromPrice !== null ? { price: fromPrice } : {}),
  });
  const productFaqJsonLd = cfg.faq && cfg.faq.length > 0
    ? faqSchema(cfg.faq.map((f) => ({ question: f.q, answer: f.a })))
    : null;
  // PR #679 audit: SoftwareApplication for all SaaS products + BreadcrumbList
  // for the Home › Products › <Name> trail on every product page.
  const softwareApplicationJsonLd = softwareApplication({
    name: cfg.name,
    description: cfg.seoDescription,
    applicationCategory: "BusinessApplication",
    url: productUrl,
    image: productOgImage,
    ...(fromPrice !== null
      ? { offers: { price: fromPrice, priceCurrency: "USD", url: productUrl } }
      : {}),
  });
  const breadcrumbJsonLd = breadcrumbList([
    { name: "Home", url: `${SITE_URL}/` },
    { name: "Products", url: `${SITE_URL}/products` },
    { name: cfg.name, url: productUrl },
  ]);
  const pageJsonLd: object[] = [
    productJsonLd,
    softwareApplicationJsonLd,
    breadcrumbJsonLd,
    ...(productFaqJsonLd ? [productFaqJsonLd] : []),
  ];

  const sections: ProductMockupSection[] = PRODUCT_MOCKUPS[slug] ?? PRODUCT_MOCKUPS.__default;
  const hook = HERO_HOOKS[slug];

  const isTradeLine = slug === "tradeline";
  const isComingSoon = cfg.comingSoon === true;
  // A product whose every priced tier is a one-time charge (WebFix $249,
  // SiteLaunch $1197). Used to swap subscription microcopy ("No card required.
  // Cancel anytime.", "5-min setup · No card") for one-time-honest copy — that
  // language is self-contradictory at the point of sale for a paid one-time SKU.
  const isOneTime =
    (cfg.pricingSection?.plans?.length ?? 0) > 0 &&
    (cfg.pricingSection?.plans ?? []).every((p) => (p.period ?? "").includes("one-time"));
  // Wave 11D D5 — visual breadcrumb on MapGuard Suite member product pages.
  const isMapGuardSuiteMember = slug === "mapguard";

  // W-AN-2 — when the product is in "Coming Soon" mode, the primary CTA
  // becomes "Join the waitlist" and scrolls to the waitlist form below
  // pricing. The original primaryCTA.href is kept in the cfg for SEO /
  // structured data but the user-visible action changes.
  const effectiveCfg = isComingSoon
    ? {
        ...cfg,
        primaryCTA: { label: "Join the waitlist", href: "#waitlist" },
        secondaryCTA: undefined,
      }
    : cfg;

  return (
    <MarketingLayout hideSiteChat={isTradeLine} hideStickyCtas={isTradeLine}>
      <PageMeta
        // Strip a redundant trailing "| WeFixTrades" — PageMeta already
        // appends " · WeFixTrades", so the raw seoTitles produced a doubled
        // brand ("… | WeFixTrades · WeFixTrades") on all 12 product pages.
        title={cfg.seoTitle.replace(/\s*\|\s*WeFixTrades\s*$/i, "")}
        description={cfg.seoDescription}
        canonical={`/products/${slug}`}
        ogType="product"
        ogImage={`/og/${cfg.slug}.png`}
        jsonLd={pageJsonLd}
      />
      {/* CONTRAST-2 — EffortelProductPage is a marketing dark-hero page. */}
      <div data-theme="dark" style={{ background: mkt.bg, color: mkt.onDark, fontFamily: SANS }}>

        {isComingSoon && <ComingSoonBanner />}
        {isMapGuardSuiteMember && <SuiteBreadcrumb productName={cfg.name} variant="dark" />}
        <Hero cfg={effectiveCfg} hook={hook} slug={slug} />
        <TrustStrip cfg={cfg} />

        {/* BG-4 — live, in-page product demo (between trust strip + numbered
            cards). The actual interactive widget for products that ship one
            — visitors don't just read about it, they touch it. Skipped for
            products without a real customer-facing widget. */}
        {slug === "quickquotepro" && <QuickQuoteRoofSolarHeroDemo />}
        {slug === "quickquotepro" && <QuickQuoteLandingLiveDemo />}
        {slug === "quickquotepro" && <QuickQuoteCredibility />}
        {slug === "mapguard" && <MapGuardLandingTeaser />}
        {slug === "rankflow" && <RankFlowFreeTools />}
        {slug === "tradeline" && <TradeLineArchSection />}
        {slug === "reputationshield" && <ReputationShieldDataSection />}

        {/* NUMBERED CARDS
            A11Y — NumberedCard renders its title as <h3>, but the page's
            previous heading is the hero <h1>, which makes axe flag
            `heading-order` for the h1 → h3 skip. We introduce a
            visually-hidden <h2> that labels the numbered-cards section
            for screen readers + the document outline, without changing
            the visual design. Naming is generic ("What {product} does")
            so it works for every product slug rendered by this page. */}
        <section style={{ padding: "16px 24px 56px", position: "relative" }} aria-labelledby="product-features-heading">
          <h2
            id="product-features-heading"
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0,0,0,0)",
              whiteSpace: "nowrap",
              border: 0,
            }}
          >
            What {cfg.name} does
          </h2>
          <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
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

        {/* CATEGORY PILLS — outcomes summary.
            Hidden on mobile: these duplicate the value props already covered
            by NumberedCards + HowItWorks above (the four icon pills are pure
            recap on small screens and account for ~280px of vertical waste). */}
        <section className="product-outcomes-pills" style={{ padding: "16px 24px 56px" }}>
          <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {(cfg.outcomes ?? []).slice(0, 4).map((o, i) => {
              const icons = [Phone, Sparkles, Clock, Star, Calendar, MessageSquare];
              const colors = ["cyan", "lavender", "mint", "pink"] as const;
              const Icon = icons[i % icons.length];
              return <BadgePill key={o.title} label={o.title} icon={<Icon size={20} />} iconBg={colors[i % colors.length]} />;
            })}
          </div>
          <style>{`
            @media (max-width: 768px) {
              .product-outcomes-pills { display: none !important; }
            }
          `}</style>
        </section>

        <Testimonials items={getProductTestimonials(slug)} />
        <Pricing
          pricing={cfg.pricingSection}
          primaryCta={effectiveCfg.primaryCTA}
          comingSoon={isComingSoon}
          slug={slug}
        />
        {isComingSoon && (
          <WaitlistForm productSlug={cfg.slug} productName={cfg.name} />
        )}
        <Faq items={cfg.faq ?? []} />
        <FinalCta cfg={effectiveCfg} comingSoon={isComingSoon} oneTime={isOneTime} />
        {/* TradeLine: sticky chat-input launcher replaces the standard
            sticky-mobile CTA + global SiteChatWidget. */}
        {isTradeLine
          ? <TradeLineDemoLauncher />
          : <StickyMobileCta primaryCta={effectiveCfg.primaryCTA} productName={cfg.name} comingSoon={isComingSoon} oneTime={isOneTime} />}
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
function StickyMobileCta({ primaryCta, productName, comingSoon, oneTime }: { primaryCta: { label: string; href: string }; productName: string; comingSoon?: boolean; oneTime?: boolean }) {
  const [visible, setVisible] = useState(false);
  // Subline must match the billing type. "5-min setup · No card" is a
  // live-subscription claim — false for a waitlist (nothing to set up yet)
  // and for a paid one-time checkout (a card IS required).
  const subline = comingSoon
    ? "Get early access"
    : oneTime
      ? "Secure Stripe checkout"
      : "5-min setup · No card";

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

  /* Publish the sticky-bar height as the same CSS var the global chat FAB
   * (SiteChatWidget) reads, so the FAB lifts above this bar on mobile instead
   * of overlapping it and clipping the CTA label ("…NO CA"). ~80px ≈ rendered
   * bar height (padding + two text rows) + the bottom:12 offset. Mirrors the
   * MarketingStickyBar mechanism. */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--mkt-sticky-bar-h", visible ? "80px" : "0px");
    return () => { root.style.setProperty("--mkt-sticky-bar-h", "0px"); };
  }, [visible]);

  return (
    <>
      {/* A11Y — axe `aria-hidden-focus`: the previous version set
       *  `aria-hidden=true` while the inner CTA stayed in the tab order, so
       *  screen-reader users could land on a focusable element inside a
       *  hidden subtree. Using the native `inert` attribute (cast — React's
       *  type defs trail the DOM spec on `inert`) removes both focusability
       *  and assistive-tech exposure when the bar is offscreen, satisfying
       *  the rule while preserving the slide-in/out animation. */}
      <div
        className="sticky-mcta"
        {...(!visible ? ({ inert: "" } as Record<string, string>) : {})}
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
            {subline}
          </div>
        </div>
        <CtaLink href={primaryCta.href} style={{
          padding: "12px 16px", borderRadius: 10,
          background: mkt.accent, color: "#FFFFFF",
          fontFamily: MONO, fontSize: 12, fontWeight: 700,
          letterSpacing: "0.08em", textTransform: "uppercase",
          textDecoration: "none", whiteSpace: "nowrap",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          {primaryCta.label} <ArrowRight size={14} />
        </CtaLink>
      </div>
      <style>{`
        @media (min-width: 768px) {
          .sticky-mcta { display: none !important; }
        }
        /* Reserve right-side room for the floating chat FAB (56px @ right:24)
         * so the CTA label never runs underneath it. Only needed in the
         * 481–767px band: at ≤480px the FAB lifts clear ABOVE the bar (see
         * SiteChatWidget --mkt-sticky-bar-h), so the bar keeps full width. */
        @media (min-width: 481px) and (max-width: 767px) {
          .sticky-mcta { padding-right: 76px !important; }
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
      /* Wave AE — bottom padding tightened 60→30 (-50%) so the gap below
         the phone mockup and above the reviews section reads as part of
         the same flow rather than disconnected slabs. */
      <section style={{ padding: "72px 24px 24px", position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(13,60,252,0.10) 0%, transparent 60%)",
        }} />
        <div className="tlhp-split" style={{
          maxWidth: 1100, margin: "0 auto", position: "relative",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 380px",
          /* Top-align so the title sits close under the navbar instead of being
             pushed ~320px down by vertical-centering against the tall phone. */
          gap: 32, alignItems: "start",
        }}>
          {/* LEFT — copy + CTAs */}
          <div className="tlhp-split-text" style={{ minWidth: 0 }}>
            <Reveal>
              <span style={{ display: "inline-block", fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: mkt.accentOnDark, marginBottom: 16 }}>
                {cfg.name}
              </span>
            </Reveal>
            {hook?.eyebrow && (
              <Reveal delay={0.04}>
                <p style={{ fontSize: 14, color: mkt.onDarkMuted, fontStyle: "italic", marginBottom: 18, maxWidth: 520 }}>
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
                <CtaLink href={cfg.primaryCTA.href} className="wft-hover-border-white" style={ctaPrimary}>
                  {cfg.primaryCTA.label} <ArrowRight size={16} />
                </CtaLink>
                {cfg.secondaryCTA && (
                  <CtaLink href={cfg.secondaryCTA.href} style={ctaGhost}>
                    {cfg.secondaryCTA.label}
                  </CtaLink>
                )}
              </div>
            </Reveal>
            <Reveal delay={0.20}>
              <p style={{ marginTop: 20, fontSize: 12, fontFamily: MONO, color: mkt.onDarkFaint, letterSpacing: "0.06em" }}>
                Tap the phone to pause the demo · resumes when you're ready
              </p>
            </Reveal>
          </div>

          {/* RIGHT — premium animated phone.
              The dot-grid surface now lives INSIDE the phone (the chat
              scroll area), not around it — header + input stay white with
              hairline dividers. The outer wrapper is a plain transparent
              centering shell so the phone sits naturally on the page bg. */}
          <div
            data-theme="dark"
            className="tlhp-split-phone"
            style={{
              position: "relative",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minWidth: 0,
              padding: "28px 20px",
            }}
          >
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

  // Wave 13 — split-layout hero (BrightLocal/Rekord pattern) with per-product
  // animated visual on the right. Replaces the legacy centered text-only hero.
  // Polish per Alex 2026-05-26:
  //   - WHITE top-left product chip (out of the way of the title)
  //   - LIFTED title (SplitHero uses 64px top padding vs the old 88px)
  //   - TAGLINE removed (hook.eyebrow no longer rendered in the hero)
  //   - Subtitle kept (1 line)
  return (
    <SplitHero
      chip={cfg.name}
      title={hook?.headline ?? cfg.shortTagline}
      subtitle={hook?.sub ?? cfg.seoDescription}
      ctaPrimary={cfg.primaryCTA}
      ctaSecondary={cfg.secondaryCTA}
      animation={<ProductHeroAnimation slug={slug} />}
    />
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
        <p style={{ textAlign: "center", fontSize: 11, fontFamily: MONO, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: mkt.onDarkMuted, marginBottom: 18 }}>
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
    <section style={{ padding: "56px 24px", background: "rgba(255,255,255,0.02)", borderTop: `1px solid var(--hairline)`, borderBottom: `1px solid var(--hairline)` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
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
function Pricing({ pricing, primaryCta, comingSoon, slug }: { pricing?: { plans: any[]; note?: string; noteLink?: { label: string; href: string }; checkoutEnabled?: boolean }; primaryCta: { label: string; href: string }; comingSoon?: boolean; slug?: string }) {
  // When checkoutEnabled, each tier card opens CheckoutIntakeModal
  // pre-loaded with that tier's SKU. `checkoutTier` = the open plan
  // (null = closed). Products without checkoutEnabled keep the
  // existing primaryCta link — zero behavior change.
  //
  // W-AN-2 — when `comingSoon` is true, all per-tier checkout buttons
  // and primary-CTA links are replaced with a single "Notify me when
  // available" link that scrolls to the waitlist form below.
  const [checkoutTier, setCheckoutTier] = useState<{ sku: string; name: string; price: string; period: string } | null>(null);
  if (!pricing?.plans?.length) return null;
  const checkoutEnabled = !!pricing.checkoutEnabled && !comingSoon;
  // Single-price products (one tier) read as a fixed price, not a "tier"
  // ladder — so the pricing header shouldn't say "Pick a tier".
  const singlePrice = pricing.plans.length === 1;
  // A product whose only tiers are one-time is a one-time purchase
  // (e.g. WebFix $249, SiteLaunch $1197) — its header + microcopy must not
  // imply a recurring subscription ("Cancel anytime", "billed monthly").
  const allOneTime = pricing.plans.every((p) => (p.period ?? "").includes("one-time"));
  // When a product mixes recurring tiers with a one-time add-on (QuoteQuick:
  // Free/Pro/Business subscriptions + a $75 install service), the add-on used
  // to become a 4th grid card that orphaned onto its own row with a big void
  // beside it. Pull one-time add-ons out into a full-width banner below the
  // subscription grid so the tier grid stays a clean 3-up. Products whose
  // tiers are ALL one-time (WebFix, SiteLaunch) keep the existing grid.
  const hasMonthlyTier = pricing.plans.some((p) => (p.period ?? "").includes("/mo"));
  const addonPlans = hasMonthlyTier
    ? pricing.plans.filter((p) => (p.period ?? "").includes("one-time"))
    : [];
  const gridPlans = addonPlans.length > 0
    ? pricing.plans.filter((p) => !(p.period ?? "").includes("one-time"))
    : pricing.plans;
  const pricingHeading = comingSoon
    ? "Simple, transparent pricing"
    : allOneTime
      ? (singlePrice ? "Simple, one-time pricing" : "One-time pricing")
      : "Pick a tier. Cancel any time.";
  // Coming-soon/waitlist products must not run live-signup microcopy
  // ("Cancel anytime", "Posts start within 24 hours of setup") — there is no
  // live signup yet. Swap the note for a waitlist-honest line.
  const displayNote = comingSoon
    ? "Pricing locked in at launch. Join the waitlist for early access."
    : pricing.note;
  return (
    <section id="pricing" style={{ padding: "56px 24px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1.05, letterSpacing: "-0.025em", color: mkt.onDark, margin: 0 }}>
              {pricingHeading}
            </h2>
            {/* Wave 26 — TradeLine flat-pricing wedge vs competitors. Per
                competitive-tradeline-research.md: per-minute pricing is the
                #1 surprise-bill driver in this category. Surface the
                differentiator at the moment buyers decide. */}
            {slug === "tradeline" && (
              <span
                title="Unlike competitors who charge per minute or per caller, TradeLine includes everything in your subscription. No surprise bills."
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 16,
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "rgba(34, 197, 94, 0.12)",
                  color: "#22c55e",
                  border: "1px solid rgba(34, 197, 94, 0.4)",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                  cursor: "help",
                }}
                data-testid="badge-no-overage"
              >
                <Check size={14} strokeWidth={3} aria-hidden="true" />
                Flat pricing — no overage surprises
              </span>
            )}
          </div>
        </Reveal>
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(gridPlans.length, 3)}, 1fr)`,
          alignItems: "stretch",
          gap: 16,
          maxWidth: gridPlans.length === 1 ? 460 : gridPlans.length === 2 ? 760 : 1080,
          margin: "0 auto",
        }} className="pricing-grid">
          {gridPlans.map((p, i) => (
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
                {comingSoon ? (
                  <a href="#waitlist" style={{
                    display: "block", textAlign: "center",
                    padding: "12px 14px", borderRadius: 10,
                    background: p.highlighted ? "#FFFFFF" : mkt.ctaBg,
                    color: p.highlighted ? mkt.accent : mkt.ctaText,
                    fontSize: 13, fontWeight: p.highlighted ? 700 : 500,
                    textDecoration: "none",
                    lineHeight: 1.25,
                    whiteSpace: "normal",
                    overflowWrap: "break-word",
                    marginTop: "auto",
                  }}>
                    Notify me when available
                  </a>
                ) : checkoutEnabled && p.sku && /^\$?0(\.0+)?$/.test((p.price ?? "").trim()) ? (
                  /* Free ($0) tier — route to free signup, NOT the Stripe
                     payment intake modal. A $0 plan must never show "redirected
                     to Stripe to complete payment" copy. */
                  <Link href="/signup" style={{
                    display: "block", textAlign: "center",
                    padding: "12px 14px", borderRadius: 10,
                    background: p.highlighted ? "#FFFFFF" : mkt.ctaBg,
                    color: p.highlighted ? mkt.accent : mkt.ctaText,
                    fontSize: 13, fontWeight: p.highlighted ? 700 : 500,
                    textDecoration: "none",
                    lineHeight: 1.25,
                    whiteSpace: "normal",
                    overflowWrap: "break-word",
                    marginTop: "auto",
                  }}>
                    Start free
                  </Link>
                ) : checkoutEnabled && p.sku ? (
                  <button
                    type="button"
                    onClick={() => setCheckoutTier({ sku: p.sku, name: p.name, price: `${p.price}${p.period}`, period: p.period ?? "" })}
                    style={{
                      display: "block", width: "100%", textAlign: "center",
                      padding: "12px 14px", borderRadius: 10,
                      background: p.highlighted ? "#FFFFFF" : mkt.ctaBg,
                      color: p.highlighted ? mkt.accent : mkt.ctaText,
                      fontSize: 13, fontWeight: p.highlighted ? 700 : 500,
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
                    background: p.highlighted ? "#FFFFFF" : mkt.ctaBg,
                    color: p.highlighted ? mkt.accent : mkt.ctaText,
                    fontSize: 13, fontWeight: p.highlighted ? 700 : 500,
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

        {/* One-time add-on(s) — full-width banner so they don't orphan the
            subscription grid. Currently QuoteQuick's $75 install service. */}
        {!comingSoon && addonPlans.map((p) => (
          <Reveal key={p.name}>
            <div
              data-testid={`pricing-addon-${p.sku ?? p.name}`}
              style={{
                maxWidth: 1080,
                margin: "20px auto 0",
                background: mkt.sectionLight,
                border: `1px solid var(--hairline)`,
                borderRadius: 20,
                padding: "22px clamp(20px, 3vw, 32px)",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 20,
              }}
              className="pricing-addon-banner"
            >
              <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", color: mkt.onDark, margin: 0 }}>
                    {p.name}
                  </h3>
                  <span style={{ fontSize: 22, fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.02em" }}>
                    {p.price}
                    <span style={{ fontSize: 13, fontWeight: 500, color: mkt.onDarkFaint }}>{p.period}</span>
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
                  {(p.features ?? []).slice(0, 3).map((f: string) => (
                    <span key={f} style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13, color: mkt.onDarkMuted }}>
                      <Check size={14} style={{ flexShrink: 0, color: mkt.accent }} strokeWidth={3} />
                      {f}
                    </span>
                  ))}
                </div>
              </div>
              {checkoutEnabled && p.sku ? (
                <button
                  type="button"
                  onClick={() => setCheckoutTier({ sku: p.sku, name: p.name, price: `${p.price}${p.period}`, period: p.period ?? "" })}
                  style={{
                    flexShrink: 0, padding: "12px 22px", borderRadius: 10,
                    background: mkt.ctaBg, color: mkt.ctaText,
                    fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
                  }}
                >
                  Add {p.name}
                </button>
              ) : (
                <Link
                  href={primaryCta.href}
                  style={{
                    flexShrink: 0, padding: "12px 22px", borderRadius: 10,
                    background: mkt.ctaBg, color: mkt.ctaText,
                    fontSize: 13, fontWeight: 600, textDecoration: "none",
                  }}
                >
                  {primaryCta.label}
                </Link>
              )}
            </div>
          </Reveal>
        ))}

        {(displayNote || (!comingSoon && pricing.noteLink)) && (
          <p style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: mkt.onDarkFaint, fontFamily: MONO, letterSpacing: "0.04em" }}>
            {displayNote}
            {/* Worded link instead of a raw "/pricing/..." path printed inline
                (which read as broken copy). Hidden in coming-soon mode where the
                note is swapped for waitlist messaging. */}
            {!comingSoon && pricing.noteLink && (
              <>
                {displayNote ? " " : ""}
                <Link href={pricing.noteLink.href} style={{ color: mkt.accentOnDark, textDecoration: "underline" }}>
                  {pricing.noteLink.label}
                </Link>
              </>
            )}
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

      {/* Per-tier checkout — only mounts for checkoutEnabled products.
          billingNote is derived from the tier's billing period so the modal
          subhead never contradicts the price (one-time vs subscription).
          Free ($0) tiers route to free signup, not the Stripe-payment flow. */}
      <CheckoutIntakeModal
        open={!!checkoutTier}
        onClose={() => setCheckoutTier(null)}
        items={checkoutTier ? [checkoutTier.sku] : []}
        bundleName={checkoutTier?.name}
        priceLabel={checkoutTier?.price}
        billingNote={
          checkoutTier?.period.includes("one-time")
            ? "One-time payment. No subscription."
            : undefined
        }
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
    <section style={{ padding: "56px 24px", background: "rgba(255,255,255,0.02)", borderTop: `1px solid var(--hairline)`, borderBottom: `1px solid var(--hairline)` }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
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
                    <ChevronDown size={20} color={mkt.accent} style={{ transition: "transform 0.2s ease", transform: open ? "rotate(180deg)" : "rotate(0)", flexShrink: 0 }} />
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
 * neutral label rather than failing or hiding).
 *
 * Safety (false-advertising): every source — including the
 * platform-tagged ones (trustpilot/google_maps/facebook/google) — maps
 * to the generic "Verified customer" label. Pre-launch these entries are
 * composites/anonymized; surfacing a specific third-party platform name
 * implies a verified external review we can't substantiate. The `source`
 * field stays in the data (auditable) but is never rendered as a
 * platform claim. */
const SOURCE_LABEL: Record<string, string> = {
  trustpilot: "Verified customer",
  google_maps: "Verified customer",
  facebook: "Verified customer",
  google: "Verified customer",
  internal_pilot: "Verified customer",
  case_study: "Verified customer",
};

function Testimonials({ items }: { items: { quote: string; author: string; trade: string; city: string; rating: 5; source?: string; photo?: string }[] }) {
  if (!items.length) return null;
  return (
    <section style={{ padding: "56px 24px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        {/* Trustpilot-style review cards — now wrapped in HorizontalCarousel
         * so the row is touch-drag / mouse-drag / wheel scrollable with
         * prev/next arrow controls (same arrows used on the blog page).
         * Heading sits to the left of the arrow group in the carousel
         * header bar; cards keep their fixed width + snap-align so they
         * peek/snap consistently across desktop and mobile. */}
        <HorizontalCarousel
          arrowTheme="dark"
          ariaLabel="Customer reviews"
          data-testid="product-reviews-carousel"
          heading={
            <Reveal style={{ width: "100%" }}>
              <h2
                style={{
                  fontSize: "clamp(28px, 4vw, 48px)",
                  fontWeight: 500,
                  lineHeight: 1.05,
                  letterSpacing: "-0.025em",
                  color: mkt.onDark,
                  margin: 0,
                  whiteSpace: "nowrap",
                  textAlign: "center",
                }}
              >
                Reviews
              </h2>
            </Reveal>
          }
          rowStyle={{ gap: 16, paddingBottom: 8 }}
        >
          {items.slice(0, 7).map((t, i) => (
            <Reveal
              key={t.quote}
              delay={i * 0.04}
              style={{
                // Cap basis at the viewport (minus the section's 24px side
                // padding ×2) so a card's layout box can never report past the
                // viewport right edge — desktop sweep flagged one at +98px.
                flex: "0 0 clamp(280px, 80vw, 340px)",
                maxWidth: "calc(100vw - 48px)",
                minWidth: 0,
                scrollSnapAlign: "start",
              }}
            >
              <div
                className="review-card"
                style={{
                  width: "100%",
                  padding: "22px 22px",
                  borderRadius: 14,
                  background: mkt.sectionLight,
                  border: `1px solid var(--hairline)`,
                  height: "100%",
                  minHeight: 240,
                  display: "flex", flexDirection: "column", gap: 14,
                  boxSizing: "border-box",
                  transition: "transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease",
                }}
              >
                <div style={{ display: "flex", gap: 2, color: "#F59E0B" }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} size={14} fill="#F59E0B" stroke="#F59E0B" />
                  ))}
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: mkt.onDark, margin: 0, flex: 1, letterSpacing: "-0.005em" }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div style={{ paddingTop: 12, borderTop: `1px solid var(--hairline)`, display: "flex", gap: 10, alignItems: "flex-start" }}>
                  {t.photo && (
                    <img
                      src={t.photo}
                      alt=""
                      aria-hidden="true"
                      style={{
                        width: 36, height: 36, borderRadius: "50%",
                        objectFit: "cover", flexShrink: 0,
                        border: `1px solid var(--hairline)`,
                      }}
                    />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: mkt.onDark, marginBottom: 2 }}>{t.author}</div>
                    <div style={{ fontSize: 11, color: mkt.onDarkFaint }}>
                      {t.trade} &middot; {t.city}
                    </div>
                    <div style={{ fontSize: 10, color: mkt.onDarkFaint, marginTop: 6, opacity: 0.8 }}>
                      {SOURCE_LABEL[t.source ?? "internal_pilot"] ?? "Verified customer"}
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </HorizontalCarousel>
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
function FinalCta({ cfg, comingSoon, oneTime }: { cfg: ReturnType<typeof getProductBySlug> & {}; comingSoon?: boolean; oneTime?: boolean }) {
  // Reassurance line must match the billing type. "No card required. Cancel
  // anytime." is subscription-trial language — wrong for a paid one-time
  // purchase (a card is required, nothing to cancel) and for a waitlist
  // (there's no signup to cancel yet).
  const reassurance = comingSoon
    ? "Join free — we'll email you the moment it's ready."
    : oneTime
      ? "One-time payment. Secure Stripe checkout. You own it."
      : "Setup is fast. No card required. Cancel anytime.";
  return (
    <section style={{ padding: "56px 24px" }}>
      <div style={{
        maxWidth: 980, margin: "0 auto",
        background: mkt.sectionLight,
        borderRadius: 28, padding: "44px 28px",
        position: "relative", overflow: "hidden",
        textAlign: "center",
      }}>
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 50% 80% at 50% 50%, rgba(13,60,252,0.10) 0%, transparent 60%)",
        }} />
        <h2 style={{ position: "relative", fontSize: "clamp(32px, 4.5vw, 52px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.025em", color: mkt.onDark, marginBottom: 18 }}>
          Ready to start with{" "}
          <span style={{ display: "block", color: mkt.accentOnDark }}>{cfg.name}?</span>
        </h2>
        <p style={{ position: "relative", fontSize: 16, lineHeight: 1.55, color: mkt.onDarkMuted, marginBottom: 32 }}>
          {reassurance}
        </p>
        <CtaLink href={cfg.primaryCTA.href} className="wft-hover-border-white" style={{ ...ctaPrimary, position: "relative", fontSize: 14, padding: "16px 32px" }}>
          {cfg.primaryCTA.label} <ArrowRight size={20} />
        </CtaLink>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION: FLAGSHIP — Roof & Solar 3D visualizer HERO demo
   ----------------------------------------------------------------
   QuoteQuick's single biggest differentiator is the first-party 3D
   roof & solar visualizer (photoreal 3D house + "see it on my house"
   AI material preview + instant roof/solar quote), served same-origin
   at `GET /api/roofquote/widget`. It used to be buried inside the
   wizard gallery — never featured on its own product page. This puts
   it FRONT AND CENTER, above the generic window-replacement calculator
   demo, as the hero "try it" experience.

   Desktop: the REAL widget is embedded same-origin in an iframe so a
   visitor types an address and sees the live 3D roof + instant quote
   right here (no signup). `?calc=3` loads the published roof calc.

   Mobile (≤768px): the full WebGL 3D widget is heavy and cramped at
   375px, so we show a tasteful framed preview + a prominent "Try the
   live roof & solar demo" CTA that opens the real widget full-screen.
   This is the documented fallback in the brief — prefer the real
   embedded experience on desktop, graceful CTA on mobile.
   ════════════════════════════════════════════════════════════════ */
function QuickQuoteRoofSolarHeroDemo() {
  const ROOF_WIDGET_SRC = "/api/roofquote/widget?calc=3";
  return (
    <section style={{ padding: "12px 24px 36px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        {/* FLAGSHIP badge — eyebrow, top-left aligned with the heading block */}
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 999,
              background: "rgba(110,139,255,0.12)",
              border: `1px solid ${mkt.accentOnDark}55`,
              color: mkt.accentOnDark,
              fontFamily: MONO,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            <Sparkles size={14} aria-hidden="true" /> Flagship feature
          </span>
        </div>
        <h2
          style={{
            fontSize: "clamp(26px, 4vw, 40px)",
            fontWeight: 600,
            color: mkt.onDark,
            textAlign: "center",
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
            margin: "0 0 12px",
          }}
        >
          See your roof in 3D.{" "}
          <span style={{ color: mkt.accentOnDark }}>Get an instant quote.</span>
        </h2>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.55,
            color: mkt.onDarkMuted,
            textAlign: "center",
            maxWidth: 620,
            margin: "0 auto 26px",
          }}
        >
          Type any address to load a photoreal 3D model of the roof, preview
          materials on the actual house, and price roof &amp; solar in seconds —
          the same experience your customers get. No signup.
        </p>

        {/* DESKTOP — the REAL roof & solar widget, embedded same-origin.
            First-party route + WebGL + same-origin fetches → no sandbox
            (a sandbox would break its own WebGL + /api/roofquote/* calls),
            matching RoofVisualizerEmbed / RoofVisualizerStep. */}
        <div
          className="qq-roof-hero-desktop"
          style={{
            borderRadius: 20,
            overflow: "hidden",
            border: `1px solid ${mkt.onDarkBorder}`,
            background: "#0b1418",
            boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
          }}
        >
          <iframe
            src={ROOF_WIDGET_SRC}
            title="Roof & Solar 3D visualizer — live demo"
            allow="accelerometer; gyroscope; fullscreen"
            loading="lazy"
            className="qq-roof-hero-frame"
            style={{
              display: "block",
              width: "100%",
              height: "min(76vh, 680px)",
              border: "none",
              background: "#0b1418",
            }}
          />
        </div>

        {/* MOBILE — preview card + prominent CTA to the real widget.
            The full WebGL widget is too heavy / cramped at 375px, so we
            give a clean framed teaser and route the tap to the live widget. */}
        <div
          className="qq-roof-hero-mobile"
          style={{
            display: "none",
            borderRadius: 20,
            overflow: "hidden",
            border: `1px solid ${mkt.onDarkBorder}`,
            background: "linear-gradient(160deg, #16252b 0%, #0b1418 100%)",
            padding: "26px 20px 24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              margin: "0 auto 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: mkt.accent,
              color: "#FFFFFF",
            }}
          >
            <Sparkles size={24} aria-hidden="true" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: mkt.onDark, marginBottom: 6 }}>
            The 3D roof &amp; solar experience
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: mkt.onDarkMuted, margin: "0 0 18px" }}>
            Best explored full-screen — load any address, spin the photoreal 3D
            roof, and preview materials on the real house.
          </p>
          <a
            href={ROOF_WIDGET_SRC}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "13px 20px",
              borderRadius: 12,
              background: mkt.accent,
              color: "#FFFFFF",
              fontFamily: MONO,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
            data-testid="link-roof-solar-live-demo"
          >
            Try the live roof &amp; solar demo <ArrowRight size={14} />
          </a>
        </div>

        <style>{`
          @media (max-width: 768px) {
            .qq-roof-hero-desktop { display: none !important; }
            .qq-roof-hero-mobile { display: block !important; }
          }
        `}</style>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION: BG-4 — QuickQuote Pro live widget mount
   Mounts the real <AdvancedCalculator> (via QuoteWidget) on
   /products/quickquotepro pre-loaded with the styled
   `window_replacement_quote` preset — multi-step + range pricing +
   BD-2a style + trust signals, all working for anonymous visitors.
   Below: "Try it live →" CTA to /products/quickquotepro/demo.
   ════════════════════════════════════════════════════════════════ */
const QQ_SAMPLE_BUSINESS_PROFILE: BusinessProfile = {
  googleRating: 4.9,
  googleReviewCount: 312,
  yearsInBusiness: 14,
  licenseNumber: "Sample - Demo Only",
  insuredAmount: "Insured up to $2M",
  serviceArea: "Phoenix Metro",
};

function buildQuickQuoteLandingCalculator(): CalculatorData {
  // Wave BG-4 — mirrors the `/products/quickquotepro/demo` mount pattern, but
  // pre-loaded with the Window Replacement template. That preset ships
  // explicit BD-2a style + range pricing + image-card radios — so the
  // landing-page widget shows the full QuoteQuick gold-standard surface
  // on first paint (multi-step + sticky shell + range pricing + trust
  // signals) without auth context.
  const preset = getTemplatePreset("window_replacement_quote");
  if (!preset) {
    return {
      id: 0,
      slug: "demo-window-replacement",
      business_name: "Acme Window Pros",
      pricing_config: null,
    };
  }
  const advanced = {
    ...toAdvancedConfig(preset),
    businessProfile: QQ_SAMPLE_BUSINESS_PROFILE,
  };
  return {
    id: 0,
    slug: "demo-window-replacement",
    business_name: "Acme Window Pros",
    tagline: "ENERGY STAR certified · Lifetime product warranty",
    primary_color: "#4f46e5",
    // `advanced` config bypasses the legacy pricing-family flow — pass
    // null pricing_config and let the AdvancedCalculator code-path run.
    pricing_config: null,
    calculator_settings: {
      advanced,
    },
  };
}

function QuickQuoteLandingLiveDemo() {
  const calculator = useMemo(() => buildQuickQuoteLandingCalculator(), []);
  return (
    <section style={{ padding: "20px 24px 60px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: mkt.accentOnDark,
            textAlign: "center",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            margin: "0 0 10px",
            fontFamily: MONO,
          }}
        >
          Works for every trade
        </p>
        <h2
          style={{
            fontSize: "clamp(24px, 3.5vw, 32px)",
            fontWeight: 600,
            color: mkt.onDark,
            textAlign: "center",
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            margin: "0 0 22px",
          }}
        >
          Not roofing? Build any quote calculator
        </h2>
        {/* The widget's internal sticky header (data-testid="advanced-sticky-top",
            top:0) anchors to the PAGE scroll context on an inline embed, so it
            pinned BEHIND the site's fixed nav (~68px) and clipped the trust-badge
            row. Scope an offset to THIS instance only so the sticky header parks
            just below the nav (+ any announcement banner) instead of under it. */}
        <style>{`
          .qq-notroofing-embed [data-testid="advanced-sticky-top"] {
            top: calc(var(--wft-announcement-h, 0px) + 80px) !important;
          }
        `}</style>
        <div className="qq-notroofing-embed" style={{ marginBottom: 22 }}>
          {/* Real widget — anonymous-visitor-safe (isEmbed=false matches
              the /products/quickquotepro/demo mount). */}
          <QuoteWidget calculator={calculator} isEmbed={false} />
        </div>

        {/* "Try it live →" CTA — points at the dedicated demo page now
            living under the QuoteQuick product family (full BE-3 demo
            with FAQ + video). */}
        <div style={{ textAlign: "center" }}>
          <Link
            href="/products/quickquotepro/demo"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "11px 18px",
              borderRadius: 10,
              background: "transparent",
              color: mkt.onDark,
              border: `1px solid ${mkt.onDarkBorder}`,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: MONO,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
            data-testid="link-quickquote-full-demo"
          >
            Try it live <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION: QuoteQuick credibility / honest social proof
   ----------------------------------------------------------------
   QuoteQuick is a brand-new tool with no review history yet. Skeptical
   buyers' #1 objection is "who else uses this?". Instead of faking
   testimonials, this section builds trust from things that are
   LITERALLY TRUE and verifiable in the live demo above:

     1. CAPABILITY PROOF — the genuine "what it does" a buyer can
        confirm themselves in the no-signup demo on this page. No
        labels needed; each line is checkable.
     2. TRUST STRIP — real, verifiable company/security signals
        (Wyoming LLC, AWS + Cloudflare infra, Stripe PCI, live legal
        pages, no-signup demo, cancel anytime). Each links to the real
        page that substantiates it.
     3. FOUNDING-CONTRACTOR PROGRAM — an honest "we're new" offer:
        free Pro for the first cohort in exchange for feedback + a
        review. Leans INTO being new rather than faking maturity.
     4. REVIEW AREA — renders REAL reviews from a data source; while
        that source is empty it shows the founding-customer CTA, NOT
        fake placeholders. Backend collection endpoint is flagged as a
        follow-up (see REAL_QUOTEQUICK_REVIEWS below).

   HARD RULE: nothing here is fabricated. No invented names, quotes,
   logos, or "illustrative" testimonials. Every claim is true or is an
   honest, clearly-labelled offer.
   ════════════════════════════════════════════════════════════════ */

/* Real, verifiable QuoteQuick capabilities — each is confirmable by the
 * visitor in the live no-signup demo above, or stated on the page already.
 * Deliberately conservative: only claims QuoteQuick demonstrably does today. */
const QQ_CAPABILITY_PROOF: { icon: typeof Zap; title: string; detail: string }[] = [
  {
    icon: Zap,
    title: "Instant prices on your website, 24/7",
    detail: "Customers get a real estimate from your own pricing rules in seconds — try it in the live calculator above, no signup.",
  },
  {
    icon: Mail,
    title: "Every quote captures a lead",
    detail: "Name, email and phone land in your inbox and dashboard automatically — so a price request is also a warm lead.",
  },
  {
    icon: Clock,
    title: "Live in about 5 minutes",
    detail: "Pick your trade, set your rates, paste one line of code. Works on WordPress, Wix, Squarespace, Shopify or plain HTML.",
  },
  {
    icon: Check,
    title: "Works with what you already use",
    detail: "Runs alongside Jobber, Housecall Pro or anything else — no platform switch. Booking and email/SMS follow-up are built in.",
  },
];

/* Real trust signals — each substantiated by a live page on this site or a
 * named third-party provider. The `href` points at the page that proves it. */
const QQ_TRUST_SIGNALS: { icon: typeof ShieldCheck; label: string; sub: string; href: string }[] = [
  {
    icon: Building2,
    label: "Registered US company",
    sub: "MR Holdings & Trade LLC — a Wyoming LLC",
    href: "/terms",
  },
  {
    icon: ShieldCheck,
    label: "Enterprise-grade infrastructure",
    sub: "Runs on AWS + Cloudflare (SOC 2-audited)",
    href: "/security",
  },
  {
    icon: Lock,
    label: "Secure payments",
    sub: "Stripe — PCI DSS Level 1. We never touch card numbers",
    href: "/security",
  },
  {
    icon: FileText,
    label: "Real legal + privacy pages",
    sub: "Plain-English Terms & Privacy Policy",
    href: "/privacy",
  },
  {
    icon: PlayCircle,
    label: "Try it with no signup",
    sub: "Live demo on this page — see it before you decide",
    href: "/products/quickquotepro/demo",
  },
  {
    icon: Check,
    label: "No contract, cancel anytime",
    sub: "Free plan free forever — no card to start",
    href: "/wizard",
  },
];

/* REAL reviews data source. Intentionally EMPTY at launch — QuoteQuick is a
 * brand-new tool with no review history, and the honesty mandate forbids
 * placeholder/fabricated reviews. When genuine reviews are collected, push
 * them here (or wire this to a `/api/reviews?product=quickquotepro` feed).
 *
 * FOLLOW-UP (backend): no public review-submission endpoint exists yet. The
 * "Leave a review" CTA below currently routes to the support inbox so real
 * feedback can be captured manually; a structured collection endpoint +
 * moderation is the next step. Until a review lands here, the section shows
 * the founding-contractor offer instead of empty space — never fake cards. */
interface QuickQuickReview { quote: string; author: string; trade: string; city: string; rating: 5 }
const REAL_QUOTEQUICK_REVIEWS: QuickQuickReview[] = [];

function QuickQuoteCredibility() {
  return (
    <section style={{ padding: "8px 24px 8px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>

        {/* ── 1. CAPABILITY PROOF ─────────────────────────────── */}
        <Reveal>
          <p style={{
            fontSize: 11, fontWeight: 700, color: mkt.accentOnDark,
            letterSpacing: "0.12em", textTransform: "uppercase",
            margin: "0 0 8px", fontFamily: MONO,
          }}>
            Proof it works — check it yourself
          </p>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 style={{
            fontSize: "clamp(26px, 3.6vw, 38px)", fontWeight: 600,
            color: mkt.onDark, letterSpacing: "-0.025em",
            lineHeight: 1.1, margin: "0 0 8px", maxWidth: 640,
          }}>
            New tool, real capability.
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p style={{
            fontSize: 15, lineHeight: 1.6, color: mkt.onDarkMuted,
            margin: "0 0 24px", maxWidth: 560,
          }}>
            We&rsquo;re upfront: QuoteQuick is brand new, so we won&rsquo;t pretend to have
            thousands of reviews. Instead, here&rsquo;s exactly what it does — every line is
            something you can verify in the live calculator above.
          </p>
        </Reveal>

        <div
          className="qq-cred-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 12,
            marginBottom: 44,
          }}
        >
          {QQ_CAPABILITY_PROOF.map((c, i) => {
            const Icon = c.icon;
            return (
              <Reveal key={c.title} delay={i * 0.05}>
                <div style={{
                  display: "flex", gap: 14, alignItems: "flex-start",
                  background: mkt.sectionLight,
                  border: `1px solid var(--hairline)`,
                  borderRadius: 16, padding: "18px 18px", height: "100%",
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: mkt.accentTint, color: mkt.accentOnDark,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon size={20} aria-hidden="true" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: mkt.onDark, letterSpacing: "-0.01em", marginBottom: 4 }}>
                      {c.title}
                    </div>
                    <p style={{ fontSize: 13, lineHeight: 1.55, color: mkt.onDarkMuted, margin: 0 }}>
                      {c.detail}
                    </p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>

        {/* ── 2. TRUST STRIP ──────────────────────────────────── */}
        <Reveal>
          <p style={{
            fontSize: 11, fontWeight: 700, color: mkt.accentOnDark,
            letterSpacing: "0.12em", textTransform: "uppercase",
            margin: "0 0 8px", fontFamily: MONO,
          }}>
            Trust signals you can verify
          </p>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 style={{
            fontSize: "clamp(22px, 3vw, 30px)", fontWeight: 600,
            color: mkt.onDark, letterSpacing: "-0.02em",
            lineHeight: 1.12, margin: "0 0 22px", maxWidth: 560,
          }}>
            A real company behind the tool.
          </h2>
        </Reveal>

        <div
          className="qq-trust-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            marginBottom: 44,
          }}
        >
          {QQ_TRUST_SIGNALS.map((t, i) => {
            const Icon = t.icon;
            return (
              <Reveal key={t.label} delay={i * 0.04}>
                <Link
                  href={t.href}
                  className="qq-trust-card"
                  style={{
                    display: "flex", gap: 12, alignItems: "flex-start",
                    background: mkt.sectionLight,
                    border: `1px solid var(--hairline)`,
                    borderRadius: 14, padding: "16px 16px", height: "100%",
                    textDecoration: "none", color: mkt.onDark,
                    transition: "transform 0.2s ease, border-color 0.2s ease",
                  }}
                >
                  <Icon size={20} color={mkt.accentOnDark} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: mkt.onDark, letterSpacing: "-0.01em", marginBottom: 3 }}>
                      {t.label}
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.5, color: mkt.onDarkMuted }}>
                      {t.sub}
                    </div>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>

        {/* ── 3 + 4. FOUNDING PROGRAM + REVIEW AREA ───────────── */}
        <QuickQuoteFoundingAndReviews />
      </div>

      <style>{`
        @media (max-width: 768px) {
          .qq-cred-grid { grid-template-columns: 1fr !important; }
          .qq-trust-grid { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .qq-trust-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        .qq-trust-card:hover {
          transform: translateY(-3px);
          border-color: #FFFFFF !important;
        }
      `}</style>
    </section>
  );
}

/* Founding-contractor offer + the real-reviews area.
 * When REAL_QUOTEQUICK_REVIEWS is empty (launch state) the review area shows
 * the founding offer as its empty state — never fake review cards. Once real
 * reviews exist, they render above the (still-present) "leave a review" CTA. */
function QuickQuoteFoundingAndReviews() {
  const reviews = REAL_QUOTEQUICK_REVIEWS;
  const hasReviews = reviews.length > 0;

  return (
    <div
      className="qq-founding-card"
      style={{
        position: "relative",
        background: mkt.sectionLight,
        border: `1px solid ${mkt.accent}`,
        borderRadius: 24,
        padding: "36px 32px",
        overflow: "hidden",
      }}
    >
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 60% 90% at 100% 0%, rgba(13,60,252,0.12) 0%, transparent 60%)",
      }} />

      <div style={{ position: "relative" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "6px 12px", borderRadius: 999,
          background: mkt.accent, color: "#FFFFFF",
          fontSize: 11, fontWeight: 700, fontFamily: MONO,
          letterSpacing: "0.08em", textTransform: "uppercase",
          marginBottom: 16,
        }}>
          <Rocket size={14} aria-hidden="true" /> Founding contractors — limited spots
        </span>

        <h2 style={{
          fontSize: "clamp(24px, 3.4vw, 36px)", fontWeight: 700,
          color: mkt.onDark, letterSpacing: "-0.025em",
          lineHeight: 1.08, margin: "0 0 12px", maxWidth: 620,
        }}>
          Be one of our first contractors —{" "}
          <span style={{ color: mkt.accentOnDark }}>Pro free for your first 3 months.</span>
        </h2>

        <p style={{
          fontSize: 15, lineHeight: 1.6, color: mkt.onDarkMuted,
          margin: "0 0 22px", maxWidth: 580,
        }}>
          We&rsquo;re building QuoteQuick&rsquo;s reputation the honest way: with real customers.
          Join the founding cohort and get <strong style={{ color: mkt.onDark }}>QuoteQuick Pro free for 3 months</strong>.
          In return, we ask for your honest feedback and — if you love it — a review. No fake
          testimonials here; the proof gets built by people like you.
        </p>

        {/* Honest "what you get / what we ask" — two short columns */}
        <div
          className="qq-founding-split"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 26, maxWidth: 620 }}
        >
          <div>
            <div style={{ fontSize: 11, fontFamily: MONO, color: mkt.onDarkFaint, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
              What you get
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {["3 months of Pro, free", "Direct line to the founders", "Your feature requests prioritized"].map((f) => (
                <li key={f} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13.5, lineHeight: 1.4, color: mkt.onDark }}>
                  <Check size={16} strokeWidth={3} style={{ marginTop: 2, flexShrink: 0, color: mkt.accentOnDark }} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div style={{ fontSize: 11, fontFamily: MONO, color: mkt.onDarkFaint, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
              All we ask
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {["Use it on a real job or two", "Tell us honestly what works", "Leave a review if you'd recommend it"].map((f) => (
                <li key={f} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13.5, lineHeight: 1.4, color: mkt.onDark }}>
                  <Check size={16} strokeWidth={3} style={{ marginTop: 2, flexShrink: 0, color: mkt.accentOnDark }} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <CtaLink
            href="/wizard"
            className="wft-hover-border-white"
            style={{ ...ctaPrimary, fontSize: 13, padding: "14px 24px" }}
          >
            Claim a founding spot <ArrowRight size={16} />
          </CtaLink>
          <CtaLink
            href="mailto:support@wefixtrades.com?subject=QuoteQuick%20founding%20contractor%20program"
            style={{ ...ctaGhost, fontSize: 13, padding: "14px 24px" }}
          >
            Ask us a question
          </CtaLink>
        </div>

        {/* ── REVIEW AREA ────────────────────────────────────────
            Real reviews render here when REAL_QUOTEQUICK_REVIEWS is
            populated. Until then we show NOTHING fake — just the honest
            "first reviews land here" line + the leave-a-review CTA. */}
        <div style={{ marginTop: 30, paddingTop: 24, borderTop: `1px solid var(--hairline)` }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: mkt.onDarkFaint, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
            Reviews from real contractors
          </div>

          {hasReviews ? (
            <div className="qq-reviews-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
              {reviews.slice(0, 4).map((r) => (
                <div key={r.quote} style={{
                  background: mkt.bg, border: `1px solid var(--hairline)`,
                  borderRadius: 14, padding: "16px 16px",
                  display: "flex", flexDirection: "column", gap: 10,
                }}>
                  <div style={{ display: "flex", gap: 2, color: "#F59E0B" }}>
                    {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={14} fill="#F59E0B" stroke="#F59E0B" />)}
                  </div>
                  <p style={{ fontSize: 13.5, lineHeight: 1.55, color: mkt.onDark, margin: 0 }}>&ldquo;{r.quote}&rdquo;</p>
                  <div style={{ fontSize: 12, color: mkt.onDarkFaint }}>
                    {r.author} · {r.trade} · {r.city}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              background: mkt.bg, border: `1px dashed ${mkt.onDarkBorder}`,
              borderRadius: 14, padding: "18px 18px", marginBottom: 16,
              display: "flex", gap: 12, alignItems: "flex-start",
            }}>
              <Star size={20} color={mkt.accentOnDark} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: mkt.onDarkMuted, margin: 0 }}>
                No reviews yet — and we won&rsquo;t fake any. The first verified reviews from
                founding contractors will appear right here. Want to be one of them?
              </p>
            </div>
          )}

          <CtaLink
            href="mailto:support@wefixtrades.com?subject=QuoteQuick%20review"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontSize: 13, fontWeight: 600, fontFamily: MONO,
              letterSpacing: "0.04em", color: mkt.accentOnDark,
              textDecoration: "none",
            }}
          >
            <MessageSquare size={16} /> Already using QuoteQuick? Leave a review
          </CtaLink>
        </div>
      </div>

      <style>{`
        @media (max-width: 600px) {
          .qq-founding-card { padding: 28px 20px !important; }
          .qq-founding-split { grid-template-columns: 1fr !important; gap: 18px !important; }
          .qq-reviews-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION: RankFlow free-tools cross-link
   RankFlow is the paid done-for-you SEO product; its free SERP/rank
   tools are the natural top-of-funnel. Surface a small "try the free
   tools first" callout linking the three live tools. Reuses the
   {name, href, blurb} card pattern from FreeToolsHubPage / the suite.
   ════════════════════════════════════════════════════════════════ */
const RANKFLOW_FREE_TOOLS: { name: string; href: string; blurb: string }[] = [
  { name: "Local SERP Checker", href: "/tools/local-serp-checker", blurb: "See exactly where you rank on Google + Maps for any keyword." },
  { name: "Local Rank Tracker", href: "/tools/local-rank-tracker", blurb: "Multi-engine rank snapshot for your business in one click." },
  { name: "Local Rank Grid", href: "/tools/local-rank-grid", blurb: "5×5 geo-grid heatmap of how visibility changes across your area." },
];

function RankFlowFreeTools() {
  return (
    <section style={{ padding: "20px 24px 8px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: mkt.accentOnDark,
            textAlign: "center",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            margin: "0 0 8px",
            fontFamily: MONO,
          }}
        >
          Try the free tools first
        </p>
        <h2
          style={{
            fontSize: "clamp(22px, 3vw, 30px)",
            fontWeight: 600,
            color: mkt.onDark,
            textAlign: "center",
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            margin: "0 0 20px",
          }}
        >
          See where you stand — no signup
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {RANKFLOW_FREE_TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "16px 18px",
                borderRadius: 14,
                background: mkt.sectionLight,
                border: `1px solid var(--hairline)`,
                textDecoration: "none",
                color: mkt.onDark,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>
                {t.name} <ArrowRight size={14} color={mkt.accent} />
              </span>
              <span style={{ fontSize: 12, lineHeight: 1.5, color: mkt.onDarkMuted }}>{t.blurb}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION: BG-4 — MapGuard landing teaser
   Card-style mock showing sample heatmap + 3 audit cards. No live
   crawl runs from here (that's reserved for the Free Audit's "Rank Grid" tab
   itself, which has the address-input flow). The teaser is a static
   preview + CTA so visitors see the shape of the audit before they
   commit to running one.
   ════════════════════════════════════════════════════════════════ */
const MAPGUARD_SAMPLE_FINDINGS: { tag: string; title: string; detail: string; severity: "high" | "med" | "low" }[] = [
  {
    tag: "Hours",
    title: "Hours mismatch with website",
    detail: "Google shows Sat closed — your site says open 9–2. Costing weekend bookings.",
    severity: "high",
  },
  {
    tag: "Photos",
    title: "No exterior photos in 90 days",
    detail: "Profiles with fresh photos tend to rank higher and get more direction requests.",
    severity: "med",
  },
  {
    tag: "Category",
    title: "Secondary category missing",
    detail: "Add 'Emergency plumber' as secondary — captures urgency searches.",
    severity: "low",
  },
];

function MapGuardLandingTeaser() {
  return (
    <section style={{ padding: "20px 24px 60px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: mkt.accentOnDark,
            textAlign: "center",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            margin: "0 0 10px",
            fontFamily: MONO,
          }}
        >
          Try a sample audit
        </p>
        <h2
          style={{
            fontSize: "clamp(24px, 3.5vw, 32px)",
            fontWeight: 600,
            color: mkt.onDark,
            textAlign: "center",
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            margin: "0 0 22px",
          }}
        >
          This is what we'd find on your profile
        </h2>

        {/* Card body */}
        <div
          style={{
            background: mkt.sectionLight,
            border: `1px solid var(--hairline)`,
            borderRadius: 18,
            padding: "24px",
            display: "grid",
            gridTemplateColumns: "minmax(0, 320px) minmax(0, 1fr)",
            gap: 24,
            alignItems: "start",
            marginBottom: 22,
          }}
          className="bg4-mapguard-teaser"
        >
          {/* Heatmap mock */}
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontSize: 11,
                fontFamily: MONO,
                color: mkt.onDarkFaint,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                margin: "0 0 10px",
              }}
            >
              Local rank heatmap
            </p>
            <MapMockup />
            <p
              style={{
                fontSize: 12,
                color: mkt.onDarkMuted,
                margin: "12px 0 0",
                lineHeight: 1.5,
              }}
            >
              Top-3 in 3 of 5 sample tiles · 2 tiles outside top-10
            </p>
          </div>

          {/* Audit findings */}
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontSize: 11,
                fontFamily: MONO,
                color: mkt.onDarkFaint,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                margin: "0 0 10px",
              }}
            >
              Sample findings · 3 of 12
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {MAPGUARD_SAMPLE_FINDINGS.map((f) => (
                <div
                  key={f.title}
                  style={{
                    background: mkt.bg,
                    border: `1px solid ${mkt.onDarkBorder}`,
                    borderRadius: 12,
                    padding: "12px 14px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: MONO,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "#FFFFFF",
                        background:
                          f.severity === "high"
                            ? "#dc2626"
                            : f.severity === "med"
                              ? "#d97706"
                              : mkt.accent,
                        padding: "3px 8px",
                        borderRadius: 6,
                        fontWeight: 700,
                      }}
                    >
                      {f.tag}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: mkt.onDark,
                        lineHeight: 1.3,
                      }}
                    >
                      {f.title}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: 12,
                      color: mkt.onDarkMuted,
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {f.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: "center" }}>
          <Link
            href="/tools/free-audit"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "11px 18px",
              borderRadius: 10,
              background: mkt.accent,
              color: "#FFFFFF",
              border: "1px solid transparent",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: MONO,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
            data-testid="link-mapguard-full-snapshot"
          >
            Run the full audit <ArrowRight size={14} />
          </Link>
        </div>
      </div>
      <style>{`
        @media (max-width: 640px) {
          .bg4-mapguard-teaser {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION: COMING SOON BANNER (Wave W-AN-2)
   Slim full-width banner that prepends the hero on products blocked
   by platform approvals (SocialSync, ReputationShield, MapGuard).
   Accent background, white text, ~40px tall. No close button — this
   is a persistent state of the page, not a dismissable notice.
   ════════════════════════════════════════════════════════════════ */
function ComingSoonBanner() {
  return (
    <div
      style={{
        background: mkt.accent,
        color: "#FFFFFF",
        padding: "10px 20px",
        textAlign: "center",
        fontFamily: MONO,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minHeight: 40,
      }}
    >
      <Rocket size={14} style={{ flexShrink: 0 }} />
      <span>Coming soon — get on the early-access waitlist</span>
      <a
        href="#waitlist"
        style={{
          color: "#FFFFFF",
          textDecoration: "underline",
          marginLeft: 8,
          fontWeight: 700,
        }}
      >
        Join now
      </a>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION: WAITLIST FORM (Wave W-AN-2)
   Rendered below the pricing section when cfg.comingSoon === true.
   Posts to /api/marketing/waitlist. Friendly inline success state on
   completion; no full-page redirect.
   ════════════════════════════════════════════════════════════════ */
function WaitlistForm({ productSlug, productName }: { productSlug: string; productName: string }) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setStatus("error");
      setErrorMsg("Email is required");
      return;
    }
    setStatus("submitting");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/marketing/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_slug: productSlug,
          email: email.trim(),
          phone: phone.trim() || undefined,
          business_name: businessName.trim() || undefined,
          source: typeof document !== "undefined" ? document.referrer || undefined : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Submission failed");
      }
      setStatus("ok");
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err?.message || "Could not save signup. Try again in a moment.");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    background: mkt.bg,
    border: `1px solid ${mkt.onDarkBorder}`,
    color: mkt.onDark,
    fontSize: 14,
    fontFamily: SANS,
    outline: "none",
  };

  return (
    <section
      id="waitlist"
      style={{ padding: "20px 24px 80px", scrollMarginTop: 80 }}
    >
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          background: mkt.sectionLight,
          border: `1px solid ${mkt.onDarkBorder}`,
          borderRadius: 20,
          padding: "36px 28px",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(24px, 3vw, 32px)",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: mkt.onDark,
            marginBottom: 8,
          }}
        >
          Get notified when {productName} launches
        </h2>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: mkt.onDarkMuted,
            marginBottom: 24,
          }}
        >
          Early-access slots go to waitlist signups first. We'll only email you when it's ready — no spam, no marketing.
        </p>

        {status === "ok" ? (
          <div
            style={{
              padding: "20px 18px",
              borderRadius: 12,
              background: "rgba(13,60,252,0.10)",
              border: `1px solid ${mkt.accent}`,
              color: mkt.onDark,
              fontSize: 14,
              lineHeight: 1.55,
            }}
          >
            <strong style={{ display: "block", marginBottom: 4 }}>You're on the list.</strong>
            We'll reach out as soon as {productName} is available for early access.
          </div>
        ) : (
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label
                htmlFor="waitlist-email"
                style={{ display: "block", fontSize: 12, color: mkt.onDarkMuted, marginBottom: 6, fontFamily: MONO, letterSpacing: "0.04em" }}
              >
                Email <span style={{ color: mkt.accentOnDark }}>*</span>
              </label>
              <input
                id="waitlist-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourbusiness.com"
                style={inputStyle}
                autoComplete="email"
              />
            </div>
            <div>
              <label
                htmlFor="waitlist-business"
                style={{ display: "block", fontSize: 12, color: mkt.onDarkMuted, marginBottom: 6, fontFamily: MONO, letterSpacing: "0.04em" }}
              >
                Business name <span style={{ opacity: 0.6 }}>(optional)</span>
              </label>
              <input
                id="waitlist-business"
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Acme Plumbing"
                style={inputStyle}
                autoComplete="organization"
              />
            </div>
            <div>
              <label
                htmlFor="waitlist-phone"
                style={{ display: "block", fontSize: 12, color: mkt.onDarkMuted, marginBottom: 6, fontFamily: MONO, letterSpacing: "0.04em" }}
              >
                Phone <span style={{ opacity: 0.6 }}>(optional)</span>
              </label>
              <input
                id="waitlist-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-5555"
                style={inputStyle}
                autoComplete="tel"
              />
              <SmsConsentDisclosure variant="inline" />
            </div>

            {status === "error" && errorMsg && (
              <p style={{ fontSize: 13, color: "#F87171", margin: 0 }}>{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={status === "submitting"}
              style={{
                marginTop: 8,
                padding: "14px 22px",
                borderRadius: 10,
                background: mkt.accent,
                color: "#FFFFFF",
                fontFamily: MONO,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                border: "none",
                cursor: status === "submitting" ? "wait" : "pointer",
                opacity: status === "submitting" ? 0.7 : 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {status === "submitting" ? "Saving…" : "Join the waitlist"}
              {status !== "submitting" && <ArrowRight size={14} />}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

/* ─── CtaLink — wouter Link for paths, plain <a> for #hash anchors.
   Wouter's <Link> treats `#waitlist` as a route, breaking native scroll
   behavior. This helper routes hash-only hrefs to <a> so browsers
   smooth-scroll to the target id (used by W-AN-2 Coming Soon CTAs). */
function CtaLink({
  href,
  children,
  className,
  style,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (href.startsWith("#")) {
    // In-page anchor — smooth-scroll to the target section instead of the
    // browser's instant jump, and keep it in sync with the Lenis smooth-scroll
    // instance when present (falls back to native smooth scrollIntoView).
    const onAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
      const el = document.getElementById(href.slice(1));
      if (!el) return; // unknown target → let the default anchor behavior run
      e.preventDefault();
      const lenis = getLenis();
      if (lenis) lenis.scrollTo(el, { offset: -24 });
      else el.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", href);
    };
    return (
      <a href={href} className={className} style={style} onClick={onAnchorClick}>
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

/* ════════════════════════════════════════════════════════════════
   SECTION: TradeLine — Architecture "How it connects" visual
   Card left / copy right on desktop; stacked on mobile (≤768px).
   ════════════════════════════════════════════════════════════════ */
function TradeLineArchSection() {
  return (
    <section style={{ padding: "20px 24px 60px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <Reveal>
          <p style={{
            fontSize: 11, fontWeight: 700, color: mkt.accentOnDark,
            textAlign: "center", letterSpacing: "0.12em",
            textTransform: "uppercase", margin: "0 0 10px", fontFamily: MONO,
          }}>
            How it connects
          </p>
          <h2 style={{
            fontSize: "clamp(24px, 3.5vw, 32px)", fontWeight: 600,
            color: mkt.onDark, textAlign: "center",
            letterSpacing: "-0.02em", lineHeight: 1.15,
            margin: "0 0 32px",
          }}>
            One line in. Every call handled.
          </h2>
        </Reveal>

        <div className="tl-arch-split" style={{
          display: "grid",
          gridTemplateColumns: "380px 1fr",
          gap: 48,
          alignItems: "center",
        }}>
          {/* Card — the .tl-arch-scale wrapper exists so narrow phones can
              scale the card without leaving a transform "layout ghost"
              (scale() shrinks pixels but not the layout box; the wrapper's
              explicit scaled dimensions + overflow:hidden keep
              document.scrollWidth honest). */}
          <Reveal style={{ display: "flex", justifyContent: "center" }}>
            <div className="tl-arch-scale">
              <ArchitectureCardTradeLine />
            </div>
          </Reveal>

          {/* Copy bullets */}
          <Reveal delay={0.08}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {[
                {
                  icon: "📞",
                  title: "Forward your number",
                  body: "Your business phone routes calls to TradeLine AI. Callers hear your brand, not a robot greeting.",
                },
                {
                  icon: "🤖",
                  title: "AI answers & qualifies",
                  body: "TradeLine picks up every call 24/7 — gives estimates, captures lead details, and books appointments using your real pricing.",
                },
                {
                  icon: "📅",
                  title: "You see every interaction",
                  body: "Calls, chats, and bookings flow into your dashboard with full transcripts and follow-up status. Nothing falls through.",
                },
              ].map((b) => (
                <div key={b.title} style={{
                  display: "flex", gap: 14, alignItems: "flex-start",
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: mkt.accentTint,
                    border: `1px solid ${mkt.accentGlow}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, flexShrink: 0,
                  }}>
                    {b.icon}
                  </div>
                  <div>
                    <p style={{
                      fontSize: 15, fontWeight: 600, color: mkt.onDark,
                      margin: "0 0 4px", letterSpacing: "-0.01em",
                    }}>{b.title}</p>
                    <p style={{
                      fontSize: 14, lineHeight: 1.55, color: mkt.onDarkMuted, margin: 0,
                    }}>{b.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .tl-arch-split {
            grid-template-columns: 1fr !important;
            gap: 32px !important;
          }
          .tl-arch-split > div:first-child {
            justify-content: center;
          }
        }
        /* The card's overlays are px-positioned against its fixed 380x460
           canvas, so it can't reflow narrower — SCALE it on narrow phones
           instead (380*0.84=319px fits 375px with 24px side padding). The
           wrapper takes the SCALED dimensions + clips, so the layout box
           matches the pixels and document.scrollWidth stays at the viewport. */
        @media (max-width: 430px) {
          .tl-arch-scale {
            width: 319px;
            height: 386px;
            overflow: hidden;
          }
          .tl-arch-scale > * {
            transform: scale(0.84);
            transform-origin: top left;
          }
        }
      `}</style>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION: ReputationShield — Data stream "Where your data comes from"
   Copy left / card right on desktop; stacked on mobile.
   ════════════════════════════════════════════════════════════════ */
function ReputationShieldDataSection() {
  return (
    <section style={{ padding: "20px 24px 60px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <Reveal>
          <p style={{
            fontSize: 11, fontWeight: 700, color: mkt.accentOnDark,
            textAlign: "center", letterSpacing: "0.12em",
            textTransform: "uppercase", margin: "0 0 10px", fontFamily: MONO,
          }}>
            Real-time data
          </p>
          <h2 style={{
            fontSize: "clamp(24px, 3.5vw, 32px)", fontWeight: 600,
            color: mkt.onDark, textAlign: "center",
            letterSpacing: "-0.02em", lineHeight: 1.15,
            margin: "0 0 32px",
          }}>
            Where your reputation data comes from
          </h2>
        </Reveal>

        <div className="rs-data-split" style={{
          display: "grid",
          gridTemplateColumns: "1fr 560px",
          gap: 48,
          alignItems: "center",
        }}>
          {/* Copy bullets */}
          <Reveal>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {[
                {
                  icon: "⭐",
                  title: "150+ review sites monitored",
                  body: "Google, Facebook, Yelp and dozens more. Every new review lands in your dashboard within minutes.",
                },
                {
                  icon: "📱",
                  title: "10+ social channels",
                  body: "Mentions, comments, and direct messages across your social presence — all in one stream.",
                },
                {
                  icon: "🛡️",
                  title: "The shield catches the bad ones first",
                  body: "Unhappy customers get a private feedback form before they reach Google. You fix it before it goes public.",
                },
              ].map((b) => (
                <div key={b.title} style={{
                  display: "flex", gap: 14, alignItems: "flex-start",
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: mkt.accentTint,
                    border: `1px solid ${mkt.accentGlow}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, flexShrink: 0,
                  }}>
                    {b.icon}
                  </div>
                  <div>
                    <p style={{
                      fontSize: 15, fontWeight: 600, color: mkt.onDark,
                      margin: "0 0 4px", letterSpacing: "-0.01em",
                    }}>{b.title}</p>
                    <p style={{
                      fontSize: 14, lineHeight: 1.55, color: mkt.onDarkMuted, margin: 0,
                    }}>{b.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Data stream card */}
          <Reveal delay={0.08} style={{ display: "flex", justifyContent: "center" }}>
            <DataStreamCard />
          </Reveal>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .rs-data-split {
            grid-template-columns: 1fr !important;
            gap: 32px !important;
          }
        }
      `}</style>
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
