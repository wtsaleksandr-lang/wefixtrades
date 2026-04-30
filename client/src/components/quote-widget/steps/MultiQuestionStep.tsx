import { useMemo } from 'react';
import QuestionRenderer from '../QuestionRenderer';
import { useWidgetState } from '../useWidgetState';
import { stepTitleStyle, stepSubtitleStyle } from '../designTokens';
import type { StepDefinition } from '@shared/wizardSchema';
import { evaluateVisibility } from '../visibility';

interface MultiQuestionStepProps {
  step: StepDefinition;
  accentColor?: string;
}

/**
 * Renders multiple questions vertically in a single step.
 * Supports per-question visibility conditions.
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
      {visibleQuestions.map((question) => (
        <QuestionRenderer
          key={question.id}
          question={question}
          value={getAnswer(question.id)}
          onChange={(v) => setAnswer(question.id, v)}
          accentColor={accentColor}
        />
      ))}
      {visibleQuestions.length === 0 && (
        <p style={{ fontSize: '14px', color: '#5f6f77' }}>No questions to display.</p>
      )}
    </div>
  );
}
