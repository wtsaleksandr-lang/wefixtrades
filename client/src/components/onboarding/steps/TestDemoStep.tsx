/**
 * TestDemoStep — Wave 33 shared onboarding step.
 *
 * Final "see it work" step per product. Each product provides a tiny
 * demo trigger (test call, live widget preview, sample ad, sample
 * dashboard, etc.). This step renderer factory accepts a per-product
 * configuration so the wizard mounts the right CTA + visual.
 *
 * Writes: { demoTriggeredAt }
 */

import { useState } from "react";
import { Loader2, PlayCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WizardRenderContext } from "@/components/ui/visual-primitives";

export type TestDemoConfig = {
  /** Button copy — "Call me now", "Preview my widget", etc. */
  ctaLabel: string;
  /** Helper text under the CTA. */
  helperText: string;
  /**
   * Optional async trigger — e.g. POST /api/portal/tradeline/test-call.
   * If omitted, the step just records demoTriggeredAt on click.
   */
  trigger?: (state: Record<string, unknown>) => Promise<void>;
  /** Optional visual rendered above the CTA. */
  visual?: (state: Record<string, unknown>) => React.ReactNode;
};

export type TestDemoState = {
  demoTriggeredAt?: string;
};

export function renderTestDemo(config: TestDemoConfig) {
  return function TestDemoStep({ state, setState }: WizardRenderContext) {
    const [triggering, setTriggering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const triggered = !!state.demoTriggeredAt;

    const handle = async () => {
      setTriggering(true);
      setError(null);
      try {
        await config.trigger?.(state);
        setState({ demoTriggeredAt: new Date().toISOString() });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not start the demo.");
      } finally {
        setTriggering(false);
      }
    };

    return (
      <div className="flex flex-col gap-2">
        {config.visual && (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            {config.visual(state)}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">{config.helperText}</p>
        <Button
          type="button"
          size="sm"
          variant={triggered ? "outline" : "default"}
          onClick={handle}
          disabled={triggering}
          className="self-start"
          data-testid="onboarding-test-demo"
        >
          {triggering ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Starting…
            </>
          ) : triggered ? (
            <>
              <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Demo triggered — try again
            </>
          ) : (
            <>
              <PlayCircle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {config.ctaLabel}
            </>
          )}
        </Button>
        {error && (
          <p className="text-[11px] text-[hsl(var(--destructive))]" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  };
}
