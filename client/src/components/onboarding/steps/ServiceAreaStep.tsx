/**
 * ServiceAreaStep — Wave 33 shared onboarding step.
 *
 * Captures business identity + service-area radius. Writes:
 *   { businessName, phone, zip, serviceAreaRadius }
 *
 * Defaults `serviceAreaRadius` from `state.tradeDefaultRadiusMi` (set by
 * TradePickerStep) the first time the step renders so the trade-picker
 * choice flows downstream.
 *
 * Note: a future iteration can drop in Google Places autocomplete here
 * (Alex memory: Google Places API key available under linen-waters admin
 * project). For Wave 33 we keep it as plain inputs to avoid the npm-dep
 * trip-wire — the autocomplete swap-in is a Wave 34 hand-off.
 */

import { useEffect } from "react";
import { Building2, MapPin, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WizardRenderContext } from "@/components/ui/visual-primitives";

export type ServiceAreaState = {
  businessName?: string;
  phone?: string;
  zip?: string;
  serviceAreaRadius?: number;
};

export function ServiceAreaStep({ state, setState }: WizardRenderContext) {
  const businessName = (state.businessName as string | undefined) ?? "";
  const phone = (state.phone as string | undefined) ?? "";
  const zip = (state.zip as string | undefined) ?? "";
  const tradeDefault = (state.tradeDefaultRadiusMi as number | undefined) ?? 25;
  const radius = (state.serviceAreaRadius as number | undefined) ?? tradeDefault;

  // First-render: seed radius from the trade-picker default if unset.
  useEffect(() => {
    if (state.serviceAreaRadius === undefined) {
      setState({ serviceAreaRadius: tradeDefault });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor="onboarding-business-name" className="flex items-center gap-1 text-xs">
          <Building2 className="h-3 w-3" aria-hidden="true" />
          Business name
        </Label>
        <Input
          id="onboarding-business-name"
          value={businessName}
          onChange={(e) => setState({ businessName: e.target.value })}
          placeholder="Acme Plumbing"
          data-testid="onboarding-business-name"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="onboarding-phone" className="flex items-center gap-1 text-xs">
            <Phone className="h-3 w-3" aria-hidden="true" />
            Phone
          </Label>
          <Input
            id="onboarding-phone"
            type="tel"
            value={phone}
            onChange={(e) => setState({ phone: e.target.value })}
            placeholder="(555) 123-4567"
            data-testid="onboarding-phone"
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="onboarding-zip" className="flex items-center gap-1 text-xs">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            ZIP code
          </Label>
          <Input
            id="onboarding-zip"
            type="text"
            value={zip}
            onChange={(e) => setState({ zip: e.target.value })}
            placeholder="30309"
            inputMode="numeric"
            maxLength={10}
            data-testid="onboarding-zip"
          />
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <Label htmlFor="onboarding-radius" className="text-xs">
          Service radius — {radius} mi
        </Label>
        <input
          id="onboarding-radius"
          type="range"
          min={5}
          max={100}
          step={5}
          value={radius}
          onChange={(e) =>
            setState({ serviceAreaRadius: Number(e.target.value) })
          }
          className="w-full accent-[hsl(var(--chart-1))]"
          data-testid="onboarding-radius"
        />
      </div>
    </div>
  );
}

export function validateServiceArea(state: Record<string, unknown>): string | null {
  const name = (state.businessName as string | undefined) ?? "";
  const phone = (state.phone as string | undefined) ?? "";
  const zip = (state.zip as string | undefined) ?? "";
  if (name.trim().length < 2) return "Business name is required.";
  if (phone.replace(/\D/g, "").length < 7) return "Phone number is required.";
  if (zip.trim().length < 3) return "ZIP code is required.";
  return null;
}
