import { Zap, TrendingUp, Star } from "lucide-react";
import { mkt } from "@/theme/tokens";

const BADGES = [
  { icon: Zap, text: "24/7 call & chat answering" },
  { icon: TrendingUp, text: "Faster lead follow-ups" },
  { icon: Star, text: "Automated review collection" },
];

export default function TrustStrip() {
  return (
    <section
      data-testid="trust-strip"
      style={{
        background: mkt.bg,
        padding: "72px 28px 64px",
      }}
    >
      <div style={{ maxWidth: 780, margin: "0 auto", textAlign: "center" }}>
        <h2
          style={{
            fontSize: "clamp(22px, 3vw, 32px)",
            fontWeight: 700,
            color: "#141414",
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          Trusted by local trade businesses
        </h2>
        <p
          style={{
            marginTop: 12,
            fontSize: 15,
            color: mkt.textMuted,
            lineHeight: 1.6,
            maxWidth: 540,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Helping plumbers, HVAC teams, electricians and service businesses capture more leads automatically.
        </p>

        <div
          style={{
            marginTop: 32,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 12,
          }}
        >
          {BADGES.map(({ icon: Icon, text }) => (
            <div
              key={text}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 18px",
                borderRadius: 999,
                background: "rgba(12,103,255,0.06)",
                border: "1px solid rgba(12,103,255,0.12)",
                fontSize: 14,
                fontWeight: 600,
                color: "#141414",
                whiteSpace: "nowrap",
              }}
            >
              <Icon size={16} strokeWidth={1.75} style={{ color: mkt.accent, flexShrink: 0 }} />
              {text}
            </div>
          ))}
        </div>

        <p
          style={{
            marginTop: 28,
            fontSize: 13,
            color: mkt.textMuted,
            opacity: 0.75,
          }}
        >
          Built for busy service companies that don't want to miss calls.
        </p>
      </div>
    </section>
  );
}
