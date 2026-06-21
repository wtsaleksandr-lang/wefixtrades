import { eff, stepTitleStyle, stepSubtitleStyle } from '../designTokens';
import type { StepDefinition } from '@shared/wizardSchema';

interface RoofVisualizerStepProps {
  step: StepDefinition;
  accentColor?: string;
}

/**
 * Mounts the first-party Roof & Solar 3D visualizer (served as a full HTML
 * page at GET /api/roofquote/widget) inside the wizard via an iframe.
 *
 * The widget needs scripts, WebGL and same-origin fetches to /api/roofquote/*,
 * so we intentionally do NOT set a `sandbox` attribute — the route is
 * first-party / same-origin, so the default (full-trust) iframe is correct
 * and a sandbox would only break WebGL / its own fetches.
 *
 * Sizing: full width; height is min(78vh, 720px) on desktop. On narrow
 * (mobile) screens the media query bumps it to 82vh so the 3D experience
 * gets most of the viewport.
 */
export default function RoofVisualizerStep({ step }: RoofVisualizerStepProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {step.title && <h3 style={stepTitleStyle}>{step.title}</h3>}
      {step.subtitle && <p style={stepSubtitleStyle}>{step.subtitle}</p>}

      <iframe
        src="/api/roofquote/widget"
        title="Roof & Solar visualizer"
        allow="accelerometer; gyroscope; fullscreen"
        className="roof-visualizer-frame"
        style={{
          display: 'block',
          width: '100%',
          height: 'min(78vh, 720px)',
          border: 'none',
          borderRadius: eff.radiusLg,
          background: eff.bgSecondary,
        }}
      />

      {/* Mobile: give the 3D experience most of the viewport height. */}
      <style>{`
        @media (max-width: 480px) {
          .roof-visualizer-frame {
            height: 82vh !important;
          }
        }
      `}</style>
    </div>
  );
}
