/**
 * Persistent dashboard banner pointing to the tradeline-setup wizard.
 *
 * Shows when the setup row is missing or not yet `completed_at`.
 * Hides automatically once the wizard reaches a terminal state.
 *
 * No dismiss button — per Alex's Q3 decision, banner stays until the user
 * actually completes setup. Locking the dashboard outright would create
 * support tickets; persistent nudge is the middle ground.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PhoneCall, ArrowRight } from "lucide-react";
import type { TradelinePhoneSetup } from "@shared/schema";

interface SetupStateResponse {
  setup: TradelinePhoneSetup;
}

export function TradelineSetupBanner() {
  const { data } = useQuery<SetupStateResponse>({
    queryKey: ["/api/portal/tradeline/setup"],
    queryFn: async () => {
      const res = await fetch("/api/portal/tradeline/setup", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tradeline state");
      return res.json();
    },
    // Soft-fail: a failed fetch just hides the banner rather than blocking the dashboard.
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Hide once setup is done.
  if (!data) return null;
  if (data.setup.completed_at) return null;

  const headline = data.setup.mode
    ? "Finish setting up your AI tradeline"
    : "Set up your AI tradeline";
  const body = data.setup.mode
    ? "You picked an option but haven't finished yet. Pick up where you left off."
    : "Get a phone number that customers can reach 24/7.";
  const cta = data.setup.mode ? "Continue setup" : "Set up now (3 min)";

  return (
    <Link href="/portal/tradeline/setup">
      <a
        className="block rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-white p-4 hover:border-indigo-300 hover:shadow-sm transition-all group"
        data-testid="tradeline-setup-banner"
      >
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
            <PhoneCall className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm sm:text-base">{headline}</p>
            <p className="text-xs sm:text-sm text-gray-600 mt-0.5">{body}</p>
          </div>
          <div className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-indigo-700 group-hover:text-indigo-900">
            <span className="hidden sm:inline">{cta}</span>
            <span className="sm:hidden">Continue</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </a>
    </Link>
  );
}
