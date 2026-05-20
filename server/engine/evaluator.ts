/**
 * Rule aggregator.
 *
 * Today this is a thin shim — only the MapGuard rules are wired in.
 * It exists so the routing worker has a single entry point and so
 * adding the next rule family (onboarding, billing, support, …) is
 * a one-line append rather than a worker change.
 *
 * Cross-rule precedence (queue conflict resolution from
 * docs/rules-routing-engine-plan.md §5c) lives here when it crosses
 * rule families. With only MapGuard live there's nothing to merge yet,
 * so we just concatenate. The worker is the only writer; this stays
 * pure.
 */

import { runMapguardRules } from "./rules/mapguard";
import type { RuleResult } from "./types";

export async function runAllRules(): Promise<RuleResult> {
  const mapguard = await runMapguardRules();

  return {
    assignments: [...mapguard.assignments],
    resolutions: [...mapguard.resolutions],
  };
}
