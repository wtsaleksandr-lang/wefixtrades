import { useQuery } from "@tanstack/react-query";

/**
 * The only roles the server ever issues. `server/auth.ts` mints `admin` or
 * `client` exclusively, and the `users.role` column defaults to `"client"`.
 * There is no `portal` role — keep this union in sync with the backend.
 */
export type UserRole = "admin" | "client";

export type AuthUser = {
  id: number;
  email: string;
  role: UserRole;
  name: string | null;
};

/**
 * Shape of `/api/auth/me` after the P1 admin-Preview-as-Pro patch.
 * `adminProPreview` is only ever true for admins with the per-session
 * flag flipped on — server enforces both conditions before returning
 * true. Treat as read-only override; don't mutate client-side.
 */
type AuthMeResponse = {
  user: AuthUser | null;
  adminProPreview?: boolean;
};

/**
 * Lightweight auth hook.
 * Tries GET /api/auth/me — if the endpoint doesn't exist yet the user
 * is treated as unauthenticated (no error thrown, no redirect).
 */
export function useAuth() {
  const { data, isLoading } = useQuery<AuthMeResponse>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) return { user: null };
        const json = (await res.json()) as AuthMeResponse;
        return { user: json?.user ?? null, adminProPreview: !!json?.adminProPreview };
      } catch {
        return { user: null };
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const user = data?.user ?? null;
  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    /**
     * Gates the internal admin console (`RequirePortal`). Only the `admin`
     * role qualifies — the client-facing portal is gated separately by
     * `RequireClient`. Previously this also accepted a `role === "portal"`
     * value that the server never issues; that dead branch is removed so a
     * future `portal` role cannot silently inherit admin-console access.
     */
    isPortalUser: !!user && user.role === "admin",
    /** P1 fix: admin Preview-as-Pro session override (admin-only). */
    adminProPreview: !!data?.adminProPreview,
  };
}
