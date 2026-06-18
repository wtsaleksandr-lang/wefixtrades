import type { ReactNode } from "react";

/**
 * PhoneMockup — a realistic phone device frame for embedding a live preview on
 * marketing pages (375 × 812, iPhone-class). Mirrors the wizard PreviewPane's
 * mobile bezel: dark gradient frame, a status-bar pill, and a fixed-height
 * SCROLLABLE inner screen so a tall calculator scrolls INSIDE the phone instead
 * of stretching the page "very long".
 *
 * Desktop-only (the marketing page renders the bare widget on real phones), so
 * scrolling is mouse-wheel. The marketing site runs Lenis smooth-scroll, which
 * hijacks the wheel globally and would scroll the PAGE instead of the phone —
 * `data-lenis-prevent` tells Lenis to leave wheels over the screen alone so the
 * native overflow:auto scroll works (same mechanism the category list uses).
 * The scrollbar is fully hidden so it never shows as a line at the rounded
 * corner.
 *
 * Bezel styling lives in a <style> block (className-based) so the dark colours
 * don't trip the inline hardcoded-colour guard and don't cascade a data-theme
 * onto the widget inside the screen.
 */
export default function PhoneMockup({
  children,
  screenBackground = "#ffffff",
  floater,
}: {
  children: ReactNode;
  /** Background of the inner screen, behind/below the widget. Match the
   *  widget's own background so a short calculator doesn't show a seam. */
  screenBackground?: string;
  /** Optional element pinned to the screen (e.g. a chat launcher) — rendered
   *  INSIDE the bezel but OUTSIDE the scroll area, so it floats over the phone
   *  screen and stays put while the content scrolls, like a real fixed bubble. */
  floater?: ReactNode;
}) {
  return (
    <>
      <style>{`
        .qq-phone-bezel {
          position: relative;
          width: 375px;
          max-width: 100%;
          height: 812px;
          max-height: 812px;
          background: linear-gradient(160deg, #1e293b, #0f172a);
          border-radius: 44px;
          padding: 12px 10px;
          box-sizing: border-box;
          overflow: clip;
          display: flex;
          flex-direction: column;
          box-shadow: 0 22px 48px rgba(15,23,42,0.30), inset 0 0 0 1px rgba(255,255,255,0.06);
        }
        .qq-phone-notch {
          height: 5px;
          width: 42px;
          border-radius: 3px;
          background: rgba(255,255,255,0.22);
          margin: 0 auto 9px;
          flex-shrink: 0;
        }
        .qq-phone-screen {
          border-radius: 34px;
          overflow: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          flex: 1;
          min-height: 0;
          position: relative;
          /* Hide the scrollbar on every engine — it otherwise shows as a dark
             line at the rounded top-right corner. */
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .qq-phone-screen::-webkit-scrollbar { width: 0; height: 0; display: none; }
      `}</style>
      <div className="qq-phone-bezel" data-testid="phone-mockup">
        <div className="qq-phone-notch" aria-hidden="true" />
        {/* Reserve bottom space when a floater is present so the content's last
            element (the CTA) can't scroll under the pinned launcher. */}
        <div className="qq-phone-screen" data-lenis-prevent style={{ background: screenBackground, paddingBottom: floater ? 92 : 0 }}>
          {children}
        </div>
        {/* floater (e.g. chat launcher) self-positions absolutely; the bezel is
            the positioned ancestor, so it pins over the screen and never
            scrolls with the content. */}
        {floater}
      </div>
    </>
  );
}
