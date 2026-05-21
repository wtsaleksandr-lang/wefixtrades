/**
 * W-AX-1 — Admin dashboard for the system-wide AI gates.
 *
 * One row per surface (SocialSync, MapGuard, ContentFlow, …) with its own
 * kill switch + monthly budget cap. A master "Disable ALL AI" button flips
 * every gate at once for emergencies.
 *
 * Backed by:
 *   GET    /api/admin/ai-gates
 *   POST   /api/admin/ai-gates/:surface/toggle-kill   { on }
 *   POST   /api/admin/ai-gates/global-kill            { on }
 *   PATCH  /api/admin/ai-gates/:surface/budget        { monthly_budget_cents }
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Loader2, ShieldOff, Save } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface GateRow {
  surface: string;
  label: string;
  kill_switch_on: boolean;
  monthly_budget_cents: number | null;
  monthly_spent_cents: number;
  monthly_reset_at: string | null;
  alert_threshold_pct: number;
  last_activity_at: string | null;
  budget_used_pct: number | null;
}

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatRelative(ts: string | null): string {
  if (!ts) return "never";
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export default function AdminAiGatesPage() {
  usePageTitle("AI Gates");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ gates: GateRow[] }>({
    queryKey: ["/api/admin/ai-gates"],
  });

  const toggleKill = useMutation({
    mutationFn: async ({ surface, on }: { surface: string; on: boolean }) =>
      apiRequest("POST", `/api/admin/ai-gates/${surface}/toggle-kill`, { on }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ai-gates"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const globalKill = useMutation({
    mutationFn: async (on: boolean) =>
      apiRequest("POST", `/api/admin/ai-gates/global-kill`, { on }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ai-gates"] });
      toast({ title: "Global kill switch updated" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const updateBudget = useMutation({
    mutationFn: async ({ surface, cents }: { surface: string; cents: number | null }) =>
      apiRequest("PATCH", `/api/admin/ai-gates/${surface}/budget`, {
        monthly_budget_cents: cents,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ai-gates"] });
      toast({ title: "Budget saved" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const allKilled = useMemo(
    () => (data?.gates || []).length > 0 && (data?.gates || []).every((g) => g.kill_switch_on),
    [data],
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">AI Surface Gates</h1>
            <p className="text-sm text-gray-500">
              System-wide kill switches + monthly spend caps for every AI surface in the product.
            </p>
          </div>
          <Button
            variant={allKilled ? "outline" : "destructive"}
            onClick={() => globalKill.mutate(!allKilled)}
            disabled={globalKill.isPending}
            data-testid="ai-gates-global-kill"
          >
            {globalKill.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ShieldOff className="w-4 h-4 mr-2" />
            )}
            {allKilled ? "Re-enable ALL AI" : "Disable ALL AI"}
          </Button>
        </div>

        <Card className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Surface</TableHead>
                  <TableHead>Kill switch</TableHead>
                  <TableHead>Monthly budget ($)</TableHead>
                  <TableHead>Spent</TableHead>
                  <TableHead>% used</TableHead>
                  <TableHead>Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.gates || []).map((g) => (
                  <GateRowEditor
                    key={g.surface}
                    row={g}
                    onToggleKill={(on) => toggleKill.mutate({ surface: g.surface, on })}
                    onSaveBudget={(dollars) =>
                      updateBudget.mutate({
                        surface: g.surface,
                        cents: dollars === null ? null : Math.round(dollars * 100),
                      })
                    }
                    pendingKill={toggleKill.isPending}
                    pendingBudget={updateBudget.isPending}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="p-4 bg-amber-50 border-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-medium mb-1">How it works</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  Each AI call site (SocialSync, MapGuard, etc.) calls
                  <code className="px-1 mx-1 bg-amber-100 rounded">aiGateAllowed(surface)</code>
                  before invoking the model.
                </li>
                <li>
                  When the kill switch is ON, the call throws a clear error
                  and the caller's fallback (text-only publish, queue, etc.)
                  takes over.
                </li>
                <li>
                  Successful calls increment <code>monthly_spent_cents</code>.
                  When a surface reaches its budget cap, new calls are
                  blocked until the 1st of next month or the cap is raised.
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}

function GateRowEditor({
  row,
  onToggleKill,
  onSaveBudget,
  pendingKill,
  pendingBudget,
}: {
  row: GateRow;
  onToggleKill: (on: boolean) => void;
  onSaveBudget: (dollars: number | null) => void;
  pendingKill: boolean;
  pendingBudget: boolean;
}) {
  const initialBudget =
    row.monthly_budget_cents == null ? "" : (row.monthly_budget_cents / 100).toFixed(2);
  const [draft, setDraft] = useState<string>(initialBudget);
  const dirty = draft !== initialBudget;

  const onSave = () => {
    if (draft.trim() === "") onSaveBudget(null);
    else {
      const n = Number(draft);
      if (Number.isFinite(n) && n >= 0) onSaveBudget(n);
    }
  };

  const pct = row.budget_used_pct;
  const overThreshold = pct != null && pct >= row.alert_threshold_pct;

  return (
    <TableRow data-testid={`ai-gate-row-${row.surface}`}>
      <TableCell className="font-medium">
        {row.label}
        <span className="block text-xs text-gray-400">{row.surface}</span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch
            checked={row.kill_switch_on}
            onCheckedChange={(v) => onToggleKill(!!v)}
            disabled={pendingKill}
            data-testid={`ai-gate-kill-${row.surface}`}
          />
          {row.kill_switch_on && (
            <Badge variant="destructive" className="text-xs">
              PAUSED
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="0.01"
            min={0}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="no cap"
            className="w-28"
            data-testid={`ai-gate-budget-${row.surface}`}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={onSave}
            disabled={!dirty || pendingBudget}
            data-testid={`ai-gate-save-${row.surface}`}
          >
            {pendingBudget ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Save className="w-3 h-3" />
            )}
          </Button>
        </div>
      </TableCell>
      <TableCell>{formatCents(row.monthly_spent_cents)}</TableCell>
      <TableCell>
        {pct == null ? (
          <span className="text-gray-400">—</span>
        ) : (
          <Badge variant={overThreshold ? "destructive" : "secondary"}>{pct}%</Badge>
        )}
      </TableCell>
      <TableCell className="text-sm text-gray-500">
        {formatRelative(row.last_activity_at)}
      </TableCell>
    </TableRow>
  );
}
