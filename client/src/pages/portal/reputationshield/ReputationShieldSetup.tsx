/**
 * /portal/reputationshield/setup — Wave 28 wizard, refactored on the
 * Wave 33 universal OnboardingWizard scaffold.
 *
 * Identical persistence shape and behavior: POSTs notification settings
 * to /api/portal/reputationshield/notification-settings and
 * fire-and-forget queues a self-test SMS via run-action. Wave 33
 * collapses the bespoke 3-step wizard chrome onto the shared primitive
 * + shared TradePicker + PlatformConnect step renderers.
 */

import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Star } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  OnboardingWizard,
  type OnboardingStep,
  type WizardState,
  type WizardRenderContext,
} from "@/components/ui/visual-primitives";
import {
  TradePickerStep,
  validateTradePicker,
  renderPlatformConnect,
  validatePlatformConnect,
} from "@/components/onboarding/steps";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function GoogleConnectStep({ state, setState }: WizardRenderContext) {
  const connected = !!state.googleConnected;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-muted-foreground">
        Optional — connecting lets us auto-discover review URLs and reply to
        reviews from inside the inbox. You can skip and add later.
      </p>
      <Button
        type="button"
        size="sm"
        variant={connected ? "outline" : "default"}
        onClick={() => setState({ googleConnected: !connected })}
        className={cn("self-start")}
        data-testid="reputation-google-connect"
      >
        {connected ? "Will connect Google after setup" : "Connect Google Business Profile"}
      </Button>
    </div>
  );
}

export default function ReputationShieldSetup() {
  usePageTitle("ReputationShield setup");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const persist = useMutation({
    mutationFn: async () => {
      // Server emits DEFAULTS when settings absent; we just touch the endpoint
      // to mark the customer as onboarded.
      return apiRequest(
        "POST",
        "/api/portal/reputationshield/notification-settings",
        { settings: undefined },
      );
    },
  });

  const sendTest = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/portal/reputationshield/run-action", {
        actionId: "onboarding-test-sms",
        action: "request-reviews-batch",
        params: { mode: "self-test" },
      }),
  });

  const steps: OnboardingStep[] = useMemo(
    () => [
      {
        id: "trade",
        title: "What trade are you in?",
        description: "We tune review-request copy + tone to match.",
        render: TradePickerStep,
        validate: validateTradePicker,
        estimateMinutes: 1,
      },
      {
        id: "platforms",
        title: "Where do you collect reviews?",
        description: "Pick all that apply — we'll monitor each.",
        render: renderPlatformConnect("reviews"),
        validate: validatePlatformConnect,
        estimateMinutes: 1,
      },
      {
        id: "google",
        title: "Connect your Google Business Profile?",
        description: "Optional — enables 1-click reply from the inbox.",
        render: GoogleConnectStep,
        optional: true,
        estimateMinutes: 1,
      },
    ],
    [],
  );

  async function finish(state: WizardState) {
    try {
      // Persist the customer's collected answers (trade + platforms) to the
      // real onboarding record. This is the source of truth — it must succeed.
      const res = await fetch("/api/portal/onboarding/submit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: "reputationshield", responses: state }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Couldn't save your ReputationShield setup. Please try again.");
      }
      // Initialise default notification settings + fire the self-test SMS —
      // both non-blocking; onboarding is already saved above.
      void persist.mutateAsync().catch(() => {});
      void sendTest.mutateAsync().catch(() => {});
      toast({
        title: "Setup complete",
        description: "ReputationShield is ready. Heading to your dashboard.",
      });
      navigate("/portal/reputationshield/dashboard");
    } catch (err: unknown) {
      toast({
        title: "Could not finish setup",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
      throw err instanceof Error ? err : new Error("Could not finish setup");
    }
  }

  return (
    <PortalLayout>
      <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-6">
        <div className="flex items-center gap-3">
          <div
            data-theme="light"
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-blue"
          >
            <Star className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              ReputationShield setup
            </h1>
            <p className="text-sm text-muted-foreground">
              3 questions · under 5 minutes
            </p>
          </div>
        </div>
        <OnboardingWizard
          product="reputationshield"
          steps={steps}
          onComplete={finish}
          onSkip={() => navigate("/portal/reputationshield/dashboard")}
          conciergeHref="/contact?topic=reputationshield-onboarding"
        />
        <p className="text-center text-[11px] text-muted-foreground">
          Already configured?{" "}
          <Link
            href="/portal/reputationshield/dashboard"
            className="underline-offset-2 hover:underline"
          >
            Go to dashboard
          </Link>
        </p>
      </div>
    </PortalLayout>
  );
}
