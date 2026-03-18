import QuestionRenderer from '../QuestionRenderer';
import { useWidgetState } from '../useWidgetState';
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
  const { getAnswer, setAnswer, config } = useWidgetState();

  const question = step.questions[0];

  // Fallback: synthesize from pricing config add-ons
  if (!question) {
    const pc = config.pricingConfig;
    const addOns = 'addOns' in pc && pc.addOns?.length ? pc.addOns : null;

    if (!addOns) {
      return (
        <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
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
      <div className="space-y-4">
        {step.title && <h3 className="text-lg font-semibold">{step.title}</h3>}
        {step.subtitle && <p className="text-sm text-muted-foreground">{step.subtitle}</p>}
        <QuestionRenderer
          question={synth}
          value={getAnswer('addon_selection') ?? synth.default_value}
          onChange={(v) => setAnswer('addon_selection', v)}
          accentColor={accentColor}
        />
      </div>
    );
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
