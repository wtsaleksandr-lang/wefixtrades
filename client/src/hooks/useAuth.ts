import { useQuery } from "@tanstack/react-query";

export type AuthUser = {
  id: number;
  email: string;
  role: string;
  name: string | null;
};

/**
 * Lightweight auth hook.
 * Tries GET /api/auth/me — if the endpoint doesn't exist yet the user
 * is treated as unauthenticated (no error thrown, no redirect).
 */
export function useAuth() {
  const { data: user, isLoading, isFetching } = useQuery<AuthUser | null>({
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
    isLoading: isLoading || isFetching,
    isAuthenticated: !!user,
    isPortalUser: !!user && (user.role === "admin" || user.role === "portal"),
  };
}
