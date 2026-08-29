/**
 * SiteLaunch — runtime gates.
 *
 * Copies the posture of server/services/seoContent/seoEngineGate.ts: a
 * brand-new engine ships DARK and fails CLOSED. An unset flag leaves the
 * feature inert; there is no "default on" path.
 *
 * TWO INDEPENDENT GATES, because they carry very different risk:
 *
 *  1. `SITELAUNCH_ENGINE_ENABLED` — gates AI draft generation (which spends
 *     money against the `sitelaunch` surface's $10/mo cap in
 *     server/services/aiSurfaces.ts) and publish side-effects. Reading and
 *     previewing an existing draft is NOT gated: once a site exists an
 *     operator must always be able to look at it.
 *
 *  2. `SITELAUNCH_DOMAIN_PROVISIONING_ENABLED` — phase 2. **Nothing is
 *     implemented behind this flag in this PR.** It exists so the honest
 *     status reported to operators and customers has a single source, and so
 *     the phase-2 work has an obvious seam. `domainProvisioningState()`
 *     returns `implemented: false` unconditionally today; a phase-2 PR that
 *     forgets to update it will fail its own guard rather than silently
 *     claiming automation that does not exist.
 */

export interface SiteLaunchGateResult {
  allowed: boolean;
  /** Human-readable reason when allowed === false. */
  reason?: string;
}

function flagOn(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** True when SITELAUNCH_ENGINE_ENABLED is set to a truthy value. */
export function isSiteLaunchEngineEnabled(): boolean {
  return flagOn(process.env.SITELAUNCH_ENGINE_ENABLED);
}

/**
 * Pure decision from the flag. Extracted so the guard test can assert both
 * branches without touching process.env ordering.
 */
export function evaluateSiteLaunchGate(flagEnabled: boolean): SiteLaunchGateResult {
  if (!flagEnabled) {
    return {
      allowed: false,
      reason: "SiteLaunch generation is disabled — SITELAUNCH_ENGINE_ENABLED is not set.",
    };
  }
  return { allowed: true };
}

/** Gate for generation / publish side-effects. */
export function checkSiteLaunchGate(): SiteLaunchGateResult {
  return evaluateSiteLaunchGate(isSiteLaunchEngineEnabled());
}

/* ────────────────────────────────────────────────────────────────────────
 * Phase-2 seam — live domain provisioning
 * ──────────────────────────────────────────────────────────────────────── */

export interface DomainProvisioningState {
  /** Is the flag on? */
  flagEnabled: boolean;
  /**
   * Is there real provisioning code behind the flag? HARD-CODED FALSE in
   * phase 1. This is the single place the rest of the app asks "can we
   * actually do this?", so no surface can claim automation we have not
   * written. Flipping this to `true` without shipping the Cloudflare zone
   * calls is the mistake this field exists to make visible.
   */
  implemented: boolean;
  /** Exact sentence shown to an operator. Never softened. */
  message: string;
}

export function domainProvisioningState(): DomainProvisioningState {
  const flagEnabled = flagOn(process.env.SITELAUNCH_DOMAIN_PROVISIONING_ENABLED);
  return {
    flagEnabled,
    implemented: false,
    message:
      "Domain and SSL setup is a manual operator step. Automated Cloudflare zone " +
      "onboarding, DNS records and certificate issuance are not built yet — " +
      "nothing in the app provisions them.",
  };
}

/**
 * True only when live provisioning is BOTH flagged on AND actually built.
 * Callers must use this rather than reading the env var directly.
 */
export function canProvisionDomains(): boolean {
  const state = domainProvisioningState();
  return state.flagEnabled && state.implemented;
}
