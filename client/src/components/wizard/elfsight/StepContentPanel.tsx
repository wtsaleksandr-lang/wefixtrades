// StepContentPanel — BG-7 Item 4.
//
// Surfaces the active template's `steps[]` array so the wizard owner can
// add a rich-text `description` to each step (the long-form explanatory
// copy rendered between the step title and the first field at runtime).
//
// Renders nothing when the active template doesn't ship an explicit steps
// list — the renderer's auto-derived steps still work, but descriptions
// need an explicit step to attach to (BD-2a). Adding a per-step
// description on top of the auto-derived stepper would require this
// panel to also let owners DEFINE the step grouping, which is a much
// larger surface and out of scope for this cleanup wave.
//
// HARD RULES (BG-7 brief):
//  - Reuse BD-3d's RichTextField (standard variant) + sanitizer.
//  - Reuse BD-3f section-title-in-container pattern (legend at the top
//    of the fieldset, body padded below the hairline divider).
//  - BD-3h help cue with region="step-content".

import { platformTheme } from '@/theme/platformTheme';
import type { TemplateStep } from '@shared/templatePresets';
import InfoCue from './InfoCue';
import RichTextField from './RichTextField';

const p = platformTheme;

interface Props {
  steps: TemplateStep[] | undefined;
  onChange: (next: TemplateStep[]) => void;
}

export default function StepContentPanel({ steps, onChange }: Props) {
  // When the active template doesn't carry an explicit `steps[]` array,
  // we don't render the panel at all (see file-level comment for the
  // rationale). The renderer still auto-derives steps from the field
  // list; descriptions attach in a future wave that lets owners define
  // the step grouping.
  if (!steps || steps.length === 0) return null;

  const update = (idx: number, next: Partial<TemplateStep>) => {
    const arr = [...steps];
    arr[idx] = { ...arr[idx], ...next };
    onChange(arr);
  };

  return (
    <section
      className="qq-step-content-panel"
      data-testid="editor-step-content-panel"
      aria-label="Step content"
    >
      <header className="qq-step-content-header">
        <h3 className="qq-step-content-title">
          Step content
          <InfoCue
            testid="build-section-step-content"
            region="step-content"
            text="Optional long-form explanatory copy for each step. Renders between the step title and the first field in the widget. Empty = no description shown."
          />
        </h3>
      </header>

      <div className="qq-step-content-body">
        {steps.map((s, i) => (
          <div
            key={s.id}
            className="qq-step-content-row"
            data-testid={`editor-step-content-row-${i}`}
            style={{
              padding: 10,
              background: '#fff',
              border: `1px solid ${p.colors.borderLight}`,
              borderRadius: 8,
              display: 'flex', flexDirection: 'column', gap: 6,
            }}
          >
            <div
              style={{
                fontSize: 11.5, fontWeight: 700,
                color: p.colors.muted,
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}
            >
              Step {i + 1} — {s.label}
            </div>
            <RichTextField
              label="Description (optional)"
              htmlFor={`editor-step-content-description-${i}`}
              value={s.description ?? ''}
              onChange={(next) => update(i, { description: next })}
              placeholder="Optional — describe this step in the widget."
              testid={`editor-step-content-description-${i}`}
            />
          </div>
        ))}
      </div>

      <style>{`
        .qq-step-content-panel {
          display: flex; flex-direction: column; gap: 6px;
        }
        .qq-step-content-header {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px;
          margin: 0;
        }
        .qq-step-content-title {
          margin: 0;
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 11.5px; font-weight: 600;
          color: ${p.colors.muted};
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .qq-step-content-body {
          display: flex; flex-direction: column; gap: 6px;
        }
      `}</style>
    </section>
  );
}
