/**
 * Shared fetch helper for the tradeline-setup wizard.
 * Sends credentials (session cookie), throws on non-2xx.
 */

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let parsed: { error?: string; code?: string } | null = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* ignore */ }
    const msg = parsed?.error || text || `${res.status} ${res.statusText}`;
    const err = new Error(msg) as Error & { code?: string; status?: number };
    if (parsed?.code) err.code = parsed.code;
    err.status = res.status;
    throw err;
  }
  return res.json();
}
