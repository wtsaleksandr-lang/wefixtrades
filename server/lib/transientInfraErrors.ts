/**
 * Transient-infrastructure error classification.
 *
 * Sentry triage 2026-06-11: ~24 distinct unresolved Sentry issues (the whole
 * "[Scheduler] Failed to create job log for <worker>" family plus most
 * "[Scheduler] <worker> error" issues) shared ONE root cause — transient
 * Neon Postgres connection failures (compute suspend/wake races at cron
 * ticks, plus the 2026-06-01 control-plane incident). Each blip was logged
 * at error level under a different message → one Sentry issue + one email
 * per worker name per outage.
 *
 * This module is the single classifier for "known-transient infra error":
 *   - the scheduler retries job-log writes on these and warns (not errors)
 *     when retries exhaust;
 *   - the logger's Sentry bridge groups residual error-level logs whose
 *     payload matches into one stable warning-level issue per subsystem
 *     instead of a new error family per call site;
 *   - alertService treats them as retryable.
 *
 * Deliberately NOT matched: constraint violations, missing columns/relations,
 * syntax errors, auth failures — those are real bugs and must stay loud.
 */

/** Substrings/regexes that identify a transient infra failure. */
const TRANSIENT_PATTERNS: RegExp[] = [
  // node-postgres / Neon connection lifecycle
  /connection terminated/i,
  /connection not available/i,
  /control plane request failed/i,
  /server closed the connection unexpectedly/i,
  /client has encountered a connection error/i,
  /ssl connection has been closed unexpectedly/i,
  /terminating connection due to administrator command/i,
  /the database system is (?:starting up|shutting down|in recovery mode)/i,
  /sorry, too many clients already/i,
  /remaining connection slots are reserved/i,
  /timeout exceeded when trying to connect/i,
  /connection timeout/i,
  /query read timeout/i,
  // raw socket/dns level
  /socket timeout/i,
  /socket hang up/i,
  /\bECONNRESET\b/,
  /\bECONNREFUSED\b/,
  /\bETIMEDOUT\b/,
  /\bEAI_AGAIN\b/,
  /\bEPIPE\b/,
  /\bEHOSTUNREACH\b/,
  /\bENETUNREACH\b/,
  // upstream API connection timeouts (Anthropic SDK et al.)
  /request timed out/i,
];

/** Postgres SQLSTATE codes for shutdown/connection-level failures. */
const TRANSIENT_PG_CODES = new Set([
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "08000", // connection_exception
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08003", // connection_does_not_exist
  "08006", // connection_failure
  "53300", // too_many_connections
]);

function messageMatches(text: string): boolean {
  if (!text) return false;
  for (const re of TRANSIENT_PATTERNS) {
    if (re.test(text)) return true;
  }
  return false;
}

/**
 * True when the error (or anything in its `cause` chain — drizzle wraps the
 * pg error as `DrizzleQueryError.cause`) is a known-transient infra failure.
 * Accepts an Error, a string, or anything stringifiable; never throws.
 */
export function isTransientInfraError(err: unknown, depth = 0): boolean {
  if (err == null || depth > 5) return false;
  if (typeof err === "string") return messageMatches(err);
  if (err instanceof Error || (typeof err === "object" && err !== null)) {
    const anyErr = err as { message?: unknown; code?: unknown; cause?: unknown };
    if (typeof anyErr.code === "string" && TRANSIENT_PG_CODES.has(anyErr.code)) return true;
    if (typeof anyErr.message === "string" && messageMatches(anyErr.message)) return true;
    if (anyErr.cause !== undefined && anyErr.cause !== err) {
      return isTransientInfraError(anyErr.cause, depth + 1);
    }
    return false;
  }
  return messageMatches(String(err));
}

/**
 * Flatten an error (following the `cause` chain) into a log-friendly payload.
 * Drizzle's "Failed query: …" wrapper alone hides the pg error code/message —
 * this surfaces both so Sentry's log_data context is actually diagnosable.
 */
export function describeError(err: unknown): { error: string; code?: string; cause?: string } {
  if (err == null) return { error: "unknown" };
  if (typeof err === "string") return { error: err };
  const anyErr = err as { message?: unknown; code?: unknown; cause?: unknown };
  const out: { error: string; code?: string; cause?: string } = {
    error: typeof anyErr.message === "string" ? anyErr.message : String(err),
  };
  if (typeof anyErr.code === "string") out.code = anyErr.code;
  const cause = anyErr.cause as { message?: unknown; code?: unknown } | undefined;
  if (cause && cause !== err) {
    const causeMsg = typeof cause.message === "string" ? cause.message : String(cause);
    out.cause = causeMsg;
    if (!out.code && typeof cause.code === "string") out.code = cause.code;
  }
  return out;
}

/** Small await-able backoff used by transient retries. */
export function backoffDelay(attempt: number, baseMs = 300): Promise<void> {
  return new Promise((r) => setTimeout(r, baseMs * Math.pow(3, attempt - 1)));
}

/**
 * Retry `fn` only while the failure is a transient infra error.
 * Non-transient errors rethrow immediately (a real bug must not be retried
 * into a different shape). Returns fn's result; rethrows the last error
 * when attempts are exhausted.
 */
export async function withTransientRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientInfraError(err) || attempt === attempts) throw err;
      await backoffDelay(attempt, opts.baseDelayMs ?? 300);
    }
  }
  // Unreachable, but keeps TS satisfied without a non-null assertion.
  throw lastErr;
}
