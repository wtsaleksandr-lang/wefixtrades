import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { Link, useLocation } from "wouter";
import { Plus, ChevronDown, Lock } from "lucide-react";
import type { NavItemChild, NavSubgroup } from "@/site/navigation";
import { TRADES } from "@/site/trades";
import { NavIcon } from "./NavIcon";
import { mkt } from "@/theme/tokens";

export function MobileNavItem({
  label,
  href,
  children,
  subgroups,
  isActive,
  onClose,
}: {
  label: string;
  href: string;
  children?: NavItemChild[];
  /** Wave 14 — when set, the mobile accordion renders nested
   *  sub-accordions, one per sub-category, instead of a flat card
   *  list. Used by the Free Tools entry. */
  subgroups?: NavSubgroup[];
  isActive: boolean;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pressedHref, setPressedHref] = useState<string | null>(null);
  // Solutions "Find your trade" typeahead (mobile). Filters ALL 40 TRADES by
  // label/shortLabel; a non-empty query hides the featured cards and shows a
  // compact result list.
  const [tradeQuery, setTradeQuery] = useState("");
  const isSolutions = label === "Solutions";
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const hasSubgroups = !!(subgroups && subgroups.length > 0);
  const hasDropdown = hasSubgroups || (children && children.length > 0);

  // Measure content height before first paint so the transition target is ready
  useLayoutEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [children, subgroups]);

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

  // FIX (clipping): when a nested MobileSubgroup accordion expands, the parent
  // content grows taller — but the parent maxHeight was measured once and would
  // clip the newly-revealed sub-items. A ResizeObserver on the content element
  // re-measures whenever nested content grows/shrinks, so the parent always
  // unfolds to its full height and nothing is cut off.
  useEffect(() => {
    const el = contentRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setContentHeight(el.scrollHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
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
              size={14}
              strokeWidth={2.5}
              style={{
                transition: "transform 0.22s ease, opacity 0.2s ease",
                transform: expanded ? "rotate(45deg)" : "rotate(0deg)",
                color: mkt.accentOnDark,
                opacity: 1,
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
              {hasSubgroups ? (
                <>
                  {subgroups!.map((group) => (
                    <MobileSubgroup
                      key={group.heading}
                      group={group}
                      pressedHref={pressedHref}
                      onTap={handleCardTap}
                    />
                  ))}
                  <Link
                    href={href}
                    onClick={onClose}
                    data-testid="nav-free-tools-see-all-mobile"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      marginTop: 8,
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: mkt.accent,
                      border: `1px solid ${mkt.accent}`,
                      color: mkt.onDark,
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase" as const,
                      textDecoration: "none",
                    }}
                  >
                    See all free tools <span aria-hidden>{"→"}</span>
                  </Link>
                </>
              ) : (
                <>
                {/* Solutions "Find your trade" typeahead — searches ALL 40
                    TRADES; a query hides the featured cards below and shows a
                    compact result list. */}
                {isSolutions && (
                  <div style={{ marginBottom: 8 }}>
                    <label
                      htmlFor="mobile-trade-search"
                      style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}
                    >
                      Find your trade
                    </label>
                    <input
                      id="mobile-trade-search"
                      type="text"
                      role="combobox"
                      aria-expanded={tradeQuery.trim().length > 0}
                      aria-controls="mobile-trade-results"
                      aria-autocomplete="list"
                      placeholder="Find your trade…"
                      value={tradeQuery}
                      onChange={(e) => setTradeQuery(e.target.value)}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "11px 12px",
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.06)",
                        border: `1px solid ${mkt.border}`,
                        color: mkt.text,
                        fontFamily: "'DM Mono', monospace",
                        fontSize: 13,
                        fontWeight: 450,
                        letterSpacing: "0.02em",
                        outline: "none",
                      }}
                    />
                  </div>
                )}
                {isSolutions && tradeQuery.trim() ? (
                  (() => {
                    const query = tradeQuery.trim().toLowerCase();
                    const results = TRADES.filter(
                      (t) =>
                        t.label.toLowerCase().includes(query) ||
                        t.shortLabel.toLowerCase().includes(query),
                    );
                    if (results.length === 0) {
                      return (
                        <div
                          style={{
                            padding: "10px 4px",
                            fontFamily: "'DM Mono', monospace",
                            fontSize: 12.5,
                            color: mkt.textMuted,
                          }}
                        >
                          No trades match “{tradeQuery.trim()}”.
                        </div>
                      );
                    }
                    return (
                      <div id="mobile-trade-results" role="listbox" aria-label="Matching trades">
                        {results.map((t) => (
                          <a
                            key={t.slug}
                            href={`/solutions/${t.slug}`}
                            role="option"
                            aria-selected={false}
                            onClick={handleCardTap(`/solutions/${t.slug}`)}
                            className={`mkt-menu-card mkt-menu-card--mobile${pressedHref === `/solutions/${t.slug}` ? " mkt-menu-card--pressed" : ""}`}
                            style={{
                              display: "flex",
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 14,
                              padding: "10px 10px",
                              marginBottom: 6,
                              borderRadius: 14,
                              textDecoration: "none",
                              // Selected/pressed result echoes the desktop
                              // active treatment: a subtle accent tint + a
                              // clean, complete inset accent ring (inside the
                              // box, follows the 14px radius, never clipped).
                              background:
                                pressedHref === `/solutions/${t.slug}`
                                  ? mkt.accentTint
                                  : "rgba(255,255,255,0.04)",
                              border: `1px solid ${mkt.border}`,
                              boxShadow:
                                pressedHref === `/solutions/${t.slug}`
                                  ? `inset 0 0 0 1px ${mkt.accentOnDark}`
                                  : undefined,
                            }}
                          >
                            <div
                              className="mkt-menu-card-icon"
                              style={{ color: mkt.accent, flexShrink: 0 }}
                              aria-hidden
                            >
                              <NavIcon icon={t.icon} />
                            </div>
                            <div
                              style={{
                                minWidth: 0,
                                fontSize: 13,
                                fontWeight: 650,
                                color: mkt.text,
                                lineHeight: 1.15,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                textAlign: "left",
                              }}
                            >
                              {t.label}
                            </div>
                          </a>
                        ))}
                      </div>
                    );
                  })()
                ) : (
                children!.map(({ label: cl, href: ch, description, icon }) => (
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
                ))
                )}
                </>
              )}
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

/* ─── MobileSubgroup ───────────────────────────────────────────
 * Wave 14 — collapsible sub-accordion inside the mobile Free Tools
 * sheet, one per sub-category. Each item taps through to its tool URL
 * via the parent's `onTap` handler so the menu auto-closes on
 * navigation (Wave 12B pattern). */
function MobileSubgroup({
  group,
  pressedHref,
  onTap,
}: {
  group: NavSubgroup;
  pressedHref: string | null;
  onTap: (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const [open, setOpen] = useState(false);
  const innerRef = useRef<HTMLDivElement>(null);
  const [innerHeight, setInnerHeight] = useState(0);

  useLayoutEffect(() => {
    if (innerRef.current) {
      setInnerHeight(innerRef.current.scrollHeight);
    }
  }, [group.items, open]);

  return (
    <div
      style={{
        marginBottom: 6,
        borderRadius: 12,
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${mkt.border}`,
        overflow: "hidden",
      }}
    >
      <button
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "10px 12px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: mkt.onDarkMuted,
          textAlign: "left",
        }}
      >
        {group.heading}
        <ChevronDown
          size={15}
          strokeWidth={2.25}
          style={{
            transition: "transform 0.22s ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            color: mkt.accentOnDark,
            flexShrink: 0,
          }}
        />
      </button>
      <div
        aria-hidden={!open}
        style={{
          maxHeight: open ? innerHeight : 0,
          overflow: "hidden",
          transition: "max-height 0.28s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <div ref={innerRef} style={{ padding: "2px 10px 10px" }}>
          {group.items.map(({ label: cl, href: ch, icon, portalGated }) => (
            <a
              key={ch + cl}
              href={ch}
              onClick={onTap(ch)}
              className={`mkt-menu-card mkt-menu-card--mobile${pressedHref === ch ? " mkt-menu-card--pressed" : ""}`}
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: "9px 10px",
                marginBottom: 4,
                borderRadius: 10,
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
                  flex: 1,
                  minWidth: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color: mkt.text,
                  lineHeight: 1.15,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  textAlign: "left",
                }}
              >
                {cl}
              </div>
              {portalGated && (
                // Sign-in cue so logged-out users aren't silently bounced.
                <span
                  aria-label="Sign in required"
                  title="Sign in required — opens in your portal"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    flexShrink: 0,
                    padding: "2px 7px",
                    borderRadius: 999,
                    border: `1px solid ${mkt.border}`,
                    color: mkt.textMuted,
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 9.5,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    lineHeight: 1,
                  }}
                >
                  <Lock size={12} strokeWidth={2.4} aria-hidden />
                  Sign in
                </span>
              )}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
