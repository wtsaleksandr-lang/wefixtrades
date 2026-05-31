/**
 * /portal/adflow/setup — Wave 30 wizard, refactored on the Wave 33
 * universal OnboardingWizard scaffold.
 *
 * Identical persistence shape and behavior: POST /api/portal/onboarding/submit
 * with `product: "adflow"`. The Wave 33 refactor swaps the bespoke wizard
 * chrome + per-step renderers for the shared primitive + shared
 * TradePicker / Budget / ServiceArea steps.
 */

import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, Megaphone } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  OnboardingWizard,
  type OnboardingStep,
  type WizardState,
} from "@/components/ui/visual-primitives";
import {
  TradePickerStep,
  validateTradePicker,
  BudgetStep,
  validateBudget,
  ServiceAreaStep,
  validateServiceArea,
} from "@/components/onboarding/steps";

/**
 * Tier → suggested Google/Meta split. Mirrors Wave 30's BUDGET_PRESETS
 * mapping. Used by the persistence payload only — the step UI uses
 * shared BudgetStep tiers.
 */
const SPLIT_BY_TIER: Record<string, { google: number; meta: number }> = {
  starter: { google: 60, meta: 40 },
  growth: { google: 55, meta: 35 },
  scale: { google: 50, meta: 40 },
  enterprise: { google: 50, meta: 30 },
};

export default function AdFlowSetup() {
  usePageTitle("AdFlow setup");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const steps: OnboardingStep[] = useMemo(
    () => [
      {
        id: "trade",
        title: "What trade do you serve?",
        description: "We'll auto-select ad templates that have worked for your category.",
        render: TradePickerStep,
        validate: validateTradePicker,
        estimateMinutes: 1,
      },
      {
        id: "budget",
        title: "What's your monthly ad budget?",
        description: "We'll suggest a Google / Meta platform mix tuned to your tier.",
        render: BudgetStep,
        validate: validateBudget,
        estimateMinutes: 1,
      },
      {
        id: "service-area",
        title: "Where do you serve?",
        description: "Defines the geo-targeting on your first campaign.",
        render: ServiceAreaStep,
        validate: validateServiceArea,
        estimateMinutes: 2,
      },
    ],
    [],
  );

  async function finish(state: WizardState) {
    const tier = (state.budgetTier as string | undefined) ?? "starter";
    const mix = SPLIT_BY_TIER[tier] ?? SPLIT_BY_TIER.starter;
    try {
      const res = await fetch("/api/portal/onboarding/submit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: "adflow",
          responses: {
            trade: state.tradeSlug,
            monthly_budget_dollars: state.monthlyBudget ?? 500,
            platform_mix: mix,
            service_area: `${state.zip ?? ""} (radius ${state.serviceAreaRadius ?? 25}mi)`,
            business_name: state.businessName,
            phone: state.phone,
          },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Couldn't save your AdFlow setup. Please try again.");
      }
      toast({
        title: "AdFlow setup saved",
        description: "Your first campaign preview will be ready in a few minutes.",
      });
      setLocation("/portal/adflow/dashboard");
    } catch (err: unknown) {
      toast({
        title: "Could not save",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <PortalLayout>
      <div className="flex flex-col gap-3 p-4 md:p-6">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex flex-col">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground md:text-2xl">
              <Megaphone className="h-5 w-5" aria-hidden="true" />
              AdFlow setup
            </h1>
            <p className="text-sm text-muted-foreground">
              3 quick questions — under 5 minutes — to launch your first ad.
            </p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/portal/adflow/dashboard">
              <ChevronLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Back to dashboard
            </Link>
          </Button>
        </div>
        <OnboardingWizard
          product="adflow"
          steps={steps}
          onComplete={finish}
          onSkip={() => setLocation("/portal/adflow/dashboard")}
          conciergeHref="/contact?topic=adflow-onboarding"
        />
      </div>
    </PortalLayout>
  );
}
