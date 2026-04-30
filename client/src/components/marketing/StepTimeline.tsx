import { mkt, shadows } from "@/theme/tokens";

interface Step {
  title: string;
  desc: string;
}

interface StepTimelineProps {
  steps: Step[];
  heading?: string;
}

/**
 * Enhanced "How it works" with numbered circles and SVG connector line.
 * Adapts the homepage FlowConnectorSvg pattern for a horizontal timeline.
 */
export default function StepTimeline({ steps, heading }: StepTimelineProps) {
  return (
    <section
      style={{ background: mkt.sectionLighter, padding: "72px 28px" }}
      data-testid="product-how-it-works"
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div
          style={{ textAlign: "center", marginBottom: 48 }}
          data-reveal="fade-up"
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: mkt.accent,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            How it works
          </div>
          <h2
            style={{
              fontSize: "clamp(24px, 3vw, 36px)",
              fontWeight: 700,
              color: mkt.text,
              letterSpacing: "-0.025em",
              margin: 0,
            }}
          >
            {heading || `${steps.length} simple steps`}
          </h2>
        </div>

        <style>{`
          @keyframes stepDashFlow {
            to { stroke-dashoffset: -28; }
          }
          @keyframes stepParticle {
            0% { offset-distance: 0%; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { offset-distance: 100%; opacity: 0; }
          }
          .step-timeline-grid {
            display: grid;
            grid-template-columns: repeat(${steps.length}, 1fr);
            gap: 24px;
            position: relative;
          }
          .step-timeline-connector {
            position: absolute;
            top: 28px;
            left: calc(100% / ${steps.length} / 2);
            right: calc(100% / ${steps.length} / 2);
            height: 2px;
            z-index: 0;
            overflow: visible;
          }
          .step-timeline-connector svg {
            width: 100%;
            height: 12px;
            position: absolute;
            top: -5px;
            overflow: visible;
          }
          @media (max-width: 700px) {
            .step-timeline-grid {
              grid-template-columns: 1fr !important;
              gap: 32px !important;
            }
            .step-timeline-connector {
              display: none;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .step-timeline-connector svg * {
              animation: none !important;
            }
          }
        `}</style>

        <div className="step-timeline-grid">
          {/* Animated dashed connector line */}
          <div className="step-timeline-connector">
            <svg viewBox="0 0 1000 12" preserveAspectRatio="none">
              {/* Dashed animated line */}
              <line
                x1="0"
                y1="6"
                x2="1000"
                y2="6"
                stroke={mkt.accentTint}
                strokeWidth="2"
                strokeDasharray="8 6"
                style={{
                  animation: "stepDashFlow 1.6s linear infinite",
                }}
              />
              {/* Traveling particles */}
              {Array.from({ length: steps.length - 1 }, (_, i) => {
                const segStart = (i * 1000) / (steps.length - 1);
                const segEnd = ((i + 1) * 1000) / (steps.length - 1);
                return (
                  <circle
                    key={i}
                    r="3"
                    fill={mkt.accent}
                    opacity="0.55"
                    style={{
                      offsetPath: `path("M ${segStart} 6 L ${segEnd} 6")`,
                      animation: `stepParticle ${2.4 + i * 0.3}s ease-in-out ${i * 0.6}s infinite`,
                    }}
                  />
                );
              })}
            </svg>
          </div>
          {steps.map((step, i) => (
            <div
              key={step.title}
              data-reveal="fade-up"
              data-delay={String((i + 1) * 120)}
              style={{
                textAlign: "center",
                position: "relative",
                zIndex: 1,
              }}
            >
              {/* Numbered circle */}
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: `linear-gradient(135deg, ${mkt.accent} 0%, ${mkt.accentDark} 100%)`,
                  color: mkt.buttonText,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  fontWeight: 700,
                  margin: "0 auto 20px",
                  boxShadow: `0 8px 24px ${mkt.accentGlow}`,
                  position: "relative",
                }}
              >
                {i + 1}
              </div>

              <h3
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: mkt.text,
                  marginBottom: 10,
                  lineHeight: 1.3,
                }}
              >
                {step.title}
              </h3>

              <p
                style={{
                  fontSize: 14,
                  color: mkt.textMuted,
                  lineHeight: 1.6,
                  margin: 0,
                  maxWidth: 260,
                  marginLeft: "auto",
                  marginRight: "auto",
                }}
              >
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
