import React from "react";
import { motion } from "motion/react";
import { Link } from "wouter";
import { Plus } from "lucide-react";
import type { NavItemChild } from "@/site/navigation";
import { NavIcon } from "@/components/marketing/navigation/NavIcon";
import { mkt } from "@/theme/tokens";
import type { CSSProperties } from "react";

// ── Animation config (keep exactly as-is) ────────────────────────────────────
const transition = {
  type: "spring" as const,
  mass: 0.5,
  damping: 11.5,
  stiffness: 100,
  restDelta: 0.001,
  restSpeed: 0.001,
};

// ── Original visual styles from DesktopNavItem ───────────────────────────────
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
}: {
  setActive: (item: string | null) => void;
  active: string | null;
  item: string;
  href?: string;
  children?: NavItemChild[];
}) => {
  const hasChildren = !!(children && children.length > 0);
  const isOpen = active === item;

  return (
    <div
      onMouseEnter={() => setActive(item)}
      style={{ position: "static" }}
    >
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

      {/* ── Animated dropdown ── */}
      {active !== null && hasChildren && isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            paddingTop: "1.2rem",
            zIndex: 9999,
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={transition}
          >
            <motion.div
              transition={transition}
              layoutId="active"
              className="mkt-dropdown-tray"
              style={{
                padding: 10,
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gridAutoFlow: "row",
                gap: 8,
                boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
                maxWidth: "calc(100vw - 24px)",
                width: "max-content",
              }}
            >
              <motion.div
                layout
                style={{
                  display: "contents",
                }}
              >
                {children!.map(({ label, href: childHref, description, icon }) => (
                  <Link
                    key={childHref + label}
                    href={childHref}
                    className="mkt-menu-card"
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
                ))}
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

// ── Menu container ───────────────────────────────────────────────────────────
export const Menu = ({
  setActive,
  children,
}: {
  setActive: (item: string | null) => void;
  children: React.ReactNode;
}) => {
  return (
    <nav
      aria-label="Main navigation"
      onMouseLeave={() => setActive(null)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        flex: "0 1 auto",
      }}
    >
      {children}
    </nav>
  );
};

// ── HoveredLink (kept as utility export) ─────────────────────────────────────
export const HoveredLink = ({
  children,
  href,
  ...rest
}: {
  children: React.ReactNode;
  href: string;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
  return (
    <Link
      href={href}
      {...(rest as any)}
      style={{
        color: mkt.textMuted,
        textDecoration: "none",
        fontSize: 13,
        fontWeight: 500,
        padding: "6px 10px",
        borderRadius: 8,
        display: "block",
        transition: "color 0.15s ease, background 0.15s ease",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
        const el = e.currentTarget as HTMLElement;
        el.style.color = mkt.accent;
        el.style.background = "rgba(255,255,255,0.05)";
      }}
      onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
        const el = e.currentTarget as HTMLElement;
        el.style.color = mkt.textMuted;
        el.style.background = "transparent";
      }}
    >
      {children}
    </Link>
  );
};
