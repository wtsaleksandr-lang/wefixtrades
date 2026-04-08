/**
 * SocialSync per-client/platform cooldown and health tracking.
 *
 * Uses the `runtime_state` JSONB field on `socialsync_profiles` to store:
 * - Per-platform cooldown_until timestamps
 * - Consecutive failure counts
 * - Last failure/success timestamps
 * - Alert dedup timestamps
 *
 * runtime_state shape:
 * {
 *   "facebook": {
 *     "cooldown_until": "2026-04-08T12:00:00Z" | null,
 *     "cooldown_reason": "rate_limit" | "repeated_failures" | null,
 *     "consecutive_failures": 0,
 *     "last_failure_at": "..." | null,
 *     "last_success_at": "..." | null,
 *     "last_rate_limit_at": "..." | null,
 *     "last_alerted_at": "..." | null
 *   },
 *   "instagram": { ... }
 * }
 */
import { storage } from "../../storage";
import type { SocialSyncProfile } from "@shared/schema";

/* ─── Cooldown Windows ─── */

const RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;           // 15 minutes
const RATE_LIMIT_REPEAT_COOLDOWN_MS = 60 * 60 * 1000;    // 60 minutes (if rate-limited again within 2 hours)
const FAILURE_COOLDOWN_THRESHOLD = 3;                      // After 3 consecutive failures, start cooling down
const FAILURE_COOLDOWN_MS = 30 * 60 * 1000;                // 30 minutes per failure cooldown
const PERMANENT_FAILURE_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours for permanent/config failures
const PERMANENT_FAILURE_THRESHOLD = 2;                     // 2 permanent failures → long suppression
const RATE_LIMIT_REPEAT_WINDOW_MS = 2 * 60 * 60 * 1000;   // 2 hour window for "repeated" rate limit detection
const ALERT_DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000;        // Don't re-alert within 6 hours

/* ─── Types ─── */

export interface PlatformState {
  cooldown_until: string | null;
  cooldown_reason: string | null;
  consecutive_failures: number;
  consecutive_permanent_failures: number;
  rate_limit_count_24h: number;
  last_failure_at: string | null;
  last_success_at: string | null;
  last_rate_limit_at: string | null;
  last_alerted_at: string | null;
  suppressed: boolean;  // true = long-term suppression due to persistent config issues
}

export type RuntimeState = Record<string, PlatformState>;

const DEFAULT_PLATFORM_STATE: PlatformState = {
  cooldown_until: null,
  cooldown_reason: null,
  consecutive_failures: 0,
  consecutive_permanent_failures: 0,
  rate_limit_count_24h: 0,
  last_failure_at: null,
  last_success_at: null,
  last_rate_limit_at: null,
  last_alerted_at: null,
  suppressed: false,
};

/* ─── State Access ─── */

function getState(profile: SocialSyncProfile): RuntimeState {
  return (profile.runtime_state as RuntimeState) || {};
}

function getPlatformState(profile: SocialSyncProfile, platform: string): PlatformState {
  const state = getState(profile);
  return state[platform] || { ...DEFAULT_PLATFORM_STATE };
}

async function savePlatformState(clientId: number, platform: string, platState: PlatformState): Promise<void> {
  const profile = await storage.getSocialSyncProfile(clientId);
  if (!profile) return;

  const state = getState(profile);
  state[platform] = platState;

  await storage.upsertSocialSyncProfile({
    ...profile,
    runtime_state: state,
  } as any);
}

/* ─── Cooldown Checks ─── */

/**
 * Check if a client/platform is currently in cooldown.
 * Returns the cooldown info or null if not cooling down.
 */
export async function checkCooldown(
  clientId: number,
  platform: string,
): Promise<{ coolingDown: boolean; reason?: string; until?: string; minutesLeft?: number }> {
  const profile = await storage.getSocialSyncProfile(clientId);
  if (!profile) return { coolingDown: false };

  const platState = getPlatformState(profile, platform);

  // Suppressed = long-term block due to persistent config issues
  if (platState.suppressed) {
    return { coolingDown: true, reason: "suppressed_config_issue", until: undefined, minutesLeft: undefined };
  }

  if (!platState.cooldown_until) return { coolingDown: false };

  const until = new Date(platState.cooldown_until);
  const now = new Date();

  if (until <= now) {
    // Cooldown expired — clear it
    platState.cooldown_until = null;
    platState.cooldown_reason = null;
    await savePlatformState(clientId, platform, platState);
    return { coolingDown: false };
  }

  const minutesLeft = Math.ceil((until.getTime() - now.getTime()) / (60 * 1000));
  return {
    coolingDown: true,
    reason: platState.cooldown_reason || undefined,
    until: platState.cooldown_until,
    minutesLeft,
  };
}

/* ─── State Updates ─── */

/**
 * Record a successful publish. Clears failure streaks and cooldown.
 */
export async function recordSuccess(clientId: number, platform: string): Promise<void> {
  const profile = await storage.getSocialSyncProfile(clientId);
  if (!profile) return;

  const platState = getPlatformState(profile, platform);
  platState.consecutive_failures = 0;
  platState.consecutive_permanent_failures = 0;
  platState.suppressed = false;
  platState.last_success_at = new Date().toISOString();
  platState.cooldown_until = null;
  platState.cooldown_reason = null;
  await savePlatformState(clientId, platform, platState);
}

/**
 * Record a rate-limit event. Sets cooldown with escalation.
 */
export async function recordRateLimit(clientId: number, platform: string): Promise<{ cooldownMinutes: number }> {
  const profile = await storage.getSocialSyncProfile(clientId);
  if (!profile) return { cooldownMinutes: 15 };

  const platState = getPlatformState(profile, platform);
  const now = new Date();

  // Track rate-limit count (reset if last was >24h ago)
  if (platState.last_rate_limit_at && (now.getTime() - new Date(platState.last_rate_limit_at).getTime()) > 24 * 60 * 60 * 1000) {
    platState.rate_limit_count_24h = 0;
  }
  platState.rate_limit_count_24h = (platState.rate_limit_count_24h || 0) + 1;

  // Check if this is a repeated rate limit (within 2 hours)
  const isRepeat = platState.last_rate_limit_at &&
    (now.getTime() - new Date(platState.last_rate_limit_at).getTime()) < RATE_LIMIT_REPEAT_WINDOW_MS;

  const cooldownMs = isRepeat ? RATE_LIMIT_REPEAT_COOLDOWN_MS : RATE_LIMIT_COOLDOWN_MS;
  const cooldownMinutes = Math.round(cooldownMs / (60 * 1000));

  platState.last_rate_limit_at = now.toISOString();
  platState.cooldown_until = new Date(now.getTime() + cooldownMs).toISOString();
  platState.cooldown_reason = isRepeat ? "repeated_rate_limit" : "rate_limit";
  await savePlatformState(clientId, platform, platState);

  await storage.createSocialSyncLog({
    client_id: clientId,
    entity_type: "profile",
    entity_id: null as any,
    action: `cooldown.${platform}.rate_limit`,
    status: "info",
    details: { cooldown_minutes: cooldownMinutes, repeated: isRepeat },
  });

  return { cooldownMinutes };
}

/**
 * Record a publish failure. Escalates to cooldown after threshold.
 */
export async function recordFailure(clientId: number, platform: string): Promise<{ shouldAlert: boolean }> {
  const profile = await storage.getSocialSyncProfile(clientId);
  if (!profile) return { shouldAlert: false };

  const platState = getPlatformState(profile, platform);
  platState.consecutive_failures = (platState.consecutive_failures || 0) + 1;
  platState.last_failure_at = new Date().toISOString();

  // Apply cooldown after threshold
  if (platState.consecutive_failures >= FAILURE_COOLDOWN_THRESHOLD) {
    const cooldownMs = FAILURE_COOLDOWN_MS * Math.min(platState.consecutive_failures - FAILURE_COOLDOWN_THRESHOLD + 1, 4); // Cap at 2h
    platState.cooldown_until = new Date(Date.now() + cooldownMs).toISOString();
    platState.cooldown_reason = "repeated_failures";

    await storage.createSocialSyncLog({
      client_id: clientId,
      entity_type: "profile",
      entity_id: null as any,
      action: `cooldown.${platform}.repeated_failures`,
      status: "info",
      details: {
        consecutive_failures: platState.consecutive_failures,
        cooldown_minutes: Math.round(cooldownMs / (60 * 1000)),
      },
    });
  }

  // Determine if alert should fire (dedupe window)
  const shouldAlert = platState.consecutive_failures >= FAILURE_COOLDOWN_THRESHOLD &&
    (!platState.last_alerted_at ||
      (Date.now() - new Date(platState.last_alerted_at).getTime()) > ALERT_DEDUPE_WINDOW_MS);

  await savePlatformState(clientId, platform, platState);
  return { shouldAlert };
}

/**
 * Record a permanent/config failure (invalid token, missing page, etc.).
 * After threshold, suppresses the client/platform to stop noisy retries.
 */
export async function recordPermanentFailure(clientId: number, platform: string, reason: string): Promise<{ suppressed: boolean; shouldAlert: boolean }> {
  const profile = await storage.getSocialSyncProfile(clientId);
  if (!profile) return { suppressed: false, shouldAlert: false };

  const platState = getPlatformState(profile, platform);
  platState.consecutive_permanent_failures = (platState.consecutive_permanent_failures || 0) + 1;
  platState.last_failure_at = new Date().toISOString();

  let suppressed = false;
  if (platState.consecutive_permanent_failures >= PERMANENT_FAILURE_THRESHOLD) {
    platState.suppressed = true;
    platState.cooldown_until = new Date(Date.now() + PERMANENT_FAILURE_COOLDOWN_MS).toISOString();
    platState.cooldown_reason = `suppressed: ${reason}`;
    suppressed = true;

    await storage.createSocialSyncLog({
      client_id: clientId,
      entity_type: "profile",
      entity_id: null as any,
      action: `cooldown.${platform}.suppressed`,
      status: "info",
      details: { reason, consecutive_permanent: platState.consecutive_permanent_failures },
    });
  }

  const shouldAlert = platState.consecutive_permanent_failures >= PERMANENT_FAILURE_THRESHOLD &&
    (!platState.last_alerted_at || (Date.now() - new Date(platState.last_alerted_at).getTime()) > ALERT_DEDUPE_WINDOW_MS);

  await savePlatformState(clientId, platform, platState);
  return { suppressed, shouldAlert };
}

/**
 * Mark that an alert was sent for this client/platform.
 */
export async function markAlerted(clientId: number, platform: string): Promise<void> {
  const profile = await storage.getSocialSyncProfile(clientId);
  if (!profile) return;

  const platState = getPlatformState(profile, platform);
  platState.last_alerted_at = new Date().toISOString();
  await savePlatformState(clientId, platform, platState);
}

/**
 * Manually clear cooldown for a client/platform.
 */
export async function clearCooldown(clientId: number, platform: string): Promise<void> {
  const profile = await storage.getSocialSyncProfile(clientId);
  if (!profile) return;

  const platState = getPlatformState(profile, platform);
  platState.cooldown_until = null;
  platState.cooldown_reason = null;
  platState.consecutive_failures = 0;
  platState.consecutive_permanent_failures = 0;
  platState.suppressed = false;
  await savePlatformState(clientId, platform, platState);

  await storage.createSocialSyncLog({
    client_id: clientId,
    entity_type: "profile",
    entity_id: null as any,
    action: `cooldown.${platform}.cleared`,
    status: "success",
    details: {},
  });
}

/**
 * Get cooldown summary for all platforms of a client (for admin display).
 */
export async function getCooldownSummary(clientId: number): Promise<Record<string, {
  cooling_down: boolean;
  reason: string | null;
  until: string | null;
  consecutive_failures: number;
  last_success_at: string | null;
}>> {
  const profile = await storage.getSocialSyncProfile(clientId);
  if (!profile) return {};

  const state = getState(profile);
  const result: Record<string, any> = {};

  for (const [platform, platState] of Object.entries(state)) {
    const until = platState.cooldown_until ? new Date(platState.cooldown_until) : null;
    const coolingDown = until ? until > new Date() : false;

    result[platform] = {
      cooling_down: coolingDown || platState.suppressed,
      reason: platState.suppressed ? platState.cooldown_reason || "suppressed" : (coolingDown ? platState.cooldown_reason : null),
      until: coolingDown ? platState.cooldown_until : null,
      consecutive_failures: platState.consecutive_failures || 0,
      consecutive_permanent_failures: platState.consecutive_permanent_failures || 0,
      rate_limit_count_24h: platState.rate_limit_count_24h || 0,
      suppressed: platState.suppressed || false,
      last_success_at: platState.last_success_at || null,
    };
  }

  return result;
}
