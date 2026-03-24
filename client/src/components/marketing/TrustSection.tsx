const STATS = [
  { value: "2,400+", label: "Active tradespeople" },
  { value: "£18M+",  label: "Jobs invoiced monthly" },
  { value: "4.9★",   label: "Average app rating" },
  { value: "94%",    label: "Client retention rate" },
];

export default function TrustSection() {
  return (
    <section
      data-testid="trust-section-light"
      style={{
        background: "#dfe8e6",
        borderRadius: "28px 28px 0 0",
        marginTop: -28,
        position: "relative",
        zIndex: 9,
        padding: "clamp(60px, 8vw, 80px) clamp(20px, 5vw, 80px) clamp(80px, 10vw, 120px)",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
        {/* Eyebrow */}
        <div style={{
          fontFamily: "monospace",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "rgba(13,21,20,0.45)",
          marginBottom: 20,
        }}>
          [ TRUSTED BY TRADES BUSINESSES ]
        </div>

        {/* Heading */}
        <h2 style={{
          fontSize: "clamp(26px, 3.5vw, 36px)",
          fontWeight: 800,
          color: "#0d1514",
          letterSpacing: "-0.025em",
          lineHeight: 1.15,
          maxWidth: 500,
          margin: "0 auto 48px",
        }}>
          Thousands of tradespeople trust WeFixTrades
        </h2>

        {/* Stat cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 16,
        }}>
          {STATS.map(({ value, label }) => (
            <div key={label} style={{
              background: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(255,255,255,0.8)",
              borderRadius: 20,
              padding: "24px 20px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#0d1514", letterSpacing: "-0.02em", lineHeight: 1 }}>
                {value}
              </div>
              <div style={{ fontSize: 12, color: "rgba(13,21,20,0.55)", marginTop: 8, lineHeight: 1.4 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
