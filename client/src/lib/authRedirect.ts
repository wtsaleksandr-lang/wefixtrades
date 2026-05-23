// IA-1 (2026-05-22) — single source of truth for the post-auth landing
// path on the client. Mirrors `landingPathForRole` in
// server/routes/authRoutes.ts. Every auth-completion path (password
// login, magic-link token-login, 2FA, signup, Google signup completion)
// must funnel through this helper so a future role change only edits
// one file. Unknown roles fall through to /portal — the safest non-
// admin landing now that the standalone QuoteQuick dashboard is no
// longer the default landing target.

export type AuthRedirectRole = string | undefined | null;

export function landingPathForRole(role: AuthRedirectRole): string {
  if (role === "admin" || role === "portal") return "/admin/crm";
  if (role === "client") return "/portal";
  // Unknown / undefined role → safe default. Previously this returned
  // "/dashboard" (the standalone QuoteQuick calculator dashboard),
  // which is what landed Alex on the wrong page after login.
  return "/portal";
}
