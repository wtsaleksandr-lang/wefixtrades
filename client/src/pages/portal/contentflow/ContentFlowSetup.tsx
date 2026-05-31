/**
 * /portal/contentflow/setup — Wave 33 — 3-question ContentFlow onboarding.
 *
 * Built on the universal OnboardingWizard primitive + shared step
 * renderers (Wave 33). Targets under 5 min from zero → first scheduled
 * post in the calendar.
 *
 *   Step 1: TradePicker        → seeds prompt library + post tone
 *   Step 2: Brand voice tone   → casual / professional / authoritative
 *   Step 3: Auto-publish chans → FB / IG / LinkedIn / WhatsApp checkbox
 *
 * Persists into clients.metadata.contentflow_setup via the generic
 * /api/portal/onboarding/submit endpoint (PR #785) — no new schema.
 */

import { useLocation } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";
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
  renderPlatformConnect,
  validatePlatformConnect,
} from "@/components/onboarding/steps";
import { cn } from "@/lib/utils";
import type { WizardRenderContext } from "@/components/ui/visual-primitives";

const TONES = [
  { id: "casual", label: "Casual", helper: "Relaxed, conversational, friendly" },
  { id: "professional", label: "Professional", helper: "Clean, trustworthy, factual" },
  { id: "authoritative", label: "Authoritative", helper: "Expert, confident, in-the-know" },
  { id: "playful", label: "Playful", helper: "Fun, witty, light" },
] as const;

function BrandVoiceStep({ state, setState }: WizardRenderContext) {
  const tone = (state.brandVoiceTone as string | undefined) ?? null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-muted-foreground">
        Pick the voice we'll use when drafting posts. You can change this any time.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {TONES.map((t) => {
          const active = tone === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setState({ brandVoiceTone: t.id })}
              className={cn(
                "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                active
                  ? "border-[hsl(var(--chart-1))] bg-[hsl(var(--chart-1)/0.08)] text-foreground ring-1 ring-inset ring-[hsl(var(--chart-1))]"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/40",
              )}
              data-testid={`contentflow-tone-${t.id}`}
            >
              <div className="text-xs font-semibold text-foreground">{t.label}</div>
              <div className="text-[11px]">{t.helper}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function validateBrandVoice(state: Record<string, unknown>): string | null {
  return state.brandVoiceTone ? null : "Pick a brand voice to continue.";
}

export default function ContentFlowSetup() {
  usePageTitle("ContentFlow setup");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const steps: OnboardingStep[] = [
    {
      id: "trade",
      title: "What's your trade?",
      description: "We'll seed your prompt library with trade-specific angles.",
      render: TradePickerStep,
      validate: validateTradePicker,
      estimateMinutes: 1,
    },
    {
      id: "voice",
      title: "What's your brand voice?",
      description: "We'll match every draft's tone to your selection.",
      render: BrandVoiceStep,
      validate: validateBrandVoice,
      estimateMinutes: 1,
    },
    {
      id: "channels",
      title: "Where should we auto-publish?",
      description: "Pick channels for instant cross-posting. You can always approve manually.",
      render: renderPlatformConnect("social"),
      validate: validatePlatformConnect,
      estimateMinutes: 2,
    },
  ];

  async function persist(state: WizardState) {
    const res = await fetch("/api/portal/onboarding/submit", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: "contentflow", responses: state }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error || "Couldn't save your ContentFlow setup. Please try again.");
    }
    toast({
      title: "ContentFlow ready",
      description: "Your first draft is queuing now. Heading to the calendar.",
    });
    navigate("/portal/contentflow/dashboard");
  }

  return (
    <PortalLayout>
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4 md:p-6">
        <header className="flex flex-col">
          <h1 className="text-xl font-semibold text-foreground md:text-2xl">
            ContentFlow setup
          </h1>
          <p className="text-sm text-muted-foreground">
            3 questions · under 5 minutes · drafts queue on finish.
          </p>
        </header>
        <OnboardingWizard
          product="contentflow"
          steps={steps}
          onComplete={persist}
          onSkip={() => navigate("/portal/contentflow")}
          conciergeHref="/contact?topic=contentflow-onboarding"
        />
      </div>
    </PortalLayout>
  );
}
