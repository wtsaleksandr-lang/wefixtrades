/**
 * PostHog client-side analytics wrapper.
 *
 * Provider-agnostic surface: trackEvent / identifyUser / initAnalytics.
 * Region-swappable via VITE_POSTHOG_HOST. No-op when VITE_POSTHOG_PUBLIC_KEY
 * is unset. Failures are swallowed — telemetry must never break the UI.
 */

import posthog from "posthog-js";

const POSTHOG_HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ||
  "https://us.i.posthog.com";

let initialised = false;

export function initAnalytics(): void {
  if (initialised) return;
  const key = import.meta.env.VITE_POSTHOG_PUBLIC_KEY as string | undefined;
  if (!key) {
    if (import.meta.env.DEV) {
      console.warn("[analytics] VITE_POSTHOG_PUBLIC_KEY not set — client analytics disabled");
    }
    return;
  }
  posthog.init(key, {
    api_host: POSTHOG_HOST,
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,
    persistence: "localStorage+cookie",
  });
  initialised = true;
}

export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!initialised) return;
  try {
    posthog.capture(event, properties);
  } catch {
    /* swallow */
  }
}

export function identifyUser(
  distinctId: string,
  properties: Record<string, unknown>,
): void {
  if (!initialised) return;
  try {
    posthog.identify(distinctId, properties);
  } catch {
    /* swallow */
  }
}

export function resetAnalytics(): void {
  if (!initialised) return;
  try {
    posthog.reset();
  } catch {
    /* swallow */
  }
}
