/**
 * /portal/quotequick/setup — Wave 29 — 3-question trade-onboarding wizard.
 *
 * Goal: under 5 minutes from zero → live embedded widget.
 *
 *   Step 1: "What's your trade?"
 *           Trade picker — auto-selects matching template from the 60+
 *           preset templates shipped in PR #785.
 *   Step 2: "Where do you serve?"
 *           Service area + business name + phone. Auto-pre-fills calculator
 *           constants (mile radius, base service fee).
 *   Step 3: "Embed your widget"
 *           Copy-paste <script> snippet OR connect WordPress (if WP
 *           detected via URL).
 *
 * Live preview pane on the right at each step.
 *
 * Backend wiring: this wizard does NOT POST to a new endpoint — it pipes
 * to the existing /api/portal/onboarding endpoints (PR #785). Wave 29
 * surface is just the new front-end narrative.
 */

import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Code2,
  Globe,
  Loader2,
  MapPin,
  Wrench,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { OnboardingWalkthrough } from "@/components/ui/visual-primitives";
import { cn } from "@/lib/utils";

const TRADE_OPTIONS = [
  { id: "pressure-washing", label: "Pressure Washing", radius: 25 },
  { id: "window-cleaning", label: "Window Cleaning", radius: 15 },
  { id: "lawn-care", label: "Lawn Care", radius: 20 },
  { id: "plumbing", label: "Plumbing", radius: 30 },
  { id: "electrical", label: "Electrical", radius: 30 },
  { id: "hvac", label: "HVAC", radius: 35 },
  { id: "roofing", label: "Roofing", radius: 50 },
  { id: "painting", label: "Painting", radius: 25 },
  { id: "junk-removal", label: "Junk Removal", radius: 30 },
  { id: "moving", label: "Moving", radius: 100 },
  { id: "handyman", label: "Handyman", radius: 20 },
  { id: "cleaning", label: "House Cleaning", radius: 20 },
] as const;

type TradeId = (typeof TRADE_OPTIONS)[number]["id"];

interface WizardState {
  step: 1 | 2 | 3;
  trade: TradeId | null;
  businessName: string;
  phone: string;
  city: string;
  websiteUrl: string;
}

const INITIAL_STATE: WizardState = {
  step: 1,
  trade: null,
  businessName: "",
  phone: "",
  city: "",
  websiteUrl: "",
};

function detectWordPress(url: string): boolean {
  return /\.wpengine\.com|wordpress\.com|\/wp-(content|admin)/i.test(url);
}

export default function QuoteQuickSetup() {
  usePageTitle("QuoteQuick setup");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [saving, setSaving] = useState(false);

  const isWordPress = useMemo(
    () => detectWordPress(state.websiteUrl),
    [state.websiteUrl],
  );

  const selectedTrade = useMemo(
    () => TRADE_OPTIONS.find((t) => t.id === state.trade) ?? null,
    [state.trade],
  );

  const snippet = useMemo(() => {
    const slug = state.businessName
      ? state.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
      : "your-business";
    return `<script src="https://wefixtrades.com/qq-widget.js" data-slug="${slug}" data-mode="inline"></script>\n<div id="quotequick-widget"></div>`;
  }, [state.businessName]);

  const floatingSnippet = useMemo(() => {
    const slug = state.businessName
      ? state.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
      : "your-business";
    return `<script src="https://wefixtrades.com/qq-widget.js" data-slug="${slug}" data-mode="floating"></script>`;
  }, [state.businessName]);

  function next() {
    setState((s) => ({ ...s, step: Math.min(3, s.step + 1) as WizardState["step"] }));
  }

  function back() {
    setState((s) => ({ ...s, step: Math.max(1, s.step - 1) as WizardState["step"] }));
  }

  async function finish() {
    setSaving(true);
    try {
      // We pipe the new wizard state into the legacy onboarding endpoint —
      // no new schema in Wave 29. The legacy endpoint stitches trade +
      // city + phone into the per-tenant calculator template.
      await fetch("/api/portal/onboarding/submit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "quotequick-wave29-wizard",
          trade: state.trade,
          businessName: state.businessName,
          phone: state.phone,
          city: state.city,
          websiteUrl: state.websiteUrl,
          radiusMiles: selectedTrade?.radius ?? 25,
        }),
      });
      toast({
        title: "Setup complete",
        description: "Your widget is live. Conversion data starts populating now.",
      });
      setLocation("/portal/quotequick/dashboard");
    } catch (err: any) {
      toast({
        title: "Setup failed",
        description: err?.message ?? "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const canAdvance =
    (state.step === 1 && !!state.trade) ||
    (state.step === 2 &&
      state.businessName.length > 1 &&
      state.phone.length > 6 &&
      state.city.length > 1) ||
    state.step === 3;

  return (
    <PortalLayout>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col">
            <h1 className="text-xl font-semibold text-foreground md:text-2xl">
              QuoteQuick setup
            </h1>
            <p className="text-sm text-muted-foreground">
              3 questions • under 5 minutes • live preview at every step.
            </p>
          </div>
          <span className="text-[11px] text-muted-foreground" data-testid="step-indicator">
            Step {state.step} of 3
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,360px)]">
          {/* Step content */}
          <Card className="flex flex-col gap-3 p-4">
            {state.step === 1 && (
              <>
                <div className="flex flex-col gap-1">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Wrench className="h-4 w-4" aria-hidden="true" />
                    What's your trade?
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    We'll auto-pick a calculator template tuned for your industry.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {TRADE_OPTIONS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setState((s) => ({ ...s, trade: t.id }))}
                      className={cn(
                        "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        state.trade === t.id
                          ? "border-[hsl(var(--chart-1))] bg-[hsl(var(--chart-1)/0.08)] text-foreground"
                          : "border-border bg-card text-muted-foreground",
                      )}
                      data-testid={`trade-${t.id}`}
                    >
                      <span className="font-medium">{t.label}</span>
                      {state.trade === t.id && (
                        <Check
                          className="h-4 w-4 text-[hsl(var(--chart-1))]"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}

            {state.step === 2 && (
              <>
                <div className="flex flex-col gap-1">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    Where do you serve?
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Service area + business name + phone. We'll pre-fill calculator
                    constants for{" "}
                    {selectedTrade ? (
                      <span className="font-medium text-foreground">
                        {selectedTrade.label}
                      </span>
                    ) : (
                      "your trade"
                    )}
                    {selectedTrade ? ` (radius ${selectedTrade.radius} mi).` : "."}
                  </p>
                </div>
                <div className="grid gap-3">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="businessName" className="text-xs">
                      Business name
                    </Label>
                    <Input
                      id="businessName"
                      value={state.businessName}
                      onChange={(e) =>
                        setState((s) => ({ ...s, businessName: e.target.value }))
                      }
                      placeholder="e.g. Acme Pressure Washing"
                      data-testid="input-business-name"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="phone" className="text-xs">
                      Phone
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={state.phone}
                      onChange={(e) =>
                        setState((s) => ({ ...s, phone: e.target.value }))
                      }
                      placeholder="(555) 123-4567"
                      data-testid="input-phone"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="city" className="text-xs">
                      Primary city
                    </Label>
                    <Input
                      id="city"
                      value={state.city}
                      onChange={(e) =>
                        setState((s) => ({ ...s, city: e.target.value }))
                      }
                      placeholder="Atlanta, GA"
                      data-testid="input-city"
                    />
                  </div>
                </div>
              </>
            )}

            {state.step === 3 && (
              <>
                <div className="flex flex-col gap-1">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Code2 className="h-4 w-4" aria-hidden="true" />
                    Embed your widget
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Drop one snippet on your site OR connect WordPress.
                  </p>
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor="websiteUrl" className="text-xs">
                    Website URL (optional — we'll detect WordPress)
                  </Label>
                  <Input
                    id="websiteUrl"
                    type="url"
                    value={state.websiteUrl}
                    onChange={(e) =>
                      setState((s) => ({ ...s, websiteUrl: e.target.value }))
                    }
                    placeholder="https://yourbusiness.com"
                    data-testid="input-website"
                  />
                  {isWordPress && (
                    <p className="text-[11px] text-[hsl(var(--chart-2))]">
                      <Globe
                        className="mr-0.5 inline h-3 w-3"
                        aria-hidden="true"
                      />
                      WordPress detected — use our 1-click plugin instead of the script.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Inline embed snippet</Label>
                  <pre className="overflow-auto rounded-md bg-muted/50 p-2 text-[11px] font-mono text-foreground">
                    {snippet}
                  </pre>
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Floating-button mode</Label>
                  <pre className="overflow-auto rounded-md bg-muted/50 p-2 text-[11px] font-mono text-foreground">
                    {floatingSnippet}
                  </pre>
                </div>
              </>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={back}
                disabled={state.step === 1 || saving}
                data-testid="wizard-back"
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Back
              </Button>
              {state.step < 3 ? (
                <Button
                  size="sm"
                  onClick={next}
                  disabled={!canAdvance}
                  data-testid="wizard-next"
                >
                  Continue
                  <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={finish}
                  disabled={saving}
                  data-testid="wizard-finish"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Saving…
                    </>
                  ) : (
                    <>
                      Finish
                      <Check className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </Card>

          {/* Live preview */}
          <Card className="flex flex-col gap-2 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Live preview
            </h3>
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <p className="text-sm font-semibold text-foreground">
                {state.businessName || "Your business"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {selectedTrade?.label ?? "Pick a trade →"}
                {state.city ? ` • ${state.city}` : ""}
              </p>
              <div className="mt-2 rounded bg-card p-2 text-[11px] text-muted-foreground">
                Customer sees: "Get my free quote in 60 seconds"
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Once you finish, this widget goes live at your shareable URL
              within seconds.
            </p>
          </Card>
        </div>

        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/portal/quotequick/dashboard">
              <ChevronLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Back to dashboard
            </Link>
          </Button>
        </div>
      </div>
    </PortalLayout>
  );
}
