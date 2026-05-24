/**
 * DashedGridBackground — shared absolute-positioned dotted-grid overlay
 * used by Effortel-style "numbered cards" and the TradeLine phone-mockup
 * shell on /products/tradeline. Renders the engineered-grid feel on top
 * of any dark surface (typically `mkt.sectionLight`).
 *
 * Originally lived as a module-private `DottedBackground` inside
 * components/effortel-blocks/index.tsx; lifted here so the TradeLine
 * hero can reuse the exact same pattern without duplicating the inline
 * style block.
 */

import type { CSSProperties } from "react";

export interface DashedGridBackgroundProps {
  /**
   * Override the dot color. Defaults to `rgba(255,255,255,0.06)` —
   * matches the NumberedCard treatment. Caller can pass a different
   * value for light-mode surfaces.
   */
  color?: string;
  /** Override the dot-to-dot spacing (px). Defaults to 16. */
  spacing?: number;
  /** Override the wrapper opacity. Defaults to 0.7. */
  opacity?: number;
  /** Extra inline styles merged after the defaults. */
  style?: CSSProperties;
}

export default function DashedGridBackground({
  color = "rgba(255,255,255,0.06)",
  spacing = 16,
  opacity = 0.7,
  style,
}: DashedGridBackgroundProps) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        backgroundImage: `radial-gradient(circle, ${color} 1px, transparent 1px)`,
        backgroundSize: `${spacing}px ${spacing}px`,
        opacity,
        ...style,
      }}
    />
  );
}
