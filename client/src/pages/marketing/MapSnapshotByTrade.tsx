/**
 * Wave BF-6 — per-trade SEO landing page for MapGuard Snapshot.
 *
 * Reads :tradeSlug from the route and renders trade-specific copy + success
 * stories above the shared MapSnapshotShell. Falls back to the main page
 * when the slug is unknown.
 */

import { useRoute, Redirect } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import MapSnapshotShell from "@/components/marketing/map-snapshot/MapSnapshotShell";
import { TRADE_CONFIGS } from "@/components/marketing/map-snapshot/tradeConfig";
import { usePageMeta } from "@/lib/usePageMeta";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import { useEffect } from "react";

export default function MapSnapshotByTrade() {
  const [, params] = useRoute("/tools/map-snapshot/:tradeSlug");
  const tradeSlug = params?.tradeSlug || "";
  const config = TRADE_CONFIGS[tradeSlug];

  if (!config) {
    return <Redirect to="/tools/map-snapshot" />;
  }

  usePageMeta({
    title: config.metaTitle,
    description: config.metaDescription,
    canonicalPath: `/tools/map-snapshot/${config.slug}`,
  });

  useBreadcrumbSchema([
    { name: "Home", url: "/" },
    { name: "Tools", url: "/tools" },
    { name: "Map Snapshot", url: "/tools/map-snapshot" },
    { name: config.label, url: `/tools/map-snapshot/${config.slug}` },
  ]);

  useEffect(() => {
    const id = "map-snapshot-trade-schema";
    let el = document.getElementById(id) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement("script");
      el.id = id;
      el.type = "application/ld+json";
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: `${config.label} — MapGuard Snapshot`,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description: config.metaDescription,
    });
    return () => {
      el?.remove();
    };
  }, [tradeSlug]);

  return (
    <MarketingLayout>
      <div data-theme="light" style={{ padding: "48px 16px 80px", background: "#fafafa", minHeight: "60vh" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", marginBottom: 24 }}>
          <h1
            style={{
              fontSize: "clamp(28px, 5vw, 40px)",
              fontWeight: 800,
              color: "#1E1E1E",
              margin: "0 0 16px",
              lineHeight: 1.15,
              textAlign: "center",
            }}
          >
            {config.h1}
          </h1>
          <p
            style={{
              fontSize: "clamp(14px, 2vw, 16px)",
              color: "#525252",
              lineHeight: 1.6,
              marginBottom: 14,
            }}
          >
            {config.intro}
          </p>
          <p
            style={{
              fontSize: "clamp(14px, 2vw, 16px)",
              color: "#525252",
              lineHeight: 1.6,
              marginBottom: 0,
            }}
          >
            {config.intro2}
          </p>
        </div>

        <MapSnapshotShell trade={config.label.toLowerCase()} />

        {/* Success stories */}
        <div style={{ maxWidth: 720, margin: "48px auto 0" }}>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#1E1E1E",
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            {config.label} businesses that climbed the local pack
          </h2>
          <div style={{ display: "grid", gap: 12 }}>
            {config.successStories.map((s) => (
              <div
                key={s.name}
                style={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1E1E1E" }}>
                  {s.name}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#0d3cfc",
                    margin: "4px 0 8px",
                  }}
                >
                  {s.result}
                </div>
                <div style={{ fontSize: 13, color: "#4b5563", fontStyle: "italic" }}>
                  "{s.quote}"
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#9ca3af",
              textAlign: "center",
              marginTop: 12,
            }}
          >
            Names and outcomes shown above are illustrative examples.
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
