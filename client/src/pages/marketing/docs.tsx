import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Search, Zap, Globe, Calendar, Bot, Code, AlertCircle, Webhook, ArrowRight, BookOpen, MessageSquare, Shield, Star } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { V7PageShell } from "@/components/marketing/v7";
import { Reveal, TILE, MONO } from "@/components/effortel-blocks";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { mkt, colors, shadows } from "@/theme/tokens";


const GUIDES = [
  {
    slug: "embed",
    icon: Code,
    title: "Embed Guide",
    description: "Add your calculator to any website in 5 minutes. WordPress, Wix, Squarespace, Shopify — covered.",
    badge: "Popular",
    badgeColor: "#0d3cfc",
    badgeBg: "#EAF1FF",
    time: "5 min read",
  },
  {
    slug: "domain",
    icon: Globe,
    title: "Custom Domain",
    description: "Point your own subdomain (e.g. quotes.yoursite.com) to your calculator. SSL automated.",
    badge: null,
    time: "3 min read",
  },
  {
    slug: "booking",
    icon: Calendar,
    title: "Booking + Deposits",
    description: "Let customers book a time and pay a deposit right after getting their estimate.",
    badge: "Pro",
    badgeColor: mkt.accent,
    badgeBg: mkt.accentTint,
    time: "4 min read",
  },
  {
    slug: "ai",
    icon: Bot,
    title: "AI Employee",
    description: "Configure your AI to answer questions, generate estimates, and book jobs — 24/7.",
    badge: "Pro",
    badgeColor: mkt.accent,
    badgeBg: mkt.accentTint,
    time: "5 min read",
  },
  {
    slug: "mapguard",
    icon: Shield,
    title: "MapGuard",
    description: "How MapGuard protects and grows your Google Business Profile — posts, replies, and reports.",
    badge: null,
    time: "6 min read",
  },
  {
    slug: "reputationshield",
    icon: Star,
    title: "ReputationShield",
    description: "Win more 5-star reviews, shield against public 1-stars, and respond to reviews automatically.",
    badge: null,
    time: "6 min read",
  },
  {
    slug: "webhooks",
    icon: Webhook,
    title: "Webhooks",
    description: "Push real-time events to Zapier, Make, or your own system on every lead and booking.",
    badge: "Elite",
    badgeColor: "#F59E0B",
    badgeBg: "#FFFBEB",
    time: "4 min read",
  },
  {
    slug: "troubleshooting",
    icon: AlertCircle,
    title: "Troubleshooting",
    description: "Fast fixes for common issues — widget not loading, missing leads, Stripe not charging.",
    badge: null,
    time: "Quick ref",
  },
];

const QUICKSTARTS = [
  { icon: Zap, label: "Create your first calculator", href: "/wizard", sub: "Launch a live quote page in under 10 minutes" },
  { icon: Globe, label: "Embed on your website", href: "/docs/embed", sub: "Script, popup, or iframe — your choice" },
  { icon: Bot, label: "Set up AI Employee", href: "/docs/ai", sub: "Activate your 14-day trial and configure your AI" },
  { icon: Calendar, label: "Enable booking + deposits", href: "/docs/booking", sub: "Turn estimates into paid bookings" },
];

export default function DocsPage() {
  useScrollReveal();
  const [search, setSearch] = useState("");

  // Title + meta tags handled by <PageMeta> below.

  const filtered = GUIDES.filter((g) =>
    search === "" ||
    g.title.toLowerCase().includes(search.toLowerCase()) ||
    g.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <MarketingLayout>
      <PageMeta
        title="Docs — embed, integrate, and ship with WeFixTrades"
        description="Step-by-step guides for embedding QuoteQuick calculators, wiring TradeLine AI, connecting domains, enabling deposits + booking, and using the WeFixTrades API."
        canonical="/docs"
        keywords={["wefixtrades docs", "quotequick docs", "embed quote calculator"]}
      />
      <V7PageShell>
      <div data-testid="docs-hub" style={{ overflowX: "hidden" }}>

        {/* Compact hero: left-aligned product tag, tight headline directly above search */}
        <section style={{ padding: "96px 24px 28px", position: "relative", overflow: "hidden", background: mkt.bg }}>
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(13,60,252,0.08) 0%, transparent 60%)",
          }} />
          <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative" }}>
            <Reveal>
              <span style={{
                display: "inline-block", fontFamily: MONO, fontSize: 12,
                letterSpacing: "0.16em", textTransform: "uppercase",
                color: mkt.accent,
              }}>
                Documentation
              </span>
            </Reveal>

            <div style={{ maxWidth: 520, margin: "28px auto 0", textAlign: "center" }}>
              <Reveal delay={0.06}>
                <h1 style={{
                  fontSize: "clamp(18px, 2.2vw, 24px)",
                  fontWeight: 700,
                  lineHeight: 1.15,
                  letterSpacing: "-0.01em",
                  color: mkt.onDark,
                  margin: "0 0 12px",
                  fontFamily: "inherit",
                }}>
                  How can <span style={{ color: mkt.accent }}>we help?</span>
                </h1>
              </Reveal>
              <Reveal delay={0.10}>
                <div style={{ position: "relative" }}>
                  <Search size={16} color="rgba(213,225,231,0.6)" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", zIndex: 1 }} />
                  <input
                    data-testid="docs-search"
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search guides... (e.g. embed, domain, booking)"
                    style={{
                      width: "100%",
                      padding: "14px 16px 14px 48px",
                      borderRadius: 12,
                      border: `1.5px solid ${mkt.onDarkBorder}`,
                      background: "rgba(255,255,255,0.04)",
                      color: mkt.onDark,
                      fontSize: 15,
                      outline: "none",
                      boxSizing: "border-box" as const,
                      fontFamily: "inherit",
                    }}
                  />
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Quick start strip */}
        {search === "" && (
          <div style={{ background: mkt.sectionLight, borderBottom: `1px solid ${mkt.onDarkBorder}`, padding: "20px 28px 28px" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: mkt.onDarkMuted, letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 14 }}>
                Quickstart
              </div>
              <div className="qs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 13 }}>
                {QUICKSTARTS.map(({ icon: Icon, label, href, sub }, i) => {
                  // Rotate through V7 pastel TILE colours per quickstart
                  const palette = ["cyanSoft", "lavender", "mint", "pink"] as const;
                  const tile = TILE[palette[i % palette.length]];
                  return (
                  <Link
                    key={label}
                    href={href}
                    data-testid={`quickstart-${label.toLowerCase().replace(/\s+/g, "-")}`}
                    style={{
                      display: "flex", gap: 13, padding: "16px 18px",
                      background: mkt.sectionLight, border: `1px solid ${mkt.onDarkBorder}`, borderRadius: 13,
                      textDecoration: "none", alignItems: "flex-start",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                      transition: "box-shadow 0.18s ease, border-color 0.18s ease",
                    }}
                    className="mkt-feature-card"
                  >
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: tile.bg, color: tile.ink, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: mkt.onDark, marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 13, color: mkt.onDarkMuted, lineHeight: 1.45 }}>{sub}</div>
                    </div>
                  </Link>
                  );
                })}
              </div>
            </div>
            <style>{`@media(max-width:820px){.qs-grid{grid-template-columns:1fr 1fr!important;}} @media(max-width:480px){.qs-grid{grid-template-columns:1fr!important;}}`}</style>
          </div>
        )}

        {/* Guide cards grid */}
        <div style={{ background: mkt.bg, padding: "32px 16px 64px" }}>
          <div style={{ maxWidth: 1320, margin: "0 auto" }}>
            {search !== "" && (
              <p style={{ fontSize: 14, color: mkt.onDarkMuted, marginBottom: 16 }}>
                {filtered.length} result{filtered.length !== 1 ? "s" : ""} for "<strong>{search}</strong>"
              </p>
            )}
            {search === "" && (
              <div style={{ marginBottom: 20 }} data-reveal="fade-up">
                <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 8 }}>
                  All Guides
                </div>
                <h2 style={{ fontSize: "clamp(20px, 2.2vw, 28px)", fontWeight: 800, color: mkt.onDark, margin: 0, letterSpacing: "-0.02em" }}>
                  Everything you need to get results
                </h2>
              </div>
            )}

            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: mkt.onDarkMuted }}>
                <MessageSquare size={32} color={mkt.border} style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No guides match "{search}"</div>
                <div style={{ fontSize: 14 }}>Try a different keyword or <Link href="/contact" style={{ color: mkt.accent, fontWeight: 600, textDecoration: "none" }}>contact support</Link>.</div>
              </div>
            ) : (
              <div className="guides-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                {filtered.map(({ slug, icon: Icon, title, badge, badgeColor, badgeBg, time }, i) => {
                  // Each guide card gets its own pastel for the icon block.
                  const palette = ["cyanSoft", "lavender", "mint", "pink", "cyan"] as const;
                  const tile = TILE[palette[i % palette.length]];
                  return (
                  <Link
                    key={slug}
                    href={`/docs/${slug}`}
                    data-testid={`docs-card-${slug}`}
                    data-reveal="fade-up"
                    className="mkt-feature-card"
                    style={{
                      display: "flex", flexDirection: "column", gap: 0,
                      background: mkt.sectionLight, border: `1px solid ${mkt.onDarkBorder}`, borderRadius: 16,
                      padding: 0, textDecoration: "none",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.10), 0 4px 16px rgba(0,0,0,0.18)",
                      overflow: "hidden",
                    }}
                  >
                    {/* Pastel header — icon + title + badge inline (fully rounded card-within-card) */}
                    <div style={{
                      margin: "10px 10px 0",
                      background: tile.bg, color: tile.ink,
                      padding: "12px 14px",
                      borderRadius: 14,
                      display: "flex", alignItems: "center", gap: 12,
                      position: "relative",
                      overflow: "hidden",
                    }}>
                      <div style={{
                        position: "absolute", inset: 0,
                        backgroundImage: `radial-gradient(circle, ${tile.ink}10 1px, transparent 1px)`,
                        backgroundSize: "14px 14px", opacity: 0.5, pointerEvents: "none",
                      }} />
                      <div style={{
                        position: "relative", flexShrink: 0,
                        width: 52, height: 52, borderRadius: 13,
                        background: "rgba(255,255,255,0.55)",
                        border: `1px solid ${tile.ink}1f`,
                        color: tile.ink,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Icon size={24} strokeWidth={1.7} />
                      </div>
                      <h3 style={{
                        position: "relative", flex: 1, minWidth: 0,
                        fontSize: 13, fontWeight: 700, color: tile.ink,
                        letterSpacing: "0.04em", textTransform: "uppercase",
                        fontFamily: MONO, lineHeight: 1.25,
                        margin: 0, overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {title}
                      </h3>
                      {badge && (
                        <span style={{
                          position: "relative", flexShrink: 0,
                          fontSize: 9, fontWeight: 700, color: badgeColor, background: badgeBg,
                          padding: "3px 8px", borderRadius: 999, letterSpacing: "0.06em",
                          fontFamily: MONO, textTransform: "uppercase",
                        }}>
                          {badge}
                        </span>
                      )}
                    </div>
                    {/* Body — meta row only (description removed) */}
                    <div style={{ padding: "12px 18px 14px", display: "flex", flexDirection: "column", flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, color: mkt.onDarkFaint, fontFamily: MONO, letterSpacing: "0.06em" }}>{time}</span>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          fontSize: 11, fontWeight: 600, color: mkt.accent,
                          fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase",
                          paddingBottom: 4, borderBottom: `1px solid ${mkt.accent}`,
                        }}>
                          Read guide <ArrowRight size={12} />
                        </span>
                      </div>
                    </div>
                  </Link>
                  );
                })}
              </div>
            )}
          </div>
          <style>{`@media(max-width:820px){.guides-grid{grid-template-columns:1fr 1fr!important;}} @media(max-width:560px){.guides-grid{grid-template-columns:1fr!important;}}`}</style>
        </div>

        {/* Footer help band */}
        <div style={{ background: mkt.sectionLight, borderTop: `1px solid ${mkt.onDarkBorder}`, padding: "56px 28px", textAlign: "center" }}>
          <div style={{ maxWidth: 520, margin: "0 auto" }}>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: mkt.onDark, margin: "0 0 10px" }}>
              Can't find what you're looking for?
            </h3>
            <p style={{ fontSize: 15, color: mkt.onDarkMuted, margin: "0 0 24px", lineHeight: 1.65 }}>
              Our support team usually responds within 2 hours. We're real people — not a bot.
            </p>
            <Link
              href="/contact"
              data-testid="docs-contact-cta"
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "12px 28px", borderRadius: 10, background: mkt.ctaBg, color: mkt.ctaText, fontSize: 15, fontWeight: 500, textDecoration: "none" }}
            >
              Contact Support <ArrowRight size={14} />
            </Link>
          </div>
        </div>

      </div>
      </V7PageShell>
    </MarketingLayout>
  );
}
