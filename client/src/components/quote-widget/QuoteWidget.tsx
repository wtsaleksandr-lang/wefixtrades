import { useMemo, useEffect, useRef, Component, type ReactNode } from 'react';
import { ChevronLeft, ArrowRight, AlertTriangle } from 'lucide-react';
import WeFixTradesBadge from '@/components/hosted-page/WeFixTradesBadge';
import { trackEvent } from '@/lib/trackEvent';
import { validatePricingConfig, CALL_FOR_QUOTE_FALLBACK } from '@shared/pricingConfig';
import { getTemplateById } from '@shared/templateLibrary';
import { buildWidgetFlow, type FlowBuilderSettings } from '@shared/widgetFlowBuilder';
import { getWidgetTheme } from '@/theme/widgetTheme';
import { WidgetProvider } from './WidgetContext';
import { useWidgetState } from './useWidgetState';
import StepRenderer from './StepRenderer';
import AdvancedCalculator from './AdvancedCalculator';
import StepHelp from './StepHelp';
import type { CalculatorData, WidgetConfig } from './types';

import { eff } from './designTokens';

/* ─── Error Boundary ─── */

interface ErrorBoundaryState { error: Error | null }

class WidgetErrorBoundary extends Component<{ children: ReactNode; businessName?: string }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    if (process.env.NODE_ENV !== 'production') console.error('[QuoteWidget] Render error:', error);
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
  /** Wave Q-Hotfix — when true (wizard preview pane), suppress the
   *  WeFixTrades brand badge. The wizard's own EditorTopBar already
   *  renders the QuoteQuick brand mark in its top-left corner; rendering
   *  the badge again above the previewed widget creates a duplicated
   *  look. Public hosted page + actual customer embeds keep the badge. */
  hideBrandBadge?: boolean;
  /** Wave R-pre v2 — when true (wizard preview), surfaces an editability
   *  hint (small pencil glyph) next to the calculator title. Public
   *  visitors should never see the pencil. */
  editableTitle?: boolean;
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
export default function QuoteWidget({ calculator, isEmbed = false, hideBrandBadge = false, editableTitle = false }: QuoteWidgetProps) {
  const config = useMemo<WidgetConfig>(() => {
    // Guard: missing or null pricing_config falls back to call-for-quote
    const rawPricing = calculator.pricing_config ?? CALL_FOR_QUOTE_FALLBACK;
    const validation = validatePricingConfig(rawPricing);
    if (!validation.valid) {
      if (process.env.NODE_ENV !== 'production') console.warn('[QuoteWidget] Invalid pricing config, using fallback:', validation.errors);
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
      action: calcSettings.action,
      promotionsEnabled: calcSettings.promotions?.enabled === true,
      quoteRules: calcSettings.quote_rules,
      serviceTypes: calcSettings.serviceTypes,
      tradeInputs: calcSettings.trade_inputs,
      fieldOverrides: calcSettings.field_overrides,
    };

    const flow = buildWidgetFlow(pricingConfig, template, flowSettings);

    // Guard: empty steps — ensure at least lead_capture + confirmation
    if (!flow.steps || flow.steps.length === 0) {
      if (process.env.NODE_ENV !== 'production') console.warn('[QuoteWidget] Flow produced 0 steps, injecting minimal flow');
      flow.steps = [
        { id: 'price_reveal', type: 'price_reveal', title: 'Your Estimate', questions: [], config: { show_progress: true, can_skip: false, auto_advance: false } },
        { id: 'lead_capture', type: 'lead_capture', title: 'Get your detailed quote', questions: [], config: { show_progress: true, can_skip: false, auto_advance: false } },
        { id: 'confirmation', type: 'confirmation', title: "You're all set!", questions: [], config: { show_progress: false, can_skip: false, auto_advance: false } },
      ];
    }

    return { calculator, pricingConfig, template, flow, isEmbed };
  }, [calculator, isEmbed]);

  const theme = useMemo(() => {
    const calcSettings = (calculator.calculator_settings || {}) as Record<string, any>;
    const appearance = calcSettings.appearance || {};
    // Merge appearance settings into theme config
    const themeConfig = {
      ...(calculator.theme_overrides as any || {}),
      accent: appearance.accent_color || undefined,
      font: appearance.font || undefined,
      buttonStyle: appearance.button_style || undefined,
      surfaceVariant: appearance.surface_style || undefined,
      radius: appearance.border_radius || undefined,
    };
    return getWidgetTheme(themeConfig, calculator.primary_color);
  }, [calculator.theme_overrides, calculator.primary_color, calculator.calculator_settings]);

  const demoTracked = useRef(false);
  useEffect(() => {
    if (!demoTracked.current && calculator.id === 0) {
      demoTracked.current = true;
      trackEvent("demo_started", { trade: (calculator.slug || "").replace("demo-", "") });
    }
  }, [calculator.id, calculator.slug]);

  // Advanced (custom-built) calculator — bypasses the pricing-family flow.
  const advancedConfig = ((calculator.calculator_settings || {}) as any).advanced;
  const isAdvanced = !!advancedConfig?.enabled;

  // Wave P-H — show "QuoteQuick by WeFixTrades" badge unless the Pro-plan
  // toggle hides it. Defaults to TRUE (free users see it).
  const appearance = (calculator.calculator_settings as any)?.appearance || {};
  // Wave Q-Hotfix — `hideBrandBadge` (from wizard preview) wins over the
  // `appearance.show_powered_by` setting. So the badge is suppressed in
  // the wizard chrome but still respects the Pro plan toggle elsewhere.
  const showBrandBadge = !hideBrandBadge && appearance.show_powered_by !== false;
  // `isEmbed` distinguishes the iframe / embedded variant; the hosted
  // page sets it false. Used for UTM attribution only.
  const badgeContext: 'hosted' | 'embed' = isEmbed ? 'embed' : 'hosted';
  const calcSlug = (calculator as any)?.slug ?? null;

  return (
    <WidgetErrorBoundary businessName={calculator.business_name}>
      {isAdvanced ? (
        <div
          className="mx-auto w-full"
          style={{ maxWidth: '780px', fontFamily: eff.font, color: eff.text }}
        >
          {showBrandBadge && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '8px 4px 0' }}>
              <WeFixTradesBadge variant="header" context={badgeContext} slug={calcSlug} />
            </div>
          )}
          <AdvancedCalculator
            businessName={calculator.business_name}
            logoUrl={calculator.logo_url}
            advanced={advancedConfig}
            accentColor={theme.colors.primary}
            editableTitle={editableTitle}
          />
        </div>
      ) : (
        <WidgetProvider config={config}>
          <div
            className="mx-auto w-full"
            style={{
              maxWidth: '720px',
              fontFamily: eff.font,
              color: eff.text,
            }}
          >
            {showBrandBadge && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '8px 4px 0' }}>
                <WeFixTradesBadge variant="header" context={badgeContext} slug={calcSlug} />
              </div>
            )}
            <WidgetCard theme={theme} calculator={calculator} />
          </div>
        </WidgetProvider>
      )}
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
    visibleStepCount,
    visibleStepPosition,
  } = useWidgetState();

  const accentColor = theme.colors.primary;

  // Track preview interaction (AHA moment) — fire once when user changes any answer or advances a step
  const previewTrackedRef = useRef(false);
  const isPreview = config.calculator.id < 0;
  const answerCount = Object.keys(answers).length;
  useEffect(() => {
    if (isPreview && !previewTrackedRef.current && (answerCount > 0 || currentStepIndex > 0)) {
      previewTrackedRef.current = true;
      trackEvent('wizard_preview_interacted');
    }
  }, [isPreview, answerCount, currentStepIndex]);

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
        boxShadow: eff.shadowCard,
        overflow: 'hidden',
      }}
    >
      {/* Widget baseline styles */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .eff-widget-header { padding: 20px 28px; }
        .eff-widget-progress { padding: 20px 28px 0; }
        .eff-widget-body { padding: 28px; }
        .eff-widget-nav { padding: 20px 28px; }
        .eff-widget-help { top: 28px; right: 28px; }
        @media (max-width: 480px) {
          .eff-widget-header { padding: 16px 20px; }
          .eff-widget-progress { padding: 16px 20px 0; }
          .eff-widget-body { padding: 20px; }
          .eff-widget-nav { padding: 16px 20px; }
          .eff-widget-help { top: 20px; right: 20px; }
        }
      `}</style>

      {/* ─── Header ─── */}
      {(calculator.business_name || calculator.logo_url) && (
        <div
          className="eff-widget-header"
          style={{
            borderBottom: `1px solid ${eff.buttonBorder}`,
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          {calculator.logo_url && (
            <img
              src={calculator.logo_url}
              alt={calculator.business_name}
              style={{
                height: '36px',
                width: '36px',
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
        <div className="eff-widget-progress">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '6px',
          }}>
            <span style={{
              fontSize: '12px',
              fontWeight: 600,
              color: eff.textBody,
              letterSpacing: '0.01em',
              fontFamily: eff.font,
            }}>
              Step {visibleStepPosition} of {visibleStepCount}
            </span>
          </div>
          <div style={{
            height: '3px',
            borderRadius: '2px',
            background: eff.bg,
            overflow: 'hidden',
          }}>
            <div
              style={{
                height: '100%',
                borderRadius: '2px',
                transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                width: `${(visibleStepPosition / visibleStepCount) * 100}%`,
                background: eff.buttonBg,
              }}
            />
          </div>
        </div>
      )}

      {/* ─── Step Content ─── */}
      <div className="eff-widget-body" style={{ position: 'relative' }}>
        {currentStep.help && (
          <div className="eff-widget-help" style={{
            position: 'absolute',
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
          className="eff-widget-nav"
          style={{
            borderTop: `1px solid ${eff.buttonBorder}`,
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
