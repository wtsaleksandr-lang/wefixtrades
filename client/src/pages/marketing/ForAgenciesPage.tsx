/**
 * /for-agencies — landing page for marketing agencies who manage local SEO
 * + content for their own client books. Uses the shared AudienceLandingPage
 * template; only copy/icons live here.
 */
import { Layers, Inbox, Sparkles, Users } from "lucide-react";
import AudienceLandingPage from "./AudienceLandingPage";
import { mkt } from "@/theme/tokens";

export default function ForAgenciesPage() {
  return (
    <AudienceLandingPage
      path="/for-agencies"
      breadcrumbLabel="For Agencies"
      pageTitle="For Marketing Agencies"
      pageDescription="White-label local SEO, content, and reputation tools for marketing agencies. Manage every client's Google Business Profile, MapGuard alerts, and ContentFlow output from one multi-client dashboard."
      productName="For Agencies"
      heroEyebrow="Stop stitching five tools together for every new client."
      heroHeadline={
        <>
          White-label local SEO + content
          <br />
          <span style={{ color: mkt.accent }}>for your agency clients.</span>
        </>
      }
      heroSub="One multi-client dashboard for Google Business Profile, MapGuard alerts, review automation, and ContentFlow at scale — under your brand, your domain, your pricing."
      valueEyebrow="Why agencies pick WeFixTrades"
      valueTitle="Built for agency operators, not solo owners."
      valueProps={[
        {
          icon: Layers,
          title: "White-label everything",
          body: "Your logo, your domain, your colour palette. Clients see your brand on every dashboard, report, and email — never ours.",
        },
        {
          icon: Users,
          title: "Multi-client dashboard",
          body: "Switch between every client in your book from a single sidebar. No re-logging in, no juggling tabs. Bulk actions across accounts.",
        },
        {
          icon: Sparkles,
          title: "ContentFlow at scale",
          body: "Spin up monthly blog posts, social drops, and trade-specific prompt libraries for dozens of clients in one batch. Approve in queue.",
        },
        {
          icon: Inbox,
          title: "MapGuard alerts in one inbox",
          body: "Every client's Google Business Profile monitored 24/7. Suspensions, NAP edits, and bad reviews land in one shared inbox.",
        },
      ]}
      pricingTeaserTitle="Agency pricing scales with your book — not per seat."
      pricingTeaserBody="Tiered volume discounts kick in once you cross 5 / 25 / 100 active clients. No per-user fees, no surprise overages. Talk to sales for a custom plan."
      testimonialQuote="We replaced four separate vendors with WeFixTrades white-label. Our agency margin went from 18% to 41% on the same retainers — without our clients noticing anything except faster turnarounds."
      testimonialAttribution="— Agency case study placeholder · Q3 launch"
      finalCtaTitle={
        <>
          Run every client&apos;s
          <br />
          local presence from one place.
        </>
      }
      productCtas={[
        { label: "MapGuard", href: "/products/mapguard", tagline: "Manage every client's Google Maps visibility from one dashboard" },
        { label: "Citation Builder", href: "/citation-builder", tagline: "Bulk-submit clients to 100+ directories — one order each" },
        { label: "ContentFlow", href: "/products/contentflow", tagline: "Spin up monthly content for dozens of clients in batch" },
        { label: "ReputationShield", href: "/products/reputationshield", tagline: "Multi-client review monitoring + response queue" },
      ]}
      recommendedFreeTools={[
        { label: "Citation Checker", href: "/tools/citation-checker" },
        { label: "Local RankFlux", href: "/tools/local-rankflux" },
        { label: "Local Search Checker", href: "/tools/local-search-checker" },
      ]}
    />
  );
}
