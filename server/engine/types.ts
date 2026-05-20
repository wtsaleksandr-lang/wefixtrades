/**
 * Rules & Routing Engine — shared types.
 *
 * See docs/rules-routing-engine-plan.md for the full design. Phase 1 of
 * that plan landed the routing_events table and four storage methods
 * (createRoutingEvent / systemResolveRoutingEvent /
 * adminAcknowledgeRoutingEvent / listQueueItems). This file scaffolds
 * Phase 2 — the in-process types every rule and the worker speak in.
 *
 * The DB schema (shared/schemas/adminCrm.ts) deliberately uses a
 * compact shape (single `status` enum, single `summary` text, jsonb
 * `metadata` catch-all) rather than the wider field set in the plan
 * doc. The QueueAssignment type below is the engine-internal contract;
 * the routing worker projects it onto the DB shape, stuffing the
 * supplementary fields (owner_type, current_status, blocked_reason,
 * next_action, requires_human, rule_version) into metadata so future
 * UI work can read them without another schema change.
 */

/**
 * Named queue identifiers.
 *
 * Only queues actually backed by a rule live here today. The plan
 * enumerates more (onboarding_followup, blocked_fulfillment, etc.) —
 * those will be added when their rule files land. Keeping this as a
 * union (not an enum) so adding a queue is a one-line append with no
 * downstream churn.
 */
export type QueueName =
  | "ops_attention"
  | "account_health";

/**
 * Who is on the hook for clearing a queued item.
 *
 * "system" means an automated path is expected to resolve it (e.g. the
 * next clean MapGuard scan auto-system-resolves a serper outage event)
 * and no human attention is required yet.
 */
export type OwnerType = "system" | "admin" | "vendor" | "client";

/**
 * Rule-assigned priority. Independent of the entity's own priority
 * field — a routing rule can elevate a "normal" task to "urgent" if
 * its threshold says so.
 */
export type RoutingPriority = "low" | "normal" | "high" | "urgent";

/**
 * One rule producing one queue assignment for one entity.
 *
 * Rules return `null` when their condition does not hold. The
 * evaluator collects every non-null assignment and the worker
 * deduplicates by (entity_type, entity_id, queue) before insert.
 *
 * `metadata` is a free-form bag for rule-specific context — score
 * deltas, error counts, snapshot ids — that admins (and future AI
 * surfaces) can render without re-running the rule logic.
 */
export interface QueueAssignment {
  entity_type: string;        // "mapguard_client" for MapGuard rules
  entity_id: number;          // clients.id
  queue: QueueName;
  rule_name: string;          // matches the per-queue requeue threshold key
  priority: RoutingPriority;
  owner_type: OwnerType;
  /** Human-readable one-liner: shows up verbatim in the admin UI. */
  summary: string;
  /** Current status of the entity at evaluation time (informational). */
  current_status?: string;
  /** Optional structured payload merged into routing_events.metadata. */
  metadata?: Record<string, unknown>;
  /** Rules with `requires_human: true` must not be auto-resolved by automation. */
  requires_human: boolean;
}

/**
 * Output of one rule pass over its scoped batch of entities.
 *
 * `assignments` are the queue entries to (idempotently) create.
 * `resolutions` are (entity_type, entity_id, queue) keys whose
 * condition no longer holds — the worker will system-resolve any
 * matching active/snoozed events.
 *
 * Rules return both because resolution is rule-local: only the rule
 * that knows what condition it checks can authoritatively say "this
 * is now clean." A generic "didn't appear in this pass" diff would
 * mis-resolve any entity the rule simply didn't scan this cycle.
 */
export interface RuleResult {
  assignments: QueueAssignment[];
  /**
   * Resolutions are scoped by rule_name (not just queue) because
   * multiple rules can write to the same queue and we don't want one
   * rule's absence to clear another rule's still-valid event. The
   * worker passes rule_name straight through to
   * storage.systemResolveRoutingEvent.
   */
  resolutions: Array<{
    entity_type: string;
    entity_id: number;
    queue: QueueName;
    rule_name: string;
  }>;
}

/**
 * Rule entry point. Each rule is a pure async function — DB reads are
 * permitted, DB writes are not. The worker is the only thing that
 * mutates routing_events.
 */
export type RuleFn = () => Promise<RuleResult>;
