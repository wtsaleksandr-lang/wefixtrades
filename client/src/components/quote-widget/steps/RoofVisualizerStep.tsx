import { useCallback, useEffect, useMemo, useRef } from 'react';
import { eff, stepTitleStyle, stepSubtitleStyle } from '../designTokens';
import type { StepDefinition } from '@shared/wizardSchema';

interface RoofVisualizerStepProps {
  step: StepDefinition;
  accentColor?: string;
  /** Published calculator id (P0-T1) — appended to the iframe src as `?calc=`
   *  so the widget's durable `/api/roofquote/lead` fallback can ATTRIBUTE (and
   *  therefore persist + notify) its leads. Without it the server acks
   *  `{ok:true, persisted:false}` and the widget's retry queue drains the lead
   *  as delivered — silent lead loss. Preview/draft ids (negative / undefined)
   *  stay param-less, same convention as RoofVisualizerEmbed. */
  calculatorId?: string | number;
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
 *
 * ROOF-WIDGET — the schema-flow renderer only carries the calculator's
 * `accentColor` (the full tenant config travels through the AdvancedCalculator
 * path, RoofVisualizerEmbed). Bridge at least the accent into the iframe over
 * postMessage (`qq:tenant-config`) so the widget's brand colour matches the
 * surrounding calculator. The widget merges only known branches, so an
 * accent-only patch is safe and leaves every other field at its default.
 */
export default function RoofVisualizerStep({ step, accentColor, calculatorId }: RoofVisualizerStepProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // Published path (mirrors AdvancedCalculator's RoofVisualizerEmbed): a
  // positive integer id means a live, persisted calculator → append ?calc=<id>
  // so the widget's own /api/roofquote/lead sink resolves the calculator and
  // persists + notifies + fires the CRM webhook. Preview/draft → param-less.
  const publishedCalcId = useMemo(() => {
    const n = typeof calculatorId === 'number'
      ? calculatorId
      : typeof calculatorId === 'string' && /^\d+$/.test(calculatorId)
        ? Number(calculatorId)
        : NaN;
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [calculatorId]);
  const iframeSrc = publishedCalcId
    ? `/api/roofquote/widget?calc=${publishedCalcId}`
    : '/api/roofquote/widget';
  const postTenant = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !accentColor) return;
    try {
      win.postMessage(
        { type: 'qq:tenant-config', tenant: { accent: accentColor } },
        window.location.origin,
      );
    } catch { /* iframe not ready — ignored */ }
  }, [accentColor]);
  useEffect(() => { postTenant(); }, [postTenant]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {step.title && <h3 style={stepTitleStyle}>{step.title}</h3>}
      {step.subtitle && <p style={stepSubtitleStyle}>{step.subtitle}</p>}

      <iframe
        ref={iframeRef}
        onLoad={postTenant}
        src={iframeSrc}
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
