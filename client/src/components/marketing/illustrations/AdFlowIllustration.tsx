/**
 * AdFlowIllustration — Effortel "6G" composition adapted for AdFlow.
 *
 * Central dark disc with the AdFlow wordmark surrounded by:
 *   - 60 radial tick marks (outer ring)
 *   - thin pale concentric ring
 *   - FOUR chip orbiters connected by thin lines (the AdFlow stack):
 *       AI · ContentFlow · n8n · Replit
 *   - a gradient amber dot-trail along the lower arc for momentum.
 *
 * SVG fills its container width (no fixed pixel size) so it scales
 * properly on mobile.
 */

interface Props { size?: number; }

const VW = 480;
const VH = 360;
const CX = VW / 2;
const CY = VH / 2 + 6;
const R_TICK_INNER = 132;
const R_TICK_OUTER = 144;
const R_RING       = 116;
const R_CENTER     = 76;

const deg2rad = (d: number) => (d * Math.PI) / 180;

interface Chip { angle: number; label: string; }

// Four orbiting tool chips around AdFlow. Angles in SVG degrees
// (0 = right, 90 = down, 180 = left, 270 = up).
const CHIPS: Chip[] = [
  { angle: 210, label: "AI"           }, // upper-left
  { angle: 330, label: "ContentFlow"  }, // upper-right
  { angle: 150, label: "Replit"       }, // lower-left
  { angle:  30, label: "n8n"          }, // lower-right
];

export default function AdFlowIllustration({ size = 480 }: Props) {
  // Lower-arc gradient dot-trail (counter-clockwise from 5 o'clock to 8).
  const dots = [
    { angle:  60, r: 4.5, fill: "#E8C172" },
    { angle:  86, r: 6,   fill: "#C49432" },
    { angle: 114, r: 6.5, fill: "#8B6418" },
    { angle: 140, r: 5,   fill: "#5A4112" },
  ];

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width="100%"
      height="auto"
      style={{ display: "block", maxWidth: size }}
      role="img"
      aria-label="AdFlow"
    >
      {/* Full-bleed amber card (no gray baseplate) */}
      <rect x="0" y="0" width={VW} height={VH} fill="#F5B53A" rx="16" />

      {/* Outer ring of radial tick marks */}
      <g transform={`translate(${CX},${CY})`}>
        {Array.from({ length: 60 }).map((_, i) => {
          const a = (i * 6 * Math.PI) / 180;
          return (
            <line
              key={i}
              x1={Math.cos(a) * R_TICK_INNER}
              y1={Math.sin(a) * R_TICK_INNER}
              x2={Math.cos(a) * R_TICK_OUTER}
              y2={Math.sin(a) * R_TICK_OUTER}
              stroke="#1a1a1a"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          );
        })}
      </g>

      {/* Thin pale concentric ring */}
      <circle cx={CX} cy={CY} r={R_RING} fill="none" stroke="#FBE5A8" strokeWidth="1.4" opacity="0.85" />

      {/* Connector lines from each chip into the central disc */}
      <g stroke="#1a1a1a" strokeWidth="1.2" strokeLinecap="round">
        {CHIPS.map((c) => {
          const a = deg2rad(c.angle);
          const x1 = CX + Math.cos(a) * R_TICK_OUTER;
          const y1 = CY + Math.sin(a) * R_TICK_OUTER;
          const x2 = CX + Math.cos(a) * R_CENTER;
          const y2 = CY + Math.sin(a) * R_CENTER;
          return <line key={c.label} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </g>

      {/* Chip pills */}
      {CHIPS.map((c) => {
        const a = deg2rad(c.angle);
        const anchorX = CX + Math.cos(a) * R_TICK_OUTER;
        const anchorY = CY + Math.sin(a) * R_TICK_OUTER;
        // Push the pill OUTWARD a bit beyond the tick ring so the
        // connector line is visible.
        const offset = 18;
        const px = CX + Math.cos(a) * (R_TICK_OUTER + offset);
        const py = CY + Math.sin(a) * (R_TICK_OUTER + offset);
        const w = c.label.length * 7 + 32;
        return (
          <g key={c.label} transform={`translate(${px - w / 2}, ${py - 11})`}>
            {/* Soft drop shadow */}
            <rect x="1" y="2" width={w} height={22} rx="11" fill="rgba(0,0,0,0.18)" />
            {/* Pill body */}
            <rect x="0" y="0" width={w} height={22} rx="11" fill="#FBE5A8" stroke="#1a1a1a" strokeWidth="1.2" />
            {/* Tiny dark dot indicator */}
            <circle cx="10" cy="11" r="3.4" fill="#1a1a1a" />
            {/* Label */}
            <text
              x={(w + 16) / 2 + 8} y="15"
              textAnchor="middle"
              fontFamily="'DM Mono', monospace"
              fontSize="10" fontWeight="700"
              fill="#1a1a1a" letterSpacing="0.6"
            >
              {c.label}
            </text>
            {/* Anchor point reference (invisible) */}
            <circle cx={anchorX - (px - w / 2)} cy={anchorY - (py - 11)} r="0" fill="none" />
          </g>
        );
      })}

      {/* Big dark filled disc with the AdFlow wordmark */}
      <circle cx={CX} cy={CY} r={R_CENTER} fill="#0E1116" />
      <text
        x={CX} y={CY + 10}
        textAnchor="middle"
        fontFamily="'Inter', system-ui, sans-serif"
        fontSize="26" fontWeight="800"
        fill="#fff"
        letterSpacing="-0.02em"
      >
        AdFlow
      </text>

      {/* Lower-arc dot trail for momentum */}
      {dots.map((d, i) => {
        const a = (d.angle * Math.PI) / 180;
        const cx = CX + Math.cos(a) * R_RING;
        const cy = CY + Math.sin(a) * R_RING;
        return <circle key={i} cx={cx} cy={cy} r={d.r} fill={d.fill} />;
      })}
    </svg>
  );
}
