import { Settings, Paintbrush, Rocket } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { HEADING_FONT, BODY_FONT, GLASS, sectionHeading, sectionSub, SECTION_PAD, MAX_W } from "./styles";

const STEPS = [
  {
    icon: Settings,
    title: "Choose Your Pricing Model",
    desc: "Pick from 10 pricing types — hourly, per sqft, tiered packages, base + rate, and more. Set your base fee, rates, add-ons, and difficulty tiers.",
  },
  {
    icon: Paintbrush,
    title: "Customize Your Widget",
    desc: "Add your business name, logo, and brand colors. Write your tagline and customize the CTA button text. Preview it in real time.",
  },
  {
    icon: Rocket,
    title: "Embed on Your Site",
    desc: "Copy one line of code and paste it into your website. Works with WordPress, Wix, Squarespace — any platform. Live in minutes.",
  },
];

export default function HowItWorks() {
  return (
    <section
      style={{
        ...SECTION_PAD,
        background: `linear-gradient(180deg, ${mkt.dark} 0%, ${mkt.bg} 100%)`,
      }}
    >
      <div style={MAX_W}>
        <div style={{ textAlign: "center", marginBottom: 56 }} data-reveal="fade-up">
          <h2 style={sectionHeading}>
            Live in{" "}
            <span style={{ color: mkt.accent }}>Three Simple Steps</span>
          </h2>
          <p style={sectionSub}>
            No developers, no complicated setup. You'll have a working quote tool on your site in minutes.
          </p>
        </div>

        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isLast = i === STEPS.length - 1;
            return (
              <div
                key={step.title}
                data-reveal="fade-up"
                data-delay={String(i * 120)}
                style={{
                  display: "flex",
                  gap: 24,
                  position: "relative",
                  paddingBottom: isLast ? 0 : 40,
                }}
              >
                {/* Timeline */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      ...GLASS,
                      borderRadius: "50%",
                      border: `2px solid ${mkt.accent}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    <Icon size={20} color={mkt.accent} strokeWidth={1.8} />
                  </div>
                  {!isLast && (
                    <div
                      style={{
                        width: 2,
                        flex: 1,
                        background: `linear-gradient(180deg, ${mkt.accent}40 0%, ${mkt.border} 100%)`,
                        marginTop: 4,
                      }}
                    />
                  )}
                </div>

                {/* Content */}
                <div style={{ paddingTop: 4 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: mkt.accent,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    Step {i + 1}
                  </span>
                  <h3
                    style={{
                      fontFamily: HEADING_FONT,
                      fontSize: 20,
                      fontWeight: 700,
                      color: mkt.text,
                      marginBottom: 6,
                      marginTop: 6,
                    }}
                  >
                    {step.title}
                  </h3>
                  <p
                    style={{
                      fontFamily: BODY_FONT,
                      fontSize: 15,
                      color: mkt.textMuted,
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    {step.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
