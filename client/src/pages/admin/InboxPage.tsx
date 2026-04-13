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
import { useToast } from "@/hooks/use-toast";

export default function InboxPage() {
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
    onSuccess: (_data, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/fulfillment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/overview"] });
      toast({ title: "Task updated", description: `Moved to ${status.replace(/_/g, " ")}` });
    },
  });

  const updateWaitingOn = useMutation({
    mutationFn: async ({ id, waiting_on }: { id: number; waiting_on: string | null }) => {
      const res = await apiRequest("PATCH", `/api/admin/crm/fulfillment/${id}`, { waiting_on });
      return res.json();
    },
    onSuccess: (_data, { waiting_on }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/fulfillment"] });
      toast({ title: "Waiting on updated", description: waiting_on ? `Now waiting on ${waiting_on}` : "Cleared" });
    },
  });

  // Sort by priority within groups (urgent > high > normal > low)
  const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  const byPriority = (a: TaskItem, b: TaskItem) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);

  // Group by urgency
  const blocked = (tasks?.filter((t) => t.status === "blocked") ?? []).sort(byPriority);
  const overdue = (tasks?.filter((t) => t.status !== "blocked" && isOverdue(t.due_at, t.status)) ?? []).sort(byPriority);
  const waiting = (tasks?.filter((t) => t.status === "waiting" && !isOverdue(t.due_at, t.status)) ?? []).sort(byPriority);
  const active = (tasks?.filter((t) => ["not_started", "submitted", "in_progress"].includes(t.status) && !isOverdue(t.due_at, t.status)) ?? []).sort(byPriority);
  const done = (tasks?.filter((t) => t.status === "delivered") ?? []);

  const sections = [
    { label: "Blocked", items: blocked, show: blocked.length > 0 },
    { label: "Overdue", items: overdue, show: overdue.length > 0 },
    { label: "Waiting", items: waiting, show: waiting.length > 0 },
    { label: "Active", items: active, show: active.length > 0 },
    { label: "Delivered", items: done, show: statusFilter === "all" && done.length > 0 },
  ];

  const totalOpen = (tasks ?? []).filter((t) => !["delivered", "cancelled"].includes(t.status)).length;

  return (
    <AdminLayout pageContext={{
      page: "inbox",
      totalOpenTasks: totalOpen,
      overdueTasksCount: overdue.length,
      blockedCount: blocked.length,
      activeFilters: statusFilter !== "open" ? statusFilter : undefined,
      statusCounts: (tasks ?? []).reduce((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1; return acc;
      }, {} as Record<string, number>),
      waitingOnCounts: (tasks ?? []).filter(t => t.waiting_on).reduce((acc, t) => {
        acc[t.waiting_on!] = (acc[t.waiting_on!] || 0) + 1; return acc;
      }, {} as Record<string, number>),
      topTasks: (tasks ?? []).slice(0, 10).map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, client_name: t.client_name, waiting_on: t.waiting_on, handled_by: t.handled_by, automation_status: t.automation_status, next_action: t.next_action })),
    }}>
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
                      onWaitingOnChange={(id, waiting_on) => updateWaitingOn.mutate({ id, waiting_on })}
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
