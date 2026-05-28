/**
 * Wave 73a — small badge shown on KPI cards whose endpoint returns
 * `data_status: 'illustrative'`. Communicates that the chart is example
 * data because the customer doesn't have personalized data yet.
 *
 * Purely additive — used inline by the Wave 72 KPI primitives wired in
 * Wave 73a (AdFlow / ContentFlow / MapGuard / SocialSync / RankFlow /
 * ReputationShield / QuoteQuick / TradeLine / WebCare).
 */
import { Info } from "lucide-react";

interface IllustrativeDataBadgeProps {
  /** When true, render the badge. When false, render nothing. */
  show: boolean;
  /** Optional custom label override. */
  label?: string;
}

export function IllustrativeDataBadge({
  show,
  label = "Example data — collecting your data",
}: IllustrativeDataBadgeProps) {
  if (!show) return null;
  return (
    <span
      role="note"
      className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--muted)] px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
      data-testid="illustrative-data-badge"
    >
      <Info aria-hidden="true" className="h-3 w-3" />
      {label}
    </span>
  );
}
