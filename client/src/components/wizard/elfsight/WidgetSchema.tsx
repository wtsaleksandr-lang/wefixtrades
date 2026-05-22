// WidgetSchema — BD-3h.
//
// A single, simplified wireframe SVG of the calculator widget used inside
// help-cue popovers to show "where in the widget does this control affect?"
// The cue passes a `highlight="<region>"` prop; that region is tinted
// brand-blue while the rest of the wireframe is neutral grey at half opacity.
//
// One asset, ~11 region keys — maintainable. Per-component custom
// illustrations would be hundreds of assets, so we go with this composable
// approach instead.

export type WidgetRegion =
  | 'header'
  | 'progress'
  | 'step-content'
  | 'options'
  | 'result'
  | 'tier-cards'
  | 'trust-strip'
  | 'trust-block'
  | 'sticky-footer'
  | 'chat-bubble'
  | 'background';

interface Props {
  highlight: WidgetRegion;
  width?: number;
}

const REGION_LABELS: Record<WidgetRegion, string> = {
  header: 'Widget header',
  progress: 'Step progress bar',
  'step-content': 'Step content area',
  options: 'Multiple-choice options',
  result: 'Result / price area',
  'tier-cards': 'Good/Better/Best tier cards',
  'trust-strip': 'Trust strip (header)',
  'trust-block': 'Trust block (under CTA)',
  'sticky-footer': 'Sticky action footer',
  'chat-bubble': 'AI help bubble',
  background: 'Widget background',
};

const HL = '#0d3cfc';
const DIM = '#cbd5e1';
const DIM_DARK = '#475569';

export default function WidgetSchema({ highlight, width = 240 }: Props) {
  // Region fill helper — active region uses the brand blue at full opacity,
  // others fall back to a neutral grey at half opacity. The CSS variable
  // --qq-schema-dim is set per-theme below so dark mode picks #475569.
  const fill = (r: WidgetRegion) => (r === highlight ? HL : 'var(--qq-schema-dim, ' + DIM + ')');
  const op = (r: WidgetRegion) => (r === highlight ? 1 : 0.55);

  return (
    <div className="qq-widget-schema" data-testid="widget-schema" data-highlight={highlight}>
      <style>{`
        .qq-widget-schema { --qq-schema-dim: ${DIM}; }
        [data-theme="dark"] .qq-widget-schema,
        .qq-info-cue-popover[data-theme="dark"] .qq-widget-schema { --qq-schema-dim: ${DIM_DARK}; }
        .qq-widget-schema svg { display: block; width: 100%; height: auto; }
        .qq-widget-schema-label {
          margin-top: 6px;
          font-size: 11px;
          font-weight: 600;
          color: #0d3cfc;
          letter-spacing: 0.01em;
        }
        .qq-info-cue-popover[data-theme="dark"] .qq-widget-schema-label { color: #6b8afd; }
      `}</style>
      <svg
        viewBox="0 0 280 200"
        role="img"
        aria-label={`Widget wireframe highlighting ${REGION_LABELS[highlight]}`}
        style={{ width, maxWidth: '100%' }}
      >
        {/* Background card */}
        <g data-region="background">
          <rect
            x="8"
            y="8"
            width="264"
            height="184"
            rx="8"
            fill={fill('background')}
            opacity={op('background')}
            stroke="#94a3b8"
            strokeWidth="0.75"
          />
        </g>

        {/* Trust strip (thin row at very top, inside the card) */}
        <g data-region="trust-strip">
          <rect x="16" y="14" width="248" height="8" rx="2" fill={fill('trust-strip')} opacity={op('trust-strip')} />
        </g>

        {/* Header strip: logo placeholder + step title */}
        <g data-region="header">
          <rect x="16" y="26" width="248" height="22" rx="3" fill={fill('header')} opacity={op('header')} />
          {/* Logo square (visual only — same fill so it reads as part of header) */}
          <rect x="20" y="30" width="14" height="14" rx="2" fill={fill('header')} opacity={op('header')} />
        </g>

        {/* Progress bar — four small circles */}
        <g data-region="progress">
          <circle cx="60" cy="60" r="3.5" fill={fill('progress')} opacity={op('progress')} />
          <circle cx="120" cy="60" r="3.5" fill={fill('progress')} opacity={op('progress')} />
          <circle cx="180" cy="60" r="3.5" fill={fill('progress')} opacity={op('progress')} />
          <circle cx="240" cy="60" r="3.5" fill={fill('progress')} opacity={op('progress')} />
          <rect x="64" y="59" width="172" height="2" fill={fill('progress')} opacity={op('progress') * 0.5} />
        </g>

        {/* Step content rows (form inputs) */}
        <g data-region="step-content">
          <rect x="20" y="72" width="200" height="8" rx="2" fill={fill('step-content')} opacity={op('step-content')} />
          <rect x="20" y="86" width="160" height="8" rx="2" fill={fill('step-content')} opacity={op('step-content')} />
        </g>

        {/* Multiple-choice options — two pill rows beneath content */}
        <g data-region="options">
          <rect x="20" y="100" width="80" height="14" rx="7" fill={fill('options')} opacity={op('options')} />
          <rect x="108" y="100" width="80" height="14" rx="7" fill={fill('options')} opacity={op('options')} />
        </g>

        {/* Result / price block */}
        <g data-region="result">
          <rect x="20" y="120" width="100" height="14" rx="2" fill={fill('result')} opacity={op('result')} />
          <rect x="20" y="138" width="60" height="6" rx="1" fill={fill('result')} opacity={op('result') * 0.7} />
        </g>

        {/* Tier cards — three small cards side by side */}
        <g data-region="tier-cards">
          <rect x="140" y="118" width="38" height="32" rx="3" fill={fill('tier-cards')} opacity={op('tier-cards')} />
          <rect x="182" y="118" width="38" height="32" rx="3" fill={fill('tier-cards')} opacity={op('tier-cards')} />
          <rect x="224" y="118" width="38" height="32" rx="3" fill={fill('tier-cards')} opacity={op('tier-cards')} />
        </g>

        {/* Trust block — row under the result, above the footer */}
        <g data-region="trust-block">
          <rect x="20" y="156" width="240" height="10" rx="2" fill={fill('trust-block')} opacity={op('trust-block')} />
        </g>

        {/* Sticky footer — Back / Next buttons */}
        <g data-region="sticky-footer">
          <rect x="16" y="172" width="60" height="14" rx="3" fill={fill('sticky-footer')} opacity={op('sticky-footer')} />
          <rect x="200" y="172" width="64" height="14" rx="3" fill={fill('sticky-footer')} opacity={op('sticky-footer')} />
        </g>

        {/* AI help bubble — floating "?" near top-right */}
        <g data-region="chat-bubble">
          <circle cx="258" cy="40" r="9" fill={fill('chat-bubble')} opacity={op('chat-bubble')} />
          <text
            x="258"
            y="44"
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            fill="#ffffff"
            opacity={op('chat-bubble')}
          >
            ?
          </text>
        </g>
      </svg>
      <div className="qq-widget-schema-label" data-testid="widget-schema-label">
        Highlighted: {REGION_LABELS[highlight]}
      </div>
    </div>
  );
}
