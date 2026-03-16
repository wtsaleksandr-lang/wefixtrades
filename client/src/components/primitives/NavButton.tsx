/**
 * NavButton — SERVICES style (dark)
 * CSS lives in index.css under "NAV BUTTON — SERVICES".
 */

// ─── Arrow icon ──────────────────────────────────────────────────────────────

function ArrowIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 6h8M7 3l3 3-3 3" />
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface NavButtonProps {
  label: string;
  href?: string;
  onClick?: () => void;
}

export default function NavButton({ label, href = "#", onClick }: NavButtonProps) {
  return (
    <a className="nav-btn" href={href} onClick={onClick}>
      {/* Left arrow — slides in from right on hover */}
      <span className="nav-btn__arrow-left">
        <span className="nav-btn__arrow-track">
          <span className="nav-btn__arrow-slot"><ArrowIcon /></span>
          <span className="nav-btn__arrow-slot"><ArrowIcon /></span>
        </span>
      </span>

      {/* Text — shifts RIGHT on hover, mirrors left gap */}
      <span className="nav-btn__text">{label}</span>

      {/* Square — stays RIGHT, expands LEFT on hover */}
      <span className="nav-btn__square">
        <span className="nav-btn__square-track">
          <span className="nav-btn__arrow-slot"><ArrowIcon /></span>
          <span className="nav-btn__arrow-slot"><ArrowIcon /></span>
        </span>
      </span>
    </a>
  );
}

// ─── Demo canvas ─────────────────────────────────────────────────────────────

export function NavButtonDemo() {
  return (
    <div
      style={{
        background: "#22282a",
        padding: "48px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 40,
        fontFamily: "sans-serif",
      }}
    >
      {/* 1 — Normal state */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
          Normal state
        </span>
        <NavButton label="Services" href="/services" />
      </div>

      {/* 2 — Forced hover state */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
          Hover state (forced)
        </span>
        <a className="nav-btn hover-forced" href="#" onClick={(e) => e.preventDefault()}>
          <span className="nav-btn__arrow-left">
            <span className="nav-btn__arrow-track">
              <span className="nav-btn__arrow-slot"><ArrowIcon /></span>
              <span className="nav-btn__arrow-slot"><ArrowIcon /></span>
            </span>
          </span>
          <span className="nav-btn__text">Services</span>
          <span className="nav-btn__square">
            <span className="nav-btn__square-track">
              <span className="nav-btn__arrow-slot"><ArrowIcon /></span>
              <span className="nav-btn__arrow-slot"><ArrowIcon /></span>
            </span>
          </span>
        </a>
      </div>

      {/* 3 — Normal (comparison) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
          Normal state (comparison)
        </span>
        <NavButton label="Services" href="/services" />
      </div>
    </div>
  );
}
