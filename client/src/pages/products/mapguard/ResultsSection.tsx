import { mkt } from "@/theme/tokens";
import { HEADING_FONT, BODY_FONT, GLASS, sectionHeading, sectionSub, SECTION_PAD, MAX_W } from "./styles";
import { useCountUp } from "./useCountUp";

const METRICS = [
  { value: 100, suffix: "%", label: "Managed for you" },
  { value: 52, suffix: "", label: "Scans per year" },
  { value: 12, suffix: "", label: "Monthly reports" },
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
            A Real Service,{" "}
            <span style={{ color: mkt.accent }}>Not Just a Dashboard</span>
          </h2>
          <p style={sectionSub}>
            MapGuard is continuous management. We monitor, act, and report — every week, every month, all year.
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
