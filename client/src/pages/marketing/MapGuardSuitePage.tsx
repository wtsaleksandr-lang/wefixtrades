/**
 * /mapguard-suite — Wave 11D D5 overview page for the MapGuard Suite.
 *
 * Groups the 4 paid local-SEO products under one sub-brand so customers
 * see a coherent platform instead of separate SKUs:
 *   1. MapGuard Core      — managed Google Business Profile visibility
 *   2. Citation Tracker   — directory monitoring
 *   3. Citation Builder   — one-time citation submission service
 *   4. Full Audit Master  — five audits combined into one PDF
 *
 * Plus a "Start free with these tools" section that LINKS to the 7
 * Local-SEO free tools (Citation Checker, Google Review Link Gen, etc.)
 * — those tools live under /tools/*, this section is cross-link only.
 *
 * See WORKSTREAMS/strategy-decisions-locked-2026-05-26.md (D5 revised).
 */

import { Link } from "wouter";
import { ArrowRight, MapPinned, Search, Layers, FileText, Check } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import {
  V7Hero,
  V7Section,
  V7Container,
  V7PageShell,
  V7SectionHeading,
  V7FinalCta,
} from "@/components/marketing/v7";
import { Reveal, MONO, SANS } from "@/components/effortel-blocks";
import { mkt } from "@/theme/tokens";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import { SITE_URL } from "@/lib/seo/pageMeta";

interface SuiteProduct {
  name: string;
  href: string;
  icon: typeof MapPinned;
  price: string;
  pitch: string;
}

const SUITE_PRODUCTS: SuiteProduct[] = [
  {
    name: "MapGuard Core",
    href: "/products/mapguard",
    icon: MapPinned,
    price: "$397 setup + $99 / $149 / mo",
    pitch: "Managed Google Business Profile — weekly monitoring, monthly optimization, real reports.",
  },
  {
    name: "Citation Tracker",
    href: "/citation-tracker",
    icon: Search,
    price: "$19 / mo standalone · $5 / mo with MapGuard",
    pitch: "Continuous NAP monitoring across 50+ directories. Catch citation drift before it costs rankings.",
  },
  {
    name: "Citation Builder",
    href: "/citation-builder",
    icon: Layers,
    price: "$79 / $179 / $299 one-time",
    pitch: "We submit your business to the top citation directories — by hand, verified, with a delivery report.",
  },
  {
    name: "Full Audit Master",
    href: "/tools/free-audit",
    icon: FileText,
    price: "$9.80 one-time",
    pitch: "Five audits in one PDF — Local SEO, NAP, site speed, trust signals, market size. Delivered in 60 seconds.",
  },
];

interface FreeTool {
  name: string;
  href: string;
  blurb: string;
}

const LOCAL_SEO_FREE_TOOLS: FreeTool[] = [
  { name: "Free Audit", href: "/tools/free-audit", blurb: "30-second local SEO health check." },
  { name: "Citation Checker", href: "/tools/citation-checker", blurb: "Find missing citations across directories." },
  { name: "Google Review Link Generator", href: "/tools/google-review-link-generator", blurb: "Get your direct review link in one click." },
  { name: "Local Rank Grid", href: "/tools/local-rank-grid", blurb: "5×5 geo-grid rank scan for any keyword." },
  { name: "Local Rank Tracker", href: "/tools/local-rank-tracker", blurb: "Multi-engine single-business rank snapshot." },
  { name: "Local Rankflux", href: "/tools/local-rankflux", blurb: "Algorithm-update tracker for local search." },
  { name: "Local SERP Checker", href: "/tools/local-serp-checker", blurb: "Google + Maps SERP viewer, multi-country." },
];

const cardStyle = {
  background: mkt.sectionLight,
  borderRadius: 16,
  padding: "24px 22px",
  border: `1px solid ${mkt.onDarkBorder}`,
  height: "100%",
  display: "flex",
  flexDirection: "column" as const,
  gap: 14,
};

const iconWrapStyle = {
  width: 44,
  height: 44,
  borderRadius: 10,
  background: "rgba(13,60,252,0.10)",
  border: `1px solid ${mkt.onDarkBorder}`,
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  color: mkt.accent,
};

export default function MapGuardSuitePage() {
  useBreadcrumbSchema([
    { name: "Home", url: SITE_URL },
    { name: "MapGuard Suite", url: `${SITE_URL}/mapguard-suite` },
  ]);

  return (
    <MarketingLayout>
      <PageMeta
        title="MapGuard Suite — Local SEO Platform for Trades | WeFixTrades"
        description="Four products designed to find, fix, and monitor your local presence. MapGuard Core, Citation Tracker, Citation Builder, and Full Audit Master — your complete local SEO suite."
        canonical="/mapguard-suite"
      />
      <V7PageShell>
        <V7Hero
          productName="MapGuard Suite"
          eyebrow="Local SEO that actually moves rankings — not a dashboard you forget about."
          headline={<>Your complete<br/><span style={{ color: mkt.accent }}>local SEO platform.</span></>}
          sub="Four products designed to find, fix, and monitor your local presence — from Google Business Profile to citation directories."
          ctas={[
            { label: "See MapGuard Core", href: "/products/mapguard" },
            { label: "See Pricing", href: "/pricing" },
          ]}
        />

        {/* ── 4-product grid ──────────────────────────────────────── */}
        <V7Section padding="80px" variant="default">
          <V7Container>
            <V7SectionHeading
              eyebrow="The Suite"
              title="Four products. One sub-brand."
              sub="Each works standalone. Together they cover the full local-SEO lifecycle."
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 20,
              }}
            >
              {SUITE_PRODUCTS.map((p, i) => {
                const Icon = p.icon;
                return (
                  <Reveal key={p.href} delay={i * 0.04}>
                    <Link href={p.href} style={{ textDecoration: "none", display: "block", height: "100%" }}>
                      <div style={cardStyle}>
                        <div style={iconWrapStyle}>
                          <Icon size={24} strokeWidth={1.6} />
                        </div>
                        <h3 style={{ fontSize: 20, fontWeight: 700, color: mkt.onDark, margin: 0, fontFamily: SANS, letterSpacing: "-0.01em" }}>
                          {p.name}
                        </h3>
                        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: mkt.accent }}>
                          {p.price}
                        </div>
                        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.55, margin: 0, fontFamily: SANS, flex: 1 }}>
                          {p.pitch}
                        </p>
                        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: mkt.onDarkMuted, display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                          Learn more <ArrowRight size={14} />
                        </span>
                      </div>
                    </Link>
                  </Reveal>
                );
              })}
            </div>
          </V7Container>
        </V7Section>

        {/* ── Start free section ──────────────────────────────────── */}
        <V7Section padding="72px" variant="subtle">
          <V7Container>
            <V7SectionHeading
              eyebrow="Start free"
              title="Try the local-SEO toolkit free, first."
              sub="Seven free tools that share the same data model as the paid suite. Run a free audit, find missing citations, check your rank — all without signup."
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 14,
              }}
            >
              {LOCAL_SEO_FREE_TOOLS.map((t, i) => (
                <Reveal key={t.href} delay={i * 0.03}>
                  <Link
                    href={t.href}
                    style={{
                      display: "block",
                      textDecoration: "none",
                      padding: "16px 18px",
                      borderRadius: 12,
                      background: mkt.sectionLight,
                      border: `1px solid ${mkt.onDarkBorder}`,
                      transition: "border-color 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <Check size={14} color={mkt.accent} strokeWidth={2} />
                      <span style={{ fontSize: 15, fontWeight: 600, color: mkt.onDark, fontFamily: SANS }}>
                        {t.name}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: mkt.onDarkMuted, margin: 0, lineHeight: 1.5, fontFamily: SANS }}>
                      {t.blurb}
                    </p>
                  </Link>
                </Reveal>
              ))}
            </div>
            <div style={{ marginTop: 28, textAlign: "center" }}>
              <Link
                href="/free-tools"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: MONO,
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: mkt.accent,
                  textDecoration: "none",
                }}
              >
                See all 19 free tools <ArrowRight size={14} />
              </Link>
            </div>
          </V7Container>
        </V7Section>

        {/* ── Optional bundle ribbon ──────────────────────────────── */}
        <V7Section padding="48px" variant="default">
          <V7Container maxWidth={820}>
            <Reveal>
              <div
                style={{
                  background: "rgba(13,60,252,0.08)",
                  border: `1px solid ${mkt.onDarkBorder}`,
                  borderRadius: 14,
                  padding: "20px 24px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: mkt.accent, marginBottom: 6 }}>
                  Coming Soon
                </div>
                <p style={{ fontSize: 16, color: mkt.onDark, margin: 0, lineHeight: 1.5, fontFamily: SANS }}>
                  <strong>MapGuard Suite Bundle</strong> — all 4 products together for $249 / mo. We're gauging interest before minting the SKU; if you'd buy it today, let us know.
                </p>
              </div>
            </Reveal>
          </V7Container>
        </V7Section>

        <V7FinalCta
          title={<>Build your local presence,<br/><span style={{ color: mkt.accent }}>one product at a time.</span></>}
          sub="Start with the free audit, layer in citation tracking, scale up to managed MapGuard when you need hands-off."
          primaryCta={{ label: "See MapGuard Core", href: "/products/mapguard" }}
        />
      </V7PageShell>
    </MarketingLayout>
  );
}
