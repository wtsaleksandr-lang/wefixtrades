/**
 * Lightweight event tracking for funnel analysis.
 * Posts to /api/track for server-side persistence.
 * Fire-and-forget — never blocks UI.
 */

const TRACKED = new Set<string>(); // Dedup within session

export function trackEvent(name: string, data?: Record<string, unknown>): void {
  // Dedup: some events should only fire once per session
  const ONCE_EVENTS = new Set([
    'trial_started', 'wizard_trade_selected', 'wizard_pricing_set',
    'wizard_preview_interacted', 'wizard_published', 'pricing_page_viewed',
  ]);
  if (ONCE_EVENTS.has(name)) {
    if (TRACKED.has(name)) return;
    TRACKED.add(name);
  }

  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('[event]', name, data ?? {});
  }

  // Fire-and-forget POST
  try {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: name, data: data ?? {}, ts: Date.now() }),
    }).catch(() => {});
  } catch {
    // Silently fail — tracking should never break the UI
  }
}
