import { Search, Settings, Rocket } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { HEADING_FONT, BODY_FONT, GLASS, sectionHeading, sectionSub, SECTION_PAD, MAX_W } from "./styles";

const STEPS = [
  {
    icon: Search,
    title: "Audit",
    desc: "We scan your current profile and show you exactly what\u2019s missing or holding you back.",
  },
  {
    icon: Settings,
    title: "Optimize",
    desc: "We fix everything \u2014 structure, content, categories, photos, and visibility signals.",
  },
  {
    icon: Rocket,
    title: "Maintain",
    desc: "We keep your profile active and improving every month \u2014 posts, reviews, adjustments.",
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
            How It{" "}
            <span style={{ color: mkt.accent }}>Works</span>
          </h2>
          <p style={sectionSub}>
            You don't need to log into anything — we handle it.
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
                {/* Timeline column */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  {/* Step circle */}
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

                  {/* Connecting line */}
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

                {/* Content column */}
                <div style={{ paddingTop: 4 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 6,
                    }}
                  >
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
                  </div>
                  <h3
                    style={{
                      fontFamily: HEADING_FONT,
                      fontSize: 20,
                      fontWeight: 700,
                      color: mkt.text,
                      marginBottom: 6,
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
