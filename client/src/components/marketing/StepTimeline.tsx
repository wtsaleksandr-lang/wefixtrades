import { mkt, shadows } from "@/theme/tokens";

interface Step {
  title: string;
  desc: string;
}

interface StepTimelineProps {
  steps: Step[];
}

/**
 * Enhanced "How it works" with numbered circles and SVG connector line.
 * Adapts the homepage FlowConnectorSvg pattern for a horizontal timeline.
 */
export default function StepTimeline({ steps }: StepTimelineProps) {
  return (
    <section
      style={{ background: mkt.surface, padding: "72px 28px" }}
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
            {steps.length} simple steps
          </h2>
        </div>

        <style>{`
          .step-timeline-grid {
            display: grid;
            grid-template-columns: repeat(${steps.length}, 1fr);
            gap: 24px;
            position: relative;
          }
          .step-timeline-grid::before {
            content: "";
            position: absolute;
            top: 28px;
            left: calc(100% / ${steps.length} / 2);
            right: calc(100% / ${steps.length} / 2);
            height: 2px;
            background: linear-gradient(
              90deg,
              ${mkt.border} 0%,
              ${mkt.accentTint} 50%,
              ${mkt.border} 100%
            );
            z-index: 0;
          }
          @media (max-width: 700px) {
            .step-timeline-grid {
              grid-template-columns: 1fr !important;
              gap: 32px !important;
            }
            .step-timeline-grid::before {
              display: none;
            }
          }
        `}</style>

        <div className="step-timeline-grid">
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
