import { Star, Shield, Zap, MessageSquare, MapPin } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { BODY_FONT } from "./styles";

const BADGES = [
  { icon: MapPin, text: "Built for trades businesses" },
  { icon: Zap, text: "Done-for-you (no setup work on your side)" },
  { icon: Shield, text: "No contracts" },
  { icon: Star, text: "Results in 30\u201360 days" },
];

export default function TrustStrip() {
  return (
    <section
      style={{
        borderTop: `1px solid ${mkt.border}`,
        borderBottom: `1px solid ${mkt.border}`,
        padding: "24px",
        background: "rgba(255,255,255,0.015)",
      }}
      data-reveal="fade-up"
    >
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
        className="mapguard-trust-strip"
      >
        {BADGES.map((badge, i) => (
          <div
            key={badge.text}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <badge.icon size={14} color={mkt.accent} strokeWidth={2} />
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                fontFamily: BODY_FONT,
                color: mkt.textMuted,
                whiteSpace: "nowrap",
              }}
            >
              {badge.text}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
