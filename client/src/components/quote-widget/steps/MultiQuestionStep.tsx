import QuestionRenderer from '../QuestionRenderer';
import { useWidgetState } from '../useWidgetState';
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

  const visibleQuestions = step.questions.filter((q) => {
    if (!q.visible_when?.length) return true;
    return evaluateVisibility(q.visible_when, answers);
  });

  return (
    <div className="space-y-6">
      {step.title && <h3 className="text-lg font-semibold">{step.title}</h3>}
      {step.subtitle && <p className="text-sm text-muted-foreground">{step.subtitle}</p>}
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
        <p className="text-sm text-muted-foreground">No questions to display.</p>
      )}
    </div>
  );
}
