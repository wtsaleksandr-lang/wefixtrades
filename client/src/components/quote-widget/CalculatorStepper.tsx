/**
 * BD-2a — multi-step renderer progress indicator + Next / Back controls.
 *
 * Research (BD-0 punch list): multi-step quote forms convert at 13.85% vs
 * 4.53% for single-form (3x), up to 16.9x in interactive-form samples.
 *
 * This is a presentational component. The step list itself is computed by
 * `AdvancedCalculator` (either from an explicit `steps[]` declaration on
 * the template or auto-derived from the field list — base/required → modifiers
 * → photos/notes → contact). The stepper just shows progress + drives index.
 *
 * Mobile shows an explicit "Step N/M" counter beside the progress bar so
 * the user always knows where they are. Desktop hides the counter and lets
 * the dots/bar speak for themselves.
 */
import type { CSSProperties } from 'react';
import type { WidgetTheme } from './widgetThemes';

interface Step {
  /** Stable id for keying. */
  id: string;
  /** Short label rendered above the bar on desktop (e.g. "Basics"). */
  label?: string;
}

interface Props {
  /** Ordered list of steps; rendered as dots or thin bar segments. */
  steps: Step[];
  /** Zero-based current step index. */
  current: number;
  /** Resolved widget theme (for accent / borders). */
  theme: WidgetTheme;
  /** Visual style — `bar` is a thin segmented bar; `dots` shows pips. */
  variant?: 'bar' | 'dots';
}

/**
 * Render the progress indicator. The dot/bar segments share the same accent
 * tint logic so the indicator stays legible on any theme background.
 */
export default function CalculatorStepper({
  steps, current, theme, variant = 'bar',
}: Props) {
  if (steps.length <= 1) return null;
  const accent = theme.accent;
  const muted = theme.border;
  const totalSteps = steps.length;
  const safeCurrent = Math.max(0, Math.min(current, totalSteps - 1));
  const progressPct = ((safeCurrent + 1) / totalSteps) * 100;

  const counterStyle: CSSProperties = {
    fontSize: '11px', fontWeight: 700, color: theme.textMuted,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    flexShrink: 0,
  };

  return (
    <div
      data-testid="calculator-stepper"
      data-component-name="Stepper"
      data-component-type="stepper"
      data-current-step={safeCurrent + 1}
      data-total-steps={totalSteps}
      data-theme="light"
      style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: '10px 16px 0', width: '100%', boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
        {/* Mobile counter — N/M chip. Always rendered; the inline style sits
            it at the start so the bar fills the remaining width. The dot
            variant uses the same chip for parity. */}
        <span
          data-testid="calculator-stepper-counter"
          style={counterStyle}
        >
          {safeCurrent + 1} / {totalSteps}
        </span>

        {variant === 'bar' ? (
          <div
            data-testid="calculator-stepper-bar"
            role="progressbar"
            aria-label="Quote progress"
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-valuenow={safeCurrent + 1}
            aria-valuetext={`Step ${safeCurrent + 1} of ${totalSteps}`}
            style={{
              flex: 1, height: 4, borderRadius: 999,
              background: muted, overflow: 'hidden', minWidth: 0,
            }}
          >
            <div
              style={{
                width: `${progressPct}%`, height: '100%',
                background: accent, transition: 'width 0.25s ease-out',
              }}
            />
          </div>
        ) : (
          // BD-2a-polish — design-system rule: button-choice / step pip clusters
          // sit flush at 1-2px. Was 6px; tightened to 2px so the dots read as
          // a single step bar rather than a loose row of disconnected pips.
          <div
            data-testid="calculator-stepper-dots"
            style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 2,
              justifyContent: 'flex-end', minWidth: 0,
            }}
          >
            {steps.map((s, i) => {
              const active = i === safeCurrent;
              const done = i < safeCurrent;
              return (
                <span
                  key={s.id}
                  aria-label={s.label || `Step ${i + 1}`}
                  data-active={active ? 'true' : 'false'}
                  data-done={done ? 'true' : 'false'}
                  style={{
                    width: active ? 16 : 8, height: 8, borderRadius: 999,
                    background: done || active ? accent : muted,
                    transition: 'width 0.18s ease, background 0.18s ease',
                    flexShrink: 0,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Next / Back / Submit controls — rendered at the bottom of each step.
 * Kept in this module so the stepper layout (progress + controls) feels
 * cohesive even though `AdvancedCalculator` owns the index state.
 */
interface StepperControlsProps {
  current: number;
  total: number;
  theme: WidgetTheme;
  /** Optional radius for the buttons; falls back to 10px. */
  radiusPx?: string;
  /** Font stack from the resolved style tab choice. */
  fontFamily?: string;
  /** Label for the primary advance button on non-final steps. */
  nextLabel?: string;
  /**
   * BG-7 Item 6 — optional override for the secondary Back button. When
   * set, supersedes the default "← Back". Treated as sanitized HTML when
   * `backLabelIsHtml` is true (set by AdvancedCalculator when reading the
   * value from `style.buttonCopy.back`).
   */
  backLabel?: string;
  /** BG-7 Item 6 — whether `backLabel` / `nextLabel` should be rendered as
   *  sanitized HTML (true) vs plain text (false, default). */
  buttonCopyIsHtml?: boolean;
  /** Disable the advance button (e.g. final step contact form not yet valid). */
  canAdvance?: boolean;
  onBack: () => void;
  onNext: () => void;
  /** When the user is on the final step, hide the Next button — the final
   *  step renders its own primary CTA (Email me / Book consultation). */
  hideNextOnFinal?: boolean;
  /**
   * BD-3l — when true, the primary Next button carries `data-qq-cta-pulse`
   * + `--qq-cta-base` so the Premium Animations Pack's conic-gradient
   * rotation lights up. Default false — pulse is opt-in per widget.
   */
  ctaPulse?: boolean;
}

export function StepperControls({
  current, total, theme, radiusPx = '10px', fontFamily,
  nextLabel = 'Continue', backLabel, buttonCopyIsHtml = false,
  canAdvance = true, onBack, onNext,
  hideNextOnFinal = true, ctaPulse = false,
}: StepperControlsProps) {
  const isFirst = current === 0;
  const isLast = current === total - 1;
  if (isFirst && isLast) return null;
  const accent = theme.accent;

  return (
    <div
      data-testid="calculator-stepper-controls"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, marginTop: 4, width: '100%', boxSizing: 'border-box',
      }}
    >
      <button
        type="button"
        onClick={onBack}
        disabled={isFirst}
        data-testid="calculator-stepper-back"
        style={{
          height: 40, padding: '0 14px', borderRadius: radiusPx,
          background: 'transparent', color: theme.text,
          border: `1px solid ${theme.border}`,
          fontSize: 13, fontWeight: 600, fontFamily,
          cursor: isFirst ? 'not-allowed' : 'pointer',
          opacity: isFirst ? 0.4 : 1,
        }}
        // BG-7 Item 6 — owner override (sanitized HTML); fall back to the
        // default "← Back" when no override is set.
        {...(backLabel && buttonCopyIsHtml
          ? { dangerouslySetInnerHTML: { __html: backLabel } }
          : null)}
      >
        {!(backLabel && buttonCopyIsHtml) && (backLabel || '← Back')}
      </button>
      {(!isLast || !hideNextOnFinal) && (
        <button
          type="button"
          onClick={onNext}
          disabled={!canAdvance}
          data-testid="calculator-stepper-next"
          // BD-3l — opt-in CTA gradient pulse. Attribute + CSS var are
          // both safe when the Premium pack is off (rules don't match).
          {...(ctaPulse ? { 'data-qq-cta-pulse': '' } : null)}
          style={{
            height: 40, padding: '0 18px', borderRadius: radiusPx,
            background: accent, color: '#ffffff', border: 'none',
            fontSize: 13, fontWeight: 800, fontFamily,
            cursor: canAdvance ? 'pointer' : 'not-allowed',
            opacity: canAdvance ? 1 : 0.5, letterSpacing: '0.01em',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            // BD-3l — relative positioning so the pulse shimmer
            // ::after overlay anchors correctly. No visual change when
            // pack is off.
            position: 'relative',
            ['--qq-cta-base' as string]: String(accent),
          }}
        >
          {/* BG-7 Item 6 — sanitized HTML override OR plain-text label. */}
          {buttonCopyIsHtml
            ? <span dangerouslySetInnerHTML={{ __html: nextLabel }} />
            : nextLabel}
          {' '}<span style={{ fontSize: 15 }}>→</span>
        </button>
      )}
    </div>
  );
}
