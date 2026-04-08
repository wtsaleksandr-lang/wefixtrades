/**
 * Hook that derives lightweight page hints for the portal assistant.
 * Reads the current route via wouter and pulls summary data from
 * React Query cache — no extra API calls.
 */

import { useLocation } from "wouter";

export interface PortalPageHints {
  /** Human-readable label for the widget header */
  label: string;
  /** Page hint sent to the server (drives behavior mode) */
  page: string;
  /** Onboarding submission ID if on an onboarding page */
  onboardingId?: number;
  /** Default suggestion pills for this page */
  suggestions: string[];
}

/** Route → page hint mapping */
function derivePageHints(location: string): { label: string; page: string; onboardingId?: number } {
  if (location.startsWith("/portal/onboarding/")) {
    const id = parseInt(location.split("/").pop() || "", 10);
    return { label: "Setup", page: "onboarding", onboardingId: isNaN(id) ? undefined : id };
  }
  if (location.startsWith("/portal/services/")) return { label: "Services", page: "services" };
  if (location === "/portal/services") return { label: "Services", page: "services" };
  if (location === "/portal/billing") return { label: "Billing", page: "billing" };
  if (location === "/portal/help") return { label: "Help", page: "help" };
  if (location === "/portal/settings") return { label: "Settings", page: "settings" };
  return { label: "Overview", page: "overview" };
}

/** Default suggestions per page */
function getDefaultSuggestions(page: string): string[] {
  switch (page) {
    case "overview":
      return ["Show my services", "Any pending setup?", "Check billing"];
    case "services":
      return ["What's each service for?", "Any pending setup?", "How do I pause a service?"];
    case "billing":
      return ["When is my next payment?", "What am I paying for?", "How do I update payment details?"];
    case "onboarding":
      return ["What does this field mean?", "Suggest an answer", "What's left to fill?"];
    case "help":
      return ["Submit a ticket", "How does billing work?", "Check ticket status"];
    case "settings":
      return ["How do I change my email?", "Who can access my account?"];
    default:
      return ["Show my services", "Check billing", "Get help"];
  }
}

export function usePortalPageContext(): PortalPageHints {
  const [location] = useLocation();

  const { label, page, onboardingId } = derivePageHints(location);
  const suggestions = getDefaultSuggestions(page);

  return { label, page, onboardingId, suggestions };
}
