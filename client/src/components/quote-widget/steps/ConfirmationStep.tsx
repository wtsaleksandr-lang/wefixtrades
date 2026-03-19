import { CheckCircle2, PartyPopper } from 'lucide-react';
import { useWidgetState } from '../useWidgetState';
import { eff, stepTitleStyle } from '../designTokens';
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
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        background: eff.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 24px',
      }}>
        <PartyPopper style={{ width: 32, height: 32, color: eff.buttonBg }} />
      </div>

      <h3 style={{ ...stepTitleStyle, textAlign: 'center', fontSize: '22px' }}>
        {step.title || config.calculator.lead_thank_you_message || "You're all set!"}
      </h3>

      {step.subtitle && (
        <p style={{ fontSize: '14px', color: eff.textBody, margin: '8px 0 0', lineHeight: 1.5 }}>
          {step.subtitle}
        </p>
      )}

      <div style={{
        maxWidth: '320px',
        margin: '24px auto 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        textAlign: 'left',
      }}>
        {leadSubmitted && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            borderRadius: eff.radiusMd,
            border: `1px solid ${eff.buttonBorder}`,
            padding: '12px 16px',
            fontSize: '14px',
            color: eff.text,
          }}>
            <CheckCircle2 style={{ width: 16, height: 16, flexShrink: 0, color: eff.buttonBg }} />
            <span>Quote details sent to your email</span>
          </div>
        )}

        {bookingConfirmed && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            borderRadius: eff.radiusMd,
            border: `1px solid ${eff.buttonBorder}`,
            padding: '12px 16px',
            fontSize: '14px',
            color: eff.text,
          }}>
            <CheckCircle2 style={{ width: 16, height: 16, flexShrink: 0, color: eff.buttonBg }} />
            <span>
              Booking confirmed for {bookingData.selectedDate} at {bookingData.selectedTime}
            </span>
          </div>
        )}

        {!leadSubmitted && !bookingConfirmed && (
          <p style={{ fontSize: '14px', color: eff.textBody, textAlign: 'center', margin: 0 }}>
            Thank you for using our estimator. We'll be in touch soon.
          </p>
        )}
      </div>

      {/* Next-step guidance */}
      <p style={{
        fontSize: '13px',
        color: eff.textBody,
        textAlign: 'center',
        margin: '24px 0 0',
        lineHeight: 1.5,
      }}>
        {leadSubmitted
          ? "Check your email for a copy of your estimate. We'll follow up within 24 hours."
          : "We'll reach out shortly to discuss your project."}
      </p>
    </div>
  );
}
