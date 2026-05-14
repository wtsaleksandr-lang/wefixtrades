/**
 * WeFixTradesLaptopHero — Effortel-style hero illustration: a tilted
 * laptop mockup partially merged into a jagged rocky outcropping,
 * sitting against a dramatic atmospheric gradient (cyan + pink + warm
 * sunset tones).
 *
 * The rock is built from three layered SVG paths (silhouette, mid-tone
 * face, highlight strokes) plus several crack lines so it reads as a
 * believable stone formation rather than a flat blob, even though it's
 * pure SVG. The laptop's lower body is partially overlapped by the
 * rock's peak so the two visually fuse instead of the laptop floating
 * above a tiny mound.
 */

interface Props { size?: number; }

export default function WeFixTradesLaptopHero({ size = 720 }: Props) {
  return (
    <svg
      viewBox="0 0 720 480"
      width="100%"
      height="auto"
      style={{ display: "block", maxWidth: size }}
      role="img"
      aria-label="WeFixTrades hero"
    >
      <defs>
        {/* Atmospheric gradients — cyan upper-right, warm/pink lower-left */}
        <linearGradient id="wt-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#0a0e14" />
          <stop offset="50%"  stopColor="#1a1f28" />
          <stop offset="100%" stopColor="#0a0e14" />
        </linearGradient>
        <radialGradient id="wt-glow-cyan" cx="0.78" cy="0.32" r="0.55">
          <stop offset="0%"   stopColor="rgba(13,60,252,0.48)" />
          <stop offset="60%"  stopColor="rgba(13,60,252,0.10)" />
          <stop offset="100%" stopColor="rgba(13,60,252,0)" />
        </radialGradient>
        <radialGradient id="wt-glow-pink" cx="0.18" cy="0.72" r="0.50">
          <stop offset="0%"   stopColor="rgba(244,114,182,0.34)" />
          <stop offset="60%"  stopColor="rgba(244,114,182,0.08)" />
          <stop offset="100%" stopColor="rgba(244,114,182,0)" />
        </radialGradient>
        <radialGradient id="wt-glow-warm" cx="0.30" cy="0.45" r="0.40">
          <stop offset="0%"   stopColor="rgba(214,168,138,0.20)" />
          <stop offset="100%" stopColor="rgba(214,168,138,0)" />
        </radialGradient>

        {/* Screen + laptop chassis */}
        <linearGradient id="wt-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#0f1418" />
          <stop offset="100%" stopColor="#0a0e12" />
        </linearGradient>
        <linearGradient id="wt-laptop-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#3a4047" />
          <stop offset="100%" stopColor="#1a1e22" />
        </linearGradient>

        {/* Rock — three tonal gradients for depth */}
        <linearGradient id="wt-rock-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#1d2127" />
          <stop offset="100%" stopColor="#070a0e" />
        </linearGradient>
        <linearGradient id="wt-rock-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#363a40" />
          <stop offset="100%" stopColor="#101319" />
        </linearGradient>
        <linearGradient id="wt-rock-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#4a4f55" />
          <stop offset="100%" stopColor="#1c2026" />
        </linearGradient>
      </defs>

      {/* Backdrop layers */}
      <rect x="0" y="0" width="720" height="480" fill="url(#wt-bg)" rx="14" />
      <rect x="0" y="0" width="720" height="480" fill="url(#wt-glow-warm)" rx="14" />
      <rect x="0" y="0" width="720" height="480" fill="url(#wt-glow-pink)" rx="14" />
      <rect x="0" y="0" width="720" height="480" fill="url(#wt-glow-cyan)" rx="14" />

      {/* ─── ROCK FORMATION ───────────────────────────────────────
          Three layered jagged silhouettes (back / mid / front) + crack
          striations + highlight catches. Spans the full bottom of the
          canvas with a peak around x=360 where the laptop merges in. */}

      {/* Back ridge — full-width, deepest tone, lowest profile */}
      <path
        d="M 0 480
           L 0 432 L 26 425 L 58 418 L 88 422 L 115 412 L 142 408 L 168 398
           L 198 388 L 228 376 L 258 366 L 290 358 L 322 348 L 358 342
           L 392 346 L 425 352 L 458 360 L 488 366 L 518 374 L 548 380
           L 580 386 L 612 392 L 642 400 L 670 408 L 698 416 L 720 422
           L 720 480 Z"
        fill="url(#wt-rock-back)"
      />

      {/* Mid ridge — pulled forward + up, brighter mid-tone */}
      <path
        d="M 0 480
           L 0 458 L 38 452 L 72 446 L 105 442 L 138 438 L 172 432
           L 208 424 L 244 414 L 282 402 L 320 390 L 358 384
           L 396 388 L 432 396 L 468 405 L 502 412 L 536 418 L 568 426
           L 598 432 L 628 438 L 658 444 L 688 450 L 720 456
           L 720 480 Z"
        fill="url(#wt-rock-mid)"
        opacity="0.95"
      />

      {/* Front rim — main face under the laptop, brightest layer.
          Includes the central peak that overlaps the laptop base. */}
      <path
        d="M 60 480
           L 60 470 L 92 465 L 128 461 L 165 458 L 200 454 L 235 448
           L 270 440 L 304 432 L 338 422
           L 360 412 L 382 422
           L 414 432 L 448 440 L 480 446 L 512 452 L 544 458 L 576 462
           L 608 466 L 640 470 L 670 474
           L 670 480 Z"
        fill="url(#wt-rock-front)"
      />

      {/* Rock cracks + striations — thin, varied, low-opacity strokes */}
      <g stroke="rgba(255,255,255,0.06)" strokeWidth="1" fill="none" strokeLinecap="round">
        <path d="M 130 470 L 152 446" />
        <path d="M 218 458 L 244 432" />
        <path d="M 290 444 L 318 416" />
        <path d="M 386 440 L 412 470" />
        <path d="M 470 444 L 498 472" />
        <path d="M 552 446 L 580 472" />
      </g>
      {/* Catch highlights along the brightest rock edges */}
      <g stroke="rgba(186,196,206,0.18)" strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M 168 460 L 218 448" />
        <path d="M 304 432 L 340 420" />
        <path d="M 392 422 L 442 432" />
        <path d="M 512 452 L 558 460" />
      </g>

      {/* Soft dust/particle specks on the rock face */}
      <g fill="rgba(214,220,228,0.18)">
        <circle cx="142" cy="450" r="1" />
        <circle cx="248" cy="432" r="0.9" />
        <circle cx="332" cy="418" r="1.1" />
        <circle cx="420" cy="436" r="0.9" />
        <circle cx="538" cy="452" r="1" />
        <circle cx="612" cy="466" r="0.9" />
      </g>

      {/* ─── LAPTOP ─────────────────────────────────────────────── */}
      {/* Drop shadow on the rock UNDER the laptop — soft elliptical glow */}
      <ellipse cx="360" cy="420" rx="180" ry="14" fill="rgba(0,0,0,0.55)" opacity="0.65" />

      <g transform="translate(360,224) rotate(-8) translate(-180,-110)">
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
        <g transform="translate(32,8)">
          {/* logo + brand */}
          <rect x="14" y="10" width="14" height="14" rx="3" fill="#0d3cfc" />
          <text x="36" y="22" fontFamily="'Inter', system-ui, sans-serif" fontSize="11" fontWeight="800" fill="#fff" letterSpacing="-0.02em">
            WeFixTrades
          </text>
          {/* nav */}
          <text x="138" y="22" fontFamily="'DM Mono', monospace" fontSize="7" fontWeight="600" fill="rgba(255,255,255,0.55)" letterSpacing="0.10em">PRODUCTS</text>
          <text x="190" y="22" fontFamily="'DM Mono', monospace" fontSize="7" fontWeight="600" fill="rgba(255,255,255,0.55)" letterSpacing="0.10em">PRICING</text>
          <text x="232" y="22" fontFamily="'DM Mono', monospace" fontSize="7" fontWeight="600" fill="rgba(255,255,255,0.55)" letterSpacing="0.10em">DEMO</text>
          {/* nav button */}
          <rect x="262" y="10" width="22" height="16" rx="4" fill="#0d3cfc" />
          <text x="273" y="22" fontFamily="'DM Mono', monospace" fontSize="6" fontWeight="700" fill="#0a1018" textAnchor="middle">START</text>
        </g>

        {/* Hero copy */}
        <g transform="translate(32,40)">
          <text x="148" y="50" textAnchor="middle" fontFamily="'Inter', system-ui, sans-serif" fontSize="17" fontWeight="800" fill="#fff" letterSpacing="-0.02em">
            Never miss a lead.
          </text>
          <text x="148" y="72" textAnchor="middle" fontFamily="'Inter', system-ui, sans-serif" fontSize="17" fontWeight="800" fill="#0d3cfc" letterSpacing="-0.02em">
            Run on autopilot.
          </text>
          <text x="148" y="92" textAnchor="middle" fontFamily="'DM Sans', system-ui, sans-serif" fontSize="8" fill="rgba(255,255,255,0.55)">
            AI dispatch, instant quotes, 24/7 booking — built for trades.
          </text>

          {/* CTAs */}
          <rect x="92" y="106" width="56" height="20" rx="5" fill="#0d3cfc" />
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

      {/* ─── ROCK PEAK OVERLAY ────────────────────────────────────
          A small foreground rock chip that sits in front of the laptop's
          lower-left bezel so the chassis visually merges into the rock
          rather than hovering above it. */}
      <path
        d="M 246 408
           L 270 396 L 290 388 L 312 386 L 330 392 L 340 402
           L 332 414 L 314 422 L 290 426 L 268 422 Z"
        fill="url(#wt-rock-front)"
      />
      <path
        d="M 414 410
           L 432 402 L 454 398 L 478 402 L 492 410
           L 480 422 L 460 428 L 436 426 L 418 420 Z"
        fill="url(#wt-rock-front)"
        opacity="0.92"
      />
    </svg>
  );
}
