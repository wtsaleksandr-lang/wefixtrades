/**
 * Lightweight context to share live onboarding form state between
 * PortalOnboarding (writer) and PortalChatWidget (reader).
 *
 * PortalOnboarding syncs its `responses` here on every change.
 * PortalChatWidget reads from here to pass `currentResponses` to the AI.
 * State is cleared when the onboarding page unmounts.
 */

import { createContext, useContext, useState } from "react";

interface OnboardingContextValue {
  responses: Record<string, any>;
  setResponses: (r: Record<string, any>) => void;
}

const OnboardingContext = createContext<OnboardingContextValue>({
  responses: {},
  setResponses: () => {},
});

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [responses, setResponses] = useState<Record<string, any>>({});
  return (
    <OnboardingContext.Provider value={{ responses, setResponses }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboardingResponses(): OnboardingContextValue {
  return useContext(OnboardingContext);
}
