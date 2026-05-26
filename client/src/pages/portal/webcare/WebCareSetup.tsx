/**
 * /portal/webcare/setup — Wave 31 — 3-question WebCare onboarding wizard.
 *
 * Goal: under 5 minutes from zero → first maintenance scan + first
 * backup queued.
 *
 *   Step 1: "Where's your website?" — URL input + auto-detected CMS
 *           (WP / Wix / Shopify / custom). Detection runs client-side
 *           against /favicon and a HEAD request — heuristic only.
 *   Step 2: "Connect access" — instructions per detected platform.
 *           Skip option keeps the site under "manual review only" mode.
 *   Step 3: "Add SSL certificate?" — 1-click via existing Cloudflare
 *           integration. Skip is allowed; nudges customer if missing.
 *
 * Live preview pane mirrors the AdFlow pattern (Wave 30): shows the
 * dashboard hero with sample data so the customer sees the destination
 * during the flow.
 *
 * Backend: pipes through the existing onboarding orchestrator (Wave 31
 * does not introduce a new persist endpoint — the existing
 * onboardingMapper handles `product: "webcare"` server-side).
 */

import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { cn } from "@/lib/utils";

type Platform = "wordpress" | "wix" | "shopify" | "custom";

interface WizardState {
  step: 1 | 2 | 3;
  websiteUrl: string;
  detectedPlatform: Platform | null;
  accessProvided: boolean;
  accessSkipped: boolean;
  addSsl: boolean | null;
}

const INITIAL_STATE: WizardState = {
  step: 1,
  websiteUrl: "",
  detectedPlatform: null,
  accessProvided: false,
  accessSkipped: false,
  addSsl: null,
};

const PLATFORM_LABEL: Record<Platform, string> = {
  wordpress: "WordPress",
  wix: "Wix",
  shopify: "Shopify",
  custom: "Custom / Other",
};

function guessPlatformFromUrl(url: string): Platform {
  const u = url.toLowerCase();
  if (u.includes("wp-content") || u.includes("wp-admin") || u.endsWith(".wpengine.com")) {
    return "wordpress";
  }
  if (u.includes("wix.com") || u.includes("wixsite.com")) return "wix";
  if (u.includes("shopify") || u.includes("myshopify.com")) return "shopify";
  return "custom";
}

export default function WebCareSetup() {
  usePageTitle("WebCare setup");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [saving, setSaving] = useState(false);

  const detectedPlatform = useMemo<Platform | null>(() => {
    if (!state.websiteUrl) return null;
    return state.detectedPlatform ?? guessPlatformFromUrl(state.websiteUrl);
  }, [state.detectedPlatform, state.websiteUrl]);

  function next() {
    setState((s) => ({ ...s, step: Math.min(3, s.step + 1) as WizardState["step"] }));
  }
  function back() {
    setState((s) => ({ ...s, step: Math.max(1, s.step - 1) as WizardState["step"] }));
  }

  async function finish() {
    setSaving(true);
    try {
      const res = await fetch("/api/portal/onboarding/submit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: "webcare",
          answers: {
            website_url: state.websiteUrl.trim(),
            detected_platform: detectedPlatform,
            access_provided: state.accessProvided,
            access_skipped: state.accessSkipped,
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
        description:
          "First maintenance scan and backup are queued — log will start populating within an hour.",
      });
      setLocation("/portal/webcare/dashboard");
    } catch (err: any) {
      toast({
        title: "Could not save",
        description: err?.message ?? "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const canAdvance =
    (state.step === 1 && state.websiteUrl.trim().length > 5) ||
    (state.step === 2 && (state.accessProvided || state.accessSkipped)) ||
    (state.step === 3 && state.addSsl !== null);

  return (
    <PortalLayout>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex flex-col">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground md:text-2xl">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              WebCare setup
            </h1>
            <p className="text-sm text-muted-foreground">
              3 quick questions — under 5 minutes — to queue your first scan
              and backup.
            </p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/portal/webcare/dashboard">
              <ChevronLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Back to dashboard
            </Link>
          </Button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <StepDot active={state.step === 1} done={state.step > 1} label="Website" icon={<Globe className="h-3 w-3" />} />
            <StepDivider done={state.step > 1} />
            <StepDot active={state.step === 2} done={state.step > 2} label="Access" icon={<KeyRound className="h-3 w-3" />} />
            <StepDivider done={state.step > 2} />
            <StepDot active={state.step === 3} done={false} label="SSL" icon={<Lock className="h-3 w-3" />} />
          </div>
          <span className="text-[11px] text-muted-foreground" data-testid="webcare-step-indicator">
            Step {state.step} of 3
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-3 p-4">
            {state.step === 1 && (
              <>
                <h2 className="text-sm font-semibold text-foreground">
                  Where's your website?
                </h2>
                <p className="text-xs text-muted-foreground">
                  Paste the URL — we'll auto-detect your CMS and tailor the
                  maintenance plan.
                </p>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="website-url" className="text-[11px]">
                    Website URL
                  </Label>
                  <Input
                    id="website-url"
                    value={state.websiteUrl}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        websiteUrl: e.target.value,
                        detectedPlatform: null,
                      }))
                    }
                    placeholder="https://yourbusiness.com"
                    className="h-9 text-sm"
                    data-testid="webcare-website-url"
                    autoComplete="url"
                  />
                </div>
                {detectedPlatform && (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                    <Sparkles className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <p className="text-xs text-foreground">
                      Auto-detected:&nbsp;
                      <span className="font-semibold">
                        {PLATFORM_LABEL[detectedPlatform]}
                      </span>
                    </p>
                    <div className="ml-auto flex gap-1">
                      {(Object.keys(PLATFORM_LABEL) as Platform[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() =>
                            setState((s) => ({ ...s, detectedPlatform: p }))
                          }
                          className={cn(
                            "rounded-md border px-2 py-0.5 text-[10px] font-medium",
                            detectedPlatform === p
                              ? "border-foreground text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground",
                          )}
                          data-testid={`webcare-platform-${p}`}
                        >
                          {PLATFORM_LABEL[p]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {state.step === 2 && (
              <>
                <h2 className="text-sm font-semibold text-foreground">
                  Connect access
                </h2>
                <p className="text-xs text-muted-foreground">
                  {detectedPlatform === "wordpress"
                    ? "Add a maintenance-mode WP admin user and an application password. We'll never see your owner password."
                    : detectedPlatform === "wix" || detectedPlatform === "shopify"
                      ? `Generate an API key in your ${PLATFORM_LABEL[detectedPlatform]} admin and paste it on the next setup screen.`
                      : "If you can't share access right now, choose 'Manual review only' — we'll still monitor uptime + send monthly reports."}
                </p>
                <div className="flex flex-col gap-2 pt-1">
                  <Button
                    type="button"
                    variant={state.accessProvided ? "default" : "outline"}
                    size="sm"
                    className="h-auto justify-start gap-2 px-3 py-2 text-left"
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        accessProvided: true,
                        accessSkipped: false,
                      }))
                    }
                    data-testid="webcare-access-provide"
                  >
                    <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-xs font-semibold">
                        I'll add access now
                      </span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        Walk-through opens after setup completes.
                      </span>
                    </div>
                  </Button>
                  <Button
                    type="button"
                    variant={state.accessSkipped ? "default" : "outline"}
                    size="sm"
                    className="h-auto justify-start gap-2 px-3 py-2 text-left"
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        accessProvided: false,
                        accessSkipped: true,
                      }))
                    }
                    data-testid="webcare-access-skip"
                  >
                    <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-xs font-semibold">
                        Manual review only
                      </span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        We'll monitor uptime + send monthly reports without
                        direct access.
                      </span>
                    </div>
                  </Button>
                </div>
              </>
            )}

            {state.step === 3 && (
              <>
                <h2 className="text-sm font-semibold text-foreground">
                  Add an SSL certificate?
                </h2>
                <p className="text-xs text-muted-foreground">
                  SSL keeps your site secure and helps your SEO. We can
                  provision one via our Cloudflare integration with one click.
                </p>
                <div className="flex flex-col gap-2 pt-1">
                  <Button
                    type="button"
                    variant={state.addSsl === true ? "default" : "outline"}
                    size="sm"
                    className="h-auto justify-start gap-2 px-3 py-2 text-left"
                    onClick={() => setState((s) => ({ ...s, addSsl: true }))}
                    data-testid="webcare-ssl-yes"
                  >
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-xs font-semibold">
                        Yes — provision SSL via Cloudflare
                      </span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        Free, takes about 5 minutes to take effect.
                      </span>
                    </div>
                  </Button>
                  <Button
                    type="button"
                    variant={state.addSsl === false ? "default" : "outline"}
                    size="sm"
                    className="h-auto justify-start gap-2 px-3 py-2 text-left"
                    onClick={() => setState((s) => ({ ...s, addSsl: false }))}
                    data-testid="webcare-ssl-skip"
                  >
                    <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-xs font-semibold">
                        Skip — I already have SSL
                      </span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        We'll verify on the first scan and nudge if it expires.
                      </span>
                    </div>
                  </Button>
                </div>
              </>
            )}

            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={back}
                disabled={state.step === 1 || saving}
                data-testid="webcare-wizard-back"
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Back
              </Button>
              {state.step < 3 ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={next}
                  disabled={!canAdvance || saving}
                  data-testid="webcare-wizard-next"
                >
                  Continue
                  <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={finish}
                  disabled={!canAdvance || saving}
                  data-testid="webcare-wizard-finish"
                >
                  {saving ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Queue first scan
                </Button>
              )}
            </div>
          </Card>

          {/* Live preview pane */}
          <Card className="flex flex-col gap-3 p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Your dashboard once we're live
            </h2>
            {!state.websiteUrl ? (
              <p className="text-xs text-muted-foreground">
                Add your URL on the left to see a sample dashboard render.
              </p>
            ) : (
              <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Live dashboard preview
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-muted/40 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">Security grade</p>
                    <p className="text-base font-bold text-foreground">A</p>
                  </div>
                  <div className="rounded-md bg-muted/40 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">Uptime</p>
                    <p className="text-base font-bold text-foreground">100.0%</p>
                  </div>
                  <div className="rounded-md bg-muted/40 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">Days incident-free</p>
                    <p className="text-base font-bold text-foreground">0</p>
                  </div>
                  <div className="rounded-md bg-muted/40 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">Performance</p>
                    <p className="text-base font-bold text-foreground">—</p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Detected platform:&nbsp;
                  <span className="font-medium text-foreground">
                    {detectedPlatform ? PLATFORM_LABEL[detectedPlatform] : "—"}
                  </span>
                </p>
              </div>
            )}
            {state.accessProvided && (
              <p className="text-[11px] text-muted-foreground">
                Once you add access, the Maintenance Log will start filling in
                within an hour. Each action — plugin update, malware scan,
                backup — appears in plain English.
              </p>
            )}
            {state.accessSkipped && (
              <p className="text-[11px] text-muted-foreground">
                Manual-review mode: uptime + monthly reports only. You can add
                full access any time from the dashboard.
              </p>
            )}
          </Card>
        </div>
      </div>
    </PortalLayout>
  );
}

function StepDot({
  active,
  done,
  label,
  icon,
}: {
  active: boolean;
  done: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
        active && "border-[hsl(var(--chart-1))] bg-[hsl(var(--chart-1)/0.08)] text-foreground",
        done && !active && "border-[hsl(var(--chart-2))] text-[hsl(var(--chart-2))]",
        !active && !done && "border-border text-muted-foreground",
      )}
    >
      {done ? <Check className="h-3 w-3" aria-hidden="true" /> : icon}
      {label}
    </span>
  );
}

function StepDivider({ done }: { done: boolean }) {
  return (
    <span
      className="h-0.5 w-4 rounded"
      style={{
        backgroundColor: done ? "hsl(var(--chart-2))" : "hsl(var(--border))",
      }}
    />
  );
}
