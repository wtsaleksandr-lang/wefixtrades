/**
 * /portal/mapguard/setup — Wave 33 — 3-question MapGuard onboarding.
 *
 * Built on the universal OnboardingWizard primitive + shared step
 * renderers. Targets under 5 min from zero → first GBP alert profile.
 *
 *   Step 1: GBP connect   → OAuth (or skip + manual paste)
 *   Step 2: ServiceArea   → ZIP + radius
 *   Step 3: KeywordSelect → 5 starter keywords from trade list
 *
 * Persists into clients.metadata.mapguard_setup via the generic
 * /api/portal/onboarding/submit endpoint.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { ExternalLink, Plus, X } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  OnboardingWizard,
  type OnboardingStep,
  type WizardState,
} from "@/components/ui/visual-primitives";
import {
  ServiceAreaStep,
  validateServiceArea,
} from "@/components/onboarding/steps";
import { cn } from "@/lib/utils";
import type { WizardRenderContext } from "@/components/ui/visual-primitives";

function GbpConnectStep({ state, setState }: WizardRenderContext) {
  const connected = !!state.gbpConnected;
  const gbpUrl = (state.gbpProfileUrl as string | undefined) ?? "";
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-muted-foreground">
        Connect Google Business Profile so we can watch for edits, suspensions,
        and review-spam in real time. You can paste your profile URL instead.
      </p>
      <Button
        type="button"
        size="sm"
        variant={connected ? "outline" : "default"}
        onClick={() => setState({ gbpConnected: !connected })}
        className="self-start"
        data-testid="mapguard-gbp-connect"
      >
        <ExternalLink className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        {connected ? "Will connect after setup" : "Connect Google Business Profile"}
      </Button>
      <div className="flex flex-col gap-0.5">
        <label htmlFor="mapguard-gbp-url" className="text-[11px] text-muted-foreground">
          Or paste your GBP URL
        </label>
        <Input
          id="mapguard-gbp-url"
          type="url"
          value={gbpUrl}
          onChange={(e) => setState({ gbpProfileUrl: e.target.value })}
          placeholder="https://www.google.com/maps/place/..."
          data-testid="mapguard-gbp-url"
        />
      </div>
    </div>
  );
}

function validateGbp(state: Record<string, unknown>): string | null {
  const connected = !!state.gbpConnected;
  const url = (state.gbpProfileUrl as string | undefined) ?? "";
  if (connected || url.trim().length > 10) return null;
  return "Connect GBP or paste your profile URL.";
}

function KeywordSelectStep({ state, setState }: WizardRenderContext) {
  const keywords = (state.keywords as string[] | undefined) ?? [];
  const [draft, setDraft] = useState("");

  const add = () => {
    const k = draft.trim();
    if (!k) return;
    if (keywords.includes(k)) {
      setDraft("");
      return;
    }
    setState({ keywords: [...keywords, k] });
    setDraft("");
  };

  const remove = (k: string) => {
    setState({ keywords: keywords.filter((x) => x !== k) });
  };

  // Seed suggestions from the trade picker if upstream wired it in (not used
  // by MapGuard's 3-step flow, but harmless if present).
  const tradeName = (state.tradeName as string | undefined) ?? null;
  const suggestions =
    tradeName != null
      ? [
          `${tradeName.toLowerCase()} near me`,
          `emergency ${tradeName.toLowerCase()}`,
          `24 hour ${tradeName.toLowerCase()}`,
          `best ${tradeName.toLowerCase()}`,
          `${tradeName.toLowerCase()} reviews`,
        ]
      : [
          "near me",
          "emergency",
          "24 hour",
          "best",
          "reviews",
        ];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-muted-foreground">
        Pick 3-5 keywords to monitor for rank changes inside the map pack.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--chart-1)/0.12)] px-2 py-0.5 text-[11px] text-foreground"
            data-testid={`mapguard-keyword-${k}`}
          >
            {k}
            <button
              type="button"
              onClick={() => remove(k)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Remove ${k}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="e.g. plumber near me"
          data-testid="mapguard-keyword-input"
        />
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {suggestions
          .filter((s) => !keywords.includes(s))
          .slice(0, 5)
          .map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setState({ keywords: [...keywords, s] })}
              className={cn(
                "rounded-full border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/40",
              )}
              data-testid={`mapguard-keyword-suggest-${s}`}
            >
              + {s}
            </button>
          ))}
      </div>
    </div>
  );
}

function validateKeywords(state: Record<string, unknown>): string | null {
  const keywords = (state.keywords as string[] | undefined) ?? [];
  if (keywords.length < 1) return "Add at least 1 keyword.";
  return null;
}

export default function MapGuardSetup() {
  usePageTitle("MapGuard setup");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const steps: OnboardingStep[] = [
    {
      id: "gbp",
      title: "Connect your Google Business Profile",
      description: "We'll watch for unauthorized edits, suspensions, and review-spam.",
      render: GbpConnectStep,
      validate: validateGbp,
      estimateMinutes: 2,
    },
    {
      id: "area",
      title: "Where do you serve?",
      description: "Defines the grid we use for rank monitoring inside the map pack.",
      render: ServiceAreaStep,
      validate: validateServiceArea,
      estimateMinutes: 1,
    },
    {
      id: "keywords",
      title: "Pick keywords to monitor",
      description: "3-5 keywords your customers search for. Add more later.",
      render: KeywordSelectStep,
      validate: validateKeywords,
      estimateMinutes: 2,
    },
  ];

  async function persist(state: WizardState) {
    await fetch("/api/portal/onboarding/submit", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "mapguard-wave33-wizard", ...state }),
    });
    toast({
      title: "MapGuard ready",
      description: "Watching your profile + keywords now. Heading to the dashboard.",
    });
    navigate("/portal/mapguard/dashboard");
  }

  return (
    <PortalLayout>
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4 md:p-6">
        <header className="flex flex-col">
          <h1 className="text-xl font-semibold text-foreground md:text-2xl">
            MapGuard setup
          </h1>
          <p className="text-sm text-muted-foreground">
            3 questions · under 5 minutes · alerts start on finish.
          </p>
        </header>
        <OnboardingWizard
          product="mapguard"
          steps={steps}
          onComplete={persist}
          onSkip={() => navigate("/portal/mapguard")}
          conciergeHref="/contact?topic=mapguard-onboarding"
        />
      </div>
    </PortalLayout>
  );
}
