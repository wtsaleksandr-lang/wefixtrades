/**
 * SiteLaunch — the four themes.
 *
 * These are NOT four colour swaps. The audit's biggest risk item was "four
 * generic themes = a $1,197 refund queue", so each theme changes the page's
 * STRUCTURE: container width, hero composition, navigation treatment, card
 * anatomy, section rhythm, band alternation, divider style, heading case and
 * type scale. Swapping `theme_id` on the same document produces a visibly
 * different site, not a recoloured one.
 *
 * Colour lives here rather than in `shared/` for two reasons: the renderer is
 * server-side so the client never needs the token tables, and
 * `scripts/check-hardcoded-colors.mjs` scans `shared/` (a full palette there
 * would be a guard violation). The client gets `SITELAUNCH_THEMES` metadata
 * from shared/sitelaunch/document.ts, which is all the admin picker needs.
 *
 * Brand colours from `brand_kits` / `clients.metadata.content_brand` override
 * `accent` only. Every dependent token (hover, tint, on-accent ink, focus
 * ring) is DERIVED with contrast maths in ./color.ts, so a customer's brand
 * colour can never produce an illegible CTA.
 */

import type { SiteLaunchThemeId } from "@shared/sitelaunch/document";
import { buildAccentRamp, type AccentRamp } from "./color";

/* ── Font stacks ─────────────────────────────────────────────────────────
 * System stacks only. A generated site must render identically offline and
 * inside the "you own it" ZIP export, so nothing here fetches a webfont. */
export const FONT_STACKS: Record<string, string> = {
  grotesk:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  serif: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif",
  condensed:
    "'Oswald', 'Archivo Narrow', 'Helvetica Neue Condensed', 'Arial Narrow', Impact, sans-serif",
  humanist: "'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif",
  mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
};

export function fontStack(key: string | undefined, fallback: string): string {
  if (key && FONT_STACKS[key]) return FONT_STACKS[key];
  return FONT_STACKS[fallback] ?? FONT_STACKS.grotesk;
}

/* ── Theme shape ─────────────────────────────────────────────────────── */

export type HeroVariant = "split-image" | "full-bleed-dark" | "centered-plain" | "split-credentials";
export type NavVariant = "inline" | "bar-uppercase" | "minimal" | "utility-bar";
export type CardVariant = "bordered" | "flat-square" | "hairline" | "accent-rail";
export type StatVariant = "tiles" | "edge-strip" | "inline-row" | "table";
export type DividerStyle = "none" | "rule" | "thick-rule";
export type HeadingCase = "none" | "upper";

export interface ThemePalette {
  /** Page background. */
  surface: string;
  /** Alternating band background. */
  surfaceAlt: string;
  /** Card / raised panel background. */
  surfaceRaised: string;
  /** Inverted band (dark section) background. */
  surfaceDark: string;
  ink: string;
  inkMuted: string;
  inkSubtle: string;
  /** Ink used on `surfaceDark`. */
  inkOnDark: string;
  inkOnDarkMuted: string;
  line: string;
  lineStrong: string;
  /** Default accent when the customer supplies no brand colour. */
  accent: string;
  /** Light ink candidate for contrast resolution. */
  inkLight: string;
  /** Dark ink candidate for contrast resolution. */
  inkDark: string;
}

export interface ThemeLayout {
  /** Max content width in px. */
  container: number;
  /** Vertical section padding, mobile / desktop, in px. */
  sectionPadMobile: number;
  sectionPadDesktop: number;
  /** Corner radius in px. 0 = square. */
  radius: number;
  radiusSmall: number;
  /** Card border width in px. */
  borderWidth: number;
  /** Box shadow for raised cards, or "none". */
  shadow: string;
  /** Gap between grid items, px. */
  gridGap: number;
}

export interface ThemeType {
  headingFont: keyof typeof FONT_STACKS;
  bodyFont: keyof typeof FONT_STACKS;
  /** Hero display size, mobile / desktop, in px. */
  displayMobile: number;
  displayDesktop: number;
  /** Section heading size, mobile / desktop, in px. */
  headingMobile: number;
  headingDesktop: number;
  bodySize: number;
  lineHeight: number;
  headingWeight: number;
  headingCase: HeadingCase;
  headingTracking: string;
  eyebrowCase: HeadingCase;
}

export interface ThemeStructure {
  hero: HeroVariant;
  nav: NavVariant;
  card: CardVariant;
  stat: StatVariant;
  divider: DividerStyle;
  /**
   * Which section indices get the alternating band. "odd" alternates,
   * "none" keeps one flat surface, "dark-accents" puts CTA/stats on the
   * inverted surface.
   */
  banding: "odd" | "none" | "dark-accents";
  /** Buttons: pill vs squared, and whether the secondary is outlined. */
  buttonShape: "pill" | "rounded" | "square";
  /** Section headings left-aligned (house rule) vs centred for this theme.
   *  Kept explicit so the choice is auditable per theme. */
  headingAlign: "left" | "center";
}

export interface SiteLaunchTheme {
  id: SiteLaunchThemeId;
  palette: ThemePalette;
  layout: ThemeLayout;
  type: ThemeType;
  structure: ThemeStructure;
}

/* ────────────────────────────────────────────────────────────────────────
 * 1. CLASSIC — trusted, dependable. Boxed container, split hero with photo,
 *    bordered cards on a warm neutral, generous rhythm, serif headings.
 * ──────────────────────────────────────────────────────────────────────── */
const CLASSIC: SiteLaunchTheme = {
  id: "trade-classic",
  palette: {
    surface: "#FBFAF8",
    surfaceAlt: "#F3F1EC",
    surfaceRaised: "#FEFEFD",
    surfaceDark: "#1F2A33",
    ink: "#1B2228",
    inkMuted: "#55606A",
    inkSubtle: "#8B949C",
    inkOnDark: "#F6F4F0",
    inkOnDarkMuted: "rgba(246,244,240,0.74)",
    line: "#E2DED6",
    lineStrong: "#CFC9BE",
    accent: "#175E7A",
    inkLight: "#FDFDFC",
    inkDark: "#1B2228",
  },
  layout: {
    container: 1120,
    sectionPadMobile: 56,
    sectionPadDesktop: 96,
    radius: 6,
    radiusSmall: 4,
    borderWidth: 1,
    shadow: "0 1px 2px rgba(27,34,40,0.05), 0 8px 24px rgba(27,34,40,0.05)",
    gridGap: 24,
  },
  type: {
    headingFont: "serif",
    bodyFont: "humanist",
    displayMobile: 34,
    displayDesktop: 54,
    headingMobile: 26,
    headingDesktop: 36,
    bodySize: 17,
    lineHeight: 1.65,
    headingWeight: 600,
    headingCase: "none",
    headingTracking: "-0.01em",
    eyebrowCase: "upper",
  },
  structure: {
    hero: "split-image",
    nav: "inline",
    card: "bordered",
    stat: "tiles",
    divider: "rule",
    banding: "odd",
    buttonShape: "rounded",
    headingAlign: "left",
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * 2. BOLD — high-contrast, visual. Full-bleed dark hero with overlay,
 *    uppercase condensed display type, square corners, alternating dark
 *    bands, edge-to-edge stat strip.
 * ──────────────────────────────────────────────────────────────────────── */
const BOLD: SiteLaunchTheme = {
  id: "trade-bold",
  palette: {
    surface: "#FAFAFA",
    surfaceAlt: "#EDEDEE",
    surfaceRaised: "#FDFDFD",
    surfaceDark: "#14161A",
    ink: "#14161A",
    inkMuted: "#4B5058",
    inkSubtle: "#82878F",
    inkOnDark: "#F7F7F8",
    inkOnDarkMuted: "rgba(247,247,248,0.70)",
    line: "#DCDDDF",
    lineStrong: "#14161A",
    accent: "#D2451E",
    inkLight: "#FDFDFC",
    inkDark: "#14161A",
  },
  layout: {
    container: 1280,
    sectionPadMobile: 60,
    sectionPadDesktop: 104,
    radius: 0,
    radiusSmall: 0,
    borderWidth: 3,
    shadow: "none",
    gridGap: 2,
  },
  type: {
    headingFont: "condensed",
    bodyFont: "grotesk",
    displayMobile: 40,
    displayDesktop: 76,
    headingMobile: 28,
    headingDesktop: 46,
    bodySize: 17,
    lineHeight: 1.6,
    headingWeight: 700,
    headingCase: "upper",
    headingTracking: "0.01em",
    eyebrowCase: "upper",
  },
  structure: {
    hero: "full-bleed-dark",
    nav: "bar-uppercase",
    card: "flat-square",
    stat: "edge-strip",
    divider: "thick-rule",
    banding: "dark-accents",
    buttonShape: "square",
    headingAlign: "left",
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * 3. CLEAN — modern, minimal. Centred text-only hero, hairline borders, no
 *    shadows, large radius, single accent, airy two-column text grids.
 * ──────────────────────────────────────────────────────────────────────── */
const CLEAN: SiteLaunchTheme = {
  id: "trade-clean",
  palette: {
    surface: "#FCFCFD",
    surfaceAlt: "#F5F6F8",
    surfaceRaised: "#FCFCFD",
    surfaceDark: "#22262B",
    ink: "#191D22",
    inkMuted: "#5C646D",
    inkSubtle: "#98A0A9",
    inkOnDark: "#F8F9FA",
    inkOnDarkMuted: "rgba(248,249,250,0.72)",
    line: "#E9EBEF",
    lineStrong: "#D8DCE2",
    accent: "#0F8A6A",
    inkLight: "#FDFDFC",
    inkDark: "#191D22",
  },
  layout: {
    container: 1040,
    sectionPadMobile: 56,
    sectionPadDesktop: 88,
    radius: 14,
    radiusSmall: 10,
    borderWidth: 1,
    shadow: "none",
    gridGap: 28,
  },
  type: {
    headingFont: "grotesk",
    bodyFont: "grotesk",
    displayMobile: 32,
    displayDesktop: 50,
    headingMobile: 24,
    headingDesktop: 34,
    bodySize: 17,
    lineHeight: 1.7,
    headingWeight: 600,
    headingCase: "none",
    headingTracking: "-0.02em",
    eyebrowCase: "none",
  },
  structure: {
    hero: "centered-plain",
    nav: "minimal",
    card: "hairline",
    stat: "inline-row",
    divider: "none",
    banding: "none",
    buttonShape: "pill",
    headingAlign: "left",
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * 4. PRO — premium, corporate. Sticky utility bar carrying the phone
 *    number, dense information design, left-accent-rail cards, credential
 *    row under the hero, tabular stats.
 * ──────────────────────────────────────────────────────────────────────── */
const PRO: SiteLaunchTheme = {
  id: "trade-pro",
  palette: {
    surface: "#F7F8FA",
    surfaceAlt: "#ECEFF3",
    surfaceRaised: "#FDFDFE",
    surfaceDark: "#101C2E",
    ink: "#15202E",
    inkMuted: "#4E5A6A",
    inkSubtle: "#8A94A2",
    inkOnDark: "#F4F7FB",
    inkOnDarkMuted: "rgba(244,247,251,0.72)",
    line: "#DDE3EA",
    lineStrong: "#C4CDD8",
    accent: "#1B4D8F",
    inkLight: "#FDFDFC",
    inkDark: "#15202E",
  },
  layout: {
    container: 1200,
    sectionPadMobile: 48,
    sectionPadDesktop: 80,
    radius: 8,
    radiusSmall: 5,
    borderWidth: 1,
    shadow: "0 1px 3px rgba(21,32,46,0.07)",
    gridGap: 20,
  },
  type: {
    headingFont: "humanist",
    bodyFont: "humanist",
    displayMobile: 32,
    displayDesktop: 48,
    headingMobile: 24,
    headingDesktop: 32,
    bodySize: 16,
    lineHeight: 1.6,
    headingWeight: 700,
    headingCase: "none",
    headingTracking: "-0.005em",
    eyebrowCase: "upper",
  },
  structure: {
    hero: "split-credentials",
    nav: "utility-bar",
    card: "accent-rail",
    stat: "table",
    divider: "rule",
    banding: "odd",
    buttonShape: "rounded",
    headingAlign: "left",
  },
};

const THEMES: Record<SiteLaunchThemeId, SiteLaunchTheme> = {
  "trade-classic": CLASSIC,
  "trade-bold": BOLD,
  "trade-clean": CLEAN,
  "trade-pro": PRO,
};

export function getTheme(id: SiteLaunchThemeId): SiteLaunchTheme {
  return THEMES[id] ?? CLASSIC;
}

export function allThemes(): SiteLaunchTheme[] {
  return Object.values(THEMES);
}

/* ────────────────────────────────────────────────────────────────────────
 * Resolved theme = theme + customer brand overrides.
 * ──────────────────────────────────────────────────────────────────────── */

export interface ResolvedTheme {
  theme: SiteLaunchTheme;
  accent: AccentRamp;
  headingStack: string;
  bodyStack: string;
  logoUrl: string;
}

export function resolveTheme(
  themeId: SiteLaunchThemeId,
  brand: { primary?: string; secondary?: string; logo_url?: string; heading_font?: string; body_font?: string },
): ResolvedTheme {
  const theme = getTheme(themeId);
  return {
    theme,
    accent: buildAccentRamp(
      brand.primary || "",
      theme.palette.accent,
      theme.palette.inkLight,
      theme.palette.inkDark,
    ),
    headingStack: fontStack(brand.heading_font, theme.type.headingFont),
    bodyStack: fontStack(brand.body_font, theme.type.bodyFont),
    logoUrl: brand.logo_url || "",
  };
}
