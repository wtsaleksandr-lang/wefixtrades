/**
 * CalendarConnectStep — Wave 33 shared onboarding step.
 *
 * Optional "connect Google Calendar / Outlook" step used by TradeLine
 * (so the AI booker can place real holds) and any product that needs
 * scheduling. Writes:
 *   { calendarConnected, calendarProvider }
 *
 * The actual OAuth dance lives at /api/portal/integrations/* — this
 * step just queues the choice and the consuming wizard fires the OAuth
 * redirect after `onComplete`. Mark the step `optional: true` and the
 * user can skip.
 */

import { CalendarClock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WizardRenderContext } from "@/components/ui/visual-primitives";
import { cn } from "@/lib/utils";

export type CalendarConnectState = {
  calendarConnected?: boolean;
  calendarProvider?: "google" | "outlook" | null;
};

type Provider = NonNullable<CalendarConnectState["calendarProvider"]>;

const PROVIDERS: Array<{ id: Provider; label: string }> = [
  { id: "google", label: "Google Calendar" },
  { id: "outlook", label: "Outlook / Microsoft 365" },
];

export function CalendarConnectStep({ state, setState }: WizardRenderContext) {
  const provider = (state.calendarProvider as Provider | null | undefined) ?? null;
  const connected = (state.calendarConnected as boolean | undefined) ?? false;

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <CalendarClock className="h-3 w-3" aria-hidden="true" />
        Connect so we can place real holds when a customer books. You can skip and add this later.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {PROVIDERS.map((p) => {
          const active = provider === p.id;
          return (
            <Button
              key={p.id}
              type="button"
              variant={active ? "default" : "outline"}
              size="sm"
              onClick={() =>
                setState({
                  calendarProvider: p.id,
                  calendarConnected: true,
                })
              }
              className={cn(
                "justify-between",
                active && "ring-1 ring-inset ring-[hsl(var(--chart-1))]",
              )}
              data-testid={`onboarding-calendar-${p.id}`}
            >
              {p.label}
              {active && (
                <Check className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>
          );
        })}
      </div>
      {connected && (
        <p className="text-[11px] text-muted-foreground">
          We'll open the {provider === "outlook" ? "Microsoft" : "Google"} consent
          screen right after you finish.
        </p>
      )}
    </div>
  );
}
