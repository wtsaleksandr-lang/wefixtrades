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
  MapPin, Plus, Wand2, AlertTriangle, Clock, Eye, Factory,
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
    <div className="space-y-3">
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

          {/* Next recommended */}
          {summary.next_recommended && (
            <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-[#F0F7F4] border border-[#2D6A4F]/10">
              <ArrowRight className="w-3.5 h-3.5 text-[#2D6A4F] mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#2D6A4F]">Next: {summary.next_recommended.title}</p>
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
            className="bg-[#2D6A4F] hover:bg-[#1B4332]"
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
            className="bg-[#2D6A4F] hover:bg-[#1B4332]"
          >
            {generate.isPending ? "Generating..." : "Generate Tasks"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════
   TASK DETAIL DIALOG
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
  const [resultText, setResultText] = useState("");

  // Fetch full task detail with activity
  const { data: detail } = useQuery<{ task: MapguardTaskItem; activity: TaskActivityItem[] }>({
    queryKey: [`/api/mapguard/tasks/${task.id}`],
    queryFn: async () => {
      const res = await fetch(`/api/mapguard/tasks/${task.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const changeStatus = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/mapguard/tasks/${task.id}/status`, { status: newStatus });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/mapguard/clients/${clientId}/tasks`] });
      queryClient.invalidateQueries({ queryKey: [`/api/mapguard/clients/${clientId}/task-summary`] });
      queryClient.invalidateQueries({ queryKey: [`/api/mapguard/tasks/${task.id}`] });
      toast({ title: "Status updated" });
      setNewStatus("");
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const attachResult = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/mapguard/tasks/${task.id}/result`, {
        result_data: { notes: resultText, attached_at: new Date().toISOString() },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/mapguard/clients/${clientId}/tasks`] });
      queryClient.invalidateQueries({ queryKey: [`/api/mapguard/tasks/${task.id}`] });
      toast({ title: "Result attached" });
      setResultText("");
    },
  });

  const t = detail?.task || task;
  const activity = detail?.activity || [];

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
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#F0F7F4] border border-[#2D6A4F]/10">
              <ArrowRight className="w-3.5 h-3.5 text-[#2D6A4F] mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-[#2D6A4F]">Next Step</p>
                <p className="text-xs text-gray-600 mt-0.5">{t.next_step_hint}</p>
              </div>
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

          {/* Result data */}
          {t.result_data && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                <FileCheck className="w-3 h-3 text-emerald-500" /> Result Data
              </p>
              <pre className="text-xs text-gray-600 bg-emerald-50 rounded p-2 overflow-x-auto">{JSON.stringify(t.result_data, null, 2)}</pre>
            </div>
          )}

          {/* Supplier info */}
          {(t.supplier_type || t.assigned_to || t.supplier_ref) && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
              {t.supplier_type && <span>Supplier: <span className="capitalize font-medium">{t.supplier_type}</span></span>}
              {t.assigned_to && <span>Assigned: <span className="font-medium">{t.assigned_to}</span></span>}
              {t.supplier_ref && <span>Ref: <span className="font-mono">{t.supplier_ref}</span></span>}
            </div>
          )}

          {/* ─── Actions ─── */}
          {!["completed", "cancelled"].includes(t.status) && (
            <div className="border-t border-gray-100 pt-3 space-y-3">
              {/* Status change */}
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
                  className="h-8 text-xs bg-[#2D6A4F] hover:bg-[#1B4332]"
                  disabled={!newStatus || changeStatus.isPending}
                  onClick={() => changeStatus.mutate()}
                >
                  Update
                </Button>
              </div>

              {/* Attach result */}
              <div>
                <label className="text-xs font-medium text-gray-500">Attach Result / Notes</label>
                <div className="flex items-start gap-2 mt-1">
                  <Textarea
                    value={resultText}
                    onChange={(e) => setResultText(e.target.value)}
                    placeholder="Describe what was delivered..."
                    rows={2}
                    className="text-xs flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs shrink-0"
                    disabled={!resultText.trim() || attachResult.isPending}
                    onClick={() => attachResult.mutate()}
                  >
                    <FileCheck className="w-3 h-3 mr-1" /> Attach
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ─── Activity Log ─── */}
          {activity.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-medium text-gray-500 mb-2">Activity</p>
              <div className="space-y-2">
                {activity.map((a) => (
                  <div key={a.id} className="flex items-start gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 shrink-0" />
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
