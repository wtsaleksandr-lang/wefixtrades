import { useMemo } from 'react';
import { ChevronLeft, ArrowRight } from 'lucide-react';
import { validatePricingConfig } from '@shared/pricingConfig';
import { getTemplateById } from '@shared/templateLibrary';
import { buildWidgetFlow, type FlowBuilderSettings } from '@shared/widgetFlowBuilder';
import { getWidgetTheme } from '@/theme/widgetTheme';
import { WidgetProvider } from './WidgetContext';
import { useWidgetState } from './useWidgetState';
import StepRenderer from './StepRenderer';
import { evaluateVisibility } from './visibility';
import type { CalculatorData, WidgetConfig } from './types';

/* ─── Public Props (matches CalculatorWidget interface) ─── */

interface QuoteWidgetProps {
  calculator: CalculatorData;
  isEmbed?: boolean;
}

/**
 * QuoteWidget — schema-driven replacement for CalculatorWidget.
 *
 * 1. Validates pricing config
 * 2. Resolves template
 * 3. Builds WizardFlow via widgetFlowBuilder
 * 4. Wraps children in WidgetProvider (state context)
 * 5. Renders current step via StepRenderer
 */
export default function QuoteWidget({ calculator, isEmbed = false }: QuoteWidgetProps) {
  const config = useMemo<WidgetConfig>(() => {
    const validation = validatePricingConfig(calculator.pricing_config);
    const pricingConfig = validation.config;

    const calcSettings = (calculator.calculator_settings || {}) as Record<string, any>;
    const uiTemplate = calcSettings.ui_template || {};
    const templateId: string = uiTemplate.template_id || 'classic_single';
    const template = getTemplateById(templateId) || getTemplateById('classic_single')!;

    const bookingSettings = calcSettings.booking_settings || {};
    const flowSettings: FlowBuilderSettings = {
      calculatorType: calcSettings.calculator_type,
      bookingEnabled:
        calcSettings.calculator_type === 'estimate_plus_booking' &&
        bookingSettings.enabled === true,
      leadForm: calcSettings.lead_form,
      promotionsEnabled: calcSettings.promotions?.enabled === true,
      quoteRules: calcSettings.quote_rules,
    };

    const flow = buildWidgetFlow(pricingConfig, template, flowSettings);

    return { calculator, pricingConfig, template, flow, isEmbed };
  }, [calculator, isEmbed]);

  const theme = useMemo(
    () => getWidgetTheme(calculator.theme_overrides as any, calculator.primary_color),
    [calculator.theme_overrides, calculator.primary_color],
  );

  return (
    <WidgetProvider config={config}>
      <div
        className="mx-auto w-full max-w-2xl"
        style={{ fontFamily: theme.typography.fontFamily }}
      >
        <WidgetCard theme={theme} calculator={calculator} />
      </div>
    </WidgetProvider>
  );
}

/* ─── Inner Card (needs context) ─── */

function WidgetCard({
  theme,
  calculator,
}: {
  theme: ReturnType<typeof getWidgetTheme>;
  calculator: CalculatorData;
}) {
  const {
    currentStep,
    currentStepIndex,
    totalSteps,
    nextStep,
    prevStep,
    isFirstStep,
    isLastStep,
    answers,
    config,
  } = useWidgetState();

  const accentColor = theme.colors.primary;

  // Filter visible steps for progress display
  const visibleStepCount = config.flow.steps.filter((s) => {
    if (!s.visible_when?.length) return true;
    return evaluateVisibility(s.visible_when, answers);
  }).length;

  const showProgress =
    currentStep.config.show_progress &&
    config.flow.settings.progress_style !== 'hidden' &&
    visibleStepCount > 1;

  // Step types that own their own submit/advance action.
  // These must not show a generic Continue button that would skip them.
  const selfAdvancingSteps = new Set(['lead_capture', 'booking', 'confirmation']);
  const isSelfAdvancing = selfAdvancingSteps.has(currentStep.type);

  // Determine if nav buttons should show
  const showBack = config.flow.settings.allow_back_navigation && !isFirstStep;
  const showNext = !isLastStep && !isSelfAdvancing;
  const canSkip = currentStep.config.can_skip && !isSelfAdvancing;

  return (
    <div
      className="rounded-2xl border bg-white shadow-sm overflow-hidden"
      style={{ boxShadow: theme.shadows.card }}
    >
      {/* ─── Header ─── */}
      {(calculator.business_name || calculator.logo_url) && (
        <div className="border-b px-6 py-4 flex items-center gap-3">
          {calculator.logo_url && (
            <img
              src={calculator.logo_url}
              alt={calculator.business_name}
              className="h-8 w-8 rounded-lg object-contain"
            />
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">
              {calculator.business_name}
            </p>
            {calculator.tagline && (
              <p className="text-xs text-muted-foreground">{calculator.tagline}</p>
            )}
          </div>
        </div>
      )}

      {/* ─── Progress Bar ─── */}
      {showProgress && (
        <div className="px-6 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              Step {currentStepIndex + 1} of {visibleStepCount}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${((currentStepIndex + 1) / visibleStepCount) * 100}%`,
                backgroundColor: accentColor,
              }}
            />
          </div>
        </div>
      )}

      {/* ─── Step Content ─── */}
      <div className="px-6 py-6">
        <StepRenderer step={currentStep} accentColor={accentColor} />
      </div>

      {/* ─── Navigation ─── */}
      {(showBack || showNext || canSkip) && (
        <div className="border-t px-6 py-4 flex items-center justify-between">
          <div>
            {showBack && (
              <button
                type="button"
                onClick={prevStep}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canSkip && (
              <button
                type="button"
                onClick={nextStep}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip
              </button>
            )}
            {showNext && (
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: theme.colors.gradientButton }}
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
