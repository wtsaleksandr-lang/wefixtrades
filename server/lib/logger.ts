import * as Sentry from '@sentry/node';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';
const LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

// Sentry bridge: capture rate for log.error() calls.
//
// Default: 25 % in production, 10 % in dev. Override via Doppler env var
// SENTRY_LOG_BRIDGE_SAMPLE_RATE (range 0..1) — bump to 1.0 during an incident
// to capture every log.error() and revert once the spike is understood.
//
// Rationale: production was sampling at 100 % which made every transient log
// line into a Sentry issue + a notification email. 25 % keeps real spikes
// statistically visible (a 4-event burst still surfaces ~1 alert) while
// cutting routine background-noise emails by ~75 %. Going lower than 0.25
// risks missing low-frequency real errors entirely.
const SENTRY_BRIDGE_SAMPLE_RATE = (() => {
  const raw = process.env.SENTRY_LOG_BRIDGE_SAMPLE_RATE;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  }
  return process.env.NODE_ENV === 'production' ? 0.25 : 0.1;
})();

// Tag fields lifted from the data payload into Sentry scope (for grouping/search).
const SENTRY_TAG_FIELDS = ['route', 'client_id', 'user_id', 'request_id'] as const;

function forwardToSentry(prefix: string, msg: string, data?: Record<string, unknown>) {
  // Opt-out: log.error(msg, { sentry: false }) for noisy expected-error paths.
  if (data && data.sentry === false) return;
  // Skip when DSN unset (Sentry.init was not called) — captureException is a no-op but
  // we still want to skip the scope churn for cheap paths.
  if (!process.env.SENTRY_DSN) return;
  if (SENTRY_BRIDGE_SAMPLE_RATE <= 0) return;
  if (SENTRY_BRIDGE_SAMPLE_RATE < 1 && Math.random() >= SENTRY_BRIDGE_SAMPLE_RATE) return;

  try {
    Sentry.withScope((scope) => {
      scope.setTag('logger', prefix);
      scope.setTag('source', 'log.error');
      if (data) {
        for (const field of SENTRY_TAG_FIELDS) {
          const v = data[field];
          if (v !== undefined && v !== null && (typeof v === 'string' || typeof v === 'number')) {
            scope.setTag(field, String(v));
          }
        }
        // Attach the full data payload as context for debugging (minus the opt-out flag).
        const { sentry: _omit, ...rest } = data;
        if (Object.keys(rest).length > 0) {
          scope.setContext('log_data', rest as Record<string, unknown>);
        }
      }

      // Find an Error instance anywhere in the data payload to capture as exception.
      let err: Error | undefined;
      if (data) {
        for (const v of Object.values(data)) {
          if (v instanceof Error) { err = v; break; }
        }
      }
      if (err) {
        Sentry.captureException(err, { tags: { log_msg: msg.slice(0, 200) } });
      } else {
        Sentry.captureMessage(`[${prefix}] ${msg}`, 'error');
      }
    });
  } catch {
    // Never let the Sentry bridge break the log call.
  }
}

function createLogger(prefix: string) {
  const level = (process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')) as LogLevel;
  const threshold = LEVELS[level] ?? LEVELS.info;
  const isProd = process.env.NODE_ENV === 'production';

  function emit(lvl: LogLevel, msg: string, data?: Record<string, unknown>) {
    if (LEVELS[lvl] > threshold) return;
    const method = lvl === 'error' ? console.error : lvl === 'warn' ? console.warn : console.log;
    if (isProd) {
      const entry = { ts: new Date().toISOString(), level: lvl, prefix, msg, ...data };
      method(JSON.stringify(entry));
    } else {
      method(`[${prefix}] ${msg}`, data ? data : '');
    }
    if (lvl === 'error') {
      forwardToSentry(prefix, msg, data);
    }
  }

  return {
    error: (msg: string, data?: Record<string, unknown>) => emit('error', msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => emit('warn', msg, data),
    info: (msg: string, data?: Record<string, unknown>) => emit('info', msg, data),
    debug: (msg: string, data?: Record<string, unknown>) => emit('debug', msg, data),
  };
}

export { createLogger };
