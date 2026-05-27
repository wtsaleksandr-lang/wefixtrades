/**
 * Wave 43 — /portal/webfix entry page.
 *
 * WebFix (one-time website fixes) already renders its progress, audit
 * report, and deliverable viewer through PortalServiceDetail's
 * `isWebFix` branch. This entry exists so the portal sidebar's WebFix
 * link has a target route — without it, wouter falls through and the
 * user lands on the nearest matching route (Alex's "routes to settings"
 * bug).
 *
 * Behaviour mirrors SiteLaunchEntry: redirect to the matching detail
 * page when the user has an active WebFix subscription; otherwise show
 * a graceful empty state that points at the catalog.
 */

import { useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Hammer, ArrowRight } from "lucide-react";
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

export default function WebFixEntry() {
  usePageTitle("WebFix");
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

  const services = useMemo<ServiceRow[]>(() => {
    const raw: unknown = Array.isArray(data) ? data : data?.services;
    return Array.isArray(raw) ? (raw as ServiceRow[]) : [];
  }, [data]);

  const activeWebFix = useMemo(
    () =>
      services.find(
        (s) =>
          s?.service_id?.startsWith("webfix") &&
          s.status !== "cancelled" &&
          s.status !== "completed",
      ),
    [services],
  );

  useEffect(() => {
    if (isLoading) return;
    if (activeWebFix) {
      navigate(`/portal/services/${activeWebFix.id}`, { replace: true });
    }
  }, [isLoading, activeWebFix, navigate]);

  return (
    <PortalLayout breadcrumb="WebFix">
      <div data-theme="light" className="space-y-6">
        <header className="flex items-center gap-2">
          <Hammer className="w-5 h-5 text-brand-blue" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-gray-900">WebFix</h1>
        </header>

        {isLoading && (
          <p className="text-sm text-gray-500" data-testid="webfix-entry-loading">
            Loading your WebFix project…
          </p>
        )}

        {!isLoading && !activeWebFix && (
          <div
            className="bg-white rounded-xl border border-gray-200 p-6"
            data-testid="webfix-entry-empty"
          >
            <p className="text-sm font-medium text-gray-900 mb-1">
              No active WebFix project yet.
            </p>
            <p className="text-xs text-gray-500 mb-4 max-w-prose">
              WebFix is a one-time tune-up for your existing website — speed,
              SEO basics, mobile, and design fixes. Add it from the catalog
              and you'll see the audit report and progress here.
            </p>
            <Link
              href="/portal/catalog"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue-600 transition-colors"
            >
              Browse WebFix tiers <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        )}

        {!isLoading && activeWebFix && (
          <p className="text-sm text-gray-500">Opening your WebFix project…</p>
        )}
      </div>
    </PortalLayout>
  );
}
