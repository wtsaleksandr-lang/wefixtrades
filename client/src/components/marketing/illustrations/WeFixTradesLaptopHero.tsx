/**
 * WeFixTradesLaptopHero — original SVG hero illustration. Tilted laptop
 * mockup floating on a dark rocky pedestal, set against an atmospheric
 * gradient backdrop with a soft cyan-to-pink glow. Laptop screen shows
 * the WeFixTrades dashboard mock with our own headline and CTAs.
 */

interface Props { size?: number; }

export default function WeFixTradesLaptopHero({ size = 720 }: Props) {
  return (
    <svg
      viewBox="0 0 720 480"
      width={size}
      height={(size * 480) / 720}
      role="img"
      aria-label="WeFixTrades hero"
    >
      <defs>
        <linearGradient id="wt-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#0a0e14" />
          <stop offset="50%"  stopColor="#1a1f28" />
          <stop offset="100%" stopColor="#0a0e14" />
        </linearGradient>
        <radialGradient id="wt-glow-cyan" cx="0.7" cy="0.4" r="0.45">
          <stop offset="0%"   stopColor="rgba(102,232,250,0.40)" />
          <stop offset="100%" stopColor="rgba(102,232,250,0)" />
        </radialGradient>
        <radialGradient id="wt-glow-pink" cx="0.2" cy="0.7" r="0.40">
          <stop offset="0%"   stopColor="rgba(244,114,182,0.30)" />
          <stop offset="100%" stopColor="rgba(244,114,182,0)" />
        </radialGradient>
        <linearGradient id="wt-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#0f1418" />
          <stop offset="100%" stopColor="#0a0e12" />
        </linearGradient>
        <linearGradient id="wt-laptop-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#3a4047" />
          <stop offset="100%" stopColor="#1a1e22" />
        </linearGradient>
        <linearGradient id="wt-rock" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#2a2e34" />
          <stop offset="100%" stopColor="#0a0d12" />
        </linearGradient>
      </defs>

      {/* Atmospheric backdrop */}
      <rect x="0" y="0" width="720" height="480" fill="url(#wt-bg)" rx="14" />
      <rect x="0" y="0" width="720" height="480" fill="url(#wt-glow-cyan)" rx="14" />
      <rect x="0" y="0" width="720" height="480" fill="url(#wt-glow-pink)" rx="14" />

      {/* Pale baseplate strip at bottom */}
      <rect x="0" y="436" width="720" height="44" fill="rgba(220,228,232,0.06)" rx="14" />

      {/* Rock pedestal — jagged silhouette */}
      <path
        d="M 280 440
           L 290 410 L 305 396 L 325 388 L 350 380 L 380 384 L 410 392
           L 432 408 L 446 426 L 458 440 Z"
        fill="url(#wt-rock)"
      />
      {/* Rock cracks */}
      <path d="M 320 414 L 340 432" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <path d="M 372 396 L 400 420" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

      {/* Laptop — tilted/floating */}
      <g transform="translate(360,240) rotate(-8) translate(-180,-110)">
        {/* Laptop base/keyboard deck */}
        <path
          d="M 24 200 L 0 220 L 360 220 L 336 200 Z"
          fill="url(#wt-laptop-base)"
        />
        <rect x="24" y="196" width="312" height="6" rx="2" fill="#0a0d12" />

        {/* Laptop hinge/screen */}
        <rect x="24" y="0" width="312" height="200" rx="8" fill="#1a1e22" />
        <rect x="32" y="8" width="296" height="184" rx="4" fill="url(#wt-screen)" />

        {/* SCREEN CONTENT — WeFixTrades site mock */}
        {/* top bar */}
        <g transform="translate(32,8)">
          {/* logo + brand */}
          <rect x="14" y="10" width="14" height="14" rx="3" fill="#66E8FA" />
          <text x="36" y="22" fontFamily="'Inter', system-ui, sans-serif" fontSize="11" fontWeight="800" fill="#fff" letterSpacing="-0.02em">
            WeFixTrades
          </text>
          {/* nav */}
          <text x="138" y="22" fontFamily="'DM Mono', monospace" fontSize="7" fontWeight="600" fill="rgba(255,255,255,0.55)" letterSpacing="0.10em">PRODUCTS</text>
          <text x="190" y="22" fontFamily="'DM Mono', monospace" fontSize="7" fontWeight="600" fill="rgba(255,255,255,0.55)" letterSpacing="0.10em">PRICING</text>
          <text x="232" y="22" fontFamily="'DM Mono', monospace" fontSize="7" fontWeight="600" fill="rgba(255,255,255,0.55)" letterSpacing="0.10em">DEMO</text>
          {/* nav button */}
          <rect x="262" y="10" width="22" height="16" rx="4" fill="#66E8FA" />
          <text x="273" y="22" fontFamily="'DM Mono', monospace" fontSize="6" fontWeight="700" fill="#0a1018" textAnchor="middle">START</text>
        </g>

        {/* Hero copy */}
        <g transform="translate(32,40)">
          <text x="148" y="50" textAnchor="middle" fontFamily="'Inter', system-ui, sans-serif" fontSize="17" fontWeight="800" fill="#fff" letterSpacing="-0.02em">
            Never miss a lead.
          </text>
          <text x="148" y="72" textAnchor="middle" fontFamily="'Inter', system-ui, sans-serif" fontSize="17" fontWeight="800" fill="#66E8FA" letterSpacing="-0.02em">
            Run on autopilot.
          </text>
          <text x="148" y="92" textAnchor="middle" fontFamily="'DM Sans', system-ui, sans-serif" fontSize="8" fill="rgba(255,255,255,0.55)">
            AI dispatch, instant quotes, 24/7 booking — built for trades.
          </text>

          {/* CTAs */}
          <rect x="92" y="106" width="56" height="20" rx="5" fill="#66E8FA" />
          <text x="120" y="119" textAnchor="middle" fontFamily="'DM Mono', monospace" fontSize="7" fontWeight="700" fill="#0a1018" letterSpacing="0.10em">START FREE</text>

          <rect x="156" y="106" width="56" height="20" rx="5" fill="none" stroke="rgba(255,255,255,0.32)" />
          <text x="184" y="119" textAnchor="middle" fontFamily="'DM Mono', monospace" fontSize="7" fontWeight="700" fill="#fff" letterSpacing="0.10em">SEE DEMO</text>
        </g>

        {/* Stat row near bottom of screen */}
        <g transform="translate(32,160)">
          <rect x="20" y="0" width="76" height="24" rx="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" />
          <text x="58" y="11" textAnchor="middle" fontFamily="'DM Mono', monospace" fontSize="6" fill="rgba(255,255,255,0.45)" letterSpacing="0.10em">CALLS HANDLED</text>
          <text x="58" y="20" textAnchor="middle" fontFamily="'Inter', system-ui, sans-serif" fontSize="9" fontWeight="800" fill="#fff">11,357</text>

          <rect x="100" y="0" width="76" height="24" rx="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" />
          <text x="138" y="11" textAnchor="middle" fontFamily="'DM Mono', monospace" fontSize="6" fill="rgba(255,255,255,0.45)" letterSpacing="0.10em">JOBS BOOKED</text>
          <text x="138" y="20" textAnchor="middle" fontFamily="'Inter', system-ui, sans-serif" fontSize="9" fontWeight="800" fill="#86EFAC">+5.7%</text>

          <rect x="180" y="0" width="76" height="24" rx="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" />
          <text x="218" y="11" textAnchor="middle" fontFamily="'DM Mono', monospace" fontSize="6" fill="rgba(255,255,255,0.45)" letterSpacing="0.10em">AVG REVIEW</text>
          <text x="218" y="20" textAnchor="middle" fontFamily="'Inter', system-ui, sans-serif" fontSize="9" fontWeight="800" fill="#fff">4.9★</text>
        </g>

        {/* Subtle screen reflection sheen */}
        <path d="M 32 8 L 328 8 L 232 192 L 32 192 Z" fill="url(#wt-glow-cyan)" opacity="0.06" />
      </g>

      {/* Floating shadow under laptop */}
      <ellipse cx="360" cy="445" rx="160" ry="10" fill="rgba(0,0,0,0.55)" opacity="0.7" />
    </svg>
  );
}
