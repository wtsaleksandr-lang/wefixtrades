/**
 * ContentFlow Phase 1 — public SEO landing page for the prompt library.
 *
 * Route: /tools/:trade-ai-content-prompts (5 trades — see TRADE_META).
 *
 * Renders all 12 prompt patterns adapted for the page's trade. Each
 * pattern card shows only the pattern label + a 1-sentence public
 * description + a sign-up CTA — the FULL prompt body is intentionally
 * NOT rendered on the public surface. Customers must sign up + sign
 * in to the portal to see the interpolated prompt text. The library
 * is the upsell; the SEO surface advertises that it exists.
 *
 * Built on the same MarketingLayout + V7Hero + PageMeta pattern as
 * the existing /solutions/:slug pages so the page picks up the
 * site-wide prerender flow (scripts/seo/prerender-routes.mjs adds
 * each URL there).
 */
import { useLocation, Link } from "wouter";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Sparkles, Camera, Film, Square, Aperture, Newspaper, Users, Package, PaintBucket, Brush, Box } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { V7Hero, V7PageShell } from "@/components/marketing/v7";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import NotFound from "@/pages/not-found";
import { mkt, shadows } from "@/theme/tokens";
import {
  PROMPT_PATTERNS,
  getTradeMetaBySlug,
  getPromptTemplatesForTrade,
  type PromptPatternId,
  type PromptTrade,
} from "@shared/contentflow/promptLibrary";

/* Pattern icons — small lucide stand-ins. Same set used in the
 * portal picker so the surfaces feel coherent. */
const PATTERN_ICON: Record<PromptPatternId, LucideIcon> = {
  contractor_pov: Users,
  ugly_ad: Sparkles,
  tool_hero: Package,
  before_after: Square,
  emergency_call: Aperture,
  behind_scenes: Camera,
  flat_lay: PaintBucket,
  customer_testimonial: Newspaper,
  day_in_life: Film,
  job_site: Brush,
  local_pride: Box,
  seasonal: Sparkles,
};

/** Build the FAQPage JSON-LD payload. Five Q-and-A pairs that map to
 * the most common customer concerns about AI content prompts. */
function buildFaqJsonLd(trade: string) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `Are these AI content prompts free for ${trade} businesses?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `The pattern library is free to browse. To use a prompt — meaning have the AI personalise it to your business and generate the image, article, or video — sign up for ContentFlow. The free plan includes 5 AI images, 3 AI articles, and 1 publishing channel each month at no cost.`,
        },
      },
      {
        "@type": "Question",
        name: `What kinds of content can ${trade} businesses generate from these prompts?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Each pattern is tagged for the asset it produces — image, short-form video, written article, or a combined multi-asset post (image + caption + article). The 12 patterns cover the most-used social-marketing moves for trades: before/after, emergency callouts, tool hero shots, day-in-the-life, real-crew shots, post-it / ugly ads, behind-the-scenes, local-landmark drops, seasonal hooks, and customer-testimonial dramatisations.`,
        },
      },
      {
        "@type": "Question",
        name: `How does ContentFlow personalise each prompt for my ${trade} business?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `When you sign up, ContentFlow builds a one-time Business Profile from your website URL or a short five-field form. From then on, every prompt is auto-filled with your business name, service area, top services, brand colours, tone, and your hero customer testimonial. You edit the Business Profile once and reuse it forever.`,
        },
      },
      {
        "@type": "Question",
        name: `Can I edit a prompt before generating?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Yes. Every prompt is fully editable before generation. The portal also includes a free "regenerate prompt" loop that re-rolls the prompt text without spending an image or video credit, so you can iterate on the wording before you ever commit to a generation.`,
        },
      },
      {
        "@type": "Question",
        name: `What image styles can I pick for ${trade} prompts?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `ContentFlow ships 10 image-style presets: Photorealistic, Cinematic, Minimalist, Vintage, Editorial, Lifestyle, Product-Hero, Flat-Illustration, Hand-Drawn, and 3D-Render. Each prompt card in the library suggests the styles that pair best with that pattern.`,
        },
      },
    ],
  };
}

export default function TradePromptsPage() {
  /* Wouter routes for these pages use static literals
   * (/tools/plumbing-ai-content-prompts, etc.) so the trade slug
   * isn't passed as a param. We read it back out of location.
   * Pattern: /tools/{slug}-ai-content-prompts → captures `{slug}`. */
  const [location] = useLocation();
  const match = location.match(/^\/tools\/([a-z0-9-]+)-ai-content-prompts\/?$/i);
  const tradeSlug = match ? match[1] : "";
  const tradeMeta = getTradeMetaBySlug(tradeSlug);

  useScrollReveal();

  if (!tradeMeta) return <NotFound />;

  const tradeId: PromptTrade = tradeMeta.id;
  const tradeTemplates = getPromptTemplatesForTrade(tradeId);

  const canonical = `/tools/${tradeMeta.slug}-ai-content-prompts`;
  const title = `AI Content Prompts for ${tradeMeta.seoTradeNoun}`;
  const description = `60 AI content prompts built for ${tradeMeta.noun} businesses — 12 patterns × 5 trades. Generate trade-specific social posts, images, articles, and videos with one click.`;

  return (
    <MarketingLayout>
      <PageMeta
        title={title}
        description={description}
        canonical={canonical}
        keywords={[
          `${tradeMeta.noun} marketing prompts`,
          `${tradeMeta.noun} ai content`,
          `${tradeMeta.noun} social media ideas`,
          `ai content for ${tradeMeta.seoTradeNoun.toLowerCase()}`,
        ]}
        jsonLd={buildFaqJsonLd(tradeMeta.noun)}
      />
      <V7PageShell>
        <div data-testid={`trade-prompts-page-${tradeMeta.slug}`}>
          <V7Hero
            productName={`AI Content Prompts · ${tradeMeta.seoTradeNoun}`}
            headline={`AI Content Prompts for ${tradeMeta.seoTradeNoun} Businesses`}
            sub={`12 named content patterns adapted for ${tradeMeta.noun}. Generate trade-specific social posts, images, articles, and short-form videos — all auto-personalised to your business name, service area, brand colours, and tone.`}
            ctas={[
              { label: "Start free", href: `/signup?intent=contentflow&trade=${tradeMeta.slug}` },
              { label: "See pricing", href: "/pricing" },
            ]}
          />

          {/* Pattern grid — pattern label + 1-sentence public description
              + asset badge + sign-up CTA. NO full prompt body. */}
          <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="trade-prompts-grid">
            <div style={{ maxWidth: 1180, margin: "0 auto" }}>
              <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
                <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                  The 12 Patterns
                </div>
                <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.025em" }}>
                  Every prompt is adapted for {tradeMeta.noun}
                </h2>
                <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.6, maxWidth: 640, margin: "16px auto 0" }}>
                  Browse the pattern library here. Sign up to see the full prompt and generate trade-specific content for your business.
                </p>
              </div>

              <div
                className="prompts-grid"
                style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}
              >
                {PROMPT_PATTERNS.map((pattern, i) => {
                  const matched = tradeTemplates.find((t) => t.patternId === pattern.id);
                  const Icon = PATTERN_ICON[pattern.id];
                  const ctaHref = matched
                    ? `/signup?intent=contentflow&trade=${tradeMeta.slug}&prompt=${matched.id}`
                    : `/signup?intent=contentflow&trade=${tradeMeta.slug}`;

                  return (
                    <div
                      key={pattern.id}
                      data-reveal="fade-up"
                      data-delay={String(((i % 4) + 1) * 60)}
                      data-testid={`trade-prompt-card-${pattern.id}`}
                      style={{
                        background: mkt.bg,
                        border: `1px solid ${mkt.onDarkBorder}`,
                        borderRadius: 18,
                        padding: "22px 22px 18px",
                        boxShadow: shadows.card,
                        display: "flex",
                        flexDirection: "column",
                        height: "100%",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10,
                          background: mkt.sectionLight,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: mkt.accent,
                        }}>
                          <Icon size={18} />
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: mkt.onDarkFaint,
                          letterSpacing: "0.08em", textTransform: "uppercase",
                          padding: "3px 8px", border: `1px solid ${mkt.onDarkBorder}`,
                          borderRadius: 999,
                        }}>
                          {pattern.defaultAsset}
                        </span>
                      </div>

                      <h3 style={{ fontSize: 17, fontWeight: 700, color: mkt.onDark, marginBottom: 8, lineHeight: 1.3 }}>
                        {pattern.label}
                      </h3>
                      <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.55, margin: 0, flex: 1 }}>
                        {pattern.publicDescription}
                      </p>

                      {/* Sample-output placeholder slot. Real images are
                          baked in the post-Phase-1 test pass; until then
                          we show a neutral aspect-ratio block so the
                          card height stays consistent. */}
                      <div
                        aria-hidden
                        style={{
                          marginTop: 14,
                          aspectRatio: "16 / 9",
                          background: mkt.sectionLight,
                          border: `1px dashed ${mkt.onDarkBorder}`,
                          borderRadius: 10,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, color: mkt.onDarkFaint, letterSpacing: "0.08em", textTransform: "uppercase",
                        }}
                        data-testid={`trade-prompt-sample-${pattern.id}`}
                      >
                        Sample · coming after test pass
                      </div>

                      <Link
                        href={ctaHref}
                        data-testid={`trade-prompt-cta-${pattern.id}`}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          fontSize: 13, fontWeight: 700, color: mkt.accent,
                          marginTop: 16, textDecoration: "none",
                        }}
                      >
                        Sign up to use this prompt <ArrowRight size={14} />
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section
            style={{
              background: `linear-gradient(135deg, ${mkt.accent} 0%, ${mkt.accentHover} 100%)`,
              padding: "80px 28px",
              textAlign: "center",
            }}
            data-testid="trade-prompts-bottom-cta"
          >
            <div style={{ maxWidth: 600, margin: "0 auto" }} data-reveal="scale">
              <h2 style={{ fontSize: "clamp(26px, 3.5vw, 42px)", fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.025em", marginBottom: 16, lineHeight: 1.1 }}>
                Ready to use these for your {tradeMeta.noun} business?
              </h2>
              <p style={{ fontSize: 16, color: mkt.onDarkMuted, lineHeight: 1.65, marginBottom: 36, maxWidth: 460, margin: "0 auto 36px" }}>
                Sign up free. 5 AI images, 3 AI articles, and 1 publishing channel every month — no card required.
              </p>
              <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
                <Link
                  href={`/signup?intent=contentflow&trade=${tradeMeta.slug}`}
                  data-testid="trade-prompts-cta-signup"
                  className="mkt-btn-primary"
                  style={{ display: "inline-block", padding: "15px 36px", borderRadius: 9999, background: mkt.onDark, color: mkt.accent, fontSize: 16, fontWeight: 700, textDecoration: "none" }}
                >
                  Start Free
                </Link>
                <Link
                  href="/pricing"
                  data-testid="trade-prompts-cta-pricing"
                  className="mkt-btn-ghost"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "15px 28px", borderRadius: 9999, background: "transparent", color: mkt.onDark, fontSize: 15, fontWeight: 600, textDecoration: "none", border: `1.5px solid ${mkt.onDarkBorder}` }}
                >
                  See Pricing
                </Link>
              </div>
            </div>
          </section>
        </div>
      </V7PageShell>
    </MarketingLayout>
  );
}

