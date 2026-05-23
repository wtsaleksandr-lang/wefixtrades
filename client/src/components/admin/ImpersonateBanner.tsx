import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

/**
 * Global "you are viewing as <customer>" banner.
 *
 * Mounted once at the top of <App /> so it appears on every route
 * (admin pages and the customer portal alike). Polls
 * /api/admin/impersonate/active every 60s so the banner also vanishes
 * when the server-side 60-minute hard cap expires the session.
 *
 * Theme: warning-yellow with theme-aware tokens. Sticky to the top of
 * the viewport above any page-level sticky chrome (z-50). The "Stop &
 * return to admin" button posts to the stop endpoint and forces a
 * full reload so any React-Query caches keyed by user identity are
 * cleared.
 */
interface ActiveImpersonation {
  impersonating: true;
  impersonation_id: string;
  target_user_id: number;
  target_user_name: string | null;
  target_user_email: string | null;
  started_at: string;
}
type ActiveResponse = { impersonating: false } | ActiveImpersonation;

export function ImpersonateBanner() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const q = useQuery<ActiveResponse>({
    queryKey: ["impersonation-active"],
    queryFn: async () => {
      const res = await fetch("/api/admin/impersonate/active", { credentials: "include" });
      if (!res.ok) return { impersonating: false } as const;
      return res.json();
    },
    // 60s polling: matches the server-side 60-minute hard cap divided
    // into a reasonable resolution. Banner vanishes on the next tick
    // after the middleware auto-expires the session.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const stop = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/impersonate/stop", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to stop impersonation");
      }
      return res.json();
    },
    onSuccess: () => {
      // Clear every cached fetch — the user identity just changed
      // back to the admin, so portal-keyed data would otherwise leak
      // to the next page render.
      queryClient.clear();
      navigate("/admin");
      // Hard reload so any in-flight requests using the old session
      // headers don't reach handlers expecting the customer identity.
      window.location.assign("/admin");
    },
  });

  if (!q.data || q.data.impersonating !== true) return null;
  const targetLabel = q.data.target_user_name?.trim() || q.data.target_user_email || `user #${q.data.target_user_id}`;

  return (
    <div
      role="status"
      data-testid="impersonate-banner"
      className="sticky top-0 z-50 flex items-center justify-between gap-3 px-4 py-2 text-sm bg-[hsl(48,96%,55%)] text-[hsl(48,90%,12%)] border-b border-[hsl(48,80%,40%)] shadow-sm"
    >
      <div className="min-w-0 truncate">
        <strong className="font-semibold">Impersonating:</strong>{" "}
        <span className="truncate">{targetLabel}</span>
        {q.data.target_user_email && q.data.target_user_name ? (
          <span className="opacity-70"> ({q.data.target_user_email})</span>
        ) : null}
        <span className="ml-2 opacity-70">— every action is logged.</span>
      </div>
      <button
        type="button"
        onClick={() => stop.mutate()}
        disabled={stop.isPending}
        className="font-semibold underline shrink-0 hover:no-underline disabled:opacity-60"
      >
        {stop.isPending ? "Stopping…" : "Stop & return to admin"}
      </button>
    </div>
  );
}

export default ImpersonateBanner;
