import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface InboxItem {
  id: number;
  title: string;
  status: string;
  priority: string;
  client_id: number;
  client_name: string | null;
  supplier_id: number | null;
  supplier_name: string | null;
  due_at: string | null;
  created_at: string;
}

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
  normal: "border-l-gray-200",
  low: "border-l-gray-100",
};

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

function isOverdue(dueAt: string | null): boolean {
  if (!dueAt) return false;
  return new Date(dueAt) < new Date();
}

const TASK_STATUSES = [
  { value: "not_started", label: "Not Started" },
  { value: "submitted", label: "Submitted" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting", label: "Waiting" },
  { value: "blocked", label: "Blocked" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

function TaskCard({ task, onStatusChange }: { task: InboxItem; onStatusChange: (id: number, status: string) => void }) {
  return (
    <Card className={`border-l-[3px] ${PRIORITY_BORDER[task.priority] || PRIORITY_BORDER.normal} hover:shadow-sm transition-shadow`}>
      <div className="p-3.5">
        {/* Row 1: Title + status change */}
        <div className="flex items-start justify-between gap-2">
          <Link href={`/admin/crm/clients/${task.client_id}`}>
            <span className="text-sm font-medium text-gray-900 hover:text-[#2D6A4F] cursor-pointer line-clamp-2">
              {task.title}
            </span>
          </Link>
          <Select
            value={task.status}
            onValueChange={(v) => onStatusChange(task.id, v)}
          >
            <SelectTrigger className="h-7 w-auto min-w-[100px] text-[11px] px-2 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Row 2: Meta line */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
          <Link href={`/admin/crm/clients/${task.client_id}`}>
            <span className="font-medium text-gray-700 hover:text-[#2D6A4F] cursor-pointer">
              {task.client_name || `Client #${task.client_id}`}
            </span>
          </Link>

          {task.supplier_name && (
            <span className="text-gray-400">
              via <span className="text-gray-600">{task.supplier_name}</span>
            </span>
          )}

          {task.due_at && (
            <span className={isOverdue(task.due_at) ? "text-red-600 font-medium" : ""}>
              {isOverdue(task.due_at) ? "Overdue" : `Due ${fmtDate(task.due_at)}`}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function InboxPage() {
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const queryClient = useQueryClient();

  const { data: tasks, isLoading } = useQuery<InboxItem[]>({
    queryKey: ["/api/admin/crm/fulfillment", { status: statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all" && statusFilter !== "open") {
        params.set("status", statusFilter);
      }
      params.set("limit", "100");
      const res = await fetch(`/api/admin/crm/fulfillment?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    select: (data) => {
      if (statusFilter === "open") {
        return data.filter((t) => !["delivered", "cancelled"].includes(t.status));
      }
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/crm/fulfillment/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/fulfillment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/overview"] });
    },
  });

  // Group by urgency
  const blocked = tasks?.filter((t) => t.status === "blocked") ?? [];
  const overdue = tasks?.filter((t) => t.status !== "blocked" && isOverdue(t.due_at)) ?? [];
  const waiting = tasks?.filter((t) => t.status === "waiting" && !isOverdue(t.due_at)) ?? [];
  const active = tasks?.filter((t) => ["not_started", "submitted", "in_progress"].includes(t.status) && !isOverdue(t.due_at)) ?? [];
  const done = tasks?.filter((t) => t.status === "delivered") ?? [];

  const sections = [
    { label: "Blocked", items: blocked, show: blocked.length > 0 },
    { label: "Overdue", items: overdue, show: overdue.length > 0 },
    { label: "Waiting", items: waiting, show: waiting.length > 0 },
    { label: "Active", items: active, show: active.length > 0 },
    { label: "Delivered", items: done, show: statusFilter === "all" && done.length > 0 },
  ];

  const totalOpen = (tasks ?? []).filter((t) => !["delivered", "cancelled"].includes(t.status)).length;

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">Inbox</h2>
            <p className="text-sm text-gray-500">{totalOpen} open task{totalOpen !== 1 ? "s" : ""}</p>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="waiting">Waiting</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-4"><Skeleton className="h-10 w-full" /></Card>
            ))}
          </div>
        ) : tasks?.length === 0 ? (
          <Card className="p-10 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">All clear</p>
            <p className="text-sm text-gray-500 mt-1">No tasks need attention right now.</p>
          </Card>
        ) : (
          <div className="space-y-5">
            {sections.filter((s) => s.show).map((section) => (
              <div key={section.label}>
                <p className="text-xs font-medium text-gray-400 mb-2 px-0.5">
                  {section.label} <span className="text-gray-300">({section.items.length})</span>
                </p>
                <div className="space-y-1.5">
                  {section.items.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
