import { useAuth } from "@/hooks/useAuth";
import { Redirect } from "wouter";

/**
 * Wraps client portal routes.
 * Redirects to /login if unauthenticated, or / if not a client user.
 */
export default function RequireClient({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) return null;
  if (!isAuthenticated) return <Redirect to="/login" />;
  if (user?.role !== "client") return <Redirect to="/" />;

  return <>{children}</>;
}
