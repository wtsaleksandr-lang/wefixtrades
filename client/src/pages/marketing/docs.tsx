import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Search, Zap, Globe, Calendar, Bot, Code, AlertCircle, Webhook, ArrowRight, BookOpen, MessageSquare } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { mkt, colors, shadows } from "@/theme/tokens";


const GUIDES = [
  {
    slug: "embed",
    icon: Code,
    title: "Embed Guide",
    description: "Add your calculator to any website in 5 minutes. WordPress, Wix, Squarespace, Shopify — covered.",
    badge: "Popular",
    badgeColor: "#2F6BFF",
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
  { icon: Zap, label: "Create your first calculator", href: "/Wizard", sub: "Launch a live quote page in under 10 minutes" },
  { icon: Globe, label: "Embed on your website", href: "/docs/embed", sub: "Script, popup, or iframe — your choice" },
  { icon: Bot, label: "Set up AI Employee", href: "/docs/ai", sub: "Activate your 14-day trial and configure your AI" },
  { icon: Calendar, label: "Enable booking + deposits", href: "/docs/booking", sub: "Turn estimates into paid bookings" },
];

export default function DocsPage() {
  useScrollReveal();
  const [search, setSearch] = useState("");

  useEffect(() => { document.title = "Docs — QuickQuotePro"; }, []);

  const filtered = GUIDES.filter((g) =>
    search === "" ||
    g.title.toLowerCase().includes(search.toLowerCase()) ||
    g.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <MarketingLayout>
      <div data-testid="docs-hub" style={{ overflowX: "hidden" }}>

        {/* Hero */}
        <div style={{ background: `linear-gradient(160deg, ${mkt.dark} 0%, #0F2744 100%)`, padding: "72px 28px 64px" }}>
          <div style={{ maxWidth: 780, margin: "0 auto", textAlign: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(47,107,255,0.20)", border: "1px solid rgba(47,107,255,0.30)", borderRadius: 20, padding: "5px 16px", marginBottom: 24 }}>
              <BookOpen size={13} color="#6EE7B7" />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6EE7B7", letterSpacing: "0.05em" }}>Documentation</span>
            </div>
            <h1 style={{ fontSize: "clamp(30px, 4vw, 48px)", fontWeight: 800, color: "#FFFFFF", margin: "0 0 14px", letterSpacing: "-0.02em" }}>
              How can we help?
            </h1>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.6)", margin: "0 0 36px", lineHeight: 1.6 }}>
              Guides, embed instructions, and troubleshooting — all written for non-technical trades people.
            </p>

            {/* Search */}
            <div style={{ position: "relative" as const, maxWidth: 520, margin: "0 auto" }}>
              <Search size={17} color="#94A3B8" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
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
                  border: "1.5px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.09)",
                  color: "#FFFFFF",
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box" as const,
                  fontFamily: "inherit",
                }}
              />
            </div>
          </div>
        </div>

        {/* Quick start strip */}
        {search === "" && (
          <div style={{ background: mkt.surface, borderBottom: `1px solid ${mkt.border}`, padding: "28px 28px" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: mkt.textMuted, letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 16 }}>
                Quickstart
              </div>
              <div className="qs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {QUICKSTARTS.map(({ icon: Icon, label, href, sub }) => (
                  <Link
                    key={label}
                    href={href}
                    data-testid={`quickstart-${label.toLowerCase().replace(/\s+/g, "-")}`}
                    style={{
                      display: "flex", gap: 12, padding: "14px 16px",
                      background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 12,
                      textDecoration: "none", alignItems: "flex-start",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                      transition: "box-shadow 0.18s ease, border-color 0.18s ease",
                    }}
                    className="mkt-feature-card"
                  >
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: mkt.accentTint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon size={16} color={mkt.accent} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: mkt.text, marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 12, color: mkt.textMuted, lineHeight: 1.45 }}>{sub}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
            <style>{`@media(max-width:820px){.qs-grid{grid-template-columns:1fr 1fr!important;}} @media(max-width:480px){.qs-grid{grid-template-columns:1fr!important;}}`}</style>
          </div>
        )}

        {/* Guide cards grid */}
        <div style={{ background: mkt.bg, padding: "64px 28px 96px" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            {search !== "" && (
              <p style={{ fontSize: 14, color: mkt.textMuted, marginBottom: 24 }}>
                {filtered.length} result{filtered.length !== 1 ? "s" : ""} for "<strong>{search}</strong>"
              </p>
            )}
            {search === "" && (
              <div style={{ marginBottom: 36 }} data-reveal="fade-up">
                <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 12 }}>
                  All Guides
                </div>
                <h2 style={{ fontSize: "clamp(22px, 2.5vw, 32px)", fontWeight: 800, color: mkt.text, margin: 0, letterSpacing: "-0.02em" }}>
                  Everything you need to get results
                </h2>
              </div>
            )}

            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: mkt.textMuted }}>
                <MessageSquare size={32} color={mkt.border} style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No guides match "{search}"</div>
                <div style={{ fontSize: 14 }}>Try a different keyword or <Link href="/contact" style={{ color: mkt.accent, fontWeight: 600, textDecoration: "none" }}>contact support</Link>.</div>
              </div>
            ) : (
              <div className="guides-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
                {filtered.map(({ slug, icon: Icon, title, description, badge, badgeColor, badgeBg, time }) => (
                  <Link
                    key={slug}
                    href={`/docs/${slug}`}
                    data-testid={`docs-card-${slug}`}
                    data-reveal="fade-up"
                    className="mkt-feature-card"
                    style={{
                      display: "flex", flexDirection: "column", gap: 0,
                      background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 16,
                      padding: "28px 24px", textDecoration: "none",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
                      <div style={{ width: 48, height: 48, borderRadius: 12, background: mkt.accentTint, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon size={22} color={mkt.accent} />
                      </div>
                      {badge && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: badgeColor, background: badgeBg, padding: "3px 10px", borderRadius: 20, letterSpacing: "0.05em" }}>
                          {badge}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: mkt.text, marginBottom: 8 }}>{title}</div>
                    <div style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.65, flex: 1, marginBottom: 20 }}>{description}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: mkt.textMuted }}>{time}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color: mkt.accent }}>
                        Read guide <ArrowRight size={13} />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <style>{`@media(max-width:820px){.guides-grid{grid-template-columns:1fr 1fr!important;}} @media(max-width:560px){.guides-grid{grid-template-columns:1fr!important;}}`}</style>
        </div>

        {/* Footer help band */}
        <div style={{ background: mkt.surface, borderTop: `1px solid ${mkt.border}`, padding: "56px 28px", textAlign: "center" }}>
          <div style={{ maxWidth: 520, margin: "0 auto" }}>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: mkt.text, margin: "0 0 10px" }}>
              Can't find what you're looking for?
            </h3>
            <p style={{ fontSize: 15, color: mkt.textMuted, margin: "0 0 24px", lineHeight: 1.65 }}>
              Our support team usually responds within 2 hours. We're real people — not a bot.
            </p>
            <Link
              href="/contact"
              data-testid="docs-contact-cta"
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "12px 28px", borderRadius: 10, background: mkt.accent, color: "#FFFFFF", fontSize: 15, fontWeight: 700, textDecoration: "none" }}
            >
              Contact Support <ArrowRight size={14} />
            </Link>
          </div>
        </div>

      </div>
    </MarketingLayout>
  );
}
