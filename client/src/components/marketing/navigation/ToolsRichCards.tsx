/**
 * ToolsRichCards — flagship rich cards for our three home-grown tools
 * (QuoteQuick, TradeLine, LocalScore). Each card gets full real estate:
 * heading + subtitle on top, then a REAL product SCREENSHOT poster below.
 *
 * On hover the card lifts and the poster plays a subtle, slow zoom/pan
 * "Ken-Burns" motion so it reads as a live product — no video file, no
 * jank, tiny payload. The motion is purely CSS and is fully disabled under
 * `prefers-reduced-motion: reduce` (the poster simply sits still).
 *
 * Posters are local WebP assets under /tool-cards/, real captures of each
 * tool's own UI:
 *   - QuoteQuick  → the roof & solar 3D instant-quote widget
 *   - TradeLine   → the AI dispatcher/receptionist chat reply
 *   - LocalScore  → the local audit report (score breakdown)
 */

import { Link } from "wouter";
import { mkt } from "@/theme/tokens";
import type { NavItemChild } from "@/site/navigation";

/** Poster + accessible alt per tool, keyed off the destination href so the
 *  screenshot always matches the tool regardless of which nav surface the
 *  card is rendered on. Hrefs cover the canonical routes + redirect aliases
 *  (see client/src/App.tsx). */
interface PosterMeta {
  src: string;
  alt: string;
}

function posterFor(href: string): PosterMeta | null {
  const h = href.toLowerCase();
  // LocalScore — the free website + Google Business audit.
  if (h.includes("free-audit") || h.includes("localscore") || h.includes("/audit")) {
    return {
      src: "/tool-cards/localscore.webp",
      alt: "LocalScore audit result — local visibility score with a Google Maps profile and website-quality breakdown.",
    };
  }
  // QuoteQuick — the quote-wizard builder. Demo + product + templates routes.
  if (
    h.includes("quotequick") ||
    h.includes("quickquotepro") ||
    h.includes("quote-demo") ||
    h.includes("/templates")
  ) {
    return {
      src: "/tool-cards/quotequick.webp",
      alt: "QuoteQuick roof & solar quote widget — 3D roof view with instant solar and roofing pricing.",
    };
  }
  // TradeLine — the AI receptionist.
  if (h.includes("tradeline") || h.includes("missed-call") || h.includes("receptionist")) {
    return {
      src: "/tool-cards/tradeline.webp",
      alt: "TradeLine AI receptionist — answering a customer and booking a plumber with a live ETA.",
    };
  }
  return null;
}

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
        const poster = posterFor(it.href);
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
              {poster ? (
                <img
                  className="mkt-tools-card__poster"
                  src={poster.src}
                  alt={poster.alt}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              ) : (
                <div className="mkt-tools-card__poster mkt-tools-card__poster--fallback" aria-hidden />
              )}
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
    rgba(13, 60, 252, 0.12),
    transparent 60%
  );
  opacity: 0;
  pointer-events: none;
  transition: opacity 320ms ease;
}
.mkt-tools-card:hover {
  background: #1c2221;
  border-color: rgba(13, 60, 252, 0.28);
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

/* Visual zone — fixed 1.62:1 window so all three posters crop identically
   regardless of their captured aspect ratio. overflow:hidden hides the
   zoom/pan overscan so motion never spills past the rounded frame. */
.mkt-tools-card__visual {
  position: relative;
  z-index: 1;
  border-radius: 12px;
  overflow: hidden;
  aspect-ratio: 1.62 / 1;
  background: #0f1413;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.mkt-tools-card__poster {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
  transform-origin: center center;
  /* Idle scale sits at 1.04 so the hover pan/zoom has overscan to move
     into without ever revealing the frame edge. */
  transform: scale(1.04);
  transition: transform 600ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}
.mkt-tools-card__poster--fallback {
  background: linear-gradient(135deg, rgba(13,60,252,0.14), rgba(13,60,252,0));
}

/* Hover: slow Ken-Burns zoom + slight upward pan, looping while hovered so
   the still screenshot reads as a live, in-action product. */
@media (prefers-reduced-motion: no-preference) {
  .mkt-tools-card:hover .mkt-tools-card__poster {
    animation: mkt-tools-kenburns 7s ease-in-out infinite alternate;
  }
}
@keyframes mkt-tools-kenburns {
  0%   { transform: scale(1.04) translate3d(0, 0, 0); }
  100% { transform: scale(1.12) translate3d(0, -3%, 0); }
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
