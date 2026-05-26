/**
 * Portal — ContentFlow Content Examples (Wave 11B, Issue 10).
 *
 * A static showcase page so customers (and admin previewers) can see
 * exactly what ContentFlow generates before they configure their style.
 * Six sections:
 *
 *   1. Hero            — one-line value prop + 1-paragraph intro
 *   2. Article example — full ~700-word trades article with H2/H3 + CTA
 *   3. Image gallery   — 6 sample tiles describing visual-style presets
 *   4. Social posts    — Facebook / Instagram / LinkedIn examples
 *   5. Tone preview    — same paragraph in 4 ContentStyleWizard tones
 *   6. CTA             — deep-link to the Content Style wizard
 *
 * All content is baked in as constants — v1 has no API call. The article
 * and posts use realistic HVAC/plumbing copy (NOT lorem ipsum) so a
 * customer can read it and decide whether the brand voice matches.
 *
 * Route: /portal/contentflow/examples (gated requireClient)
 * Nav entry: under "ContentFlow" in PortalLayout (Content Examples)
 */
import { Link } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  ArrowRight,
  FileText,
  Image as ImageIcon,
  Camera,
  Film,
  Square,
  Aperture,
  Newspaper,
  Users,
  Facebook,
  Instagram,
  Linkedin,
  Sparkles,
} from "lucide-react";

/* ─── Article example ─────────────────────────────────────────────── */

const ARTICLE_EXAMPLE = {
  title: "5 HVAC SEO mistakes that quietly cost you customers (and how to fix them)",
  excerpt:
    "Most heating and cooling sites are technically fine but commercially invisible. Here's what we see fail most often — and the cheap fixes that move the needle.",
  readTime: "6 min read",
  category: "HVAC marketing",
  sections: [
    {
      h2: "1. You rank for your brand name — and almost nothing else",
      paras: [
        "Type your business name into Google. You're #1. Great. Now type \"emergency furnace repair [your city]\". If you're not on page one, that brand-name ranking is doing nothing for you. Customers who already know your name find you anyway. Customers who don't — the people you actually need to win — never see you.",
        "Fix: pick the 5–10 service + city searches that drive your phone, and write a dedicated page for each. \"Furnace repair Brisbane\", \"AC installation Logan\", \"24-hour HVAC technician Ipswich\". Each page gets its own URL, its own title tag, its own block of copy that mentions the suburb naturally three or four times.",
      ],
    },
    {
      h2: "2. Your service pages are too short to rank",
      paras: [
        "A 150-word \"We do AC repair, call us\" page will never beat the 1,200-word competitor page that answers ten common questions. Google reads length as a signal of \"this site actually explains the topic\". Customers read length as a signal of \"this business knows what they're doing\".",
        "Fix: every primary service page needs at least 600 words covering what the service includes, what it typically costs, how long it takes, what brands you service, what makes you different, and a FAQ section. Write it like a customer is asking you these questions over the phone.",
      ],
    },
    {
      h2: "3. You're invisible on Google Business Profile",
      paras: [
        "More than half of local trades leads now come through the Google Maps panel, not the blue-link results. If your GBP is half-filled, missing photos, or showing an outdated phone number, you're losing high-intent calls before the website even loads.",
        "Fix: full business hours including holiday overrides, 20+ photos showing actual jobs (not stock), the full service list with descriptions, and a fresh post once a week. Reply to every review — five-star and one-star — within 48 hours. Google's local algorithm weights review velocity heavily.",
      ],
    },
    {
      h3: "Why weekly GBP posts matter more than blog posts",
      paras: [
        "A 300-word GBP post about \"signs your ducted system needs a service before summer\" reaches the customers Google is already showing your business listing to. That's a warmer, more local, higher-converting audience than a blog post that has to climb general search results to get any visibility.",
      ],
    },
    {
      h2: "4. Reviews are stuck at 4.6 — and the bad ones aren't answered",
      paras: [
        "Customers don't read every review. They look at the star average, scan two recent ones, and check whether the business replied to complaints. A 4.6 with no replies looks worse than a 4.4 with thoughtful, calm replies to every one-star. The latter says: \"this business cares\".",
        "Fix: send a review request 24 hours after every completed job, via SMS, with a one-tap Google link. Reply to every review — yes, including the unfair ones — within 48 hours. Keep replies short, factual, and human.",
      ],
    },
    {
      h2: "5. Your website never asks for the lead",
      paras: [
        "Most trades sites bury the phone number in a header and trust customers to scroll back up. They don't. Every page needs a visible, sticky CTA: \"Book a free 15-minute call\", \"Get a same-day quote\", \"Text us a photo of the issue\". Make it easier to contact you than to bounce.",
      ],
    },
  ],
  cta: {
    label: "Get a free local SEO audit",
    sub: "We'll show you exactly which of these five mistakes is leaking leads right now.",
  },
};

/* ─── Image gallery ───────────────────────────────────────────────── */

interface ImageSample {
  preset: string;
  icon: typeof Camera;
  description: string;
  tagline: string;
}

const IMAGE_SAMPLES: ImageSample[] = [
  {
    preset: "Photorealistic",
    icon: Camera,
    description: "Natural light, real-world detail, true-to-life colour",
    tagline: "Best for: trust signals, service-in-action shots, technician photography",
  },
  {
    preset: "Cinematic",
    icon: Film,
    description: "Dramatic lighting, shallow depth of field, premium mood",
    tagline: "Best for: hero images, premium-tier brands, dramatic before/after",
  },
  {
    preset: "Minimalist",
    icon: Square,
    description: "Flat, generous white space, single focal element",
    tagline: "Best for: tool product shots, clean modern brands, web hero cards",
  },
  {
    preset: "Vintage",
    icon: Aperture,
    description: "Warm tones, soft grain, nostalgic colour palette",
    tagline: "Best for: heritage trades, family-business storytelling, blog headers",
  },
  {
    preset: "Editorial",
    icon: Newspaper,
    description: "Magazine-style composition, considered framing, balanced colour",
    tagline: "Best for: long-form content, case-study covers, LinkedIn articles",
  },
  {
    preset: "Lifestyle",
    icon: Users,
    description: "People-first scenes, warm relatable moments, customer focus",
    tagline: "Best for: testimonials, residential service shots, social posts",
  },
];

/* ─── Social posts ────────────────────────────────────────────────── */

interface SocialPostSample {
  platform: "facebook" | "instagram" | "linkedin";
  icon: typeof Facebook;
  iconClass: string;
  handle: string;
  body: string;
  hashtags: string[];
  imageCaption: string;
}

const SOCIAL_POSTS: SocialPostSample[] = [
  {
    platform: "facebook",
    icon: Facebook,
    iconClass: "text-brand-blue-600",
    handle: "Apex Plumbing — Brisbane",
    body:
      "Heads up Brisbane homeowners: with the cooler nights coming in, we're already seeing a spike in hot-water unit failures. If yours is more than 8 years old and groaning at startup, it's time to check it BEFORE it gives up on a Sunday morning. We do free 10-minute health checks all week.",
    hashtags: ["#BrisbanePlumber", "#HotWaterRepair", "#TradesYouTrust"],
    imageCaption: "Photo: technician inspecting a residential gas hot-water unit",
  },
  {
    platform: "instagram",
    icon: Instagram,
    iconClass: "text-pink-600",
    handle: "@apex_plumbing_qld",
    body:
      "Spotted on a job this morning: 1970s copper, never touched, still pushing 40 PSI like a champ. They genuinely don't make them like this anymore. Swipe to see the install date stamped on the union — 1973.\n\nIf your house was built before 1990 and you've never had your pipework checked, message us. A 15-minute look now saves a flooded bathroom later.",
    hashtags: ["#OldHouse", "#PlumbingHistory", "#BrisbaneTrades", "#ApexPlumbing"],
    imageCaption: "Photo: close-up of vintage copper plumbing union with 1973 stamp",
  },
  {
    platform: "linkedin",
    icon: Linkedin,
    iconClass: "text-sky-700",
    handle: "Daniel Reeves — Managing Director, Apex Plumbing",
    body:
      "A reflection on this week: we hit 500 five-star reviews on Google. Every one of those is a customer who took 30 seconds out of their day to tell other people we did right by them.\n\nThe lesson for any trades business reading this: reviews aren't a marketing tactic. They're the most honest feedback loop you have. We read every one, reply to every one (including the four ones that weren't five stars), and use the patterns we see to train new technicians.\n\nThanks Brisbane. We're not done.",
    hashtags: ["#Trades", "#SmallBusinessAustralia", "#CustomerExperience"],
    imageCaption: "Photo: team standing in front of branded service van with thumbs up",
  },
];

/* ─── Tone preview ────────────────────────────────────────────────── */

interface TonePreview {
  tone: string;
  description: string;
  sample: string;
}

const TONE_PREVIEWS: TonePreview[] = [
  {
    tone: "Professional",
    description: "Precise, courteous, business-formal",
    sample:
      "Our certified technicians provide comprehensive HVAC servicing across the greater Brisbane region. Every booking includes a 27-point inspection, transparent pricing, and a 12-month workmanship guarantee.",
  },
  {
    tone: "Friendly",
    description: "Warm, conversational, approachable",
    sample:
      "G'day! We're the team that turns up when your air-con quits in 38-degree heat. Our techs are local, they explain everything in plain English, and we back every job with a 12-month guarantee — no fine print.",
  },
  {
    tone: "Premium",
    description: "Polished, sophisticated, quality-focused",
    sample:
      "Apex delivers concierge-level HVAC service to discerning Brisbane homeowners. Our master technicians arrive prepared, work meticulously, and stand behind every installation with our signature 12-month workmanship guarantee.",
  },
  {
    tone: "Casual",
    description: "Direct, plain-spoken, no jargon",
    sample:
      "We fix air-cons. We do it properly the first time. We tell you what it costs before we start. And if anything's not right within 12 months, we come back and sort it. That's the deal.",
  },
];

/* ─── Page ────────────────────────────────────────────────────────── */

export default function ContentExamplesPage() {
  usePageTitle("Content Examples — ContentFlow");

  return (
    <PortalLayout>
      <div className="space-y-10 pb-16">
        {/* Hero */}
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-blue-600" aria-hidden="true" />
            <h1 className="text-2xl font-semibold text-foreground">See what ContentFlow generates</h1>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Every article, image, and social post below was produced by ContentFlow using the same
            tone, style, and trade-vocabulary settings you'll configure in the Content Style wizard.
            Browse the examples, decide which voice matches your business, then set your preferences
            so every piece of content sounds like you.
          </p>
        </header>

        {/* Section: Article example */}
        <section className="space-y-3" aria-labelledby="article-example-heading">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 id="article-example-heading" className="text-base font-semibold text-foreground">
              Sample article
            </h2>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              Long-form
            </Badge>
          </div>
          <Card className="p-6">
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="rounded-full bg-brand-blue-50 px-2 py-0.5 font-medium text-brand-blue-700">
                {ARTICLE_EXAMPLE.category}
              </span>
              <span>{ARTICLE_EXAMPLE.readTime}</span>
            </div>
            <h3 className="mb-3 text-xl font-semibold leading-snug text-foreground">
              {ARTICLE_EXAMPLE.title}
            </h3>
            <p className="mb-6 text-sm italic text-muted-foreground">{ARTICLE_EXAMPLE.excerpt}</p>
            <div className="space-y-5 text-sm leading-relaxed text-foreground">
              {ARTICLE_EXAMPLE.sections.map((s, i) => (
                <div key={i}>
                  {"h2" in s && s.h2 && (
                    <h4 className="mb-2 text-base font-semibold text-foreground">{s.h2}</h4>
                  )}
                  {"h3" in s && s.h3 && (
                    <h5 className="mb-2 text-sm font-semibold text-foreground">{s.h3}</h5>
                  )}
                  {s.paras.map((p, j) => (
                    <p key={j} className="mb-2">
                      {p}
                    </p>
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-md border border-brand-blue-200 bg-brand-blue-50 p-4">
              <p className="text-sm font-semibold text-brand-blue-900">{ARTICLE_EXAMPLE.cta.label}</p>
              <p className="mt-1 text-xs text-brand-blue-800">{ARTICLE_EXAMPLE.cta.sub}</p>
            </div>
          </Card>
        </section>

        {/* Section: Image gallery */}
        <section className="space-y-3" aria-labelledby="image-gallery-heading">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 id="image-gallery-heading" className="text-base font-semibold text-foreground">
              Image styles
            </h2>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              6 presets
            </Badge>
          </div>
          <p className="max-w-3xl text-xs text-muted-foreground">
            Each preset is a different visual signature. Pick the one that matches how you want
            your business to feel — premium, approachable, modern, heritage — and every image
            ContentFlow generates will lock to that look.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {IMAGE_SAMPLES.map((sample) => {
              const Icon = sample.icon;
              return (
                <Card key={sample.preset} className="p-4">
                  <div className="mb-3 flex aspect-video items-center justify-center rounded-md border border-border bg-muted/40">
                    <Icon className="h-8 w-8 text-muted-foreground/70" aria-hidden="true" />
                  </div>
                  <h3 className="mb-1 text-sm font-semibold text-foreground">{sample.preset}</h3>
                  <p className="mb-2 text-xs text-muted-foreground">{sample.description}</p>
                  <p className="text-[11px] text-muted-foreground/80">{sample.tagline}</p>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Section: Social posts */}
        <section className="space-y-3" aria-labelledby="social-posts-heading">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 id="social-posts-heading" className="text-base font-semibold text-foreground">
              Social post examples
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {SOCIAL_POSTS.map((post) => {
              const Icon = post.icon;
              return (
                <Card key={post.platform} className="flex flex-col p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${post.iconClass}`} aria-hidden="true" />
                    <span className="text-xs font-semibold capitalize text-foreground">
                      {post.platform}
                    </span>
                  </div>
                  <p className="mb-2 text-xs font-medium text-foreground">{post.handle}</p>
                  <div className="mb-3 flex aspect-video items-center justify-center rounded-md border border-border bg-muted/40 px-3 text-center">
                    <span className="text-[11px] text-muted-foreground">{post.imageCaption}</span>
                  </div>
                  <p className="mb-3 whitespace-pre-line text-xs leading-relaxed text-foreground">
                    {post.body}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-1">
                    {post.hashtags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Section: Tone preview */}
        <section className="space-y-3" aria-labelledby="tone-preview-heading">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 id="tone-preview-heading" className="text-base font-semibold text-foreground">
              Same idea, four tones
            </h2>
          </div>
          <p className="max-w-3xl text-xs text-muted-foreground">
            The same paragraph rewritten in each of the four ContentStyleWizard tones. Pick the
            voice that sounds most like how you'd actually talk to a customer at the door.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {TONE_PREVIEWS.map((t) => (
              <Card key={t.tone} className="p-4">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{t.tone}</h3>
                  <span className="text-[11px] text-muted-foreground">{t.description}</span>
                </div>
                <p className="text-xs leading-relaxed text-foreground">{t.sample}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Section: CTA */}
        <section aria-labelledby="cta-heading">
          <Card className="border-brand-blue-200 bg-brand-blue-50 p-6">
            <h2 id="cta-heading" className="mb-1 text-lg font-semibold text-brand-blue-900">
              Ready to lock in your voice?
            </h2>
            <p className="mb-4 max-w-2xl text-sm text-brand-blue-800">
              The Content Style wizard takes about three minutes. You'll pick a tone, a visual
              style, your favourite trades topics, and the words you never want appearing in your
              content. ContentFlow uses every answer in every piece of content it makes for you.
            </p>
            <Link href="/portal/content-preferences">
              <Button data-testid="content-examples-cta-button">
                Set up your content preferences
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </Card>
        </section>
      </div>
    </PortalLayout>
  );
}
