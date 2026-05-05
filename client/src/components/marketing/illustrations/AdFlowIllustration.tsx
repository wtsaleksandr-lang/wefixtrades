/**
 * AdFlowIllustration — Effortel "6G" composition adapted for AdFlow.
 *
 * Layout matches the reference closely:
 *   - Warm amber card.
 *   - 60 radial tick marks around the perimeter form the outer ring.
 *   - Thin pale-amber concentric ring inside the ticks.
 *   - Big dark filled circle in the centre with the white "AdFlow"
 *     wordmark — same role as Effortel's "6G" disc.
 *   - White "AI" pill chip floats at the upper-left, sitting just
 *     outside the outer ring, with a thin connector line running into
 *     the central disc. This represents the AI engine that powers
 *     AdFlow's content + creative generation (same metaphor Effortel
 *     uses for AI feeding 6G).
 *   - Gradient dot-trail follows the lower-left arc of the ring (dark
 *     -> mid -> light -> faded), implying motion / momentum on the
 *     creative pipeline.
 */

interface Props { size?: number; }

const CX = 240;
const CY = 180;
const R_OUTER_TICK_START = 124;
const R_OUTER_TICK_END   = 134;
const R_RING             = 110;
const R_CENTER           = 72;

const deg2rad = (d: number) => (d * Math.PI) / 180;

export default function AdFlowIllustration({ size = 480 }: Props) {
  // AI pill sits on the upper-left at angle 210° from centre. Its
  // bottom-centre anchors the connector line to the central disc.
  const pillAngle = 210;
  const pillAnchorX = CX + Math.cos(deg2rad(pillAngle)) * R_OUTER_TICK_END;
  const pillAnchorY = CY + Math.sin(deg2rad(pillAngle)) * R_OUTER_TICK_END;
  // Connector ends on the central disc edge along the same radial.
  const connectorEndX = CX + Math.cos(deg2rad(pillAngle)) * R_CENTER;
  const connectorEndY = CY + Math.sin(deg2rad(pillAngle)) * R_CENTER;

  // Dot-trail along the lower arc — 4 dots gradient dark→light, going
  // counter-clockwise from ~5 o'clock to ~7 o'clock.
  const dots = [
    { angle:  60, r: 4.5, fill: "#E8C172" },  // lightest, leading
    { angle:  88, r: 6,   fill: "#C49432" },
    { angle: 116, r: 6.5, fill: "#8B6418" },
    { angle: 142, r: 5,   fill: "#5A4112" },  // darkest, trailing
  ];

  return (
    <svg viewBox="0 0 480 360" width={size} height={(size * 360) / 480} role="img" aria-label="AdFlow">
      {/* Pale baseplate */}
      <rect x="0" y="0" width="480" height="360" fill="#E0EDED" rx="14" />

      {/* Warm amber card */}
      <rect x="14" y="0" width="452" height="320" fill="#F5B53A" rx="12" />

      {/* Outer ring of radial tick marks (60 ticks, every 6°) */}
      <g transform={`translate(${CX},${CY})`}>
        {Array.from({ length: 60 }).map((_, i) => {
          const a = (i * 6 * Math.PI) / 180;
          return (
            <line
              key={i}
              x1={Math.cos(a) * R_OUTER_TICK_START}
              y1={Math.sin(a) * R_OUTER_TICK_START}
              x2={Math.cos(a) * R_OUTER_TICK_END}
              y2={Math.sin(a) * R_OUTER_TICK_END}
              stroke="#1a1a1a"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          );
        })}
      </g>

      {/* Thin pale concentric ring */}
      <circle cx={CX} cy={CY} r={R_RING} fill="none" stroke="#FBE5A8" strokeWidth="1.4" opacity="0.85" />

      {/* Connector line from AI pill to central disc */}
      <line
        x1={pillAnchorX}
        y1={pillAnchorY}
        x2={connectorEndX}
        y2={connectorEndY}
        stroke="#1a1a1a"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* AI pill chip — white with dark border + small dot, "AI" label */}
      <g transform={`translate(${pillAnchorX - 30}, ${pillAnchorY - 26})`}>
        {/* Pill body */}
        <rect x="0" y="0" width="60" height="22" rx="11" fill="#FBE5A8" stroke="#1a1a1a" strokeWidth="1.2" />
        {/* Tiny dark dot indicator on the left */}
        <circle cx="11" cy="11" r="3.4" fill="#1a1a1a" />
        {/* AI label */}
        <text
          x="38" y="15"
          textAnchor="middle"
          fontFamily="'DM Mono', monospace"
          fontSize="11" fontWeight="700"
          fill="#1a1a1a" letterSpacing="1"
        >
          AI
        </text>
      </g>

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

      {/* Dot-trail along the inner concentric ring */}
      {dots.map((d, i) => {
        const a = (d.angle * Math.PI) / 180;
        const cx = CX + Math.cos(a) * R_RING;
        const cy = CY + Math.sin(a) * R_RING;
        return <circle key={i} cx={cx} cy={cy} r={d.r} fill={d.fill} />;
      })}
    </svg>
  );
}
