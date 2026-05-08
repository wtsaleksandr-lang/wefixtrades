/**
 * RankFlowIllustration — Effortel-style "comet trail" composition
 * adapted for RankFlow.
 *
 * - Lavender card background with subtle background curve sweeps for
 *   atmosphere.
 * - Two parallel diagonal comet trails sweep from the upper-right
 *   corner down to the lower-left, each tapering from a thin tail
 *   (transparent) into a wide rounded white "head".
 * - A dashed center-line runs along each trail to suggest motion.
 * - Inside each white head sits a small TrendingUp glyph — the
 *   ranking-rising metaphor that replaces Effortel's satellite icon.
 * - A dark rounded anchor tile in the upper-right holds the RankFlow
 *   product glyph (3 ascending bars + an up-arrow accent), playing
 *   the same role as Effortel's brand-mark tile.
 */

interface Props { size?: number; }

export default function RankFlowIllustration({ size = 480 }: Props) {
  return (
    <svg
      viewBox="0 0 480 360"
      width="100%"
      height="auto"
      style={{ display: "block", maxWidth: size }}
      role="img"
      aria-label="RankFlow"
    >
      <defs>
        {/* White-to-transparent gradient for the comet trails */}
        <linearGradient id="rf-trail" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="rgba(255,255,255,0)"   />
          <stop offset="55%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="92%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
        {/* Soft drop-shadow under the dark anchor tile */}
        <filter id="rf-anchor-shadow" x="-20%" y="-10%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* Full-bleed lavender card */}
      <rect x="0" y="0" width="480" height="360" fill="#B7A6F7" rx="16" />

      {/* Subtle background curve sweeps — lighter purple atmosphere */}
      <g opacity="0.55">
        <path d="M 14 240 Q 240 70 466 130" stroke="rgba(255,255,255,0.18)" strokeWidth="42" fill="none" strokeLinecap="round" />
        <path d="M 14 280 Q 240 130 466 200" stroke="rgba(255,255,255,0.10)" strokeWidth="32" fill="none" strokeLinecap="round" />
      </g>

      {/* ─── TWO COMET TRAILS ─────────────────────────────────
          Each trail is a tapered band (transparent → white) plus a
          rounded white "head" circle. The band ends are tucked under
          the head circle so the seam is hidden. */}

      {/* Trail 1 — upper, head at (170, 222) */}
      <path
        d="M 462 22
           L 472 32
           L 184 234
           L 158 218
           Z"
        fill="url(#rf-trail)"
      />
      <line x1="170" y1="222" x2="466" y2="28" stroke="#5b4d8a" strokeWidth="1" strokeDasharray="5 5" opacity="0.45" />

      {/* Trail 2 — lower, head at (256, 282) */}
      <path
        d="M 472 80
           L 482 92
           L 270 296
           L 244 280
           Z"
        fill="url(#rf-trail)"
      />
      <line x1="256" y1="282" x2="478" y2="86" stroke="#5b4d8a" strokeWidth="1" strokeDasharray="5 5" opacity="0.45" />

      {/* Comet heads — rounded white circles with TrendingUp glyph */}
      <CometHead cx={170} cy={222} />
      <CometHead cx={256} cy={282} />

      {/* ─── ANCHOR TILE (upper-right) ───────────────────────
          Dark rounded square holding the RankFlow product glyph:
          3 ascending lavender bars + an up-arrow accent. */}
      <ellipse cx="380" cy="160" rx="58" ry="10" fill="rgba(20,20,40,0.18)" filter="url(#rf-anchor-shadow)" />
      <g transform="translate(338,68)">
        <rect x="0" y="0" width="84" height="84" rx="18" fill="#0E1116" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        {/* Three ascending bars */}
        <rect x="20" y="50" width="12" height="20" rx="3" fill="#B7A6F7" />
        <rect x="36" y="40" width="12" height="30" rx="3" fill="#B7A6F7" />
        <rect x="52" y="28" width="12" height="42" rx="3" fill="#B7A6F7" />
        {/* Up-arrow accent on top-right of the chart */}
        <path
          d="M 60 22 L 66 16 L 72 22 M 66 16 L 66 26"
          stroke="#B7A6F7" strokeWidth="2.4" fill="none"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/* ─── Comet head — rounded white pill with TrendingUp icon ─── */
function CometHead({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      {/* Soft drop-shadow */}
      <ellipse cx="0" cy="2" rx="36" ry="34" fill="rgba(20,20,40,0.18)" />
      {/* White pill */}
      <circle cx="0" cy="0" r="34" fill="#fff" />
      {/* TrendingUp glyph (line up-right with arrowhead) */}
      <g
        stroke="#0E1116" strokeWidth="2.2" fill="none"
        strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M -14 8 L -4 -2 L 4 4 L 16 -10" />
        {/* Arrowhead at the tip */}
        <path d="M 8 -10 L 16 -10 L 16 -2" />
      </g>
    </g>
  );
}
