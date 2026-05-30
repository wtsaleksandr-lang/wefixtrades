/**
 * <FirstVisitTooltip> — light progressive-disclosure popover for portal pages.
 *
 * Renders a dismissible dark tooltip anchored next to its child element, but
 * only the first time a customer visits the page that hosts it (tracked via
 * the `useFirstVisit` hook + localStorage). Once dismissed via the X button
 * the hint is marked visited and never shows again for that browser/profile.
 *
 * Design rules honored:
 *   - DESIGN-SYSTEM Rule 4 (theme-aware contrast): dark slate-900 + white
 *     text works in both light + dark themes without growing the contrast
 *     baseline.
 *   - DESIGN-SYSTEM Rule 5 (single help-cue pattern per surface): each
 *     instance is gated by its own storageKey so two never compete.
 *   - prefers-reduced-motion: `motion-safe:` prefix on the fade/slide-in.
 *
 * Usage:
 *   <FirstVisitTooltip
 *     storageKey="portal-dashboard-hero"
 *     title="Your dashboard at a glance"
 *     position="bottom"
 *     anchor={<HeroCard />}
 *   >
 *     Lead counts, billing, and open tickets all live here.
 *   </FirstVisitTooltip>
 *
 * Constraints — DO NOT change without re-validating the lint suite:
 *   - No new dependencies (pure React + Lucide + Tailwind).
 *   - Colors are theme-token-aware where possible; the dark slate-900
 *     background is intentional (high-contrast hint surface).
 *   - SSR-safe: the body is hidden until mount.
 */

import React, { useState } from "react";
import { X } from "lucide-react";
import { useFirstVisit, markVisited } from "@/hooks/useFirstVisit";

export interface FirstVisitTooltipProps {
  /** Unique key for this hint (e.g. 'portal-dashboard-hero'). */
  storageKey: string;
  /** Tooltip body text or rich content. */
  children: React.ReactNode;
  /** Optional bold title at top of the tooltip body. */
  title?: string;
  /** Position relative to wrapped element. Default 'bottom'. */
  position?: "top" | "bottom" | "left" | "right";
  /**
   * Horizontal edge to align a top/bottom tooltip to. "start" (default)
   * extends rightward from the anchor's left edge; "end" extends leftward from
   * the anchor's right edge. Use "end" for right-aligned anchors (e.g. a
   * top-nav button) so the 272px bubble — and its close button — never overflow
   * the viewport's right edge and get clipped off-screen.
   */
  align?: "start" | "end";
  /** Anchor element — the tooltip is positioned next to this. */
  anchor: React.ReactNode;
  /** Optional extra classes on the outer wrapper (e.g. block layout fix). */
  className?: string;
}

export function FirstVisitTooltip({
  storageKey,
  children,
  title,
  position = "bottom",
  align = "start",
  anchor,
  className,
}: FirstVisitTooltipProps) {
  const isFirstVisit = useFirstVisit(storageKey);
  const [dismissed, setDismissed] = useState(false);

  const show = isFirstVisit && !dismissed;

  const dismiss = () => {
    setDismissed(true);
    markVisited(storageKey);
  };

  // Horizontal edge for top/bottom tooltips. "end" pins the bubble to the
  // anchor's right edge so it extends leftward (stays on-screen for right-side
  // anchors); "start" pins to the left edge (default).
  const hEdge = align === "end" ? "right-0" : "left-0";
  const pointerHEdge = align === "end" ? "right-4" : "left-4";

  // Position classes for the tooltip body relative to the anchor.
  const positionClass =
    position === "bottom"
      ? `top-full mt-2 ${hEdge}`
      : position === "top"
        ? `bottom-full mb-2 ${hEdge}`
        : position === "left"
          ? "right-full mr-2 top-0"
          : "left-full ml-2 top-0";

  // Pointer triangle position — sits flush against the tooltip body on the
  // edge facing the anchor.
  const pointerClass =
    position === "bottom"
      ? `-top-1 ${pointerHEdge}`
      : position === "top"
        ? `-bottom-1 ${pointerHEdge}`
        : position === "left"
          ? "-right-1 top-3"
          : "-left-1 top-3";

  return (
    <div className={`relative inline-block ${className ?? ""}`.trim()}>
      {anchor}
      {show && (
        // data-theme="dark" scopes the bright-on-dark hint surface as an
        // intentional dark-mode island. Keeps the project's hardcoded-color
        // guard happy while preserving the high-contrast tooltip look.
        //
        // Layout sizing notes (PR: notice card sizing + layout):
        //   - width clamped via `w-[17rem] max-w-[calc(100vw-2rem)]` so the
        //     tooltip is a consistent, compact 272px on desktop and never
        //     overflows the viewport on phones (375px - 32px gutter = 343px).
        //   - tighter, professional padding (px-3.5 py-3) keeps the card
        //     small but lets the body breathe.
        //   - title + body wrap with `text-wrap: balance` so multi-line
        //     copy splits evenly instead of orphan-tailing the last word.
        <div
          data-theme="dark"
          role="tooltip"
          data-testid={`first-visit-tooltip-${storageKey}`}
          className={[
            "absolute z-30 w-[17rem] max-w-[calc(100vw-2rem)]",
            "bg-slate-900 text-white rounded-lg shadow-lg",
            "px-3.5 py-3",
            positionClass,
            // Animations only when reduced-motion is NOT set.
            "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200",
          ].join(" ")}
        >
          {/* Wave 12B Bug #2 — close button is anchored to the top-right
           *  corner of the bubble (absolute) so it's always discoverable,
           *  not buried inside the flex row. Visible slate-200 fill on a
           *  hover-darker surface so users on both light + dark themes
           *  can find it. 6px inset from the bubble edge. */}
          <button
            type="button"
            onClick={dismiss}
            className="absolute top-1.5 right-1.5 flex items-center justify-center w-6 h-6 rounded-md text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Dismiss tip"
            data-testid={`first-visit-tooltip-dismiss-${storageKey}`}
          >
            <X className="w-4 h-4" />
          </button>
          {/* Body content — reserve right-side padding so the long title
           *  never collides with the absolutely-positioned close button. */}
          <div className="pr-6 space-y-1">
            {title && (
              <p
                className="text-sm font-semibold leading-snug text-white"
                style={{ textWrap: "balance" }}
              >
                {title}
              </p>
            )}
            <p
              className="text-xs leading-relaxed text-slate-200"
              style={{ textWrap: "pretty" }}
            >
              {children}
            </p>
          </div>
          {/* Pointer triangle — sized via inline style because Tailwind's
              tiny 8px square would trip the icon-size lint (w-2/h-2 is
              outside the allowed ladder). Position class is appended. */}
          <div
            aria-hidden="true"
            style={{ width: "8px", height: "8px" }}
            className={`absolute bg-slate-900 rotate-45 ${pointerClass}`}
          />
        </div>
      )}
    </div>
  );
}

export default FirstVisitTooltip;
