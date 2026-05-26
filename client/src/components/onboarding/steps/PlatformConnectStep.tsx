/**
 * PlatformConnectStep — Wave 33 shared onboarding step.
 *
 * Multi-checkbox platform picker. Used by:
 *   - ReputationShield  (reviews: Google / Yelp / Facebook / BBB)
 *   - SocialSync        (social:  Facebook / Instagram / LinkedIn / WhatsApp)
 *
 * The consuming wizard supplies the allowed platform list via the
 * `mode` prop on the higher-level factory below — keeps a single
 * renderer shape but lets the per-product wizard scope the choices.
 *
 * Writes: { connectedPlatforms: string[] }
 */

import { Check } from "lucide-react";
import type { WizardRenderContext } from "@/components/ui/visual-primitives";
import { cn } from "@/lib/utils";

export type PlatformMode = "reviews" | "social";

export const REVIEW_PLATFORMS = [
  { id: "google", label: "Google" },
  { id: "yelp", label: "Yelp" },
  { id: "facebook", label: "Facebook" },
  { id: "bbb", label: "BBB" },
] as const;

export const SOCIAL_PLATFORMS = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "whatsapp", label: "WhatsApp" },
] as const;

export type PlatformConnectState = {
  connectedPlatforms?: string[];
};

/**
 * Returns a render function for the chosen platform mode. The wizard
 * step type expects `render: (ctx) => ReactNode`; this factory closes
 * over the mode so wave callers can write:
 *   { ..., render: renderPlatformConnect("social") }
 */
export function renderPlatformConnect(mode: PlatformMode) {
  const options = mode === "reviews" ? REVIEW_PLATFORMS : SOCIAL_PLATFORMS;
  const defaultSelection = mode === "reviews" ? ["google"] : ["facebook", "instagram"];

  return function PlatformConnectStep({ state, setState }: WizardRenderContext) {
    const selected =
      (state.connectedPlatforms as string[] | undefined) ?? defaultSelection;

    const toggle = (id: string) => {
      const cur = selected;
      const next = cur.includes(id)
        ? cur.filter((x) => x !== id)
        : [...cur, id];
      setState({ connectedPlatforms: next });
    };

    return (
      <div className="flex flex-col gap-2">
        <p className="text-[11px] text-muted-foreground">
          Pick all that apply — we'll monitor each {mode === "reviews" ? "review source" : "social channel"} you select.
        </p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {options.map((p) => {
            const active = selected.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-md border px-3 py-3 text-sm transition-colors",
                  active
                    ? "border-[hsl(var(--chart-1))] bg-[hsl(var(--chart-1)/0.08)] text-foreground ring-1 ring-inset ring-[hsl(var(--chart-1))]"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/40",
                )}
                data-testid={`onboarding-platform-${p.id}`}
              >
                <Check
                  className={cn(
                    "h-3.5 w-3.5",
                    active ? "text-[hsl(var(--chart-1))]" : "text-muted-foreground/30",
                  )}
                  aria-hidden="true"
                />
                <span className="font-medium">{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };
}

export function validatePlatformConnect(state: Record<string, unknown>): string | null {
  const platforms = (state.connectedPlatforms as string[] | undefined) ?? [];
  if (platforms.length === 0) return "Pick at least one platform.";
  return null;
}
