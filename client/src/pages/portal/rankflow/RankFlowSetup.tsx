/**
 * /portal/rankflow/setup — Wave 33 — 3-question RankFlow onboarding.
 *
 * Built on the universal OnboardingWizard primitive + shared step
 * renderers. Targets under 5 min from zero → first scheduled rank scan.
 *
 *   Step 1: WebsiteConnect      → URL + detected CMS
 *   Step 2: TradePicker         → seeds keyword set + competitor list
 *   Step 3: GSC connect         → optional OAuth (skippable)
 *
 * Persists into clients.metadata.rankflow_setup via the generic
 * /api/portal/onboarding/submit endpoint.
 */

import { useLocation } from "wouter";
import { ExternalLink } from "lucide-react";
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
  WebsiteConnectStep,
  validateWebsiteConnect,
  TradePickerStep,
  validateTradePicker,
} from "@/components/onboarding/steps";
import type { WizardRenderContext } from "@/components/ui/visual-primitives";

function GscConnectStep({ state, setState }: WizardRenderContext) {
  const connected = !!state.gscConnected;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-muted-foreground">
        Optional — connecting lets us pull live impressions, clicks, and CTR.
        Skip and add it later from the dashboard.
      </p>
      <Button
        type="button"
        size="sm"
        variant={connected ? "outline" : "default"}
        onClick={() => setState({ gscConnected: !connected })}
        className="self-start"
        data-testid="rankflow-gsc-connect"
      >
        <ExternalLink className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        {connected ? "Will connect after setup" : "Connect Google Search Console"}
      </Button>
    </div>
  );
}

export default function RankFlowSetup() {
  usePageTitle("RankFlow setup");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const steps: OnboardingStep[] = [
    {
      id: "website",
      title: "Where's your website?",
      description: "We'll crawl the homepage + key service pages to seed your rank index.",
      render: WebsiteConnectStep,
      validate: validateWebsiteConnect,
      estimateMinutes: 1,
    },
    {
      id: "trade",
      title: "What's your trade?",
      description: "We'll seed keyword groups + competitor list from your trade.",
      render: TradePickerStep,
      validate: validateTradePicker,
      estimateMinutes: 1,
    },
    {
      id: "gsc",
      title: "Connect Google Search Console?",
      description: "Live impressions + clicks — recommended but skippable.",
      render: GscConnectStep,
      optional: true,
      estimateMinutes: 2,
    },
  ];

  async function persist(state: WizardState) {
    const res = await fetch("/api/portal/onboarding/submit", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: "rankflow", responses: state }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error || "Couldn't save your RankFlow setup. Please try again.");
    }
    toast({
      title: "RankFlow ready",
      description: "First scan queued. Heading to your rank dashboard.",
    });
    navigate("/portal/rankflow/dashboard");
  }

  return (
    <PortalLayout>
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4 md:p-6">
        <header className="flex flex-col">
          <h1 className="text-xl font-semibold text-foreground md:text-2xl">
            RankFlow setup
          </h1>
          <p className="text-sm text-muted-foreground">
            3 questions · under 5 minutes · first scan queues on finish.
          </p>
        </header>
        <OnboardingWizard
          product="rankflow"
          steps={steps}
          onComplete={persist}
          onSkip={() => navigate("/portal/rankflow")}
          conciergeHref="/contact?topic=rankflow-onboarding"
        />
      </div>
    </PortalLayout>
  );
}
