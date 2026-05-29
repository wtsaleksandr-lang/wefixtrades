/**
 * Wave 141 — shared admin health query.
 *
 * Wraps the single `GET /api/admin/health` aggregate (Wave 140) in one
 * react-query hook so every consumer (the Overview <SystemHealthPanel> and
 * the per-product nav <ProductHealthDot>s) shares ONE request + cache entry.
 *
 * react-query dedupes by `queryKey`, so any number of components calling
 * `useProductHealth()` resolve to a single in-flight fetch and a single
 * cached result — no per-dot request fan-out. The server caches the
 * aggregate ~60s, so we mirror that with a 60s staleTime.
 *
 * READ-ONLY display. No resolution, no writes — see Wave 142 for actions.
 *
 * Health types mirror `server/services/health/productHealthRegistry.ts`
 * (server-only file; not importable client-side, so we mirror the shapes).
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

export type ProductStatus = "ok" | "degraded" | "down";

export interface ProductCheck {
  name: string;
  ok: boolean;
  detail: string;
  latencyMs?: number;
  critical?: boolean;
}

export interface ProductHealth {
  productId: string;
  status: ProductStatus;
  checks: ProductCheck[];
  lastCheckedAt: string;
}

export interface ToolHealth {
  toolId: string;
  status: ProductStatus;
  checks: ProductCheck[];
  lastCheckedAt: string;
}

export interface HealthAggregate {
  overall: ProductStatus;
  products: ProductHealth[];
  tools: ToolHealth[];
  generatedAt: string;
}

/** Shared query key — react-query dedupes every caller onto one request. */
export const ADMIN_HEALTH_KEY = ["/api/admin/health"] as const;

/**
 * Shared hook for the admin health aggregate. The default queryFn
 * (queryClient.ts) fetches `queryKey.join("/")` with credentials, which
 * resolves to `/api/admin/health`. 60s staleTime mirrors the server cache.
 */
export function useProductHealth(): UseQueryResult<HealthAggregate> {
  return useQuery<HealthAggregate>({
    queryKey: ADMIN_HEALTH_KEY,
    staleTime: 60 * 1000,
  });
}
