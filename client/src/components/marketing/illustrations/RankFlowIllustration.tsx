/**
 * RankFlowIllustration — original SVG editorial illustration. Lavender
 * background, comet trails on diagonals heading toward a dark anchor
 * tile in the upper-right (with an upward-bars/podium glyph). Trail
 * heads carry small rank-badge tiles climbing #3 → #2 → #1.
 */

interface Props { size?: number; }

export default function RankFlowIllustration({ size = 480 }: Props) {
  return (
    <svg viewBox="0 0 480 360" width={size} height={(size * 360) / 480} role="img" aria-label="RankFlow">
      {/* Pale baseplate */}
      <rect x="0" y="0" width="480" height="360" fill="#E0EDED" rx="14" />

      {/* Lavender card */}
      <rect x="14" y="0" width="452" height="320" fill="#B7A6F7" rx="12" />

      {/* Soft arc highlights bottom-right */}
      <path d="M 380 320 Q 466 260 466 160" stroke="rgba(255,255,255,0.25)" strokeWidth="20" fill="none" strokeLinecap="round" />
      <path d="M 360 320 Q 446 260 446 180" stroke="rgba(255,255,255,0.18)" strokeWidth="14" fill="none" strokeLinecap="round" />

      {/* Three diagonal comet trails */}
      <defs>
        <linearGradient id="rf-trail-1" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="60%" stopColor="rgba(255,255,255,0.45)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.85)" />
        </linearGradient>
        <linearGradient id="rf-trail-2" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="60%" stopColor="rgba(255,255,255,0.50)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.95)" />
        </linearGradient>
      </defs>

      {/* Trail 1 — left, slowest */}
      <path d="M 30 320 L 200 130 L 250 90 L 270 80 Q 250 100 220 120 L 60 300 Z"
            fill="url(#rf-trail-1)" />
      {/* Trail 2 — middle */}
      <path d="M 130 320 L 300 130 L 360 90 L 380 80 Q 360 100 330 120 L 160 300 Z"
            fill="url(#rf-trail-2)" />

      {/* Dashed center-lines along trails */}
      <line x1="60" y1="300" x2="260" y2="80" stroke="#5b4d8a" strokeWidth="1" strokeDasharray="4 4" opacity="0.35" />
      <line x1="160" y1="300" x2="370" y2="80" stroke="#5b4d8a" strokeWidth="1" strokeDasharray="4 4" opacity="0.35" />

      {/* Trail head 1 — rank #3 chip */}
      <g transform="translate(40,260)">
        <rect x="0" y="0" width="56" height="40" rx="20" fill="#fff" stroke="#1a1a1a" strokeWidth="1.4" />
        <text x="28" y="26" textAnchor="middle" fontFamily="'DM Mono', monospace" fontSize="14" fontWeight="800" fill="#1a1a1a">#3</text>
      </g>

      {/* Trail head 2 — rank #2 chip */}
      <g transform="translate(140,210)">
        <rect x="0" y="0" width="56" height="40" rx="20" fill="#fff" stroke="#1a1a1a" strokeWidth="1.4" />
        <text x="28" y="26" textAnchor="middle" fontFamily="'DM Mono', monospace" fontSize="14" fontWeight="800" fill="#1a1a1a">#2</text>
      </g>

      {/* Anchor tile upper-right with #1 badge underneath */}
      <g transform="translate(338,68)">
        <rect x="0" y="0" width="84" height="84" rx="18" fill="#0E1116" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        {/* Ascending bars glyph (podium) */}
        <rect x="20" y="46" width="12" height="22" rx="2" fill="#B7A6F7" />
        <rect x="36" y="34" width="12" height="34" rx="2" fill="#B7A6F7" />
        <rect x="52" y="22" width="12" height="46" rx="2" fill="#B7A6F7" />
        {/* Up-arrow accent */}
        <path d="M 16 18 L 22 12 L 28 18" stroke="#B7A6F7" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="22" y1="12" x2="22" y2="20" stroke="#B7A6F7" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g transform="translate(354,156)">
        <rect x="0" y="0" width="52" height="32" rx="16" fill="#fff" stroke="#1a1a1a" strokeWidth="1.4" />
        <text x="26" y="22" textAnchor="middle" fontFamily="'DM Mono', monospace" fontSize="13" fontWeight="800" fill="#1a1a1a">#1</text>
      </g>
    </svg>
  );
}
