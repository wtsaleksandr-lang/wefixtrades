/**
 * Design tokens for the QuoteWidget visual layer.
 * Visual only — no logic, no state, no dependencies.
 */
export const eff = {
  bg: '#e4edf1',
  bgSecondary: '#f5fcff',
  text: '#22282a',
  textBody: '#5f6f77',
  accent: '#66e8fa',
  buttonBg: '#394247',
  buttonBgHover: '#171818',
  buttonBorder: '#d5e1e7',
  buttonText: '#e4edf1',
  font: '"Satoshi Variable", system-ui, sans-serif',
  fontMono: '"Et Mono", Impact, sans-serif',
  radiusSm: '0.5em',
  radiusMd: '0.75em',
  radiusLg: '1em',
  radiusXl: '1.5em',
  radius2xl: '2em',
} as const;

/** Shared style for step titles */
export const stepTitleStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 700,
  color: eff.text,
  lineHeight: 1.2,
  margin: 0,
  fontFamily: eff.font,
};

/** Shared style for step subtitles */
export const stepSubtitleStyle: React.CSSProperties = {
  fontSize: '14px',
  color: eff.textBody,
  lineHeight: 1.5,
  margin: '8px 0 0',
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
  borderRadius: eff.radiusXl,
  padding: '14px 24px',
  fontSize: '15px',
  fontWeight: 700,
  color: eff.buttonText,
  background: eff.buttonBg,
  border: 'none',
  cursor: 'pointer',
  fontFamily: eff.font,
  transition: 'background 0.15s, transform 0.1s',
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
