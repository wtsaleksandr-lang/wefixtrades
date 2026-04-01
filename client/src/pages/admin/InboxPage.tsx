import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TaskCard, InboxEmptyState, isOverdue, type TaskItem } from "@/components/admin/TaskCard";
import { apiRequest } from "@/lib/queryClient";

export default function InboxPage() {
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const queryClient = useQueryClient();

  const { data: tasks, isLoading } = useQuery<TaskItem[]>({
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
  const overdue = tasks?.filter((t) => t.status !== "blocked" && isOverdue(t.due_at, t.status)) ?? [];
  const waiting = tasks?.filter((t) => t.status === "waiting" && !isOverdue(t.due_at, t.status)) ?? [];
  const active = tasks?.filter((t) => ["not_started", "submitted", "in_progress"].includes(t.status) && !isOverdue(t.due_at, t.status)) ?? [];
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
              <Card key={i} className="p-4"><Skeleton className="h-12 w-full" /></Card>
            ))}
          </div>
        ) : tasks?.length === 0 ? (
          <InboxEmptyState />
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
