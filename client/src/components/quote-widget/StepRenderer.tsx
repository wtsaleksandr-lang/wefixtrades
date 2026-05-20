import type { StepDefinition, StepType } from '@shared/wizardSchema';
import QuestionStep from './steps/QuestionStep';
import MultiQuestionStep from './steps/MultiQuestionStep';
import InfoStep from './steps/InfoStep';
import PriceRevealStep from './steps/PriceRevealStep';
import PackageSelectionStep from './steps/PackageSelectionStep';
import AddonSelectionStep from './steps/AddonSelectionStep';
import LeadCaptureStep from './steps/LeadCaptureStep';
import BookingStep from './steps/BookingStep';
import DepositStep from './steps/DepositStep';
import SchedulingStep from './steps/SchedulingStep';
import ConfirmationStep from './steps/ConfirmationStep';

interface StepRendererProps {
  step: StepDefinition;
  accentColor?: string;
}

/**
 * Central step dispatcher. Maps StepDefinition.type to the
 * correct step component. All 9 step types are now implemented.
 */
export default function StepRenderer({ step, accentColor }: StepRendererProps) {
  switch (step.type) {
    case 'question':
      return <QuestionStep step={step} accentColor={accentColor} />;

    case 'multi_question':
      return <MultiQuestionStep step={step} accentColor={accentColor} />;

    case 'info':
      return <InfoStep step={step} />;

    case 'price_reveal':
      return <PriceRevealStep step={step} accentColor={accentColor} />;

    case 'package_selection':
      return <PackageSelectionStep step={step} accentColor={accentColor} />;

    case 'addon_selection':
      return <AddonSelectionStep step={step} accentColor={accentColor} />;

    case 'lead_capture':
      return <LeadCaptureStep step={step} accentColor={accentColor} />;

    case 'booking':
      return <BookingStep step={step} accentColor={accentColor} />;

    case 'deposit':
      return <DepositStep step={step} accentColor={accentColor} />;

    case 'scheduling':
      return <SchedulingStep step={step} accentColor={accentColor} />;

    case 'confirmation':
      return <ConfirmationStep step={step} accentColor={accentColor} />;

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
