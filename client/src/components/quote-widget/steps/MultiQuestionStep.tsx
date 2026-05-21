import { useMemo } from 'react';
import QuestionRenderer from '../QuestionRenderer';
import { useWidgetState } from '../useWidgetState';
import { stepTitleStyle, stepSubtitleStyle } from '../designTokens';
import type { QuestionDefinition, StepDefinition } from '@shared/wizardSchema';
import { evaluateVisibility } from '../visibility';

interface MultiQuestionStepProps {
  step: StepDefinition;
  accentColor?: string;
}

/**
 * Renders multiple questions in a single step.
 *
 * Wave W-LAYOUT — supports a 2-column grid when questions opt into
 * `width: 'half'`. Mirrors AdvancedCalculator's `colSpan` behavior:
 * default 'full' = the question spans both columns; 'half' = it
 * spans one. Mobile container queries (handled at the widget shell
 * via the `qq-w-narrow` class on <560px containers) collapse the
 * grid to a single column, so half-width questions stack like the
 * legacy layout on phones.
 */
export default function MultiQuestionStep({ step, accentColor }: MultiQuestionStepProps) {
  const { getAnswer, setAnswer, answers } = useWidgetState();

  const visibleQuestions = useMemo(
    () => step.questions.filter((q) => {
      if (!q.visible_when?.length) return true;
      return evaluateVisibility(q.visible_when, answers);
    }),
    [step.questions, answers],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {step.title && <h3 style={stepTitleStyle}>{step.title}</h3>}
      {step.subtitle && <p style={stepSubtitleStyle}>{step.subtitle}</p>}

      {/* Wave W-LAYOUT — 2-col grid; half-width questions occupy one
          track, full-width ones span both. Pairing is purely visual —
          two half-widths adjacent in the visible list naturally land
          on the same row because of grid flow.

          The scoped <style> block collapses the grid to a single
          column at <=360px (smallest phones), matching the legacy
          stacked layout. Mirrors the pattern in AdvancedCalculator. */}
      <style>{`
        .qq-w-mq-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 24px;
        }
        .qq-w-mq-grid > * { min-width: 0; }
        .qq-w-mq-grid > [data-question-width="full"] { grid-column: span 2; }
        .qq-w-mq-grid > [data-question-width="half"] { grid-column: span 1; }
        @media (max-width: 360px) {
          .qq-w-mq-grid > [data-question-width="half"] { grid-column: span 2; }
        }
      `}</style>
      <div className="qq-w-mq-grid" data-testid="multi-question-grid">
        {visibleQuestions.map((question) => {
          const width = (question as QuestionDefinition).width ?? 'full';
          return (
            <div key={question.id} data-question-width={width}>
              <QuestionRenderer
                question={question}
                value={getAnswer(question.id)}
                onChange={(v) => setAnswer(question.id, v)}
                accentColor={accentColor}
              />
            </div>
          );
        })}
      </div>

      {visibleQuestions.length === 0 && (
        <p style={{ fontSize: '14px', color: '#5f6f77' }}>No questions to display.</p>
      )}
    </div>
  );
}
