import { Zap, Users, Globe, Clock } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { BODY_FONT } from "./styles";

const BADGES = [
  { icon: Zap, text: "Instant quotes in seconds" },
  { icon: Users, text: "Leads captured automatically" },
  { icon: Globe, text: "Works on any website" },
  { icon: Clock, text: "Setup in minutes" },
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
      >
        {BADGES.map((badge) => (
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
