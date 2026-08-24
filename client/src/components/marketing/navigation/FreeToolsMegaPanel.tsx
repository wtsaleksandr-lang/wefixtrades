/**
 * FreeToolsMegaPanel — Wave 14 mega-menu unfold for the Free Tools nav item.
 *
 * Renders the 3 Free Tools sub-categories (Local SEO, AI Content, Widgets)
 * side-by-side inside the dropdown tray so users can jump directly to any
 * tool from the nav without bouncing through the /free-tools hub.
 *
 * The hub at /free-tools stays canonical for SEO + full detail; this panel
 * is purely a navigational preview, with a "See all N free tools" footer
 * link to the hub itself.
 *
 * Pattern matches Linear / Stripe / BrightLocal: discoverability inside
 * the menu, depth on the hub page.
 */

import { Link } from "wouter";
import { useState, type FC } from "react";
import { Lock, ChevronDown } from "lucide-react";
import type { NavItemChild, NavSubgroup } from "@/site/navigation";
import { NavIcon } from "./NavIcon";
import { mkt } from "@/theme/tokens";

const LOGIN_HREF = "/login";

interface Props {
  subgroups: NavSubgroup[];
  /** Hub page href (e.g. /free-tools) used by the bottom "See all" link. */
  hubHref: string;
  /** Called whenever a link inside the panel is clicked so the parent
   *  MenuItem can close the dropdown (Wave 12B auto-close pattern). */
  onNavigate: () => void;
}

export const FreeToolsMegaPanel: FC<Props> = ({ subgroups, hubHref, onNavigate }) => {
  return (
    <div className="ft-mega" data-testid="free-tools-panel">
      <div className="ft-mega__cols">
        {subgroups.map((group) => (
          <Column
            key={group.heading}
            group={group}
            hubHref={hubHref}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      <style>{CSS}</style>
    </div>
  );
};

/** slugify a heading for a stable aria-controls / element id. */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function Column({
  group,
  hubHref,
  onNavigate,
}: {
  group: NavSubgroup;
  /** Fallback hub link when the group itself declares no hubAnchor. */
  hubHref: string;
  onNavigate: () => void;
}) {
  const cap = group.maxShown ?? 4;
  const shown = group.items.slice(0, cap);
  const hidden = group.items.slice(cap);
  // Long-tail folds IN PLACE (collapsed by default). Nothing is dropped —
  // "Show N more" reveals the rest without leaving the menu; the hub link
  // below still points to the canonical full page for depth + SEO.
  const [open, setOpen] = useState(false);
  const panelId = `ftcol-${slug(group.heading)}`;
  const hub = group.hubAnchor ?? hubHref;

  return (
    <div className="ft-mega__col">
      <div className="ft-mega__heading">{group.heading}</div>
      <div className="ft-mega__rule" aria-hidden />
      <ul className="ft-mega__list">
        {shown.map((it) => (
          <li key={it.href}>
            <FreeToolsItem item={it} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>

      {hidden.length > 0 && (
        <>
          <div className="ft-mega__collapse" data-open={open} id={panelId}>
            <div>
              <ul className="ft-mega__list ft-mega__list--more">
                {hidden.map((it) => (
                  <li key={it.href}>
                    <FreeToolsItem item={it} onNavigate={onNavigate} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <button
            type="button"
            className="ft-mega__toggle"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Show less" : `Show ${hidden.length} more`}
            <ChevronDown
              size={13}
              strokeWidth={2.4}
              className={`ft-mega__toggle-icon${open ? " is-open" : ""}`}
              aria-hidden
            />
          </button>
        </>
      )}

      {hub && (
        <Link href={hub} onClick={onNavigate} className="ft-mega__more">
          See all
          <span aria-hidden className="ft-mega__more-arrow">{"→"}</span>
        </Link>
      )}
    </div>
  );
}

function FreeToolsItem({
  item,
  onNavigate,
}: {
  item: NavItemChild;
  onNavigate: () => void;
}) {
  // Same .mkt-menu-card the Products/Resources dropdowns use, so the button
  // size + white-square/blue-icon badge + blue-fill hover are identical.
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className="mkt-menu-card"
      data-testid={`nav-free-tools-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
    >
      <div className="mkt-menu-card-icon" style={{ color: mkt.accent }} aria-hidden>
        <NavIcon icon={item.icon} />
      </div>
      {/* Title + optional member-perk pill in a single flex row so the pill
          is always baseline-aligned with the label and NEVER overlaps it.
          The label shrinks first; the pill is flex-shrink:0 so it never
          wraps behind the text. */}
      <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          fontSize: 13, fontWeight: 650, color: mkt.text, lineHeight: 1.2, minWidth: 0,
          // Single line + ellipsis: two-word titles otherwise wrap to 2 lines
          // and the Members pill (flex-centered) lands BETWEEN the lines,
          // overlapping both (caught by visual review).
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {item.label}
        </div>
        {item.portalGated && (
          // Icon-only 22px circular ghost button — fixed size (flexShrink:0)
          // so it can NEVER push the title text to overlap at any viewport.
          // Clicking navigates to /login instead of the gated tool, preventing
          // 401s for guests. e.stopPropagation() keeps the parent card link
          // from also firing on the same click.
          <button
            className="ft-mega__lock"
            title="Members only — sign in to open"
            aria-label="Members only — sign in"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.location.href = LOGIN_HREF;
            }}
          >
            <Lock size={12} strokeWidth={2.4} aria-hidden />
          </button>
        )}
      </div>
    </Link>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────
 * Hover behaviour follows Wave 11A: border-highlight, NO translate.
 * Gaps inside columns are 2px (DESIGN-SYSTEM rule). Tokens are
 * pulled from mkt — no raw hex except the brand-blue arrow accent
 * which is the mkt.accent token. */
const CSS = `
.ft-mega {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
}
.ft-mega__cols {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
}
@media (max-width: 720px) {
  .ft-mega__cols { grid-template-columns: 1fr; gap: 12px; }
}

.ft-mega__col {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ft-mega__heading {
  font-family: 'DM Mono', monospace;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${mkt.onDarkFaint};
  margin-bottom: 6px;
}

.ft-mega__rule {
  height: 1px;
  background: ${mkt.onDarkBorder};
  margin-bottom: 6px;
}

.ft-mega__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* Items render as the shared .mkt-menu-card (see FreeToolsItem) so their
   size + badge + hover match the Products/Resources dropdown exactly. */

/* Portal-gated member icon — 22px circular ghost button rendered inline
   after the title text. Fixed 22x22 size + flexShrink:0 makes title-overlap
   IMPOSSIBLE at any viewport: the title ellipses while the circle stays
   stable. Clicking navigates to /login (not the gated tool). */
.ft-mega__lock {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid ${mkt.onDarkBorder};
  background: transparent;
  color: ${mkt.onDarkMuted};
  cursor: pointer;
  padding: 0;
  /* Reset button UA defaults */
  appearance: none;
  -webkit-appearance: none;
  line-height: 1;
  transition: color 180ms ease, border-color 180ms ease;
}
.ft-mega__lock:hover,
.mkt-menu-card:hover .ft-mega__lock {
  color: ${mkt.accent};
  border-color: ${mkt.accent};
}

.ft-mega__more {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 9px;
  border-radius: 8px;
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${mkt.onDarkMuted};
  text-decoration: none;
  border: 1px solid transparent;
  transition: color 180ms ease, border-color 180ms ease, background 180ms ease;
}
.ft-mega__more:hover {
  color: ${mkt.accent};
  border-color: ${mkt.onDarkBorder};
  background: rgba(255, 255, 255, 0.04);
}
.ft-mega__more-arrow {
  font-size: 12px;
  transition: transform 200ms ease;
}
.ft-mega__more:hover .ft-mega__more-arrow {
  transform: translateX(2px);
}

/* In-place fold — the long-tail items unfold below the primary set via the
   grid 0fr→1fr technique (no fixed max-height, no JS measurement). */
.ft-mega__collapse {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}
.ft-mega__collapse[data-open="true"] {
  grid-template-rows: 1fr;
}
.ft-mega__collapse > div {
  overflow: hidden;
  min-height: 0;
}
.ft-mega__list--more {
  padding-top: 8px;
}

/* "Show N more" / "Show less" — in-place expander toggle. Keyboard-operable
   <button>, aria-expanded + aria-controls wired in the component. */
.ft-mega__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 9px;
  border-radius: 8px;
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${mkt.onDarkMuted};
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: color 180ms ease, border-color 180ms ease, background 180ms ease;
}
.ft-mega__toggle:hover {
  color: ${mkt.accent};
  border-color: ${mkt.onDarkBorder};
  background: rgba(255, 255, 255, 0.04);
}
.ft-mega__toggle-icon {
  transition: transform 200ms ease;
}
.ft-mega__toggle-icon.is-open {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .ft-mega__collapse { transition: none; }
  .ft-mega__toggle-icon { transition: none; }
}

.ft-mega__seeall {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 11px 14px;
  border-radius: 10px;
  font-family: 'DM Mono', monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 1);
  text-decoration: none;
  /* Base: solid transparent border (1px slot reserved — no layout jump on hover).
     Background stays accent-blue. On hover the border reveals as white per
     Alex's spec; background darkens slightly for depth. */
  border: 1px solid transparent;
  background: ${mkt.accent};
  transition: background 150ms ease, border-color 150ms ease;
}
.ft-mega__seeall:hover {
  background: rgba(13, 60, 252, 0.85);
  border-color: rgba(255, 255, 255, 0.9);
}
.ft-mega__seeall-arrow {
  font-size: 14px;
  transition: transform 200ms ease;
}
.ft-mega__seeall:hover .ft-mega__seeall-arrow {
  transform: translateX(3px);
}
`;
