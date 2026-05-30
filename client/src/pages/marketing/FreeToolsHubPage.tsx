/**
 * /free-tools — Wave 11D D5 hub page.
 *
 * Top-level Free Tools surface with THREE sub-category sections:
 *   1. Local SEO Tools (7)   — cross-link upsell to MapGuard Suite
 *   2. AI Content Tools (~30) — cross-link upsell to ContentFlow
 *   3. Widget Tools (7, portal-gated) — cross-link upsell to QuoteQuick
 *
 * Per Alex's revised D5 directive: Free Tools stays its own top-level
 * category (parallel to Products), NOT a sub-of-MapGuard. Each category's
 * upsell points to the RIGHT paid product, not always MapGuard.
 *
 * See WORKSTREAMS/strategy-decisions-locked-2026-05-26.md.
 */

import { Link } from "wouter";
import { ArrowRight, Search, Sparkles, Layout as LayoutIcon, Check, Lock } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import {
  V7Hero,
  V7Section,
  V7Container,
  V7PageShell,
  V7SectionHeading,
} from "@/components/marketing/v7";
import { Reveal, MONO, SANS } from "@/components/effortel-blocks";
import { mkt } from "@/theme/tokens";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import { SITE_URL } from "@/lib/seo/pageMeta";

interface ToolEntry {
  name: string;
  href: string;
  blurb: string;
  portalGated?: boolean;
  /** Optional preview thumbnail (widget tools have real screenshots). */
  thumb?: string;
}

const LOCAL_SEO_TOOLS: ToolEntry[] = [
  { name: "Free Audit", href: "/tools/free-audit", blurb: "30-second local SEO health check + GBP rank grid." },
  { name: "Citation Checker", href: "/tools/citation-checker", blurb: "Find missing citations across 50+ directories." },
  { name: "Google Review Link Generator", href: "/tools/google-review-link-generator", blurb: "Get your direct review link in one click." },
  { name: "Local Rank Grid", href: "/tools/local-rank-grid", blurb: "5×5 geo-grid rank scan for any keyword." },
  { name: "Local Rank Tracker", href: "/tools/local-rank-tracker", blurb: "Multi-engine rank snapshot (Google + Brave + Maps)." },
  { name: "Local Rankflux", href: "/tools/local-rankflux", blurb: "Algorithm-update tracker for local search." },
  { name: "Local SERP Checker", href: "/tools/local-serp-checker", blurb: "Google + Maps SERP viewer, multi-country / language." },
];

const AI_CONTENT_TOOLS: ToolEntry[] = [
  { name: "Plumbing AI Content Prompts", href: "/tools/plumbing-ai-content-prompts", blurb: "30+ vetted prompts tuned for plumbing trades." },
  { name: "HVAC AI Content Prompts", href: "/tools/hvac-ai-content-prompts", blurb: "Service-call and seasonal content packs for HVAC." },
  { name: "Electrical AI Content Prompts", href: "/tools/electrical-ai-content-prompts", blurb: "Code-safe content prompts for electricians." },
  { name: "Roofing AI Content Prompts", href: "/tools/roofing-ai-content-prompts", blurb: "Inspection, repair, and storm-response prompts." },
  { name: "Landscaping AI Content Prompts", href: "/tools/landscaping-ai-content-prompts", blurb: "Seasonal + design content for landscapers." },
];

const WIDGET_TOOLS: ToolEntry[] = [
  { name: "Schema Generator", href: "/portal/free-tools/schema", blurb: "Auto-generate LocalBusiness JSON-LD for your site.", portalGated: true, thumb: "/free-tools/previews/schema.png" },
  { name: "FAQ Widget", href: "/portal/free-tools/faq", blurb: "Drop a branded FAQ block on any page.", portalGated: true, thumb: "/free-tools/previews/faq.png" },
  { name: "Hours Widget", href: "/portal/free-tools/hours", blurb: "Always-current hours from your GBP.", portalGated: true, thumb: "/free-tools/previews/hours.png" },
  { name: "Trust Badges", href: "/portal/free-tools/trust-badges", blurb: "Embed your accreditations and social proof.", portalGated: true, thumb: "/free-tools/previews/badges.png" },
  { name: "Review Link Widget", href: "/portal/free-tools/review-link", blurb: "One-tap Google review link on every page.", portalGated: true, thumb: "/free-tools/previews/review-link.png" },
  { name: "Callback Form", href: "/portal/free-tools/callback", blurb: "Lightweight callback request form.", portalGated: true, thumb: "/free-tools/previews/callback.png" },
  { name: "Service Area Map", href: "/portal/free-tools/service-area-map", blurb: "Show your service radius on an interactive map.", portalGated: true, thumb: "/free-tools/previews/service-area.png" },
];

const cardStyle = {
  background: mkt.sectionLight,
  borderRadius: 14,
  padding: "16px 18px",
  border: `1px solid ${mkt.onDarkBorder}`,
  display: "flex" as const,
  flexDirection: "column" as const,
  gap: 6,
};

function ToolCard({ tool }: { tool: ToolEntry }) {
  return (
    <Link href={tool.href} style={{ textDecoration: "none", display: "block", height: "100%" }}>
      <div style={cardStyle}>
        {/* Thumbnail — real preview for widget tools, branded gradient otherwise.
            Keeps every card visually consistent and less "text-only / unfinished". */}
        <div
          style={{
            borderRadius: 10,
            overflow: "hidden",
            aspectRatio: "16 / 9",
            marginBottom: 4,
            background: tool.thumb
              ? mkt.bg
              : "linear-gradient(135deg, rgba(13,60,252,0.18), rgba(13,60,252,0.04))",
            border: `1px solid ${mkt.onDarkBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {tool.thumb ? (
            <img
              src={tool.thumb}
              alt={`${tool.name} preview`}
              loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
            />
          ) : tool.portalGated ? (
            <Lock size={24} color={mkt.accent} strokeWidth={1.6} />
          ) : (
            <Check size={24} color={mkt.accent} strokeWidth={1.6} />
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {tool.portalGated ? (
            <Lock size={14} color={mkt.accent} strokeWidth={2} />
          ) : (
            <Check size={14} color={mkt.accent} strokeWidth={2} />
          )}
          <span style={{ fontSize: 15, fontWeight: 600, color: mkt.onDark, fontFamily: SANS }}>
            {tool.name}
          </span>
        </div>
        <p style={{ fontSize: 13, color: mkt.onDarkMuted, margin: 0, lineHeight: 1.5, fontFamily: SANS }}>
          {tool.blurb}
        </p>
        {tool.portalGated && (
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: mkt.onDarkFaint }}>
            Free in your portal
          </span>
        )}
      </div>
    </Link>
  );
}

function UpsellRibbon({ text, href, label }: { text: string; href: string; label: string }) {
  return (
    <div
      style={{
        marginTop: 20,
        padding: "14px 18px",
        background: "rgba(13,60,252,0.06)",
        border: `1px solid ${mkt.onDarkBorder}`,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <p style={{ fontSize: 14, color: mkt.onDark, margin: 0, fontFamily: SANS, lineHeight: 1.45 }}>
        {text}
      </p>
      <Link
        href={href}
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
          whiteSpace: "nowrap",
        }}
      >
        {label} <ArrowRight size={14} />
      </Link>
    </div>
  );
}

export default function FreeToolsHubPage() {
  useBreadcrumbSchema([
    { name: "Home", url: SITE_URL },
    { name: "Free Tools", url: `${SITE_URL}/free-tools` },
  ]);

  return (
    <MarketingLayout>
      <PageMeta
        title="Free Tools for Trades — Local SEO, AI Content, Widgets | WeFixTrades"
        description="21 free tools across local SEO, AI content, and customer engagement. No signup required. Built by WeFixTrades for plumbers, electricians, HVAC, roofers, and trades."
        canonical="/free-tools"
      />
      <V7PageShell>
        <V7Hero
          productName="Free Tools"
          eyebrow="Built by WeFixTrades. Free to use. No signup."
          headline={<>Free tools to grow<br/><span style={{ color: mkt.accent }}>your trade business.</span></>}
          sub="21 free tools across local SEO, AI content, and customer engagement. Use them today — no credit card, no signup."
          ctas={[
            { label: "Start with Free Audit", href: "/tools/free-audit" },
          ]}
        />

        {/* ── 1. Local SEO Tools ──────────────────────────────────── */}
        <V7Section padding="72px" id="local-seo" variant="default">
          <V7Container>
            <V7SectionHeading
              eyebrow="Local SEO Tools (7)"
              title={<><Search size={32} strokeWidth={1.6} style={{ display: "inline-block", marginRight: 12, verticalAlign: "middle", color: mkt.accent }} />Find, fix, and monitor your local presence.</>}
              sub="From your Google Business Profile to citation directories — a complete free toolkit for local SEO."
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 14,
              }}
            >
              {LOCAL_SEO_TOOLS.map((t, i) => (
                <Reveal key={t.href} delay={i * 0.03}>
                  <ToolCard tool={t} />
                </Reveal>
              ))}
            </div>
            <UpsellRibbon
              text="Want continuous monitoring + monthly optimization work done for you?"
              href="/mapguard-suite"
              label="See MapGuard Suite"
            />
          </V7Container>
        </V7Section>

        {/* ── 2. AI Content Tools ─────────────────────────────────── */}
        <V7Section padding="72px" id="ai-content" variant="subtle">
          <V7Container>
            <V7SectionHeading
              eyebrow="AI Content Tools (30+ trade prompts)"
              title={<><Sparkles size={32} strokeWidth={1.6} style={{ display: "inline-block", marginRight: 12, verticalAlign: "middle", color: mkt.accent }} />Content prompts, tuned per trade.</>}
              sub="30+ vetted prompt packs for plumbers, HVAC, electricians, roofers, landscapers, and more. Free to copy. Free to remix."
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 14,
              }}
            >
              {AI_CONTENT_TOOLS.map((t, i) => (
                <Reveal key={t.href} delay={i * 0.03}>
                  <ToolCard tool={t} />
                </Reveal>
              ))}
            </div>
            <div style={{ marginTop: 18, textAlign: "center" }}>
              <Link
                href="/tools/plumbing-ai-content-prompts"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  color: mkt.onDarkMuted,
                  textDecoration: "none",
                  fontFamily: SANS,
                }}
              >
                Browse all 30+ trade prompt packs <ArrowRight size={14} />
              </Link>
            </div>
            <UpsellRibbon
              text="Want auto-publishing + AI image generation + brand-voice matching?"
              href="/products/contentflow"
              label="See ContentFlow"
            />
          </V7Container>
        </V7Section>

        {/* ── 3. Widgets ──────────────────────────────────────────── */}
        <V7Section padding="72px" id="widgets" variant="default">
          <V7Container>
            <V7SectionHeading
              eyebrow="Widgets (7, free in your portal)"
              title={<><LayoutIcon size={32} strokeWidth={1.6} style={{ display: "inline-block", marginRight: 12, verticalAlign: "middle", color: mkt.accent }} />Drop-in widgets for any website.</>}
              sub="7 production-ready widgets you can embed on any site. Free inside your WeFixTrades portal — sign in to grab the embed code."
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 14,
              }}
            >
              {WIDGET_TOOLS.map((t, i) => (
                <Reveal key={t.href} delay={i * 0.03}>
                  <ToolCard tool={t} />
                </Reveal>
              ))}
            </div>
            <UpsellRibbon
              text="Want the full lead-capture widget experience — instant quotes, booking, deposits?"
              href="/products/quickquotepro"
              label="See QuoteQuick"
            />
          </V7Container>
        </V7Section>
      </V7PageShell>
    </MarketingLayout>
  );
}
