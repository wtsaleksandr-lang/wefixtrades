import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Link } from "wouter";
import { Plus } from "lucide-react";
import type { NavItemChild, NavSubgroup } from "@/site/navigation";
import { NavIcon } from "@/components/marketing/navigation/NavIcon";
import { ToolsRichCards } from "@/components/marketing/navigation/ToolsRichCards";
import { FreeToolsMegaPanel } from "@/components/marketing/navigation/FreeToolsMegaPanel";
import { mkt } from "@/theme/tokens";
import type { CSSProperties } from "react";

// ── Animation config ─────────────────────────────────────────────────────────
const transition = {
  type: "spring" as const,
  mass: 0.5,
  damping: 11.5,
  stiffness: 100,
  restDelta: 0.001,
  restSpeed: 0.001,
};

// ── Menu context (shared between Menu + MenuItem) ────────────────────────────
interface MenuCtx {
  containerRef: React.RefObject<HTMLDivElement>;
  scheduleClose: () => void;
  cancelClose: () => void;
}
const MenuContext = createContext<MenuCtx | null>(null);

// ── Visual styles (from DesktopNavItem) ──────────────────────────────────────
const topItemBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "5px 10px",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "'DM Mono', monospace",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: mkt.text,
  background: "transparent",
  border: "1px solid transparent",
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "background 0.18s ease, border-color 0.18s ease",
};

const topHoverOn = (el: HTMLElement) => {
  el.style.background = "rgba(255,255,255,0.06)";
  el.style.borderColor = "rgba(255,255,255,0.12)";
};

const topHoverOff = (el: HTMLElement) => {
  el.style.background = "transparent";
  el.style.borderColor = "transparent";
};

// ── MenuItem ─────────────────────────────────────────────────────────────────
export const MenuItem = ({
  setActive,
  active,
  item,
  href,
  children,
  subgroups,
  footer,
  placement = "below",
}: {
  setActive: (item: string | null) => void;
  active: string | null;
  item: string;
  href?: string;
  children?: NavItemChild[];
  /** Wave 14 — when set, the dropdown renders a multi-column mega-menu
   *  (FreeToolsMegaPanel) instead of the default icon-grid. Used by the
   *  Free Tools nav item so the navbar unfolds inline. */
  subgroups?: NavSubgroup[];
  /** Optional wayfinding pills rendered as a full-width row below the
   *  card grid (hairline separator above). Data-driven from
   *  navigation.ts so each dropdown declares its own CTAs. */
  footer?: { label: string; href: string }[];
  /** Where the dropdown panel renders relative to the trigger row.
   *  "below" (default) is used by the top nav; "above" is used by the
   *  bottom sticky toolbar so the panel rises from the bar instead. */
  placement?: "below" | "above";
}) => {
  const hasSubgroups = !!(subgroups && subgroups.length > 0);
  const hasChildren = !!(children && children.length > 0) || hasSubgroups;
  const isOpen = active === item;
  const ctx = useContext(MenuContext);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [vh, setVh] = useState<number>(typeof window !== "undefined" ? window.innerHeight : 0);

  useEffect(() => {
    if (!isOpen || !ctx?.containerRef.current) {
      setRect(null);
      return;
    }
    const measure = () => {
      setRect(ctx.containerRef.current!.getBoundingClientRect());
      setVh(window.innerHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isOpen, ctx]);

  return (
    // Only items with a dropdown should activate the nav menu state.
    // Top-level direct links (Templates, Pricing) must NOT set `active`,
    // otherwise the page-blur backdrop in <Menu> opens for them too —
    // leaving the user with a blurred page and nothing to click. The
    // backdrop is gated on `active` so gating the setter here is the
    // simplest fix without threading a new prop.
    <div onMouseEnter={() => (hasChildren ? setActive(item) : setActive(null))}>
      {hasChildren ? (
        <motion.button
          transition={{ duration: 0.3 }}
          style={{ ...topItemBase, margin: 0 }}
          onMouseEnter={(e) => topHoverOn(e.currentTarget as HTMLElement)}
          onMouseLeave={(e) => topHoverOff(e.currentTarget as HTMLElement)}
          aria-expanded={isOpen}
          aria-haspopup="true"
        >
          {item}
          <Plus
            size={12}
            strokeWidth={2.5}
            style={{
              transition: "transform 0.22s ease, opacity 0.2s ease",
              transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
              opacity: 1,
              color: mkt.accentOnDark,
            }}
          />
        </motion.button>
      ) : (
        <Link
          href={href ?? "/"}
          data-testid={`nav-link-${item.toLowerCase()}`}
          style={{ ...topItemBase, textDecoration: "none" }}
          onMouseEnter={(e) => topHoverOn(e.currentTarget as HTMLElement)}
          onMouseLeave={(e) => topHoverOff(e.currentTarget as HTMLElement)}
        >
          {item}
        </Link>
      )}

      {/* Dropdown — portaled to body, fixed positioning */}
      {isOpen &&
        hasChildren &&
        rect &&
        ctx &&
        createPortal(
          <motion.div
            initial={{ opacity: 0, y: placement === "above" ? -10 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition}
            onMouseEnter={ctx.cancelClose}
            onMouseLeave={ctx.scheduleClose}
            style={{
              position: "fixed",
              left: rect.left + rect.width / 2,
              ...(placement === "above"
                ? { bottom: Math.max(0, vh - rect.top + 6) }
                : { top: rect.bottom + 6 }),
              transform: "translateX(-50%)",
              // Wave 14: Free Tools mega-menu fixes a 720px width so the
              // 3 sub-category columns each have ~220px of headroom
              // without sprawling across the whole viewport. Other menus
              // continue to inherit the trigger-row width.
              // Floor the panel width at 720 so the 3-col card grid has room
              // even when the trigger row is narrow (e.g. the bottom sticky
              // bar) — otherwise long product titles clip ("MapGuar…").
              width: hasSubgroups
                ? Math.min(720, Math.max(rect.width, 720))
                : Math.min(1080, Math.max(rect.width, 720)),
              maxWidth: "calc(100vw - 24px)",
              zIndex: 9999,
            }}
          >
            <motion.div
              transition={transition}
              layoutId="active"
              className="mkt-dropdown-tray"
              style={{
                padding: item === "Tools" || hasSubgroups ? 16 : 10,
                // The cards grid lives on an inner div (below); the tray
                // itself stays block so the footer CTA row can span the
                // full panel width as a sibling of the grid. The footer
                // must stay INSIDE this layoutId element — as a sibling
                // of the tray it escapes framer-motion's transform and
                // renders 360px offscreen-right (caught by measurement).
                display: "block",
                boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
              }}
            >
              {hasSubgroups ? (
                /* Wave 14: Free Tools mega-menu unfold panel — 3 columns
                   (Local SEO / AI Content / Widgets) + "See all" link.
                   Hub page /free-tools stays canonical for SEO + full
                   detail; this panel is purely a navigational preview. */
                <FreeToolsMegaPanel
                  subgroups={subgroups!}
                  hubHref={href || "/free-tools"}
                  onNavigate={() => setActive(null)}
                />
              ) : item === "Tools" ? (
                /* Effortel-style rich layout — only used for Tools (3
                   items, so each card has full real estate for a
                   heading + subtitle + an inline product preview SVG).
                   Wave 12B Bug #3: pass onNavigate so each card click
                   closes the dropdown immediately (the menu used to
                   linger open after navigating). */
                <ToolsRichCards items={children!} onNavigate={() => setActive(null)} />
              ) : (
                <motion.div
                  layout
                  style={{
                    display: "grid",
                    // Under-filled trays (1-2 cards, e.g. Templates)
                    // center as fixed-width columns instead of
                    // left-aligning inside an empty 3-col grid.
                    gridTemplateColumns:
                      (children?.length ?? 0) <= 2
                        ? `repeat(${children?.length ?? 1}, minmax(220px, 340px))`
                        : "repeat(3, 1fr)",
                    justifyContent: "center",
                    gridAutoFlow: "row",
                    gap: 8,
                  }}
                >
                  {children!.map(
                    ({ label, href: childHref, description, icon }) => (
                      <Link
                        key={childHref + label}
                        href={childHref}
                        className="mkt-menu-card"
                        // Wave 12B Bug #3 — close the mega-menu the moment
                        // a product link is clicked. Without this the
                        // dropdown stays open after route change and
                        // covers the page the user just navigated to.
                        onClick={() => setActive(null)}
                      >
                        <div
                          className="mkt-menu-card-icon"
                          // White square tile (see .mkt-menu-card-icon) with a
                          // brand-blue central icon. Lucide icons inherit stroke
                          // from currentColor, so this `color` drives every icon
                          // uniformly against the white badge.
                          style={{ color: mkt.accent }}
                          aria-hidden
                        >
                          <NavIcon icon={icon} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 650,
                              color: mkt.text,
                              lineHeight: 1.2,
                              marginBottom: 3,
                            }}
                          >
                            {label}
                          </div>
                          {description && (
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 450,
                                color: mkt.textMuted,
                                lineHeight: 1.35,
                              }}
                            >
                              {description}
                            </div>
                          )}
                        </div>
                      </Link>
                    ),
                  )}
                </motion.div>
              )}
              {footer && footer.length > 0 && !hasSubgroups && item !== "Tools" && (
                /* Wayfinding footer CTAs — accent-blue fill matching the Free
                   Tools "see all" button style (.ft-mega__seeall). Each button
                   gets flex:1 so one button fills the row and two split evenly.
                   Sibling of the cards grid (not inside it) so the row spans
                   the full panel width even when ≤2 centered cards constrain
                   the grid to ~688px. Must stay INSIDE the tray motion.div —
                   outside it, framer-motion's transform handling leaves the
                   row un-centered and it renders 360px offscreen-right.
                   Hover styling (bg darken + white border + arrow translate)
                   lives in .mkt-dropdown-footer-pill (index.css). */
                <div
                  style={{
                    width: "100%",
                    display: "flex",
                    flexWrap: "nowrap",
                    gap: 10,
                    marginTop: 6,
                    paddingTop: 12,
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {footer.map((f) => (
                    <Link
                      key={f.href + f.label}
                      href={f.href}
                      className="mkt-dropdown-footer-pill"
                      onClick={() => setActive(null)}
                      style={{
                        flex: "1 1 0",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        padding: "11px 14px",
                        borderRadius: 10,
                        background: mkt.accent,
                        border: "1px solid transparent",
                        fontFamily: "'DM Mono', monospace",
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase" as const,
                        color: "rgba(255,255,255,1)",
                        textDecoration: "none",
                      }}
                    >
                      {f.label}
                      <span className="mkt-dropdown-footer-pill-arrow" aria-hidden="true">→</span>
                    </Link>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>,
          document.body,
        )}
    </div>
  );
};

// ── Menu container ───────────────────────────────────────────────────────────
export const Menu = ({
  active,
  setActive,
  containerRef,
  children,
}: {
  /** Currently open menu key, or null when closed. Optional — when
   *  provided, Menu renders a page-blur backdrop while a dropdown is
   *  open so the rest of the site dims behind the panel. */
  active?: string | null;
  setActive: (item: string | null) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  children: React.ReactNode;
}) => {
  const closeTimer = useRef<number | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setActive(null), 150);
  }, [setActive, cancelClose]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const backdropOpen = !!active;

  return (
    <MenuContext.Provider value={{ containerRef, scheduleClose, cancelClose }}>
      {/* Page-blur backdrop — purely visual dimming behind the open
          dropdown. Sits below the dropdown (9990 < 9999) and above the
          rest of the page. pointerEvents stays "none" so it never
          intercepts hover/click events on the nav bar underneath; if it
          did, hit-testing would close the menu the instant it opened
          (the cursor would be considered "over the backdrop" rather
          than the trigger), causing a flicker loop. The menu closes
          via onMouseLeave on the <nav> trigger row and on the dropdown
          panel itself. */}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            aria-hidden="true"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9990,
              background: "rgba(0,0,0,0.35)",
              backdropFilter: "blur(8px) saturate(1.1)",
              WebkitBackdropFilter: "blur(8px) saturate(1.1)",
              opacity: backdropOpen ? 1 : 0,
              pointerEvents: "none",
              transition: "opacity 220ms ease",
            }}
          />,
          document.body,
        )}
      <nav
        aria-label="Main navigation"
        onMouseLeave={scheduleClose}
        onMouseEnter={cancelClose}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          flex: "0 1 auto",
        }}
      >
        {children}
      </nav>
    </MenuContext.Provider>
  );
};
