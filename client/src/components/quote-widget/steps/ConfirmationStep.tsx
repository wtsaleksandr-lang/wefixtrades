import { CheckCircle2, PartyPopper } from 'lucide-react';
import { useWidgetState } from '../useWidgetState';
import type { StepDefinition } from '@shared/wizardSchema';

interface ConfirmationStepProps {
  step: StepDefinition;
  accentColor?: string;
}

/**
 * Final confirmation step. Shows a thank-you / success state
 * after lead submission and optional booking confirmation.
 */
export default function ConfirmationStep({ step, accentColor }: ConfirmationStepProps) {
  const { config, state } = useWidgetState();
  const leadSubmitted = state.lead.submitted;
  const bookingConfirmed = state.booking.confirmed;
  const bookingData = state.booking.data;

  return (
    <div className="space-y-4 text-center py-6">
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: accentColor ? `${accentColor}15` : '#f0fdf4' }}
      >
        <PartyPopper className="h-8 w-8" style={{ color: accentColor || '#22c55e' }} />
      </div>

      <h3 className="text-xl font-semibold">
        {step.title || config.calculator.lead_thank_you_message || "You're all set!"}
      </h3>

      {step.subtitle && (
        <p className="text-muted-foreground">{step.subtitle}</p>
      )}

      <div className="mx-auto max-w-sm space-y-3 text-left">
        {leadSubmitted && (
          <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
            <span>Quote details sent to your email</span>
          </div>
        )}

        {bookingConfirmed && (
          <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
            <span>
              Booking confirmed for {bookingData.selectedDate} at {bookingData.selectedTime}
            </span>
          </div>
        )}

        {!leadSubmitted && !bookingConfirmed && (
          <p className="text-sm text-muted-foreground text-center">
            Thank you for using our estimator. We'll be in touch soon.
          </p>
        )}
      </div>
    </div>
  );
}
