/**
 * Executor stub: draft_calculators.
 *
 * v1 allowlist: `notify_admin`, `send_nudge_email`. No persistent mutations.
 */

import { fireAlert } from "../../alertService";
import { createLogger } from "../../../lib/logger";
import type { ExecutorFn } from "./types";

const log = createLogger("BO:DraftCalculators");

const ALLOWLIST = new Set(["notify_admin", "send_nudge_email"]);

export const execute: ExecutorFn = async (action) => {
  const proposed = (action.proposed_action ?? {}) as { type?: string };
  const type = String(proposed.type ?? "");
  if (!ALLOWLIST.has(type)) {
    return {
      ok: false,
      message: `Action type '${type}' not in allowlist for draft_calculators`,
    };
  }

  log.info("Executing draft_calculators stub", { actionId: action.id, type });
  await fireAlert({
    severity: "info",
    category: "business_operator_ai",
    title: `BO-AI: ${action.summary}`,
    details: action.ai_reasoning ?? "(no reasoning)",
    metadata: {
      action_id: action.id,
      playbook: action.playbook,
      proposed_action: action.proposed_action,
    },
  });
  return { ok: true, message: "notified admin (stub)" };
};
