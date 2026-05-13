/**
 * Tradeline phone-number setup wizard — top-level page.
 *
 * Mounted at /portal/tradeline/setup. Fetches wizard journey state, then:
 *   - No mode picked            → ChoiceCard
 *   - mode='new'                → OptionANewNumber
 *   - mode='forward'            → OptionBForward
 *   - mode='port'               → OptionCPort
 *
 * "Back to options" inside any subscreen flips a local force-show flag so
 * the user can re-pick without losing partial server-side progress.
 * Picking a different mode on the second pass overwrites the prior mode
 * via POST /choose-mode.
 *
 * "Skip for now" → /portal. A persistent dashboard banner pointing back
 * here lives in PortalDashboard.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";
import { ChoiceCard } from "./ChoiceCard";
import { OptionANewNumber } from "./OptionANewNumber";
import { OptionBForward } from "./OptionBForward";
import { OptionCPort } from "./OptionCPort";
import { PhoneCall, Loader2 } from "lucide-react";
import type { TradelinePhoneSetup, TradelineSetupMode } from "@shared/schema";
import { apiFetch } from "./apiClient";

interface SetupStateResponse {
  setup: TradelinePhoneSetup;
  optionCEligible: boolean;
}

export default function TradelineSetupPage() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [forceShowChoice, setForceShowChoice] = useState(false);

  const { data, isLoading, error } = useQuery<SetupStateResponse>({
    queryKey: ["/api/portal/tradeline/setup"],
    queryFn: () => apiFetch<SetupStateResponse>("/api/portal/tradeline/setup"),
  });

  const chooseMutation = useMutation({
    mutationFn: (mode: TradelineSetupMode) =>
      apiFetch<{ setup: TradelinePhoneSetup }>(
        "/api/portal/tradeline/setup/choose-mode",
        { method: "POST", body: JSON.stringify({ mode }) },
      ),
    onSuccess: () => {
      setForceShowChoice(false);
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline/setup"] });
    },
  });

  const showChoice = !data?.setup.mode || forceShowChoice;
  const goToDashboard = () => setLocation("/portal");
  const backToOptions = () => setForceShowChoice(true);

  return (
    <PortalLayout>
      <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Heading */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-100 rounded-full mb-1">
            <PhoneCall className="w-6 h-6 text-indigo-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Set up your AI tradeline
          </h1>
          <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto">
            Choose how customers reach your business. You can change this anytime.
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading your setup…
          </div>
        )}
        {error && !isLoading && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            We couldn't load your setup right now. Refresh and try again, or skip below.
          </div>
        )}

        {!isLoading && data && (
          <>
            {showChoice && (
              <ChoiceCard
                optionCEligible={data.optionCEligible}
                onContinue={(mode) => chooseMutation.mutate(mode)}
                isContinuing={chooseMutation.isPending}
              />
            )}
            {!showChoice && data.setup.mode === "new" && (
              <OptionANewNumber setup={data.setup} onBack={backToOptions} onDone={goToDashboard} />
            )}
            {!showChoice && data.setup.mode === "forward" && (
              <OptionBForward setup={data.setup} onBack={backToOptions} onDone={goToDashboard} />
            )}
            {!showChoice && data.setup.mode === "port" && (
              <OptionCPort setup={data.setup} onBack={backToOptions} onDone={goToDashboard} />
            )}

            {chooseMutation.isError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                {(chooseMutation.error as Error).message}
              </div>
            )}
          </>
        )}

        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={goToDashboard}
            className="text-sm text-gray-500 hover:text-gray-700 underline-offset-2 hover:underline"
          >
            Skip for now — finish setup later
          </button>
        </div>
      </div>
    </PortalLayout>
  );
}
