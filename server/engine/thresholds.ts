/**
 * Tunables for the Rules & Routing Engine.
 *
 * Centralised so rule authors don't bury magic numbers in match
 * conditions and so operators have one file to scan when calibrating.
 * Plain constants — not env-driven — because production tuning of
 * routing thresholds should land via PR (with reviewer + commit) and
 * not via an env flip nobody sees.
 */

/* ─── MapGuard rule thresholds ─────────────────────────────────────── */

/**
 * mapguard_scan_failed: how many consecutive failed scans before the
 * client is routed to ops_attention. Two failures distinguishes a
 * single transient hiccup (Serper 429, brief network blip) from a
 * sustained problem worth paging on.
 */
export const MAPGUARD_FAIL_STREAK = 2;

/**
 * mapguard_score_dropped: minimum score drop (in points, on the 0-100
 * MapGuard score) that warrants account_health attention. Set to 15
 * because that's roughly one full sub-score domain (e.g. losing the
 * local pack entirely is ≈20pts) — anything smaller is normal noise.
 */
export const MAPGUARD_SCORE_DROP = 15;

/**
 * mapguard_score_dropped: comparison window in days. We compare the
 * latest snapshot to the most recent snapshot at least this old.
 * Seven days lines up with the weekly scan cadence.
 */
export const MAPGUARD_SCORE_DROP_DAYS = 7;

/**
 * mapguard_serper_outage: error-rate threshold (0..1). When the latest
 * snapshot's `scan_metadata.errors` reports a serper_keyword_errors
 * ratio above this, the client is routed to ops_attention — Serper is
 * effectively down for that scan and the visibility numbers can't be
 * trusted. Auto-resolves on the next clean scan.
 */
export const MAPGUARD_SERPER_ERROR_RATE = 0.5;

/* ─── Per-queue requeue thresholds ─────────────────────────────────── */

/**
 * Once a routing event is `admin_acknowledged` it is terminal for that
 * INSTANCE. If the underlying condition still holds longer than
 * REQUEUE_THRESHOLD_MS[queue] after acknowledgement, the engine fires
 * a fresh active event — admin attention isn't a permanent silencer.
 *
 * Values match the per-queue table in
 * docs/rules-routing-engine-plan.md §5d. Add a row when you add a
 * QueueName; the worker will throw at runtime if a queue lacks one.
 */
export const REQUEUE_THRESHOLD_MS: Record<string, number> = {
  ops_attention: 24 * 60 * 60 * 1000,    // 24h — same severity as ops_alert in the plan
  account_health: 48 * 60 * 60 * 1000,   // 48h — slower-moving than ops; client-facing impact
};

/* ─── Worker scope controls ────────────────────────────────────────── */

/**
 * Cap on how many MapGuard clients the rule pass evaluates per cycle.
 * 100 is generous for the current customer base; bump when active
 * MapGuard clients exceed ~80% of this. Worker logs a warning when a
 * batch is saturated.
 */
export const BATCH_LIMIT_MAPGUARD = 100;

/**
 * Overlap guard for the routing worker. If a previous run started
 * within this window and is still marked "running" in jobLogs, the
 * current cron tick skips. Generous (10 min vs. 5-min cron interval)
 * so a slow DB doesn't double-fire.
 */
export const ROUTING_WORKER_OVERLAP_MS = 10 * 60 * 1000;
