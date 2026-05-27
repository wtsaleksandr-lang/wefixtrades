/**
 * TradePickerStep — Wave 33 shared onboarding step.
 *
 * Renders a 30-trade card grid used as the typical "What's your trade?"
 * step across every product wizard. Writes `{ tradeSlug, tradeName }` into
 * wizard state on selection.
 *
 * Trades are the canonical 30 from `shared/trades.ts` (PR #722); we don't
 * import that here because the list is also rendered server-side in
 * places where the import graph differs. The slug column is stable; only
 * the label can be changed without a migration.
 */

import { Check, Wrench } from "lucide-react";
import type { WizardRenderContext } from "@/components/ui/visual-primitives";
import { cn } from "@/lib/utils";

export const TRADE_OPTIONS: ReadonlyArray<{
  slug: string;
  name: string;
  defaultRadiusMi: number;
}> = [
  { slug: "plumbing", name: "Plumbing", defaultRadiusMi: 30 },
  { slug: "hvac", name: "HVAC", defaultRadiusMi: 35 },
  { slug: "electrical", name: "Electrical", defaultRadiusMi: 30 },
  { slug: "roofing", name: "Roofing", defaultRadiusMi: 50 },
  { slug: "painting", name: "Painting", defaultRadiusMi: 25 },
  { slug: "handyman", name: "Handyman", defaultRadiusMi: 20 },
  { slug: "lawn-care", name: "Lawn Care", defaultRadiusMi: 20 },
  { slug: "landscaping", name: "Landscaping", defaultRadiusMi: 25 },
  { slug: "pressure-washing", name: "Pressure Washing", defaultRadiusMi: 25 },
  { slug: "window-cleaning", name: "Window Cleaning", defaultRadiusMi: 15 },
  { slug: "house-cleaning", name: "House Cleaning", defaultRadiusMi: 20 },
  { slug: "junk-removal", name: "Junk Removal", defaultRadiusMi: 30 },
  { slug: "moving", name: "Moving", defaultRadiusMi: 100 },
  { slug: "garage-door", name: "Garage Door", defaultRadiusMi: 30 },
  { slug: "locksmith", name: "Locksmith", defaultRadiusMi: 25 },
  { slug: "pest-control", name: "Pest Control", defaultRadiusMi: 25 },
  { slug: "pool-service", name: "Pool Service", defaultRadiusMi: 30 },
  { slug: "appliance-repair", name: "Appliance Repair", defaultRadiusMi: 25 },
  { slug: "tree-service", name: "Tree Service", defaultRadiusMi: 30 },
  { slug: "concrete", name: "Concrete", defaultRadiusMi: 40 },
  { slug: "fencing", name: "Fencing", defaultRadiusMi: 30 },
  { slug: "flooring", name: "Flooring", defaultRadiusMi: 30 },
  { slug: "remodeling", name: "Remodeling", defaultRadiusMi: 30 },
  { slug: "carpet-cleaning", name: "Carpet Cleaning", defaultRadiusMi: 25 },
  { slug: "chimney-sweep", name: "Chimney Sweep", defaultRadiusMi: 30 },
  { slug: "septic", name: "Septic", defaultRadiusMi: 40 },
  { slug: "solar", name: "Solar", defaultRadiusMi: 50 },
  { slug: "tile", name: "Tile", defaultRadiusMi: 25 },
  { slug: "drywall", name: "Drywall", defaultRadiusMi: 25 },
  { slug: "general-contractor", name: "General Contractor", defaultRadiusMi: 40 },
];

export type TradePickerState = {
  tradeSlug?: string;
  tradeName?: string;
  /** Derived — convenient default for ServiceAreaStep. */
  tradeDefaultRadiusMi?: number;
};

export function TradePickerStep({ state, setState }: WizardRenderContext) {
  const selected = (state.tradeSlug as string | undefined) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Wrench className="h-3 w-3" aria-hidden="true" />
        We'll auto-tune copy, ad creative, and calculator templates to your trade.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {TRADE_OPTIONS.map((t) => {
          const active = selected === t.slug;
          return (
            <button
              key={t.slug}
              type="button"
              onClick={() =>
                setState({
                  tradeSlug: t.slug,
                  tradeName: t.name,
                  tradeDefaultRadiusMi: t.defaultRadiusMi,
                })
              }
              className={cn(
                "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                active
                  ? "border-[hsl(var(--chart-1))] bg-[hsl(var(--chart-1)/0.08)] text-foreground ring-1 ring-inset ring-[hsl(var(--chart-1))]"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/40",
              )}
              data-testid={`onboarding-trade-${t.slug}`}
            >
              <span className="font-medium">{t.name}</span>
              {active && (
                <Check
                  className="h-4 w-4 text-[hsl(var(--chart-1))]"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function validateTradePicker(state: Record<string, unknown>): string | null {
  return state.tradeSlug ? null : "Pick your trade to continue.";
}
