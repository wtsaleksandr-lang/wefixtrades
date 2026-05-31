/**
 * /portal/quotequick/setup — Wave 29 wizard, refactored on the Wave 33
 * universal OnboardingWizard scaffold.
 *
 * Identical persistence endpoint as before (/api/portal/onboarding/submit
 * with source: "quotequick-wave29-wizard"). The Wave 33 refactor
 * collapses the bespoke 3-step wizard chrome into the shared primitive +
 * shared TradePicker + ServiceArea step renderers — cutting ~250 LOC
 * while preserving the 3-question shape, snippet-copy step, and live
 * preview rail.
 */

import { useMemo } from "react";
import { useLocation, Link } from "wouter";
import { ChevronLeft, Code2, Globe } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  ServiceAreaStep,
  validateServiceArea,
  detectCms,
} from "@/components/onboarding/steps";
import type { WizardRenderContext } from "@/components/ui/visual-primitives";

function EmbedSnippetStep({ state, setState }: WizardRenderContext) {
  const websiteUrl = (state.websiteUrl as string | undefined) ?? "";
  const businessName = (state.businessName as string | undefined) ?? "";
  const cms = websiteUrl ? detectCms(websiteUrl) : null;
  const slug = businessName
    ? businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    : "your-business";
  const inlineSnippet = `<script src="https://wefixtrades.com/qq-widget.js" data-slug="${slug}" data-mode="inline"></script>\n<div id="quotequick-widget"></div>`;
  const floatingSnippet = `<script src="https://wefixtrades.com/qq-widget.js" data-slug="${slug}" data-mode="floating"></script>`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor="qq-website-url" className="flex items-center gap-1 text-xs">
          <Globe className="h-3 w-3" aria-hidden="true" />
          Website URL (optional — we'll detect WordPress)
        </Label>
        <Input
          id="qq-website-url"
          type="url"
          value={websiteUrl}
          onChange={(e) => setState({ websiteUrl: e.target.value })}
          placeholder="https://yourbusiness.com"
          data-testid="qq-website-url"
        />
        {cms === "wordpress" && (
          <p className="text-[11px] text-[hsl(var(--chart-2))]">
            WordPress detected — use our 1-click plugin instead of the script.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <Label className="flex items-center gap-1 text-xs">
          <Code2 className="h-3 w-3" aria-hidden="true" />
          Inline embed snippet
        </Label>
        <pre
          className="overflow-auto rounded-md bg-muted/50 p-2 text-[11px] font-mono text-foreground"
          data-testid="qq-snippet-inline"
        >
          {inlineSnippet}
        </pre>
      </div>
      <div className="flex flex-col gap-0.5">
        <Label className="text-xs">Floating-button mode</Label>
        <pre
          className="overflow-auto rounded-md bg-muted/50 p-2 text-[11px] font-mono text-foreground"
          data-testid="qq-snippet-floating"
        >
          {floatingSnippet}
        </pre>
      </div>
    </div>
  );
}

export default function QuoteQuickSetup() {
  usePageTitle("QuoteQuick setup");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const steps: OnboardingStep[] = useMemo(
    () => [
      {
        id: "trade",
        title: "What's your trade?",
        description: "We'll auto-pick a calculator template tuned for your industry.",
        render: TradePickerStep,
        validate: validateTradePicker,
        estimateMinutes: 1,
      },
      {
        id: "service-area",
        title: "Where do you serve?",
        description: "Service area + business name + phone — pre-fills calculator constants.",
        render: ServiceAreaStep,
        validate: validateServiceArea,
        estimateMinutes: 2,
      },
      {
        id: "embed",
        title: "Embed your widget",
        description: "Drop one snippet on your site OR connect WordPress.",
        render: EmbedSnippetStep,
        estimateMinutes: 2,
      },
    ],
    [],
  );

  function livePreview(state: WizardState) {
    const businessName = (state.businessName as string | undefined) ?? "";
    const tradeName = (state.tradeName as string | undefined) ?? null;
    const zip = (state.zip as string | undefined) ?? "";
    return (
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <p className="text-sm font-semibold text-foreground">
          {businessName || "Your business"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {tradeName ?? "Pick a trade →"}
          {zip ? ` • ${zip}` : ""}
        </p>
        <div className="mt-2 rounded bg-card p-2 text-[11px] text-muted-foreground">
          Customer sees: "Get my free quote in 60 seconds"
        </div>
      </div>
    );
  }

  async function finish(state: WizardState) {
    try {
      const res = await fetch("/api/portal/onboarding/submit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: "quotequick",
          responses: {
            trade: state.tradeSlug,
            businessName: state.businessName,
            phone: state.phone,
            city: state.zip,
            websiteUrl: state.websiteUrl,
            radiusMiles: state.serviceAreaRadius ?? state.tradeDefaultRadiusMi ?? 25,
          },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Couldn't save your QuoteQuick setup. Please try again.");
      }
      toast({
        title: "Setup complete",
        description: "Your widget is live. Conversion data starts populating now.",
      });
      setLocation("/portal/quotequick/dashboard");
    } catch (err: unknown) {
      toast({
        title: "Setup failed",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <PortalLayout>
      <div className="flex flex-col gap-3 p-4 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col">
            <h1 className="text-xl font-semibold text-foreground md:text-2xl">
              QuoteQuick setup
            </h1>
            <p className="text-sm text-muted-foreground">
              3 questions • under 5 minutes • live preview at every step.
            </p>
          </div>
        </div>
        <OnboardingWizard
          product="quotequick"
          steps={steps}
          onComplete={finish}
          onSkip={() => setLocation("/portal/quotequick/dashboard")}
          livePreview={livePreview}
          conciergeHref="/contact?topic=quotequick-onboarding"
        />
        <div>
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
