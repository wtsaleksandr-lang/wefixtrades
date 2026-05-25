/**
 * Tiny bounded-fetch helper for the Master Audit pipeline. Lives inside
 * the service folder so the section runners don't reach into routes/
 * (where auditTabsShared also imports the db client — a transitive
 * dependency we want to avoid in cold-path test scripts).
 *
 * Wave 3.6 (2026-05-25). No new deps — Node 20 global fetch + AbortController.
 */

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

export async function fetchWithTimeout(
  url: string,
  opts: RequestInit & { timeoutMs?: number } = {},
): Promise<FetchResponse | null> {
  const { timeoutMs = 8000, ...init } = opts;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "User-Agent": "WeFixTrades-AuditBot/1.0 (+https://wefixtrades.com)",
        ...(init.headers || {}),
      },
    });
    return r;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
