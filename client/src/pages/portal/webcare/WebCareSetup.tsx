/**
 * /portal/webcare/setup — Wave 31 wizard, refactored on the Wave 33
 * universal OnboardingWizard scaffold.
 *
 * Identical persistence shape: POST /api/portal/onboarding/submit with
 * `product: "webcare"`. The Wave 33 refactor swaps the bespoke wizard
 * chrome for the shared primitive + WebsiteConnectStep, with two small
 * custom steps for access provisioning + SSL.
 */

import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, KeyRound, Lock, ShieldCheck } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  OnboardingWizard,
  type OnboardingStep,
  type WizardState,
  type WizardRenderContext,
} from "@/components/ui/visual-primitives";
import {
  WebsiteConnectStep,
  validateWebsiteConnect,
} from "@/components/onboarding/steps";
import { cn } from "@/lib/utils";

function AccessStep({ state, setState }: WizardRenderContext) {
  const provided = !!state.accessProvided;
  const skipped = !!state.accessSkipped;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <KeyRound className="h-3 w-3" aria-hidden="true" />
        Grant admin access so we can patch, backup, and restore. Skip and we'll only do read-only monitoring.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setState({ accessProvided: true, accessSkipped: false })}
          className={cn(
            "rounded-md border px-3 py-2 text-left text-sm transition-colors",
            provided
              ? "border-[hsl(var(--chart-1))] bg-[hsl(var(--chart-1)/0.08)] text-foreground ring-1 ring-inset ring-[hsl(var(--chart-1))]"
              : "border-border bg-card text-muted-foreground hover:bg-muted/40",
          )}
          data-testid="webcare-access-provide"
        >
          <div className="text-xs font-semibold text-foreground">I'll grant access</div>
          <div className="text-[11px]">We'll email instructions per platform.</div>
        </button>
        <button
          type="button"
          onClick={() => setState({ accessSkipped: true, accessProvided: false })}
          className={cn(
            "rounded-md border px-3 py-2 text-left text-sm transition-colors",
            skipped
              ? "border-[hsl(var(--chart-1))] bg-[hsl(var(--chart-1)/0.08)] text-foreground ring-1 ring-inset ring-[hsl(var(--chart-1))]"
              : "border-border bg-card text-muted-foreground hover:bg-muted/40",
          )}
          data-testid="webcare-access-skip"
        >
          <div className="text-xs font-semibold text-foreground">Read-only for now</div>
          <div className="text-[11px]">Skip — add later from the dashboard.</div>
        </button>
      </div>
    </div>
  );
}

function validateAccess(state: Record<string, unknown>): string | null {
  if (state.accessProvided || state.accessSkipped) return null;
  return "Pick one option.";
}

function SslStep({ state, setState }: WizardRenderContext) {
  const addSsl = state.addSsl as boolean | null | undefined;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3" aria-hidden="true" />
        Add a free SSL certificate via Cloudflare? Optional — your site keeps
        whatever cert it already has.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setState({ addSsl: true })}
          className={cn(
            "rounded-md border px-3 py-2 text-left text-sm transition-colors",
            addSsl === true
              ? "border-[hsl(var(--chart-1))] bg-[hsl(var(--chart-1)/0.08)] text-foreground ring-1 ring-inset ring-[hsl(var(--chart-1))]"
              : "border-border bg-card text-muted-foreground hover:bg-muted/40",
          )}
          data-testid="webcare-ssl-yes"
        >
          Yes — add SSL
        </button>
        <button
          type="button"
          onClick={() => setState({ addSsl: false })}
          className={cn(
            "rounded-md border px-3 py-2 text-left text-sm transition-colors",
            addSsl === false
              ? "border-[hsl(var(--chart-1))] bg-[hsl(var(--chart-1)/0.08)] text-foreground ring-1 ring-inset ring-[hsl(var(--chart-1))]"
              : "border-border bg-card text-muted-foreground hover:bg-muted/40",
          )}
          data-testid="webcare-ssl-no"
        >
          No thanks
        </button>
      </div>
    </div>
  );
}

function validateSsl(state: Record<string, unknown>): string | null {
  return state.addSsl === null || state.addSsl === undefined ? "Pick one option." : null;
}

export default function WebCareSetup() {
  usePageTitle("WebCare setup");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const steps: OnboardingStep[] = useMemo(
    () => [
      {
        id: "website",
        title: "Where's your website?",
        description: "We auto-detect the platform (WordPress / Wix / Shopify / custom).",
        render: WebsiteConnectStep,
        validate: validateWebsiteConnect,
        estimateMinutes: 1,
      },
      {
        id: "access",
        title: "Connect access",
        description: "Decide whether we manage write-ops or stay read-only.",
        render: AccessStep,
        validate: validateAccess,
        estimateMinutes: 2,
      },
      {
        id: "ssl",
        title: "Add SSL certificate?",
        description: "1-click via Cloudflare. Skip if you already have a cert.",
        render: SslStep,
        validate: validateSsl,
        estimateMinutes: 1,
      },
    ],
    [],
  );

  async function finish(state: WizardState) {
    try {
      const res = await fetch("/api/portal/onboarding/submit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: "webcare",
          answers: {
            website_url: ((state.websiteUrl as string) ?? "").trim(),
            detected_platform: state.cmsType ?? null,
            access_provided: !!state.accessProvided,
            access_skipped: !!state.accessSkipped,
            add_ssl_cloudflare: state.addSsl === true,
          },
        }),
      });
      if (!res.ok && res.status !== 404) {
        const j = await res.json().catch(() => ({}));
        if (j?.error) throw new Error(j.error);
      }
      toast({
        title: "WebCare setup saved",
        description: "First scan + backup queued. Log starts populating within an hour.",
      });
      setLocation("/portal/webcare/dashboard");
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
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              WebCare setup
            </h1>
            <p className="text-sm text-muted-foreground">
              3 quick questions — under 5 minutes — to queue your first scan and backup.
            </p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/portal/webcare/dashboard">
              <ChevronLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Back to dashboard
            </Link>
          </Button>
        </div>
        <OnboardingWizard
          product="webcare"
          steps={steps}
          onComplete={finish}
          onSkip={() => setLocation("/portal/webcare/dashboard")}
          conciergeHref="/contact?topic=webcare-onboarding"
        />
      </div>
    </PortalLayout>
  );
}
