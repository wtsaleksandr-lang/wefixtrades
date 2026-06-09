/**
 * Side-effect-only import for server-failover-chat.spec.ts.
 *
 * `server/db.ts` THROWS at module-evaluation time if DATABASE_URL is unset,
 * and the audit CI deliberately runs with no database. The failover spec must
 * import the REAL `chat()` engine (which transitively pulls server/db), so we
 * set a dummy DATABASE_URL here. ESM evaluates imports in source order, so as
 * long as the spec lists this import FIRST, the env is in place before db.ts
 * is evaluated.
 *
 * This is safe: the surface-less chat() path the spec exercises never opens a
 * DB connection (no aiGateAllowed / readGateBudget / logUsage). The Pool is
 * constructed but never connects, so the dummy URL is never dialed.
 */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://audit:audit@127.0.0.1:1/audit_no_connect";
}
