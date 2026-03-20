import { Info } from 'lucide-react';
import { eff, stepTitleStyle, stepSubtitleStyle } from '../designTokens';
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {step.title && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info style={{ width: 20, height: 20, color: eff.accent, flexShrink: 0 }} />
          <h3 style={stepTitleStyle}>{step.title}</h3>
        </div>
      )}
      {step.subtitle && <p style={stepSubtitleStyle}>{step.subtitle}</p>}
      {step.questions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {step.questions.map((q) => (
            <div
              key={q.id}
              style={{
                borderRadius: eff.radiusMd,
                border: `1px solid ${eff.buttonBorder}`,
                background: eff.bgSecondary,
                padding: '16px',
              }}
            >
              <p style={{ fontSize: '14px', fontWeight: 600, color: eff.text, margin: 0 }}>{q.label}</p>
              {q.description && (
                <p style={{ fontSize: '13px', color: eff.textBody, margin: '4px 0 0', lineHeight: 1.5 }}>{q.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
