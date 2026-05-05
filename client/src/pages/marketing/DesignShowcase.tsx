/**
 * DesignShowcase — internal preview page for the new Effortel-style
 * marketing components. Renders every new section back-to-back so the
 * owner can review them on a single URL before deciding where each
 * lives on production marketing pages.
 *
 * Route: /design-showcase
 */

import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

import IntegrationsOrbit from "@/components/marketing/showcase/IntegrationsOrbit";
import StackBuilder from "@/components/marketing/showcase/StackBuilder";
import AllInOneDiagram from "@/components/marketing/showcase/AllInOneDiagram";
import ProactiveStats from "@/components/marketing/showcase/ProactiveStats";
import MultiTieredSupport from "@/components/marketing/showcase/MultiTieredSupport";
import PremiumStackOrbit from "@/components/marketing/showcase/PremiumStackOrbit";
import EfficientOnboarding from "@/components/marketing/showcase/EfficientOnboarding";
import BenefitsGrid from "@/components/marketing/showcase/BenefitsGrid";

import AdFlowIllustration from "@/components/marketing/illustrations/AdFlowIllustration";
import RankFlowIllustration from "@/components/marketing/illustrations/RankFlowIllustration";
import MapGuardIllustration from "@/components/marketing/illustrations/MapGuardIllustration";
import MapGuardCloudIllustration from "@/components/marketing/illustrations/MapGuardCloudIllustration";
import WeFixTradesLaptopHero from "@/components/marketing/illustrations/WeFixTradesLaptopHero";

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: `1px solid ${mkt.onDarkBorder}` }}>
      <div style={{
        maxWidth: 1100, margin: "0 auto",
        padding: "32px 24px 8px",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <span style={{
          fontFamily: MONO,
          fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
          textTransform: "uppercase", color: mkt.accent,
        }}>{label}</span>
        <span style={{ flex: 1, height: 1, background: mkt.onDarkBorder }} />
      </div>
      {children}
    </section>
  );
}

function IllustrationFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "32px 24px",
      background: mkt.bg,
      display: "flex", justifyContent: "center",
    }}>
      <div style={{ maxWidth: 720, width: "100%" }}>{children}</div>
    </div>
  );
}

export default function DesignShowcase() {
  useEffect(() => { document.title = "Design Showcase — WeFixTrades"; }, []);

  return (
    <MarketingLayout hideSiteChat>
      <div style={{ background: mkt.bg, color: mkt.onDark, minHeight: "100vh" }}>
        {/* Hero header */}
        <section style={{ padding: "72px 24px 40px", textAlign: "center" }}>
          <span style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.20em", textTransform: "uppercase",
            color: mkt.accent,
          }}>
            Internal Preview
          </span>
          <h1 style={{
            margin: "12px auto 14px", maxWidth: 720,
            fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 700,
            letterSpacing: "-0.025em", lineHeight: 1.05,
          }}>
            New marketing modules.
          </h1>
          <p style={{
            maxWidth: 540, margin: "0 auto",
            fontSize: 16, lineHeight: 1.55, color: mkt.onDarkMuted,
          }}>
            Eight composition cards + four product illustrations. Pick where each lands on the public site.
          </p>
        </section>

        <Section label="01 · Integrations Orbit">
          <IntegrationsOrbit />
        </Section>

        <Section label="02 · Build Your Stack">
          <StackBuilder />
        </Section>

        <Section label="03 · All-in-one Diagram">
          <AllInOneDiagram />
        </Section>

        <Section label="04 · Proactive Managed Services">
          <ProactiveStats />
        </Section>

        <Section label="05 · Multi-Tiered Support">
          <MultiTieredSupport />
        </Section>

        <Section label="06 · Premium Stack Orbit">
          <PremiumStackOrbit />
        </Section>

        <Section label="07 · Efficient Onboarding">
          <EfficientOnboarding />
        </Section>

        <Section label="08 · Benefits Grid">
          <BenefitsGrid />
        </Section>

        <Section label="09 · AdFlow Illustration">
          <IllustrationFrame><AdFlowIllustration size={720} /></IllustrationFrame>
        </Section>

        <Section label="10 · RankFlow Illustration">
          <IllustrationFrame><RankFlowIllustration size={720} /></IllustrationFrame>
        </Section>

        <Section label="11 · MapGuard Illustration">
          <IllustrationFrame><MapGuardIllustration size={720} /></IllustrationFrame>
        </Section>

        <Section label="11b · MapGuard Cloud (dotted-map style)">
          <IllustrationFrame><MapGuardCloudIllustration size={720} /></IllustrationFrame>
        </Section>

        <Section label="12 · WeFixTrades Laptop Hero">
          <IllustrationFrame><WeFixTradesLaptopHero size={1080} /></IllustrationFrame>
        </Section>

        <div style={{ padding: "60px 24px 100px" }} />
      </div>
    </MarketingLayout>
  );
}
