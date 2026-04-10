import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowRight, CheckCircle, Clock, AlertTriangle, Package, Zap, DollarSign,
  Play, Send, ShieldCheck, XCircle, Eye, Loader2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/* ─── Types ─── */
interface RankFlowProfile {
  id: number;
  client_id: number;
  niche: string | null;
  location: string | null;
  website_url: string | null;
  plan_tier: string;
  enabled: boolean;
}

interface RankFlowTask {
  id: number;
  client_id: number;
  plan_id: number;
  type: string;
  title: string;
  instructions: string | null;
  status: string;
  assigned_to: string | null;
  priority: string;
  execution_mode: string;
  vendor_type: string | null;
  qa_status: string | null;
  qa_notes: string | null;
  proof_data: any;
  estimated_cost: string | null;
  actual_cost: string | null;
  rejection_reason: string | null;
  batch_id: number | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

interface VendorBatch {
  id: number;
  vendor_type: string;
  assigned_to: string | null;
  batch_type: string;
  status: string;
  task_ids: number[];
  dispatch_packet: any;
  proof_data: any;
  qa_status: string | null;
  qa_notes: string | null;
  estimated_cost: string | null;
  actual_cost: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
}

/* ─── Guidance Logic ─── */

function getTaskNextStep(task: RankFlowTask): string {
  switch (task.status) {
    case "pending": return "Assign this task";
    case "assigned": return "Start work or hand to vendor";
    case "in_progress": return "Submit proof when done";
    case "submitted": return "Run QA now";
    case "qa_review":
      if (task.qa_status === "passed") return "Approve and mark done";
      if (task.qa_status === "failed") return "Reject and return for rework";
      return "Waiting for QA result";
    case "rejected": return "Fix issue and resubmit";
    case "done": return "Completed";
    default: return "";
  }
}

function getTaskHelpCue(task: RankFlowTask): string | null {
  if (task.execution_mode === "ai" && task.status === "pending") return "AI tasks can auto-complete via the weekly worker";
  if (task.execution_mode === "outsourced" && task.status === "pending") return "Add to a vendor batch for grouped dispatch";
  if (task.type === "citation_build") return "Requires proof URLs for each listing";
  if (task.status === "submitted") return "Check proof before running QA";
  if (task.status === "rejected") return "Review rejection reason, then resubmit with fixed proof";
  if (task.type === "schema_basic") return "Validate with Google Rich Results Test";
  return null;
}

function getBatchNextStep(batch: VendorBatch): string {
  switch (batch.status) {
    case "draft": return "Assign to a vendor";
    case "assigned": return "Vendor can start work";
    case "in_progress": return "Waiting for vendor submission";
    case "submitted": return "Run QA on linked tasks";
    case "qa_review": return "Approve successful tasks or fail batch";
    case "completed": return "Batch complete";
    case "failed": return "Review failed items and rebuild batch";
    default: return "";
  }
}

/* ─── Status Helpers ─── */

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  assigned: "bg-blue-50 text-blue-700",
  in_progress: "bg-indigo-50 text-indigo-700",
  submitted: "bg-amber-50 text-amber-700",
  qa_review: "bg-purple-50 text-purple-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  done: "bg-emerald-50 text-emerald-700",
  draft: "bg-gray-100 text-gray-600",
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${STATUS_COLORS[status] || "bg-gray-100 text-gray-600"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

const PRIORITY_BORDER: Record<string, string> = {
  high: "border-l-amber-400",
  normal: "border-l-transparent",
  low: "border-l-transparent",
};

function fmtCost(v: string | null | undefined): string {
  if (!v) return "-";
  const n = Number(v);
  return n === 0 ? "Free" : `$${n.toFixed(0)}`;
}

/* ─── Main Component ─── */

export default function RankFlowTab({ clientId }: { clientId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [`/api/rankflow/clients/${clientId}/tasks`] });
    qc.invalidateQueries({ queryKey: ["/api/rankflow/vendor-batches"] });
    qc.invalidateQueries({ queryKey: [`/api/rankflow/clients/${clientId}/profile`] });
  };

  // State
  const [submitDialogTask, setSubmitDialogTask] = useState<RankFlowTask | null>(null);
  const [proofUrls, setProofUrls] = useState("");
  const [proofNotes, setProofNotes] = useState("");
  const [assignDialogTask, setAssignDialogTask] = useState<RankFlowTask | null>(null);
  const [assignTo, setAssignTo] = useState("");
  const [rejectDialogTask, setRejectDialogTask] = useState<RankFlowTask | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [batchSubmitDialog, setBatchSubmitDialog] = useState<VendorBatch | null>(null);
  const [batchProofUrls, setBatchProofUrls] = useState("");
  const [batchProofNotes, setBatchProofNotes] = useState("");
  const [dispatchDialog, setDispatchDialog] = useState<VendorBatch | null>(null);
  const [batchAssignDialog, setBatchAssignDialog] = useState<VendorBatch | null>(null);
  const [batchAssignTo, setBatchAssignTo] = useState("");

  // Queries
  const { data: profile } = useQuery<RankFlowProfile>({
    queryKey: [`/api/rankflow/clients/${clientId}/profile`],
    retry: false,
  });

  const { data: tasks = [] } = useQuery<RankFlowTask[]>({
    queryKey: [`/api/rankflow/clients/${clientId}/tasks`],
  });

  const { data: batches = [] } = useQuery<VendorBatch[]>({
    queryKey: ["/api/rankflow/vendor-batches"],
  });

  const { data: profitability } = useQuery<{
    price: number; cost: number; margin: number; margin_percent: number;
    task_cost_breakdown: { citations: number; pages: number; onpage: number; other: number };
    over_ceiling: boolean; over_soft: boolean;
  }>({
    queryKey: [`/api/rankflow/clients/${clientId}/profitability`],
    enabled: !!profile?.enabled,
  });

  // Mutations
  const generatePlan = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/rankflow/clients/${clientId}/generate-plan`, {});
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Plan generated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const taskAction = useMutation({
    mutationFn: async ({ taskId, action, body }: { taskId: number; action: string; body?: any }) => {
      const res = await apiRequest("POST", `/api/rankflow/tasks/${taskId}/${action}`, body || {});
      return res.json();
    },
    onSuccess: () => { invalidate(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const batchAction = useMutation({
    mutationFn: async ({ batchId, action, body }: { batchId: number; action: string; body?: any }) => {
      const res = await apiRequest("POST", `/api/rankflow/vendor-batches/${batchId}/${action}`, body || {});
      return res.json();
    },
    onSuccess: () => { invalidate(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Computed
  const month = new Date().toISOString().slice(0, 7);
  const monthTasks = tasks.filter(t => t.created_at?.startsWith(month));
  const pending = monthTasks.filter(t => t.status === "pending");
  const inProgress = monthTasks.filter(t => ["assigned", "in_progress"].includes(t.status));
  const inQA = monthTasks.filter(t => ["submitted", "qa_review"].includes(t.status));
  const rejected = monthTasks.filter(t => t.status === "rejected");
  const done = monthTasks.filter(t => t.status === "done");
  const openBatches = batches.filter(b => !["completed", "failed"].includes(b.status));
  const estCost = monthTasks.reduce((s, t) => s + (Number(t.estimated_cost) || 0), 0);

  // Guidance banner
  function getGuidanceBanner(): { text: string; variant: "info" | "warning" | "success" } {
    if (!profile) return { text: "No RankFlow profile — create one to get started", variant: "warning" };
    if (!profile.enabled) return { text: "RankFlow is disabled for this client", variant: "warning" };
    if (monthTasks.length === 0) return { text: "No plan this month — generate one to start", variant: "info" };
    if (rejected.length > 0) return { text: `${rejected.length} task(s) rejected — fix and resubmit`, variant: "warning" };
    if (pending.length > 0 && pending.some(t => t.execution_mode === "outsourced")) return { text: `${pending.filter(t => t.execution_mode === "outsourced").length} outsourced task(s) need batching/assignment`, variant: "info" };
    if (inQA.length > 0) return { text: `${inQA.length} task(s) awaiting QA review`, variant: "info" };
    if (done.length === monthTasks.length) return { text: "This month is complete", variant: "success" };
    return { text: `${inProgress.length} task(s) in progress, ${pending.length} pending`, variant: "info" };
  }

  const guidance = getGuidanceBanner();
  const BANNER_STYLES = {
    info: "bg-blue-50 border-blue-200 text-blue-800",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
    success: "bg-emerald-50 border-emerald-200 text-emerald-800",
  };

  // No profile state
  if (!profile) {
    return (
      <div className="space-y-4">
        <Card className="p-6 text-center">
          <p className="text-sm text-gray-500 mb-3">No RankFlow profile for this client yet.</p>
          <Button
            size="sm"
            className="bg-[#2D6A4F] hover:bg-[#1B4332] text-white"
            onClick={async () => {
              await apiRequest("PUT", `/api/rankflow/clients/${clientId}/profile`, { plan_tier: "starter", enabled: false });
              invalidate();
              toast({ title: "Profile created" });
            }}
          >
            Create RankFlow Profile
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ─── Guidance Banner ─── */}
      <div className={`px-4 py-2.5 rounded-lg border text-sm font-medium ${BANNER_STYLES[guidance.variant]}`}>
        <ArrowRight className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
        {guidance.text}
      </div>

      {/* ─── Metrics Row ─── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[
          { label: "Pending", value: pending.length, icon: Clock },
          { label: "In Progress", value: inProgress.length, icon: Play },
          { label: "In QA", value: inQA.length, icon: ShieldCheck },
          { label: "Rejected", value: rejected.length, icon: XCircle },
          { label: "Done", value: done.length, icon: CheckCircle },
          { label: "Est. Cost", value: `$${estCost}`, icon: DollarSign },
        ].map(m => (
          <Card key={m.label} className="p-2.5 text-center">
            <m.icon className="w-3.5 h-3.5 mx-auto text-gray-400 mb-1" />
            <p className="text-lg font-semibold text-gray-900">{m.value}</p>
            <p className="text-[10px] text-gray-500">{m.label}</p>
          </Card>
        ))}
      </div>

      {/* ─── Profitability ─── */}
      {profitability && (
        <Card className="p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-semibold text-gray-700">Monthly Profitability</span>
            {profitability.over_ceiling && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">Over ceiling</span>}
            {!profitability.over_ceiling && profitability.over_soft && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">Over soft limit</span>}
          </div>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-sm font-semibold text-gray-900">${profitability.price}</p>
              <p className="text-[10px] text-gray-500">Plan Price</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">${profitability.cost.toFixed(0)}</p>
              <p className="text-[10px] text-gray-500">Total Cost</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">${profitability.margin.toFixed(0)}</p>
              <p className="text-[10px] text-gray-500">Margin</p>
            </div>
            <div>
              <p className={`text-sm font-semibold ${profitability.margin_percent >= 70 ? "text-emerald-600" : profitability.margin_percent >= 50 ? "text-amber-600" : "text-red-600"}`}>
                {profitability.margin_percent}%
              </p>
              <p className="text-[10px] text-gray-500">Margin %</p>
            </div>
          </div>
          {(profitability.task_cost_breakdown.citations > 0 || profitability.task_cost_breakdown.pages > 0 || profitability.task_cost_breakdown.onpage > 0) && (
            <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
              {profitability.task_cost_breakdown.citations > 0 && <span>Citations: ${profitability.task_cost_breakdown.citations.toFixed(0)}</span>}
              {profitability.task_cost_breakdown.pages > 0 && <span>Pages: ${profitability.task_cost_breakdown.pages.toFixed(0)}</span>}
              {profitability.task_cost_breakdown.onpage > 0 && <span>On-page: ${profitability.task_cost_breakdown.onpage.toFixed(0)}</span>}
              {profitability.task_cost_breakdown.other > 0 && <span>Other: ${profitability.task_cost_breakdown.other.toFixed(0)}</span>}
            </div>
          )}
        </Card>
      )}

      {/* ─── Actions Row ─── */}
      <div className="flex gap-2 flex-wrap">
        {profile.enabled && monthTasks.length === 0 && (
          <Button
            size="sm"
            className="bg-[#2D6A4F] hover:bg-[#1B4332] text-white"
            onClick={() => generatePlan.mutate()}
            disabled={generatePlan.isPending}
          >
            {generatePlan.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
            Generate Plan
          </Button>
        )}
      </div>

      {/* ─── Task Groups ─── */}
      {monthTasks.length > 0 && (
        <div className="space-y-3">
          <TaskGroup title="Needs Attention" tasks={[...rejected, ...pending]} onAction={(id, action, body) => taskAction.mutate({ taskId: id, action, body })} onAssign={t => { setAssignDialogTask(t); setAssignTo(""); }} onSubmit={t => { setSubmitDialogTask(t); setProofUrls(""); setProofNotes(""); }} onReject={t => { setRejectDialogTask(t); setRejectReason(""); }} />
          <TaskGroup title="In Progress" tasks={inProgress} onAction={(id, action, body) => taskAction.mutate({ taskId: id, action, body })} onAssign={t => { setAssignDialogTask(t); setAssignTo(""); }} onSubmit={t => { setSubmitDialogTask(t); setProofUrls(""); setProofNotes(""); }} onReject={t => { setRejectDialogTask(t); setRejectReason(""); }} />
          <TaskGroup title="Awaiting QA" tasks={inQA} onAction={(id, action, body) => taskAction.mutate({ taskId: id, action, body })} onAssign={t => { setAssignDialogTask(t); setAssignTo(""); }} onSubmit={t => { setSubmitDialogTask(t); setProofUrls(""); setProofNotes(""); }} onReject={t => { setRejectDialogTask(t); setRejectReason(""); }} />
          <TaskGroup title="Completed" tasks={done} collapsed onAction={(id, action, body) => taskAction.mutate({ taskId: id, action, body })} onAssign={t => { setAssignDialogTask(t); setAssignTo(""); }} onSubmit={t => { setSubmitDialogTask(t); setProofUrls(""); setProofNotes(""); }} onReject={t => { setRejectDialogTask(t); setRejectReason(""); }} />
        </div>
      )}

      {/* ─── Vendor Batches ─── */}
      {openBatches.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
            <Package className="w-4 h-4 text-gray-400" /> Vendor Batches ({openBatches.length})
          </h3>
          <div className="space-y-2">
            {openBatches.map(b => (
              <Card key={b.id} className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 capitalize">{b.batch_type} — {b.vendor_type}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
                      <StatusBadge status={b.status} />
                      <span>{(b.task_ids as number[]).length} tasks</span>
                      {b.assigned_to && <span>Assigned: {b.assigned_to}</span>}
                      <span>Est: {fmtCost(b.estimated_cost)}</span>
                      {b.actual_cost && <span>Actual: {fmtCost(b.actual_cost)}</span>}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      <ArrowRight className="w-3 h-3 inline mr-0.5" /> {getBatchNextStep(b)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {b.status === "draft" && (
                      <Button size="sm" className="h-7 px-2 text-xs bg-[#2D6A4F] hover:bg-[#1B4332] text-white" onClick={() => { setBatchAssignDialog(b); setBatchAssignTo(""); }}>
                        Assign
                      </Button>
                    )}
                    {b.status === "assigned" && (
                      <Button size="sm" className="h-7 px-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => batchAction.mutate({ batchId: b.id, action: "start" })}>
                        Start
                      </Button>
                    )}
                    {b.status === "in_progress" && (
                      <Button size="sm" className="h-7 px-2 text-xs bg-amber-500 hover:bg-amber-600 text-white" onClick={() => { setBatchSubmitDialog(b); setBatchProofUrls(""); setBatchProofNotes(""); }}>
                        Submit
                      </Button>
                    )}
                    {b.status === "submitted" && (
                      <Button size="sm" className="h-7 px-2 text-xs bg-purple-600 hover:bg-purple-700 text-white" onClick={() => batchAction.mutate({ batchId: b.id, action: "qa" })}>
                        Run QA
                      </Button>
                    )}
                    {b.status === "qa_review" && (
                      <>
                        <Button size="sm" className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => batchAction.mutate({ batchId: b.id, action: "complete" })}>
                          Complete
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600 border-red-200" onClick={() => batchAction.mutate({ batchId: b.id, action: "fail", body: { reason: "QA failed" } })}>
                          Fail
                        </Button>
                      </>
                    )}
                    {b.dispatch_packet && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setDispatchDialog(b)}>
                        <Eye className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ─── Assign Task Dialog ─── */}
      <Dialog open={!!assignDialogTask} onOpenChange={() => setAssignDialogTask(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Assign Task</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 mb-2">{assignDialogTask?.title}</p>
          <Input placeholder="Assign to (name or vendor)" value={assignTo} onChange={e => setAssignTo(e.target.value)} />
          <Button className="w-full mt-2 bg-[#2D6A4F] hover:bg-[#1B4332] text-white" disabled={!assignTo.trim()} onClick={() => {
            if (assignDialogTask) {
              taskAction.mutate({ taskId: assignDialogTask.id, action: "assign", body: { assigned_to: assignTo.trim() } });
              setAssignDialogTask(null);
            }
          }}>Assign</Button>
        </DialogContent>
      </Dialog>

      {/* ─── Submit Proof Dialog ─── */}
      <Dialog open={!!submitDialogTask} onOpenChange={() => setSubmitDialogTask(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Submit Proof</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 mb-2">{submitDialogTask?.title}</p>
          <Input placeholder="Proof URLs (comma-separated)" value={proofUrls} onChange={e => setProofUrls(e.target.value)} />
          <Textarea placeholder="Notes" rows={3} value={proofNotes} onChange={e => setProofNotes(e.target.value)} className="mt-2" />
          <Button className="w-full mt-2 bg-amber-500 hover:bg-amber-600 text-white" onClick={() => {
            if (submitDialogTask) {
              taskAction.mutate({
                taskId: submitDialogTask.id,
                action: "submit",
                body: { proof_data: { urls: proofUrls.split(",").map(s => s.trim()).filter(Boolean), notes: proofNotes } },
              });
              setSubmitDialogTask(null);
            }
          }}>Submit</Button>
        </DialogContent>
      </Dialog>

      {/* ─── Reject Dialog ─── */}
      <Dialog open={!!rejectDialogTask} onOpenChange={() => setRejectDialogTask(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reject Task</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 mb-2">{rejectDialogTask?.title}</p>
          <Textarea placeholder="Rejection reason" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
          <Button className="w-full mt-2 bg-red-500 hover:bg-red-600 text-white" disabled={!rejectReason.trim()} onClick={() => {
            if (rejectDialogTask) {
              taskAction.mutate({ taskId: rejectDialogTask.id, action: "reject", body: { rejection_reason: rejectReason.trim() } });
              setRejectDialogTask(null);
            }
          }}>Reject</Button>
        </DialogContent>
      </Dialog>

      {/* ─── Batch Assign Dialog ─── */}
      <Dialog open={!!batchAssignDialog} onOpenChange={() => setBatchAssignDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Assign Batch</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 mb-2">{batchAssignDialog?.batch_type} — {(batchAssignDialog?.task_ids as number[])?.length} tasks</p>
          <Input placeholder="Vendor name" value={batchAssignTo} onChange={e => setBatchAssignTo(e.target.value)} />
          <Button className="w-full mt-2 bg-[#2D6A4F] hover:bg-[#1B4332] text-white" disabled={!batchAssignTo.trim()} onClick={() => {
            if (batchAssignDialog) {
              batchAction.mutate({ batchId: batchAssignDialog.id, action: "assign", body: { assigned_to: batchAssignTo.trim() } });
              setBatchAssignDialog(null);
            }
          }}>Assign</Button>
        </DialogContent>
      </Dialog>

      {/* ─── Batch Submit Dialog ─── */}
      <Dialog open={!!batchSubmitDialog} onOpenChange={() => setBatchSubmitDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Submit Batch Proof</DialogTitle></DialogHeader>
          <Input placeholder="Proof URLs (comma-separated)" value={batchProofUrls} onChange={e => setBatchProofUrls(e.target.value)} />
          <Textarea placeholder="Notes" rows={3} value={batchProofNotes} onChange={e => setBatchProofNotes(e.target.value)} className="mt-2" />
          <Button className="w-full mt-2 bg-amber-500 hover:bg-amber-600 text-white" onClick={() => {
            if (batchSubmitDialog) {
              batchAction.mutate({
                batchId: batchSubmitDialog.id,
                action: "submit",
                body: { proof_data: { urls: batchProofUrls.split(",").map(s => s.trim()).filter(Boolean), notes: batchProofNotes } },
              });
              setBatchSubmitDialog(null);
            }
          }}>Submit</Button>
        </DialogContent>
      </Dialog>

      {/* ─── Dispatch Packet Dialog ─── */}
      <Dialog open={!!dispatchDialog} onOpenChange={() => setDispatchDialog(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Dispatch Packet</DialogTitle></DialogHeader>
          <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(dispatchDialog?.dispatch_packet, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Task Group ─── */

function TaskGroup({
  title, tasks, collapsed: defaultCollapsed, onAction, onAssign, onSubmit, onReject,
}: {
  title: string;
  tasks: RankFlowTask[];
  collapsed?: boolean;
  onAction: (id: number, action: string, body?: any) => void;
  onAssign: (t: RankFlowTask) => void;
  onSubmit: (t: RankFlowTask) => void;
  onReject: (t: RankFlowTask) => void;
}) {
  const [open, setOpen] = useState(!defaultCollapsed);
  if (tasks.length === 0) return null;

  return (
    <div>
      <button type="button" className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1.5 hover:text-gray-900" onClick={() => setOpen(!open)}>
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>&#9654;</span>
        {title} ({tasks.length})
      </button>
      {open && (
        <div className="space-y-2">
          {tasks.map(t => (
            <RankFlowTaskCard key={t.id} task={t} onAction={onAction} onAssign={onAssign} onSubmit={onSubmit} onReject={onReject} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Task Card ─── */

function RankFlowTaskCard({
  task: t, onAction, onAssign, onSubmit, onReject,
}: {
  task: RankFlowTask;
  onAction: (id: number, action: string, body?: any) => void;
  onAssign: (t: RankFlowTask) => void;
  onSubmit: (t: RankFlowTask) => void;
  onReject: (t: RankFlowTask) => void;
}) {
  const nextStep = getTaskNextStep(t);
  const helpCue = getTaskHelpCue(t);

  return (
    <Card className={`border-l-[3px] ${PRIORITY_BORDER[t.priority] || "border-l-transparent"}`}>
      <div className="p-3">
        {/* Row 1: Title + Action */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-gray-900 line-clamp-2">{t.title}</p>
          <div className="flex gap-1 shrink-0">
            {t.status === "pending" && (
              <Button size="sm" className="h-7 px-2 text-xs bg-[#2D6A4F] hover:bg-[#1B4332] text-white" onClick={() => onAssign(t)}>Assign</Button>
            )}
            {t.status === "assigned" && (
              <Button size="sm" className="h-7 px-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => onAction(t.id, "start")}>Start</Button>
            )}
            {t.status === "in_progress" && (
              <Button size="sm" className="h-7 px-2 text-xs bg-amber-500 hover:bg-amber-600 text-white" onClick={() => onSubmit(t)}>Submit</Button>
            )}
            {t.status === "submitted" && (
              <Button size="sm" className="h-7 px-2 text-xs bg-purple-600 hover:bg-purple-700 text-white" onClick={() => onAction(t.id, "qa")}>Run QA</Button>
            )}
            {t.status === "qa_review" && t.qa_status === "passed" && (
              <Button size="sm" className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onAction(t.id, "approve")}>Approve</Button>
            )}
            {t.status === "qa_review" && t.qa_status === "failed" && (
              <Button size="sm" className="h-7 px-2 text-xs bg-red-500 hover:bg-red-600 text-white" onClick={() => onReject(t)}>Reject</Button>
            )}
            {t.status === "rejected" && (
              <Button size="sm" className="h-7 px-2 text-xs bg-amber-500 hover:bg-amber-600 text-white" onClick={() => onSubmit(t)}>Resubmit</Button>
            )}
          </div>
        </div>

        {/* Row 2: Meta badges */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5 text-xs text-gray-500">
          <StatusBadge status={t.status} />
          <span className="capitalize text-gray-400">{t.type.replace(/_/g, " ")}</span>
          <span className={`capitalize ${t.execution_mode === "outsourced" ? "text-amber-600" : t.execution_mode === "ai" ? "text-blue-600" : "text-gray-500"}`}>
            {t.execution_mode === "ai" ? "AI" : t.execution_mode}
          </span>
          {t.assigned_to && <span>Assigned: {t.assigned_to}</span>}
          {t.vendor_type && <span className="text-amber-500">{t.vendor_type}</span>}
          <span>{fmtCost(t.estimated_cost)}</span>
          {t.batch_id && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Batch #{t.batch_id}</Badge>}
        </div>

        {/* Row 3: QA / rejection info */}
        {t.qa_status === "failed" && t.qa_notes && (
          <p className="text-[11px] text-red-600 mt-1"><AlertTriangle className="w-3 h-3 inline mr-0.5" />QA: {t.qa_notes}</p>
        )}
        {t.rejection_reason && (
          <p className="text-[11px] text-red-600 mt-1"><XCircle className="w-3 h-3 inline mr-0.5" />Rejected: {t.rejection_reason}</p>
        )}

        {/* Row 4: Guidance */}
        {t.status !== "done" && (
          <div className="mt-1.5 text-[11px] text-gray-400">
            <ArrowRight className="w-3 h-3 inline mr-0.5" /> {nextStep}
            {helpCue && <span className="ml-2 text-gray-300">— {helpCue}</span>}
          </div>
        )}
      </div>
    </Card>
  );
}
