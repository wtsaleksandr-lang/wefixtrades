/**
 * Wave 34 — Universal AI-actions package barrel.
 *
 * Import target for both client and server. Shared so the
 * `<AIActionCard>` UI primitive can render labels and confirmation
 * levels straight from the registry without round-tripping to the
 * server.
 */

export * from "./actionRegistry";
