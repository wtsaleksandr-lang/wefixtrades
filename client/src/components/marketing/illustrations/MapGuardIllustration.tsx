/**
 * MapGuardIllustration — full-bleed cyan tile with a hand-traced
 * North-America silhouette in dark with cyan offset shadow, dashed
 * concentric coverage rings, and five compact pinned-city pill chips.
 *
 * The continent path uses ~70 anchor points so the recognisable
 * features read at a glance: Alaska + Aleutians, the Hudson Bay
 * notch, Newfoundland, the Florida hook, Yucatán, Central America
 * taper, and the Baja peninsula.
 *
 * SVG fills its container width so it scales correctly on mobile.
 */

interface Props { size?: number; }

// Detailed North-America outline. Counter-clockwise from Alaska SW.
const NORTH_AMERICA_PATH = `
  M 78 100
  L 60 105 L 50 113 L 65 122 L 85 128 L 102 130 L 118 134 L 132 136
  L 142 130 L 140 120 L 130 110 L 120 100 L 112 90 L 108 78
  L 122 68 L 145 58 L 175 52 L 210 48 L 245 50 L 275 56
  L 296 66 L 312 80
  L 308 96 L 294 102 L 278 100 L 264 92 L 254 102
  L 248 116 L 236 108 L 222 102 L 215 114
  L 224 132 L 240 142 L 262 145
  L 286 144 L 308 138 L 328 130 L 348 132
  L 358 146 L 354 158 L 342 162
  L 350 172 L 346 184 L 336 188
  L 334 200 L 348 218 L 358 238 L 364 260 L 368 280
  L 365 298 L 358 314 L 348 326 L 340 318 L 334 304
  L 326 288 L 318 280 L 304 276 L 290 280 L 276 286 L 264 294
  L 270 308 L 286 318 L 300 318
  L 308 326 L 296 332 L 282 334
  L 270 340 L 258 348 L 246 344 L 238 330
  L 228 314 L 218 300 L 210 288 L 202 276
  L 196 286 L 184 298 L 172 290 L 174 274
  L 168 258 L 162 244 L 152 226 L 144 208
  L 134 190 L 122 170 L 112 148 L 100 128 L 90 112
  Z
`;

interface Pin { x: number; y: number; label: string; }

const PINS: Pin[] = [
  { x:  10, y:  30, label: "VANCOUVER" },
  { x: 350, y:  56, label: "TORONTO"   },
  { x: 360, y: 168, label: "CHICAGO"   },
  { x: 308, y: 296, label: "HOUSTON"   },
  { x:  10, y: 296, label: "SAN DIEGO" },
];

export default function MapGuardIllustration({ size = 480 }: Props) {
  return (
    <svg
      viewBox="0 0 480 360"
      width="100%"
      height="auto"
      style={{ display: "block", maxWidth: size }}
      role="img"
      aria-label="MapGuard"
    >
      {/* Full-bleed cyan card */}
      <rect x="0" y="0" width="480" height="360" fill="#7FE7E1" rx="16" />

      {/* Cyan offset shadow under continent silhouette */}
      <path d={NORTH_AMERICA_PATH} transform="translate(7,7)" fill="rgba(102,232,250,0.55)" />

      {/* Dark continent silhouette */}
      <path d={NORTH_AMERICA_PATH} fill="#0E1116" />

      {/* Dashed concentric coverage rings centered on the continent */}
      <g transform="translate(220,200)" opacity="0.55">
        {[24, 46, 70, 96, 124].map((r) => (
          <circle key={r} cx="0" cy="0" r={r} fill="none" stroke="#7FE7E1" strokeWidth="0.8" strokeDasharray="2 3" />
        ))}
      </g>

      {/* Pinned city pills — placed at the canvas edges so the
          continent silhouette stays readable behind them */}
      {PINS.map((p) => (
        <PillChip key={p.label} x={p.x} y={p.y} label={p.label} />
      ))}
    </svg>
  );
}

function PillChip({ x, y, label }: { x: number; y: number; label: string }) {
  // Compact pill: smaller pin, smaller font, tighter padding.
  const w = label.length * 7 + 36;
  return (
    <g transform={`translate(${x},${y})`}>
      {/* Soft drop-shadow */}
      <rect x="2" y="3" width={w} height="26" rx="13" fill="rgba(20,40,60,0.20)" />
      {/* Pill body */}
      <rect x="0" y="0" width={w} height="26" rx="13" fill="#fff" />
      {/* Cyan circular pin with checkmark */}
      <circle cx="13" cy="13" r="10" fill="#7FE7E1" />
      <path d="M 9 13 L 12 16 L 18 10" fill="none" stroke="#0E1116" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {/* Label */}
      <text
        x="28" y="17"
        fontFamily="'DM Mono', monospace"
        fontSize="10" fontWeight="700"
        fill="#1a1a1a" letterSpacing="0.8"
      >
        {label}
      </text>
    </g>
  );
}
