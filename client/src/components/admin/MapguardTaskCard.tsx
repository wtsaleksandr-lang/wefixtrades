/**
 * MapGuard Task Card — Admin operations UI component
 *
 * Adapted from TaskCard pattern (TradeLine/CRM) for MapGuard's
 * extended status lifecycle, task types, and next-step guidance.
 */

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Clock, User, Factory, Bot, ArrowRight, MapPin,
  AlertTriangle, Zap, FileCheck, Eye,
} from "lucide-react";

/* ─── Types ─── */
export interface MapguardTaskItem {
  id: number;
  client_id: number;
  client_service_id: number | null;
  audit_report_id: string | null;
  task_type: string;
  title: string;
  description: string | null;
  source_type: string;
  created_by_system: boolean;
  status: string;
  priority: string;
  sort_order: number;
  waiting_on: string | null;
  next_step_hint: string | null;
  scheduled_for: string | null;
  due_at: string | null;
  completed_at: string | null;
  input_data: Record<string, any> | null;
  expected_output: Record<string, any> | null;
  validation_rules: Record<string, any> | null;
  result_data: Record<string, any> | null;
  supplier_type: string | null;
  supplier_ref: string | null;
  assigned_to: string | null;
  cost_cents: number | null;
  escalation_flag: boolean;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  client_name?: string | null;
}

/* ─── Constants ─── */
export const MG_STATUS_COLORS: Record<string, string> = {
  pending:          "bg-gray-100 text-gray-700",
  upcoming:         "bg-blue-50 text-blue-700",
  ready:            "bg-brand-blue-50 text-brand-blue-700",
  in_progress:      "bg-brand-blue-50 text-brand-blue-700",
  waiting_supplier: "bg-amber-50 text-amber-700",
  waiting_client:   "bg-amber-50 text-amber-700",
  needs_review:     "bg-brand-blue-50 text-brand-blue-700",
  blocked:          "bg-red-50 text-red-700",
  completed:        "bg-emerald-50 text-emerald-700",
  cancelled:        "bg-gray-100 text-gray-500",
};

const PRIORITY_BORDER: Record<string, string> = {
  urgent: "border-l-red-500",
  high: "border-l-amber-400",
  normal: "border-l-transparent",
  low: "border-l-transparent",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  baseline_audit_review: "Audit Review",
  gbp_optimization: "GBP Optimization",
  citation_cleanup: "Citation Cleanup",
  review_issue_response: "Review Response",
  competitor_reaction: "Competitor",
  profile_content_update: "Content Update",
  photo_upload: "Photos",
  post_scheduling: "Posts",
  suspension_support: "Suspension",
  monthly_report_review: "Monthly Report",
  manual_followup: "Follow-up",
};

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  audit: <FileCheck className="w-3 h-3" />,
  monitoring: <Eye className="w-3 h-3" />,
  manual: <User className="w-3 h-3" />,
  system: <Bot className="w-3 h-3" />,
};

const WAITING_ON_ICON: Record<string, React.ReactNode> = {
  client: <User className="w-3 h-3" />,
  supplier: <Factory className="w-3 h-3" />,
  internal: <MapPin className="w-3 h-3" />,
  system: <Bot className="w-3 h-3" />,
};

/* ─── Helpers ─── */
function MgStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${MG_STATUS_COLORS[status] || "bg-gray-100 text-gray-600"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeAgo(d: string | null): string | null {
  if (!d) return null;
  const now = Date.now();
  const then = new Date(d).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(d) ?? null;
}

export function mgIsOverdue(dueAt: string | null, status: string): boolean {
  if (!dueAt) return false;
  if (["completed", "cancelled"].includes(status)) return false;
  return new Date(dueAt) < new Date();
}

function getPrimaryAction(status: string): { label: string; nextStatus: string } | null {
  switch (status) {
    case "pending":          return { label: "Make Ready", nextStatus: "ready" };
    case "upcoming":         return { label: "Make Ready", nextStatus: "ready" };
    case "ready":            return { label: "Start",      nextStatus: "in_progress" };
    case "in_progress":      return { label: "Done",       nextStatus: "completed" };
    case "waiting_supplier": return { label: "Follow Up",  nextStatus: "in_progress" };
    case "waiting_client":   return { label: "Follow Up",  nextStatus: "in_progress" };
    case "needs_review":     return { label: "Approve",    nextStatus: "completed" };
    case "blocked":          return { label: "Unblock",    nextStatus: "ready" };
    default:                 return null;
  }
}

const ACTION_STYLES: Record<string, string> = {
  "Make Ready": "bg-brand-blue hover:bg-brand-blue-600 text-white",
  "Start":      "bg-brand-blue hover:bg-brand-blue-600 text-white",
  "Done":       "bg-emerald-600 hover:bg-emerald-700 text-white",
  "Follow Up":  "bg-amber-500 hover:bg-amber-600 text-white",
  "Approve":    "bg-brand-blue-600 hover:bg-brand-blue-700 text-white",
  "Unblock":    "bg-red-500 hover:bg-red-600 text-white",
};

/* ─── MapGuard Task Card ─── */
export function MapguardTaskCard({
  task,
  onStatusChange,
  onOpenDetail,
}: {
  task: MapguardTaskItem;
  onStatusChange: (id: number, status: string) => void;
  onOpenDetail?: (task: MapguardTaskItem) => void;
}) {
  const overdue = mgIsOverdue(task.due_at, task.status);
  const action = getPrimaryAction(task.status);
  const updated = timeAgo(task.updated_at || task.created_at);

  return (
    <Card className={`border-l-[3px] ${PRIORITY_BORDER[task.priority] || "border-l-transparent"} ${overdue ? "ring-1 ring-red-200 bg-red-50/30" : ""}`}>
      <div className="p-3.5">
        {/* Row 1: Title + action */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onOpenDetail?.(task)}
              className="text-sm font-medium text-gray-900 hover:text-brand-blue cursor-pointer line-clamp-2 text-left"
            >
              {task.title}
            </button>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenDetail && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
                onClick={() => onOpenDetail(task)}
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>
            )}
            {action && (
              <Button
                size="sm"
                className={`h-7 px-3 text-xs shrink-0 ${ACTION_STYLES[action.label] || "bg-gray-600 text-white"}`}
                onClick={(e) => {
                  e.preventDefault();
                  onStatusChange(task.id, action.nextStatus);
                }}
              >
                {action.label}
              </Button>
            )}
          </div>
        </div>

        {/* Row 2: Meta chips */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
          <MgStatusBadge status={task.status} />

          <span className="text-gray-400">{TASK_TYPE_LABELS[task.task_type] || task.task_type}</span>

          {task.waiting_on && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-600">
              {WAITING_ON_ICON[task.waiting_on]}
              <span className="capitalize">{task.waiting_on}</span>
            </span>
          )}

          {task.assigned_to && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200/50">
              <Factory className="w-3 h-3" />
              {task.assigned_to}
              {task.supplier_type && <span className="text-amber-500">({task.supplier_type})</span>}
            </span>
          )}

          {!task.assigned_to && task.supplier_type && (
            <span className="inline-flex items-center gap-1 text-gray-500">
              <Factory className="w-3 h-3" />
              <span className="capitalize">{task.supplier_type}</span>
            </span>
          )}

          {task.result_data && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">
              <FileCheck className="w-3 h-3" /> Result
            </span>
          )}

          {task.escalation_flag && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-600">
              <AlertTriangle className="w-3 h-3" /> Escalated
            </span>
          )}

          {task.due_at && (
            <span className={overdue ? "text-red-600 font-medium" : ""}>
              {overdue ? `Overdue ${fmtDate(task.due_at)}` : `Due ${fmtDate(task.due_at)}`}
            </span>
          )}

          {updated && (
            <span className="text-gray-400">
              <Clock className="w-3 h-3 inline mr-0.5 -mt-px" />{updated}
            </span>
          )}
        </div>

        {/* Row 3: Next step hint */}
        {task.next_step_hint && (
          <div className="mt-1.5 text-[11px] text-gray-500">
            <span className="inline-flex items-center gap-0.5">
              <ArrowRight className="w-3 h-3 text-gray-400" />
              <span className="line-clamp-2">Next: {task.next_step_hint}</span>
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ─── Empty States ─── */
export function MapguardEmptyState() {
  return (
    <div className="p-8 text-center">
      <MapPin className="w-8 h-8 text-gray-200 mx-auto mb-2" />
      <p className="text-sm text-gray-500">No MapGuard tasks yet.</p>
      <p className="text-xs text-gray-400 mt-0.5">Generate tasks from an audit report or create one manually.</p>
    </div>
  );
}

export function MapguardAllDoneState() {
  return (
    <div className="p-8 text-center">
      <Zap className="w-8 h-8 text-emerald-200 mx-auto mb-2" />
      <p className="text-sm text-emerald-700 font-medium">All tasks completed</p>
      <p className="text-xs text-gray-400 mt-0.5">This client's MapGuard tasks are up to date.</p>
    </div>
  );
}
