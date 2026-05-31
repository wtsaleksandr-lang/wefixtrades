/**
 * /wefixtrades-vs-servicetitan — SEO comparison page targeting
 * "ServiceTitan alternative" and "WeFixTrades vs ServiceTitan"
 * intent searches. Uses the shared CompareLandingPage template with
 * ServiceTitan-specific data.
 *
 * ServiceTitan does NOT publish pricing (quote/demo-only). Any figures
 * below are framed as third-party ESTIMATES, never as fact — stating an
 * unpublished competitor's price as fact is a false-advertising risk.
 */
import CompareLandingPage from "@/components/marketing/CompareLandingPage";
import { mkt } from "@/theme/tokens";

const PUBLISHED = "2026-05-25";

export default function CompareVsServiceTitan() {
  return (
    <CompareLandingPage
      path="/wefixtrades-vs-servicetitan"
      competitorName="ServiceTitan"
      competitorPossessive="ServiceTitan's"
      pageTitle="WeFixTrades vs ServiceTitan: which is right for your trades business?"
      pageDescription="Honest WeFixTrades vs ServiceTitan comparison. Pricing, AI voice, enterprise FSM, and which platform fits 1-15 tech shops vs 20+ tech operations."
      keywords={[
        "servicetitan alternative",
        "servicetitan vs wefixtrades",
        "wefixtrades vs servicetitan",
        "enterprise field service software",
        "small business FSM alternative",
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
          WeFixTrades vs ServiceTitan:
          <br />
          <span style={{ color: mkt.accent }}>which is right for your business?</span>
        </>
      }
      heroSub="ServiceTitan is the enterprise FSM for 20+ tech operations — and prices like it. WeFixTrades is the AI-first platform tuned for 1-15 tech shops who want the same outcomes (24/7 voice, Google Business, content, reviews, native mobile) at 10-50× lower cost. Different price brackets, different buyers — here's the honest take."
      tldrRows={[
        {
          label: "Starts at",
          us: "$9/mo · free tier available",
          them: "Not publicly listed · est. ~$200-500/user/mo (quote-based)",
        },
        {
          label: "Best for",
          us: "Solo to 15-tech trades wanting modern AI without enterprise pricing",
          them: "20+ tech operations needing enterprise FSM, deep integrations, dedicated CSM",
        },
        {
          label: "AI voice agent",
          us: "Built-in 24/7 TradeLine",
          them: "AI Voice Agent available as a paid add-on",
        },
        {
          label: "AI content / images",
          us: "ContentFlow — content + images",
          them: "Not built-in (marketing handled by separate ServiceTitan Marketing Pro add-on)",
        },
        {
          label: "Job scheduling / dispatching",
          us: "Lighter (BookFlow)",
          them: "Best-in-class enterprise dispatch board",
        },
        {
          label: "Mobile app",
          us: "Native iOS + Android softphone — owner-side calls, voicemail, ETA",
          them: "Mature native field-tech app with offline mode",
        },
        {
          label: "Google Business management",
          us: "MapGuard — built-in",
          them: "Not built-in (handled by Marketing Pro / third-party)",
        },
        {
          label: "Setup time",
          us: "Same-day signup",
          them: "Typically 4-12 weeks with dedicated implementation team",
        },
        {
          label: "Contract terms",
          us: "Month-to-month, cancel anytime",
          them: "Annual contracts typical, multi-year incentives",
        },
        {
          label: "Free tier",
          us: "Yes",
          them: "No — demo + custom quote only",
        },
      ]}
      matrixRows={[
        { feature: "AI voice agent (24/7 call answering)", us: true, them: "partial", note: "ServiceTitan: paid AI Voice Agent add-on" },
        { feature: "AI content + image generation", us: true, them: false },
        { feature: "Google Business Profile management (MapGuard)", us: true, them: false },
        { feature: "Reputation / review collection", us: true, them: true, note: "ServiceTitan via Marketing Pro" },
        { feature: "SMS automation", us: true, them: true },
        { feature: "Online booking + quotes", us: true, them: true },
        { feature: "Job scheduling + dispatching", us: "partial", them: true, note: "ServiceTitan's enterprise dispatch board is genuinely deep — and you pay for it." },
        { feature: "Route optimisation", us: false, them: true },
        { feature: "Customer portal", us: true, them: true },
        { feature: "Native iOS + Android app", us: true, them: true, note: "WeFixTrades ships a softphone for the owner; ServiceTitan ships a mature field-tech app for the technician. Both native, different focus." },
        { feature: "Invoicing + payments", us: true, them: true },
        { feature: "Free tier", us: true, them: false },
        { feature: "Starts at", us: "$9/mo", them: "Quote-based (est. $200+/user/mo)" },
        { feature: "Setup time", us: "Same-day", them: "4-12 wks" },
        { feature: "AI image/article generation (ContentFlow)", us: true, them: false },
        { feature: "Social-media scheduling (SocialSync)", us: true, them: false },
        { feature: "Multi-trade support", us: true, them: true },
        { feature: "Inventory / parts management", us: false, them: true },
        { feature: "Payroll / labour cost tracking", us: false, them: true },
        { feature: "Membership / service-agreement billing", us: "partial", them: true },
        { feature: "Dedicated customer success manager", us: false, them: true, note: "Enterprise plans only" },
        { feature: "Public API", us: true, them: true },
        { feature: "White-label option", us: "partial", them: false },
        { feature: "Annual contract required", us: false, them: true },
        { feature: "QuickBooks / accounting integration", us: "partial", them: true },
      ]}
      ourPricing={[
        "Free — try every product, single workspace",
        "Starter $9/mo — single trade, basic AI",
        "Growth $49/mo — full AI suite",
        "Scale $149/mo — multi-location, white-label",
        "Month-to-month, cancel anytime, no card to start.",
      ]}
      theirPricing={[
        "Custom — quote-on-request, no public pricing",
        "Not publicly listed; third-party estimates ~$200-500/user/mo",
        "Typical annual contract with multi-year discounts",
        "Marketing Pro, AI Voice Agent, and Pricebook Pro are paid add-ons",
        "Implementation fees commonly several thousand dollars up front",
      ]}
      whenThemBetter={[
        "You run 20+ techs across multiple locations and need an enterprise dispatch board, parts inventory, and integrated payroll.",
        "You have the budget for enterprise FSM pricing (third-party estimates put ServiceTitan around $200-500/user/mo) and want a dedicated implementation team + customer success manager.",
        "Your operation depends on deep integrations with enterprise accounting, ERP, or call-tracking platforms.",
        "You need ServiceTitan-specific industry features (Pricebook Pro, Capacity Planning) that are battle-tested across thousands of large shops.",
      ]}
      whenUsBetter={[
        "You're 1-15 techs and ServiceTitan's pricing is plainly out of reach (and would be overkill anyway).",
        "You want modern AI — voice, content, reviews — without paying enterprise add-on prices for each one.",
        "You'd rather sign up today and be live tonight than spend 4-12 weeks in implementation.",
        "Month-to-month with cancel-anytime matters to you. No annual contract, no multi-year lock-in.",
      ]}
      testimonialQuote="We did the ServiceTitan demo. Phenomenal product, but the quote came back at $1,800/month plus $12K implementation — for a 4-tech shop. WeFixTrades gave us the AI receptionist and Google Business monitoring for $49 a month. Right tool for our stage."
      testimonialAttribution="— Case study placeholder · electrical, 4 techs"
      faqItems={[
        {
          question: "How much cheaper is WeFixTrades than ServiceTitan?",
          answer:
            "Order-of-magnitude cheaper for small shops. ServiceTitan doesn't publish pricing, but third-party estimates put a 4-tech business in the ballpark of ~$800-2,000/month (4 users × ~$200-500) plus implementation fees — versus $49-149/month total on WeFixTrades. ServiceTitan's enterprise pricing is intentional — they're aimed at 20+ tech operations where deep FSM features earn back the cost. Below that bar we're typically far cheaper.",
        },
        {
          question: "Can WeFixTrades replace ServiceTitan for a large operation?",
          answer:
            "For most 20+ tech operations: no, not today. ServiceTitan's depth in dispatch, inventory, payroll, and capacity planning is genuinely best-in-class and earns its price tag at scale. WeFixTrades targets the 1-15 tech segment where ServiceTitan is overkill. If you're between 15 and 25 techs, do both demos — the right answer depends on your dispatching complexity.",
        },
        {
          question: "Does WeFixTrades have AI voice like ServiceTitan's AI Voice Agent?",
          answer:
            "Yes — 24/7 TradeLine answers calls, asks qualifying questions, books jobs, and routes urgent calls to you. It's bundled into our $49/mo Growth plan rather than billed as a separate add-on. ServiceTitan's AI Voice Agent is a strong product; the difference is pricing model and target shop size.",
        },
        {
          question: "How long does ServiceTitan implementation take?",
          answer:
            "Public ServiceTitan customer reports put implementation at 4-12 weeks for a mid-size shop, longer for multi-location enterprises. The platform's depth is the reason — there's genuinely more to configure. WeFixTrades' typical signup-to-live time is under an hour.",
        },
        {
          question: "Do I have to sign a contract with WeFixTrades?",
          answer:
            "No. Month-to-month, cancel any time, no card required to start the free tier. ServiceTitan deals are typically annual with multi-year discount incentives.",
        },
        {
          question: "Can I switch from ServiceTitan to WeFixTrades?",
          answer:
            "Yes — customer lists, job history, and quote templates import via CSV. The bigger question is whether you'll miss the dispatching and inventory depth. We recommend running both in parallel for a billing cycle before fully switching. Contact sales — we'll help map your workflow.",
        },
        {
          question: "Is WeFixTrades a 'real' FSM platform or just marketing tools?",
          answer:
            "Both. We ship full FSM basics — booking, quotes, jobs, invoicing, payments, customer portal — alongside the AI marketing stack (voice, content, reviews, Google Business). What we don't do at ServiceTitan's depth: enterprise dispatch boards, full parts inventory, payroll integration. That gap is intentional for our buyer.",
        },
      ]}
      finalCtaTitle={
        <>
          AI receptionist + reputation
          <br />
          without the enterprise price tag.
        </>
      }
    />
  );
}
