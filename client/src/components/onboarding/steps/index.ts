/**
 * Wave 33 — shared onboarding step renderers.
 *
 * Each step is a small, self-contained React component (~50-150 LOC)
 * that consumes the OnboardingWizard's render-context shape:
 *   { state, setState, product }
 *
 * Most renderers also export a `validate*` helper that the consuming
 * wizard wires into the OnboardingStep `validate` field.
 *
 * Companion primitive: `@/components/ui/visual-primitives/OnboardingWizard`.
 */

export {
  TradePickerStep,
  TRADE_OPTIONS,
  validateTradePicker,
} from "./TradePickerStep";
export type { TradePickerState } from "./TradePickerStep";

export {
  ServiceAreaStep,
  validateServiceArea,
} from "./ServiceAreaStep";
export type { ServiceAreaState } from "./ServiceAreaStep";

export {
  CalendarConnectStep,
} from "./CalendarConnectStep";
export type { CalendarConnectState } from "./CalendarConnectStep";

export {
  WebsiteConnectStep,
  detectCms,
  validateWebsiteConnect,
} from "./WebsiteConnectStep";
export type { CmsType, WebsiteConnectState } from "./WebsiteConnectStep";

export {
  BudgetStep,
  BUDGET_TIERS,
  validateBudget,
} from "./BudgetStep";
export type { BudgetState, BudgetTier } from "./BudgetStep";

export {
  renderPlatformConnect,
  REVIEW_PLATFORMS,
  SOCIAL_PLATFORMS,
  validatePlatformConnect,
} from "./PlatformConnectStep";
export type { PlatformConnectState, PlatformMode } from "./PlatformConnectStep";

export {
  renderTestDemo,
} from "./TestDemoStep";
export type { TestDemoConfig, TestDemoState } from "./TestDemoStep";
