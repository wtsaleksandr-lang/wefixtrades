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
import type { NavItemChild } from "@/site/navigation";
import { NavIcon } from "@/components/marketing/navigation/NavIcon";
import { ToolsRichCards } from "@/components/marketing/navigation/ToolsRichCards";
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
  placement = "below",
}: {
  setActive: (item: string | null) => void;
  active: string | null;
  item: string;
  href?: string;
  children?: NavItemChild[];
  /** Where the dropdown panel renders relative to the trigger row.
   *  "below" (default) is used by the top nav; "above" is used by the
   *  bottom sticky toolbar so the panel rises from the bar instead. */
  placement?: "below" | "above";
}) => {
  const hasChildren = !!(children && children.length > 0);
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
            size={11}
            strokeWidth={2}
            style={{
              transition: "transform 0.22s ease, opacity 0.2s ease",
              transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
              opacity: 0.95,
              color: mkt.accent,
            }}
          />
        </motion.button>
      ) : (
        <Link
          href={href || "#"}
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
              width: Math.min(1080, rect.width),
              maxWidth: "calc(100vw - 24px)",
              zIndex: 9999,
            }}
          >
            <motion.div
              transition={transition}
              layoutId="active"
              className="mkt-dropdown-tray"
              style={{
                padding: item === "Tools" ? 12 : 10,
                display: item === "Tools" ? "block" : "grid",
                ...(item === "Tools"
                  ? {}
                  : { gridTemplateColumns: "repeat(3, 1fr)", gridAutoFlow: "row", gap: 8 }),
                boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
              }}
            >
              {item === "Tools" ? (
                /* Effortel-style rich layout — only used for Tools (3
                   items, so each card has full real estate for a
                   heading + subtitle + an inline product preview SVG).
                   Wave 12B Bug #3: pass onNavigate so each card click
                   closes the dropdown immediately (the menu used to
                   linger open after navigating). */
                <ToolsRichCards items={children!} onNavigate={() => setActive(null)} />
              ) : (
                <motion.div layout style={{ display: "contents" }}>
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
                          // Force all dropdown grid icons to render in a
                          // single light color. The lucide icons inherit
                          // stroke from currentColor, so setting `color`
                          // here governs every icon (workflow, sparkles,
                          // target, layers, etc.) uniformly. Previously
                          // they used mkt.accent (#0d3cfc) which on the
                          // dark dropdown surface made low-ink icons
                          // (ContentFlow/AdFlow/BookFlow) look darker
                          // than higher-ink icons.
                          style={{ color: "rgba(255,255,255,0.92)" }}
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
