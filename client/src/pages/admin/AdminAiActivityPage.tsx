/**
 * Wave W-AV-1 — Business Operator AI activity console.
 *
 * Surfaces:
 *   1. Pending review     — escalated/pending rows with Approve / Reject.
 *   2. Playbook state     — per-playbook trust ladder + auto-execute toggle
 *                            (gated: only shows the toggle once
 *                            consecutive_approvals >= 3).
 *   3. Budget meter       — current month spent / cap with progress bar.
 *   4. History            — last-30d actions with status filter.
 *   5. Kill switch        — single button to halt the cron tick.
 *
 * Backed by /api/admin/ai-activity*. ESCALATE-ONLY for v1; every approval
 * walks one rung up the per-playbook trust ladder.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, Check, X, Power, AlertTriangle, RotateCw } from "lucide-react";
import AiResponseRating from "@/components/ai/AiResponseRating";

const UNLOCK_THRESHOLD = 3;

interface ActionRow {
  id: string;
  playbook: string;
  signal_id: string;
  status: string;
  severity: string;
  summary: string;
  detail: unknown;
  proposed_action: unknown;
  ai_reasoning: string | null;
  ai_model: string | null;
  ai_input_tokens: number | null;
  ai_output_tokens: number | null;
  ai_cost_cents: number | null;
  ai_last_error: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  executed_at: string | null;
}

interface PlaybookState {
  playbook: string;
  auto_enabled: boolean | null;
  consecutive_approvals: number | null;
  last_auto_executed_at: string | null;
  last_admin_action_at: string | null;
}

interface ListResponse {
  rows: ActionRow[];
  playbooks: PlaybookState[];
  kill_switch_on: boolean;
  statuses: string[];
  all_playbooks: string[];
}

interface BudgetResponse {
  month: string;
  spent_cents: number;
  cap_cents: number;
  alerts_sent: string[];
}

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  critical: "destructive",
};

function severityBadge(s: string) {
  return <Badge variant={SEVERITY_VARIANT[s] ?? "outline"}>{s}</Badge>;
}

function fmtCents(c: number): string {
  return `$${(c / 100).toFixed(2)}`;
}

export default function AdminAiActivityPage() {
  usePageTitle("AI Activity");
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("");

  const listKey = ["/api/admin/ai-activity", statusFilter];
  const { data, isLoading, isError, refetch } = useQuery<ListResponse>({
    queryKey: listKey,
    queryFn: async () => {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const res = await apiRequest("GET", `/api/admin/ai-activity${qs}`);
      return res.json();
    },
  });

  const budgetQuery = useQuery<BudgetResponse>({
    queryKey: ["/api/admin/ai-activity/budget"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/ai-activity/budget");
      return res.json();
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/ai-activity"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/ai-activity/budget"] });
  };

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/ai-activity/${id}/approve`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Approved", description: "Action executed." });
      invalidateAll();
    },
    onError: (e: any) => toast({ title: "Approve failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/ai-activity/${id}/reject`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rejected", description: "Trust ladder reset for this playbook." });
      invalidateAll();
    },
    onError: (e: any) => toast({ title: "Reject failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const toggleAutoMutation = useMutation({
    mutationFn: async (args: { playbook: string; enabled: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/ai-activity/playbook/${args.playbook}/toggle-auto`, {
        enabled: args.enabled,
      });
      return res.json();
    },
    onSuccess: () => invalidateAll(),
    onError: (e: any) => toast({ title: "Toggle failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const killSwitchMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("POST", "/api/admin/ai-activity/kill-switch", { enabled });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Kill switch updated" });
      invalidateAll();
    },
  });

  const pending = useMemo(
    () => (data?.rows ?? []).filter((r) => r.status === "pending" || r.status === "escalated"),
    [data?.rows],
  );
  const history = useMemo(
    () => (data?.rows ?? []).filter((r) => !(r.status === "pending" || r.status === "escalated")),
    [data?.rows],
  );

  const budgetPct = budgetQuery.data
    ? Math.min(100, Math.round((budgetQuery.data.spent_cents / Math.max(1, budgetQuery.data.cap_cents)) * 100))
    : 0;

  return (
    <AdminLayout>
      <div className="space-y-6" data-testid="page-admin-ai-activity">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">AI Activity</h1>
            <p className="text-sm text-muted-foreground">
              Business Operator AI — escalate-only by default; auto-execute unlocks per playbook after 3 approvals.
            </p>
          </div>
          <Button
            variant={data?.kill_switch_on ? "default" : "destructive"}
            onClick={() => {
              if (confirm("Toggle the Business Operator AI kill switch?")) {
                killSwitchMutation.mutate(!data?.kill_switch_on);
              }
            }}
            data-testid="button-kill-switch"
          >
            <Power className="w-4 h-4 mr-2" />
            {data?.kill_switch_on ? "Resume Business Operator AI" : "Disable Business Operator AI"}
          </Button>
        </div>

        {data?.kill_switch_on && (
          <Card className="p-4 border-destructive bg-destructive/5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              <span className="font-medium">Kill switch is ON — cron is paused.</span>
            </div>
          </Card>
        )}

        {isError && (
          <Card className="p-4 border-red-200 bg-red-50/50">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">Couldn't load AI activity</p>
                <p className="text-xs text-red-700 mt-1">Check your connection and try again.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RotateCw className="w-3.5 h-3.5 mr-1.5" />
                Retry
              </Button>
            </div>
          </Card>
        )}

        {/* Budget meter */}
        <Card className="p-4 space-y-2" data-testid="card-budget">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-medium">Budget — {budgetQuery.data?.month ?? "…"}</h2>
            <div className="text-sm text-muted-foreground">
              {budgetQuery.data
                ? `${fmtCents(budgetQuery.data.spent_cents)} / ${fmtCents(budgetQuery.data.cap_cents)} (${budgetPct}%)`
                : "—"}
            </div>
          </div>
          <Progress value={budgetPct} />
          {budgetQuery.data && budgetQuery.data.alerts_sent.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Alerts fired: {budgetQuery.data.alerts_sent.join(", ")}
            </div>
          )}
        </Card>

        {/* Playbook state */}
        <Card className="p-4 space-y-3" data-testid="card-playbooks">
          <h2 className="text-lg font-medium">Playbooks</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Playbook</TableHead>
                <TableHead>Consecutive approvals</TableHead>
                <TableHead>Auto-enabled</TableHead>
                <TableHead>Last admin action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.all_playbooks ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                    <ShieldAlert className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-700 mb-0.5">No AI playbooks registered</p>
                    <p className="text-xs">Playbooks appear here once the AI agent surfaces them for auto-execute review.</p>
                  </TableCell>
                </TableRow>
              ) : (data?.all_playbooks ?? []).map((pb) => {
                const state = data?.playbooks.find((p) => p.playbook === pb);
                const approvals = state?.consecutive_approvals ?? 0;
                const unlocked = approvals >= UNLOCK_THRESHOLD;
                const enabled = state?.auto_enabled === true;
                return (
                  <TableRow key={pb} data-testid={`row-playbook-${pb}`}>
                    <TableCell className="font-mono text-sm">{pb}</TableCell>
                    <TableCell>
                      {approvals} / {UNLOCK_THRESHOLD}
                      {unlocked && <Badge className="ml-2" variant="default">unlocked</Badge>}
                    </TableCell>
                    <TableCell>
                      {unlocked ? (
                        <Switch
                          checked={enabled}
                          onCheckedChange={(next) => {
                            if (next && !confirm(`I understand this enables auto-execute for ${pb}.`)) return;
                            toggleAutoMutation.mutate({ playbook: pb, enabled: next });
                          }}
                          data-testid={`switch-auto-${pb}`}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">Locked — approve {UNLOCK_THRESHOLD - approvals} more</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {state?.last_admin_action_at ? new Date(state.last_admin_action_at).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>

        {/* Pending review */}
        <Card className="p-4 space-y-3" data-testid="card-pending">
          <h2 className="text-lg font-medium">Pending review ({pending.length})</h2>
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded" />
              ))}
            </div>
          )}
          {!isLoading && pending.length === 0 && (
            <p className="text-sm text-muted-foreground">No pending actions — the AI is idle.</p>
          )}
          <div className="space-y-3">
            {pending.map((row) => (
              <Card key={row.id} className="p-3 space-y-2" data-testid={`row-pending-${row.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {severityBadge(row.severity)}
                    <Badge variant="outline">{row.playbook}</Badge>
                    <span className="text-sm truncate">{row.summary}</span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => approveMutation.mutate(row.id)}
                      disabled={approveMutation.isPending}
                      data-testid={`button-approve-${row.id}`}
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rejectMutation.mutate(row.id)}
                      disabled={rejectMutation.isPending}
                      data-testid={`button-reject-${row.id}`}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
                {row.ai_reasoning && (
                  <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                    <span className="font-medium">AI:</span> {row.ai_reasoning}
                  </div>
                )}
                {row.proposed_action ? (
                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                    {JSON.stringify(row.proposed_action, null, 2)}
                  </pre>
                ) : null}
                <AiResponseRating
                  responseId={`ai-action-${row.id}`}
                  surface="business_operator"
                />
              </Card>
            ))}
          </div>
        </Card>

        {/* History */}
        <Card className="p-4 space-y-3" data-testid="card-history">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">History</h2>
            <div className="flex gap-2">
              <select
                className="border rounded px-2 py-1 text-sm bg-background"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                data-testid="select-status-filter"
              >
                <option value="">All statuses</option>
                {(data?.statuses ?? []).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Playbook</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((r) => (
                <TableRow key={r.id} data-testid={`row-history-${r.id}`}>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{r.playbook}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm truncate max-w-md">{r.summary}</TableCell>
                  <TableCell className="text-xs">{fmtCents(r.ai_cost_cents ?? 0)}</TableCell>
                </TableRow>
              ))}
              {history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    <RotateCw className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-700 mb-0.5">No AI actions logged yet</p>
                    <p className="text-xs">Approvals, rejections, and auto-executed actions will appear here.</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AdminLayout>
  );
}
