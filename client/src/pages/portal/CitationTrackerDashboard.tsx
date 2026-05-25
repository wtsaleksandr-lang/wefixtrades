/**
 * Citation Tracker — customer portal dashboard.
 *
 * Surfaces:
 *   - Subscription status card (plan tier, next billing, total tracked)
 *   - Alerts panel (unread first, color-coded severity)
 *   - Listings table (directory, status, last checked, current NAP)
 *   - "Manage subscription" button → Stripe customer portal
 *
 * Hits the routes in server/routes/citationTrackerRoutes.ts. If the
 * customer has no subscription, shows a CTA card linking to the
 * marketing page.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  AlertTriangle, CheckCircle2, Activity, Bell, ExternalLink, Loader2, Settings,
} from "lucide-react";

/* ─── API types ─── */
interface NapSnapshot {
  phone?: string;
  address?: string;
  name?: string;
  website?: string;
}

interface SubscriptionRow {
  id: string;
  business_name: string;
  plan_tier: "standalone" | "bundle";
  status: "active" | "canceled" | "past_due";
  created_at: string;
  canceled_at: string | null;
  nap: NapSnapshot;
}

interface SubscriptionResp {
  subscription: SubscriptionRow | null;
  summary?: {
    total_listings: number;
    unread_alerts: number;
  };
}

interface ListingRow {
  id: string;
  directory_name: string;
  directory_url: string;
  listing_url: string | null;
  current_nap: NapSnapshot | null;
  last_checked_at: string | null;
  status: "active" | "missing" | "inconsistent";
}

interface AlertRow {
  id: string;
  alert_type: "nap_change" | "new_listing" | "removed_listing" | "inconsistency";
  severity: "low" | "medium" | "high";
  old_value: any;
  new_value: any;
  created_at: string;
  read_at: string | null;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function severityClassName(sev: AlertRow["severity"]): string {
  switch (sev) {
    case "high": return "ct-alert-high";
    case "medium": return "ct-alert-medium";
    case "low": return "ct-alert-low";
  }
}

function alertTitle(a: AlertRow): string {
  switch (a.alert_type) {
    case "nap_change": return "NAP change detected";
    case "new_listing": return "New citation discovered";
    case "removed_listing": return "Citation removed";
    case "inconsistency": return "NAP inconsistency";
  }
}

export default function CitationTrackerDashboard() {
  usePageTitle("Citation Tracker");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const subscriptionQ = useQuery<SubscriptionResp>({
    queryKey: ["citation-tracker", "subscription"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/citation-tracker/subscription");
      return res.json();
    },
  });

  const listingsQ = useQuery<{ listings: ListingRow[]; total: number }>({
    queryKey: ["citation-tracker", "listings"],
    enabled: !!subscriptionQ.data?.subscription,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/citation-tracker/listings?limit=50");
      return res.json();
    },
  });

  const alertsQ = useQuery<{ alerts: AlertRow[]; total: number }>({
    queryKey: ["citation-tracker", "alerts"],
    enabled: !!subscriptionQ.data?.subscription,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/citation-tracker/alerts?limit=50");
      return res.json();
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await apiRequest("POST", `/api/citation-tracker/alerts/${alertId}/dismiss`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["citation-tracker", "alerts"] });
      queryClient.invalidateQueries({ queryKey: ["citation-tracker", "subscription"] });
    },
    onError: (err: any) => {
      toast({ title: "Could not dismiss alert", description: err?.message ?? "Try again.", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/citation-tracker/cancel", {});
      return res.json();
    },
    onSuccess: (data: { portal_url?: string }) => {
      if (data.portal_url) {
        window.location.href = data.portal_url;
      } else {
        toast({ title: "Could not open portal", description: "Please try again later.", variant: "destructive" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Could not open portal", description: err?.message ?? "Try again.", variant: "destructive" });
    },
  });

  const sub = subscriptionQ.data?.subscription;
  const summary = subscriptionQ.data?.summary;

  const unreadAlerts = useMemo(() => {
    const all = alertsQ.data?.alerts ?? [];
    return all.filter((a) => !a.read_at);
  }, [alertsQ.data]);
  const readAlerts = useMemo(() => {
    const all = alertsQ.data?.alerts ?? [];
    return all.filter((a) => a.read_at);
  }, [alertsQ.data]);

  return (
    <PortalLayout>
      <div data-theme="light" className="ct-dashboard" style={{ display: "grid", gap: 2, padding: 16 }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Citation Tracker</h1>
            <p style={{ margin: "2px 0 0", color: "var(--muted-foreground)", fontSize: 13 }}>
              Continuous NAP drift monitoring across 50+ directories.
            </p>
          </div>
        </header>

        {subscriptionQ.isLoading && (
          <Card style={{ padding: 16 }}>
            <Skeleton style={{ height: 18, width: 220, marginBottom: 8 }} />
            <Skeleton style={{ height: 14, width: 320 }} />
          </Card>
        )}

        {!subscriptionQ.isLoading && !sub && (
          <Card style={{ padding: 24, textAlign: "center" }}>
            <Activity size={32} style={{ margin: "0 auto 8px", display: "block", color: "var(--muted-foreground)" }} />
            <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600 }}>You're not subscribed to Citation Tracker yet</h2>
            <p style={{ margin: "0 0 14px", color: "var(--muted-foreground)", fontSize: 14 }}>
              Catch NAP changes before they tank your local rankings. From $5/mo as a MapGuard add-on.
            </p>
            <Link href="/citation-tracker">
              <Button>See plans & subscribe</Button>
            </Link>
          </Card>
        )}

        {sub && (
          <>
            {/* ─── Subscription status card ─── */}
            <Card style={{ padding: 16 }}>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Subscription</div>
                  <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>
                    {sub.plan_tier === "bundle" ? "Citation Tracker (bundle add-on)" : "Citation Tracker (standalone)"}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, color: "var(--muted-foreground)" }}>
                    <span>Status: <strong style={{ color: sub.status === "active" ? "var(--success, rgb(46, 160, 67))" : "var(--destructive)" }}>{sub.status}</strong></span>
                    <span>Started: {fmtDate(sub.created_at)}</span>
                    <span>{summary?.total_listings ?? 0} listings tracked</span>
                    <span>{summary?.unread_alerts ?? 0} unread alerts</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                >
                  {cancelMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Settings size={14} />}
                  <span style={{ marginLeft: 6 }}>Manage subscription</span>
                </Button>
              </div>
            </Card>

            {/* ─── Alerts panel ─── */}
            <Card style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Bell size={16} />
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Alerts</h2>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted-foreground)" }}>
                  {unreadAlerts.length} unread / {alertsQ.data?.total ?? 0} total
                </span>
              </div>

              {alertsQ.isLoading && <Skeleton style={{ height: 64 }} />}

              {!alertsQ.isLoading && (alertsQ.data?.alerts.length ?? 0) === 0 && (
                <div style={{ padding: 12, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>
                  <CheckCircle2 size={20} style={{ display: "block", margin: "0 auto 4px" }} />
                  No alerts. We'll let you know the moment a directory changes your NAP.
                </div>
              )}

              {!alertsQ.isLoading && unreadAlerts.length > 0 && (
                <div style={{ display: "grid", gap: 2 }}>
                  {unreadAlerts.map((a) => (
                    <AlertRowView
                      key={a.id}
                      alert={a}
                      onDismiss={() => dismissMutation.mutate(a.id)}
                      dismissing={dismissMutation.isPending && dismissMutation.variables === a.id}
                    />
                  ))}
                </div>
              )}

              {!alertsQ.isLoading && readAlerts.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--muted-foreground)" }}>
                    {readAlerts.length} dismissed
                  </summary>
                  <div style={{ display: "grid", gap: 2, marginTop: 4 }}>
                    {readAlerts.map((a) => (
                      <AlertRowView key={a.id} alert={a} dismissed />
                    ))}
                  </div>
                </details>
              )}
            </Card>

            {/* ─── Listings table ─── */}
            <Card style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Tracked Listings</h2>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted-foreground)" }}>
                  {listingsQ.data?.total ?? 0} total
                </span>
              </div>

              {listingsQ.isLoading && <Skeleton style={{ height: 64 }} />}

              {!listingsQ.isLoading && (listingsQ.data?.listings.length ?? 0) === 0 && (
                <div style={{ padding: 12, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>
                  Our first scan runs within 24 hours and populates this table automatically.
                </div>
              )}

              {!listingsQ.isLoading && (listingsQ.data?.listings.length ?? 0) > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                        <th style={{ padding: "6px 8px" }}>Directory</th>
                        <th style={{ padding: "6px 8px" }}>Status</th>
                        <th style={{ padding: "6px 8px" }}>Last checked</th>
                        <th style={{ padding: "6px 8px" }}>Current NAP</th>
                        <th style={{ padding: "6px 8px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {listingsQ.data!.listings.map((l) => (
                        <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "6px 8px", fontWeight: 500 }}>{l.directory_name}</td>
                          <td style={{ padding: "6px 8px" }}>
                            <span className={`ct-status ct-status-${l.status}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              {l.status === "active" && <CheckCircle2 size={12} />}
                              {l.status === "inconsistent" && <AlertTriangle size={12} />}
                              {l.status === "missing" && <AlertTriangle size={12} />}
                              {l.status}
                            </span>
                          </td>
                          <td style={{ padding: "6px 8px", color: "var(--muted-foreground)" }}>{fmtDate(l.last_checked_at)}</td>
                          <td style={{ padding: "6px 8px", color: "var(--muted-foreground)" }}>
                            {l.current_nap?.name && <div>{l.current_nap.name}</div>}
                            {l.current_nap?.phone && <div>{l.current_nap.phone}</div>}
                            {l.current_nap?.address && <div>{l.current_nap.address}</div>}
                            {!l.current_nap && <em>not yet scanned</em>}
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            {l.listing_url && (
                              <a href={l.listing_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                                <ExternalLink size={12} /> View
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </PortalLayout>
  );
}

/* ─── Components ─── */
function AlertRowView({ alert, onDismiss, dismissing, dismissed }: {
  alert: AlertRow;
  onDismiss?: () => void;
  dismissing?: boolean;
  dismissed?: boolean;
}) {
  const oldVal = alert.old_value;
  const newVal = alert.new_value;
  const directory = (newVal?.directory ?? oldVal?.directory) as string | undefined;

  return (
    <div
      className={severityClassName(alert.severity)}
      style={{
        border: "1px solid var(--border)",
        borderLeftWidth: 4,
        borderLeftStyle: "solid",
        borderLeftColor:
          alert.severity === "high"
            ? "var(--destructive, rgb(220, 53, 69))"
            : alert.severity === "medium"
              ? "var(--warning, rgb(255, 165, 0))"
              : "var(--muted-foreground)",
        padding: 8,
        borderRadius: 6,
        opacity: dismissed ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>
            {alertTitle(alert)} {directory && <span style={{ color: "var(--muted-foreground)" }}>· {directory}</span>}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
            {fmtDate(alert.created_at)} · severity: {alert.severity}
          </div>
        </div>
        {onDismiss && !dismissed && (
          <Button size="sm" variant="outline" onClick={onDismiss} disabled={dismissing}>
            {dismissing ? <Loader2 size={12} className="animate-spin" /> : "Dismiss"}
          </Button>
        )}
      </div>
    </div>
  );
}
