/**
 * Registry of per-playbook executor stubs.
 *
 * Every executor verifies the action.proposed_action against a tiny
 * allowlist; v1 only logs + fires admin notifications. No persistent
 * mutations until the AI has earned trust (3 consecutive approvals → admin
 * unlocks auto-execute toggle in the UI).
 */

import type { AdminAiPlaybook } from "@shared/schema";
import type { ExecutorFn } from "./types";
import { execute as stuckSubmissions } from "./stuckSubmissions";
import { execute as pastDueSubscriptions } from "./pastDueSubscriptions";
import { execute as unassignedWebFix } from "./unassignedWebFix";
import { execute as draftCalculators } from "./draftCalculators";
import { execute as botSubmissions } from "./botSubmissions";

export const EXECUTORS: Record<AdminAiPlaybook, ExecutorFn> = {
  stuck_submissions: stuckSubmissions,
  past_due_subs: pastDueSubscriptions,
  unassigned_webfix: unassignedWebFix,
  draft_calculators: draftCalculators,
  bot_submissions: botSubmissions,
};
