import { CheckCircle2, ArrowRight, Search, CircleCheck } from 'lucide-react';
import { useWidgetState } from '../useWidgetState';
import { eff, stepTitleStyle } from '../designTokens';
import NextStepSuggestions from '@/components/marketing/NextStepSuggestions';
import { trackEvent } from '@/lib/trackEvent';
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
  const isDemo = config.calculator.id === 0;
  const leadSubmitted = state.lead.submitted;
  const bookingConfirmed = state.booking.confirmed;
  const bookingData = state.booking.data;

  return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <div style={{
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        background: eff.successBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 20px',
      }}>
        <CircleCheck style={{ width: 28, height: 28, color: eff.success }} />
      </div>

      <h3 style={{ ...stepTitleStyle, textAlign: 'center', fontSize: '20px' }}>
        {config.calculator.lead_thank_you_message || "Quote sent successfully"}
      </h3>

      <div style={{
        maxWidth: '380px',
        margin: '20px auto 0',
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
            padding: '14px 16px',
            fontSize: '14px',
            color: eff.text,
            background: '#fff',
          }}>
            <CheckCircle2 style={{ width: 16, height: 16, flexShrink: 0, color: eff.success }} />
            <span>Estimate sent to your email</span>
          </div>
        )}

        {bookingConfirmed && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            borderRadius: eff.radiusMd,
            border: `1px solid ${eff.buttonBorder}`,
            padding: '14px 16px',
            fontSize: '14px',
            color: eff.text,
            background: '#fff',
          }}>
            <CheckCircle2 style={{ width: 16, height: 16, flexShrink: 0, color: eff.success }} />
            <span>
              Appointment booked: {bookingData.selectedDate} at {bookingData.selectedTime}
            </span>
          </div>
        )}

        {!leadSubmitted && !bookingConfirmed && (
          <p style={{ fontSize: '14px', color: eff.textBody, textAlign: 'center', margin: 0 }}>
            Thank you for your interest. We'll be in touch shortly.
          </p>
        )}
      </div>

      {/* Next-step guidance */}
      <p style={{
        fontSize: '13px',
        color: eff.textBody,
        textAlign: 'center',
        margin: '16px 0 0',
        lineHeight: 1.6,
      }}>
        {leadSubmitted
          ? "Check your inbox for a copy of your estimate. We typically respond within a few hours."
          : "We'll reach out shortly to discuss your project."}
      </p>

      {/* Cross-tool suggestions — demo mode only */}
      {isDemo && leadSubmitted && (
        <NextStepSuggestions context="demo" theme="widget" />
      )}

      {/* QuoteQuick pitch — demo mode only */}
      {isDemo && leadSubmitted && (
        <div style={{
          maxWidth: '380px',
          margin: '24px auto 0',
          padding: '20px',
          borderRadius: eff.radiusLg,
          border: `1px solid ${eff.buttonBorder}`,
          background: eff.bgSecondary,
          textAlign: 'center',
        }}>
          <p style={{
            fontSize: '16px',
            fontWeight: 700,
            color: eff.text,
            margin: '0 0 6px',
          }}>
            Want Instant Quotes on Your Website?
          </p>
          <p style={{
            fontSize: '13px',
            color: eff.textBody,
            lineHeight: 1.5,
            margin: '0 0 16px',
          }}>
            QuoteQuick lets your customers get prices in seconds and sends every lead straight to you.
          </p>
          <a
            href="/signup?product=quotequick"
            onClick={() => trackEvent("demo_primary_cta_clicked", { target: "/signup?product=quotequick" })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              borderRadius: eff.radiusMd,
              background: eff.buttonBg,
              color: '#fff',
              fontSize: '14px',
              fontWeight: 700,
              textDecoration: 'none',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = eff.buttonBgHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = eff.buttonBg; }}
          >
            Get QuoteQuick — From $49/mo
            <ArrowRight style={{ width: 14, height: 14 }} />
          </a>
          <div style={{ marginTop: '12px' }}>
            <a
              href="/tools/free-audit"
              onClick={() => trackEvent("demo_secondary_cta_clicked", { target: "/tools/free-audit" })}
              style={{
                fontSize: '13px',
                color: eff.textBody,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = eff.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = eff.textBody; }}
            >
              <Search style={{ width: 12, height: 12 }} />
              Check your business visibility
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
