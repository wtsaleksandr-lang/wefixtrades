import { Check, Clock, AlertCircle, Circle, Paperclip } from "lucide-react";
import type { Deliverable } from "./DeliverableViewer";

export interface TimelineTask {
  id: number;
  title: string;
  status: string;
  waiting_on: string | null;
  due_at: string | null;
  completed_at: string | null;
  sort_order: number;
  deliverables?: Deliverable[];
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "delivered":
      return (
        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center ring-2 ring-white">
          <Check className="w-3.5 h-3.5 text-emerald-600" />
        </div>
      );
    case "in_progress":
    case "submitted":
      return (
        <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center ring-2 ring-white">
          <Clock className="w-3.5 h-3.5 text-indigo-600" />
        </div>
      );
    case "waiting":
    case "blocked":
      return (
        <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center ring-2 ring-white">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
        </div>
      );
    default:
      return (
        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center ring-2 ring-white">
          <Circle className="w-3.5 h-3.5 text-gray-400" />
        </div>
      );
  }
}

function StatusBadge({ status, waitingOn }: { status: string; waitingOn: string | null }) {
  if (waitingOn === "client") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700">
        Waiting on you
      </span>
    );
  }
  const styles: Record<string, string> = {
    not_started: "bg-gray-100 text-gray-600",
    submitted: "bg-blue-50 text-blue-700",
    in_progress: "bg-indigo-50 text-indigo-700",
    waiting: "bg-amber-50 text-amber-700",
    blocked: "bg-red-50 text-red-700",
    delivered: "bg-emerald-50 text-emerald-700",
    cancelled: "bg-gray-100 text-gray-500",
  };
  const labels: Record<string, string> = {
    not_started: "Not started",
    submitted: "Submitted",
    in_progress: "In progress",
    waiting: "In review",
    blocked: "Needs attention",
    delivered: "Complete",
    cancelled: "Cancelled",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${styles[status] || "bg-gray-100 text-gray-600"}`}>
      {labels[status] || status.replace(/_/g, " ")}
    </span>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface TaskTimelineProps {
  tasks: TimelineTask[];
  /** Optional click handler when user clicks a task with waiting_on === "client" */
  onTaskAction?: (task: TimelineTask) => void;
}

export default function TaskTimeline({ tasks, onTaskAction }: TaskTimelineProps) {
  if (!tasks || tasks.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <p className="text-sm text-gray-400">
          We're setting things up. Your progress tracker will appear shortly.
        </p>
      </div>
    );
  }

  const completedCount = tasks.filter((t) => t.status === "delivered").length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Progress</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {completedCount} of {tasks.length} steps complete
        </p>
      </div>
      <div className="px-5 py-3">
        <ol className="relative">
          {tasks.map((task, idx) => {
            const isLast = idx === tasks.length - 1;
            const deliverableCount = Array.isArray(task.deliverables) ? task.deliverables.length : 0;
            const isClickable = task.waiting_on === "client" && onTaskAction;

            return (
              <li key={task.id} className="relative pb-1">
                {/* Connector line */}
                {!isLast && (
                  <div className="absolute left-[13px] top-7 bottom-0 w-0.5 bg-gray-100" />
                )}
                <div
                  className={`flex items-start gap-3 py-2 ${isClickable ? "cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors" : ""}`}
                  onClick={isClickable ? () => onTaskAction(task) : undefined}
                >
                  <div className="shrink-0 mt-0.5">
                    <StatusIcon status={task.waiting_on === "client" ? "waiting" : task.status} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm ${task.status === "delivered" ? "text-gray-400 line-through" : "text-gray-700"}`}>
                        {task.title}
                      </p>
                      <StatusBadge status={task.status} waitingOn={task.waiting_on} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {task.completed_at && (
                        <span className="text-[10px] text-gray-400">
                          Completed {formatDate(task.completed_at)}
                        </span>
                      )}
                      {task.due_at && !task.completed_at && (
                        <span className="text-[10px] text-gray-400">
                          Due {formatDate(task.due_at)}
                        </span>
                      )}
                      {deliverableCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400">
                          <Paperclip className="w-2.5 h-2.5" />
                          {deliverableCount} {deliverableCount === 1 ? "file" : "files"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
