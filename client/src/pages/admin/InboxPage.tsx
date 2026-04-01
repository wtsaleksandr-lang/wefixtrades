import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Clock, Truck, CheckCircle2 } from "lucide-react";

interface InboxItem {
  id: number;
  title: string;
  status: string;
  priority: string;
  client_id: number;
  client_service_id: number;
  supplier_id: number | null;
  cost_cents: number | null;
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

const PRIORITY_ICON: Record<string, React.ReactNode> = {
  urgent: <AlertCircle className="w-3.5 h-3.5 text-red-500" />,
  high: <AlertCircle className="w-3.5 h-3.5 text-amber-500" />,
  normal: <Clock className="w-3.5 h-3.5 text-gray-400" />,
  low: <Clock className="w-3.5 h-3.5 text-gray-300" />,
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[status] || "bg-gray-100 text-gray-600"}`}>
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

export default function InboxPage() {
  const [statusFilter, setStatusFilter] = useState<string>("open");

  const { data: tasks, isLoading } = useQuery<InboxItem[]>({
    queryKey: ["/api/admin/crm/fulfillment", { status: statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        // "open" = everything except delivered/cancelled
        if (statusFilter === "open") {
          // fetch all, filter client-side
        } else {
          params.set("status", statusFilter);
        }
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
    { label: "In Progress", items: active, show: active.length > 0 },
    { label: "Delivered", items: done, show: statusFilter === "all" && done.length > 0 },
  ];

  const totalOpen = (tasks ?? []).filter((t) => !["delivered", "cancelled"].includes(t.status)).length;

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Inbox</h2>
            <p className="text-sm text-gray-500">{totalOpen} open task{totalOpen !== 1 ? "s" : ""} across all clients</p>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]">
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
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-4"><Skeleton className="h-5 w-full" /></Card>
            ))}
          </div>
        ) : tasks?.length === 0 ? (
          <Card className="p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">All clear</p>
            <p className="text-sm text-gray-500 mt-1">No tasks need attention right now.</p>
          </Card>
        ) : (
          <div className="space-y-5">
            {sections.filter((s) => s.show).map((section) => (
              <div key={section.label}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
                  {section.label} ({section.items.length})
                </h3>
                <div className="space-y-1.5">
                  {section.items.map((task) => (
                    <Link key={task.id} href={`/admin/crm/clients/${task.client_id}`}>
                      <Card className="p-3.5 hover:shadow-sm transition-shadow cursor-pointer">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 shrink-0">
                            {PRIORITY_ICON[task.priority] || PRIORITY_ICON.normal}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <StatusBadge status={task.status} />
                              {task.due_at && (
                                <span className={`text-xs ${isOverdue(task.due_at) ? "text-red-600 font-medium" : "text-gray-500"}`}>
                                  {isOverdue(task.due_at) ? "Overdue" : `Due ${fmtDate(task.due_at)}`}
                                </span>
                              )}
                              <span className="text-xs text-gray-400">Client #{task.client_id}</span>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </Link>
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
