import { useEffect } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { OptimizedImage } from "@/components/ui/Picture";
import { V7Hero, V7PageShell } from "@/components/marketing/v7";
import { mkt } from "@/theme/tokens";
import mapguardIcon from "@assets/mapguard-icon_1772080241423.webp";
import reputationshieldIcon from "@assets/reputationshield-icon_1772080241309.webp";
import socialsyncIcon from "@assets/socialsync-icon_1772080241338.webp";
import { MAPGUARD, REPUTATIONSHIELD, SOCIALSYNC, RANKFLOW, lowestMonthly, formatPrice } from "@/config/pricing";

const services = [
  {
    id: "mapguard",
    icon: mapguardIcon,
    title: "MapGuard",
    subtitle: "Google Maps & GBP Optimisation",
    description:
      "Get found by local customers searching for your trade. We optimise your Google Business Profile, build citations, and manage your local presence so you rank higher on Maps.",
    included: [
      "Full Google Business Profile audit and optimisation",
      "Local citation building across 40+ directories",
      "Monthly GBP posts and photo updates",
      "Review response strategy and templates",
      "Competitor tracking and ranking reports",
    ],
    from: `From ${formatPrice(lowestMonthly(MAPGUARD)!)}/mo`,
  },
  {
    id: "rankflow",
    icon: mapguardIcon,
    title: "RankFlow",
    subtitle: "Done-for-You Local SEO",
    description:
      "We improve your local search visibility every month. Keyword targeting, page optimization, local listings, and clear progress tracking \u2014 all handled for you.",
    included: [
      "Keyword research & on-page optimization",
      "SEO page creation for your services (Growth+)",
      "Local citation & directory building",
      "Google Search Console monitoring",
      "Monthly progress dashboard",
    ],
    from: `From ${formatPrice(lowestMonthly(RANKFLOW)!)}/mo`,
  },
  {
    id: "reputationshield",
    icon: reputationshieldIcon,
    title: "ReputationShield",
    subtitle: "Review & Reputation Management",
    description:
      "Build trust and win more jobs with a strong online reputation. Automated review requests after every job, response templates, and monitoring across Google, Facebook, and more.",
    included: [
      "Automated review request SMS/email after each job",
      "Review response templates and monitoring",
      "Negative review alerts and escalation workflow",
      "Review widget for your website",
      "Monthly reputation score report",
    ],
    from: `From ${formatPrice(lowestMonthly(REPUTATIONSHIELD)!)}/mo`,
  },
  {
    id: "socialsync",
    icon: socialsyncIcon,
    title: "SocialSync",
    subtitle: "Social Media Management",
    description:
      "Stay visible and top-of-mind with consistent social media presence. We create branded content, schedule posts, and run lead-gen campaigns on Facebook and Instagram.",
    included: [
      "12 branded posts per month (Facebook + Instagram)",
      "Content calendar and approval workflow",
      "Hashtag strategy and local targeting",
      "Monthly engagement and follower report",
      "Optional paid ad management (budget separate)",
    ],
    from: `From ${formatPrice(lowestMonthly(SOCIALSYNC)!)}/mo`,
  },
];

const S = {
  hero: {
    background: `linear-gradient(135deg, ${mkt.dark}, ${mkt.darkHover})`,
    padding: "80px 24px 60px",
    textAlign: "center" as const,
  },
  heroH1: {
    fontSize: "clamp(32px, 5vw, 48px)",
    fontWeight: 700,
    color: mkt.onDark,
    margin: "0 0 16px",
    letterSpacing: "-0.025em",
  },
  heroSub: {
    fontSize: 18,
    color: mkt.onDarkMuted,
    margin: 0,
    maxWidth: 600,
    marginLeft: "auto",
    marginRight: "auto",
    lineHeight: 1.6,
  },
  section: {
    padding: "60px 24px",
  },
  inner: {
    maxWidth: 960,
    margin: "0 auto",
  },
  card: {
    background: mkt.bg,
    borderRadius: 16,
    padding: "36px 32px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
    border: `1px solid ${mkt.border}`,
    marginBottom: 32,
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 20,
    marginBottom: 16,
    flexWrap: "wrap" as const,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 14,
    background: mkt.accentTint,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden" as const,
    flexShrink: 0,
  },
  icon: {
    width: 48,
    height: 48,
    objectFit: "contain" as const,
  },
  titleGroup: {
    flex: 1,
    minWidth: 200,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: mkt.text,
    margin: "0 0 4px",
  },
  subtitle: {
    fontSize: 14,
    fontWeight: 500,
    color: mkt.textMuted,
    margin: 0,
  },
  from: {
    fontSize: 15,
    fontWeight: 700,
    color: mkt.accent,
    flexShrink: 0,
  },
  desc: {
    fontSize: 15,
    color: mkt.textMuted,
    lineHeight: 1.7,
    margin: "0 0 20px",
  },
  includedLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: mkt.text,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    marginBottom: 12,
  },
  bullet: {
    fontSize: 14,
    color: mkt.textMuted,
    lineHeight: 1.6,
    paddingLeft: 20,
    position: "relative" as const,
    marginBottom: 8,
  },
  dot: {
    position: "absolute" as const,
    left: 0,
    top: 2,
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: mkt.accent,
    flexShrink: 0,
  },
  ctaSection: {
    background: mkt.surface,
    padding: "60px 24px",
    textAlign: "center" as const,
  },
  ctaTitle: {
    fontSize: "clamp(24px, 4vw, 36px)",
    fontWeight: 700,
    color: mkt.text,
    margin: "0 0 12px",
  },
  ctaSub: {
    fontSize: 16,
    color: mkt.textMuted,
    margin: "0 0 28px",
    lineHeight: 1.6,
  },
  ctaBtn: {
    display: "inline-block",
    padding: "12px 32px",
    borderRadius: 14,
    background: mkt.accent,
    color: mkt.onDark,
    fontSize: 15,
    fontWeight: 600,
    textDecoration: "none",
    transition: "background 0.15s ease",
  },
};

export default function SolutionsVisibility() {
  // Title + meta tags handled by <PageMeta> below.

  return (
    <MarketingLayout>
      <PageMeta
        title="Visibility solutions — get found, trusted, and booked"
        description="Local SEO, Google Maps presence, reputation management, and social syndication add-ons that put your trade business in front of customers ready to book."
        canonical="/solutions/visibility"
        keywords={["trades local seo", "google maps for trades", "trades reputation management"]}
      />
      <V7PageShell>
      <div data-testid="solutions-visibility-page">
        <V7Hero
          productName="Visibility Solutions"
          eyebrow="Customers can't book you if they can't find you."
          headline={<>Get found.<br/>Get trusted.<br/><span style={{ color: mkt.accent }}>Get booked.</span></>}
          sub="Visibility add-ons that put your business in front of local customers — on Google, social media, and across the web."
        />

        <div style={{ ...S.section, background: "#F7F8FA" }}>
          <div style={S.inner}>
            {services.map((svc) => (
              <div key={svc.id} style={S.card} data-testid={`card-solution-${svc.id}`}>
                <div style={S.cardHeader}>
                  <div style={S.iconWrap}>
                    <OptimizedImage
                      src={svc.icon}
                      alt={svc.title}
                      width={48}
                      height={48}
                      style={S.icon}
                      loading="lazy"
                    />
                  </div>
                  <div style={S.titleGroup}>
                    <h2 style={S.title}>{svc.title}</h2>
                    <p style={S.subtitle}>{svc.subtitle}</p>
                  </div>
                  <span style={S.from} data-testid={`text-price-${svc.id}`}>{svc.from}</span>
                </div>
                <p style={S.desc}>{svc.description}</p>
                <div style={S.includedLabel}>What's included</div>
                <div>
                  {svc.included.map((item, i) => (
                    <div key={i} style={S.bullet}>
                      <span style={S.dot} />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={S.ctaSection} data-testid="section-solutions-cta">
          <h2 style={S.ctaTitle}>Ready to grow your visibility?</h2>
          <p style={S.ctaSub}>
            Bundle visibility add-ons with QuoteQuick or our 24/7 Assistants for the full growth stack.
          </p>
          <Link
            href="/contact"
            style={S.ctaBtn}
            data-testid="link-solutions-contact"
          >
            Get in Touch
          </Link>
        </div>
      </div>
      </V7PageShell>
    </MarketingLayout>
  );
}
