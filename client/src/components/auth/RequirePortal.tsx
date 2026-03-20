import { useAuth } from "@/hooks/useAuth";
import { Redirect } from "wouter";

/**
 * Wraps internal/dev routes.
 * Redirects to /login if unauthenticated, or / if not a portal/admin user.
 */
export default function RequirePortal({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isPortalUser, isLoading } = useAuth();

  if (isLoading) return null;
  if (!isAuthenticated) return <Redirect to="/login" />;
  if (!isPortalUser) return <Redirect to="/" />;

  return <>{children}</>;
}
