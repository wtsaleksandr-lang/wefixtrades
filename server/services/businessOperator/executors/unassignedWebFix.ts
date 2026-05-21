/**
 * Executor stub: unassigned_webfix.
 *
 * v1 allowlist: `notify_admin`, `assign_default_supplier`. No persistent
 * mutations — the "assign" path still only logs + alerts in v1.
 */

import { fireAlert } from "../../alertService";
import { createLogger } from "../../../lib/logger";
import type { ExecutorFn } from "./types";

const log = createLogger("BO:UnassignedWebFix");

const ALLOWLIST = new Set(["notify_admin", "assign_default_supplier"]);

export const execute: ExecutorFn = async (action) => {
  const proposed = (action.proposed_action ?? {}) as { type?: string };
  const type = String(proposed.type ?? "");
  if (!ALLOWLIST.has(type)) {
    return {
      ok: false,
      message: `Action type '${type}' not in allowlist for unassigned_webfix`,
    };
  }

  log.info("Executing unassigned_webfix stub", { actionId: action.id, type });
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
