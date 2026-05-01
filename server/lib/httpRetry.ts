/**
 * Fetch wrapper with retry, exponential backoff + jitter, and timeout.
 *
 * Only retries on network errors and 5xx responses. 4xx responses are
 * returned immediately (caller decides how to handle).
 */
import { createLogger } from "./logger";

const log = createLogger("HttpRetry");

const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 15_000;
const BASE_DELAY_MS = 500;

export async function fetchWithRetry(
  url: string,
  options?: RequestInit & { retries?: number; timeoutMs?: number },
): Promise<Response> {
  const maxRetries = options?.retries ?? DEFAULT_RETRIES;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Strip custom keys from options before passing to fetch
  const { retries: _r, timeoutMs: _t, signal: callerSignal, ...fetchOpts } = options ?? {};

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Respect caller's signal too
    if (callerSignal) {
      if (callerSignal.aborted) {
        clearTimeout(timer);
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    try {
      const res = await fetch(url, { ...fetchOpts, signal: controller.signal });
      clearTimeout(timer);

      // 5xx — retryable
      if (res.status >= 500 && attempt < maxRetries) {
        log.warn("5xx response, retrying", {
          url,
          status: res.status,
          attempt: attempt + 1,
          maxRetries,
        });
        await sleep(backoff(attempt));
        continue;
      }

      // 2xx, 3xx, 4xx — return as-is (caller handles)
      return res;
    } catch (err: any) {
      clearTimeout(timer);
      lastError = err;

      // AbortError from caller signal — don't retry
      if (callerSignal?.aborted) throw err;

      if (attempt < maxRetries) {
        log.warn("Network error, retrying", {
          url,
          error: err.message,
          attempt: attempt + 1,
          maxRetries,
        });
        await sleep(backoff(attempt));
      }
    }
  }

  throw lastError ?? new Error(`fetchWithRetry failed after ${maxRetries + 1} attempts: ${url}`);
}

function backoff(attempt: number): number {
  // Exponential backoff: 500ms, 1000ms, 2000ms, ... + jitter
  const base = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * BASE_DELAY_MS;
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
