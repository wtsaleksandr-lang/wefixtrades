import { Search, Settings, Wrench, Eye, FileText } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { HEADING_FONT, BODY_FONT, GLASS, sectionHeading, sectionSub, SECTION_PAD, MAX_W } from "./styles";

const STEPS = [
  {
    icon: Search,
    title: "We analyze your profile",
    desc: "We run a full audit of your Google Business Profile to find what\u2019s missing, what\u2019s hurting your ranking, and where you stand against competitors.",
  },
  {
    icon: Wrench,
    title: "We fix and optimize it",
    desc: "Our team rebuilds your profile \u2014 categories, description, photos, keywords, and service areas are all optimized for your trade and location.",
  },
  {
    icon: Eye,
    title: "We monitor it continuously",
    desc: "Our system scans your visibility, rankings, and competitors every week. When something changes, we know about it immediately.",
  },
  {
    icon: Settings,
    title: "We handle all visibility issues for you",
    desc: "Ranking drops, review problems, profile changes \u2014 our team takes action immediately. No action required on your end.",
  },
  {
    icon: FileText,
    title: "We report progress monthly",
    desc: "Every month you receive a clear report showing your score, ranking changes, and exactly what we did to improve your visibility.",
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
            A fully managed service — you never need to log in, learn tools, or lift a finger.
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
