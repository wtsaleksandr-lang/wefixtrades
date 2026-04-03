import { useQuery } from "@tanstack/react-query";
import { Wrench, ClipboardList, AlertCircle, CreditCard, Loader2 } from "lucide-react";
import { Link } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";

interface OverviewData {
  business_name: string;
  contact_name: string | null;
  active_services: number;
  pending_onboarding: number;
  action_needed: number;
  outstanding_balance_cents: number;
  recent_activity: {
    id: number;
    title: string;
    status: string;
    completed_at: string | null;
    updated_at: string | null;
  }[];
}

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-600",
  submitted: "bg-blue-50 text-blue-700",
  in_progress: "bg-indigo-50 text-indigo-700",
  waiting: "bg-amber-50 text-amber-700",
  delivered: "bg-emerald-50 text-emerald-700",
  blocked: "bg-red-50 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function PortalDashboard() {
  const { data, isLoading, error } = useQuery<OverviewData>({
    queryKey: ["/api/portal/overview"],
    queryFn: async () => {
      const res = await fetch("/api/portal/overview", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load overview");
      return res.json();
    },
  });

  return (
    <PortalLayout>
      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      )}
      {error && (
        <div className="bg-red-50 text-red-700 rounded-lg p-4 text-sm">
          Failed to load dashboard. Please try again.
        </div>
      )}
      {data && (
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Welcome{data.contact_name ? `, ${data.contact_name}` : ""}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{data.business_name}</p>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Active Services"
              value={data.active_services}
              icon={Wrench}
              color="text-[#2D6A4F]"
              bgColor="bg-[#F0F7F4]"
              href="/portal/services"
            />
            <StatCard
              label="Pending Onboarding"
              value={data.pending_onboarding}
              icon={ClipboardList}
              color="text-amber-600"
              bgColor="bg-amber-50"
            />
            <StatCard
              label="Action Needed"
              value={data.action_needed}
              icon={AlertCircle}
              color={data.action_needed > 0 ? "text-red-600" : "text-gray-400"}
              bgColor={data.action_needed > 0 ? "bg-red-50" : "bg-gray-50"}
            />
            <StatCard
              label="Outstanding"
              value={formatCents(data.outstanding_balance_cents)}
              icon={CreditCard}
              color="text-blue-600"
              bgColor="bg-blue-50"
              href="/portal/billing"
            />
          </div>

          {/* Recent activity */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
            </div>
            {data.recent_activity.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">
                No activity yet. Your service updates will appear here.
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {data.recent_activity.map((item) => (
                  <li key={item.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize whitespace-nowrap ${STATUS_COLORS[item.status] || "bg-gray-100 text-gray-600"}`}
                      >
                        {item.status.replace(/_/g, " ")}
                      </span>
                      <span className="text-sm text-gray-700 truncate">{item.title}</span>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap ml-3">
                      {item.updated_at ? timeAgo(item.updated_at) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </PortalLayout>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
  href,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  href?: string;
}) {
  const card = (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg ${bgColor} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-lg font-semibold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
  if (href) return <Link href={href}>{card}</Link>;
  return card;
}
