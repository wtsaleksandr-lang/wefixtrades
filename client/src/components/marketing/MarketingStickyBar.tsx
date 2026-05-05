/**
 * MarketingStickyBar — fixed-bottom toolbar inspired by Effortel's
 * pill-shaped bottom nav.
 *
 * Behaviour:
 * - Hidden when scrolled near the top (the main header nav is in view)
 *   or near the footer (so it never overlaps the page footer).
 * - Smooth "pop into existence from a dot" entry/exit: scales from 0
 *   to 1 with a subtle spring curve, opacity fades alongside.
 * - Products / Solutions / Tools each open a small panel above the bar
 *   with quick links. Pricing is a direct link, Start Free is the CTA.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowUp, ArrowRight } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

interface SubItem { label: string; href: string; }

const PRODUCTS: SubItem[] = [
  { label: "24/7 TradeLine",     href: "/products/tradeline" },
  { label: "QuoteQuick Pro",     href: "/products/quickquotepro" },
  { label: "MapGuard",           href: "/products/mapguard" },
  { label: "ReputationShield",   href: "/products/reputationshield" },
  { label: "SocialSync",         href: "/products/socialsync" },
  { label: "RankFlow",           href: "/products/rankflow" },
  { label: "BookFlow",           href: "/products/bookflow" },
  { label: "AdFlow",             href: "/products/adflow" },
  { label: "View all products →", href: "/products" },
];

const SOLUTIONS: SubItem[] = [
  { label: "Plumbing",      href: "/solutions/for-plumbers" },
  { label: "HVAC",          href: "/solutions/for-hvac" },
  { label: "Electrical",    href: "/solutions/for-electricians" },
  { label: "Roofing",       href: "/solutions/for-roofers" },
  { label: "Cleaning",      href: "/solutions/for-cleaners" },
  { label: "All solutions →", href: "/products" },
];

const TOOLS: SubItem[] = [
  { label: "Free Audit",            href: "/tools/free-audit" },
  { label: "Quote Demo",            href: "/tools/quote-demo" },
  { label: "Missed Call Calculator", href: "/tools/missed-call-calculator" },
  { label: "Demo Center →",         href: "/demos" },
];

type PanelKey = "products" | "solutions" | "tools" | null;

export default function MarketingStickyBar() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState<PanelKey>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Show/hide based on scroll position (hide at top + near footer).
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const docH = document.documentElement.scrollHeight;
      const winH = window.innerHeight;
      const distFromBottom = docH - (y + winH);
      const shouldShow = y > 240 && distFromBottom > 520;
      setVisible((prev) => {
        if (!shouldShow) setOpen(null);
        return shouldShow;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Click outside an open panel closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const goTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const toggle = (which: Exclude<PanelKey, null>) =>
    setOpen((cur) => (cur === which ? null : which));

  const itemBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 9,
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.78)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textDecoration: "none",
    whiteSpace: "nowrap",
    lineHeight: 1,
    transition: "background 180ms ease, color 180ms ease",
  };
  const itemHover: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
  };
  const plusBadge: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 14, height: 14, borderRadius: 4,
    background: "rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.7)",
    fontSize: 11, fontWeight: 800,
    lineHeight: 1,
  };
  const closeBadge: React.CSSProperties = {
    ...plusBadge,
    background: "rgba(102,232,250,0.20)",
    color: mkt.accent,
  };

  return (
    <div
      ref={wrapRef}
      style={{
        position: "fixed",
        bottom: 18,
        left: "50%",
        transform: `translateX(-50%) scale(${visible ? 1 : 0})`,
        opacity: visible ? 1 : 0,
        transformOrigin: "50% 50%",
        transition: visible
          ? "transform 480ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 240ms ease"
          : "transform 320ms cubic-bezier(0.4, 0, 0.6, 1), opacity 220ms ease",
        zIndex: 80,
        pointerEvents: visible ? "auto" : "none",
      }}
      data-testid="marketing-sticky-bar"
    >
      {/* Expandable panel — sits above the bar */}
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            bottom: "calc(100% + 10px)",
            left: 0, right: 0,
            display: "flex", justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              pointerEvents: "auto",
              minWidth: 240,
              background: "rgba(20,24,27,0.96)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 14,
              padding: 8,
              boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              animation: "stickyPanelIn 220ms cubic-bezier(0.22, 1, 0.36, 1) both",
            }}
          >
            {(open === "products" ? PRODUCTS : open === "solutions" ? SOLUTIONS : TOOLS).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(null)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 12px", borderRadius: 8,
                  fontFamily: MONO, fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  color: "rgba(255,255,255,0.78)",
                  textDecoration: "none",
                  transition: "background 160ms ease, color 160ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.color = "#fff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "rgba(255,255,255,0.78)";
                }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* The bar itself */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: 6,
          background: "rgba(20,24,27,0.96)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 14,
          boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        {/* Scroll-to-top arrow */}
        <button
          onClick={goTop}
          aria-label="Scroll to top"
          style={{ ...itemBase, padding: "8px 10px", color: mkt.accent }}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, itemHover)}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            (e.currentTarget.style.color as any) = mkt.accent;
          }}
        >
          <ArrowUp size={14} strokeWidth={2.2} />
        </button>

        <ExpandableBtn
          label="Products"
          isOpen={open === "products"}
          onClick={() => toggle("products")}
          itemBase={itemBase} itemHover={itemHover}
          plusBadge={plusBadge} closeBadge={closeBadge}
        />
        <ExpandableBtn
          label="Solutions"
          isOpen={open === "solutions"}
          onClick={() => toggle("solutions")}
          itemBase={itemBase} itemHover={itemHover}
          plusBadge={plusBadge} closeBadge={closeBadge}
        />
        <ExpandableBtn
          label="Tools"
          isOpen={open === "tools"}
          onClick={() => toggle("tools")}
          itemBase={itemBase} itemHover={itemHover}
          plusBadge={plusBadge} closeBadge={closeBadge}
        />

        {/* Direct link — Pricing */}
        <Link
          href="/pricing"
          style={itemBase}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, itemHover)}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "rgba(255,255,255,0.78)";
          }}
        >
          Pricing
        </Link>

        {/* Cyan CTA — Start Free */}
        <Link
          href="/Wizard"
          style={{
            ...itemBase,
            background: mkt.accent,
            color: "#0a1018",
            padding: "9px 14px",
            borderRadius: 10,
            letterSpacing: "0.06em",
            display: "inline-flex", alignItems: "center", gap: 6,
            fontWeight: 800,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.filter = "brightness(1.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = "none";
          }}
        >
          Start Free <ArrowRight size={12} strokeWidth={2.4} />
        </Link>
      </div>

      {/* Panel-in keyframe (scoped global) */}
      <style>{`
        @keyframes stickyPanelIn {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </div>
  );
}

function ExpandableBtn({
  label, isOpen, onClick, itemBase, itemHover, plusBadge, closeBadge,
}: {
  label: string;
  isOpen: boolean;
  onClick: () => void;
  itemBase: React.CSSProperties;
  itemHover: React.CSSProperties;
  plusBadge: React.CSSProperties;
  closeBadge: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      aria-expanded={isOpen}
      style={{
        ...itemBase,
        ...(isOpen ? itemHover : {}),
      }}
      onMouseEnter={(e) => Object.assign(e.currentTarget.style, itemHover)}
      onMouseLeave={(e) => {
        if (!isOpen) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "rgba(255,255,255,0.78)";
        }
      }}
    >
      {label}
      <span aria-hidden style={isOpen ? closeBadge : plusBadge}>
        {isOpen ? "×" : "+"}
      </span>
    </button>
  );
}
