/**
 * /for-solo-traders — landing for one-person trade businesses
 * (solo plumber / electrician / etc). Cheap entry tier + TradeLine
 * voice agent are the headline angles. Uses shared AudienceLandingPage.
 */
import { Phone, DollarSign, Rocket, Wrench } from "lucide-react";
import AudienceLandingPage from "./AudienceLandingPage";
import { mkt } from "@/theme/tokens";

export default function ForSoloTradersPage() {
  return (
    <AudienceLandingPage
      path="/for-solo-traders"
      breadcrumbLabel="For Solo Traders"
      pageTitle="For Solo Traders"
      pageDescription="Everything a one-person trade business needs without the agency price tag. A free quote-tool tier to start, 24/7 TradeLine voice agent so you never miss a call, and one-click onboarding."
      productName="For Solo Traders"
      heroEyebrow="Every missed call is a job that went to the next plumber on the list."
      heroHeadline={
        <>
          Everything a one-person trade business needs
          <br />
          <span style={{ color: mkt.accent }}>without the agency price tag.</span>
        </>
      }
      heroSub="Start free, upgrade to the $29/mo quote tool when you're ready, and add a 24/7 voice agent that answers when you're on a job. Onboarding takes under ten minutes. No retainer. No setup fee. Cancel anytime."
      valueEyebrow="For the one-person operation"
      valueTitle="Priced like a phone bill, not a marketing agency."
      valueProps={[
        {
          icon: DollarSign,
          title: "Free to start, $29/mo to grow",
          body: "Begin on the free quote-tool tier, then upgrade to the $29/mo plan for the full calculator widget and review link — no contract, no setup fee.",
        },
        {
          icon: Phone,
          title: "TradeLine 24/7 voice agent",
          body: "A real-time AI phone agent picks up when you can't. Books the appointment, captures the lead, and texts you a summary before you're back at the truck.",
        },
        {
          icon: Rocket,
          title: "10-minute onboarding",
          body: "Answer ten questions about your business, upload your logo, paste your service list. You're live the same day — no implementation calls.",
        },
        {
          icon: Wrench,
          title: "Built for the jobsite",
          body: "Everything works on a phone in a van. No 'log into the CRM' steps. Approve quotes, view leads, and reply to reviews from a text-message-style UI.",
        },
      ]}
      pricingTeaserTitle="Start free. No card to try it."
      pricingTeaserBody="Upgrade to the $29/mo quote tool, or add the 24/7 TradeLine voice agent from $99/mo when you're ready. Upgrade or cancel from inside the dashboard — no calls, no cancellation fees."
      testimonialQuote="I'm a one-truck plumber. Before WeFixTrades I was missing maybe six calls a week. The voice agent picks up everything now, and I bid on three extra jobs a week that I would've never known existed."
      testimonialAttribution="— Solo plumber case study placeholder · Q3 launch"
      finalCtaTitle={
        <>
          Stop missing calls.
          <br />
          Start booking the work.
        </>
      }
      productCtas={[
        { label: "TradeLine", href: "/products/tradeline", tagline: "AI voice agent answers every call, books jobs while you work" },
        { label: "QuoteQuick", href: "/products/quotequick", tagline: "Instant on-site quotes from your phone — close more bids" },
        { label: "ReputationShield", href: "/products/reputationshield", tagline: "Automatically request reviews after every completed job" },
      ]}
      recommendedFreeTools={[
        { label: "Free Audit", href: "/tools/free-audit" },
        { label: "Citation Checker", href: "/tools/citation-checker" },
        { label: "Google Review Link Generator", href: "/tools/google-review-link-generator" },
      ]}
    />
  );
}
