/**
 * /wefixtrades-vs-housecall-pro — SEO comparison page targeting
 * "Housecall Pro alternative" and "WeFixTrades vs Housecall Pro"
 * intent searches. Uses the shared CompareLandingPage template with
 * Housecall-Pro-specific data.
 *
 * Pricing + feature data is based on public listings as of the page's
 * publishedDate. Anything we can't verify carries a hedge in the copy.
 */
import CompareLandingPage from "@/components/marketing/CompareLandingPage";
import { mkt } from "@/theme/tokens";

const PUBLISHED = "2026-05-25";

export default function CompareVsHousecallPro() {
  return (
    <CompareLandingPage
      path="/wefixtrades-vs-housecall-pro"
      competitorName="Housecall Pro"
      competitorPossessive="Housecall Pro's"
      pageTitle="WeFixTrades vs Housecall Pro: which is right for your trades business?"
      pageDescription="Honest WeFixTrades vs Housecall Pro comparison. Pricing, AI voice + content, mobile app, and where each one wins for HVAC, plumbing, electrical. Free trial."
      keywords={[
        "housecall pro alternative",
        "housecall pro vs wefixtrades",
        "wefixtrades vs housecall pro",
        "HVAC software comparison",
        "plumbing software comparison",
      ]}
      publishedDate={PUBLISHED}
      heroHeadline={
        <>
          WeFixTrades vs Housecall Pro:
          <br />
          <span style={{ color: mkt.accent }}>which is right for your business?</span>
        </>
      }
      heroSub="Housecall Pro is a mobile-first FSM platform popular with HVAC, plumbing, and electrical. WeFixTrades layers AI voice, content, and reputation on top of lighter ops. Here's how they actually stack up."
      tldrRows={[
        {
          label: "Starts at",
          us: "$9/mo · free tier available",
          them: "$69/mo (Basic, single user)",
        },
        {
          label: "Best for",
          us: "Solo to 15-tech trades wanting AI customer acquisition + reputation in one",
          them: "Solo techs to mid-size teams doing residential service (HVAC, plumbing, electrical)",
        },
        {
          label: "AI voice agent",
          us: "Built-in 24/7 TradeLine — answers calls, books jobs",
          them: "Limited AI assistant; no full voice agent",
        },
        {
          label: "AI content / images",
          us: "ContentFlow — blog, social, images",
          them: "Not built-in",
        },
        {
          label: "Mobile field app",
          us: "Web-responsive only (no native app yet)",
          them: "Strong native iOS + Android — Housecall Pro's flagship",
        },
        {
          label: "Job scheduling / dispatching",
          us: "Lighter (BookFlow) — booking + jobs",
          them: "Solid drag-drop dispatch + GPS tracking",
        },
        {
          label: "Google Business management",
          us: "MapGuard — 24/7 monitoring",
          them: "Not built-in",
        },
        {
          label: "Marketing tools",
          us: "Full suite — content, reviews, ads, social",
          them: "Email + postcard marketing add-ons (often paid extra)",
        },
        {
          label: "Setup time",
          us: "Same-day signup",
          them: "1-2 weeks typical with onboarding",
        },
        {
          label: "Free tier",
          us: "Yes",
          them: "No — 14-day trial only",
        },
      ]}
      matrixRows={[
        { feature: "AI voice agent (24/7 call answering)", us: true, them: false },
        { feature: "AI content + image generation", us: true, them: false },
        { feature: "Google Business Profile management (MapGuard)", us: true, them: false },
        { feature: "Reputation / review collection", us: true, them: true, note: "Both ship review flows" },
        { feature: "SMS automation", us: true, them: true },
        { feature: "Online booking + quotes", us: true, them: true },
        { feature: "Job scheduling + dispatching", us: "partial", them: true, note: "HCP's strongest area" },
        { feature: "GPS technician tracking", us: false, them: true },
        { feature: "Customer portal", us: true, them: true },
        { feature: "Mobile field app (native iOS/Android)", us: false, them: true, note: "HCP is mobile-first" },
        { feature: "Invoicing + payments (incl. card-on-file)", us: true, them: true },
        { feature: "Free tier", us: true, them: false },
        { feature: "Starts at", us: "$9/mo", them: "$69/mo" },
        { feature: "Setup time", us: "Same-day", them: "1-2 wks" },
        { feature: "AI image/article generation (ContentFlow)", us: true, them: false },
        { feature: "Social-media scheduling (SocialSync)", us: true, them: false },
        { feature: "Multi-trade support", us: true, them: true },
        { feature: "Postcard / direct-mail marketing", us: false, them: true, note: "HCP has built-in postcards" },
        { feature: "White-label option", us: "partial", them: "partial" },
        { feature: "Quote / estimate templates", us: true, them: true },
        { feature: "AI-drafted review responses", us: true, them: false },
        { feature: "Recurring service / membership plans", us: "partial", them: true },
        { feature: "Public API", us: true, them: true },
        { feature: "QuickBooks integration", us: "partial", them: true },
      ]}
      ourPricing={[
        "Free — try every product, single workspace",
        "Starter $9/mo — single trade, basic AI",
        "Growth $49/mo — full AI suite",
        "Scale $149/mo — multi-location, white-label",
        "No card required to start.",
      ]}
      theirPricing={[
        "Basic — $69/mo (1 user)",
        "Essentials — $179/mo (1-5 users)",
        "Max — $499+/mo (custom, sales-call pricing)",
        "Marketing add-ons (postcards, email) billed separately.",
        "14-day free trial.",
      ]}
      whenThemBetter={[
        "You're a mobile-first HVAC, plumbing, or electrical shop and your techs need a polished native app with offline mode.",
        "GPS technician tracking and a serious dispatch board are non-negotiable.",
        "Recurring maintenance contracts / membership plans (annual tune-ups, service agreements) are core to your revenue.",
        "Direct-mail postcards are part of your marketing mix — Housecall Pro has it built-in; we don't.",
      ]}
      whenUsBetter={[
        "You're losing leads to voicemail and need AI answering the phone 24/7, not just routing it.",
        "You want content, reviews, and Google Business management bundled — instead of bolting on three marketing add-ons.",
        "Budget is real. Our Growth plan at $49/mo replaces what HCP charges $179+/mo for.",
        "You want to sign up today and be live tonight — no onboarding call required.",
      ]}
      testimonialQuote="HCP's app is genuinely great for our techs. But we were paying $179 a month for Essentials, another $79 for postcards, and a separate $200 to a reputation tool. WeFixTrades rolled all three into one $49 plan and added an AI receptionist on top."
      testimonialAttribution="— Case study placeholder · HVAC, 4 techs"
      faqItems={[
        {
          question: "Is WeFixTrades cheaper than Housecall Pro?",
          answer:
            "Yes for the same feature scope. Housecall Pro's Basic plan starts at $69/mo for one user and most shops with marketing needs end up on Essentials ($179/mo) plus paid add-ons. WeFixTrades' Growth plan at $49/mo includes the AI suite, MapGuard, reputation tools, and content — categories that are paid extras inside HCP.",
        },
        {
          question: "Can WeFixTrades replace Housecall Pro for an HVAC shop?",
          answer:
            "For customer acquisition, reviews, content, and basic dispatch — yes. If your operation lives or dies on a mobile field app with offline mode, GPS tech tracking, and recurring service-agreement billing, Housecall Pro is the stronger ops platform today. A few customers run both side-by-side.",
        },
        {
          question: "Does WeFixTrades have a native mobile app?",
          answer:
            "Not yet — the dashboard is fully responsive and works in mobile browsers, but there's no App Store app today. HCP wins on field mobility. If your techs need to start jobs, take payment, and capture photos offline in basements and rooftops, that gap matters.",
        },
        {
          question: "How does WeFixTrades' AI compare to Housecall Pro's AI assistant?",
          answer:
            "Different scope. HCP's AI helps with text drafting and some workflow automation. WeFixTrades' AI actually answers the phone 24/7 via TradeLine, generates marketing content and images via ContentFlow, and monitors Google Business + reviews via MapGuard and ReputationShield. We're an AI-first platform; HCP is an FSM platform with AI on top.",
        },
        {
          question: "Can I import my Housecall Pro customers?",
          answer:
            "Yes — customer lists, job history, and templates import via CSV. We have a guided importer that maps Housecall Pro exports into WeFixTrades. Contact sales for larger migrations.",
        },
        {
          question: "Does WeFixTrades support recurring service plans?",
          answer:
            "Lightly — we support recurring quotes and scheduled jobs through BookFlow, but Housecall Pro's membership-plan flow (with auto-renewals, member discounts, and reminder cadences) is more mature today. We're shipping richer recurring billing later this year.",
        },
        {
          question: "How long does WeFixTrades take to set up vs Housecall Pro?",
          answer:
            "Most customers go live the same day — under an hour to wire AI voice routing, link Google Business, and turn on review automation. HCP's onboarding typically runs 1-2 weeks with a kickoff call.",
        },
      ]}
      finalCtaTitle={
        <>
          See how WeFixTrades stacks up
          <br />
          on your calls, your reviews, your content.
        </>
      }
    />
  );
}
