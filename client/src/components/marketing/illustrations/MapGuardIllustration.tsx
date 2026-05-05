/**
 * MapGuardIllustration — original SVG editorial illustration. Cyan
 * background tile, dark stylized North-America silhouette (Canada
 * through Central America, Florida hook + Baja peninsula), dashed
 * concentric coverage rings, and floating white pill chips labeling
 * five WeFixTrades market cities.
 *
 * The continent shape is a hand-traced low-poly path (~50 anchors)
 * drawn in the SVG viewBox; it isn't reproducing any specific
 * copyrighted map artwork, just enough recognisable landmarks
 * (Alaska, Hudson Bay notch, Florida, Yucatán, Central America taper,
 * Baja peninsula) to read instantly as North America.
 */

interface Props { size?: number; }

// One outline string reused for the dark fill + cyan offset shadow,
// so any future edit to the silhouette only changes one place.
const NORTH_AMERICA_PATH = `
  M 95 92
  L 78 100 L 70 115 L 86 122 L 108 115 L 128 116
  L 132 95 L 115 78 L 140 60 L 175 48 L 215 44 L 250 46
  L 282 58 L 298 78
  L 285 92 L 264 108 L 252 96 L 240 110 L 250 130 L 270 124
  L 296 116 L 318 102 L 340 116
  L 346 145 L 350 178 L 358 208 L 362 238 L 366 262
  L 360 280 L 350 295 L 342 282 L 334 268
  L 322 260 L 308 264 L 292 272 L 278 284
  L 282 296 L 296 302 L 280 314 L 264 320
  L 248 322 L 232 314 L 224 300
  L 220 286 L 210 274 L 202 264
  L 196 276 L 184 290 L 175 276 L 178 258
  L 164 240 L 150 222 L 138 198 L 128 174 L 118 148 L 108 122 L 102 110
  Z
`;

export default function MapGuardIllustration({ size = 480 }: Props) {
  return (
    <svg viewBox="0 0 480 360" width={size} height={(size * 360) / 480} role="img" aria-label="MapGuard">
      {/* Pale baseplate */}
      <rect x="0" y="0" width="480" height="360" fill="#E0EDED" rx="14" />

      {/* Cyan card */}
      <rect x="14" y="0" width="452" height="320" fill="#7FE7E1" rx="12" />

      {/* Cyan offset shadow under silhouette */}
      <path d={NORTH_AMERICA_PATH} transform="translate(8,8)" fill="rgba(102,232,250,0.55)" />

      {/* Dark continent silhouette — North America */}
      <path d={NORTH_AMERICA_PATH} fill="#0E1116" />

      {/* Dashed concentric coverage rings centered roughly on the
          mid-continent (Kansas-ish) so they radiate over the silhouette. */}
      <g transform="translate(220,180)" opacity="0.55">
        <circle cx="0" cy="0" r="22" fill="none" stroke="#7FE7E1" strokeWidth="0.8" strokeDasharray="2 3" />
        <circle cx="0" cy="0" r="42" fill="none" stroke="#7FE7E1" strokeWidth="0.8" strokeDasharray="2 3" />
        <circle cx="0" cy="0" r="64" fill="none" stroke="#7FE7E1" strokeWidth="0.8" strokeDasharray="2 3" />
        <circle cx="0" cy="0" r="88" fill="none" stroke="#7FE7E1" strokeWidth="0.8" strokeDasharray="2 3" />
        <circle cx="0" cy="0" r="116" fill="none" stroke="#7FE7E1" strokeWidth="0.8" strokeDasharray="2 3" />
      </g>

      {/* Pill chips — WeFixTrades coverage cities */}
      <PillChip x={20}  y={86}  label="VANCOUVER" />
      <PillChip x={300} y={108} label="TORONTO"   />
      <PillChip x={320} y={170} label="CHICAGO"   />
      <PillChip x={272} y={236} label="HOUSTON"   />
      <PillChip x={20}  y={216} label="SAN DIEGO" />
    </svg>
  );
}

function PillChip({ x, y, label }: { x: number; y: number; label: string }) {
  const w = label.length * 9 + 56;
  return (
    <g transform={`translate(${x},${y})`}>
      {/* Soft drop-shadow */}
      <rect x="2" y="3" width={w} height="36" rx="18" fill="rgba(20,40,60,0.18)" />
      {/* Pill body */}
      <rect x="0" y="0" width={w} height="36" rx="18" fill="#fff" />
      {/* Cyan circular pin with checkmark */}
      <circle cx="18" cy="18" r="14" fill="#7FE7E1" />
      <path d="M 12 18 L 16 22 L 24 14" fill="none" stroke="#0E1116" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Label */}
      <text
        x="40" y="23"
        fontFamily="'DM Mono', monospace" fontSize="13" fontWeight="700"
        fill="#1a1a1a" letterSpacing="1.2"
      >
        {label}
      </text>
    </g>
  );
}
