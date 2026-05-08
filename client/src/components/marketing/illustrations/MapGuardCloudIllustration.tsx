/**
 * MapGuardCloudIllustration — second MapGuard illustration in the
 * Effortel "dotted-map + cloud" style. The North-America silhouette is
 * rasterised at runtime as a tight grid of small dark dots (with a few
 * cyan/pink accents) so the continent reads cleanly without relying on
 * one large filled path.
 *
 * Composition:
 *   - Muted teal-gray backdrop tile.
 *   - Cyan rounded "cloud" tile on the left with a check-cloud glyph.
 *   - Dotted North-America continent on the right.
 *   - Subtle white beams curving from the cloud out to several
 *     coverage points across the continent (cloud feeds the network).
 *   - A second beam runs from the Toronto pin back into the cloud
 *     (Toronto feeds the cloud).
 *   - Dark "TORONTO" pill chip with a location-pin glyph anchored on
 *     Toronto's spot in the dot grid.
 */

import { useMemo } from "react";

interface Props { size?: number; }

// Simplified North-America polygon (counter-clockwise from Alaska SW).
// Same shape used by MapGuardIllustration.tsx so the two stay in sync.
const NA: Array<[number, number]> = [
  [95, 92], [78, 100], [70, 115], [86, 122], [108, 115], [128, 116],
  [132, 95], [115, 78], [140, 60], [175, 48], [215, 44], [250, 46],
  [282, 58], [298, 78],
  [285, 92], [264, 108], [252, 96], [240, 110], [250, 130], [270, 124],
  [296, 116], [318, 102], [340, 116],
  [346, 145], [350, 178], [358, 208], [362, 238], [366, 262],
  [360, 280], [350, 295], [342, 282], [334, 268],
  [322, 260], [308, 264], [292, 272], [278, 284],
  [282, 296], [296, 302], [280, 314], [264, 320],
  [248, 322], [232, 314], [224, 300],
  [220, 286], [210, 274], [202, 264],
  [196, 276], [184, 290], [175, 276], [178, 258],
  [164, 240], [150, 222], [138, 198], [128, 174], [118, 148], [108, 122], [102, 110],
];

function pointInPolygon(x: number, y: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Toronto sits roughly on Lake Ontario in the silhouette space (~43.6°N).
const TORONTO = { x: 296, y: 142 } as const;

// Cloud tile center (bottom-left of canvas, vertically centered on continent).
const CLOUD = { x: 80, y: 168, size: 78 } as const;

export default function MapGuardCloudIllustration({ size = 720 }: Props) {
  // Compute the continent dot grid once. Step size controls density.
  const dots = useMemo(() => {
    const arr: Array<{ x: number; y: number; key: string }> = [];
    const STEP = 7;
    for (let y = 28; y < 330; y += STEP) {
      // Stagger every other row by half-step so the grid feels like a
      // proper map dot pattern instead of harsh columns.
      const rowOffset = ((y - 28) / STEP) % 2 === 0 ? 0 : STEP / 2;
      for (let x = 60 + rowOffset; x < 410; x += STEP) {
        if (pointInPolygon(x, y, NA)) {
          arr.push({ x, y, key: `${x}-${y}` });
        }
      }
    }
    return arr;
  }, []);

  // Pick a deterministic handful of accent dots so it looks alive but
  // re-renders consistently.
  const accents = useMemo(() => {
    const set = new Map<string, "cyan" | "pink">();
    const n = dots.length;
    if (n === 0) return set;
    const cyanIdx = [Math.floor(n * 0.08), Math.floor(n * 0.27), Math.floor(n * 0.55), Math.floor(n * 0.78)];
    const pinkIdx = [Math.floor(n * 0.18), Math.floor(n * 0.42), Math.floor(n * 0.66), Math.floor(n * 0.91)];
    cyanIdx.forEach((i) => dots[i] && set.set(dots[i].key, "cyan"));
    pinkIdx.forEach((i) => dots[i] && set.set(dots[i].key, "pink"));
    return set;
  }, [dots]);

  // Beam endpoints — points on the continent the cloud "feeds".
  const cloudBeamTargets: Array<[number, number]> = [
    [180, 90],   // PNW
    [240, 70],   // Saskatchewan / Northern plains
    [310, 145],  // NE seaboard
    [200, 215],  // Texas/Southwest
    [260, 250],  // Gulf coast
    [200, 290],  // Mexico
  ];

  // Subtle curved-beam path from cloud edge to a target point.
  const beamPath = (toX: number, toY: number) => {
    const fromX = CLOUD.x + CLOUD.size / 2;
    const fromY = CLOUD.y;
    const cx = (fromX + toX) / 2;
    const cy = Math.min(fromY, toY) - 18;
    return `M ${fromX} ${fromY} Q ${cx} ${cy} ${toX} ${toY}`;
  };

  return (
    <svg
      viewBox="0 0 480 320"
      width="100%"
      height="auto"
      style={{ display: "block", maxWidth: size }}
      role="img"
      aria-label="MapGuard — North-America cloud coverage"
    >
      {/* Muted teal-gray backdrop */}
      <rect x="0" y="0" width="480" height="320" rx="14" fill="#8FA0A6" />

      {/* Subtle inner gradient sheen for depth */}
      <defs>
        <linearGradient id="mg-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.06)" />
        </linearGradient>
        <linearGradient id="mg-cloud-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#B8F4EE" />
          <stop offset="100%" stopColor="#7FE7E1" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="480" height="320" rx="14" fill="url(#mg-sheen)" />

      {/* Beams: cloud → continent dots (cloud feeds the network) */}
      <g stroke="rgba(255,255,255,0.32)" strokeWidth="1" fill="none">
        {cloudBeamTargets.map(([tx, ty], i) => (
          <path key={`beam-${i}`} d={beamPath(tx, ty)} strokeLinecap="round" />
        ))}
      </g>

      {/* Beam: Toronto → cloud (we feed the cloud) */}
      <g
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      >
        <path
          d={`M ${TORONTO.x} ${TORONTO.y}
             Q ${(TORONTO.x + CLOUD.x) / 2} ${(TORONTO.y + CLOUD.y) / 2 - 18}
               ${CLOUD.x + CLOUD.size / 2} ${CLOUD.y}`}
        />
      </g>

      {/* Continent dot grid */}
      <g>
        {dots.map((d) => {
          const accent = accents.get(d.key);
          const fill =
            accent === "cyan" ? "#66E8FA" :
            accent === "pink" ? "#F472B6" :
            "rgba(20,28,32,0.65)";
          const r = accent ? 1.9 : 1.5;
          return <circle key={d.key} cx={d.x} cy={d.y} r={r} fill={fill} />;
        })}
      </g>

      {/* Cloud tile + check-cloud glyph */}
      <g transform={`translate(${CLOUD.x - CLOUD.size / 2}, ${CLOUD.y - CLOUD.size / 2})`}>
        {/* Soft drop-shadow */}
        <rect x="3" y="5" width={CLOUD.size} height={CLOUD.size} rx="18" fill="rgba(20,32,36,0.22)" />
        {/* Tile */}
        <rect x="0" y="0" width={CLOUD.size} height={CLOUD.size} rx="18" fill="url(#mg-cloud-tile)" />
        {/* Cloud + checkmark glyph (centered) */}
        <g transform={`translate(${CLOUD.size / 2 - 16}, ${CLOUD.size / 2 - 13})`}
           stroke="#0E1116"
           strokeWidth="1.8"
           strokeLinecap="round"
           strokeLinejoin="round"
           fill="none">
          {/* Cloud outline */}
          <path d="M 7 19
                   C 2 19 2 12 7 12
                   C 7 6 16 4 19 9
                   C 24 6 30 10 29 14
                   C 33 14 33 20 29 20
                   L 9 20
                   Z" />
          {/* Check inside */}
          <path d="M 12 14.5 L 15 17.5 L 22 11" />
        </g>
      </g>

      {/* TORONTO pill chip — anchored on the Toronto dot */}
      <g transform={`translate(${TORONTO.x - 6}, ${TORONTO.y - 11})`}>
        {/* Drop shadow */}
        <rect x="2" y="3" width="92" height="22" rx="11" fill="rgba(0,0,0,0.32)" />
        {/* Pill body — dark to match Effortel reference */}
        <rect x="0" y="0" width="92" height="22" rx="11" fill="#0E1116" />
        {/* Cyan location pin glyph */}
        <g transform="translate(8, 5)" fill="#66E8FA">
          <path d="M 6 0
                   C 9.3 0 12 2.5 12 5.6
                   C 12 9 6 13 6 13
                   C 6 13 0 9 0 5.6
                   C 0 2.5 2.7 0 6 0
                   Z" />
          <circle cx="6" cy="5.4" r="2.1" fill="#0E1116" />
        </g>
        {/* Label */}
        <text
          x="26" y="15"
          fontFamily="'DM Mono', monospace" fontSize="10" fontWeight="700"
          fill="#fff" letterSpacing="1.2"
        >
          TORONTO
        </text>
      </g>
    </svg>
  );
}
