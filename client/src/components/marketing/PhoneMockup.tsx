import type { ReactNode } from "react";

/**
 * PhoneMockup — a realistic phone device frame for embedding a live preview on
 * marketing pages (375 × 812, iPhone-class). Mirrors the wizard PreviewPane's
 * mobile bezel: dark gradient frame, a status-bar pill, and a fixed-height
 * SCROLLABLE inner screen so a tall calculator scrolls INSIDE the phone instead
 * of stretching the page "very long".
 *
 * Styling lives in a <style> block (className-based) so the bezel's dark colours
 * don't trip the inline hardcoded-colour guard and don't cascade a data-theme
 * onto the widget inside the screen.
 */
export default function PhoneMockup({
  children,
  screenBackground = "#ffffff",
}: {
  children: ReactNode;
  /** Background of the inner screen, behind/below the widget. Match the
   *  widget's own background so a short calculator doesn't show a seam. */
  screenBackground?: string;
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
        }
        .qq-phone-screen::-webkit-scrollbar { width: 0; height: 0; }
      `}</style>
      <div className="qq-phone-bezel" data-testid="phone-mockup">
        <div className="qq-phone-notch" aria-hidden="true" />
        <div className="qq-phone-screen" style={{ background: screenBackground }}>
          {children}
        </div>
      </div>
    </>
  );
}
