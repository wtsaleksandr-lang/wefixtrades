/**
 * Executor stub: stuck_submissions.
 *
 * v1 allowlist: `notify_admin` only. No persistent mutations. The executor
 * logs the action and fires an admin alert so a human picks it up — same
 * behaviour as 'escalated', but recorded as 'auto_executed' once the
 * playbook has earned its trust ladder unlock.
 */

import { fireAlert } from "../../alertService";
import { createLogger } from "../../../lib/logger";
import type { ExecutorFn } from "./types";

const log = createLogger("BO:StuckSubmissions");

const ALLOWLIST = new Set(["notify_admin", "send_followup_email"]);

export const execute: ExecutorFn = async (action) => {
  const proposed = (action.proposed_action ?? {}) as { type?: string };
  const type = String(proposed.type ?? "");
  if (!ALLOWLIST.has(type)) {
    return {
      ok: false,
      message: `Action type '${type}' not in allowlist for stuck_submissions`,
    };
  }

  log.info("Executing stuck_submissions stub", { actionId: action.id, type });
  await fireAlert({
    severity: "warning",
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
