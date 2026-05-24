// Pre-launch: no fabricated stats. Trust strip surfaces what we
// actually built and who it's built for. Replace with measured
// numbers post-launch when we have them.
const STATS = [
  { value: "★★★★★", label: "Built for trades" },
  { value: "24/7", label: "AI receptionist" },
  { value: "$0", label: "Setup fees" },
  { value: "No", label: "Long-term contracts" },
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
        /* PR 2: hairline dividers per DOSS pattern. Dark theme reads
         * from --hairline (warm gray, low alpha); light theme keeps
         * its #e5e7eb neutral. */
        borderTop: isDark ? "1px solid var(--hairline)" : "1px solid #e5e7eb",
        borderBottom: isDark ? "1px solid var(--hairline)" : "1px solid #e5e7eb",
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
