import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { mkt } from "@/theme/tokens";
import { GRID_BG } from "./styles";
import HeroSection from "./HeroSection";
import TrustStrip from "./TrustStrip";
import FeaturesGrid from "./FeaturesGrid";
import HowItWorks from "./HowItWorks";
import ResultsSection from "./ResultsSection";
import PricingSection from "./PricingSection";
import FaqSection from "./FaqSection";
import FinalCta from "./FinalCta";

export default function MapGuardPage() {
  useScrollReveal();

  useEffect(() => {
    document.title = "MapGuard™ — Google Maps Optimization | WeFixTrades";
    const metaDesc = document.querySelector('meta[name="description"]');
    const desc =
      "We optimize your Google Business profile so you show up when customers search for your service in your area.";
    if (metaDesc) {
      metaDesc.setAttribute("content", desc);
    } else {
      const meta = document.createElement("meta");
      meta.name = "description";
      meta.content = desc;
      document.head.appendChild(meta);
    }
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
    link.href = `${window.location.origin}/products/mapguard`;
  }, []);

  return (
    <MarketingLayout>
      <div style={{ ...GRID_BG, background: mkt.bg, overflowX: "hidden" }}>
        <HeroSection />
        <TrustStrip />
        <FeaturesGrid />
        <HowItWorks />
        <ResultsSection />
        <PricingSection />
        <FaqSection />
        <FinalCta />
      </div>
    </MarketingLayout>
  );
}
