import QuestionRenderer from '../QuestionRenderer';
import { useWidgetState } from '../useWidgetState';
import { stepTitleStyle, stepSubtitleStyle } from '../designTokens';
import type { StepDefinition } from '@shared/wizardSchema';

interface PackageSelectionStepProps {
  step: StepDefinition;
  accentColor?: string;
}

/**
 * Renders the package selection step. Delegates to PackageCardQuestion
 * via QuestionRenderer for the actual card rendering. The step wrapper
 * provides the title/subtitle chrome and reads/writes through widget state.
 *
 * If the step has no questions (auto-generated flow), it reads directly
 * from the pricing config's tiers via the config context.
 */
export default function PackageSelectionStep({ step, accentColor }: PackageSelectionStepProps) {
  const { getAnswer, setAnswer, config } = useWidgetState();

  // Use the step's first question if available
  const question = step.questions[0];

  // If no question defined but pricing config has tiers, synthesize one
  if (!question) {
    const pc = config.pricingConfig;
    if (pc.pricingType === 'tiered_packages' && pc.tiers?.length) {
      const synth = {
        id: 'package_tier',
        type: 'package_card' as const,
        label: 'Choose your package',
        packages: pc.tiers.map((t, i) => ({
          id: String(i),
          label: t.label,
          price: t.price,
          features: [] as string[],
          highlighted: i === 1,
        })),
        maps_to: 'selected_tier_index' as const,
        default_value: 0,
        validation: [],
      };
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {step.title && <h3 style={stepTitleStyle}>{step.title}</h3>}
          {step.subtitle && <p style={stepSubtitleStyle}>{step.subtitle}</p>}
          <QuestionRenderer
            question={synth}
            value={getAnswer('package_tier') ?? 0}
            onChange={(v) => setAnswer('package_tier', v)}
            accentColor={accentColor}
          />
        </div>
      );
    }

    return (
      <div style={{ padding: '16px', textAlign: 'center', fontSize: '14px', color: '#5f6f77' }}>
        No packages configured for this calculator.
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
    </div>
  );
}
