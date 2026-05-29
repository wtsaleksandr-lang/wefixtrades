/**
 * /wefixtrades-vs-jobber — SEO comparison page targeting "Jobber alternative"
 * and "WeFixTrades vs Jobber" intent searches. Uses the shared
 * CompareLandingPage template with Jobber-specific data.
 *
 * Pricing + feature data is based on public listings as of the page's
 * publishedDate. Anything we can't verify carries a hedge in the copy.
 */
import CompareLandingPage from "@/components/marketing/CompareLandingPage";
import { mkt } from "@/theme/tokens";

const PUBLISHED = "2026-05-25";

export default function CompareVsJobber() {
  return (
    <CompareLandingPage
      path="/wefixtrades-vs-jobber"
      competitorName="Jobber"
      competitorPossessive="Jobber's"
      pageTitle="WeFixTrades vs Jobber: which is right for your trades business?"
      pageDescription="Honest WeFixTrades vs Jobber comparison for trades. Pricing, AI voice, scheduling, dispatching, and where each one wins. Free trial, no card."
      keywords={[
        "jobber alternative",
        "jobber vs wefixtrades",
        "wefixtrades vs jobber",
        "trades software comparison",
        "field service software for trades",
      ]}
      publishedDate={PUBLISHED}
      productsMentioned={[
        { label: "MapGuard", href: "/products/mapguard" },
        { label: "ContentFlow", href: "/products/contentflow" },
        { label: "TradeLine", href: "/products/tradeline" },
        { label: "ReputationShield", href: "/products/reputationshield" },
      ]}
      heroHeadline={
        <>
          WeFixTrades vs Jobber:
          <br />
          <span style={{ color: mkt.accent }}>which is right for your business?</span>
        </>
      }
      heroSub="Jobber has spent 15 years optimising the field-service ops board. WeFixTrades is the AI-first platform built for what trades actually need today: 24/7 voice answering calls, content generated for you, Google Business managed in the same dashboard, and a native iOS + Android softphone for the owner. Bundled, not bolted on."
      tldrRows={[
        {
          label: "Starts at",
          us: "$9/mo · free tier available",
          them: "$69/mo (Core) · 14-day free trial",
        },
        {
          label: "Best for",
          us: "Solo to 15-tech trades wanting AI customer acquisition + reputation in one",
          them: "5-50 tech trades needing strong job scheduling + dispatching",
        },
        {
          label: "AI voice agent",
          us: "Built-in 24/7 TradeLine — answers calls, books jobs",
          them: "Not built-in",
        },
        {
          label: "AI content / images",
          us: "ContentFlow — blog posts, social, images",
          them: "Not built-in",
        },
        {
          label: "Job scheduling / dispatching",
          us: "Lighter (BookFlow) — booking + jobs, less dispatch-board depth",
          them: "Industry-leading — drag-drop calendar, route optimisation",
        },
        {
          label: "Mobile app",
          us: "Native iOS + Android softphone — calls, voicemail, dialer, ETA",
          them: "Native iOS + Android field-tech app",
        },
        {
          label: "Google Business management",
          us: "MapGuard — 24/7 monitoring, suspension alerts",
          them: "Not built-in",
        },
        {
          label: "Setup time",
          us: "Same-day signup",
          them: "Typically 1-2 weeks with onboarding call",
        },
        {
          label: "Contracts",
          us: "Month-to-month, cancel anytime",
          them: "Month-to-month",
        },
        {
          label: "Free tier",
          us: "Yes — for trying every product",
          them: "No — 14-day trial only",
        },
      ]}
      matrixRows={[
        { feature: "AI voice agent (24/7 call answering)", us: true, them: false },
        { feature: "AI content + image generation", us: true, them: false },
        { feature: "Google Business Profile management (MapGuard)", us: true, them: false },
        { feature: "Reputation / review collection", us: true, them: true, note: "Both ship review-request flows" },
        { feature: "SMS automation", us: true, them: true },
        { feature: "Online booking + quotes", us: true, them: true },
        { feature: "Job scheduling + dispatching", us: "partial", them: true, note: "Jobber leans here; WeFixTrades keeps it light" },
        { feature: "Route optimisation", us: false, them: true },
        { feature: "Customer portal (client hub)", us: true, them: true },
        { feature: "Native iOS + Android app", us: true, them: true, note: "WeFixTrades ships a softphone (calls + voicemail + ETA + portal); Jobber ships a field-tech job board. Different focus, both native." },
        { feature: "Invoicing + payments", us: true, them: true },
        { feature: "Free tier", us: true, them: false },
        { feature: "Starts at", us: "$9/mo", them: "$69/mo" },
        { feature: "Setup time", us: "Same-day", them: "1-2 wks" },
        { feature: "AI image/article generation (ContentFlow)", us: true, them: false },
        { feature: "Social-media scheduling (SocialSync)", us: true, them: false },
        { feature: "Multi-trade support", us: true, them: true },
        { feature: "QuickBooks integration", us: "partial", them: true },
        { feature: "White-label option", us: "partial", them: "partial" },
        { feature: "Time tracking for techs", us: false, them: true },
        { feature: "Quote / estimate templates", us: true, them: true },
        { feature: "AI-drafted review responses", us: true, them: false },
        { feature: "Public API", us: true, them: true },
        { feature: "Phone + chat support", us: true, them: true },
      ]}
      ourPricing={[
        "Free — try every product, single workspace",
        "Starter $9/mo — single trade, basic AI",
        "Growth $49/mo — full AI suite (TradeLine, ContentFlow, MapGuard)",
        "Scale $149/mo — multi-location, white-label, priority support",
        "No card required to start. Cancel any time.",
      ]}
      theirPricing={[
        "Core — $69/mo (1 user)",
        "Connect — $169/mo (up to 5 users)",
        "Grow — $349/mo (up to 15 users)",
        "Plus — quote-only (larger ops)",
        "14-day free trial, no credit card required.",
      ]}
      whenThemBetter={[
        "You run 5+ techs and the dispatch board with drag-drop routing and crew assignments is the heart of your day.",
        "Your techs are in the truck full-time and they need a job-board app that hands them today's schedule, payment capture, and offline photo upload.",
        "You've already standardised your back office on QuickBooks Online and want the deepest two-way sync available.",
        "You're paying an agency for SEO + content + reviews and you'd rather keep paying them than bring it in-house.",
      ]}
      whenUsBetter={[
        "You want AI answering the phone 24/7 — booking jobs at 9pm instead of going to voicemail. Jobber doesn't do this; we built the whole platform around it.",
        "You want Google Business Profile, content generation, reviews, and AI voice in ONE bill instead of stitching together five tools.",
        "Budget matters. Our $9-49/mo replaces what Jobber's $69-349/mo + a $300/mo marketing agency costs you today. Same outcomes, fraction of the spend.",
        "You'd rather sign up today and be live tonight than spend 1-2 weeks in onboarding calls before your first lead.",
      ]}
      testimonialQuote="We almost went with Jobber because everyone uses it. Switched plans after the demo — we needed someone answering the phone at 9pm more than we needed a fancier dispatch board. WeFixTrades' AI booked our first $400 job that same week."
      testimonialAttribution="— Case study placeholder · plumbing, 3 techs"
      faqItems={[
        {
          question: "Is WeFixTrades cheaper than Jobber?",
          answer:
            "For most solo-to-mid trades businesses, yes — significantly. WeFixTrades starts at $9/mo with a free tier; Jobber starts at $69/mo with no free tier. Once you scale to 15+ techs needing heavy dispatching, Jobber's per-user pricing can look competitive against our Scale plan, but for 1-15 tech shops we're typically 40-70% cheaper.",
        },
        {
          question: "Does WeFixTrades replace Jobber completely?",
          answer:
            "For shops focused on customer acquisition, reviews, content, and basic booking — yes. If your operation depends on a heavy-duty dispatch board with route optimisation, crew assignments, and a native mobile app for field techs, Jobber is the better-rounded ops platform today. Many of our customers use WeFixTrades for marketing + reviews and keep a lightweight scheduler alongside it.",
        },
        {
          question: "Can I import my Jobber data into WeFixTrades?",
          answer:
            "Yes — customer lists, job history, and quote templates import via CSV. We have a guided onboarding flow that maps Jobber exports to WeFixTrades fields. Contact sales for hands-on help with larger migrations.",
        },
        {
          question: "Does WeFixTrades have a mobile app like Jobber?",
          answer:
            "Yes — a native iOS + Android app for the owner-operator. Different focus from Jobber's app: WeFixTrades is a softphone (real Twilio Voice calls, voicemail, dialer, one-tap 'on my way' ETA text, in-app portal) built for the person taking the call. Jobber's app is a field-tech job board. If your techs need to start jobs, take payment, and capture photos offline in basements and rooftops, Jobber wins that dimension; if YOU want the calls coming to your phone with the AI handling triage, WeFixTrades wins.",
        },
        {
          question: "Is WeFixTrades only for trades, or any service business?",
          answer:
            "It's built for trades and home services first — plumbing, HVAC, electrical, roofing, landscaping, pest control, cleaning, and adjacent categories. The AI prompts, calculators, and review flows are all tuned for that buyer. Jobber covers the same vertical and has a few more years of edge-case industry support.",
        },
        {
          question: "How long does WeFixTrades take to set up vs Jobber?",
          answer:
            "Most customers are live the same day they sign up — under an hour to wire AI voice routing, connect Google Business Profile, and turn on review automation. Jobber's standard onboarding includes a 30-60 minute call and most shops report 1-2 weeks before they're fully running.",
        },
        {
          question: "Can I try both before deciding?",
          answer:
            "Yes — we recommend it. Jobber offers a 14-day free trial (card not required). WeFixTrades has a permanent free tier so you can sign up, hook up TradeLine to a forwarding number, and see exactly how the AI handles a real call before paying anything.",
        },
      ]}
      finalCtaTitle={
        <>
          See how WeFixTrades stacks up
          <br />
          on your phones, your calls, your reviews.
        </>
      }
    />
  );
}
