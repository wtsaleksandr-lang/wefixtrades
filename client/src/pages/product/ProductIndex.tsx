import { useEffect } from "react";
import { Link } from "wouter";
import {
  ArrowRight, Phone, Calculator, MapPin, Star, Share2, TrendingUp,
  Globe, Shield, Megaphone, Calendar, PenTool,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import { V7Hero, V7Section, V7Container, V7PageShell, V7SectionHeading, V7FinalCta } from "@/components/marketing/v7";
import { Reveal, MONO, TILE } from "@/components/effortel-blocks";

/**
 * /products — the canonical product index. Shows ALL 12 products grouped
 * by the same 3-type pattern used on the homepage:
 *
 *   Money-makers   — TradeLine, QuoteQuick, MapGuard, WebFix
 *   Growth tools   — SocialSync, ReputationShield, RankFlow, ContentFlow
 *   Done-for-you   — SiteLaunch, WebCare, AdFlow, BookFlow
 *
 * Each entry links to its EffortelProductPage.
 */

interface ProductItem {
  slug: string;
  name: string;
  tagline: string;
  icon: typeof Phone;
}

const MONEY_MAKERS: ProductItem[] = [
  { slug: "tradeline",       name: "24/7 TradeLine™",   tagline: "Never miss a lead — even at 2 AM.",        icon: Phone },
  { slug: "quickquotepro",   name: "QuoteQuick Pro™",   tagline: "Instant quotes on your website.",          icon: Calculator },
  { slug: "mapguard",        name: "MapGuard™",         tagline: "Show up first on Google Maps.",            icon: MapPin },
  { slug: "webfix",          name: "WebFix™",           tagline: "Lighthouse 42 → 98 in a week.",            icon: TrendingUp },
];

const GROWTH_TOOLS: ProductItem[] = [
  { slug: "socialsync",      name: "SocialSync™",       tagline: "Stay visible without hiring a marketer.",   icon: Share2 },
  { slug: "reputationshield",name: "ReputationShield™", tagline: "Every review answered within minutes.",     icon: Star },
  { slug: "rankflow",        name: "RankFlow™",         tagline: "Outrank competitors without an agency.",    icon: TrendingUp },
  { slug: "contentflow",     name: "ContentFlow™",      tagline: "Build authority — without writing a word.", icon: PenTool },
];

const DONE_FOR_YOU: ProductItem[] = [
  { slug: "sitelaunch",      name: "SiteLaunch™",       tagline: "A site that converts. Done in a week.",     icon: Globe },
  { slug: "webcare",         name: "WebCare™",          tagline: "We watch your site so you don't have to.",  icon: Shield },
  { slug: "adflow",          name: "AdFlow™",           tagline: "Real ads. Real ROI in your inbox.",         icon: Megaphone },
  { slug: "bookflow",        name: "BookFlow™",         tagline: "Customers book themselves. You show up.",   icon: Calendar },
];

function ProductGroup({
  eyebrow, title, items,
}: {
  eyebrow: string; title: string; items: ProductItem[];
}) {
  return (
    <V7Section padding="80px">
      <V7Container>
        <V7SectionHeading eyebrow={eyebrow} title={title} />
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}>
          {items.map((p, i) => {
            const Icon = p.icon;
            // Rotate through pastel TILE colours per product so the grid
            // looks like the V7 product mockups instead of 4 cyan icons in a row.
            const palette = ["cyanSoft", "lavender", "mint", "pink"] as const;
            const tile = TILE[palette[i % palette.length]];
            return (
              <Reveal key={p.slug} delay={i * 0.05}>
                <Link href={`/products/${p.slug}`} style={{
                  display: "block", textDecoration: "none",
                  background: mkt.sectionLight,
                  border: `1px solid ${mkt.onDarkBorder}`,
                  borderRadius: 18, padding: 0,
                  height: "100%",
                  overflow: "hidden",
                }}>
                  {/* Pastel header — icon + product name inline */}
                  <div style={{
                    background: tile.bg, color: tile.ink,
                    padding: "16px 18px",
                    display: "flex", alignItems: "center", gap: 12,
                    position: "relative",
                  }}>
                    <div style={{
                      position: "absolute", inset: 0,
                      backgroundImage: `radial-gradient(circle, ${tile.ink}10 1px, transparent 1px)`,
                      backgroundSize: "14px 14px", opacity: 0.5, pointerEvents: "none",
                    }} />
                    <div style={{
                      position: "relative", flexShrink: 0,
                      width: 40, height: 40, borderRadius: 10,
                      background: "rgba(255,255,255,0.55)", color: tile.ink,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon size={18} strokeWidth={1.7} />
                    </div>
                    <h3 style={{
                      position: "relative", flex: 1, minWidth: 0,
                      fontSize: 13, fontWeight: 700, color: tile.ink,
                      letterSpacing: "0.04em", textTransform: "uppercase",
                      fontFamily: MONO, lineHeight: 1.25,
                      margin: 0, overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {p.name.replace(/™/g, "")}
                    </h3>
                  </div>
                  <div style={{ padding: "18px 22px 22px" }}>
                    <p style={{ fontSize: 14, color: mkt.onDarkMuted, margin: "0 0 18px", lineHeight: 1.55 }}>
                      {p.tagline}
                    </p>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      fontSize: 11, fontWeight: 600, color: mkt.accent,
                      fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase",
                      paddingBottom: 4, borderBottom: `1px solid ${mkt.accent}`,
                    }}>
                      See details <ArrowRight size={12} />
                    </span>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </V7Container>
    </V7Section>
  );
}

export default function ProductIndex() {
  useEffect(() => {
    document.title = "Products — WeFixTrades | 12 Tools for Trades Businesses";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", "All 12 WeFixTrades products: instant quotes, 24/7 answering, Google Maps optimization, websites, ads, booking, reviews, and more.");
    }
  }, []);

  return (
    <MarketingLayout>
      <V7PageShell>
        <V7Hero
          productName="All Products"
          eyebrow="Twelve tools. One operating system for your trades business."
          headline={<>Pick the ones you need.<br/><span style={{ color: mkt.accent }}>Skip the rest.</span></>}
          sub="Everything we make is built for trades buyers — plumbers, electricians, roofers, HVAC techs. No generic SaaS retrofits."
          ctas={[
            { label: "See Pricing", href: "/pricing" },
            { label: "Talk to Sales", href: "/contact" },
          ]}
        />

        <ProductGroup
          eyebrow="Money-makers · most-loved"
          title="The four tools that pay back fastest."
          items={MONEY_MAKERS}
        />
        <ProductGroup
          eyebrow="Growth tools"
          title="After they find you, keep them coming back."
          items={GROWTH_TOOLS}
        />
        <ProductGroup
          eyebrow="Done for you"
          title="You don't need a team. You have one."
          items={DONE_FOR_YOU}
        />

        <V7FinalCta
          title={<>One operating system.<br/><span style={{ color: mkt.accent }}>Twelve outcomes.</span></>}
          sub="Pick a tier. Cancel any month. We do the work — you stay in the field."
          primaryCta={{ label: "See Pricing", href: "/pricing" }}
        />
      </V7PageShell>
    </MarketingLayout>
  );
}
