/**
 * RecommendationCard — a WeFixTrades service surfaced inside the chat
 * window when the assistant recommends it. Brief benefits + two CTAs:
 *   See details  → product page
 *   Add to package → checkout (item pre-selected)
 */

import { Link } from "wouter";
import { ArrowRight, Plus } from "lucide-react";
import type { Service } from "@shared/services";
import { productSlugForService } from "@/lib/recommendations";

interface RecommendationCardProps {
  service: Service;
  onAddToPackage: (service: Service) => void;
}

export function RecommendationCard({ service, onAddToPackage }: RecommendationCardProps) {
  const benefits = service.features.slice(0, 3);
  const slug = productSlugForService(service.id);

  return (
    <div
      data-theme="light"
      style={{
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        background: "#fff",
        padding: 12,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: "#1A1A2E" }}>{service.name}</div>
      <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, lineHeight: 1.4 }}>
        {service.tagline}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#0d3cfc", marginTop: 5 }}>
        {service.priceLabel}
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "flex", flexDirection: "column", gap: 3 }}>
        {benefits.map((b) => (
          <li key={b} style={{ fontSize: 11, color: "#374151", display: "flex", gap: 5, lineHeight: 1.4 }}>
            <span style={{ color: "#0d3cfc", fontWeight: 800 }}>✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <Link
          href={`/products/${slug}`}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #D1D5DB",
            background: "#fff",
            color: "#1A1A2E",
            fontSize: 11,
            fontWeight: 700,
            textDecoration: "none",
            cursor: "pointer",
          }}
        >
          See details <ArrowRight size={12} />
        </Link>
        <button
          type="button"
          onClick={() => onAddToPackage(service)}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: "8px 10px",
            borderRadius: 8,
            border: "none",
            background: "linear-gradient(135deg, #0d3cfc, #0b34d6)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <Plus size={12} /> Add to package
        </button>
      </div>
    </div>
  );
}
