/**
 * PostHog server-side analytics wrapper.
 *
 * Thin provider-agnostic surface (trackEvent / identifyUser / shutdownAnalytics)
 * so call sites are not coupled to PostHog. Region-swappable via POSTHOG_HOST
 * (PIPEDA / EU residency switch later).
 *
 * No-op when POSTHOG_API_KEY is unset — failures must never crash the server.
 */

import { PostHog } from "posthog-node";
import { createLogger } from "./logger";

const log = createLogger("Analytics");

const POSTHOG_HOST = process.env.POSTHOG_HOST || "https://us.i.posthog.com";

let client: PostHog | null = null;

export function initAnalytics(): void {
  if (client) return;
  const key = process.env.POSTHOG_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      log.warn("POSTHOG_API_KEY not set — server analytics disabled");
    }
    return;
  }
  client = new PostHog(key, {
    host: POSTHOG_HOST,
    flushAt: 20,
    flushInterval: 10_000,
  });
  log.info("PostHog initialised", { host: POSTHOG_HOST });
}

export function trackEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!client) return;
  try {
    client.capture({ distinctId, event, properties });
  } catch (err) {
    log.error("trackEvent failed", { event, err: (err as Error).message });
  }
}

export function identifyUser(
  distinctId: string,
  properties: Record<string, unknown>,
): void {
  if (!client) return;
  try {
    client.identify({ distinctId, properties });
  } catch (err) {
    log.error("identifyUser failed", { distinctId, err: (err as Error).message });
  }
}

export async function shutdownAnalytics(): Promise<void> {
  if (!client) return;
  try {
    await client.shutdown();
  } catch (err) {
    log.error("shutdownAnalytics failed", { err: (err as Error).message });
  }
}
