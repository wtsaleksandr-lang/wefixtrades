/**
 * Tradeline phone-number setup wizard — top-level page.
 *
 * Mounted at /portal/tradeline/setup. Fetches the wizard journey state,
 * renders ChoiceCard if no mode has been picked yet, otherwise shows a
 * "mode chosen — next step coming" placeholder until Option subscreens
 * land in the next batch.
 *
 * "Skip for now" links to /portal. A persistent dashboard banner
 * pointing back here is a follow-up edit on PortalDashboard.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";
import { ChoiceCard } from "./ChoiceCard";
import { PhoneCall, Loader2 } from "lucide-react";
import type { TradelinePhoneSetup, TradelineSetupMode } from "@shared/schema";

interface SetupStateResponse {
  setup: TradelinePhoneSetup;
  optionCEligible: boolean;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

function modeLabel(mode: TradelineSetupMode): string {
  if (mode === "new") return "Get a new WeFixTrades number";
  if (mode === "forward") return "Keep your existing number";
  return "Port your existing number";
}

export default function TradelineSetupPage() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data, isLoading, error } = useQuery<SetupStateResponse>({
    queryKey: ["/api/portal/tradeline/setup"],
    queryFn: () => apiFetch<SetupStateResponse>("/api/portal/tradeline/setup"),
  });

  const chooseMutation = useMutation({
    mutationFn: (mode: TradelineSetupMode) =>
      apiFetch<{ setup: TradelinePhoneSetup }>(
        "/api/portal/tradeline/setup/choose-mode",
        {
          method: "POST",
          body: JSON.stringify({ mode }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline/setup"] });
    },
  });

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
            Pick how customers will reach you. You can change this later.
          </p>
        </div>

        {/* Loading / error */}
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

        {/* Choice card OR mode-already-chosen placeholder */}
        {!isLoading && data && (
          <>
            {data.setup.mode ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center space-y-1.5">
                <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">
                  Mode selected
                </p>
                <p className="text-base font-semibold text-emerald-900">
                  {modeLabel(data.setup.mode)}
                </p>
                <p className="text-xs text-emerald-700">
                  The next step is being built — check back shortly.
                </p>
              </div>
            ) : (
              <ChoiceCard
                optionCEligible={data.optionCEligible}
                onContinue={(mode) => chooseMutation.mutate(mode)}
                isContinuing={chooseMutation.isPending}
              />
            )}

            {chooseMutation.isError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                Couldn't save your choice — try again.
              </div>
            )}
          </>
        )}

        {/* Skip */}
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => setLocation("/portal")}
            className="text-sm text-gray-500 hover:text-gray-700 underline-offset-2 hover:underline"
          >
            Skip for now — finish setup later
          </button>
        </div>
      </div>
    </PortalLayout>
  );
}
