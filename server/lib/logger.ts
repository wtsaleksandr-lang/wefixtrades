type LogLevel = 'error' | 'warn' | 'info' | 'debug';
const LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

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
  }

  return {
    error: (msg: string, data?: Record<string, unknown>) => emit('error', msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => emit('warn', msg, data),
    info: (msg: string, data?: Record<string, unknown>) => emit('info', msg, data),
    debug: (msg: string, data?: Record<string, unknown>) => emit('debug', msg, data),
  };
}

export { createLogger };
