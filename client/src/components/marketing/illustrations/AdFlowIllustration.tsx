/**
 * AdFlowIllustration — original SVG editorial illustration for the AdFlow
 * product page/card. Warm amber background tile, dark filled circle with
 * white wordmark, concentric ring with a small "ROI" chip floating off
 * it, dashed/ticked outer arc, and a gradient dot-trail.
 */

interface Props { size?: number; }

export default function AdFlowIllustration({ size = 480 }: Props) {
  return (
    <svg viewBox="0 0 480 360" width={size} height={(size * 360) / 480} role="img" aria-label="AdFlow">
      {/* Pale mint baseplate behind the card */}
      <rect x="0" y="0" width="480" height="360" fill="#E0EDED" rx="14" />

      {/* Warm amber card */}
      <rect x="14" y="0" width="452" height="320" fill="#F5B53A" rx="12" />

      {/* Outer dashed/ticked arc — radial tick marks */}
      <g transform="translate(240,170)">
        {Array.from({ length: 60 }).map((_, i) => {
          const a = (i * 6 * Math.PI) / 180;
          const r1 = 124, r2 = 134;
          return (
            <line
              key={i}
              x1={Math.cos(a) * r1}
              y1={Math.sin(a) * r1}
              x2={Math.cos(a) * r2}
              y2={Math.sin(a) * r2}
              stroke="#1a1a1a"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          );
        })}
      </g>

      {/* Inner concentric ring */}
      <circle cx="240" cy="170" r="106" fill="none" stroke="#FBE5A8" strokeWidth="1.2" />

      {/* Floating chip on top of ring */}
      <g transform="translate(140,84)">
        <rect x="0" y="0" width="74" height="26" rx="13" fill="#FBE5A8" stroke="#1a1a1a" strokeWidth="1.2" />
        <text x="37" y="17" textAnchor="middle" fontFamily="'DM Mono', monospace" fontSize="11" fontWeight="700" fill="#1a1a1a" letterSpacing="1">
          ROI
        </text>
        <line x1="40" y1="26" x2="92" y2="62" stroke="#1a1a1a" strokeWidth="1.2" />
      </g>

      {/* Big black filled circle holding the wordmark */}
      <circle cx="240" cy="170" r="68" fill="#0E1116" />
      <text
        x="240" y="180" textAnchor="middle"
        fontFamily="'Inter', system-ui, sans-serif"
        fontSize="28" fontWeight="800" fill="#fff"
        letterSpacing="-0.02em"
      >
        AdFlow
      </text>

      {/* Dot trail on inner ring (dark to light, tracking around) */}
      {[
        { angle: 220, r: 4.5, fill: "#5A4112" },
        { angle: 235, r: 5.5, fill: "#8B6418" },
        { angle: 252, r: 6.5, fill: "#B58621" },
        { angle: 268, r: 5.5, fill: "#E0B656" },
      ].map((d, i) => {
        const a = (d.angle * Math.PI) / 180;
        const cx = 240 + Math.cos(a) * 106;
        const cy = 170 + Math.sin(a) * 106;
        return <circle key={i} cx={cx} cy={cy} r={d.r} fill={d.fill} />;
      })}
    </svg>
  );
}
