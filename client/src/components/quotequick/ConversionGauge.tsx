/**
 * ConversionGauge — Wave 29.
 *
 * Per-template conversion card composed of:
 *   - Hero KpiGauge showing the deposit-paid % (semi-circular, 0-100)
 *   - PipelineStrip below with the 4 funnel stages (views → starts →
 *     completes → depositPaid) and stage counts
 *   - Benchmark callout: "Your template converts X% — industry avg 5%"
 *
 * The benchmark callout color follows the performanceVsBenchmark tag:
 *   "above" = chart-2 (green)
 *   "at"    = chart-4 (amber)
 *   "below" = destructive (red)
 *
 * Empty-state: when stages.views === 0, renders a neutral card explaining
 * that no funnel data is available yet (per anti-pattern: no fake data).
 *
 * DESIGN-SYSTEM: semantic tokens only, 2px gaps, hover-shift forbidden,
 * respects prefers-reduced-motion via KpiGauge.
 */

import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  KpiGauge,
  PipelineStrip,
  type PipelineStripStage,
} from "@/components/ui/visual-primitives";
import { cn } from "@/lib/utils";

export interface ConversionGaugeStages {
  views: number;
  starts: number;
  completes: number;
  depositPaid: number;
}

export interface ConversionGaugeProps {
  templateName: string;
  stages: ConversionGaugeStages;
  conversionRate: number;
  industryBenchmark: number;
  performanceVsBenchmark: "below" | "at" | "above";
  className?: string;
  /** Hide the empty state and show all zeros explicitly. */
  forceShow?: boolean;
}

function benchmarkBadge(perf: "below" | "at" | "above"): {
  className: string;
  Icon: typeof ArrowUpRight;
  label: string;
} {
  if (perf === "above") {
    return {
      className: "bg-[hsl(var(--chart-2)/0.12)] text-[hsl(var(--chart-2))]",
      Icon: ArrowUpRight,
      label: "Above industry avg",
    };
  }
  if (perf === "at") {
    return {
      className: "bg-[hsl(var(--chart-4)/0.12)] text-[hsl(var(--chart-4))]",
      Icon: Minus,
      label: "At industry avg",
    };
  }
  return {
    className:
      "bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))]",
    Icon: ArrowDownRight,
    label: "Below industry avg",
  };
}

export function ConversionGauge({
  templateName,
  stages,
  conversionRate,
  industryBenchmark,
  performanceVsBenchmark,
  className,
  forceShow,
}: ConversionGaugeProps) {
  const empty = !forceShow && stages.views === 0;
  const badge = benchmarkBadge(performanceVsBenchmark);

  const funnelStages: PipelineStripStage[] = [
    {
      id: "views",
      label: "Views",
      count: stages.views,
      status: stages.views > 0 ? "complete" : "idle",
    },
    {
      id: "starts",
      label: "Starts",
      count: stages.starts,
      status: stages.starts > 0 ? "complete" : "idle",
    },
    {
      id: "completes",
      label: "Completes",
      count: stages.completes,
      status: stages.completes > 0 ? "complete" : "idle",
    },
    {
      id: "depositPaid",
      label: "Deposit paid",
      count: stages.depositPaid,
      status: stages.depositPaid > 0 ? "active" : "idle",
    },
  ];

  return (
    <Card
      className={cn("flex flex-col gap-3 p-4", className)}
      data-testid="quotequick-conversion-gauge"
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-foreground" data-testid="conversion-template-name">
            {templateName}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Deposit-paid conversion rate
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            badge.className,
          )}
          data-testid="conversion-benchmark-badge"
        >
          <badge.Icon className="h-3 w-3" aria-hidden="true" />
          {badge.label}
        </span>
      </div>

      {empty ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-center">
          <p className="text-sm font-medium text-foreground">No funnel data yet</p>
          <p className="text-xs text-muted-foreground">
            Conversion data appears once your template has at least one view.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-center">
            <KpiGauge
              value={conversionRate}
              max={Math.max(20, industryBenchmark * 2)}
              label="Deposit-paid"
              unit="%"
              size="lg"
              color={
                performanceVsBenchmark === "above"
                  ? "green"
                  : performanceVsBenchmark === "at"
                    ? "amber"
                    : "red"
              }
            />
          </div>
          <PipelineStrip
            stages={funnelStages}
            data-testid="conversion-pipeline"
          />
          <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Your template converts at{" "}
            <span className="font-semibold text-foreground">
              {conversionRate.toFixed(1)}%
            </span>{" "}
            — industry avg{" "}
            <span className="font-semibold text-foreground">
              {industryBenchmark}%
            </span>
            .
          </div>
        </>
      )}
    </Card>
  );
}

export default ConversionGauge;
