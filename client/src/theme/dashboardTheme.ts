import { colors, transitions } from './tokens';

/**
 * QuoteQuick Dashboard theme — the LOCKED visual language for the builder
 * wizard. See docs/quotequick-dashboard-design-lock.md for the rules.
 *
 * Shaped deliberately like `platformTheme` so surfaces can migrate with a
 * mostly mechanical token swap. Raw palette lives in tokens.ts (colors.dashboard).
 */

const d = colors.dashboard;

export const dashboardTheme = {
  colors: {
    // Surfaces
    canvas: d.canvas,
    panel: d.panel,
    panelHeader: d.panel,
    rail: d.panel,
    card: d.card,
    cardMuted: d.cardMuted,
    cardHover: d.cardHover,

    // Navigation rail
    navActiveBg: d.navActiveBg,
    navActiveIcon: d.navActiveIcon,
    navIcon: d.navIcon,
    navIconHover: d.navIconHover,

    // Accent (brand blue — replaces the reference teal)
    accent: d.accent,
    accentDark: d.accentDark,
    accentLight: d.accentLight,
    accentLighter: d.accentLighter,
    accentTint: d.accentTint,

    // Text
    heading: d.heading,
    body: d.body,
    muted: d.muted,
    subtle: d.subtle,

    // Borders (hairline, rare)
    border: d.border,
    borderLight: d.borderLight,

    // Status pill badges (pastel)
    badgeBlueBg: d.badgeBlueBg,
    badgeBlueText: d.badgeBlueText,
    badgeGreenBg: d.badgeGreenBg,
    badgeGreenText: d.badgeGreenText,
    badgeRedBg: d.badgeRedBg,
    badgeRedText: d.badgeRedText,
    badgeAmberBg: d.badgeAmberBg,
    badgeAmberText: d.badgeAmberText,

    // Semantic
    success: '#1B7A3D',
    danger: '#B23A45',
    warning: '#9A6512',
  },

  radius: {
    panel: '24px',
    card: '16px',
    control: '10px',
    navSquare: '12px',
    pill: '999px',
  },

  shadows: {
    card: '0 1px 3px rgba(20,30,45,0.04), 0 8px 24px rgba(20,30,45,0.05)',
    cardHover: '0 2px 6px rgba(20,30,45,0.06), 0 14px 32px rgba(20,30,45,0.08)',
    panel: '0 1px 2px rgba(20,30,45,0.04), 0 10px 30px rgba(20,30,45,0.06)',
    nav: '0 6px 16px rgba(13,60,252,0.24)',
  },

  /**
   * Data-visualisation palette — minimal, single-accent, no axes/gridlines/
   * legends. See the "Data visualisation" section of the design-lock doc.
   */
  chart: {
    ringTrack: '#C7D0D7',                   // donut/ring — remaining arc
    ringValue: '#22282A',                   // donut/ring — value arc
    barTrack: '#D8E0E6',                    // progress bar — track
    barFill: d.accent,                      // progress bar — fill (brand blue)
    lineUp: '#46C36A',                      // positive trend line
    lineUpFill: 'rgba(70,195,106,0.20)',    // positive area gradient
    lineDown: '#E98C97',                    // negative trend line
    lineDownFill: 'rgba(233,140,151,0.18)', // negative area gradient
    // Segmented breakdown bar — accent-family ramp for stacked shares.
    seg: ['#0d3cfc', '#4f6dfd', '#8c9dfe', '#c2ccff'],
  },

  /** "Split bars and sections" layout metrics. */
  layout: {
    shellPad: '16px',   // bare canvas around the whole shell
    panelGap: '14px',   // gap between the header bar and the main panel
    panelPad: '24px',   // inner padding of a panel / content area
    cardGap: '12px',    // gap between stacked content cards
    railWidth: '76px',  // icon-only nav rail width
  },

  typography: {
    fontUi: '"Satoshi Variable", system-ui, sans-serif',
    fontMono: '"Et Mono", "SF Mono", "Roboto Mono", monospace',
    h1: { fontSize: '24px', fontWeight: 700, lineHeight: 1.3, color: d.heading, letterSpacing: '-0.02em' },
    h2: { fontSize: '20px', fontWeight: 700, lineHeight: 1.35, color: d.heading, letterSpacing: '-0.01em' },
    h3: { fontSize: '17px', fontWeight: 600, lineHeight: 1.4, color: d.heading },
    body: { fontSize: '15px', fontWeight: 400, lineHeight: 1.6, color: d.body },
    bodySm: { fontSize: '14px', fontWeight: 400, lineHeight: 1.5, color: d.body },
    caption: { fontSize: '13px', fontWeight: 500, lineHeight: 1.4, color: d.muted },
    captionSm: { fontSize: '12px', fontWeight: 500, lineHeight: 1.4, color: d.subtle },
    label: { fontSize: '13px', fontWeight: 600, lineHeight: 1.4, color: d.body, letterSpacing: '0.01em' },
    colHeader: { fontSize: '12px', fontWeight: 500, lineHeight: 1.4, color: d.muted },
    /** Large KPI numeral — always monospace. */
    statValue: { fontSize: '30px', fontWeight: 700, lineHeight: 1.05, color: d.heading },
  },

  transitions: {
    fast: transitions.fast,
    normal: transitions.normal,
    slow: transitions.slow,
    spring: transitions.spring,
  },
} as const;

export type DashboardTheme = typeof dashboardTheme;
