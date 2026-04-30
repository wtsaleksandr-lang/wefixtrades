/**
 * TradeLine configuration helpers.
 * Stub implementations — will be expanded as TradeLine setup flow is built.
 */

export function getTradeLineDefaultConfig(_serviceId: string): Record<string, any> {
  return {
    variant: "standard",
    setupStage: "pending",
    assistant: { status: "pending", voice: "default" },
    channels: { phone: true, chat: true, sms: true },
  };
}

export function computeSetupStage(config: Record<string, any>): string {
  const steps = [
    config?.assistant?.status === "built",
    config?.channels?.phone,
    config?.channels?.chat,
  ];
  const done = steps.filter(Boolean).length;
  if (done === steps.length) return "ready";
  if (done > 0) return "in_progress";
  return "pending";
}

export function advanceSetupStage(currentStage: string, proposedStage?: string): string {
  const order = ["pending", "in_progress", "ready", "live"];
  const currentIdx = order.indexOf(currentStage);
  const proposedIdx = proposedStage ? order.indexOf(proposedStage) : -1;
  return proposedIdx > currentIdx ? order[proposedIdx] : currentStage;
}

export function mapOnboardingToTradeLineConfig(
  responses: Record<string, any>,
  _variant?: string,
): Record<string, any> {
  return {
    businessName: responses.business_name || "",
    phone: responses.phone || "",
    setupStage: "in_progress",
  };
}
