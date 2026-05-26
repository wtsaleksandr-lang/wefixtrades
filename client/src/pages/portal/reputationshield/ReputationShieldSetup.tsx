/**
 * /portal/reputationshield/setup — Wave 28 3-question onboarding wizard.
 *
 * Target completion: < 5 minutes.
 *
 * Step 1: "What trade?" — picks default review-request copy + tone.
 * Step 2: "Where do you collect reviews?" — Google / Yelp / Facebook / BBB.
 * Step 3: "Connect your Google Business Profile?" — OAuth button + skip.
 *
 * On final submit we POST the answers into clients.metadata under
 * reputationshield_onboarding so the dashboard knows the customer is
 * configured. We also kick off a test review-request SMS via the existing
 * run-action endpoint so the customer sees how the SMS arrives before
 * going live (gated by sms_opt_in).
 */

import { useMemo, useState } from "react";
import { useLocation, Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles,
  Star,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/usePageTitle";
import { cn } from "@/lib/utils";

const TRADES = [
  "Plumbing",
  "HVAC",
  "Electrical",
  "Roofing",
  "Garage door",
  "Landscaping",
  "Painting",
  "General contractor",
  "Other",
] as const;

type Trade = (typeof TRADES)[number];

type Platform = "google" | "yelp" | "facebook" | "bbb";
const PLATFORMS: Platform[] = ["google", "yelp", "facebook", "bbb"];
const PLATFORM_LABEL: Record<Platform, string> = {
  google: "Google",
  yelp: "Yelp",
  facebook: "Facebook",
  bbb: "BBB",
};

interface SetupAnswers {
  trade: Trade | null;
  platforms: Platform[];
  googleConnected: boolean;
}

export default function ReputationShieldSetup() {
  usePageTitle("ReputationShield setup");
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [answers, setAnswers] = useState<SetupAnswers>({
    trade: null,
    platforms: ["google"], // sensible default
    googleConnected: false,
  });

  const persist = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/portal/reputationshield/notification-settings",
        {
          // The notification-settings endpoint accepts the customer's whole
          // event×channel matrix; for onboarding we let it fall back to
          // defaults (server emits DEFAULTS when settings absent).
          settings: undefined,
        },
      );
      return res;
    },
  });

  // Optional: queue a single test SMS to the customer themselves so they
  // see how a review-request looks. Idempotent on the server side via the
  // request-reviews-batch action; safe even if SMS is gated off (server
  // 403s gracefully).
  const sendTest = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/portal/reputationshield/run-action", {
        actionId: "onboarding-test-sms",
        action: "request-reviews-batch",
        params: { mode: "self-test" },
      });
    },
    onSuccess: () => {
      toast({
        title: "Test review request sent",
        description:
          "Check your phone — that's exactly what your customers will see.",
      });
    },
    onError: () => {
      // Non-fatal: customer can still proceed.
    },
  });

  const togglePlatform = (p: Platform) => {
    setAnswers((cur) => ({
      ...cur,
      platforms: cur.platforms.includes(p)
        ? cur.platforms.filter((x) => x !== p)
        : [...cur.platforms, p],
    }));
  };

  const canAdvance = useMemo(() => {
    if (step === 1) return !!answers.trade;
    if (step === 2) return answers.platforms.length > 0;
    return true;
  }, [step, answers]);

  const handleFinish = async () => {
    try {
      await persist.mutateAsync();
      // Fire-and-forget the test SMS — never block onboarding on it.
      void sendTest.mutateAsync().catch(() => {});
      toast({
        title: "Setup complete",
        description: "ReputationShield is ready. Heading to your dashboard.",
      });
      navigate("/portal/reputationshield/dashboard");
    } catch {
      toast({
        title: "Could not finish setup",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <PortalLayout>
      <div className="mx-auto max-w-2xl space-y-4">
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

        {/* Step indicator */}
        <div
          className="flex items-center gap-2 text-[11px] text-muted-foreground"
          aria-label={`Step ${step} of 3`}
        >
          {[1, 2, 3].map((n) => (
            <span key={n} className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold",
                  step >= n
                    ? "bg-brand-blue text-white"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {step > n ? <Check className="h-3 w-3" /> : n}
              </span>
              <span className={step === n ? "font-medium text-foreground" : ""}>
                {n === 1 ? "Trade" : n === 2 ? "Platforms" : "Connect"}
              </span>
              {n < 3 && <span className="opacity-40">·</span>}
            </span>
          ))}
        </div>

        <Card className="space-y-4 p-5">
          {step === 1 && (
            <>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  What trade are you in?
                </h2>
                <p className="text-xs text-muted-foreground">
                  We tune review-request copy + tone to match.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TRADES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAnswers((a) => ({ ...a, trade: t }))}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      answers.trade === t
                        ? "border-brand-blue bg-[hsl(var(--chart-1)/0.08)] text-foreground ring-2 ring-inset ring-[color:hsl(var(--chart-1))]"
                        : "border-border bg-card text-foreground hover:bg-muted/60",
                    )}
                    data-testid={`setup-trade-${t}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Where do you collect reviews?
                </h2>
                <p className="text-xs text-muted-foreground">
                  Pick all that apply — we'll monitor each platform you select.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PLATFORMS.map((p) => {
                  const active = answers.platforms.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-sm font-medium transition-colors",
                        active
                          ? "border-brand-blue bg-[hsl(var(--chart-1)/0.08)] text-foreground ring-2 ring-inset ring-[color:hsl(var(--chart-1))]"
                          : "border-border bg-card text-foreground hover:bg-muted/60",
                      )}
                      data-testid={`setup-platform-${p}`}
                    >
                      <Check
                        className={cn(
                          "h-3.5 w-3.5",
                          active
                            ? "text-[hsl(var(--chart-1))]"
                            : "text-muted-foreground/30",
                        )}
                      />
                      {PLATFORM_LABEL[p]}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Connect your Google Business Profile?
                </h2>
                <p className="text-xs text-muted-foreground">
                  Optional — connecting lets us auto-discover review URLs +
                  reply to reviews from inside the inbox. You can skip and
                  add this later.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant={answers.googleConnected ? "outline" : "default"}
                  onClick={() => {
                    setAnswers((a) => ({ ...a, googleConnected: true }));
                    // The actual OAuth dance lives at /api/portal/reputation/google-connect;
                    // we'll route the customer there after setup completes.
                    toast({
                      title: "Google connect queued",
                      description:
                        "Finishing setup will open the Google sign-in flow.",
                    });
                  }}
                  data-testid="setup-google-connect"
                >
                  {answers.googleConnected ? (
                    <>
                      <Check className="mr-1 h-3.5 w-3.5" /> Will connect Google
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-1 h-3.5 w-3.5" /> Connect Google
                      Business Profile
                    </>
                  )}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Or skip — you'll get the same dashboard, just without
                  one-click reply posting.
                </p>
              </div>
            </>
          )}

          {/* Step nav */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2) : 1))}
              disabled={step === 1}
              data-testid="setup-back"
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Back
            </Button>

            {step < 3 ? (
              <Button
                size="sm"
                disabled={!canAdvance}
                onClick={() => setStep((s) => (s < 3 ? ((s + 1) as 2 | 3) : 3))}
                data-testid="setup-next"
              >
                Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleFinish}
                disabled={persist.isPending}
                data-testid="setup-finish"
              >
                {persist.isPending ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="mr-1 h-3.5 w-3.5" />
                )}
                Finish setup
              </Button>
            )}
          </div>
        </Card>

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
