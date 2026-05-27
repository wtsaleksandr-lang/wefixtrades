/**
 * Wave 22A — shared visual primitives library.
 *
 * 6 reusable, self-contained components consumed by Waves 23 (ContentFlow),
 * 24 (RankFlow), 25 (SocialSync). See WORKSTREAMS/ui-upgrade-roadmap.md.
 */

export { AnimatedCounter } from "./AnimatedCounter";
export type { AnimatedCounterProps } from "./AnimatedCounter";

export { KpiGauge } from "./KpiGauge";
export type {
  KpiGaugeProps,
  KpiGaugeColor,
  KpiGaugeSize,
  KpiGaugePalette,
} from "./KpiGauge";

export { PipelineStrip } from "./PipelineStrip";
export type {
  PipelineStripProps,
  PipelineStripStage,
  PipelineStripStatus,
} from "./PipelineStrip";

export { StatusPill } from "./StatusPill";
export type { StatusPillProps, StatusPillStatus } from "./StatusPill";

export { LetterGradeBadge } from "./LetterGradeBadge";
export type { LetterGradeBadgeProps } from "./LetterGradeBadge";

export { OnboardingWalkthrough } from "./OnboardingWalkthrough";
export type {
  OnboardingWalkthroughProps,
  WalkthroughStep,
} from "./OnboardingWalkthrough";

export { VisualCalendar, buildEntryDate } from "./VisualCalendar";
export type {
  VisualCalendarProps,
  CalendarView,
  CalendarEntry,
  CalendarEntryStatus,
  CalendarFilters,
} from "./VisualCalendar";

export { ApprovalInbox } from "./ApprovalInbox";
export type {
  ApprovalInboxProps,
  ApprovalInboxFilters,
  InboxItem,
  InboxItemKind,
  InboxItemStatus,
  InboxItemSentiment,
  InboxAction,
} from "./ApprovalInbox";

export { AIDraftEditor } from "./AIDraftEditor";
export type {
  AIDraftEditorProps,
  AIDraftEditorContext,
} from "./AIDraftEditor";

export { Sparkline } from "./Sparkline";
export type {
  SparklineProps,
  SparklinePalette,
  SparklineColor,
  SparklineVariant,
} from "./Sparkline";

export { ProgressRing } from "./ProgressRing";
export type {
  ProgressRingProps,
  ProgressRingPalette,
  ProgressRingColor,
  ProgressRingSize,
} from "./ProgressRing";

export { OnboardingWizard } from "./OnboardingWizard";
export type {
  OnboardingWizardProps,
  OnboardingStep,
  OnboardingProduct,
  WizardState,
  WizardRenderContext,
} from "./OnboardingWizard";

export { AIActionCard } from "./AIActionCard";
export type {
  AIActionCardProps,
  AIActionRecommendation,
  AIActionApproveResult,
} from "./AIActionCard";

// Wave 71 — shared hover-tooltip + 5 new KPI/chart primitives.
export { ChartTooltip } from "./ChartTooltip";
export type { ChartTooltipProps, ChartTooltipState } from "./ChartTooltip";

export { SparklineWithPeak } from "./SparklineWithPeak";
export type {
  SparklineWithPeakProps,
  SparklineWithPeakPalette,
} from "./SparklineWithPeak";

export { BarComparisonCard } from "./BarComparisonCard";
export type {
  BarComparisonCardProps,
  BarComparisonItem,
  BarComparisonPalette,
} from "./BarComparisonCard";

export { MonthlyBarSeries } from "./MonthlyBarSeries";
export type {
  MonthlyBarSeriesProps,
  MonthlyBar,
  MonthlyBarSeriesPalette,
} from "./MonthlyBarSeries";

export { DonutChart } from "./DonutChart";
export type {
  DonutChartProps,
  DonutSegment,
  DonutChartPalette,
} from "./DonutChart";

export { SemiGauge } from "./SemiGauge";
export type { SemiGaugeProps, SemiGaugePalette } from "./SemiGauge";
