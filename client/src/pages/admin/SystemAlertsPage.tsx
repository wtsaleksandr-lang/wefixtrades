import { usePageTitle } from "@/hooks/usePageTitle";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle, Info, Shield, Clock, Sparkles } from "lucide-react";

interface SystemAlert {
  id: number;
  severity: string;
  category: string;
  title: string;
  details: string | null;
  acknowledged: boolean;
  acknowledged_by: number | null;
  acknowledged_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function SeverityBadge({ severity }: { severity: string }) {
  switch (severity) {
    case "critical":
      return <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" /> Critical</Badge>;
    case "warning":
      return <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100"><AlertTriangle className="w-3 h-3" /> Warning</Badge>;
    default:
      return <Badge variant="secondary" className="gap-1"><Info className="w-3 h-3" /> Info</Badge>;
  }
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SystemAlertsPage() {
  usePageTitle("System Alerts");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ data: SystemAlert[]; unacknowledged_count: number }>({
    queryKey: ["/api/admin/alerts", severityFilter, categoryFilter, showAcknowledged],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (severityFilter !== "all") params.set("severity", severityFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (!showAcknowledged) params.set("acknowledged", "false");
      params.set("limit", "100");
      const res = await fetch(`/api/admin/alerts?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load alerts");
      return res.json();
    },
  });

  const acknowledge = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/alerts/${id}/acknowledge`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
      toast({ title: "Alert acknowledged" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to acknowledge", description: err.message, variant: "destructive" });
    },
  });

  const alerts = data?.data ?? [];
  const unackedCount = data?.unacknowledged_count ?? 0;

  /* Wave 12D — open the AI Copilot panel pre-loaded with this alert's
   * context as the first user message. The Copilot's specialized
   * ALERT_INVESTIGATION mode (server-side prompt) responds with a 1-2
   * sentence diagnosis + optional [BUTTON: …] marker that renders as a
   * "Run fix" CTA. The fix dispatch goes through /api/admin/alerts/run-fix
   * with a server-side action whitelist — no LLM-driven writes. */
  function investigateWithAI(alert: SystemAlert) {
    const meta = (alert.metadata ?? {}) as Record<string, unknown>;
    const serviceId = meta["client_service_id"] ?? meta["service_id"] ?? null;
    const clientId = meta["client_id"] ?? null;
    const seedLines = [
      `System alert detected: ${alert.category}`,
      alert.title ? `Title: ${alert.title}` : null,
      serviceId != null ? `Service ID: ${serviceId}` : null,
      clientId != null ? `Client ID: ${clientId}` : null,
      `Alert ID: ${alert.id}`,
      `Severity: ${alert.severity}`,
      alert.details ? `Error / details: ${alert.details.slice(0, 600)}` : null,
      `First occurred: ${alert.created_at}`,
      "",
      "Investigate this issue and recommend a fix.",
    ].filter((x): x is string => Boolean(x));
    const seedText = seedLines.join("\n");
    window.dispatchEvent(new CustomEvent("copilot:open", { detail: { seedText } }));
  }

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Shield className="w-5 h-5 shrink-0" />
              System Alerts
              {unackedCount > 0 && (
                <Badge variant="destructive" className="ml-1">{unackedCount}</Badge>
              )}
            </h2>
            <p className="text-sm text-muted-foreground">
              {alerts.length} alert{alerts.length !== 1 ? "s" : ""} shown
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="flex-1 min-w-[130px] sm:flex-none sm:w-[120px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="flex-1 min-w-[130px] sm:flex-none sm:w-[150px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="worker_failed">Worker Failed</SelectItem>
                <SelectItem value="stripe_error">Stripe Error</SelectItem>
                <SelectItem value="oauth_expiry">OAuth Expiry</SelectItem>
                <SelectItem value="email_failed">Email Failed</SelectItem>
                <SelectItem value="payment_at_risk">Payment at Risk</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={showAcknowledged ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowAcknowledged(!showAcknowledged)}
            >
              {showAcknowledged ? "Hide Acked" : "Show Acked"}
            </Button>
            {(severityFilter !== "all" || categoryFilter !== "all" || showAcknowledged) && (
              <button
                onClick={() => { setSeverityFilter("all"); setCategoryFilter("all"); setShowAcknowledged(false); }}
                className="text-xs text-muted-foreground hover:text-muted-foreground underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-4"><Skeleton className="h-16 w-full" /></Card>
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <Card className="p-8 text-center">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No alerts to show</p>
            <p className="text-sm text-muted-foreground">Everything is running smoothly</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <Card key={alert.id} className={`p-3 sm:p-4 ${alert.acknowledged ? "opacity-60" : ""}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <SeverityBadge severity={alert.severity} />
                      <Badge variant="outline" className="text-xs">{alert.category}</Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {timeAgo(alert.created_at)}
                      </span>
                    </div>
                    <p className="font-medium text-foreground text-sm">{alert.title}</p>
                    {alert.details && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">{alert.details}</p>
                    )}
                    {alert.acknowledged && alert.acknowledged_at && (
                      <p className="text-xs text-green-600 mt-1">
                        Acknowledged {timeAgo(alert.acknowledged_at)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                    {/* Wave 12D — opens the AI Copilot panel pre-loaded
                        with this alert's context. The Copilot diagnoses
                        and surfaces a whitelisted "Run fix" CTA when one
                        applies. Available even on acknowledged alerts so
                        the operator can investigate after the fact.
                        Mobile: actions sit on their own full-width row
                        below the body and split it evenly (flex-1); the
                        AI label shortens to "Investigate" so it fits one
                        line. */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => investigateWithAI(alert)}
                      data-testid={`button-investigate-alert-${alert.id}`}
                      className="gap-1 flex-1 sm:flex-none whitespace-nowrap"
                    >
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span className="sm:hidden">Investigate</span>
                      <span className="hidden sm:inline">Investigate with AI</span>
                    </Button>
                    {!alert.acknowledged && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => acknowledge.mutate(alert.id)}
                        disabled={acknowledge.isPending}
                        className="flex-1 sm:flex-none whitespace-nowrap"
                      >
                        Acknowledge
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
