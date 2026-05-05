/**
 * MapGuardIllustration — original SVG editorial illustration. Cyan
 * background tile, dark stylized abstract land-mass silhouette (not
 * reproducing any specific copyrighted map artwork — original
 * geometric blob shape evocative of pinned coverage areas), with
 * dashed concentric rings radiating from a center point and three
 * floating white pill chips labeling US trades-market cities.
 */

interface Props { size?: number; }

export default function MapGuardIllustration({ size = 480 }: Props) {
  return (
    <svg viewBox="0 0 480 360" width={size} height={(size * 360) / 480} role="img" aria-label="MapGuard">
      {/* Pale baseplate */}
      <rect x="0" y="0" width="480" height="360" fill="#E0EDED" rx="14" />

      {/* Cyan card */}
      <rect x="14" y="0" width="452" height="320" fill="#7FE7E1" rx="12" />

      {/* Cyan offset shadow under silhouette */}
      <path
        d="M 175 22
           C 220 30 250 40 270 60
           C 290 78 295 96 280 120
           C 295 150 300 180 290 210
           C 280 240 250 260 220 270
           C 200 285 180 295 165 280
           C 145 270 130 250 130 220
           C 115 200 100 170 110 140
           C 120 110 140 90 145 70
           C 150 50 158 25 175 22 Z"
        transform="translate(8,8)"
        fill="rgba(102,232,250,0.55)"
      />
      {/* Dark land-mass silhouette (original geometric blob) */}
      <path
        d="M 175 22
           C 220 30 250 40 270 60
           C 290 78 295 96 280 120
           C 295 150 300 180 290 210
           C 280 240 250 260 220 270
           C 200 285 180 295 165 280
           C 145 270 130 250 130 220
           C 115 200 100 170 110 140
           C 120 110 140 90 145 70
           C 150 50 158 25 175 22 Z"
        fill="#0E1116"
      />

      {/* Dashed concentric rings from a center point on the silhouette */}
      <g transform="translate(202,170)" opacity="0.55">
        <circle cx="0" cy="0" r="20" fill="none" stroke="#7FE7E1" strokeWidth="0.8" strokeDasharray="2 3" />
        <circle cx="0" cy="0" r="36" fill="none" stroke="#7FE7E1" strokeWidth="0.8" strokeDasharray="2 3" />
        <circle cx="0" cy="0" r="56" fill="none" stroke="#7FE7E1" strokeWidth="0.8" strokeDasharray="2 3" />
        <circle cx="0" cy="0" r="80" fill="none" stroke="#7FE7E1" strokeWidth="0.8" strokeDasharray="2 3" />
      </g>

      {/* Pill chips — three city labels with cyan check-pin */}
      <PillChip x={134} y={64}  label="AUSTIN" />
      <PillChip x={258} y={148} label="DALLAS" />
      <PillChip x={196} y={242} label="HOUSTON" />
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
