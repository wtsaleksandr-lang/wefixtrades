import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle, Clock, ArrowRight, TrendingUp, FileText, MapPin, BarChart3 } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";

interface RankFlowData {
  active: boolean;
  plan_tier?: string;
  month?: string;
  statusLine?: string;
  metrics?: {
    tasksCompleted: number;
    totalTasks: number;
    pagesCreated: number;
    citationsBuilt: number;
    progressPct: number;
  };
  completed?: { label: string; detail: string; completedAt: string | null }[];
  inProgress?: { label: string; detail: string }[];
  nextUp?: string[];
}

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PortalRankFlow() {
  const { data, isLoading } = useQuery<RankFlowData>({
    queryKey: ["/api/portal/rankflow"],
    queryFn: async () => {
      const res = await fetch("/api/portal/rankflow", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      </PortalLayout>
    );
  }

  if (!data || !data.active) {
    return (
      <PortalLayout>
        <div className="max-w-2xl mx-auto py-12 text-center">
          <TrendingUp className="w-10 h-10 text-gray-200 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">RankFlow SEO</h1>
          <p className="text-sm text-gray-500">Your SEO service is not active yet. Contact us to get started.</p>
        </div>
      </PortalLayout>
    );
  }

  const m = data.metrics!;
  const tier = (data.plan_tier || "starter").charAt(0).toUpperCase() + (data.plan_tier || "starter").slice(1);

  return (
    <PortalLayout>
      <div className="max-w-3xl mx-auto space-y-6 pb-8">

        {/* ─── Header ─── */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-5 h-5 text-[#2D6A4F]" />
            <h1 className="text-lg font-semibold text-gray-900">RankFlow SEO</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 capitalize">{tier}</span>
          </div>
          <p className="text-sm text-gray-600">{data.statusLine}</p>
        </div>

        {/* ─── Metrics ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard icon={CheckCircle} label="Tasks Done" value={`${m.tasksCompleted}/${m.totalTasks}`} />
          <MetricCard icon={FileText} label="Pages Created" value={String(m.pagesCreated)} />
          <MetricCard icon={MapPin} label="Listings Built" value={String(m.citationsBuilt)} />
          <MetricCard icon={BarChart3} label="Progress" value={`${m.progressPct}%`} />
        </div>

        {/* ─── Progress Bar ─── */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">Monthly Progress</span>
            <span className="text-xs text-gray-400">{m.progressPct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#2D6A4F] rounded-full transition-all duration-500"
              style={{ width: `${m.progressPct}%` }}
            />
          </div>
        </div>

        {/* ─── Completed Work ─── */}
        {data.completed && data.completed.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Work Completed</h2>
            </div>
            <ul className="divide-y divide-gray-50">
              {data.completed.map((item, i) => (
                <li key={i} className="px-5 py-3 flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">{item.detail}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-400">{item.label}</span>
                      {item.completedAt && <span className="text-[10px] text-gray-400">{formatDate(item.completedAt)}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ─── In Progress ─── */}
        {data.inProgress && data.inProgress.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">In Progress</h2>
            </div>
            <ul className="divide-y divide-gray-50">
              {data.inProgress.map((item, i) => (
                <li key={i} className="px-5 py-3 flex items-start gap-3">
                  <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">{item.detail}</p>
                    <span className="text-[10px] text-gray-400">{item.label}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ─── What's Next ─── */}
        {data.nextUp && data.nextUp.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">What's Next</h2>
            </div>
            <ul className="divide-y divide-gray-50">
              {data.nextUp.map((item, i) => (
                <li key={i} className="px-5 py-3 flex items-center gap-3">
                  <ArrowRight className="w-4 h-4 text-[#2D6A4F] shrink-0" />
                  <p className="text-sm text-gray-700">{item}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>
    </PortalLayout>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
      <Icon className="w-4 h-4 mx-auto text-gray-400 mb-1.5" />
      <p className="text-xl font-semibold text-gray-900">{value}</p>
      <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
