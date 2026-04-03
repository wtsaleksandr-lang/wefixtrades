import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Loader2, ArrowLeft, Check, Clock, AlertCircle, Circle } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";

interface TaskRow {
  id: number;
  title: string;
  status: string;
  waiting_on: string | null;
  due_at: string | null;
  completed_at: string | null;
  sort_order: number;
}

interface PaymentRow {
  id: number;
  type: string;
  amount_cents: number;
  status: string;
  description: string | null;
  period_start: string | null;
  period_end: string | null;
  due_at: string | null;
  paid_at: string | null;
  created_at: string | null;
}

interface ServiceDetail {
  service: {
    id: number;
    service_id: string;
    service_name: string | null;
    category: string | null;
    status: string;
    billing_period: string | null;
    price_cents: number | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string | null;
  };
  tasks: TaskRow[];
  onboarding: {
    id: number;
    status: string;
    submitted_at: string | null;
    approved_at: string | null;
  } | null;
  payments: PaymentRow[];
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  onboarding: "bg-amber-50 text-amber-700",
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-blue-50 text-blue-700",
  cancelled: "bg-gray-100 text-gray-500",
  completed: "bg-indigo-50 text-indigo-700",
};

const PAYMENT_STATUS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  refunded: "bg-gray-100 text-gray-600",
};

function TaskIcon({ status }: { status: string }) {
  switch (status) {
    case "delivered":
      return <Check className="w-4 h-4 text-emerald-500" />;
    case "in_progress":
    case "submitted":
      return <Clock className="w-4 h-4 text-indigo-500" />;
    case "waiting":
    case "blocked":
      return <AlertCircle className="w-4 h-4 text-amber-500" />;
    case "cancelled":
      return <Circle className="w-4 h-4 text-gray-300" />;
    default:
      return <Circle className="w-4 h-4 text-gray-300" />;
  }
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PortalServiceDetail() {
  const [, params] = useRoute("/portal/services/:id");
  const serviceId = params?.id;

  const { data, isLoading, error } = useQuery<ServiceDetail>({
    queryKey: ["/api/portal/services", serviceId],
    queryFn: async () => {
      const res = await fetch(`/api/portal/services/${serviceId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load service");
      return res.json();
    },
    enabled: !!serviceId,
  });

  return (
    <PortalLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back link */}
        <Link href="/portal/services" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Services
        </Link>

        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-4 text-sm">
            Failed to load service. Please try again.
          </div>
        )}

        {data && (
          <>
            {/* Service header */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">
                    {data.service.service_name || data.service.service_id}
                  </h1>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                    {data.service.category && (
                      <span className="capitalize">{data.service.category}</span>
                    )}
                    {data.service.billing_period && (
                      <span>{data.service.billing_period === "one-time" ? "One-time" : "Monthly"}</span>
                    )}
                    {data.service.started_at && (
                      <span>Started {formatDate(data.service.started_at)}</span>
                    )}
                  </div>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[data.service.status] || "bg-gray-100 text-gray-600"}`}>
                  {data.service.status}
                </span>
              </div>
            </div>

            {/* Onboarding status */}
            {data.onboarding && data.onboarding.status !== "approved" && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm font-medium text-amber-800">Onboarding Required</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Status: <span className="capitalize">{data.onboarding.status.replace(/_/g, " ")}</span>
                  {data.onboarding.submitted_at && (
                    <> &middot; Submitted {formatDate(data.onboarding.submitted_at)}</>
                  )}
                </p>
              </div>
            )}

            {/* Task timeline */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Progress</h2>
                {data.tasks.length > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {data.tasks.filter((t) => t.status === "delivered").length} of {data.tasks.length} steps complete
                  </p>
                )}
              </div>
              {data.tasks.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-gray-400">
                  No tasks defined for this service yet.
                </div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {data.tasks.map((task, i) => (
                    <li key={task.id} className="px-5 py-3 flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        <TaskIcon status={task.status} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${task.status === "delivered" ? "text-gray-400 line-through" : "text-gray-700"}`}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {task.waiting_on === "client" && (
                            <span className="text-[10px] font-medium bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                              Waiting on you
                            </span>
                          )}
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
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Payments */}
            {data.payments.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-900">Payments</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                        <th className="px-5 py-2 font-medium">Date</th>
                        <th className="px-5 py-2 font-medium">Description</th>
                        <th className="px-5 py-2 font-medium">Amount</th>
                        <th className="px-5 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.payments.map((p) => (
                        <tr key={p.id}>
                          <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{formatDate(p.created_at)}</td>
                          <td className="px-5 py-3 text-gray-700">{p.description || p.type}</td>
                          <td className="px-5 py-3 text-gray-900 font-medium whitespace-nowrap">{formatCents(p.amount_cents)}</td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${PAYMENT_STATUS[p.status] || "bg-gray-100 text-gray-600"}`}>
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PortalLayout>
  );
}
