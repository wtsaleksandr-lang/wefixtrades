import type { StepDefinition, StepType } from '@shared/wizardSchema';
import QuestionStep from './steps/QuestionStep';
import MultiQuestionStep from './steps/MultiQuestionStep';
import InfoStep from './steps/InfoStep';

interface StepRendererProps {
  step: StepDefinition;
  accentColor?: string;
}

/**
 * Central step dispatcher. Maps StepDefinition.type to the
 * correct step component. Unimplemented step types render a
 * safe placeholder instead of crashing.
 */
export default function StepRenderer({ step, accentColor }: StepRendererProps) {
  switch (step.type) {
    case 'question':
      return <QuestionStep step={step} accentColor={accentColor} />;

    case 'multi_question':
      return <MultiQuestionStep step={step} accentColor={accentColor} />;

    case 'info':
      return <InfoStep step={step} />;

    // ─── Future step types (Phase 2 actions 7-10) ───
    case 'package_selection':
    case 'addon_selection':
    case 'price_reveal':
    case 'lead_capture':
    case 'booking':
    case 'confirmation':
      return <StepPlaceholder step={step} />;

    default:
      return <StepPlaceholder step={step} />;
  }
}

/** Safe fallback for step types not yet implemented */
function StepPlaceholder({ step }: { step: StepDefinition }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-muted-foreground/20 p-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">
        Step: {step.title || step.id}
      </p>
      <p className="mt-1 text-xs text-muted-foreground/60">
        Type <code className="rounded bg-muted px-1">{step.type}</code> — not yet implemented
      </p>
    </div>
  );
}
