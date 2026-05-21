/**
 * Executor stub: bot_submissions.
 *
 * v1 allowlist: `notify_admin`, `flag_for_review`. No persistent mutations
 * — no auto-delete of lead/intake rows.
 */

import { fireAlert } from "../../alertService";
import { createLogger } from "../../../lib/logger";
import type { ExecutorFn } from "./types";

const log = createLogger("BO:BotSubmissions");

const ALLOWLIST = new Set(["notify_admin", "flag_for_review"]);

export const execute: ExecutorFn = async (action) => {
  const proposed = (action.proposed_action ?? {}) as { type?: string };
  const type = String(proposed.type ?? "");
  if (!ALLOWLIST.has(type)) {
    return {
      ok: false,
      message: `Action type '${type}' not in allowlist for bot_submissions`,
    };
  }

  log.info("Executing bot_submissions stub", { actionId: action.id, type });
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
