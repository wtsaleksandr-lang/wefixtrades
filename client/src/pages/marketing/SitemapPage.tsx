/**
 * /sitemap — human-friendly HTML index of every public WeFixTrades page.
 *
 * The XML sitemap (/sitemap.xml, server/routes/sitemapRoutes.ts) is for
 * crawlers; this page is for humans + AI assistants who land on the site
 * and want a quick map of what's there. Organised by section, matches
 * the visual rhythm of the rest of the marketing surface.
 */
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import {
  V7Section,
  V7Container,
  V7PageShell,
  V7SectionHeading,
} from "@/components/marketing/v7";
import { Reveal, MONO, SANS } from "@/components/effortel-blocks";
import { mkt } from "@/theme/tokens";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import { SITE_URL } from "@/lib/seo/pageMeta";

interface SitemapEntry {
  href: string;
  label: string;
}

interface SitemapSection {
  title: string;
  description?: string;
  entries: SitemapEntry[];
}

/**
 * Single source of truth for the human-readable sitemap. Mirrors the
 * curated public routes from sitemapRoutes.ts but in a human-friendly
 * order, grouped for scanning. Keep in sync when public routes are added.
 */
const SECTIONS: SitemapSection[] = [
  {
    // Wave 11D D5 — MapGuard Suite groups the paid local-SEO products.
    title: "MapGuard Suite",
    description: "Paid local-SEO platform — 4 products under one sub-brand.",
    entries: [
      { href: "/mapguard-suite", label: "MapGuard Suite (Overview)" },
      { href: "/products/mapguard", label: "MapGuard Core" },
      { href: "/citation-tracker", label: "Citation Tracker" },
      { href: "/citation-builder", label: "Citation Builder" },
      { href: "/tools/free-audit", label: "Full Audit Master" },
    ],
  },
  {
    title: "Products",
    description: "Core WeFixTrades products.",
    entries: [
      { href: "/products", label: "All Products" },
      { href: "/products/tradeline", label: "24/7 TradeLine" },
      { href: "/products/quickquotepro", label: "QuoteQuick (includes BookFlow)" },
      { href: "/products/contentflow", label: "ContentFlow" },
      { href: "/products/reputationshield", label: "ReputationShield" },
      { href: "/products/socialsync", label: "SocialSync" },
      { href: "/products/rankflow", label: "RankFlow" },
      { href: "/products/webcare", label: "WebCare" },
      { href: "/products/sitelaunch", label: "SiteLaunch" },
      { href: "/products/webfix", label: "WebFix" },
      { href: "/products/adflow", label: "AdFlow" },
    ],
  },
  {
    title: "Solutions",
    description: "Trade-specific landing pages — pick yours.",
    entries: [
      { href: "/solutions/for-plumbers", label: "Plumbers" },
      { href: "/solutions/for-hvac", label: "HVAC" },
      { href: "/solutions/for-electricians", label: "Electricians" },
      { href: "/solutions/for-roofers", label: "Roofers" },
      { href: "/solutions/for-cleaners", label: "Cleaners" },
      { href: "/solutions/for-landscapers", label: "Landscapers" },
      { href: "/solutions/for-pest-control", label: "Pest Control" },
      { href: "/solutions/for-garage-door", label: "Garage Door" },
      { href: "/solutions/for-locksmiths", label: "Locksmiths" },
      { href: "/solutions/for-painters", label: "Painters" },
      { href: "/solutions/for-remodelers", label: "Remodelers" },
      { href: "/solutions/for-general-contractors", label: "General Contractors" },
      // Wave 16 — long-tail trade pages.
      { href: "/solutions/for-carpenters", label: "Carpenters" },
      { href: "/solutions/for-cabinet-installers", label: "Cabinet Installers" },
      { href: "/solutions/for-chimney-sweeps", label: "Chimney Sweeps" },
      { href: "/solutions/for-concrete", label: "Concrete" },
      { href: "/solutions/for-countertop-installers", label: "Countertop Installers" },
      { href: "/solutions/for-deck-builders", label: "Deck Builders" },
      { href: "/solutions/for-door-installers", label: "Door Installers" },
      { href: "/solutions/for-drywall", label: "Drywall" },
      { href: "/solutions/for-fencing", label: "Fencing" },
      { href: "/solutions/for-flooring", label: "Flooring" },
      { href: "/solutions/for-foundation-repair", label: "Foundation Repair" },
      { href: "/solutions/for-gutter-services", label: "Gutter Services" },
      { href: "/solutions/for-insulation", label: "Insulation" },
      { href: "/solutions/for-masonry", label: "Masonry" },
      { href: "/solutions/for-mold-remediation", label: "Mold Remediation" },
      { href: "/solutions/for-moving-services", label: "Moving Services" },
      { href: "/solutions/for-pool-service", label: "Pool Service" },
      { href: "/solutions/for-septic-services", label: "Septic Services" },
      { href: "/solutions/for-siding", label: "Siding" },
      { href: "/solutions/for-solar", label: "Solar" },
      { href: "/solutions/for-tile-installers", label: "Tile Installers" },
      { href: "/solutions/for-tree-service", label: "Tree Service" },
      { href: "/solutions/for-water-damage-restoration", label: "Water Damage Restoration" },
      { href: "/solutions/for-waterproofing", label: "Waterproofing" },
      { href: "/solutions/for-well-water", label: "Well Water" },
      { href: "/solutions/for-window-installers", label: "Window Installers" },
      { href: "/solutions/for-appliance-repair", label: "Appliance Repair" },
      { href: "/solutions/for-junk-removal", label: "Junk Removal" },
      { href: "/solutions/visibility", label: "Local Visibility" },
    ],
  },
  {
    title: "For You",
    description: "Audience-specific landing pages.",
    entries: [
      { href: "/for-agencies", label: "For Agencies" },
      { href: "/for-franchises", label: "For Franchises" },
      { href: "/for-solo-traders", label: "For Solo Traders" },
      { href: "/contentflow", label: "For Marketers (ContentFlow)" },
    ],
  },
  {
    title: "Compare",
    description: "Honest comparisons against the field-service incumbents.",
    entries: [
      { href: "/wefixtrades-vs-jobber", label: "WeFixTrades vs Jobber" },
      { href: "/wefixtrades-vs-housecall-pro", label: "WeFixTrades vs Housecall Pro" },
      { href: "/wefixtrades-vs-servicetitan", label: "WeFixTrades vs ServiceTitan" },
    ],
  },
  {
    title: "Free Tools",
    description: "21 free tools across local SEO, AI content, and widgets.",
    entries: [
      { href: "/free-tools", label: "Free Tools (Hub)" },
      { href: "/tools/free-audit", label: "Free Local SEO Audit" },
      { href: "/tools/google-review-link-generator", label: "Google Review Link Generator" },
      { href: "/tools/local-serp-checker", label: "Local SERP Checker (Google + Maps)" },
      { href: "/tools/local-rank-tracker", label: "Local Rank Tracker (Google + Brave + Maps)" },
      { href: "/tools/citation-checker", label: "Citation Checker" },
      { href: "/tools/local-rankflux", label: "Local Rankflux (Algorithm Tracker)" },
      { href: "/tools/local-rank-grid", label: "Local Rank Grid (5×5 Geo Scan)" },
      { href: "/products/quickquotepro/demo", label: "QuoteQuick Live Demo" },
      { href: "/products/quickquotepro/build-with-ai", label: "Build with AI (from a photo)" },
      { href: "/tools/plumbing-ai-content-prompts", label: "Plumbing AI Content Prompts" },
      { href: "/tools/hvac-ai-content-prompts", label: "HVAC AI Content Prompts" },
      { href: "/tools/electrical-ai-content-prompts", label: "Electrical AI Content Prompts" },
      { href: "/tools/roofing-ai-content-prompts", label: "Roofing AI Content Prompts" },
      { href: "/tools/landscaping-ai-content-prompts", label: "Landscaping AI Content Prompts" },
    ],
  },
  {
    title: "Resources",
    description: "Learn how WeFixTrades works.",
    entries: [
      { href: "/about", label: "About Us" },
      { href: "/contact", label: "Contact Sales" },
      { href: "/pricing", label: "Pricing" },
      { href: "/pricing/quotequick", label: "QuoteQuick Pricing" },
      { href: "/citation-builder", label: "Citation Builder (Paid Service)" },
      { href: "/blog", label: "Blog" },
      { href: "/case-studies", label: "Case Studies" },
      { href: "/resources", label: "Resources" },
      { href: "/templates", label: "Templates" },
      { href: "/services", label: "Services" },
      { href: "/demo", label: "Demo Centre" },
      { href: "/demos", label: "All Demos" },
    ],
  },
  {
    title: "Documentation",
    description: "Setup guides, API reference, and product docs.",
    entries: [
      { href: "/docs", label: "Docs Home" },
      { href: "/docs/api", label: "API Docs" },
      { href: "/docs/embed", label: "Embedding Guide" },
      { href: "/docs/domain", label: "Custom Domain Setup" },
      { href: "/docs/booking", label: "Booking Setup" },
      { href: "/docs/ai", label: "AI Configuration" },
      { href: "/docs/mapguard", label: "MapGuard Docs" },
      { href: "/docs/reputationshield", label: "ReputationShield Docs" },
      { href: "/docs/webhooks", label: "Webhooks" },
      { href: "/docs/troubleshooting", label: "Troubleshooting" },
    ],
  },
  {
    title: "Features",
    description: "Deep dives on individual capabilities.",
    entries: [
      { href: "/features/instant-quotes", label: "Instant Quotes" },
      { href: "/features/booking", label: "Booking" },
      { href: "/features/ai-employee", label: "AI Employee" },
      { href: "/features/sms", label: "SMS" },
      { href: "/features/calculator-engine", label: "Calculator Engine" },
    ],
  },
  {
    title: "Account",
    description: "Get into your dashboard.",
    entries: [
      { href: "/login", label: "Login" },
      { href: "/signup", label: "Sign Up" },
      { href: "/reset-password", label: "Reset Password" },
    ],
  },
  {
    title: "Legal",
    description: "Policies and terms.",
    entries: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
      { href: "/terms", label: "Cookie Policy" },
    ],
  },
];

export default function SitemapPage() {
  useBreadcrumbSchema([
    { name: "Home", url: SITE_URL },
    { name: "Sitemap", url: `${SITE_URL}/sitemap` },
  ]);

  return (
    <MarketingLayout>
      <PageMeta
        title="Sitemap"
        description="Human-friendly index of every public WeFixTrades page — products, solutions, free tools, resources, documentation, and legal pages."
        canonical="/sitemap"
      />
      <V7PageShell>
        <V7Section padding="64px">
          <V7Container maxWidth={760}>
            <Reveal>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <p
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: mkt.accent,
                    marginBottom: 12,
                  }}
                >
                  Site Index
                </p>
                <h1
                  style={{
                    fontSize: "clamp(36px, 5vw, 56px)",
                    fontWeight: 700,
                    color: mkt.onDark,
                    margin: "0 0 16px",
                    letterSpacing: "-0.025em",
                    lineHeight: 1.1,
                    fontFamily: SANS,
                  }}
                >
                  Sitemap
                </h1>
                <p
                  style={{
                    fontSize: 16,
                    color: mkt.onDarkMuted,
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  Everything public on wefixtrades.com, organised so you can
                  find it. Looking for the crawler version?{" "}
                  <a
                    href="/sitemap.xml"
                    style={{ color: mkt.accent, textDecoration: "none" }}
                  >
                    /sitemap.xml
                  </a>
                  .
                </p>
              </div>
            </Reveal>
          </V7Container>
        </V7Section>

        <V7Section variant="subtle" padding="64px">
          <V7Container>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 24,
              }}
            >
              {SECTIONS.map((section, i) => (
                <Reveal key={section.title} delay={i * 0.04}>
                  <nav
                    aria-label={section.title}
                    style={{
                      background: mkt.sectionLight,
                      borderRadius: 18,
                      padding: "24px 22px",
                      border: `1px solid ${mkt.onDarkBorder}`,
                      height: "100%",
                    }}
                  >
                    <h2
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: mkt.onDark,
                        margin: "0 0 6px",
                        letterSpacing: "-0.01em",
                        fontFamily: SANS,
                      }}
                    >
                      {section.title}
                    </h2>
                    {section.description && (
                      <p
                        style={{
                          fontSize: 13,
                          color: mkt.onDarkMuted,
                          margin: "0 0 16px",
                          lineHeight: 1.5,
                        }}
                      >
                        {section.description}
                      </p>
                    )}
                    <ul
                      style={{
                        listStyle: "none",
                        padding: 0,
                        margin: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {section.entries.map((entry) => (
                        <li key={`${section.title}-${entry.href}-${entry.label}`}>
                          <Link
                            href={entry.href}
                            style={{
                              fontSize: 14,
                              color: mkt.onDarkMuted,
                              textDecoration: "none",
                              display: "inline-block",
                              padding: "2px 0",
                              transition: "color 0.15s ease",
                              fontFamily: SANS,
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.color = mkt.onDark;
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.color = mkt.onDarkMuted;
                            }}
                          >
                            {entry.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </nav>
                </Reveal>
              ))}
            </div>
          </V7Container>
        </V7Section>
      </V7PageShell>
    </MarketingLayout>
  );
}
