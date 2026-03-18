import { Info } from 'lucide-react';
import type { StepDefinition } from '@shared/wizardSchema';

interface InfoStepProps {
  step: StepDefinition;
}

/**
 * Renders a static informational step — no user input collected.
 * Used for trust-building, instructions, or transitional content.
 */
export default function InfoStep({ step }: InfoStepProps) {
  return (
    <div className="space-y-4">
      {step.title && (
        <div className="flex items-center gap-2">
          <Info className="h-5 w-5 text-blue-500" />
          <h3 className="text-lg font-semibold">{step.title}</h3>
        </div>
      )}
      {step.subtitle && (
        <p className="text-muted-foreground">{step.subtitle}</p>
      )}
      {/* If questions exist on an info step, render them as read-only info displays */}
      {step.questions.length > 0 && (
        <div className="space-y-3">
          {step.questions.map((q) => (
            <div key={q.id} className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
              <p className="text-sm font-medium">{q.label}</p>
              {q.description && (
                <p className="mt-1 text-sm text-muted-foreground">{q.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
