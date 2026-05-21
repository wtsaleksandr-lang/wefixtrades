/**
 * Executor stub: past_due_subs.
 *
 * v1 allowlist: `notify_admin`, `escalate_dunning`. No persistent mutations.
 */

import { fireAlert } from "../../alertService";
import { createLogger } from "../../../lib/logger";
import type { ExecutorFn } from "./types";

const log = createLogger("BO:PastDueSubs");

const ALLOWLIST = new Set(["notify_admin", "escalate_dunning"]);

export const execute: ExecutorFn = async (action) => {
  const proposed = (action.proposed_action ?? {}) as { type?: string };
  const type = String(proposed.type ?? "");
  if (!ALLOWLIST.has(type)) {
    return {
      ok: false,
      message: `Action type '${type}' not in allowlist for past_due_subs`,
    };
  }

  log.info("Executing past_due_subs stub", { actionId: action.id, type });
  await fireAlert({
    severity: "critical",
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
