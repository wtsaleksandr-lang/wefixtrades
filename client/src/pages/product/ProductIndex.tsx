import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  ArrowUpRight, Phone, Calculator, MapPin, Star, Share2, TrendingUp,
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
  /** Short stat shown bottom-left on hover. */
  stat: string;
}

const MONEY_MAKERS: ProductItem[] = [
  { slug: "tradeline",       name: "24/7 TradeLine™",   tagline: "Never miss a lead — even at 2 AM.",        icon: Phone,      stat: "62% fewer missed calls" },
  { slug: "quickquotepro",   name: "QuoteQuick Pro™",   tagline: "Instant quotes on your website.",          icon: Calculator, stat: "3× more booked jobs" },
  { slug: "mapguard",        name: "MapGuard™",         tagline: "Show up first on Google Maps.",            icon: MapPin,     stat: "Top-3 local pack" },
  { slug: "webfix",          name: "WebFix™",           tagline: "Lighthouse 42 → 98 in a week.",            icon: TrendingUp, stat: "98 Lighthouse score" },
];

const GROWTH_TOOLS: ProductItem[] = [
  { slug: "socialsync",      name: "SocialSync™",       tagline: "Stay visible without hiring a marketer.",   icon: Share2,     stat: "20 posts/month" },
  { slug: "reputationshield",name: "ReputationShield™", tagline: "Every review answered within minutes.",     icon: Star,       stat: "4.9★ avg rating" },
  { slug: "rankflow",        name: "RankFlow™",         tagline: "Outrank competitors without an agency.",    icon: TrendingUp, stat: "Page 1 in 90 days" },
  { slug: "contentflow",     name: "ContentFlow™",      tagline: "Build authority — without writing a word.", icon: PenTool,    stat: "4 articles/month" },
];

const DONE_FOR_YOU: ProductItem[] = [
  { slug: "sitelaunch",      name: "SiteLaunch™",       tagline: "A site that converts. Done in a week.",     icon: Globe,      stat: "Live in 7 days" },
  { slug: "webcare",         name: "WebCare™",          tagline: "We watch your site so you don't have to.",  icon: Shield,     stat: "24/7 monitoring" },
  { slug: "adflow",          name: "AdFlow™",           tagline: "Real ads. Real ROI in your inbox.",         icon: Megaphone,  stat: "4× return on ad spend" },
  { slug: "bookflow",        name: "BookFlow™",         tagline: "Customers book themselves. You show up.",   icon: Calendar,   stat: "Self-serve booking" },
];

const PALETTE = ["cyanSoft", "lavender", "mint", "pink"] as const;

function ProductCard({ p, i }: { p: ProductItem; i: number }) {
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLAnchorElement>(null);
  const tile = TILE[PALETTE[i % PALETTE.length]];
  const Icon = p.icon;
  const cleanName = p.name.replace(/™/g, "");

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <Reveal delay={i * 0.05}>
      <Link
        href={`/products/${p.slug}`}
        ref={ref as any}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onMouseMove={onMove}
        style={{
          display: "block", textDecoration: "none",
          background: mkt.sectionLight,
          border: `1px solid ${hover ? "rgba(13,60,252,0.45)" : mkt.onDarkBorder}`,
          borderRadius: 18, padding: 0,
          height: "100%",
          overflow: "hidden",
          position: "relative",
          transform: hover ? "translateY(-3px)" : "translateY(0)",
          boxShadow: hover ? "0 18px 40px rgba(0,0,0,0.35)" : "0 0 0 rgba(0,0,0,0)",
          transition: "transform 320ms cubic-bezier(0.22,1,0.36,1), box-shadow 320ms cubic-bezier(0.22,1,0.36,1), border-color 320ms ease",
        }}
      >
        {/* Top-right corner arrow */}
        <div style={{
          position: "absolute", top: 12, right: 12, zIndex: 3,
          width: 30, height: 30, borderRadius: 9,
          background: "rgba(255,255,255,0.12)",
          color: mkt.onDark,
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: hover ? 1 : 0,
          transform: hover ? "translate(0,0)" : "translate(6px,-6px)",
          transition: "opacity 280ms ease, transform 280ms cubic-bezier(0.22,1,0.36,1)",
          pointerEvents: "none",
          backdropFilter: "blur(6px)",
        }}>
          <ArrowUpRight size={16} strokeWidth={2.2} />
        </div>

        {/* Pastel header */}
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
            transform: hover ? "scale(1.08)" : "scale(1)",
            opacity: hover ? 0.78 : 1,
            transition: "transform 320ms cubic-bezier(0.22,1,0.36,1), opacity 240ms ease",
          }}>
            <Icon size={20} strokeWidth={1.7} />
          </div>
          <h3 style={{
            position: "relative", flex: 1, minWidth: 0,
            fontSize: 13, fontWeight: 700,
            color: hover ? "#0a1628" : tile.ink,
            letterSpacing: "0.04em", textTransform: "uppercase",
            fontFamily: MONO, lineHeight: 1.25,
            margin: 0, overflow: "hidden", textOverflow: "ellipsis",
            transition: "color 240ms ease",
          }}>
            {cleanName}
          </h3>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 22px 56px", position: "relative" }}>
          <p style={{ fontSize: 14, color: mkt.onDarkMuted, margin: 0, lineHeight: 1.55 }}>
            {p.tagline}
          </p>

          {/* Stat — bottom-left, fades in on hover */}
          <div style={{
            position: "absolute", left: 22, bottom: 18,
            fontSize: 11, fontWeight: 700,
            fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase",
            display: "flex", alignItems: "baseline", gap: 8,
            opacity: hover ? 1 : 0,
            transform: hover ? "translateX(0)" : "translateX(-6px)",
            transition: "opacity 280ms ease 60ms, transform 280ms cubic-bezier(0.22,1,0.36,1) 60ms",
            pointerEvents: "none",
          }}>
            <span style={{ color: mkt.accent }}>{p.stat.split(" ")[0]}</span>
            <span style={{ color: mkt.onDarkMuted, fontSize: 10 }}>
              [{p.stat.split(" ").slice(1).join(" ").toUpperCase()}]
            </span>
          </div>
        </div>

        {/* Cursor-follow tag */}
        <div style={{
          position: "absolute",
          left: pos.x + 18,
          top: pos.y + 14,
          background: mkt.onDark,
          color: mkt.bg,
          fontSize: 10, fontWeight: 700,
          padding: "5px 10px", borderRadius: 6,
          fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase",
          pointerEvents: "none",
          whiteSpace: "nowrap",
          zIndex: 10,
          opacity: hover ? 1 : 0,
          transform: hover ? "scale(1)" : "scale(0.85)",
          transformOrigin: "left top",
          transition: "opacity 160ms ease, transform 160ms ease",
          boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
        }}>
          See Product
        </div>
      </Link>
    </Reveal>
  );
}

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
          {items.map((p, i) => <ProductCard key={p.slug} p={p} i={i} />)}
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
