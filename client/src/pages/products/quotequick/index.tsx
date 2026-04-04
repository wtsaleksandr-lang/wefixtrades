import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { mkt } from "@/theme/tokens";
import { GRID_BG } from "./styles";
import HeroSection from "./HeroSection";
import TrustStrip from "./TrustStrip";
import DemoSection from "./DemoSection";
import FeaturesGrid from "./FeaturesGrid";
import HowItWorks from "./HowItWorks";
import TradesSection from "./TradesSection";
import PricingSection from "./PricingSection";
import FaqSection from "./FaqSection";
import FinalCta from "./FinalCta";

export default function QuoteQuickPage() {
  useScrollReveal();

  useEffect(() => {
    document.title = "QuoteQuick™ — Instant Quote Calculator for Your Website | WeFixTrades";
    const metaDesc = document.querySelector('meta[name="description"]');
    const desc =
      "Give website visitors instant quotes and capture every lead automatically. Built for local trades businesses. From $49/mo.";
    if (metaDesc) {
      metaDesc.setAttribute("content", desc);
    } else {
      const meta = document.createElement("meta");
      meta.name = "description";
      meta.content = desc;
      document.head.appendChild(meta);
    }
  }, []);

  return (
    <MarketingLayout>
      <div style={{ ...GRID_BG, background: mkt.bg, overflowX: "hidden" }}>
        <HeroSection />
        <TrustStrip />
        <DemoSection />
        <FeaturesGrid />
        <HowItWorks />
        <TradesSection />
        <PricingSection />
        <FaqSection />
        <FinalCta />
      </div>
    </MarketingLayout>
  );
}
