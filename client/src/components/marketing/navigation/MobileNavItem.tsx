import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { Link, useLocation } from "wouter";
import { Plus } from "lucide-react";
import type { NavItemChild } from "@/site/navigation";
import { NavIcon } from "./NavIcon";
import { mkt } from "@/theme/tokens";

export function MobileNavItem({
  label,
  href,
  children,
  isActive,
  onClose,
}: {
  label: string;
  href: string;
  children?: NavItemChild[];
  isActive: boolean;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pressedHref, setPressedHref] = useState<string | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const hasDropdown = children && children.length > 0;

  // Measure content height before first paint so the transition target is ready
  useLayoutEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [children]);

  // Re-measure on window resize (content may reflow)
  useEffect(() => {
    const handler = () => {
      if (contentRef.current) {
        setContentHeight(contentRef.current.scrollHeight);
      }
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const handleCardTap =
    (ch: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      if (pressedHref) return;
      setPressedHref(ch);
      setTimeout(() => {
        onClose();
        navigate(ch);
      }, 140);
    };

  return (
    <div
      style={{
        marginBottom: 4,
        padding: "6px 10px",
        borderRadius: 16,
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${mkt.border}`,
      }}
    >
      {hasDropdown ? (
        <>
          <button
            aria-expanded={expanded}
            onClick={() => setExpanded((o) => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "10px 0px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "'DM Mono', monospace",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: mkt.text,
              textAlign: "left",
            }}
          >
            {label}
            <Plus
              size={13}
              strokeWidth={2}
              style={{
                transition: "transform 0.22s ease, opacity 0.2s ease",
                transform: expanded ? "rotate(45deg)" : "rotate(0deg)",
                color: mkt.accent,
                opacity: 0.95,
              }}
            />
          </button>
          <div
            aria-hidden={!expanded}
            style={{
              maxHeight: expanded ? contentHeight : 0,
              overflow: "hidden",
              transition:
                "max-height 0.28s cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            <div ref={contentRef} style={{ paddingBottom: 10 }}>
              {children!.map(({ label: cl, href: ch, description, icon }) => (
                <a
                  key={ch + cl}
                  href={ch}
                  onClick={handleCardTap(ch)}
                  className={`mkt-menu-card mkt-menu-card--mobile${pressedHref === ch ? " mkt-menu-card--pressed" : ""}`}
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                    padding: "10px 10px",
                    marginBottom: 6,
                    borderRadius: 14,
                    textDecoration: "none",
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${mkt.border}`,
                  }}
                >
                  <div
                    className="mkt-menu-card-icon"
                    style={{ color: mkt.accent, flexShrink: 0 }}
                    aria-hidden
                  >
                    <NavIcon icon={icon} />
                  </div>

                  <div
                    style={{
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 650,
                        color: mkt.text,
                        lineHeight: 1.15,
                        marginBottom: 3,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        textAlign: "left",
                      }}
                    >
                      {cl}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 450,
                        color: mkt.textMuted,
                        lineHeight: 1.25,
                        textAlign: "left",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical" as const,
                      }}
                    >
                      {description ?? ""}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </>
      ) : (
        <Link
          href={href}
          onClick={onClose}
          data-testid={`nav-link-${label.toLowerCase()}-mobile`}
          style={{
            display: "block",
            padding: "10px 0px",
            fontSize: 13,
            fontWeight: 500,
            fontFamily: "'DM Mono', monospace",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: mkt.text,
            textDecoration: "none",
          }}
        >
          {label}
        </Link>
      )}
    </div>
  );
}
