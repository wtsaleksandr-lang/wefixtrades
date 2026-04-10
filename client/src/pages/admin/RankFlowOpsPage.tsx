import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import {
  Users, AlertTriangle, DollarSign, XCircle, TrendingDown, ShieldCheck,
  Package, ExternalLink, ChevronRight,
} from "lucide-react";

/* ─── Types ─── */
interface OpsOverview {
  summary: {
    active_clients: number;
    blocked: number;
    over_budget: number;
    rejected_tasks: number;
    no_movement: number;
    in_qa: number;
    open_batches: number;
  };
  clients: ClientRow[];
}

interface ClientRow {
  client_id: number;
  niche: string | null;
  location: string | null;
  website_url: string | null;
  tier: string;
  risk: string;
  month_progress: number;
  plan_status: string;
  tasks: { total: number; done: number; pending: number; rejected: number; in_qa: number };
  cost: number;
  price: number;
  margin_percent: number;
  over_soft: boolean;
  over_ceiling: boolean;
  keywords_tracked: number;
  keywords_top_10: number;
  keywords_improved: number;
  open_batches: number;
}

type FilterKey = "all" | "blocked" | "over_budget" | "at_risk" | "no_movement" | "needs_review" | "pro";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "blocked", label: "Blocked" },
  { key: "over_budget", label: "Over Budget" },
  { key: "at_risk", label: "At Risk" },
  { key: "no_movement", label: "No Movement" },
  { key: "needs_review", label: "Needs Review" },
  { key: "pro", label: "Pro Clients" },
];

const RISK_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  healthy: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Healthy" },
  blocked: { bg: "bg-red-50", text: "text-red-700", label: "Blocked" },
  over_budget: { bg: "bg-amber-50", text: "text-amber-700", label: "Over Budget" },
  at_risk: { bg: "bg-red-50", text: "text-red-600", label: "At Risk" },
  no_movement: { bg: "bg-gray-100", text: "text-gray-600", label: "No Movement" },
  needs_review: { bg: "bg-blue-50", text: "text-blue-700", label: "Needs Review" },
};

/* ─── Main Page ─── */
export default function RankFlowOpsPage() {
  const [filter, setFilter] = useState<FilterKey>("all");

  const { data, isLoading } = useQuery<OpsOverview>({
    queryKey: ["/api/rankflow/ops/overview"],
    queryFn: async () => {
      const res = await fetch("/api/rankflow/ops/overview", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const filtered = (data?.clients || []).filter(c => {
    if (filter === "all") return true;
    if (filter === "pro") return c.tier === "pro";
    return c.risk === filter;
  });

  const s = data?.summary;

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">RankFlow Operations</h2>
          <p className="text-sm text-gray-500 mt-0.5">Cross-client service health and task status</p>
        </div>

        {/* ─── Summary Metrics ─── */}
        {s && (
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
            <StatCard icon={Users} label="Active" value={s.active_clients} />
            <StatCard icon={AlertTriangle} label="Blocked" value={s.blocked} warn={s.blocked > 0} />
            <StatCard icon={DollarSign} label="Over Budget" value={s.over_budget} warn={s.over_budget > 0} />
            <StatCard icon={XCircle} label="Rejected" value={s.rejected_tasks} warn={s.rejected_tasks > 0} />
            <StatCard icon={TrendingDown} label="No Movement" value={s.no_movement} warn={s.no_movement > 0} />
            <StatCard icon={ShieldCheck} label="In QA" value={s.in_qa} />
            <StatCard icon={Package} label="Open Batches" value={s.open_batches} />
          </div>
        )}

        {/* ─── Filters ─── */}
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-[#2D6A4F] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
              {f.key !== "all" && f.key !== "pro" && s && (s as any)[f.key === "at_risk" ? "rejected_tasks" : f.key === "needs_review" ? "in_qa" : f.key] > 0 && (
                <span className="ml-1 text-[10px] opacity-70">
                  {(s as any)[f.key === "at_risk" ? "rejected_tasks" : f.key === "needs_review" ? "in_qa" : f.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ─── Client List ─── */}
        {isLoading ? (
          <Card className="p-8 text-center text-sm text-gray-400">Loading...</Card>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-sm text-gray-400">No clients match this filter.</Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(c => <ClientCard key={c.client_id} client={c} />)}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

/* ─── Client Card ─── */
function ClientCard({ client: c }: { client: ClientRow }) {
  const risk = RISK_STYLES[c.risk] || RISK_STYLES.healthy;
  const marginColor = c.margin_percent >= 70 ? "text-emerald-600" : c.margin_percent >= 50 ? "text-amber-600" : "text-red-600";

  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-3">
        {/* Left: Identity + Status */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Link href={`/admin/crm/clients/${c.client_id}`}>
              <span className="text-sm font-medium text-gray-900 hover:text-[#2D6A4F] cursor-pointer">
                {c.niche || "Client"} — {c.location || "Unknown"}
              </span>
            </Link>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 capitalize">{c.tier}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${risk.bg} ${risk.text}`}>{risk.label}</span>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            {/* Progress */}
            <span className="flex items-center gap-1">
              <span className="font-medium text-gray-700">{c.month_progress}%</span>
              <span>done</span>
              <span className="text-gray-300">({c.tasks.done}/{c.tasks.total})</span>
            </span>

            {/* Cost / Margin */}
            <span className="flex items-center gap-1">
              <span className="text-gray-400">${c.cost}</span>
              <span className="text-gray-300">/</span>
              <span className="text-gray-400">${c.price}</span>
              <span className={`font-medium ${marginColor}`}>{c.margin_percent}%</span>
              {c.over_ceiling && <span className="text-[10px] px-1 rounded bg-red-50 text-red-600">ceiling</span>}
              {!c.over_ceiling && c.over_soft && <span className="text-[10px] px-1 rounded bg-amber-50 text-amber-600">soft</span>}
            </span>

            {/* Rankings */}
            {c.keywords_tracked > 0 && (
              <span className="flex items-center gap-1">
                <span className="text-gray-400">{c.keywords_tracked} kw</span>
                {c.keywords_top_10 > 0 && <span className="text-emerald-600 font-medium">{c.keywords_top_10} top10</span>}
                {c.keywords_improved > 0 && <span className="text-blue-600">{c.keywords_improved} improved</span>}
              </span>
            )}

            {/* Task alerts */}
            {c.tasks.rejected > 0 && <span className="text-red-600 font-medium">{c.tasks.rejected} rejected</span>}
            {c.tasks.in_qa > 0 && <span className="text-purple-600">{c.tasks.in_qa} in QA</span>}
            {c.open_batches > 0 && <span className="text-amber-600">{c.open_batches} batch{c.open_batches > 1 ? "es" : ""}</span>}
          </div>
        </div>

        {/* Right: Quick link */}
        <Link href={`/admin/crm/clients/${c.client_id}`}>
          <span className="p-1.5 rounded hover:bg-gray-100 cursor-pointer text-gray-400 hover:text-[#2D6A4F]">
            <ChevronRight className="w-4 h-4" />
          </span>
        </Link>
      </div>
    </Card>
  );
}

/* ─── Stat Card ─── */
function StatCard({ icon: Icon, label, value, warn }: { icon: any; label: string; value: number; warn?: boolean }) {
  return (
    <Card className={`p-2.5 text-center ${warn ? "ring-1 ring-amber-200 bg-amber-50/30" : ""}`}>
      <Icon className={`w-3.5 h-3.5 mx-auto mb-1 ${warn ? "text-amber-500" : "text-gray-400"}`} />
      <p className={`text-lg font-semibold ${warn ? "text-amber-700" : "text-gray-900"}`}>{value}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </Card>
  );
}
