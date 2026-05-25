/**
 * ContentFlow Phase 4 — QuotaBanner.
 *
 * Renders the calling client's monthly usage as 3 horizontal progress
 * bars (images / articles / videos). Pulls from
 * GET /api/portal/contentflow/quota.
 *
 * INTEGRATION NOTE (Phase 3 coordination): the parent agent owns
 * client/src/pages/portal/PortalContentFlow.tsx. Phase 4 only exports
 * this component — Phase 3 imports it as:
 *
 *   import QuotaBanner from "@/components/portal/QuotaBanner";
 *   ...
 *   <QuotaBanner />   // place at the top of the ContentFlow tab.
 *
 * Color thresholds: green < 70%, yellow 70-90%, red > 90% of the limit.
 * When any single bar crosses 80% an "Upgrade for more" CTA appears
 * linking to /contentflow#pricing.
 */

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Image as ImageIcon, FileText, Video, ArrowUpRight } from "lucide-react";
import type {
  QuotaLimit,
  QuotaUsage,
} from "@shared/contentflow/quotas";

interface QuotaStateResponse {
  tier: string;
  limit: QuotaLimit;
  used: QuotaUsage;
  resetAt: string;
  period_start: string;
}

type AssetRow = {
  key: "images" | "articles" | "videos";
  label: string;
  icon: typeof ImageIcon;
  used: number;
  limit: number;
};

function pctOf(used: number, limit: number): number {
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

/** Tailwind classes for the fill color based on usage %. */
function fillColor(pct: number): string {
  if (pct > 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function tierDisplayName(tierId: string): string {
  // contentflow-free → "Free", contentflow-creator → "Creator", etc.
  const tail = tierId.replace(/^contentflow-/, "");
  if (!tail) return "ContentFlow";
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}

/** Format the reset timestamp as a short, friendly date. */
function formatResetAt(iso: string | undefined): string {
  if (!iso) return "next month";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "next month";
  }
}

export default function QuotaBanner() {
  const { data, isLoading, isError } = useQuery<QuotaStateResponse>({
    queryKey: ["/api/portal/contentflow/quota"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/portal/contentflow/quota");
      return res.json();
    },
    // Refetch when the user comes back to the tab — keeps the bars honest
    // after a long-running generation completes elsewhere.
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <Card className="p-4 mb-4" data-testid="quota-banner-loading">
        <div className="h-16 animate-pulse bg-muted rounded" />
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="p-4 mb-4" data-testid="quota-banner-error">
        <div className="text-sm text-muted-foreground">
          Couldn't load your monthly quota right now. Refresh to retry.
        </div>
      </Card>
    );
  }

  const rows: AssetRow[] = [
    { key: "images",   label: "AI images",   icon: ImageIcon, used: data.used.images_used,   limit: data.limit.images },
    { key: "articles", label: "AI articles", icon: FileText,  used: data.used.articles_used, limit: data.limit.articles },
    { key: "videos",   label: "AI videos",   icon: Video,     used: data.used.videos_used,   limit: data.limit.videos },
  ];

  const anyOver80 = rows.some((r) => pctOf(r.used, r.limit) >= 80);
  const tierLabel = tierDisplayName(data.tier);
  const resetLabel = formatResetAt(data.resetAt);

  return (
    <Card className="p-4 mb-4" data-testid="quota-banner">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="text-sm font-medium">
            Monthly usage <span className="text-muted-foreground">— {tierLabel} plan</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Resets {resetLabel}
          </div>
        </div>
        {anyOver80 && (
          <Button
            asChild
            size="sm"
            variant="default"
            data-testid="quota-banner-upgrade-cta"
          >
            <a href="/contentflow#pricing">
              Upgrade for more
              <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const pct = pctOf(row.used, row.limit);
          const Icon = row.icon;
          const isVideoUnavailable = row.key === "videos" && row.limit === 0;
          return (
            <div key={row.key} data-testid={`quota-bar-${row.key}`}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                  {row.label}
                </span>
                <span className="tabular-nums">
                  {isVideoUnavailable
                    ? "Not on this plan"
                    : `${row.used} / ${row.limit}`}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    isVideoUnavailable ? "bg-muted-foreground/30" : fillColor(pct)
                  }`}
                  style={{ width: `${isVideoUnavailable ? 100 : pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
