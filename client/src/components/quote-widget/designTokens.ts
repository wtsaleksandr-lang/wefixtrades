/**
 * Design tokens for the QuoteWidget visual layer.
 * Visual only — no logic, no state, no dependencies.
 */
export const eff = {
  bg: '#eef1f6',
  bgSecondary: '#f7f9fc',
  text: '#0f172a',
  textBody: '#5b6573',
  textMuted: '#94a3b8',
  accent: '#0d3cfc',
  accentTint: 'rgba(13,60,252,0.08)',
  accentSoft: 'rgba(13,60,252,0.14)',
  // Primary CTA — brand blue (was a flat dark grey, which read dated).
  buttonBg: '#0d3cfc',
  buttonBgHover: '#0a30d1',
  buttonBorder: '#e1e7ef',
  buttonText: '#ffffff',
  font: '"Satoshi Variable", system-ui, sans-serif',
  fontMono: '"SF Mono", "Menlo", "Consolas", "Roboto Mono", monospace',
  radiusSm: '0.5em',
  radiusMd: '0.75em',
  radiusLg: '1em',
  radiusXl: '1.25em',
  radius2xl: '1.5em',
  /** Premium card / control shadows */
  shadowCard: '0 12px 40px rgba(15,23,42,0.08), 0 2px 8px rgba(15,23,42,0.04)',
  shadowButton: '0 8px 20px rgba(13,60,252,0.28)',
  /** Semantic color for validation errors */
  error: '#dc2626',
  /** Semantic color for success states */
  success: '#16a34a',
  successBg: '#f0fdf4',
  /**
   * Cost-breakdown chart — track + accent-family segment ramp.
   * Single-accent per the design-lock data-viz rules.
   */
  chartTrack: '#e6ebf2',
  chartSeg: ['#0d3cfc', '#4f6dfd', '#8c9dfe', '#c2ccff'],
} as const;

/** Shared style for step titles */
export const stepTitleStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 700,
  color: eff.text,
  lineHeight: 1.25,
  margin: 0,
  fontFamily: eff.font,
};

/** Shared style for step subtitles */
export const stepSubtitleStyle: React.CSSProperties = {
  fontSize: '14px',
  color: eff.textBody,
  lineHeight: 1.5,
  margin: '4px 0 0',
};

/** Shared style for question labels */
export const labelStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: eff.text,
  lineHeight: 1.3,
  display: 'block',
  marginBottom: '8px',
  fontFamily: eff.font,
};

/** Shared style for question descriptions */
export const descStyle: React.CSSProperties = {
  fontSize: '13px',
  color: eff.textBody,
  lineHeight: 1.5,
  margin: '0 0 8px',
};

/** Shared style for primary CTA buttons */
export const primaryButtonStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  borderRadius: eff.radiusLg,
  padding: '16px 24px',
  fontSize: '15px',
  fontWeight: 700,
  color: eff.buttonText,
  background: eff.buttonBg,
  border: 'none',
  cursor: 'pointer',
  fontFamily: eff.font,
  boxShadow: eff.shadowButton,
  transition: 'background 0.15s, transform 0.1s, box-shadow 0.15s',
  letterSpacing: '0.01em',
};

/** Shared style for text inputs */
export const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '48px',
  borderRadius: eff.radiusMd,
  border: `1px solid ${eff.buttonBorder}`,
  padding: '0 16px',
  fontSize: '15px',
  color: eff.text,
  background: '#fff',
  fontFamily: eff.font,
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  boxSizing: 'border-box' as const,
};

/** Shared style for inline error messages */
export const errorTextStyle: React.CSSProperties = {
  fontSize: '13px',
  color: eff.error,
  margin: '4px 0 0',
  lineHeight: 1.4,
};

/** Shared style for selectable option rows (checkbox/radio) */
export const optionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  borderRadius: eff.radiusMd,
  border: `1px solid ${eff.buttonBorder}`,
  padding: '14px 16px',
  cursor: 'pointer',
  transition: 'border-color 0.15s, background 0.15s',
  background: '#fff',
};
