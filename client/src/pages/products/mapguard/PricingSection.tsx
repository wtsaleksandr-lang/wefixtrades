import { Link } from "wouter";
import { Check, ArrowRight } from "lucide-react";
import { mkt } from "@/theme/tokens";
import {
  HEADING_FONT,
  BODY_FONT,
  GLASS,
  GLOW_CYAN,
  sectionHeading,
  sectionSub,
  SECTION_PAD,
  MAX_W,
} from "./styles";
import { MAPGUARD } from "@/config/pricing";

const TIER_DESCRIPTIONS: Record<string, string> = {
  "MapSetup\u2122": "Full profile rebuild to start strong",
  "Basic": "Steady monitoring with light monthly improvements",
  "Pro": "Faster progress with more monthly optimization work",
};

const PLANS = MAPGUARD.tiers.map(t => ({
  name: t.name,
  desc: TIER_DESCRIPTIONS[t.name] || "",
  price: t.price,
  cadence: t.billingPeriod === "one-time" ? "one-time" : "/mo",
  badge: t.badge || null,
  features: t.features,
  highlighted: !!t.highlighted,
}));

export default function PricingSection() {
  return (
    <section
      style={{
        ...SECTION_PAD,
        background: `linear-gradient(180deg, ${mkt.dark} 0%, ${mkt.bg} 100%)`,
      }}
    >
      <div style={MAX_W}>
        <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
          <h2 style={sectionHeading}>
            Simple Pricing.{" "}
            <span style={{ color: mkt.accent }}>No Contracts.</span>
          </h2>
          <p style={sectionSub}>
            Includes ongoing optimization work — not just monitoring. We set it up, then manage and improve it monthly. Cancel anytime.
          </p>
        </div>

        <div
          className="mapguard-pricing-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 20,
            alignItems: "start",
          }}
          data-reveal="fade-up"
          data-delay="100"
        >
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              style={{
                ...GLASS,
                padding: "32px 28px",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                ...(plan.highlighted
                  ? {
                      border: `2px solid ${mkt.accent}`,
                      boxShadow: GLOW_CYAN,
                      transform: "translateY(-8px)",
                    }
                  : {}),
              }}
            >
              {/* Badge */}
              {plan.badge && (
                <div
                  style={{
                    position: "absolute",
                    top: -13,
                    left: "50%",
                    transform: "translateX(-50%)",
                    padding: "4px 16px",
                    borderRadius: 999,
                    background: mkt.accent,
                    color: mkt.dark,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {plan.badge}
                </div>
              )}

              <h3
                style={{
                  fontFamily: HEADING_FONT,
                  fontSize: 20,
                  fontWeight: 700,
                  color: mkt.text,
                  marginBottom: 12,
                }}
              >
                {plan.name}
              </h3>
              {plan.desc && (
                <p style={{ fontFamily: BODY_FONT, fontSize: 13, color: mkt.textMuted, lineHeight: 1.5, marginBottom: 12, marginTop: -4 }}>
                  {plan.desc}
                </p>
              )}

              <div style={{ marginBottom: 24 }}>
                <span
                  style={{
                    fontFamily: HEADING_FONT,
                    fontSize: 40,
                    fontWeight: 800,
                    color: mkt.onDark,
                  }}
                >
                  ${plan.price}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    color: mkt.textMuted,
                    marginLeft: 4,
                  }}
                >
                  {plan.cadence}
                </span>
              </div>

              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                {plan.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      fontSize: 14,
                      fontFamily: BODY_FONT,
                      color: mkt.textMuted,
                      lineHeight: 1.5,
                    }}
                  >
                    <Check
                      size={16}
                      color={mkt.accent}
                      strokeWidth={2.5}
                      style={{ flexShrink: 0, marginTop: 2 }}
                    />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "13px 24px",
                  borderRadius: 12,
                  background: plan.highlighted ? mkt.accent : "rgba(255,255,255,0.06)",
                  color: plan.highlighted ? mkt.dark : mkt.onDark,
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: "none",
                  border: plan.highlighted ? "none" : `1px solid ${mkt.border}`,
                  transition: "background 0.2s ease, box-shadow 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  if (plan.highlighted) {
                    el.style.outline = "2px solid #FFFFFF";
                    el.style.outlineOffset = "-2px";
                  } else {
                    el.style.background = "rgba(255,255,255,0.1)";
                  }
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.outline = "none";
                  if (!plan.highlighted) {
                    el.style.background = "rgba(255,255,255,0.06)";
                  }
                }}
              >
                Get Started
                <ArrowRight size={14} />
              </Link>
            </div>
          ))}
        </div>

        <style>{`
          @media (max-width: 768px) {
            .mapguard-pricing-grid {
              grid-template-columns: 1fr !important;
            }
            .mapguard-pricing-grid > div {
              transform: none !important;
            }
          }
        `}</style>
      </div>
    </section>
  );
}
