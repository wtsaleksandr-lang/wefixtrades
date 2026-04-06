/**
 * Lightweight event tracking for funnel analysis.
 * Logs to console for now — swap implementation later
 * without changing call sites.
 */
export function trackEvent(name: string, data?: Record<string, unknown>): void {
  console.log("[event]", name, data ?? {});
}
