/**
 * /portal/socialsync/setup — Wave 33 — 3-question SocialSync onboarding (v2).
 *
 * Wave 33 refactor of the legacy SocialSyncSetup.tsx. The legacy wizard
 * was a 5-step survey form that violated the under-5-min target. This
 * v2 keeps the same persistence endpoint
 * (/api/portal/socialsync-profile) but cuts the flow to 3 questions
 * via the shared OnboardingWizard scaffold.
 *
 *   Step 1: PlatformConnect (social mode) → which channels to manage
 *   Step 2: BrandVoice                    → tone selection
 *   Step 3: Auto-approve toggle           → posts auto-publish vs draft
 *
 * The legacy /portal/socialsync-setup route stays mounted and redirects
 * to /portal/socialsync/setup (handled in App.tsx).
 */

import { useLocation } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { apiRequest } from "@/lib/queryClient";
import {
  OnboardingWizard,
  type OnboardingStep,
  type WizardState,
} from "@/components/ui/visual-primitives";
import {
  renderPlatformConnect,
  validatePlatformConnect,
} from "@/components/onboarding/steps";
import { cn } from "@/lib/utils";
import type { WizardRenderContext } from "@/components/ui/visual-primitives";

const TONES = [
  { id: "professional", label: "Professional" },
  { id: "friendly", label: "Friendly" },
  { id: "casual", label: "Casual" },
  { id: "authoritative", label: "Authoritative" },
] as const;

function BrandVoiceStep({ state, setState }: WizardRenderContext) {
  const tone = (state.brandVoiceTone as string | undefined) ?? null;
  return (
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
            data-testid={`socialsync-tone-${t.id}`}
          >
            <span className="text-xs font-semibold text-foreground">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function AutoApproveStep({ state, setState }: WizardRenderContext) {
  const auto = !!state.autoApprove;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-muted-foreground">
        Auto-publish posts AI drafts straight to your channels. Switch off
        to review every post first (recommended for week 1).
      </p>
      <button
        type="button"
        onClick={() => setState({ autoApprove: !auto })}
        className={cn(
          "self-start rounded-md border px-3 py-2 text-sm transition-colors",
          auto
            ? "border-[hsl(var(--chart-1))] bg-[hsl(var(--chart-1)/0.08)] text-foreground"
            : "border-border bg-card text-muted-foreground",
        )}
        data-testid="socialsync-auto-approve"
      >
        {auto ? "Auto-publish ON" : "Review every post first"}
      </button>
    </div>
  );
}

function validateTone(state: Record<string, unknown>): string | null {
  return state.brandVoiceTone ? null : "Pick a brand voice to continue.";
}

export default function SocialSyncSetupV2() {
  usePageTitle("SocialSync setup");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const steps: OnboardingStep[] = [
    {
      id: "channels",
      title: "Which channels are we managing?",
      description: "We'll post + monitor each channel you select.",
      render: renderPlatformConnect("social"),
      validate: validatePlatformConnect,
    },
    {
      id: "voice",
      title: "What's your brand voice?",
      description: "We'll match drafts to this tone.",
      render: BrandVoiceStep,
      validate: validateTone,
    },
    {
      id: "auto",
      title: "Auto-publish drafts?",
      description: "On = drafts publish immediately. Off = you approve first.",
      render: AutoApproveStep,
    },
  ];

  async function persist(state: WizardState) {
    const res = await fetch("/api/portal/onboarding/submit", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: "socialsync",
        responses: {
          platform_preferences: state.connectedPlatforms ?? [],
          tone: state.brandVoiceTone ?? "professional",
          auto_approve: !!state.autoApprove,
        },
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error || "Couldn't save your SocialSync setup. Please try again.");
    }
    toast({
      title: "SocialSync ready",
      description: "First drafts will queue within an hour.",
    });
    navigate("/portal/socialsync");
  }

  return (
    <PortalLayout>
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4 md:p-6">
        <header className="flex flex-col">
          <h1 className="text-xl font-semibold text-foreground md:text-2xl">
            SocialSync setup
          </h1>
          <p className="text-sm text-muted-foreground">
            3 questions · under 5 minutes · first drafts queue on finish.
          </p>
        </header>
        <OnboardingWizard
          product="socialsync"
          steps={steps}
          onComplete={persist}
          onSkip={() => navigate("/portal/socialsync")}
          conciergeHref="/contact?topic=socialsync-onboarding"
        />
      </div>
    </PortalLayout>
  );
}
