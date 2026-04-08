import { useMemo, useEffect, useRef, Component, type ReactNode } from 'react';
import { ChevronLeft, ArrowRight, AlertTriangle } from 'lucide-react';
import { trackEvent } from '@/lib/trackEvent';
import { validatePricingConfig, CALL_FOR_QUOTE_FALLBACK } from '@shared/pricingConfig';
import { getTemplateById } from '@shared/templateLibrary';
import { buildWidgetFlow, type FlowBuilderSettings } from '@shared/widgetFlowBuilder';
import { getWidgetTheme } from '@/theme/widgetTheme';
import { WidgetProvider } from './WidgetContext';
import { useWidgetState } from './useWidgetState';
import StepRenderer from './StepRenderer';
import StepHelp from './StepHelp';
import { evaluateVisibility } from './visibility';
import type { CalculatorData, WidgetConfig } from './types';

import { eff } from './designTokens';

/* ─── Error Boundary ─── */

interface ErrorBoundaryState { error: Error | null }

class WidgetErrorBoundary extends Component<{ children: ReactNode; businessName?: string }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    console.error('[QuoteWidget] Render error:', error);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          maxWidth: '576px', margin: '0 auto', padding: '40px 24px',
          textAlign: 'center', fontFamily: eff.font,
        }}>
          <AlertTriangle style={{ width: 32, height: 32, color: '#d97706', margin: '0 auto 16px' }} />
          <p style={{ fontSize: '16px', fontWeight: 600, color: eff.text, margin: '0 0 8px' }}>
            Something went wrong loading this calculator
          </p>
          <p style={{ fontSize: '14px', color: eff.textBody, margin: 0 }}>
            Please refresh the page or contact {this.props.businessName || 'the business'} directly.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    // Guard: missing or null pricing_config falls back to call-for-quote
    const rawPricing = calculator.pricing_config ?? CALL_FOR_QUOTE_FALLBACK;
    const validation = validatePricingConfig(rawPricing);
    if (!validation.valid) {
      console.warn('[QuoteWidget] Invalid pricing config, using fallback:', validation.errors);
    }
    const pricingConfig = validation.config;

    const calcSettings = (calculator.calculator_settings || {}) as Record<string, any>;
    const uiTemplate = calcSettings.ui_template || {};
    const templateId: string = uiTemplate.template_id || 'classic_single';
    // Guard: invalid template ID falls back to classic_single
    const template = getTemplateById(templateId) || getTemplateById('classic_single')!;
    if (!getTemplateById(templateId)) {
      console.warn(`[QuoteWidget] Unknown template "${templateId}", using classic_single`);
    }

    const bookingSettings = calcSettings.booking_settings || {};
    const flowSettings: FlowBuilderSettings = {
      calculatorType: calcSettings.calculator_type,
      bookingEnabled:
        calcSettings.calculator_type === 'estimate_plus_booking' &&
        bookingSettings.enabled === true,
      leadForm: calcSettings.lead_form,
      promotionsEnabled: calcSettings.promotions?.enabled === true,
      quoteRules: calcSettings.quote_rules,
      serviceTypes: calcSettings.serviceTypes,
    };

    const flow = buildWidgetFlow(pricingConfig, template, flowSettings);

    // Guard: empty steps — ensure at least lead_capture + confirmation
    if (!flow.steps || flow.steps.length === 0) {
      console.warn('[QuoteWidget] Flow produced 0 steps, injecting minimal flow');
      flow.steps = [
        { id: 'price_reveal', type: 'price_reveal', title: 'Your Estimate', questions: [], config: { show_progress: true, can_skip: false, auto_advance: false } },
        { id: 'lead_capture', type: 'lead_capture', title: 'Get your detailed quote', questions: [], config: { show_progress: true, can_skip: false, auto_advance: false } },
        { id: 'confirmation', type: 'confirmation', title: "You're all set!", questions: [], config: { show_progress: false, can_skip: false, auto_advance: false } },
      ];
    }

    return { calculator, pricingConfig, template, flow, isEmbed };
  }, [calculator, isEmbed]);

  const theme = useMemo(
    () => getWidgetTheme(calculator.theme_overrides as any, calculator.primary_color),
    [calculator.theme_overrides, calculator.primary_color],
  );

  const demoTracked = useRef(false);
  useEffect(() => {
    if (!demoTracked.current && calculator.id === 0) {
      demoTracked.current = true;
      trackEvent("demo_started", { trade: (calculator.slug || "").replace("demo-", "") });
    }
  }, [calculator.id, calculator.slug]);

  return (
    <WidgetErrorBoundary businessName={calculator.business_name}>
      <WidgetProvider config={config}>
        <div
          className="mx-auto w-full"
          style={{
            maxWidth: '576px',
            fontFamily: eff.font,
            color: eff.text,
          }}
        >
          <WidgetCard theme={theme} calculator={calculator} />
        </div>
      </WidgetProvider>
    </WidgetErrorBoundary>
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
      style={{
        background: '#fff',
        borderRadius: eff.radius2xl,
        border: `1px solid ${eff.buttonBorder}`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.03)',
        overflow: 'hidden',
      }}
    >
      {/* ─── Header ─── */}
      {(calculator.business_name || calculator.logo_url) && (
        <div
          style={{
            padding: '24px 32px',
            borderBottom: `1px solid ${eff.buttonBorder}`,
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          {calculator.logo_url && (
            <img
              src={calculator.logo_url}
              alt={calculator.business_name}
              style={{
                height: '40px',
                width: '40px',
                borderRadius: eff.radiusMd,
                objectFit: 'contain',
              }}
            />
          )}
          <div>
            <p style={{
              fontSize: '15px',
              fontWeight: 700,
              color: eff.text,
              lineHeight: 1.3,
              margin: 0,
            }}>
              {calculator.business_name}
            </p>
            {calculator.tagline && (
              <p style={{
                fontSize: '13px',
                color: eff.textBody,
                lineHeight: 1.4,
                margin: '2px 0 0',
              }}>
                {calculator.tagline}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ─── Progress Bar ─── */}
      {showProgress && (
        <div style={{ padding: '24px 32px 0' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px',
          }}>
            <span style={{
              fontSize: '12px',
              fontWeight: 600,
              color: eff.textBody,
              letterSpacing: '0.02em',
              fontFamily: eff.fontMono,
              textTransform: 'uppercase' as const,
            }}>
              Step {currentStepIndex + 1} / {visibleStepCount}
            </span>
          </div>
          <div style={{
            height: '4px',
            borderRadius: '2px',
            background: eff.bg,
            overflow: 'hidden',
          }}>
            <div
              style={{
                height: '100%',
                borderRadius: '2px',
                transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                width: `${((currentStepIndex + 1) / visibleStepCount) * 100}%`,
                background: eff.buttonBg,
              }}
            />
          </div>
        </div>
      )}

      {/* ─── Step Content ─── */}
      <div style={{ padding: '32px', position: 'relative' }}>
        {currentStep.help && (
          <div style={{
            position: 'absolute',
            top: '32px',
            right: '32px',
            zIndex: 10,
          }}>
            <StepHelp help={currentStep.help} />
          </div>
        )}
        <StepRenderer step={currentStep} accentColor={accentColor} />
      </div>

      {/* ─── Navigation ─── */}
      {(showBack || showNext || canSkip) && (
        <div
          style={{
            borderTop: `1px solid ${eff.buttonBorder}`,
            padding: '24px 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            {showBack && (
              <button
                type="button"
                onClick={prevStep}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: eff.textBody,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px 0',
                  fontFamily: eff.font,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = eff.text; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = eff.textBody; }}
              >
                <ChevronLeft style={{ width: 16, height: 16 }} />
                Back
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {canSkip && (
              <button
                type="button"
                onClick={nextStep}
                style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: eff.textBody,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px 0',
                  fontFamily: eff.font,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = eff.text; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = eff.textBody; }}
              >
                Skip
              </button>
            )}
            {showNext && (
              <button
                type="button"
                onClick={nextStep}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderRadius: eff.radiusXl,
                  padding: '12px 28px',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: eff.buttonText,
                  background: eff.buttonBg,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: eff.font,
                  transition: 'background 0.15s, transform 0.1s',
                  letterSpacing: '0.01em',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = eff.buttonBgHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = eff.buttonBg; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                Continue
                <ArrowRight style={{ width: 16, height: 16 }} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
