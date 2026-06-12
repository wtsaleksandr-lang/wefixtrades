/**
 * Owned-domain SEO content engine — runtime gate (WP-0).
 *
 * The engine is INERT by default. Generation/publishing may proceed ONLY
 * when BOTH:
 *   1. the SEO_ENGINE_ENABLED env flag is truthy, AND
 *   2. the seo_engine_settings.kill_switch DB row is OFF.
 *
 * Mirrors server/services/contentflow/contentflowGate.ts. Crucially the
 * default posture is the OPPOSITE of the ContentFlow gate: ContentFlow
 * ships ON and fails OPEN; this engine ships OFF and fails CLOSED. A brand-
 * new feature must never start doing work on its own — so a settings read
 * failure leaves the engine disabled, and an unset flag leaves it disabled.
 *
 * This gate guards GENERATION/PUBLISH side-effects only. The public RENDER
 * path (serving an already-published seo_content_pages row) is NOT gated by
 * the flag — once an admin has reviewed + published a row, it is live SEO
 * content and must keep serving even if the generator is later switched off.
 * Render visibility is governed solely by status='published'.
 */

import { getSeoEngineSettings } from "../../storage/seoContent";
import { createLogger } from "../../lib/logger";

const log = createLogger("SeoEngine:Gate");

export interface SeoGateResult {
  allowed: boolean;
  /** Human-readable reason when allowed === false. */
  reason?: string;
}

/** True when the SEO_ENGINE_ENABLED env flag is set to a truthy value. */
export function isSeoEngineFlagEnabled(): boolean {
  const raw = (process.env.SEO_ENGINE_ENABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * Pure gate decision from the two inputs (flag + kill switch). Extracted so
 * it is deterministically testable without a DB. checkSeoEngineGate() reads
 * the live values and delegates here.
 */
export function evaluateSeoEngineGate(flagEnabled: boolean, killSwitch: boolean): SeoGateResult {
  if (!flagEnabled) {
    return { allowed: false, reason: "SEO engine is disabled — SEO_ENGINE_ENABLED is not set." };
  }
  if (killSwitch) {
    return { allowed: false, reason: "SEO engine is paused — the admin kill switch is ON." };
  }
  return { allowed: true };
}

/**
 * Gate for SEO-engine generation/publish side-effects. Returns
 * { allowed: false } when the env flag is unset OR the DB kill switch is on.
 * Fails CLOSED: any settings-read failure disables the engine (a dormant
 * feature must never start working on a transient DB error).
 */
export async function checkSeoEngineGate(): Promise<SeoGateResult> {
  if (!isSeoEngineFlagEnabled()) {
    return evaluateSeoEngineGate(false, false);
  }

  let killSwitch: boolean;
  try {
    const settings = await getSeoEngineSettings();
    killSwitch = settings.kill_switch;
  } catch (err: any) {
    // Fail CLOSED — unlike ContentFlow, this engine ships dark, so a settings
    // read failure must NOT start it. Log loudly.
    log.error("settings read failed — keeping engine disabled (fail-closed)", { error: err?.message });
    return { allowed: false, reason: "SEO engine settings unavailable — engine held disabled." };
  }

  return evaluateSeoEngineGate(true, killSwitch);
}
