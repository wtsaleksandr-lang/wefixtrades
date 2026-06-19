import { useLocation } from "wouter";
import { Bell, AlertTriangle, Info, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Top-bar notifications bell for the admin shell.
 *
 * Wired to the EXISTING system-alerts feed (server/routes/adminAlertRoutes.ts):
 *   - GET /api/admin/alerts?acknowledged=false&limit=8 → { data, unacknowledged_count }
 * No new backend is introduced. The dropdown lists the most recent
 * unacknowledged alerts (title + relative time + severity), with a
 * "You're all caught up" empty state, a graceful error state, and a
 * "View all →" link to the existing System Alerts page (/admin/crm/alerts).
 *
 * The portal has NO comparable notification feed (its
 * /api/portal/notifications endpoint is settings/opt-ins only), so the
 * bell is admin-only by design.
 */

interface SystemAlert {
  id: number;
  severity: string;
  category: string;
  title: string;
  details: string | null;
  created_at: string;
}

interface AlertsResponse {
  data: SystemAlert[];
  unacknowledged_count: number;
}

const ALERTS_PAGE = "/admin/crm/alerts";

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "critical") {
    return <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" aria-hidden="true" />;
  }
  if (severity === "warning") {
    return <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" aria-hidden="true" />;
  }
  return <Info className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

export default function NotificationsBell() {
  const [, navigate] = useLocation();

  const { data, isLoading, isError } = useQuery<AlertsResponse>({
    queryKey: ["/api/admin/alerts", "bell", "unacked"],
    queryFn: async () => {
      const res = await fetch("/api/admin/alerts?acknowledged=false&limit=8", {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Failed to load notifications (${res.status})`);
      }
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (isError) {
    // Never swallow silently — surface for observability.
    console.error("[NotificationsBell] notifications feed failed to load");
  }

  const alerts = data?.data ?? [];
  const count = data?.unacknowledged_count ?? 0;
  const badgeLabel = count > 99 ? "99+" : String(count);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40"
          aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
          data-testid="admin-notifications-bell"
        >
          <Bell className="w-5 h-5" aria-hidden="true" />
          {count > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold bg-brand-blue text-white"
              aria-hidden="true"
            >
              {badgeLabel}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0" data-testid="admin-notifications-panel">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          {count > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold bg-brand-blue/10 text-brand-blue">
              {badgeLabel}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Loading…
            </div>
          ) : isError ? (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-muted-foreground">
                Couldn't load notifications.
              </p>
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                Try again in a moment.
              </p>
            </div>
          ) : alerts.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <div className="mx-auto mb-2 inline-flex items-center justify-center h-8 w-8 rounded-full bg-muted">
                <Check className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-foreground">You're all caught up</p>
              <p className="text-xs text-muted-foreground mt-0.5">No new notifications.</p>
            </div>
          ) : (
            <ul role="list" className="divide-y divide-border">
              {alerts.map((alert) => (
                <li key={alert.id}>
                  <button
                    type="button"
                    onClick={() => navigate(ALERTS_PAGE)}
                    className={cn(
                      "flex w-full items-start gap-2.5 px-3 py-2.5 text-left",
                      "hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:bg-muted/50",
                    )}
                    data-testid={`admin-notification-item-${alert.id}`}
                  >
                    <SeverityIcon severity={alert.severity} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-foreground line-clamp-2">
                        {alert.title}
                      </span>
                      <span className="block text-[11px] text-muted-foreground mt-0.5">
                        {timeAgo(alert.created_at)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => navigate(ALERTS_PAGE)}
            className="block w-full px-3 py-2.5 text-center text-xs font-medium text-brand-blue hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:bg-muted/50"
            data-testid="admin-notifications-view-all"
          >
            View all →
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
