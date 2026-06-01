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
import type { FC } from "react";
import type { NavItemChild, NavSubgroup } from "@/site/navigation";
import { NavIcon } from "./NavIcon";
import { mkt } from "@/theme/tokens";

interface Props {
  subgroups: NavSubgroup[];
  /** Hub page href (e.g. /free-tools) used by the bottom "See all" link. */
  hubHref: string;
  /** Called whenever a link inside the panel is clicked so the parent
   *  MenuItem can close the dropdown (Wave 12B auto-close pattern). */
  onNavigate: () => void;
}

export const FreeToolsMegaPanel: FC<Props> = ({ subgroups, hubHref, onNavigate }) => {
  const totalCount = subgroups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="ft-mega">
      <div className="ft-mega__cols">
        {subgroups.map((group) => (
          <Column key={group.heading} group={group} onNavigate={onNavigate} />
        ))}
      </div>

      <Link
        href={hubHref}
        onClick={onNavigate}
        className="ft-mega__seeall"
        data-testid="nav-free-tools-see-all"
      >
        See all {totalCount} free tools
        <span aria-hidden className="ft-mega__seeall-arrow">{"→"}</span>
      </Link>

      <style>{CSS}</style>
    </div>
  );
};

function Column({
  group,
  onNavigate,
}: {
  group: NavSubgroup;
  onNavigate: () => void;
}) {
  const cap = group.maxShown ?? 7;
  const shown = group.items.slice(0, cap);
  const hiddenCount = Math.max(0, group.items.length - cap);

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
      {hiddenCount > 0 && group.hubAnchor && (
        <Link
          href={group.hubAnchor}
          onClick={onNavigate}
          className="ft-mega__more"
        >
          + {hiddenCount} more
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
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className="ft-mega__item"
      data-testid={`nav-free-tools-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
    >
      <span className="ft-mega__item-icon" aria-hidden>
        <NavIcon icon={item.icon} size={16} strokeWidth={1.9} />
      </span>
      <span className="ft-mega__item-label">{item.label}</span>
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
  gap: 2px;
}

.ft-mega__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 9px;
  border-radius: 8px;
  border: 1px solid transparent;
  text-decoration: none;
  color: ${mkt.onDark};
  transition: background 180ms ease, border-color 180ms ease, color 180ms ease;
}
.ft-mega__item:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: ${mkt.onDarkBorder};
  color: ${mkt.onDark};
}
.ft-mega__item:focus-visible {
  outline: none;
  border-color: ${mkt.accent};
  background: rgba(13, 60, 252, 0.08);
}

.ft-mega__item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  /* White square badge + brand-blue icon — matches the product/resource
     dropdown card badges so Free Tools reads consistently. */
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(13, 60, 252, 0.18);
  color: ${mkt.accent};
  flex-shrink: 0;
  transition: border-color 180ms ease, box-shadow 180ms ease;
}
.ft-mega__item:hover .ft-mega__item-icon {
  background: ${mkt.accent};
  border-color: ${mkt.accent};
  color: rgba(255, 255, 255, 1);
  box-shadow: 0 4px 12px rgba(13, 60, 252, 0.30);
}

.ft-mega__item-label {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  border: 1px solid ${mkt.accent};
  background: ${mkt.accent};
  transition: background 180ms ease, border-color 180ms ease;
}
.ft-mega__seeall:hover {
  background: rgba(13, 60, 252, 0.85);
  border-color: ${mkt.accent};
}
.ft-mega__seeall-arrow {
  font-size: 14px;
  transition: transform 200ms ease;
}
.ft-mega__seeall:hover .ft-mega__seeall-arrow {
  transform: translateX(3px);
}
`;
