/**
 * ROIFunnel — AdFlow ROI hero (Wave 30).
 *
 * Renders a 4-stage horizontal funnel that hides Google Ads / Meta Ads
 * jargon by default — uses trade-first nouns:
 *
 *   Money Spent → Customers Reached → Jobs Booked → Revenue Earned
 *
 * Revenue Earned gets the BIG hero number; the other three are smaller
 * chips. Conversion % between each stage hides in tooltips on hover. A
 * "What does this mean?" link surfaces a plain-language explainer
 * popover.
 *
 * Animated bar fills on mount (respects prefers-reduced-motion).
 *
 * No raw hex — semantic tokens only. Reuses AnimatedCounter from the
 * Wave 22A shared visual primitives.
 */

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { HelpCircle, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AnimatedCounter } from "@/components/ui/visual-primitives";

export interface ROIFunnelProps {
  moneySpentCents: number;
  customersReached: number;
  jobsBooked: number;
  revenueEarnedCents: number;
  conversionRates?: {
    spendToReach: number;
    reachToBook: number;
    bookToRevenue: number;
  };
  className?: string;
}

interface Stage {
  key: "spent" | "reached" | "booked" | "revenue";
  label: string;
  value: number;
  prefix?: string;
  decimals?: number;
  width: number; // % bar fill (descending visual)
  toneVar: string;
  hero?: boolean;
}

export function ROIFunnel({
  moneySpentCents,
  customersReached,
  jobsBooked,
  revenueEarnedCents,
  conversionRates,
  className,
}: ROIFunnelProps) {
  const reduce = useReducedMotion();

  const stages = useMemo<Stage[]>(() => {
    return [
      {
        key: "spent",
        label: "Money Spent",
        value: Math.round(moneySpentCents / 100),
        prefix: "$",
        decimals: 0,
        width: 92,
        toneVar: "var(--chart-1)",
      },
      {
        key: "reached",
        label: "Customers Reached",
        value: customersReached,
        decimals: 0,
        width: 78,
        toneVar: "var(--chart-3)",
      },
      {
        key: "booked",
        label: "Jobs Booked",
        value: jobsBooked,
        decimals: 0,
        width: 56,
        toneVar: "var(--chart-4)",
      },
      {
        key: "revenue",
        label: "Revenue Earned",
        value: Math.round(revenueEarnedCents / 100),
        prefix: "$",
        decimals: 0,
        width: 100,
        toneVar: "var(--chart-2)",
        hero: true,
      },
    ];
  }, [
    moneySpentCents,
    customersReached,
    jobsBooked,
    revenueEarnedCents,
  ]);

  const transitions: Array<{ key: string; pct: number; from: string; to: string }> = [
    {
      key: "spend-to-reach",
      pct: conversionRates?.spendToReach ?? 0,
      from: "Money Spent",
      to: "Customers Reached",
    },
    {
      key: "reach-to-book",
      pct: conversionRates?.reachToBook ?? 0,
      from: "Customers Reached",
      to: "Jobs Booked",
    },
    {
      key: "book-to-revenue",
      pct: conversionRates?.bookToRevenue ?? 0,
      from: "Jobs Booked",
      to: "Revenue Earned",
    },
  ];

  return (
    <Card className={"flex flex-col gap-3 p-4 " + (className ?? "")}
      data-testid="adflow-roi-funnel">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
            Where your ad money goes
          </h2>
          <p className="text-[11px] text-muted-foreground">
            How $1 of ad spend turns into revenue — top to bottom.
          </p>
        </div>
        <ExplainerPopover />
      </div>

      <TooltipProvider delayDuration={150}>
        <div className="flex flex-col gap-1.5">
          {stages.map((s, idx) => {
            const transition = transitions[idx - 1];
            return (
              <div key={s.key} className="flex flex-col gap-0.5">
                {transition && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="cursor-help self-center text-[10px] uppercase tracking-wide text-muted-foreground">
                        {transition.pct > 0 ? `${transition.pct}%` : "—"} pass-through
                      </p>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[14rem]">
                      <p className="text-xs">
                        {transition.pct > 0
                          ? `${transition.pct}% of ${transition.from.toLowerCase()} converts to ${transition.to.toLowerCase()}.`
                          : `Not enough activity yet to compute the ${transition.from.toLowerCase()} → ${transition.to.toLowerCase()} ratio.`}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )}
                <FunnelBar stage={s} reduce={!!reduce} />
              </div>
            );
          })}
        </div>
      </TooltipProvider>
    </Card>
  );
}

function FunnelBar({ stage, reduce }: { stage: Stage; reduce: boolean }) {
  return (
    <div className="relative">
      <motion.div
        initial={reduce ? { width: `${stage.width}%` } : { width: 0 }}
        animate={{ width: `${stage.width}%` }}
        transition={{ duration: 0.7, ease: "easeOut", delay: reduce ? 0 : 0.05 }}
        className="mx-auto rounded-md px-3 py-2"
        style={{
          backgroundColor: `hsl(${stage.toneVar} / 0.12)`,
          borderLeft: `3px solid hsl(${stage.toneVar})`,
        }}
        data-testid={`funnel-stage-${stage.key}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={
              stage.hero
                ? "text-xs font-semibold uppercase tracking-wide text-foreground"
                : "text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            }
          >
            {stage.label}
          </span>
          <AnimatedCounter
            value={stage.value}
            prefix={stage.prefix ?? ""}
            decimals={stage.decimals ?? 0}
            className={
              stage.hero
                ? "text-2xl font-bold text-foreground md:text-3xl"
                : "text-base font-semibold text-foreground"
            }
          />
        </div>
      </motion.div>
    </div>
  );
}

function ExplainerPopover() {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          data-testid="funnel-explainer"
          aria-label="What does this mean?"
        >
          <HelpCircle className="h-3 w-3" aria-hidden="true" />
          What does this mean?
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="max-w-[20rem]">
        <div className="flex flex-col gap-2 text-xs">
          <p className="font-semibold text-foreground">Your ad funnel, in plain English:</p>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Money Spent</span> — total
              dollars you've paid the ad platforms this month.
            </li>
            <li>
              <span className="font-medium text-foreground">Customers Reached</span>{" "}
              — total people who saw your ad.
            </li>
            <li>
              <span className="font-medium text-foreground">Jobs Booked</span> —
              confirmed bookings the ad helped land.
            </li>
            <li>
              <span className="font-medium text-foreground">Revenue Earned</span> —
              the dollar value of those bookings.
            </li>
          </ul>
          <p className="text-muted-foreground">
            We hide jargon like CPA, CTR and ROAS by default. Turn on
            "Show advanced metrics" in settings to see them.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
