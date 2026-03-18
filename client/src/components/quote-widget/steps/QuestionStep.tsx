import QuestionRenderer from '../QuestionRenderer';
import { useWidgetState } from '../useWidgetState';
import { stepTitleStyle, stepSubtitleStyle } from '../designTokens';
import type { StepDefinition } from '@shared/wizardSchema';

interface QuestionStepProps {
  step: StepDefinition;
  accentColor?: string;
}

/**
 * Renders a single question. Takes the first question from
 * the step's questions array.
 */
export default function QuestionStep({ step, accentColor }: QuestionStepProps) {
  const { getAnswer, setAnswer } = useWidgetState();
  const question = step.questions[0];

  if (!question) {
    return <p style={{ fontSize: '14px', color: '#5f6f77' }}>No question defined for this step.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {step.title && <h3 style={stepTitleStyle}>{step.title}</h3>}
      {step.subtitle && <p style={stepSubtitleStyle}>{step.subtitle}</p>}
      <QuestionRenderer
        question={question}
        value={getAnswer(question.id)}
        onChange={(v) => setAnswer(question.id, v)}
        accentColor={accentColor}
      />
    </div>
  );
}
