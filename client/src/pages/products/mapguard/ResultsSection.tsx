import { mkt } from "@/theme/tokens";
import { HEADING_FONT, BODY_FONT, GLASS, sectionHeading, sectionSub, SECTION_PAD, MAX_W } from "./styles";
import { useCountUp } from "./useCountUp";

const METRICS = [
  { value: 40, suffix: "%", label: "Increase in map visibility" },
  { value: 3, suffix: "x", label: "More calls from local searches" },
  { value: 21, suffix: "", label: "Days to first results" },
];

function MetricCard({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const { ref, value: displayed } = useCountUp(value, 2000);

  return (
    <div
      ref={ref}
      style={{
        ...GLASS,
        padding: "36px 28px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: HEADING_FONT,
          fontSize: "clamp(36px, 5vw, 52px)",
          fontWeight: 800,
          color: mkt.accent,
          lineHeight: 1,
          marginBottom: 8,
        }}
      >
        +{displayed}
        {suffix}
      </div>
      <div
        style={{
          fontFamily: BODY_FONT,
          fontSize: 14,
          color: mkt.textMuted,
          lineHeight: 1.5,
        }}
      >
        {label}
      </div>
    </div>
  );
}

export default function ResultsSection() {
  return (
    <section style={{ ...SECTION_PAD, background: mkt.bg }}>
      <div style={MAX_W}>
        <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
          <h2 style={sectionHeading}>
            Real Improvements{" "}
            <span style={{ color: mkt.accent }}>Our Clients See</span>
          </h2>
          <p style={sectionSub}>
            Realistic numbers based on what businesses like yours experience after optimization.
          </p>
        </div>

        <div
          className="mapguard-results-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 20,
          }}
          data-reveal="fade-up"
          data-delay="100"
        >
          {METRICS.map((m) => (
            <MetricCard key={m.label} {...m} />
          ))}
        </div>

        <style>{`
          @media (max-width: 768px) {
            .mapguard-results-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </section>
  );
}
