/**
 * ContentFlow runtime gate — enforces the product-level admin config
 * (contentflow_settings) at the generation and publish entry points.
 *
 *  - checkContentflowGate(): call before any AI generation. Blocks on the
 *    global kill switch or the monthly spend cap.
 *  - isChannelEnabled(channel): call before draining a publish channel.
 *
 * Settings are stored by storage.getContentflowSettings() and edited from
 * the admin ContentFlow Settings panel.
 */

import { storage } from "../../storage";
import { createLogger } from "../../lib/logger";

const log = createLogger("ContentFlow:Gate");

export interface GateResult {
  allowed: boolean;
  /** Human-readable reason when allowed === false. */
  reason?: string;
}

/**
 * Gate for AI generation (article body, repurposer, video script, images).
 * Returns { allowed: false } when the kill switch is on or the monthly
 * spend cap has been reached.
 */
export async function checkContentflowGate(): Promise<GateResult> {
  let settings;
  try {
    settings = await storage.getContentflowSettings();
  } catch (err: any) {
    // Fail OPEN — a settings-table read failure must not silently halt the
    // whole product. Log loudly instead.
    log.error("settings read failed — allowing generation (fail-open)", { error: err?.message });
    return { allowed: true };
  }

  if (settings.kill_switch) {
    return { allowed: false, reason: "ContentFlow is paused — the admin kill switch is ON." };
  }

  if (settings.monthly_spend_cap_usd != null) {
    try {
      const spentMicro = await storage.getContentflowMonthlySpendMicroUsd();
      const capMicro = settings.monthly_spend_cap_usd * 1_000_000;
      if (spentMicro >= capMicro) {
        return {
          allowed: false,
          reason: `Monthly AI spend cap reached ($${settings.monthly_spend_cap_usd}). Generation is paused until next month or the cap is raised.`,
        };
      }
    } catch (err: any) {
      log.error("spend lookup failed — allowing generation (fail-open)", { error: err?.message });
    }
  }

  return { allowed: true };
}

/**
 * Whether a publish channel may drain. False when the kill switch is on or
 * the channel is in the admin's disabled list.
 */
export async function isChannelEnabled(channel: string): Promise<boolean> {
  try {
    const settings = await storage.getContentflowSettings();
    if (settings.kill_switch) return false;
    const disabled = (settings.disabled_channels as string[]) || [];
    return !disabled.includes(channel);
  } catch (err: any) {
    log.error("settings read failed — treating channel as enabled (fail-open)", { error: err?.message, channel });
    return true;
  }
}

/** Resolve the admin-configured text generation tier (default "standard"). */
export async function getContentflowTextTier(): Promise<"standard" | "premium"> {
  try {
    const settings = await storage.getContentflowSettings();
    return settings.text_tier === "premium" ? "premium" : "standard";
  } catch {
    return "standard";
  }
}
