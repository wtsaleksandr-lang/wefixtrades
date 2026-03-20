import { useMemo } from 'react';
import QuestionRenderer from '../QuestionRenderer';
import { useWidgetState } from '../useWidgetState';
import { calculateEstimate } from '@shared/calculateEstimate';
import { eff, stepTitleStyle, stepSubtitleStyle } from '../designTokens';
import type { StepDefinition } from '@shared/wizardSchema';

interface AddonSelectionStepProps {
  step: StepDefinition;
  accentColor?: string;
}

/**
 * Renders add-on selection. Delegates to CheckboxGroupQuestion
 * via QuestionRenderer. The step's question was pre-built by
 * widgetFlowBuilder with options from the pricing config's addOns[].
 *
 * If no question defined, falls back to reading add-ons directly
 * from the pricing config.
 */
export default function AddonSelectionStep({ step, accentColor }: AddonSelectionStepProps) {
  const { getAnswer, setAnswer, config, estimateInputs } = useWidgetState();

  const estimate = useMemo(
    () => calculateEstimate(config.pricingConfig, estimateInputs),
    [config.pricingConfig, estimateInputs],
  );

  const question = step.questions[0];

  // Fallback: synthesize from pricing config add-ons
  if (!question) {
    const pc = config.pricingConfig;
    const addOns = 'addOns' in pc && pc.addOns?.length ? pc.addOns : null;

    if (!addOns) {
      return (
        <div style={{ padding: '16px', textAlign: 'center', fontSize: '14px', color: '#5f6f77' }}>
          No add-ons available.
        </div>
      );
    }

    const synth = {
      id: 'addon_selection',
      type: 'checkbox_group' as const,
      label: 'Add extras to your service',
      maps_to: 'selected_add_on_ids' as const,
      default_value: addOns.filter(a => a.default).map(a => a.id),
      options: addOns.map(a => ({
        value: a.id,
        label: a.label,
        description: a.type === 'pct' ? `+${a.amount}%` : `+$${a.amount}`,
      })),
      validation: [],
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {step.title && <h3 style={stepTitleStyle}>{step.title}</h3>}
        {step.subtitle && <p style={stepSubtitleStyle}>{step.subtitle}</p>}
        <QuestionRenderer
          question={synth}
          value={getAnswer('addon_selection') ?? synth.default_value}
          onChange={(v) => setAnswer('addon_selection', v)}
          accentColor={accentColor}
        />
        <RunningTotal estimate={estimate} />
      </div>
    );
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
      <RunningTotal estimate={estimate} />
    </div>
  );
}

function RunningTotal({ estimate }: { estimate: ReturnType<typeof calculateEstimate> | null }) {
  if (!estimate || estimate.type === 'call_for_quote') return null;

  const display = estimate.type === 'range'
    ? `$${estimate.rangeMin!.toLocaleString()} – $${estimate.rangeMax!.toLocaleString()}`
    : `$${estimate.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTop: `1px solid ${eff.buttonBorder}`,
      paddingTop: '16px',
    }}>
      <span style={{ fontSize: '13px', color: eff.textBody, fontWeight: 500 }}>
        Current estimate
      </span>
      <span style={{
        fontSize: '18px',
        fontWeight: 700,
        color: eff.text,
        fontFamily: eff.fontMono,
        letterSpacing: '-0.01em',
      }}>
        {display}
      </span>
    </div>
  );
}
