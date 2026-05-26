/**
 * Wave 22A — shared visual primitives library.
 *
 * 6 reusable, self-contained components consumed by Waves 23 (ContentFlow),
 * 24 (RankFlow), 25 (SocialSync). See WORKSTREAMS/ui-upgrade-roadmap.md.
 */

export { AnimatedCounter } from "./AnimatedCounter";
export type { AnimatedCounterProps } from "./AnimatedCounter";

export { KpiGauge } from "./KpiGauge";
export type { KpiGaugeProps, KpiGaugeColor, KpiGaugeSize } from "./KpiGauge";

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
