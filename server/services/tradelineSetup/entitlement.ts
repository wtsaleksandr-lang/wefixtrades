/**
 * TradeLine provisioning entitlement predicate.
 *
 * The paid provisioning routes (`/setup/provision-new`, `/setup/forward/
 * lookup-carrier`) call `provisionNumber()`, which buys a REAL Twilio number
 * (a recurring charge on our account). `requireClient` only proves the caller
 * is a signed-in client-role user — which any free signup is — so these routes
 * must additionally require an actual TradeLine subscription before spending.
 *
 * Signal = the codebase's canonical TradeLine ownership check: a `client_services`
 * row whose `service_id` starts with `tradeline` (the same `LIKE 'tradeline%'`
 * pattern used across the TradeLine dashboards/KPIs/health checks).
 *
 * Existence-only (any NON-cancelled tradeline service) is deliberate: a paying
 * client's row exists from checkout regardless of setup stage, so this can
 * never block them mid-setup. Only accounts with NO TradeLine service — or a
 * cancelled one — are blocked. Kept as a pure function so the money-gate logic
 * is unit-tested without DB/HTTP.
 */

export interface EntitlementServiceRow {
  service_id?: string | null;
  status?: string | null;
}

export function isTradelineEntitled(services: EntitlementServiceRow[]): boolean {
  return services.some(
    (s) =>
      typeof s.service_id === "string" &&
      s.service_id.toLowerCase().startsWith("tradeline") &&
      s.status !== "cancelled",
  );
}
