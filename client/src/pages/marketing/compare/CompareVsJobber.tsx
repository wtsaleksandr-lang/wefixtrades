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
      heroHeadline={
        <>
          WeFixTrades vs Jobber:
          <br />
          <span style={{ color: mkt.accent }}>which is right for your business?</span>
        </>
      }
      heroSub="Jobber is 15+ years deep in field-service ops. WeFixTrades is a newer AI-first platform that bundles voice, content, reputation, and Google Business in one. Here's a straight-up read on both."
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
          label: "Mobile field app",
          us: "Web-responsive only (no native app yet)",
          them: "Native iOS + Android apps for techs",
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
        { feature: "Job scheduling + dispatching", us: "partial", them: true, note: "Jobber's strongest area" },
        { feature: "Route optimisation", us: false, them: true },
        { feature: "Customer portal (client hub)", us: true, them: true },
        { feature: "Mobile field app (native iOS/Android)", us: false, them: true },
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
        "You run 5+ techs and need a serious dispatch board with drag-drop routing and crew assignments.",
        "Your techs live on a phone in the truck and you need a polished native iOS/Android app today.",
        "You've already standardised your back office on QuickBooks Online and want the deepest two-way sync available.",
        "You don't need AI marketing — you have an agency or internal team handling SEO, content, and reviews.",
      ]}
      whenUsBetter={[
        "You want AI answering the phone 24/7 so you stop losing leads after-hours — without hiring a receptionist.",
        "You need Google Business Profile monitored, content generated, and reviews collected in one tool, not five.",
        "Budget matters. $9-49/mo for the AI stack beats $69-349/mo for scheduling-first software.",
        "You want to sign up today and be live tonight — no 1-2 week onboarding call.",
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
            "Not a native iOS/Android app — the WeFixTrades dashboard is fully web-responsive and works on mobile browsers, but we don't yet have an App Store app the way Jobber does. If your techs work primarily in the field and need offline-capable mobile job entry, Jobber wins this category today.",
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
