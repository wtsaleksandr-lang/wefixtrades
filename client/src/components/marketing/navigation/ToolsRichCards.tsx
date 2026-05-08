/**
 * ToolsRichCards — Effortel-style rich dropdown for the Tools menu
 * (3 items, so each gets full Effortel-card real estate: heading +
 * subtitle on top, animated/illustrated visual zone below).
 *
 * Each card is a Link wrapping a heading row + a small product
 * preview built from inline SVG so we don't depend on image assets.
 * On hover the card lifts and the illustration animates subtly.
 */

import { Link } from "wouter";
import { mkt } from "@/theme/tokens";
import type { NavItemChild } from "@/site/navigation";

export function ToolsRichCards({
  items,
  onNavigate,
}: {
  items: NavItemChild[];
  onNavigate?: () => void;
}) {
  return (
    <div className="mkt-tools-grid">
      {items.map((it) => {
        const Visual = pickVisualFor(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className="mkt-tools-card"
            onClick={onNavigate}
          >
            <div className="mkt-tools-card__head">
              <div className="mkt-tools-card__title">{it.label}</div>
              {it.description && (
                <div className="mkt-tools-card__desc">{it.description}</div>
              )}
            </div>
            <div className="mkt-tools-card__visual">
              <Visual />
            </div>
            <span className="mkt-tools-card__cta">
              Open
              <svg width="11" height="11" viewBox="0 0 9 10" aria-hidden>
                <path
                  d="M5.6 6L0.5 6L0.5 4.1L5.6 4.1L3.1 1.6L4.4 0.3L8.2 4C8.7 4.6 8.7 5.5 8.2 6.1L4.4 9.9L3.1 8.6L5.6 6Z"
                  fill="currentColor"
                />
              </svg>
            </span>
          </Link>
        );
      })}
      <style>{CSS}</style>
    </div>
  );
}

/* ── Pick visual by href so the illustration matches the tool ─── */

function pickVisualFor(href: string): () => JSX.Element {
  if (href.includes("missed-call")) return MissedCallVisual;
  if (href.includes("quote-demo")) return QuoteVisual;
  if (href.includes("free-audit")) return AuditVisual;
  return GenericVisual;
}

/* ─── 1. Missed-Call Calculator visual ───
   A stack of 3 missed-call rows with strike-through and a running
   "lost revenue" counter that ticks. */
function MissedCallVisual() {
  return (
    <svg viewBox="0 0 320 130" width="100%" height="100%" aria-hidden>
      {/* Card backdrop */}
      <rect x="0" y="0" width="320" height="130" rx="12" fill="rgba(20,24,23,0.6)" />
      <rect x="0" y="0" width="320" height="130" rx="12" fill="url(#mc-grad)" opacity="0.5" />
      {/* Header strip */}
      <text x="14" y="22" fontFamily="'DM Mono', monospace" fontSize="9"
            fill="rgba(255,255,255,0.45)" letterSpacing="1.5">MISSED CALLS · TODAY</text>
      <text x="306" y="22" textAnchor="end" fontFamily="'DM Mono', monospace" fontSize="9"
            fontWeight="700" fill="#F87171" letterSpacing="1">3</text>

      {/* 3 rows */}
      {[0, 1, 2].map((i) => (
        <g key={i} className={`mc-row mc-row-${i}`}>
          <rect x="14" y={36 + i * 22} width="292" height="18" rx="6"
                fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.06)" />
          <circle cx="26" cy={45 + i * 22} r="4" fill="#F87171" opacity="0.85" />
          <text x="38" y={49 + i * 22} fontFamily="'DM Mono', monospace" fontSize="9"
                fill="rgba(255,255,255,0.55)" letterSpacing="0.5">+1 (520) 555-01{20 + i * 4}</text>
          <text x="296" y={49 + i * 22} textAnchor="end" fontFamily="'DM Mono', monospace"
                fontSize="9" fontWeight="700" fill="#fff">{i === 0 ? "8:14 PM" : i === 1 ? "9:02 PM" : "11:37 PM"}</text>
        </g>
      ))}

      {/* Lost revenue band */}
      <rect x="14" y="106" width="292" height="18" rx="6"
            fill="rgba(248,113,113,0.10)" stroke="rgba(248,113,113,0.35)" />
      <text x="22" y="118" fontFamily="'DM Mono', monospace" fontSize="8.5"
            fontWeight="700" fill="rgba(248,113,113,0.85)" letterSpacing="1.5">
        REVENUE AT RISK
      </text>
      <text x="298" y="119" textAnchor="end" fontFamily="'DM Sans', sans-serif"
            fontSize="13" fontWeight="800" fill="#F87171">
        $ 1,247
      </text>

      <defs>
        <linearGradient id="mc-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(248,113,113,0.10)" />
          <stop offset="100%" stopColor="rgba(248,113,113,0)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ─── 2. Quote Calculator Demo visual ───
   Faux quote widget: service line, area line, accent total. */
function QuoteVisual() {
  return (
    <svg viewBox="0 0 320 130" width="100%" height="100%" aria-hidden>
      <rect x="0" y="0" width="320" height="130" rx="12" fill="rgba(20,24,23,0.6)" />
      <rect x="0" y="0" width="320" height="130" rx="12" fill="url(#q-grad)" opacity="0.5" />

      <text x="14" y="22" fontFamily="'DM Mono', monospace" fontSize="9"
            fill="rgba(255,255,255,0.45)" letterSpacing="1.5">QUOTEQUICK PRO</text>
      <text x="306" y="22" textAnchor="end" fontFamily="'DM Mono', monospace" fontSize="9"
            fill="#66E8FA" letterSpacing="1">2.3s</text>

      {/* Service row */}
      <text x="14" y="44" fontFamily="'DM Mono', monospace" fontSize="8"
            fill="rgba(255,255,255,0.45)" letterSpacing="1.2">SERVICE</text>
      <text x="306" y="44" textAnchor="end" fontFamily="'DM Sans', sans-serif" fontSize="11"
            fontWeight="500" fill="rgba(255,255,255,0.85)">Drain cleaning</text>
      <line x1="14" y1="50" x2="306" y2="50" stroke="rgba(255,255,255,0.06)" />

      {/* Area row */}
      <text x="14" y="64" fontFamily="'DM Mono', monospace" fontSize="8"
            fill="rgba(255,255,255,0.45)" letterSpacing="1.2">AREA</text>
      <text x="306" y="64" textAnchor="end" fontFamily="'DM Sans', sans-serif" fontSize="11"
            fontWeight="500" fill="rgba(255,255,255,0.85)">Downtown · 2 storey</text>
      <line x1="14" y1="70" x2="306" y2="70" stroke="rgba(255,255,255,0.06)" />

      {/* Accent total band */}
      <rect x="14" y="84" width="292" height="32" rx="8"
            fill="rgba(102,232,250,0.12)" stroke="rgba(102,232,250,0.40)" />
      <text x="24" y="105" fontFamily="'DM Mono', monospace" fontSize="9"
            fontWeight="700" fill="rgba(102,232,250,0.75)" letterSpacing="1.5">
        YOUR QUOTE
      </text>
      <text x="296" y="106" textAnchor="end" fontFamily="'DM Sans', sans-serif"
            fontSize="20" fontWeight="800" fill="#66E8FA" letterSpacing="-0.02em">
        $1,247
      </text>

      <defs>
        <linearGradient id="q-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(102,232,250,0.12)" />
          <stop offset="100%" stopColor="rgba(102,232,250,0)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ─── 3. Free Website Audit visual ───
   Score gauge + a small checklist. */
function AuditVisual() {
  return (
    <svg viewBox="0 0 320 130" width="100%" height="100%" aria-hidden>
      <rect x="0" y="0" width="320" height="130" rx="12" fill="rgba(20,24,23,0.6)" />
      <rect x="0" y="0" width="320" height="130" rx="12" fill="url(#a-grad)" opacity="0.5" />

      <text x="14" y="22" fontFamily="'DM Mono', monospace" fontSize="9"
            fill="rgba(255,255,255,0.45)" letterSpacing="1.5">SITE AUDIT · LIVE</text>

      {/* Score arc */}
      <g transform="translate(74, 78)">
        {/* Track */}
        <circle cx="0" cy="0" r="32" fill="none"
                stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        {/* Filled arc — 92% (~6.0 rad of 6.28) */}
        <circle cx="0" cy="0" r="32" fill="none"
                stroke="#34D399" strokeWidth="6" strokeLinecap="round"
                strokeDasharray="201" strokeDashoffset="16"
                transform="rotate(-90)" />
        <text x="0" y="6" textAnchor="middle"
              fontFamily="'DM Sans', sans-serif" fontSize="22"
              fontWeight="800" fill="#fff" letterSpacing="-0.02em">92</text>
      </g>
      <text x="74" y="124" textAnchor="middle" fontFamily="'DM Mono', monospace"
            fontSize="8.5" fontWeight="700" fill="rgba(52,211,153,0.85)"
            letterSpacing="1.4">PAGESPEED</text>

      {/* Checklist */}
      {[
        { label: "Mobile-first", ok: true,  y: 42 },
        { label: "Map Pack",     ok: true,  y: 66 },
        { label: "Schema markup", ok: false, y: 90 },
      ].map((row) => (
        <g key={row.label}>
          <rect x={138} y={row.y - 11} width="168" height="20" rx="6"
                fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.06)" />
          {row.ok ? (
            <g transform={`translate(150, ${row.y - 1})`}>
              <circle cx="0" cy="0" r="6" fill="rgba(52,211,153,0.18)"
                      stroke="rgba(52,211,153,0.60)" />
              <path d="M -2.4 0 L -0.8 1.6 L 2.6 -2"
                    fill="none" stroke="#34D399" strokeWidth="1.6"
                    strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ) : (
            <g transform={`translate(150, ${row.y - 1})`}>
              <circle cx="0" cy="0" r="6" fill="rgba(248,113,113,0.18)"
                      stroke="rgba(248,113,113,0.60)" />
              <path d="M -2 -2 L 2 2 M 2 -2 L -2 2"
                    fill="none" stroke="#F87171" strokeWidth="1.6"
                    strokeLinecap="round" />
            </g>
          )}
          <text x="164" y={row.y + 3} fontFamily="'DM Sans', sans-serif" fontSize="11"
                fontWeight="500" fill={row.ok ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)"}>
            {row.label}
          </text>
        </g>
      ))}

      <defs>
        <linearGradient id="a-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(52,211,153,0.10)" />
          <stop offset="100%" stopColor="rgba(52,211,153,0)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ─── Fallback if a Tools item slips through with no matching href ─── */
function GenericVisual() {
  return (
    <svg viewBox="0 0 320 130" width="100%" height="100%" aria-hidden>
      <rect x="0" y="0" width="320" height="130" rx="12" fill="rgba(20,24,23,0.6)" />
      <rect x="40" y="40" width="240" height="50" rx="10"
            fill="rgba(102,232,250,0.10)" stroke="rgba(102,232,250,0.30)" />
    </svg>
  );
}

/* ─── Card + grid CSS ─── */
const CSS = `
.mkt-tools-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  width: 100%;
}
@media (max-width: 720px) {
  .mkt-tools-grid { grid-template-columns: 1fr; }
}

.mkt-tools-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 18px 16px;
  border-radius: 16px;
  background: #181d1c;
  border: 1px solid rgba(255, 255, 255, 0.07);
  text-decoration: none;
  cursor: pointer;
  overflow: hidden;
  transition:
    background 280ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 280ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 380ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 360ms cubic-bezier(0.22, 1, 0.36, 1);
}
.mkt-tools-card::after {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  background: radial-gradient(
    circle at 50% 100%,
    rgba(102, 232, 250, 0.12),
    transparent 60%
  );
  opacity: 0;
  pointer-events: none;
  transition: opacity 320ms ease;
}
.mkt-tools-card:hover {
  background: #1c2221;
  border-color: rgba(102, 232, 250, 0.28);
  transform: translateY(-3px);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.38);
}
.mkt-tools-card:hover::after {
  opacity: 1;
}

.mkt-tools-card__head {
  position: relative;
  z-index: 1;
}
.mkt-tools-card__title {
  font-size: 15px;
  font-weight: 650;
  color: ${mkt.onDark};
  line-height: 1.2;
  margin-bottom: 4px;
  letter-spacing: -0.005em;
}
.mkt-tools-card__desc {
  font-size: 12.5px;
  font-weight: 450;
  color: ${mkt.textMuted};
  line-height: 1.4;
}

.mkt-tools-card__visual {
  position: relative;
  z-index: 1;
  border-radius: 12px;
  overflow: hidden;
  transform-origin: center bottom;
  transition: transform 480ms cubic-bezier(0.22, 1, 0.36, 1);
}
.mkt-tools-card:hover .mkt-tools-card__visual {
  transform: scale(1.025);
}

.mkt-tools-card__cta {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: 'DM Mono', monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${mkt.onDarkMuted};
  transition: color 240ms ease, transform 280ms cubic-bezier(0.22,1,0.36,1);
}
.mkt-tools-card:hover .mkt-tools-card__cta {
  color: ${mkt.accent};
  transform: translateX(2px);
}
`;
