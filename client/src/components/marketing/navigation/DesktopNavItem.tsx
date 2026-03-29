import { useState, useEffect, useRef, Fragment, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import { Plus } from "lucide-react";
import type { NavItemChild } from "@/site/navigation";
import { NavIcon } from "./NavIcon";
import { mkt } from "@/theme/tokens";

const EXIT_ANIM = 220; // CSS animation duration (ms)
const EXIT_BUFFER = 240; // JS unmount delay — slightly longer than CSS to prevent flash

// Note on re-open during exit: if the user re-hovers while the tray is animating
// out, the exit is cancelled and the tray snaps back to open. A smooth reverse
// would require replacing the clip-path keyframe system with CSS transitions,
// which is disproportionate to the rarity of this edge case.

export function DesktopNavItem({
  label,
  href,
  children,
  isActive,
  headerRef,
}: {
  label: string;
  href: string;
  children?: NavItemChild[];
  isActive: boolean;
  headerRef: React.RefObject<HTMLDivElement>;
}) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasDropdown = !!(children && children.length > 0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const doOpen = () => {
    if (!hasDropdown) return;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    setExiting(false);
    setOpen(true);
    setVisible(true);
  };

  const doClose = (returnFocus = false) => {
    setOpen(false);
    setExiting(true);
    exitTimerRef.current = setTimeout(() => {
      setVisible(false);
      setExiting(false);
    }, EXIT_BUFFER);
    if (returnFocus) triggerRef.current?.focus();
  };

  const scheduleClose = () => {
    closeTimerRef.current = setTimeout(() => doClose(), 120);
  };

  const cancelClose = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  };

  const measure = () => {
    const el = headerRef.current;
    if (!el) return;
    setRect(el.getBoundingClientRect());
  };

  useEffect(() => {
    if (!visible) return;
    measure();

    const onDown = (e: MouseEvent) => {
      const inNav = ref.current && ref.current.contains(e.target as Node);
      const inTray = trayRef.current && trayRef.current.contains(e.target as Node);
      if (!inNav && !inTray) doClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") doClose(true);
    };
    const onScroll = () => doClose();
    const onResize = () => measure();

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [visible]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, []);

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

  const dropdownNode =
    hasDropdown && visible && rect
      ? createPortal(
          <Fragment>
            {/* Page blur overlay */}
            <div
              style={{
                position: "fixed",
                top: rect.bottom,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 9998,
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                background: "rgba(0,0,0,0.28)",
                animation: exiting
                  ? `mktDropdownOverlayOut ${EXIT_ANIM}ms ease-out forwards`
                  : "mktDropdownOverlayIn 0.2s ease-out forwards",
                pointerEvents: exiting ? "none" : "auto",
              }}
              onClick={() => doClose()}
            />
            <div
              ref={trayRef}
              className={`mkt-dropdown-tray${exiting ? " mkt-dropdown-tray--exit" : ""}`}
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
              style={{
                position: "fixed",
                left: rect.left + rect.width / 2,
                top: rect.bottom + 6,
                width: Math.min(1080, rect.width),
                maxWidth: "calc(100vw - 24px)",
                transform: "translateX(-50%)",
                padding: 10,
                zIndex: 9999,
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gridAutoFlow: "row",
                gap: 8,
                boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
                ...(exiting && {
                  animation: `mktDropdownOut ${EXIT_ANIM}ms cubic-bezier(0.22,1,0.36,1) forwards`,
                }),
              }}
            >
              {children!.map(({ label: cl, href: ch, description, icon }) => (
                <Link
                  key={ch + cl}
                  href={ch}
                  className="mkt-menu-card"
                  onClick={() => doClose()}
                >
                  <div
                    className="mkt-menu-card-icon"
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
                      {cl}
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
              ))}
            </div>
          </Fragment>,
          document.body,
        )
      : null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {hasDropdown ? (
        <button
          ref={triggerRef}
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => (open ? doClose() : doOpen())}
          style={topItemBase}
          onMouseEnter={(e) => {
            topHoverOn(e.currentTarget as HTMLElement);
            doOpen();
          }}
          onMouseLeave={(e) => {
            topHoverOff(e.currentTarget as HTMLElement);
            scheduleClose();
          }}
        >
          {label}
          <Plus
            size={11}
            strokeWidth={2}
            style={{
              transition: "transform 0.22s ease, opacity 0.2s ease",
              transform: open ? "rotate(45deg)" : "rotate(0deg)",
              opacity: 0.95,
              color: mkt.accent,
            }}
          />
        </button>
      ) : (
        <Link
          href={href}
          data-testid={`nav-link-${label.toLowerCase()}`}
          style={{ ...topItemBase, textDecoration: "none" }}
          onMouseEnter={(e) => topHoverOn(e.currentTarget as HTMLElement)}
          onMouseLeave={(e) => topHoverOff(e.currentTarget as HTMLElement)}
        >
          {label}
        </Link>
      )}
      {dropdownNode}
    </div>
  );
}
