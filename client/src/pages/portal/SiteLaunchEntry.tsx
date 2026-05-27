/**
 * Wave 43 — /portal/sitelaunch entry page.
 *
 * SiteLaunch (one-time website build) doesn't have a standalone product
 * dashboard yet — its delivery, design approvals, and milestone progress
 * already live in PortalServiceDetail (which special-cases `isSiteLaunch`
 * for the design-approval flow + deliverables).
 *
 * Before this page existed, the sidebar SiteLaunch entry had no route, so
 * wouter fell through and the user landed on the closest match (often the
 * settings page) — Alex's "links route to settings" bug.
 *
 * This entry component:
 *   1. Fetches the customer's active services.
 *   2. If they have a sitelaunch-* subscription, redirects straight to the
 *      detail view (`/portal/services/:id`) where the approval / deliverable
 *      flow is wired up.
 *   3. Otherwise renders a graceful empty state pointing at the catalog.
 */

import { useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout, ArrowRight } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { usePageTitle } from "@/hooks/usePageTitle";

interface ServiceRow {
  id: number;
  service_id: string;
  status: string;
}

interface ServicesResp {
  services: ServiceRow[];
}

export default function SiteLaunchEntry() {
  usePageTitle("SiteLaunch");
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<ServicesResp>({
    queryKey: ["/api/portal/services"],
    queryFn: async () => {
      const res = await fetch("/api/portal/services", { credentials: "include" });
      if (!res.ok) return { services: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  /* Defensive: the same endpoint can be cached by other consumers as a raw
   * array (PortalDashboard does this). Coerce to the array shape we expect. */
  const services = useMemo<ServiceRow[]>(() => {
    const raw: unknown = Array.isArray(data) ? data : data?.services;
    return Array.isArray(raw) ? (raw as ServiceRow[]) : [];
  }, [data]);

  const activeSiteLaunch = useMemo(
    () =>
      services.find(
        (s) =>
          s?.service_id?.startsWith("sitelaunch") &&
          s.status !== "cancelled" &&
          s.status !== "completed",
      ),
    [services],
  );

  useEffect(() => {
    if (isLoading) return;
    if (activeSiteLaunch) {
      navigate(`/portal/services/${activeSiteLaunch.id}`, { replace: true });
    }
  }, [isLoading, activeSiteLaunch, navigate]);

  return (
    <PortalLayout breadcrumb="SiteLaunch">
      <div data-theme="light" className="space-y-6">
        <header className="flex items-center gap-2">
          <Layout className="w-5 h-5 text-brand-blue" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-gray-900">SiteLaunch</h1>
        </header>

        {isLoading && (
          <p className="text-sm text-gray-500" data-testid="sitelaunch-entry-loading">
            Loading your SiteLaunch project…
          </p>
        )}

        {!isLoading && !activeSiteLaunch && (
          <div
            className="bg-white rounded-xl border border-gray-200 p-6"
            data-testid="sitelaunch-entry-empty"
          >
            <p className="text-sm font-medium text-gray-900 mb-1">
              No active SiteLaunch project yet.
            </p>
            <p className="text-xs text-gray-500 mb-4 max-w-prose">
              SiteLaunch builds a high-converting website for your trade —
              hosting, design, copy, and launch handled end-to-end. Add it from
              the catalog and we'll kick off the design approval flow on this
              page.
            </p>
            <Link
              href="/portal/catalog"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue-600 transition-colors"
            >
              Browse SiteLaunch tiers <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        )}

        {!isLoading && activeSiteLaunch && (
          <p className="text-sm text-gray-500">Opening your SiteLaunch project…</p>
        )}
      </div>
    </PortalLayout>
  );
}
