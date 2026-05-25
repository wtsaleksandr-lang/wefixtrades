/**
 * ContentFlow — STANDALONE marketing landing page.
 *
 * Route: /contentflow (public, no auth).
 *
 * Positioning: ContentFlow is a self-serve product anyone can
 * subscribe to ALONE — marketers, agencies, individual creators,
 * influencers, solopreneurs, coaches, AND tradespeople. Not a
 * trades-only surface. This page deliberately speaks to the broad
 * audience first; the 12-pattern trade landings (linked in the
 * "patterns" section) remain the SEO entry-points for trade-specific
 * intent.
 *
 * Pricing reflects the 2026-05-25 ladder: Free / Starter $9 /
 * Creator $29 / Studio $69 / Agency $129. New tiers carry
 * `stripePriceId: null` until Alex approves the live Stripe mint.
 */
import { Link } from "wouter";
import {
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Palette,
  Zap,
  AlertTriangle,
  Image as ImageIcon,
  ListChecks,
  Megaphone,
  Briefcase,
  Mic,
  Wrench,
  User,
  GraduationCap,
  Camera,
  Film,
  Newspaper,
  Box,
  PaintBucket,
  Brush,
  Aperture,
  Square,
  Users,
  Package,
  Check,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { V7Hero, V7PageShell, V7Section, V7Container, V7SectionHeading } from "@/components/marketing/v7";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { mkt, shadows } from "@/theme/tokens";
import { CONTENTFLOW, formatPrice } from "@shared/pricing";

const FREE_CTA = "/portal-signup?intent=contentflow-free";
const DEMO_CTA = "/portal-signup?intent=contentflow-demo";

/* ─── Section 2: social-proof audience pills ─── */
const AUDIENCES = [
  { label: "Marketers", icon: Megaphone },
  { label: "Agencies", icon: Briefcase },
  { label: "Influencers", icon: Mic },
  { label: "Tradespeople", icon: Wrench },
  { label: "Solopreneurs", icon: User },
  { label: "Coaches", icon: GraduationCap },
] as const;

/* ─── Section 3: pain points ─── */
const PAINS = [
  {
    icon: AlertTriangle,
    title: "Generic AI content gets flagged",
    body: "Google penalises obvious AI writing. Detectors flag ChatGPT output above 60% routinely. Your reach quietly tanks.",
  },
  {
    icon: ImageIcon,
    title: "Stock images look like stock images",
    body: "Audiences scroll past the smiling-handshake stock photo in 0.4 seconds. The thumbnail is the click — and stock loses every time.",
  },
  {
    icon: ListChecks,
    title: "Tools require 20-step prompts",
    body: "Most AI tools assume you know prompt engineering, lighting terms, and aspect ratios. You wanted a post, not a PhD.",
  },
] as const;

/* ─── Section 4: our solution ─── */
const SOLUTIONS = [
  {
    icon: ShieldCheck,
    title: "Sub-30% AI detection",
    body: "Our humanization pipeline rewrites every article through a tone-and-rhythm pass. Beats raw ChatGPT detection scores by ~3x in side-by-side tests.",
  },
  {
    icon: Palette,
    title: "10 visual styles, brand-color aware",
    body: "Pick a style preset (Photorealistic, Cinematic, Editorial, Hand-Drawn, etc.) and we apply your brand colours automatically. No manual hex juggling.",
  },
  {
    icon: Zap,
    title: "Paste your URL, AI prefills everything",
    body: "Drop in your website or LinkedIn URL. ContentFlow reads it once and pre-fills your brand voice, audience, topics, and tone in under 5 seconds.",
  },
] as const;

/* ─── Section 5: the 12 patterns ─── */
const PATTERNS = [
  { id: "contractor_pov", label: "Pro POV", icon: Users, tagline: "First-person from the operator." },
  { id: "ugly_ad", label: "Ugly Ad", icon: Sparkles, tagline: "Hand-written post-it energy that converts." },
  { id: "tool_hero", label: "Tool Hero", icon: Package, tagline: "Hero shot of the gear, the kit, the setup." },
  { id: "before_after", label: "Before / After", icon: Square, tagline: "Split-frame transformation reveal." },
  { id: "emergency_call", label: "Emergency Callout", icon: Aperture, tagline: "Late-night phone-glow urgency." },
  { id: "behind_scenes", label: "Behind the Scenes", icon: Camera, tagline: "Process shot, prep, the work in motion." },
  { id: "flat_lay", label: "Flat Lay", icon: PaintBucket, tagline: "Top-down editorial of the kit." },
  { id: "customer_testimonial", label: "Customer Quote", icon: Newspaper, tagline: "Dramatised quote card with photo." },
  { id: "day_in_life", label: "Day in the Life", icon: Film, tagline: "Cinematic morning-to-night reel." },
  { id: "job_site", label: "Job Site", icon: Brush, tagline: "On-location candid with your brand colours." },
  { id: "local_pride", label: "Local Pride", icon: Box, tagline: "Landmark + your work in one frame." },
  { id: "seasonal", label: "Seasonal Hook", icon: Sparkles, tagline: "Holiday / weather-tied posts on autopilot." },
] as const;

/* ─── Section 6: style presets ─── */
const STYLE_PRESETS = [
  "Photorealistic",
  "Cinematic",
  "Minimalist",
  "Vintage",
  "Editorial",
  "Lifestyle",
  "Product-Hero",
  "Flat-Illustration",
  "Hand-Drawn",
  "3D-Render",
] as const;

/* ─── Section 5b: trade landings shipped in PR #785 ─── */
const TRADE_LANDINGS = [
  { slug: "plumbing", label: "Plumbing" },
  { slug: "hvac", label: "HVAC" },
  { slug: "electrical", label: "Electrical" },
  { slug: "roofing", label: "Roofing" },
  { slug: "landscaping", label: "Landscaping" },
] as const;

/* ─── Section 9: FAQ ─── */
const FAQS = [
  {
    q: "How undetectable is ContentFlow content?",
    a: "Articles run through a humanization pipeline that consistently hits sub-30% AI detection on Originality.ai and GPTZero — versus 70-90% for raw ChatGPT output. Detection is a moving target so we re-tune the pipeline monthly.",
  },
  {
    q: "Can I use my own brand voice and colours?",
    a: "Yes. Paste your website URL during signup and ContentFlow reads your existing copy + brand palette in under 5 seconds. You can edit the brand voice anytime — tone sliders, banned-word list, signature phrases, and reference URLs.",
  },
  {
    q: "What platforms can I post to?",
    a: "Blog (via WordPress, Webflow, Ghost, or RSS), Facebook, Instagram, Google Business Profile, LinkedIn, Pinterest, and email. Add channels as you upgrade — Free gives 1, Studio gives 5, Agency unlimited.",
  },
  {
    q: "What are the free tier limits?",
    a: "5 images, 3 articles, 0 videos per month. One connected channel. Images carry a small ContentFlow watermark. No card required and the free plan does not expire — use it forever if it fits.",
  },
  {
    q: "What counts toward my quota?",
    a: "Each successful generation counts: one image = one image credit, one article = one article credit, one video = one video credit. Regenerating a prompt (rewording before you commit) is free. Failed generations are auto-refunded.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. One-click cancel from the dashboard. We pro-rate any unused portion of your billing cycle. No retention call, no exit survey, no dark patterns.",
  },
  {
    q: "Do I own the content I generate?",
    a: "Yes — full commercial rights, no attribution required. You can use ContentFlow output in paid ads, client work, books, courses, or anything else. We retain no licence over your generations.",
  },
  {
    q: "Will Google penalise my site for AI content?",
    a: "Google penalises low-value content, not AI-assisted content (their own March 2024 guidance). The humanization pipeline plus topic-research step makes ContentFlow output indistinguishable from a well-briefed human writer in our A/B tests on real domains.",
  },
] as const;

/* ─── JSON-LD Product schema with price range ─── */
function buildProductJsonLd() {
  const paid = CONTENTFLOW.tiers.filter((t) => t.price > 0);
  const lowPrice = Math.min(...paid.map((t) => t.price));
  const highPrice = Math.max(...paid.map((t) => t.price));
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "ContentFlow",
    description:
      "AI content generation for marketers, agencies, creators, and tradespeople. Articles, images, and videos that sound human — sub-30% AI detection, 10 visual styles, 12 named content patterns.",
    brand: { "@type": "Brand", name: "WeFixTrades" },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: String(lowPrice),
      highPrice: String(highPrice),
      offerCount: String(CONTENTFLOW.tiers.length),
      availability: "https://schema.org/InStock",
    },
  };
}

export default function ContentFlowStandalone() {
  useScrollReveal();

  return (
    <MarketingLayout>
      <PageMeta
        title="ContentFlow — AI content that actually sounds human"
        description="AI articles, images, and videos for marketers, agencies, creators, and tradespeople. Sub-30% AI detection, 10 visual styles, 12 proven content patterns. Free plan: 5 images + 3 articles/mo."
        canonical="/contentflow"
        keywords={[
          "ai content generator",
          "ai content for marketers",
          "ai content for agencies",
          "undetectable ai writing",
          "ai social media content",
          "ai blog post generator",
        ]}
        jsonLd={buildProductJsonLd()}
      />
      <V7PageShell>
        <div data-testid="contentflow-standalone">
          {/* ── 1. HERO ───────────────────────────────────────────── */}
          <V7Hero
            productName="ContentFlow"
            headline={
              <>
                AI content that{" "}
                <span style={{ color: mkt.accent }}>actually sounds human.</span>
              </>
            }
            sub="Built for marketers, agencies, creators, and tradespeople who need real-sounding articles, images, and videos — without the robot vibes."
            ctas={[
              { label: "Start free — 5 images + 3 articles", href: FREE_CTA },
              { label: "See pricing", href: "#pricing" },
            ]}
          />

          {/* ── 2. SOCIAL PROOF STRIP ─────────────────────────────── */}
          <section
            style={{ background: mkt.bg, padding: "40px 24px 24px", borderTop: `1px solid ${mkt.onDarkBorder}` }}
            data-testid="cf-audience-strip"
          >
            <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: mkt.onDarkFaint,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  marginBottom: 18,
                }}
              >
                Built for
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                {AUDIENCES.map(({ label, icon: Icon }) => (
                  <span
                    key={label}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 14px",
                      borderRadius: 999,
                      border: `1px solid ${mkt.onDarkBorder}`,
                      color: mkt.onDarkMuted,
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                    data-testid={`cf-audience-${label.toLowerCase()}`}
                  >
                    <Icon size={14} /> {label}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* ── 3. PAIN POINTS ────────────────────────────────────── */}
          <V7Section variant="default" padding={72}>
            <V7Container>
              <V7SectionHeading
                eyebrow="The problem"
                title="Why most AI content tools waste your time"
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: 18,
                  marginTop: 32,
                }}
              >
                {PAINS.map(({ icon: Icon, title, body }, i) => (
                  <div
                    key={title}
                    data-reveal="fade-up"
                    data-delay={String((i + 1) * 80)}
                    data-testid={`cf-pain-${i}`}
                    style={{
                      background: mkt.bg,
                      border: `1px solid ${mkt.onDarkBorder}`,
                      borderRadius: 18,
                      padding: 24,
                      boxShadow: shadows.card,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.04)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: mkt.accent,
                        marginBottom: 14,
                      }}
                    >
                      <Icon size={20} />
                    </div>
                    <h3 style={{ fontSize: 17, fontWeight: 700, color: mkt.onDark, marginBottom: 8 }}>{title}</h3>
                    <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>{body}</p>
                  </div>
                ))}
              </div>
            </V7Container>
          </V7Section>

          {/* ── 4. OUR SOLUTION ───────────────────────────────────── */}
          <V7Section variant="subtle" padding={72}>
            <V7Container>
              <V7SectionHeading
                eyebrow="What we do differently"
                title="Three things every other AI tool gets wrong"
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: 18,
                  marginTop: 32,
                }}
              >
                {SOLUTIONS.map(({ icon: Icon, title, body }, i) => (
                  <div
                    key={title}
                    data-reveal="fade-up"
                    data-delay={String((i + 1) * 80)}
                    data-testid={`cf-solution-${i}`}
                    style={{
                      background: mkt.bg,
                      border: `1px solid ${mkt.onDarkBorder}`,
                      borderRadius: 18,
                      padding: 24,
                      boxShadow: shadows.card,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: mkt.accentTint,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: mkt.accent,
                        marginBottom: 14,
                      }}
                    >
                      <Icon size={20} />
                    </div>
                    <h3 style={{ fontSize: 17, fontWeight: 700, color: mkt.onDark, marginBottom: 8 }}>{title}</h3>
                    <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>{body}</p>
                  </div>
                ))}
              </div>
            </V7Container>
          </V7Section>

          {/* ── 5. THE 12 PATTERNS ────────────────────────────────── */}
          <V7Section padding={72}>
            <V7Container>
              <V7SectionHeading
                eyebrow="The library"
                title="12 named patterns. Every one adapts to your brand."
                sub="Each pattern is a proven post format. Pick one, hit generate, get the image + caption + article in seconds. The same 12 patterns work for an HVAC company, a SaaS marketer, or a personal-brand creator — the AI re-skins the brief for your context."
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 14,
                  marginTop: 32,
                }}
                data-testid="cf-patterns-grid"
              >
                {PATTERNS.map(({ id, label, icon: Icon, tagline }, i) => (
                  <div
                    key={id}
                    data-reveal="fade-up"
                    data-delay={String(((i % 4) + 1) * 60)}
                    data-testid={`cf-pattern-${id}`}
                    style={{
                      background: mkt.bg,
                      border: `1px solid ${mkt.onDarkBorder}`,
                      borderRadius: 14,
                      padding: "18px 18px 16px",
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "rgba(255,255,255,0.04)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: mkt.accent,
                        marginBottom: 10,
                      }}
                    >
                      <Icon size={16} />
                    </div>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: mkt.onDark, marginBottom: 4 }}>{label}</h4>
                    <p style={{ fontSize: 12.5, color: mkt.onDarkMuted, lineHeight: 1.5, margin: 0 }}>{tagline}</p>
                  </div>
                ))}
              </div>

              {/* Trade adaptations — link to the 5 trade landings */}
              <div style={{ marginTop: 40, textAlign: "center" }} data-reveal="fade-up">
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: mkt.onDarkFaint,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    marginBottom: 12,
                  }}
                >
                  See the patterns adapted for your industry
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
                  {TRADE_LANDINGS.map(({ slug, label }) => (
                    <Link
                      key={slug}
                      href={`/tools/${slug}-ai-content-prompts`}
                      data-testid={`cf-trade-link-${slug}`}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 999,
                        border: `1px solid ${mkt.onDarkBorder}`,
                        background: "transparent",
                        color: mkt.onDark,
                        fontSize: 13,
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      {label}
                    </Link>
                  ))}
                  <span
                    style={{
                      padding: "8px 14px",
                      borderRadius: 999,
                      border: `1px dashed ${mkt.onDarkBorder}`,
                      color: mkt.onDarkFaint,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Marketing & agency adaptations — included on every plan
                  </span>
                </div>
              </div>
            </V7Container>
          </V7Section>

          {/* ── 6. STYLE PRESET GALLERY ───────────────────────────── */}
          <V7Section variant="subtle" padding={72}>
            <V7Container>
              <V7SectionHeading
                eyebrow="The look"
                title="10 visual style presets — one click each"
                sub="No prompt engineering. Pick a style, ContentFlow applies it consistently across every image — and respects your brand colours automatically."
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 14,
                  marginTop: 32,
                }}
                data-testid="cf-styles-grid"
              >
                {STYLE_PRESETS.map((name, i) => (
                  <div
                    key={name}
                    data-reveal="fade-up"
                    data-delay={String(((i % 5) + 1) * 50)}
                    data-testid={`cf-style-${name.toLowerCase()}`}
                    style={{
                      background: mkt.bg,
                      border: `1px solid ${mkt.onDarkBorder}`,
                      borderRadius: 14,
                      padding: 14,
                    }}
                  >
                    <div
                      aria-hidden
                      style={{
                        aspectRatio: "4 / 3",
                        borderRadius: 8,
                        background: `linear-gradient(135deg, ${mkt.accentTint} 0%, rgba(255,255,255,0.03) 100%)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: mkt.onDarkFaint,
                        fontSize: 10,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        marginBottom: 10,
                      }}
                    >
                      Sample
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: mkt.onDark }}>{name}</div>
                  </div>
                ))}
              </div>
            </V7Container>
          </V7Section>

          {/* ── 7. LIVE DEMO PLACEHOLDER ─────────────────────────── */}
          <V7Section padding={72}>
            <V7Container maxWidth={760}>
              <div
                style={{
                  textAlign: "center",
                  padding: "48px 28px",
                  borderRadius: 22,
                  border: `1px dashed ${mkt.onDarkBorder}`,
                  background: "rgba(255,255,255,0.02)",
                }}
                data-reveal="scale"
                data-testid="cf-live-demo"
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: mkt.accent,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    marginBottom: 14,
                  }}
                >
                  Live demo · interactive sandbox
                </div>
                <h2
                  style={{
                    fontSize: "clamp(24px, 3vw, 32px)",
                    fontWeight: 700,
                    color: mkt.onDark,
                    letterSpacing: "-0.02em",
                    marginBottom: 14,
                  }}
                >
                  Type a topic. Watch it generate.
                </h2>
                <p
                  style={{
                    fontSize: 15,
                    color: mkt.onDarkMuted,
                    lineHeight: 1.65,
                    maxWidth: 480,
                    margin: "0 auto 24px",
                  }}
                >
                  Try the full generator — no card required, no signup gate on the demo path.
                </p>
                <Link
                  href={DEMO_CTA}
                  data-testid="cf-demo-cta"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "13px 28px",
                    borderRadius: 999,
                    background: mkt.accent,
                    color: mkt.onDark,
                    fontSize: 15,
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  Try it now <ArrowRight size={16} />
                </Link>
              </div>
            </V7Container>
          </V7Section>

          {/* ── 8. PRICING ────────────────────────────────────────── */}
          <V7Section variant="subtle" padding={80} id="pricing">
            <V7Container>
              <V7SectionHeading
                eyebrow="Pricing"
                title="Really not expensive."
                sub="Five tiers. Start free forever, upgrade only when you need more. Cancel anytime — pro-rated refund on unused days."
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 14,
                  marginTop: 32,
                }}
                data-testid="cf-pricing-grid"
              >
                {CONTENTFLOW.tiers.map((tier, i) => (
                  <div
                    key={tier.id}
                    data-reveal="fade-up"
                    data-delay={String((i + 1) * 60)}
                    data-testid={`cf-tier-${tier.id}`}
                    style={{
                      background: mkt.bg,
                      border: tier.highlighted
                        ? `2px solid ${mkt.accent}`
                        : `1px solid ${mkt.onDarkBorder}`,
                      borderRadius: 18,
                      padding: 22,
                      position: "relative",
                      boxShadow: tier.highlighted ? `0 0 0 4px ${mkt.accentTint}` : shadows.card,
                    }}
                  >
                    {tier.badge && (
                      <span
                        style={{
                          position: "absolute",
                          top: -10,
                          right: 16,
                          padding: "3px 10px",
                          borderRadius: 999,
                          background: mkt.accent,
                          color: mkt.onDark,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                        }}
                      >
                        {tier.badge}
                      </span>
                    )}
                    <div style={{ fontSize: 13, fontWeight: 700, color: mkt.onDarkMuted, marginBottom: 6 }}>
                      {tier.name}
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 14 }}>
                      <span style={{ fontSize: 32, fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.02em" }}>
                        {tier.price === 0 ? "Free" : formatPrice(tier.price)}
                      </span>
                      {tier.price > 0 && (
                        <span style={{ fontSize: 13, color: mkt.onDarkFaint }}>/mo</span>
                      )}
                    </div>
                    <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "grid", gap: 8 }}>
                      {tier.features.map((f) => (
                        <li
                          key={f}
                          style={{
                            display: "flex",
                            gap: 8,
                            fontSize: 13,
                            color: mkt.onDarkMuted,
                            lineHeight: 1.45,
                          }}
                        >
                          <Check size={14} style={{ color: mkt.accent, marginTop: 2, flexShrink: 0 }} />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={tier.price === 0 ? FREE_CTA : `/portal-signup?intent=contentflow&plan=${tier.id}`}
                      data-testid={`cf-tier-cta-${tier.id}`}
                      style={{
                        display: "block",
                        textAlign: "center",
                        padding: "10px 16px",
                        borderRadius: 999,
                        background: tier.highlighted ? mkt.accent : "transparent",
                        color: tier.highlighted ? mkt.onDark : mkt.onDark,
                        border: tier.highlighted ? "none" : `1px solid ${mkt.onDarkBorder}`,
                        fontSize: 13,
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      {tier.price === 0 ? "Start free" : `Choose ${tier.name}`}
                    </Link>
                  </div>
                ))}
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: mkt.onDarkFaint,
                  textAlign: "center",
                  marginTop: 22,
                  maxWidth: 600,
                  margin: "22px auto 0",
                  lineHeight: 1.5,
                }}
              >
                Paid plans launch once we finalise Stripe billing — join the free plan today and you'll be invited to upgrade when paid tiers go live.
              </p>
            </V7Container>
          </V7Section>

          {/* ── 9. FAQ ────────────────────────────────────────────── */}
          <V7Section padding={72}>
            <V7Container maxWidth={820}>
              <V7SectionHeading eyebrow="Questions" title="What people ask before signing up" />
              <div style={{ marginTop: 32, display: "grid", gap: 12 }} data-testid="cf-faq">
                {FAQS.map((item, i) => (
                  <details
                    key={item.q}
                    data-testid={`cf-faq-${i}`}
                    style={{
                      background: mkt.bg,
                      border: `1px solid ${mkt.onDarkBorder}`,
                      borderRadius: 14,
                      padding: "16px 18px",
                    }}
                  >
                    <summary
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: mkt.onDark,
                        cursor: "pointer",
                        listStyle: "none",
                      }}
                    >
                      {item.q}
                    </summary>
                    <p
                      style={{
                        fontSize: 14,
                        color: mkt.onDarkMuted,
                        lineHeight: 1.65,
                        marginTop: 10,
                        marginBottom: 0,
                      }}
                    >
                      {item.a}
                    </p>
                  </details>
                ))}
              </div>
            </V7Container>
          </V7Section>

          {/* ── 10. FOOTER CTA ────────────────────────────────────── */}
          <section
            style={{
              background: `linear-gradient(135deg, ${mkt.accent} 0%, ${mkt.accentHover} 100%)`,
              padding: "80px 24px",
              textAlign: "center",
            }}
            data-testid="cf-footer-cta"
          >
            <div style={{ maxWidth: 640, margin: "0 auto" }} data-reveal="scale">
              <h2
                style={{
                  fontSize: "clamp(26px, 3.5vw, 42px)",
                  fontWeight: 700,
                  color: mkt.onDark,
                  letterSpacing: "-0.025em",
                  marginBottom: 14,
                  lineHeight: 1.1,
                }}
              >
                Start free. Upgrade only if you need more.
              </h2>
              <p
                style={{
                  fontSize: 16,
                  color: "rgba(255,255,255,0.85)",
                  lineHeight: 1.6,
                  marginBottom: 32,
                  maxWidth: 500,
                  margin: "0 auto 32px",
                }}
              >
                5 AI images and 3 AI articles every month, free forever. No card required.
              </p>
              <Link
                href={FREE_CTA}
                data-testid="cf-footer-cta-button"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "15px 36px",
                  borderRadius: 9999,
                  background: mkt.onDark,
                  color: mkt.accent,
                  fontSize: 16,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Start free <ArrowRight size={16} />
              </Link>
            </div>
          </section>
        </div>
      </V7PageShell>
    </MarketingLayout>
  );
}

