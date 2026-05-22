/**
 * Wave BF-6 — MapGuard Snapshot main page.
 *
 * Free GBP rank-grid + audit tool. Replaces MissedCallCalculator as the
 * flagship traffic-driving free tool. Single-page 3-state UI: intake →
 * loading → results. Implementation lives in MapSnapshotShell so per-trade
 * landings can reuse it.
 */

import MarketingLayout from "@/components/marketing/MarketingLayout";
import MapSnapshotShell from "@/components/marketing/map-snapshot/MapSnapshotShell";
import { usePageMeta } from "@/lib/usePageMeta";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import { useEffect } from "react";

export default function MapSnapshot() {
  usePageMeta({
    title: "Free Google Maps Rank Audit — MapGuard Snapshot",
    description:
      "See where your business ranks on Google Maps across a 5×5 grid, plus a 10-card audit of every GBP signal dragging your rank down. Free, no signup.",
    canonicalPath: "/tools/map-snapshot",
  });

  useBreadcrumbSchema([
    { name: "Home", url: "/" },
    { name: "Tools", url: "/tools" },
    { name: "Map Snapshot", url: "/tools/map-snapshot" },
  ]);

  // Schema.org SoftwareApplication structured data
  useEffect(() => {
    const id = "map-snapshot-schema";
    let el = document.getElementById(id) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement("script");
      el.id = id;
      el.type = "application/ld+json";
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "MapGuard Snapshot",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description:
        "Free Google Business Profile rank-grid + 10-card audit tool for trade businesses.",
    });
    return () => {
      el?.remove();
    };
  }, []);

  return (
    <MarketingLayout>
      <div style={{ padding: "48px 16px 80px", background: "#fafafa", minHeight: "60vh" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center", marginBottom: 24 }}>
          <h1
            style={{
              fontSize: "clamp(28px, 5vw, 40px)",
              fontWeight: 800,
              color: "#1E1E1E",
              margin: "0 0 12px",
              lineHeight: 1.15,
            }}
          >
            Where do you <span style={{ color: "#0d3cfc" }}>actually</span> rank on Google Maps?
          </h1>
          <p
            style={{
              fontSize: "clamp(14px, 2vw, 16px)",
              color: "#525252",
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            Get a free 5×5 rank-grid for your business plus a 10-card audit of every GBP
            signal that's keeping you out of the local 3-pack.
          </p>
        </div>

        <MapSnapshotShell />
      </div>
    </MarketingLayout>
  );
}
