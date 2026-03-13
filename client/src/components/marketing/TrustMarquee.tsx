const LOGOS = [
  {
    name: "FlowPro Plumbing",
    svg: (
      <svg width="130" height="40" viewBox="0 0 130 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="8" y="2" fill="#00AEEF"/>
        <path d="M10 28 Q10 12 18 12 Q26 12 26 20 Q26 26 20 28" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        <circle cx="20" cy="28" r="3" fill="white"/>
        <text x="44" y="17" fontFamily="'Syne', sans-serif" fontWeight="800" fontSize="13" fill="white" letterSpacing="-0.3">FLOWPRO</text>
        <text x="44" y="30" fontFamily="'DM Mono', monospace" fontWeight="500" fontSize="8" fill="#00AEEF" letterSpacing="2">PLUMBING</text>
      </svg>
    ),
  },
  {
    name: "ArcticAir HVAC",
    svg: (
      <svg width="130" height="40" viewBox="0 0 130 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="8" y="2" fill="#0D1B2A"/>
        <line x1="18" y1="8" x2="18" y2="30" stroke="#6ECFF6" strokeWidth="2" strokeLinecap="round"/>
        <line x1="8" y1="19" x2="28" y2="19" stroke="#6ECFF6" strokeWidth="2" strokeLinecap="round"/>
        <line x1="11" y1="11" x2="25" y2="27" stroke="#6ECFF6" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="25" y1="11" x2="11" y2="27" stroke="#6ECFF6" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="18" cy="19" r="3" fill="#6ECFF6"/>
        <text x="44" y="17" fontFamily="'DM Mono', monospace" fontWeight="500" fontSize="13" fill="white" letterSpacing="-0.3">ARCTICAIR</text>
        <text x="44" y="30" fontFamily="'DM Mono', monospace" fontWeight="400" fontSize="8" fill="#6ECFF6" letterSpacing="2">HVAC</text>
      </svg>
    ),
  },
  {
    name: "SunRise Solar",
    svg: (
      <svg width="130" height="40" viewBox="0 0 130 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="8" y="2" fill="#1A1200"/>
        <circle cx="18" cy="19" r="6" fill="#FFB703"/>
        <line x1="18" y1="8" x2="18" y2="11" stroke="#FFB703" strokeWidth="2" strokeLinecap="round"/>
        <line x1="18" y1="27" x2="18" y2="30" stroke="#FFB703" strokeWidth="2" strokeLinecap="round"/>
        <line x1="8" y1="19" x2="11" y2="19" stroke="#FFB703" strokeWidth="2" strokeLinecap="round"/>
        <line x1="25" y1="19" x2="28" y2="19" stroke="#FFB703" strokeWidth="2" strokeLinecap="round"/>
        <line x1="11" y1="12" x2="13" y2="14" stroke="#FFB703" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="23" y1="24" x2="25" y2="26" stroke="#FFB703" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="25" y1="12" x2="23" y2="14" stroke="#FFB703" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="13" y1="24" x2="11" y2="26" stroke="#FFB703" strokeWidth="1.5" strokeLinecap="round"/>
        <text x="44" y="17" fontFamily="'Outfit', sans-serif" fontWeight="700" fontSize="13" fill="white" letterSpacing="-0.3">SUNRISE</text>
        <text x="44" y="30" fontFamily="'DM Mono', monospace" fontWeight="400" fontSize="8" fill="#FFB703" letterSpacing="2">SOLAR</text>
      </svg>
    ),
  },
  {
    name: "TerraGreen Landscaping",
    svg: (
      <svg width="150" height="40" viewBox="0 0 150 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="8" y="2" fill="#0A1F0C"/>
        <path d="M18 28 L18 18" stroke="#4CAF50" strokeWidth="2" strokeLinecap="round"/>
        <path d="M18 18 Q18 10 26 10 Q26 18 18 18" fill="#4CAF50"/>
        <path d="M18 22 Q18 15 10 14 Q10 22 18 22" fill="#2E7D32"/>
        <text x="44" y="17" fontFamily="'Plus Jakarta Sans', sans-serif" fontWeight="800" fontSize="12" fill="white" letterSpacing="-0.3">TERRAGREEN</text>
        <text x="44" y="30" fontFamily="'DM Mono', monospace" fontWeight="400" fontSize="8" fill="#4CAF50" letterSpacing="2">LANDSCAPING</text>
      </svg>
    ),
  },
  {
    name: "SparkClean Services",
    svg: (
      <svg width="140" height="40" viewBox="0 0 140 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="8" y="2" fill="#1A0F2E"/>
        <path d="M20 9 L16 18 L22 18 L14 31 L18 22 L12 22 Z" fill="#A78BFA"/>
        <text x="44" y="17" fontFamily="'Space Grotesk', sans-serif" fontWeight="700" fontSize="13" fill="white" letterSpacing="-0.3">SPARKCLEAN</text>
        <text x="44" y="30" fontFamily="'DM Mono', monospace" fontWeight="400" fontSize="8" fill="#A78BFA" letterSpacing="2">SERVICES</text>
      </svg>
    ),
  },
  {
    name: "AquaShine Mobile Wash",
    svg: (
      <svg width="150" height="40" viewBox="0 0 150 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="8" y="2" fill="#0C1E2E"/>
        <path d="M8 24 Q12 16 18 16 Q24 16 28 24" stroke="#38BDF8" strokeWidth="2" fill="none" strokeLinecap="round"/>
        <path d="M11 28 Q15 22 18 22 Q21 22 25 28" stroke="#38BDF8" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        <circle cx="18" cy="11" r="3" fill="#38BDF8"/>
        <path d="M18 8 L18 11" stroke="#38BDF8" strokeWidth="1.5"/>
        <text x="44" y="17" fontFamily="'Syne', sans-serif" fontWeight="700" fontSize="13" fill="white" letterSpacing="-0.3">AQUASHINE</text>
        <text x="44" y="30" fontFamily="'DM Mono', monospace" fontWeight="400" fontSize="8" fill="#38BDF8" letterSpacing="2">MOBILE WASH</text>
      </svg>
    ),
  },
  {
    name: "SwiftKey Locksmith",
    svg: (
      <svg width="140" height="40" viewBox="0 0 140 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="8" y="2" fill="#1C1300"/>
        <circle cx="15" cy="16" r="5" stroke="#F59E0B" strokeWidth="2" fill="none"/>
        <path d="M19 20 L26 27 L24 29 L22 27 L20 29 L18 27 L22 23" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <text x="44" y="17" fontFamily="'DM Mono', monospace" fontWeight="500" fontSize="13" fill="white" letterSpacing="-0.3">SWIFTKEY</text>
        <text x="44" y="30" fontFamily="'DM Mono', monospace" fontWeight="400" fontSize="8" fill="#F59E0B" letterSpacing="2">LOCKSMITH</text>
      </svg>
    ),
  },
  {
    name: "ChromeCoat Painters",
    svg: (
      <svg width="150" height="40" viewBox="0 0 150 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="8" y="2" fill="#1F0A0E"/>
        <rect x="10" y="22" width="16" height="8" rx="2" fill="#FB7185"/>
        <path d="M14 22 L14 14 Q14 10 18 10 Q22 10 22 14 L22 22" stroke="#FB7185" strokeWidth="2" fill="none" strokeLinecap="round"/>
        <rect x="16" y="8" width="4" height="4" rx="1" fill="#FB7185"/>
        <text x="44" y="18" fontFamily="'Bebas Neue', cursive" fontWeight="400" fontSize="16" fill="white" letterSpacing="0.5">CHROMECOAT</text>
        <text x="44" y="30" fontFamily="'DM Mono', monospace" fontWeight="400" fontSize="8" fill="#FB7185" letterSpacing="2">PAINTERS</text>
      </svg>
    ),
  },
  {
    name: "LevelUp Drywall",
    svg: (
      <svg width="130" height="40" viewBox="0 0 130 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="8" y="2" fill="#0F1520"/>
        <rect x="9" y="12" width="18" height="3" rx="1.5" fill="#94A3B8"/>
        <rect x="9" y="18" width="18" height="3" rx="1.5" fill="#94A3B8"/>
        <rect x="9" y="24" width="18" height="3" rx="1.5" fill="#94A3B8"/>
        <circle cx="26" cy="13.5" r="2" fill="#38BDF8"/>
        <text x="44" y="17" fontFamily="'Outfit', sans-serif" fontWeight="300" fontSize="13" fill="white" letterSpacing="1">LEVELUP</text>
        <text x="44" y="30" fontFamily="'DM Mono', monospace" fontWeight="400" fontSize="8" fill="#94A3B8" letterSpacing="2">DRYWALL</text>
      </svg>
    ),
  },
  {
    name: "BuildRight Renovations",
    svg: (
      <svg width="155" height="40" viewBox="0 0 155 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="8" y="2" fill="#1A0D00"/>
        <path d="M18 9 L28 15 L28 29 L8 29 L8 15 Z" stroke="#F97316" strokeWidth="2" fill="none" strokeLinejoin="round"/>
        <rect x="14" y="22" width="8" height="7" rx="1" fill="#F97316"/>
        <path d="M8 15 L18 9 L28 15" stroke="#F97316" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <text x="44" y="17" fontFamily="'Plus Jakarta Sans', sans-serif" fontWeight="800" fontSize="12" fill="white" letterSpacing="-0.3">BUILDRIGHT</text>
        <text x="44" y="30" fontFamily="'DM Mono', monospace" fontWeight="400" fontSize="8" fill="#F97316" letterSpacing="2">RENOVATIONS</text>
      </svg>
    ),
  },
  {
    name: "PeakPipe Drain & Sewer",
    svg: (
      <svg width="140" height="40" viewBox="0 0 140 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="8" y="2" fill="#061418"/>
        <path d="M10 19 Q14 11 18 19 Q22 27 26 19" stroke="#22D3EE" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        <circle cx="10" cy="19" r="2" fill="#22D3EE"/>
        <circle cx="26" cy="19" r="2" fill="#22D3EE"/>
        <text x="44" y="17" fontFamily="'Space Grotesk', sans-serif" fontWeight="700" fontSize="13" fill="white" letterSpacing="-0.3">PEAKPIPE</text>
        <text x="44" y="30" fontFamily="'DM Mono', monospace" fontWeight="400" fontSize="8" fill="#22D3EE" letterSpacing="2">DRAIN &amp; SEWER</text>
      </svg>
    ),
  },
  {
    name: "GreenThumb Gardens",
    svg: (
      <svg width="150" height="40" viewBox="0 0 150 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="8" y="2" fill="#061A0A"/>
        <circle cx="18" cy="15" r="7" fill="#86EFAC" opacity="0.2"/>
        <circle cx="18" cy="15" r="4" fill="#86EFAC"/>
        <path d="M18 22 L18 30" stroke="#86EFAC" strokeWidth="2" strokeLinecap="round"/>
        <path d="M14 27 Q18 24 22 27" stroke="#86EFAC" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        <text x="44" y="17" fontFamily="'Syne', sans-serif" fontWeight="700" fontSize="12" fill="white" letterSpacing="-0.3">GREENTHUMB</text>
        <text x="44" y="30" fontFamily="'DM Mono', monospace" fontWeight="400" fontSize="8" fill="#86EFAC" letterSpacing="2">GARDENS</text>
      </svg>
    ),
  },
];

export default function TrustMarquee() {
  return (
    <section
      style={{
        width: "100%",
        paddingTop: 28,
        paddingBottom: 36,
        position: "relative",
      }}
    >
      <style>{`
        @keyframes tm-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .tm-stopper {
          width: 100%;
          overflow: hidden;
          mask-image: linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%);
          -webkit-mask-image: linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%);
        }
        .tm-track {
          display: inline-flex;
          flex-wrap: nowrap;
          animation: tm-scroll 45s linear infinite;
          will-change: transform;
          transform: translateZ(0);
        }
        .tm-stopper:hover .tm-track {
          animation-play-state: paused;
        }
        .tm-collection {
          display: inline-flex;
          flex-shrink: 0;
          flex-wrap: nowrap;
        }
        .tm-card {
          width: 186px;
          height: 100px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          padding: 0 20px;
          opacity: 0.65;
          transition: opacity 0.2s ease;
        }
        .tm-card:hover {
          opacity: 1;
        }
      `}</style>

      {/* Radial vignette to fade grid at edges/center so logos stay in focus */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse 80% 110% at 50% 50%, rgba(34,40,42,0.82) 0%, rgba(34,40,42,0.52) 45%, rgba(34,40,42,0.18) 68%, transparent 85%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Label */}
      <p
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.35)",
          marginBottom: 24,
          marginTop: 0,
        }}
      >
        Trusted by trade businesses across North America
      </p>

      {/* Marquee strip */}
      <div className="tm-stopper" style={{ position: "relative", zIndex: 1 }}>
        <div className="tm-track">
          {/* First collection */}
          <div className="tm-collection">
            {LOGOS.map((logo, i) => (
              <div key={`a-${i}`} className="tm-card" title={logo.name}>
                {logo.svg}
              </div>
            ))}
          </div>
          {/* Duplicate — required for seamless loop */}
          <div className="tm-collection" aria-hidden="true">
            {LOGOS.map((logo, i) => (
              <div key={`b-${i}`} className="tm-card" title={logo.name}>
                {logo.svg}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
