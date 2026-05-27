/**
 * BudgetStep — Wave 33 shared onboarding step.
 *
 * Monthly-budget slider with named tiers (matching the AdFlow tier
 * presets from Wave 30). Writes:
 *   { monthlyBudget, budgetTier }
 *
 * Used by AdFlow + ContentFlow (which uses budget to recommend
 * publishing cadence).
 */

import { DollarSign } from "lucide-react";
import type { WizardRenderContext } from "@/components/ui/visual-primitives";
import { cn } from "@/lib/utils";

export const BUDGET_TIERS = [
  { id: "starter", label: "$500 / mo", value: 500 },
  { id: "growth", label: "$1,500 / mo", value: 1500 },
  { id: "scale", label: "$3,000 / mo", value: 3000 },
  { id: "enterprise", label: "$10,000+ / mo", value: 10000 },
] as const;

export type BudgetTier = (typeof BUDGET_TIERS)[number]["id"];

export type BudgetState = {
  monthlyBudget?: number;
  budgetTier?: BudgetTier;
};

export function BudgetStep({ state, setState }: WizardRenderContext) {
  const budget = (state.monthlyBudget as number | undefined) ?? 500;
  const tier = (state.budgetTier as BudgetTier | undefined) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <DollarSign className="h-3 w-3" aria-hidden="true" />
        We'll recommend a platform mix and creative cadence based on your monthly spend.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {BUDGET_TIERS.map((t) => {
          const active = tier === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() =>
                setState({ budgetTier: t.id, monthlyBudget: t.value })
              }
              className={cn(
                "rounded-md border px-3 py-2 text-sm transition-colors",
                active
                  ? "border-[hsl(var(--chart-1))] bg-[hsl(var(--chart-1)/0.08)] text-foreground ring-1 ring-inset ring-[hsl(var(--chart-1))]"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/40",
              )}
              data-testid={`onboarding-budget-${t.id}`}
            >
              <div className="text-xs font-semibold capitalize text-foreground">{t.id}</div>
              <div className="text-[11px]">{t.label}</div>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-0.5">
        <label htmlFor="onboarding-budget-slider" className="text-[11px] text-muted-foreground">
          Or fine-tune: <span className="font-medium text-foreground">${budget.toLocaleString()}</span> / mo
        </label>
        <input
          id="onboarding-budget-slider"
          type="range"
          min={100}
          max={15000}
          step={100}
          value={budget}
          onChange={(e) =>
            setState({ monthlyBudget: Number(e.target.value), budgetTier: undefined })
          }
          className="w-full accent-[hsl(var(--chart-1))]"
          data-testid="onboarding-budget-slider"
        />
      </div>
    </div>
  );
}

export function validateBudget(state: Record<string, unknown>): string | null {
  const budget = (state.monthlyBudget as number | undefined) ?? 0;
  if (budget < 100) return "Pick a budget tier or set at least $100/mo.";
  return null;
}
