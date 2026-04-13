import { useState } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Inbox, Play, MessageSquare, CheckCircle, Clock, User, Factory, Wrench, Bot, Zap, ArrowRight, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

/* ─── Types ─── */
export interface TaskItem {
  id: number;
  title: string;
  status: string;
  priority: string;
  waiting_on: string | null;
  handled_by: string | null;
  automation_status: string | null;
  last_action: string | null;
  next_action: string | null;
  last_action_at: string | null;
  client_id: number;
  client_name?: string | null;
  supplier_id: number | null;
  supplier_name?: string | null;
  service_name?: string | null;
  due_at: string | null;
  updated_at: string | null;
  created_at: string;
}

/* ─── Helpers ─── */
const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-50 text-blue-700",
  in_progress: "bg-indigo-50 text-indigo-700",
  waiting: "bg-amber-50 text-amber-700",
  blocked: "bg-red-50 text-red-700",
  delivered: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const PRIORITY_BORDER: Record<string, string> = {
  urgent: "border-l-red-500",
  high: "border-l-amber-400",
  normal: "border-l-transparent",
  low: "border-l-transparent",
};

const WAITING_ON_ICON: Record<string, React.ReactNode> = {
  client: <User className="w-3 h-3" />,
  supplier: <Factory className="w-3 h-3" />,
  internal: <Wrench className="w-3 h-3" />,
};

const TASK_STATUSES = [
  { value: "not_started", label: "Not Started" },
  { value: "submitted", label: "Submitted" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting", label: "Waiting" },
  { value: "blocked", label: "Blocked" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${STATUS_COLORS[status] || "bg-gray-100 text-gray-600"}`}>
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

export function isOverdue(dueAt: string | null, status: string): boolean {
  if (!dueAt) return false;
  if (["delivered", "cancelled"].includes(status)) return false;
  return new Date(dueAt) < new Date();
}

/* ─── Automation type detection (mirrors server-side patterns) ─── */
const AUTO_PATTERNS = [
  "Configure TradeLine assistant",
  "Configure notifications",
  "Configure lead notifications",
  "Configure notifications + callback flow",
];
const ASSIST_PATTERNS = [
  "Prepare widget or hosted fallback",
  "Prepare website widget or hosted fallback",
  "Install widget / provision hosted link",
  "Configure phone routing",
];

function getAutomationType(title: string): "auto" | "assist" | "manual" {
  const clean = title.replace(/^\[\d{4}-\d{2}\]\s*/, "");
  for (const p of AUTO_PATTERNS) {
    if (clean.includes(p) || p.includes(clean)) return "auto";
  }
  for (const p of ASSIST_PATTERNS) {
    if (clean.includes(p) || p.includes(clean)) return "assist";
  }
  return "manual";
}

/** Returns the single best next-action for a task based on its status. */
function getPrimaryAction(status: string): { label: string; nextStatus: string } | null {
  switch (status) {
    case "not_started": return { label: "Start", nextStatus: "in_progress" };
    case "submitted": return { label: "Start", nextStatus: "in_progress" };
    case "in_progress": return { label: "Done", nextStatus: "delivered" };
    case "waiting": return { label: "Follow up", nextStatus: "in_progress" };
    case "blocked": return { label: "Resolve", nextStatus: "in_progress" };
    default: return null;
  }
}

const ACTION_STYLES: Record<string, string> = {
  "Start": "bg-[#2D6A4F] hover:bg-[#1B4332] text-white",
  "Done": "bg-emerald-600 hover:bg-emerald-700 text-white",
  "Follow up": "bg-amber-500 hover:bg-amber-600 text-white",
  "Resolve": "bg-red-500 hover:bg-red-600 text-white",
};

const WAITING_CYCLE = [null, "client", "supplier", "internal"] as const;

function WaitingOnChip({
  value,
  onClick,
}: {
  value: string | null;
  onClick?: () => void;
}) {
  if (!value) return null;
  const icon = WAITING_ON_ICON[value];
  const isClickable = !!onClick;

  const chip = (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); onClick?.(); }}
      disabled={!isClickable}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors bg-amber-50 text-amber-600 ${
        isClickable ? "hover:bg-amber-100 cursor-pointer" : "cursor-default"
      }`}
    >
      {icon}
      <span className="capitalize">{value}</span>
    </button>
  );

  if (!isClickable) return chip;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{chip}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[180px]">
          Waiting on: who's currently blocking this task. Click to cycle — client → supplier → internal → clear.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ─── Task Card ─── */
export function TaskCard({
  task,
  onStatusChange,
  onWaitingOnChange,
  showClient = true,
}: {
  task: TaskItem;
  onStatusChange: (id: number, status: string) => void;
  onWaitingOnChange?: (id: number, waitingOn: string | null) => void;
  showClient?: boolean;
}) {
  const overdue = isOverdue(task.due_at, task.status);
  const action = getPrimaryAction(task.status);
  const updated = timeAgo(task.updated_at || task.created_at);
  const autoType = getAutomationType(task.title);
  const canProcess = autoType !== "manual" && !["delivered", "cancelled"].includes(task.status);
  const isRunning = task.automation_status === "running";

  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);

  async function handleProcess() {
    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/crm/fulfillment/${task.id}/process`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Process failed", description: data.error || "Unknown error", variant: "destructive" });
        return;
      }
      toast({
        title: autoType === "auto" ? "Task processed" : "Assist result",
        description: data.result?.message?.substring(0, 200) || "Done",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/fulfillment"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  }

  return (
    <Card className={`border-l-[3px] ${PRIORITY_BORDER[task.priority] || "border-l-transparent"} ${overdue ? "ring-1 ring-red-200 bg-red-50/30" : ""}`}>
      <div className="p-3.5">
        {/* Row 1: Title + primary action */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {showClient ? (
              <Link href={`/admin/crm/clients/${task.client_id}`}>
                <span className="text-sm font-medium text-gray-900 hover:text-[#2D6A4F] cursor-pointer line-clamp-2">
                  {task.title}
                </span>
              </Link>
            ) : (
              <p className="text-sm font-medium text-gray-900 line-clamp-2">{task.title}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {canProcess && (
              <Button
                size="sm"
                variant="outline"
                className={`h-7 px-2.5 text-xs ${
                  autoType === "auto"
                    ? "border-blue-200 text-blue-700 hover:bg-blue-50"
                    : "border-purple-200 text-purple-700 hover:bg-purple-50"
                }`}
                disabled={processing || isRunning}
                onClick={(e) => {
                  e.preventDefault();
                  handleProcess();
                }}
              >
                {processing || isRunning ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <Zap className="w-3 h-3 mr-1" />
                )}
                {autoType === "auto" ? "Process" : "Assist"}
              </Button>
            )}
            {action && (
              <Button
                size="sm"
                className={`h-7 px-3 text-xs ${ACTION_STYLES[action.label] || "bg-gray-600 text-white"}`}
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

        {/* Row 2: Meta */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
          <StatusBadge status={task.status} />

          {task.service_name && (
            <span className="text-gray-400">{task.service_name}</span>
          )}

          {showClient && (
            <Link href={`/admin/crm/clients/${task.client_id}`}>
              <span className="font-medium text-gray-600 hover:text-[#2D6A4F] cursor-pointer">
                {task.client_name || `Client #${task.client_id}`}
              </span>
            </Link>
          )}

          {task.waiting_on && (
            <WaitingOnChip
              value={task.waiting_on}
              onClick={onWaitingOnChange ? () => {
                const currentIdx = WAITING_CYCLE.indexOf(task.waiting_on as any);
                const nextIdx = (currentIdx + 1) % WAITING_CYCLE.length;
                onWaitingOnChange(task.id, WAITING_CYCLE[nextIdx]);
              } : undefined}
            />
          )}

          {/* Handled by — shows who/what is doing the work */}
          {task.handled_by && (
            <span className="inline-flex items-center gap-1 text-gray-500">
              {task.handled_by === "automation" ? <Bot className="w-3 h-3" /> : task.handled_by === "supplier" ? <Factory className="w-3 h-3" /> : <User className="w-3 h-3" />}
              <span className="capitalize">{task.handled_by === "supplier" && task.supplier_name ? task.supplier_name : task.handled_by}</span>
            </span>
          )}

          {/* Supplier fallback if handled_by not set */}
          {!task.handled_by && task.supplier_name && (
            <span className="text-gray-400">
              via <span className="text-gray-600">{task.supplier_name}</span>
            </span>
          )}

          {/* Automation status badge */}
          {task.automation_status && task.automation_status !== "idle" && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded ${
              task.automation_status === "running" ? "bg-blue-50 text-blue-600" :
              task.automation_status === "completed" ? "bg-emerald-50 text-emerald-600" :
              task.automation_status === "failed" ? "bg-red-50 text-red-600" :
              "bg-gray-50 text-gray-500"
            }`}>
              <Zap className="w-3 h-3" />
              {task.automation_status}
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

        {/* Row 3: Operations context (only when there's action info) */}
        {(task.last_action || task.next_action) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-gray-400">
            {task.last_action && (
              <span>Last: {task.last_action}{task.last_action_at ? ` (${timeAgo(task.last_action_at)})` : ""}</span>
            )}
            {task.next_action && (
              <span className="inline-flex items-center gap-0.5 text-gray-500">
                <ArrowRight className="w-3 h-3" /> Next: {task.next_action}
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ─── Status select (for advanced use) ─── */
export function TaskStatusSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (status: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 w-auto min-w-[100px] text-[11px] px-2">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TASK_STATUSES.map((s) => (
          <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ─── Empty States ─── */
export function InboxEmptyState() {
  return (
    <Card className="p-10 text-center">
      <Inbox className="w-10 h-10 text-gray-200 mx-auto mb-3" />
      <p className="text-sm font-medium text-gray-700">No tasks need attention</p>
      <p className="text-xs text-gray-400 mt-1">New tasks will appear here when services are assigned to clients.</p>
    </Card>
  );
}

export function ClientTasksEmptyState() {
  return (
    <div className="p-8 text-center">
      <CheckCircle className="w-8 h-8 text-gray-200 mx-auto mb-2" />
      <p className="text-sm text-gray-500">No tasks for this client yet.</p>
      <p className="text-xs text-gray-400 mt-0.5">Use Quick Add to create a task.</p>
    </div>
  );
}
