/**
 * MapGuard Operations Tab — Admin client detail view
 *
 * Provides guided task flow for MapGuard service delivery.
 * Designed to be embedded as a tab in ClientDetailPage.
 *
 * Pattern: replicates TradeLine's Tasks tab structure with
 * MapGuard-specific status summary, task grouping, and guidance.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  MapPin, Plus, Wand2, AlertTriangle, Clock, Eye, Factory, Star,
  CheckCircle, ArrowRight, Shield, FileCheck, X, ChevronDown, ChevronUp,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  MapguardTaskCard,
  MapguardEmptyState,
  MapguardAllDoneState,
  MG_STATUS_COLORS,
  mgIsOverdue,
  type MapguardTaskItem,
} from "./MapguardTaskCard";

/* ─── Types ─── */
interface ExecutionUsage {
  used: number;
  limit: number;
  remaining: number;
  plan_label: string;
  at_limit: boolean;
  backlog_count: number;
  upgrade_recommended: boolean;
}

interface TaskSummary {
  total: number;
  pending: number;
  ready: number;
  in_progress: number;
  waiting_supplier: number;
  waiting_client: number;
  needs_review: number;
  blocked: number;
  completed: number;
  cancelled: number;
  overdue: number;
  execution: ExecutionUsage;
  last_client_activity: string | null;
  days_since_activity: number | null;
  next_recommended: {
    id: number;
    title: string;
    task_type: string;
    priority: string;
    next_step_hint: string | null;
  } | null;
}

interface TaskActivityItem {
  id: number;
  task_id: number;
  action: string;
  actor_type: string;
  actor_name: string | null;
  from_status: string | null;
  to_status: string | null;
  summary: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

const TASK_TYPES = [
  { value: "baseline_audit_review", label: "Audit Review" },
  { value: "gbp_optimization", label: "GBP Optimization" },
  { value: "citation_cleanup", label: "Citation Cleanup" },
  { value: "review_issue_response", label: "Review Response" },
  { value: "competitor_reaction", label: "Competitor Reaction" },
  { value: "profile_content_update", label: "Content Update" },
  { value: "photo_upload", label: "Photo Upload" },
  { value: "post_scheduling", label: "Post Scheduling" },
  { value: "suspension_support", label: "Suspension Support" },
  { value: "monthly_report_review", label: "Monthly Report" },
  { value: "manual_followup", label: "Manual Follow-up" },
];

const MG_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "upcoming", label: "Upcoming" },
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting_supplier", label: "Waiting Supplier" },
  { value: "waiting_client", label: "Waiting Client" },
  { value: "needs_review", label: "Needs Review" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

/* ─── Operational State Banner ─── */
function getOperationalState(summary: TaskSummary) {
  if (summary.total === 0) return { label: "No tasks", color: "bg-gray-50 text-gray-600 border-gray-200", icon: MapPin };
  if (summary.blocked > 0) return { label: "Blocked — needs attention", color: "bg-red-50 text-red-700 border-red-200", icon: AlertTriangle };
  if (summary.overdue > 0) return { label: `${summary.overdue} overdue`, color: "bg-red-50 text-red-700 border-red-200", icon: Clock };
  if (summary.needs_review > 0) return { label: "Review needed", color: "bg-purple-50 text-purple-700 border-purple-200", icon: Eye };
  if (summary.waiting_supplier > 0) return { label: "Waiting on supplier", color: "bg-amber-50 text-amber-700 border-amber-200", icon: Factory };
  if (summary.waiting_client > 0) return { label: "Waiting on client", color: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock };
  if (summary.in_progress > 0 || summary.ready > 0) return { label: "On track", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle };
  if (summary.completed === summary.total) return { label: "All complete", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle };
  if (summary.pending > 0) return { label: "Ready to start", color: "bg-blue-50 text-blue-700 border-blue-200", icon: ArrowRight };
  return { label: "On track", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle };
}

/* ─── Main Component ─── */
export default function MapguardOpsTab({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [showCreate, setShowCreate] = useState(false);
  const [showAuditGen, setShowAuditGen] = useState(false);
  const [detailTask, setDetailTask] = useState<MapguardTaskItem | null>(null);

  // ─── Queries ───
  const { data: tasks, isLoading: loadingTasks } = useQuery<MapguardTaskItem[]>({
    queryKey: [`/api/mapguard/clients/${clientId}/tasks`],
    queryFn: async () => {
      const res = await fetch(`/api/mapguard/clients/${clientId}/tasks?limit=100`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: summary } = useQuery<TaskSummary>({
    queryKey: [`/api/mapguard/clients/${clientId}/task-summary`],
    queryFn: async () => {
      const res = await fetch(`/api/mapguard/clients/${clientId}/task-summary`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: costData } = useQuery<{ total_cost_cents: number; task_count: number; avg_cost_cents: number; revenue_cents: number; margin_cents: number; margin_pct: number }>({
    queryKey: [`/api/mapguard/clients/${clientId}/costs`],
    queryFn: async () => {
      const res = await fetch(`/api/mapguard/clients/${clientId}/costs`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  // ─── Mutations ───
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/mapguard/tasks/${id}/status`, { status });
      return res.json();
    },
    onSuccess: (_data, { status }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/mapguard/clients/${clientId}/tasks`] });
      queryClient.invalidateQueries({ queryKey: [`/api/mapguard/clients/${clientId}/task-summary`] });
      toast({ title: "Task updated", description: `Moved to ${status.replace(/_/g, " ")}` });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message || "Invalid status transition", variant: "destructive" });
    },
  });

  const runScan = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/mapguard/clients/${clientId}/scan`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/mapguard/clients/${clientId}/tasks`] });
      queryClient.invalidateQueries({ queryKey: [`/api/mapguard/clients/${clientId}/task-summary`] });
      toast({
        title: "Scan complete",
        description: `Score ${data?.score ?? "—"}${data?.tasks_created ? ` · ${data.tasks_created} task(s) auto-created` : ""}`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Scan failed", description: err.message || "Try again", variant: "destructive" });
    },
  });

  // ─── Filtering & Grouping ───
  const filteredTasks = (tasks ?? []).filter((t) => {
    if (statusFilter === "open") return !["completed", "cancelled"].includes(t.status);
    if (statusFilter === "all") return true;
    return t.status === statusFilter;
  });

  const blocked = filteredTasks.filter((t) => t.status === "blocked");
  const overdue = filteredTasks.filter((t) => t.status !== "blocked" && mgIsOverdue(t.due_at, t.status));
  const needsReview = filteredTasks.filter((t) => t.status === "needs_review" && !mgIsOverdue(t.due_at, t.status));
  const waiting = filteredTasks.filter((t) => ["waiting_supplier", "waiting_client"].includes(t.status) && !mgIsOverdue(t.due_at, t.status));
  const active = filteredTasks.filter((t) => ["pending", "upcoming", "ready", "in_progress"].includes(t.status) && !mgIsOverdue(t.due_at, t.status));
  const done = filteredTasks.filter((t) => t.status === "completed");

  const sections = [
    { label: "Blocked", items: blocked, show: blocked.length > 0 },
    { label: "Overdue", items: overdue, show: overdue.length > 0 },
    { label: "Needs Review", items: needsReview, show: needsReview.length > 0 },
    { label: "Waiting", items: waiting, show: waiting.length > 0 },
    { label: "Active", items: active, show: active.length > 0 },
    { label: "Completed", items: done, show: statusFilter === "all" && done.length > 0 },
  ];

  const opState = summary ? getOperationalState(summary) : null;

  return (
    <div data-theme="light" className="space-y-3">
      {/* ─── Operational Summary ─── */}
      {summary && summary.total > 0 && (
        <Card className="p-4">
          {/* State banner */}
          {opState && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium mb-3 ${opState.color}`}>
              <opState.icon className="w-4 h-4 shrink-0" />
              {opState.label}
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { label: "Pending", value: summary.pending, key: "pending" },
              { label: "Ready", value: summary.ready + summary.in_progress, key: "ready" },
              { label: "Waiting", value: summary.waiting_supplier + summary.waiting_client, key: "waiting_supplier" },
              { label: "Review", value: summary.needs_review, key: "needs_review" },
              { label: "Blocked", value: summary.blocked, key: "blocked" },
              { label: "Done", value: summary.completed, key: "completed" },
            ].map((s) => (
              <div
                key={s.key}
                className={`text-center py-1.5 rounded-md cursor-default ${
                  s.value > 0 && s.key === "blocked" ? "bg-red-50" :
                  s.value > 0 && s.key === "needs_review" ? "bg-purple-50" :
                  s.value > 0 && s.key === "waiting_supplier" ? "bg-amber-50" :
                  "bg-gray-50"
                }`}
              >
                <p className="text-lg font-semibold text-gray-900">{s.value}</p>
                <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Execution usage */}
          {summary.execution && (
            <div className={`mt-3 px-3 py-2.5 rounded-lg border ${summary.execution.at_limit ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-700">
                  Execution: {summary.execution.used}/{summary.execution.limit} actions
                  <span className="text-gray-400 ml-1">({summary.execution.plan_label} plan)</span>
                </span>
                {summary.execution.upgrade_recommended ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">UPGRADE RECOMMENDED</span>
                ) : summary.execution.at_limit ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">LIMIT REACHED</span>
                ) : null}
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${summary.execution.at_limit ? "bg-amber-500" : "bg-brand-blue"}`}
                  style={{ width: `${Math.min(100, (summary.execution.used / summary.execution.limit) * 100)}%` }}
                />
              </div>
              {summary.execution.backlog_count > 0 && (
                <p className="text-[11px] text-gray-500 mt-1.5">{summary.execution.backlog_count} improvement{summary.execution.backlog_count !== 1 ? "s" : ""} waiting (blocked by plan limit)</p>
              )}
              {summary.execution.upgrade_recommended && (
                <p className="text-[11px] text-amber-600 mt-1">This client has more issues to fix than their current plan allows. Consider upgrading.</p>
              )}
            </div>
          )}

          {/* Cost & margin summary */}
          {costData && (costData.total_cost_cents > 0 || costData.revenue_cents > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600">
              {costData.revenue_cents > 0 && <span>Revenue: <span className="font-semibold text-gray-900">${(costData.revenue_cents / 100).toFixed(0)}/mo</span></span>}
              <span>Cost: <span className="font-semibold text-gray-900">${(costData.total_cost_cents / 100).toFixed(2)}</span></span>
              {costData.revenue_cents > 0 && (
                <span>Margin: <span className={`font-semibold ${costData.margin_pct >= 50 ? "text-emerald-600" : costData.margin_pct >= 20 ? "text-amber-600" : "text-red-600"}`}>${(costData.margin_cents / 100).toFixed(2)} ({costData.margin_pct}%)</span></span>
              )}
              <span>Avg: <span className="font-semibold">${(costData.avg_cost_cents / 100).toFixed(2)}</span>/task</span>
            </div>
          )}

          {/* Retention signal */}
          {summary.days_since_activity !== null && summary.days_since_activity > 7 && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span className="text-red-700 font-medium">Client has not seen recent activity ({summary.days_since_activity} days ago)</span>
            </div>
          )}
          {summary.last_client_activity && summary.days_since_activity !== null && summary.days_since_activity <= 7 && (
            <div className="mt-3 px-3 py-1.5 text-[11px] text-gray-400">
              Last activity shown to client: {new Date(summary.last_client_activity).toLocaleDateString("en-US", { month: "short", day: "numeric" })} ({summary.days_since_activity}d ago)
            </div>
          )}

          {/* Next recommended */}
          {summary.next_recommended && (
            <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-[#EEF3FF] border border-brand-blue/10">
              <ArrowRight className="w-3.5 h-3.5 text-brand-blue mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-brand-blue">Next: {summary.next_recommended.title}</p>
                {summary.next_recommended.next_step_hint && (
                  <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{summary.next_recommended.next_step_hint}</p>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ─── Header: filter + actions ─── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="needs_review">Needs Review</SelectItem>
              <SelectItem value="waiting_supplier">Waiting</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-gray-400">
            {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => runScan.mutate()}
            disabled={runScan.isPending}
          >
            <Eye className="w-3 h-3 mr-1" /> {runScan.isPending ? "Scanning…" : "Run Scan"}
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowAuditGen(true)}>
            <Wand2 className="w-3 h-3 mr-1" /> From Audit
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowCreate(true)}>
            <Plus className="w-3 h-3 mr-1" /> Add Task
          </Button>
        </div>
      </div>

      {/* ─── Task List ─── */}
      {loadingTasks ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4"><Skeleton className="h-12 w-full" /></Card>
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        statusFilter === "all" && (tasks ?? []).length > 0 && (tasks ?? []).every(t => t.status === "completed") ? (
          <MapguardAllDoneState />
        ) : (
          <MapguardEmptyState />
        )
      ) : (
        <div className="space-y-4">
          {sections.filter((s) => s.show).map((section) => (
            <div key={section.label}>
              <p className="text-xs font-medium text-gray-400 mb-1.5 px-0.5">
                {section.label} <span className="text-gray-300">({section.items.length})</span>
              </p>
              <div className="space-y-1.5">
                {section.items.map((task) => (
                  <MapguardTaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
                    onOpenDetail={setDetailTask}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Create Task Dialog ─── */}
      <CreateTaskDialog
        clientId={clientId}
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />

      {/* ─── Generate From Audit Dialog ─── */}
      <GenerateFromAuditDialog
        clientId={clientId}
        open={showAuditGen}
        onClose={() => setShowAuditGen(false)}
      />

      {/* ─── Task Detail Dialog ─── */}
      {detailTask && (
        <TaskDetailDialog
          task={detailTask}
          onClose={() => setDetailTask(null)}
          clientId={clientId}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   CREATE TASK DIALOG
   ═══════════════════════════════════════════ */
function CreateTaskDialog({
  clientId,
  open,
  onClose,
}: {
  clientId: number;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    task_type: "manual_followup",
    title: "",
    description: "",
    priority: "normal",
    next_step_hint: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/mapguard/clients/${clientId}/tasks`, {
        ...form,
        source_type: "manual",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/mapguard/clients/${clientId}/tasks`] });
      queryClient.invalidateQueries({ queryKey: [`/api/mapguard/clients/${clientId}/task-summary`] });
      toast({ title: "Task created" });
      setForm({ task_type: "manual_followup", title: "", description: "", priority: "normal", next_step_hint: "" });
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create MapGuard Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Task Type *</label>
            <Select value={form.task_type} onValueChange={(v) => setForm({ ...form, task_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Title *</label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Update business description"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Description</label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What needs to be done..."
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Priority</label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Next Step Hint</label>
            <Input
              value={form.next_step_hint}
              onChange={(e) => setForm({ ...form, next_step_hint: e.target.value })}
              placeholder="Guidance for what to do next..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!form.title.trim() || create.isPending}
            className="bg-brand-blue hover:bg-brand-blue-600"
          >
            {create.isPending ? "Creating..." : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════
   GENERATE FROM AUDIT DIALOG
   ═══════════════════════════════════════════ */
function GenerateFromAuditDialog({
  clientId,
  open,
  onClose,
}: {
  clientId: number;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [auditId, setAuditId] = useState("");

  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/mapguard/clients/${clientId}/tasks/from-audit/${auditId}`, {});
      return res.json();
    },
    onSuccess: (data: { created: number }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/mapguard/clients/${clientId}/tasks`] });
      queryClient.invalidateQueries({ queryKey: [`/api/mapguard/clients/${clientId}/task-summary`] });
      toast({ title: "Tasks generated", description: `${data.created} tasks created from audit` });
      setAuditId("");
      onClose();
    },
    onError: () => {
      toast({ title: "Generation failed", description: "Check that the audit report ID is valid", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Tasks from Audit</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Paste an audit report ID to automatically generate MapGuard tasks from the detected issues.
          </p>
          <div>
            <label className="text-xs font-medium text-gray-600">Audit Report ID *</label>
            <Input
              value={auditId}
              onChange={(e) => setAuditId(e.target.value.trim())}
              placeholder="e.g. 3f8a2b1c-..."
              className="font-mono text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => generate.mutate()}
            disabled={!auditId.trim() || generate.isPending}
            className="bg-brand-blue hover:bg-brand-blue-600"
          >
            {generate.isPending ? "Generating..." : "Generate Tasks"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════
   TASK DETAIL DIALOG (with assignment, result intake, reject)
   ═══════════════════════════════════════════ */
function TaskDetailDialog({
  task,
  onClose,
  clientId,
}: {
  task: MapguardTaskItem;
  onClose: () => void;
  clientId: number;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showInputData, setShowInputData] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  // Assignment state
  const [showAssign, setShowAssign] = useState(false);
  const [assignForm, setAssignForm] = useState({ supplier_type: "fiverr", assigned_to: "", supplier_ref: "", cost: "", handoff_notes: "" });
  const [recLoaded, setRecLoaded] = useState(false);
  // Result intake state
  const [showResult, setShowResult] = useState(false);
  const [resultForm, setResultForm] = useState({ summary: "", deliverable_type: "text", deliverable_url: "", deliverable_text: "", notes: "" });
  // Reject state
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectToSupplier, setRejectToSupplier] = useState(true);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/mapguard/clients/${clientId}/tasks`] });
    queryClient.invalidateQueries({ queryKey: [`/api/mapguard/clients/${clientId}/task-summary`] });
    queryClient.invalidateQueries({ queryKey: [`/api/mapguard/tasks/${task.id}`] });
  };

  const { data: detail } = useQuery<{ task: MapguardTaskItem; activity: TaskActivityItem[] }>({
    queryKey: [`/api/mapguard/tasks/${task.id}`],
    queryFn: async () => {
      const res = await fetch(`/api/mapguard/tasks/${task.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const changeStatus = useMutation({
    mutationFn: async (statusOverride?: string) => {
      const status = statusOverride || newStatus;
      const res = await apiRequest("PATCH", `/api/mapguard/tasks/${task.id}/status`, { status });
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Status updated" }); setNewStatus(""); },
    onError: (err: any) => { toast({ title: "Update failed", description: err.message, variant: "destructive" }); },
  });

  const assignTask = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/mapguard/tasks/${task.id}/assign`, {
        supplier_type: assignForm.supplier_type,
        assigned_to: assignForm.assigned_to,
        supplier_ref: assignForm.supplier_ref || undefined,
        cost_cents: assignForm.cost ? Math.round(parseFloat(assignForm.cost) * 100) : undefined,
        handoff_notes: assignForm.handoff_notes || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Task assigned", description: `Assigned to ${assignForm.assigned_to}` });
      setShowAssign(false);
      setAssignForm({ supplier_type: "fiverr", assigned_to: "", supplier_ref: "", cost: "", handoff_notes: "" });
    },
    onError: (err: any) => { toast({ title: "Assignment failed", description: err.message, variant: "destructive" }); },
  });

  const submitResult = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/mapguard/tasks/${task.id}/submit-result`, {
        summary: resultForm.summary,
        deliverable_type: resultForm.deliverable_type,
        deliverable_url: resultForm.deliverable_url || undefined,
        deliverable_text: resultForm.deliverable_text || undefined,
        notes: resultForm.notes || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Result submitted", description: "Task moved to review" });
      setShowResult(false);
      setResultForm({ summary: "", deliverable_type: "text", deliverable_url: "", deliverable_text: "", notes: "" });
    },
  });

  const rejectResult = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/mapguard/tasks/${task.id}/reject`, {
        reason: rejectReason,
        send_back_to_supplier: rejectToSupplier,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Result rejected", description: rejectToSupplier ? "Sent back to supplier" : "Returned for internal rework" });
      setShowReject(false);
      setRejectReason("");
    },
    onError: (err: any) => { toast({ title: "Reject failed", description: err.message, variant: "destructive" }); },
  });

  const t = detail?.task || task;
  const activity = detail?.activity || [];
  const isTerminal = ["completed", "cancelled"].includes(t.status);
  const isReviewable = t.status === "needs_review";
  const canAssign = ["ready", "in_progress", "pending"].includes(t.status);
  const canSubmitResult = ["in_progress", "waiting_supplier"].includes(t.status);
  const handoffNotes = (t.metadata as any)?.handoff_notes;
  const rejections = (t.result_data as any)?._rejections;

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base pr-6">{t.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status + meta row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${MG_STATUS_COLORS[t.status] || "bg-gray-100 text-gray-600"}`}>
              {t.status.replace(/_/g, " ")}
            </span>
            <span className="text-xs text-gray-400 capitalize">{t.task_type.replace(/_/g, " ")}</span>
            <span className="text-xs text-gray-400">Priority: <span className="capitalize font-medium">{t.priority}</span></span>
            {t.source_type && (
              <span className="text-xs text-gray-400">Source: <span className="capitalize">{t.source_type}</span></span>
            )}
          </div>

          {/* Description */}
          {t.description && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Description</p>
              <p className="text-sm text-gray-700">{t.description}</p>
            </div>
          )}

          {/* Next step hint */}
          {t.next_step_hint && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#EEF3FF] border border-brand-blue/10">
              <ArrowRight className="w-3.5 h-3.5 text-brand-blue mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-brand-blue">Next Step</p>
                <p className="text-xs text-gray-600 mt-0.5">{t.next_step_hint}</p>
              </div>
            </div>
          )}

          {/* ─── Supplier Assignment Block ─── */}
          {(t.supplier_type || t.assigned_to) && (
            <div className="px-3 py-2.5 rounded-lg bg-amber-50/50 border border-amber-200/50">
              <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
                <Factory className="w-3.5 h-3.5" />
                Assigned to {t.assigned_to}
                <span className="text-amber-600 font-normal">({t.supplier_type})</span>
              </p>
              {t.supplier_ref && (
                <p className="text-[11px] text-amber-600 mt-0.5 ml-5">Ref: {t.supplier_ref}</p>
              )}
              {t.cost_cents != null && (
                <p className="text-[11px] text-amber-600 ml-5">Cost: ${(t.cost_cents / 100).toFixed(2)}</p>
              )}
              {handoffNotes && (
                <p className="text-[11px] text-gray-600 mt-1 ml-5 italic">"{handoffNotes}"</p>
              )}
            </div>
          )}

          {/* Expected output */}
          {t.expected_output && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Expected Output</p>
              <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 overflow-x-auto">{JSON.stringify(t.expected_output, null, 2)}</pre>
            </div>
          )}

          {/* Validation rules */}
          {t.validation_rules && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Validation Rules</p>
              <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 overflow-x-auto">{JSON.stringify(t.validation_rules, null, 2)}</pre>
            </div>
          )}

          {/* Input data (collapsible) */}
          {t.input_data && (
            <div>
              <button
                onClick={() => setShowInputData(!showInputData)}
                className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                {showInputData ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Input Data ({Object.keys(t.input_data).length} fields)
              </button>
              {showInputData && (
                <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 mt-1 overflow-x-auto max-h-48">{JSON.stringify(t.input_data, null, 2)}</pre>
              )}
            </div>
          )}

          {/* ─── Result Data Block ─── */}
          {t.result_data && (
            <div className="px-3 py-2.5 rounded-lg bg-emerald-50/50 border border-emerald-200/50">
              <p className="text-xs font-medium text-emerald-800 flex items-center gap-1.5 mb-1">
                <FileCheck className="w-3.5 h-3.5" /> Result
              </p>
              {(t.result_data as any).summary && (
                <p className="text-sm text-gray-700">{(t.result_data as any).summary}</p>
              )}
              {(t.result_data as any).deliverable_url && (
                <p className="text-xs text-emerald-700 mt-1">
                  Link: <a href={(t.result_data as any).deliverable_url} target="_blank" rel="noopener noreferrer" className="underline">{(t.result_data as any).deliverable_url}</a>
                </p>
              )}
              {(t.result_data as any).deliverable_text && (
                <div className="mt-1 p-2 bg-white rounded text-xs text-gray-600 whitespace-pre-wrap">{(t.result_data as any).deliverable_text}</div>
              )}
              {(t.result_data as any).notes && (
                <p className="text-[11px] text-gray-500 mt-1 italic">{(t.result_data as any).notes}</p>
              )}
              {(t.result_data as any).submitted_by && (
                <p className="text-[11px] text-gray-400 mt-1">
                  Submitted by {(t.result_data as any).submitted_by} on {new Date((t.result_data as any).submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              )}
            </div>
          )}

          {/* Rejection history */}
          {rejections && rejections.length > 0 && (
            <div className="px-3 py-2 rounded-lg bg-red-50/50 border border-red-200/50">
              <p className="text-xs font-medium text-red-700 mb-1">Rejection History ({rejections.length})</p>
              {rejections.map((r: any, i: number) => (
                <div key={i} className="text-[11px] text-gray-600 mt-1">
                  <span className="text-red-600 font-medium">#{i + 1}</span> {r.reason}
                  <span className="text-gray-400 ml-1">— {r.rejected_by}, {new Date(r.rejected_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
              ))}
            </div>
          )}

          {/* ─── Action Buttons Row ─── */}
          {!isTerminal && (
            <div className="border-t border-gray-100 pt-3 space-y-3">
              {/* Quick action buttons */}
              <div className="flex flex-wrap gap-1.5">
                {canAssign && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={async () => {
                    if (!showAssign && !recLoaded) {
                      try {
                        const res = await fetch(`/api/mapguard/suppliers/recommend/${t.task_type}`, { credentials: "include" });
                        if (res.ok) {
                          const data = await res.json();
                          if (data.recommendation) {
                            setAssignForm({
                              supplier_type: data.recommendation.supplier_type || "fiverr",
                              assigned_to: data.recommendation.supplier_name || "",
                              supplier_ref: data.recommendation.ref_url || "",
                              cost: data.recommendation.suggested_cost_cents ? (data.recommendation.suggested_cost_cents / 100).toFixed(2) : "",
                              handoff_notes: data.recommendation.suggested_handoff_notes || "",
                            });
                          }
                        }
                      } catch { /* ignore */ }
                      setRecLoaded(true);
                    }
                    setShowAssign(!showAssign);
                  }}>
                    <Factory className="w-3 h-3 mr-1" /> {t.assigned_to ? "Reassign" : "Assign"}
                  </Button>
                )}
                {canSubmitResult && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowResult(!showResult)}>
                    <FileCheck className="w-3 h-3 mr-1" /> Submit Result
                  </Button>
                )}
                {isReviewable && (
                  <>
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => changeStatus.mutate("completed")}
                      disabled={changeStatus.isPending}
                    >
                      <CheckCircle className="w-3 h-3 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => setShowReject(!showReject)}>
                      <X className="w-3 h-3 mr-1" /> Reject
                    </Button>
                  </>
                )}
              </div>

              {/* ─── Assignment Form (collapsible) ─── */}
              {showAssign && (
                <div className="p-3 rounded-lg border border-gray-200 bg-gray-50/50 space-y-2">
                  <p className="text-xs font-medium text-gray-700">Assign to Supplier</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-gray-500">Type *</label>
                      <Select value={assignForm.supplier_type} onValueChange={(v) => setAssignForm({ ...assignForm, supplier_type: v })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fiverr" className="text-xs">Fiverr</SelectItem>
                          <SelectItem value="agency" className="text-xs">Agency</SelectItem>
                          <SelectItem value="internal" className="text-xs">Internal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-gray-500">Name *</label>
                      <Input className="h-7 text-xs" value={assignForm.assigned_to} onChange={(e) => setAssignForm({ ...assignForm, assigned_to: e.target.value })} placeholder="e.g. john_gbp_pro" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-gray-500">Reference</label>
                      <Input className="h-7 text-xs" value={assignForm.supplier_ref} onChange={(e) => setAssignForm({ ...assignForm, supplier_ref: e.target.value })} placeholder="Gig URL or ticket #" />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-gray-500">Cost ($)</label>
                      <Input className="h-7 text-xs" type="number" step="0.01" value={assignForm.cost} onChange={(e) => setAssignForm({ ...assignForm, cost: e.target.value })} placeholder="0.00" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Handoff Instructions</label>
                    <Textarea className="text-xs" rows={2} value={assignForm.handoff_notes} onChange={(e) => setAssignForm({ ...assignForm, handoff_notes: e.target.value })} placeholder="What should the supplier deliver..." />
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-brand-blue hover:bg-brand-blue-600"
                    disabled={!assignForm.assigned_to.trim() || assignTask.isPending}
                    onClick={() => assignTask.mutate()}
                  >
                    {assignTask.isPending ? "Assigning..." : "Assign & Send to Supplier"}
                  </Button>
                </div>
              )}

              {/* ─── Result Submission Form (collapsible) ─── */}
              {showResult && (
                <div className="p-3 rounded-lg border border-gray-200 bg-gray-50/50 space-y-2">
                  <p className="text-xs font-medium text-gray-700">Submit Deliverable</p>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Summary *</label>
                    <Input className="h-7 text-xs" value={resultForm.summary} onChange={(e) => setResultForm({ ...resultForm, summary: e.target.value })} placeholder="Brief description of what was delivered" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-gray-500">Deliverable Type</label>
                      <Select value={resultForm.deliverable_type} onValueChange={(v) => setResultForm({ ...resultForm, deliverable_type: v })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text" className="text-xs">Text / Copy</SelectItem>
                          <SelectItem value="link" className="text-xs">Link / URL</SelectItem>
                          <SelectItem value="report" className="text-xs">Report</SelectItem>
                          <SelectItem value="file" className="text-xs">File</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-gray-500">Link / URL</label>
                      <Input className="h-7 text-xs" value={resultForm.deliverable_url} onChange={(e) => setResultForm({ ...resultForm, deliverable_url: e.target.value })} placeholder="https://..." />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Deliverable Text</label>
                    <Textarea className="text-xs" rows={3} value={resultForm.deliverable_text} onChange={(e) => setResultForm({ ...resultForm, deliverable_text: e.target.value })} placeholder="Paste the deliverable content here..." />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Notes</label>
                    <Input className="h-7 text-xs" value={resultForm.notes} onChange={(e) => setResultForm({ ...resultForm, notes: e.target.value })} placeholder="Additional context..." />
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-brand-blue hover:bg-brand-blue-600"
                    disabled={!resultForm.summary.trim() || submitResult.isPending}
                    onClick={() => submitResult.mutate()}
                  >
                    {submitResult.isPending ? "Submitting..." : "Submit & Send to Review"}
                  </Button>
                </div>
              )}

              {/* ─── Reject Form (collapsible) ─── */}
              {showReject && isReviewable && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50/30 space-y-2">
                  <p className="text-xs font-medium text-red-700">Reject Result</p>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Reason *</label>
                    <Textarea className="text-xs" rows={2} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="What's wrong with the deliverable..." />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={rejectToSupplier} onChange={(e) => setRejectToSupplier(e.target.checked)} className="rounded border-gray-300" />
                    Send back to supplier for revision
                  </label>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-red-500 hover:bg-red-600 text-white"
                    disabled={!rejectReason.trim() || rejectResult.isPending}
                    onClick={() => rejectResult.mutate()}
                  >
                    {rejectResult.isPending ? "Rejecting..." : "Reject & Request Changes"}
                  </Button>
                </div>
              )}

              {/* Status change (fallback for any other transition) */}
              {!showAssign && !showResult && !showReject && (
                <div className="flex items-center gap-2">
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger className="flex-1 h-8 text-xs">
                      <SelectValue placeholder="Change status..." />
                    </SelectTrigger>
                    <SelectContent>
                      {MG_STATUSES.filter((s) => s.value !== t.status).map((s) => (
                        <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-brand-blue hover:bg-brand-blue-600"
                    disabled={!newStatus || changeStatus.isPending}
                    onClick={() => changeStatus.mutate(undefined)}
                  >
                    Update
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ─── Supplier Quality Feedback (completed tasks with supplier) ─── */}
          {t.status === "completed" && t.assigned_to && (
            <SupplierFeedback task={t} clientId={clientId} />
          )}

          {/* ─── Activity Log ─── */}
          {activity.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-medium text-gray-500 mb-2">Activity</p>
              <div className="space-y-2">
                {activity.map((a) => (
                  <div key={a.id} className="flex items-start gap-2 text-xs">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                      a.action === "assigned" ? "bg-amber-400" :
                      a.action === "result_submitted" ? "bg-emerald-400" :
                      a.action === "result_rejected" ? "bg-red-400" :
                      a.action === "status_changed" ? "bg-indigo-400" :
                      "bg-gray-300"
                    }`} />
                    <div className="min-w-0 flex-1">
                      <span className="text-gray-600">{a.summary || a.action}</span>
                      <span className="text-gray-400 ml-2">
                        {new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {a.actor_name && ` · ${a.actor_name}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════
   SUPPLIER QUALITY FEEDBACK
   ═══════════════════════════════════════════ */
function SupplierFeedback({ task, clientId }: { task: MapguardTaskItem; clientId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(!!(task.metadata as any)?.supplier_rating);
  const existingRating = (task.metadata as any)?.supplier_rating;

  const submit = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/mapguard/tasks/${task.id}`, {
        metadata: { ...(task.metadata as any || {}), supplier_rating: rating, supplier_feedback: note || undefined, rated_at: new Date().toISOString() },
      });
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: [`/api/mapguard/tasks/${task.id}`] });
      toast({ title: "Feedback saved" });
    },
  });

  if (submitted || existingRating) {
    const r = existingRating || rating;
    return (
      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs font-medium text-gray-500 mb-1">Supplier Rating</p>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(s => (
            <Star key={s} className={`w-4 h-4 ${s <= r ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />
          ))}
          <span className="text-xs text-gray-400 ml-1">{task.assigned_to}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100 pt-3">
      <p className="text-xs font-medium text-gray-500 mb-2">Rate supplier quality</p>
      <div className="flex items-center gap-1 mb-2">
        {[1, 2, 3, 4, 5].map(s => (
          <button key={s} type="button" onClick={() => setRating(s)} className="p-0.5">
            <Star className={`w-5 h-5 transition-colors ${s <= rating ? "text-amber-400 fill-amber-400" : "text-gray-300 hover:text-amber-300"}`} />
          </button>
        ))}
        {rating > 0 && <span className="text-xs text-gray-400 ml-1">{rating}/5</span>}
      </div>
      <div className="flex items-center gap-2">
        <Input className="h-7 text-xs flex-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note..." />
        <Button size="sm" className="h-7 text-xs bg-brand-blue hover:bg-brand-blue-600" disabled={rating === 0 || submit.isPending} onClick={() => submit.mutate()}>
          Save
        </Button>
      </div>
    </div>
  );
}
