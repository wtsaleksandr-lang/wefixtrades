import QuestionRenderer from '../QuestionRenderer';
import { useWidgetState } from '../useWidgetState';
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
    return <p className="text-sm text-muted-foreground">No question defined for this step.</p>;
  }

  return (
    <div className="space-y-4">
      {step.title && <h3 className="text-lg font-semibold">{step.title}</h3>}
      {step.subtitle && <p className="text-sm text-muted-foreground">{step.subtitle}</p>}
      <QuestionRenderer
        question={question}
        value={getAnswer(question.id)}
        onChange={(v) => setAnswer(question.id, v)}
        accentColor={accentColor}
      />
    </div>
  );
}
