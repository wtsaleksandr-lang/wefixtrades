import type { CSSProperties } from "react";
import { mkt } from "@/theme/tokens";

export const HEADING_FONT = "'Playfair Display', Georgia, serif";
export const BODY_FONT = "'Inter', system-ui, sans-serif";

export const GLASS: CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  backdropFilter: "blur(16px) saturate(1.4)",
  WebkitBackdropFilter: "blur(16px) saturate(1.4)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 20,
};

/* Hover affordance: flat white border, no glow halo (brand direction). */
export const GLASS_HOVER: CSSProperties = {
  borderColor: "#FFFFFF",
  boxShadow: "none",
  transform: "translateY(-4px)",
};

/* Kept as named exports for compatibility with existing imports.
 * Both now resolve to no glow (the consumer should fall back to the
 * `GLASS_HOVER` border treatment). Empty string keeps `box-shadow: ` valid. */
export const GLOW_CYAN = "none";
export const GLOW_CYAN_STRONG = "none";

export const GRID_BG: CSSProperties = {
  backgroundImage: `
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
  `,
  backgroundSize: "60px 60px",
};

export const SECTION_PAD: CSSProperties = {
  padding: "clamp(60px, 10vw, 100px) 24px",
};

export const MAX_W: CSSProperties = {
  maxWidth: 1120,
  margin: "0 auto",
};

export const sectionHeading: CSSProperties = {
  fontFamily: HEADING_FONT,
  fontSize: "clamp(28px, 4vw, 42px)",
  fontWeight: 700,
  color: mkt.onDark,
  letterSpacing: "-0.025em",
  lineHeight: 1.1,
  textAlign: "center",
  marginBottom: 16,
};

export const sectionSub: CSSProperties = {
  fontSize: 16,
  fontFamily: BODY_FONT,
  color: mkt.textMuted,
  lineHeight: 1.65,
  textAlign: "center",
  maxWidth: 560,
  margin: "0 auto",
};
