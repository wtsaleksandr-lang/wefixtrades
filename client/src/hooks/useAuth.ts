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
 * Lightweight auth hook.
 * Tries GET /api/auth/me — if the endpoint doesn't exist yet the user
 * is treated as unauthenticated (no error thrown, no redirect).
 */
export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) return null;
        const json = await res.json();
        return json?.user ?? null;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    user: user ?? null,
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
  };
}
