/**
 * /for-franchises — landing page for multi-location operators (5-500
 * locations). Uses the shared AudienceLandingPage template.
 */
import { MapPin, CreditCard, Star, BarChart3 } from "lucide-react";
import AudienceLandingPage from "./AudienceLandingPage";
import { mkt } from "@/theme/tokens";

export default function ForFranchisesPage() {
  return (
    <AudienceLandingPage
      path="/for-franchises"
      breadcrumbLabel="For Franchises"
      pageTitle="For Franchises & Multi-Location"
      pageDescription="Manage 5 to 500 locations from one dashboard. Per-location Google Business Profile, MapGuard monitoring, unified reputation management, and central billing for franchise networks."
      productName="For Franchises"
      heroEyebrow="One location is hard. Fifty is impossible without the right ops layer."
      heroHeadline={
        <>
          Manage 5 to 500 locations
          <br />
          <span style={{ color: mkt.accent }}>from one dashboard.</span>
        </>
      }
      heroSub="Per-location Google Business Profile control, MapGuard alerts at the location level, unified reputation management across the network, and one invoice instead of fifty."
      valueEyebrow="Built for multi-location ops"
      valueTitle="Everything a franchise network needs in one place."
      valueProps={[
        {
          icon: MapPin,
          title: "Per-location GBP control",
          body: "Each location gets its own Google Business Profile, NAP record, service area, and review feed — managed by HQ or the franchisee, your choice.",
        },
        {
          icon: BarChart3,
          title: "MapGuard for every location",
          body: "24/7 suspension monitoring, listing-drift alerts, and rank-grid tracking for every location. Roll up to a network view or drill into a single store.",
        },
        {
          icon: Star,
          title: "Unified reputation",
          body: "All reviews across the network in one inbox. Spot a location trending down before head office does. Reply with templated brand-safe responses.",
        },
        {
          icon: CreditCard,
          title: "Central billing",
          body: "One invoice for the whole network, broken out by location. Charge back to franchisees automatically or absorb at corporate — your call.",
        },
      ]}
      pricingTeaserTitle="Network pricing — never per seat, never per franchisee."
      pricingTeaserBody="Volume tiers at 5 / 25 / 100 / 500 locations. Onboarding included. Dedicated success rep starts at 25 locations. Talk to sales for a network quote."
      testimonialQuote="We rolled out WeFixTrades to all 38 of our locations in six weeks. Our franchisees actually use it because it's faster than the old spreadsheet — and head office finally has one view of every review across the network."
      testimonialAttribution="— Franchise case study placeholder · Q3 launch"
      finalCtaTitle={
        <>
          One dashboard.
          <br />
          Every location. Every review.
        </>
      }
    />
  );
}
