/**
 * Top-of-page announcement banner — DOSS-style saturated blue strip.
 * This is the ONE place where the brand blue acts as the primary visual
 * accent (everywhere else, blue is decorative and primary CTAs are
 * cream off-white).
 *
 * Hidden by default. Activates when both:
 *   1. The user has not dismissed it (localStorage flag), AND
 *   2. The runtime build defines a banner config (env var or config flag).
 *
 * To run announcement copy through this banner, set
 * `VITE_ANNOUNCEMENT_BANNER` in the build environment to a JSON-encoded
 * object: `{"text":"…","ctaText":"…","ctaHref":"/…"}`. When the var is
 * unset/empty, the banner does not render — no layout impact.
 *
 * Dismissal persists via localStorage key `wft-announcement-dismissed`,
 * keyed on the banner text so a new announcement re-shows for users who
 * previously dismissed the old one.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { X, ArrowRight } from "lucide-react";
import { mkt } from "@/theme/tokens";

interface AnnouncementConfig {
  text: string;
  ctaText?: string;
  ctaHref?: string;
}

function parseConfig(): AnnouncementConfig | null {
  const raw = (import.meta as any)?.env?.VITE_ANNOUNCEMENT_BANNER;
  if (!raw || typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.text === "string" && parsed.text.trim()) return parsed;
  } catch { /* invalid JSON — banner stays hidden */ }
  return null;
}

const STORAGE_KEY = "wft-announcement-dismissed";

export default function AnnouncementBanner() {
  const config = useMemo(parseConfig, []);
  const dismissKey = config ? `${STORAGE_KEY}:${config.text}` : null;
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (!dismissKey || typeof window === "undefined") return false;
    return window.localStorage.getItem(dismissKey) === "1";
  });

  useEffect(() => {
    if (!dismissKey) return;
    setDismissed(window.localStorage.getItem(dismissKey) === "1");
  }, [dismissKey]);

  /* S7 fix — publish the banner's rendered height as `--wft-announcement-h`
   * on the document root. The fixed MarketingNav reads this var for its `top`
   * offset, so the sticky header sits BELOW the banner instead of painting
   * over it (the bug: on waitlist/announcement pages the banner rendered
   * behind the header — logo overlap, clipped/unreadable text on mobile).
   * The banner itself is position:sticky (see the style block below) so the
   * offset stays valid while scrolling. Kept in sync on resize (the strip
   * wraps to 2 lines at phone widths, changing its height). Reset to 0 when
   * the banner is absent/dismissed so the nav returns flush to the top. */
  const bannerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    const el = bannerRef.current;
    if (!config || dismissed || !el) {
      root.style.setProperty("--wft-announcement-h", "0px");
      return;
    }
    const publish = () => {
      root.style.setProperty("--wft-announcement-h", `${el.offsetHeight}px`);
    };
    publish();
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(publish) : null;
    ro?.observe(el);
    window.addEventListener("resize", publish);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", publish);
      root.style.setProperty("--wft-announcement-h", "0px");
    };
  }, [config, dismissed]);

  if (!config || dismissed) return null;

  const onDismiss = () => {
    setDismissed(true);
    if (dismissKey) {
      try { window.localStorage.setItem(dismissKey, "1"); } catch { /* private mode */ }
    }
  };

  return (
    <div
      ref={bannerRef}
      role="region"
      aria-label="Site announcement"
      data-theme="dark"
      style={{
        /* S7 fix — sticky above the fixed header (zIndex 9992 > nav's 9991)
         * and pinned to the very top so the header's `top` offset stays
         * valid on scroll. In normal flow it still reserves its own height,
         * so page content is pushed down exactly as before. */
        position: "sticky",
        top: 0,
        zIndex: 9992,
        background: mkt.accent,
        color: "#FFFFFF",
        padding: "8px 16px",
        fontSize: 14,
        fontWeight: 500,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <span>{config.text}</span>
      {config.ctaText && config.ctaHref && (
        <Link
          href={config.ctaHref}
          style={{
            color: "#FFFFFF",
            fontWeight: 500,
            textDecoration: "underline",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {config.ctaText} <ArrowRight size={14} />
        </Link>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss announcement"
        style={{
          marginLeft: 8,
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.85)",
          cursor: "pointer",
          padding: 4,
          display: "inline-flex",
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
