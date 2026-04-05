const STATS = [
  { value: "2,400+", label: "Active tradespeople" },
  { value: "£18M+", label: "Jobs invoiced monthly" },
  { value: "4.9★", label: "Average app rating" },
  { value: "94%", label: "Client retention rate" },
];

interface TrustStripProps {
  theme?: "dark" | "light";
}

/**
 * Compact trust strip showing 4 key stats in a single row.
 * Dark theme for tool pages (dark bg), light for the tools hub.
 */
export default function TrustStrip({ theme = "dark" }: TrustStripProps) {
  const isDark = theme === "dark";

  return (
    <div
      style={{
        borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "#e5e7eb"}`,
        borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "#e5e7eb"}`,
        padding: "clamp(14px, 2.5vw, 20px) 0",
        maxWidth: 640,
        margin: "clamp(24px, 4vw, 40px) auto",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "clamp(8px, 2vw, 16px)",
          textAlign: "center",
        }}
      >
        {STATS.map(({ value, label }) => (
          <div key={label}>
            <div
              style={{
                fontSize: "clamp(16px, 2.5vw, 20px)",
                fontWeight: 800,
                color: isDark ? "rgba(255,255,255,0.85)" : "#0d1514",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {value}
            </div>
            <div
              style={{
                fontSize: "clamp(10px, 1.5vw, 11px)",
                color: isDark ? "rgba(255,255,255,0.4)" : "rgba(13,21,20,0.5)",
                marginTop: 4,
                lineHeight: 1.3,
              }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
