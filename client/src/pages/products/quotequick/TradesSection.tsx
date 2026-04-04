import { Wrench, Zap, SprayCan, Paintbrush, Home, Thermometer } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { BODY_FONT, GLASS, sectionHeading, sectionSub, SECTION_PAD, MAX_W } from "./styles";

const TRADES = [
  { icon: Wrench, label: "Plumbers" },
  { icon: Zap, label: "Electricians" },
  { icon: SprayCan, label: "Cleaners" },
  { icon: Paintbrush, label: "Painters" },
  { icon: Home, label: "Roofers" },
  { icon: Thermometer, label: "HVAC" },
];

export default function TradesSection() {
  return (
    <section style={{ ...SECTION_PAD, background: mkt.bg }}>
      <div style={MAX_W}>
        <div style={{ textAlign: "center", marginBottom: 40 }} data-reveal="fade-up">
          <h2 style={sectionHeading}>
            Built for{" "}
            <span style={{ color: mkt.accent }}>Local Trades</span>
          </h2>
          <p style={sectionSub}>
            QuoteQuick supports the pricing models trades businesses actually use.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
          data-reveal="fade-up"
          data-delay="100"
        >
          {TRADES.map((trade) => {
            const Icon = trade.icon;
            return (
              <div
                key={trade.label}
                style={{
                  ...GLASS,
                  padding: "20px 24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  minWidth: 120,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: mkt.accentTint,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon size={20} color={mkt.accent} strokeWidth={1.8} />
                </div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: BODY_FONT,
                    color: mkt.textMuted,
                  }}
                >
                  {trade.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
