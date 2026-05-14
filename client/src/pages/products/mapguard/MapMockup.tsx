import { mkt } from "@/theme/tokens";

const PIN_POSITIONS = [
  { cx: 120, cy: 100, delay: "0s", rank: 1 },
  { cx: 260, cy: 160, delay: "0.4s", rank: 2 },
  { cx: 180, cy: 240, delay: "0.8s", rank: 3 },
  { cx: 310, cy: 90, delay: "1.2s", rank: null },
  { cx: 80, cy: 200, delay: "0.6s", rank: null },
];

export default function MapMockup() {
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 480 }}>
      {/* Glow behind map */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "120%",
          height: "120%",
          background:
            "radial-gradient(ellipse at center, rgba(13,60,252,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <svg
        viewBox="0 0 400 320"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          width: "100%",
          height: "auto",
          borderRadius: 20,
          overflow: "visible",
        }}
      >
        <defs>
          <style>{`
            @keyframes mapPinPulse {
              0%, 100% { r: 6; opacity: 1; }
              50% { r: 10; opacity: 0.5; }
            }
            @keyframes mapPinRing {
              0% { r: 8; opacity: 0.6; }
              100% { r: 22; opacity: 0; }
            }
          `}</style>
        </defs>

        {/* Map background */}
        <rect
          x="0"
          y="0"
          width="400"
          height="320"
          rx="16"
          fill={mkt.surface}
        />

        {/* Grid lines (roads) */}
        {[60, 140, 220, 300].map((x) => (
          <line
            key={`v-${x}`}
            x1={x}
            y1="0"
            x2={x}
            y2="320"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
          />
        ))}
        {[50, 120, 190, 260].map((y) => (
          <line
            key={`h-${y}`}
            x1="0"
            y1={y}
            x2="400"
            y2={y}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
          />
        ))}

        {/* Roads */}
        <line x1="0" y1="160" x2="400" y2="160" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        <line x1="200" y1="0" x2="200" y2="320" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        <line x1="0" y1="80" x2="300" y2="280" stroke="rgba(255,255,255,0.04)" strokeWidth="2" />
        <line x1="100" y1="0" x2="350" y2="320" stroke="rgba(255,255,255,0.04)" strokeWidth="2" />

        {/* Blocks (buildings area) */}
        <rect x="30" y="30" width="60" height="40" rx="4" fill="rgba(255,255,255,0.02)" />
        <rect x="220" y="180" width="80" height="50" rx="4" fill="rgba(255,255,255,0.02)" />
        <rect x="130" y="270" width="50" height="30" rx="4" fill="rgba(255,255,255,0.02)" />

        {/* Search bar */}
        <rect x="20" y="12" width="200" height="28" rx="14" fill="rgba(255,255,255,0.06)" />
        <circle cx="36" cy="26" r="6" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" fill="none" />
        <rect x="50" y="23" width="80" height="5" rx="2.5" fill="rgba(255,255,255,0.1)" />

        {/* Map pins */}
        {PIN_POSITIONS.map((pin, i) => (
          <g key={i}>
            {/* Pulse ring */}
            <circle
              cx={pin.cx}
              cy={pin.cy}
              r="8"
              fill="none"
              stroke={mkt.accent}
              strokeWidth="1.5"
              opacity="0.4"
              style={{
                animation: `mapPinRing 2s ease-out infinite`,
                animationDelay: pin.delay,
              }}
            />
            {/* Pin dot */}
            <circle
              cx={pin.cx}
              cy={pin.cy}
              r="6"
              fill={i === 0 ? mkt.accent : i < 3 ? mkt.accentDark : "rgba(255,255,255,0.15)"}
              stroke={i < 3 ? mkt.accent : "rgba(255,255,255,0.2)"}
              strokeWidth="1.5"
              style={{
                animation: `mapPinPulse 2.5s ease-in-out infinite`,
                animationDelay: pin.delay,
              }}
            />
            {/* Rank number */}
            {pin.rank && (
              <text
                x={pin.cx}
                y={pin.cy + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="8"
                fontWeight="700"
                fill={i === 0 ? mkt.dark : mkt.onDark}
              >
                {pin.rank}
              </text>
            )}
          </g>
        ))}

        {/* Ranking card overlay */}
        <g>
          <rect
            x="240"
            y="210"
            width="140"
            height="90"
            rx="12"
            fill="rgba(34,40,42,0.9)"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
          />
          <text x="256" y="232" fontSize="9" fontWeight="600" fill={mkt.textMuted}>
            Your Ranking
          </text>
          <text x="256" y="258" fontSize="22" fontWeight="800" fill={mkt.accent}>
            #1
          </text>
          <text x="280" y="258" fontSize="10" fill={mkt.textMuted}>
            in local area
          </text>
          <rect x="256" y="270" width="108" height="4" rx="2" fill="rgba(255,255,255,0.06)" />
          <rect x="256" y="270" width="80" height="4" rx="2" fill={mkt.accent} opacity="0.6" />
          <text x="256" y="288" fontSize="8" fill={mkt.textMuted}>
            Visibility: 85%
          </text>
        </g>
      </svg>
    </div>
  );
}
