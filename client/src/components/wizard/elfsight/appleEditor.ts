// appleEditor.ts — scoped "Apple-clean" editor theme tokens (Phase 0).
//
// This is the shared token module for the Apple-clean redesign of the
// QuoteQuick wizard BUILDER (the calculator editor chrome). It is deliberately
// SCOPED to the editor shell surfaces — it does NOT replace the global
// `platformTheme` / `tokens`, which the public widget and the rest of the
// product still depend on. Restyling work in the editor references `AE.*` so
// the chrome reads light, minimal, hairline-bordered, SF-system-typed, with a
// single refined brand-blue accent.
//
// Phase 0 establishes these tokens + restyles the editor CHROME only (top bar,
// tab pills, panel surfaces, mobile sheet). Later phases consume the same
// tokens for panel contents. Do not add product/widget colours here.

export const AE = {
  color: {
    bg: '#ffffff',            // editor background / cards
    surface: '#f5f5f7',       // Apple grey — recessed panels, inputs at rest
    surfaceHover: '#ececef',
    text: '#1d1d1f',          // Apple near-black
    secondary: '#6e6e73',     // secondary/caption text
    hairline: '#d2d2d7',      // borders/dividers (1px hairlines)
    hairlineStrong: '#c6c6cb',
    accent: '#0d3cfc',        // refined brand blue (links, +Add, selected, primary)
    accentHover: '#0a31d6',
    accentTint: 'rgba(13,60,252,0.08)',  // selected-row tint
    publish: '#0d3cfc',       // primary action = brand blue (NOT green)
    publishText: '#ffffff',
    success: '#1d9d63',
    danger: '#d4332e',
  },
  radius: { sm: '8px', md: '10px', lg: '14px', pill: '999px' },
  font: { family: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif" },
  type: {
    title:   { size: '17px', weight: 600, color: '#1d1d1f' },   // panel/section title
    label:   { size: '14px', weight: 500, color: '#1d1d1f' },   // row label
    value:   { size: '14px', weight: 400, color: '#1d1d1f' },
    caption: { size: '12px', weight: 500, color: '#6e6e73', tracking: '0.02em' },  // group captions (UPPERCASE optional)
    helper:  { size: '12px', weight: 400, color: '#6e6e73' },
  },
  shadow: {
    card: '0 1px 2px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03)',
    pop:  '0 8px 28px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06)',
    focus:'0 0 0 4px rgba(13,60,252,0.14)',
  },
  control: { height: '40px', rowMin: '44px' },  // Apple-ish 40-44px control heights
} as const;
