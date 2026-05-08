import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calculator,
  Search,
  ExternalLink,
  ArrowUpDown,
  Eye,
  Users,
} from "lucide-react";

interface QQCalculator {
  id: number;
  business_name: string;
  trade_type: string;
  slug: string;
  owner_email: string | null;
  plan_tier: string;
  total_views: number;
  total_leads: number;
  status: string;
  created_at: string;
}

type SortField = "business_name" | "plan_tier" | "status" | "total_views" | "total_leads" | "created_at";
type SortDir = "asc" | "desc";

const TIER_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  free:     { label: "Free",     bg: "bg-gray-100",   text: "text-gray-600" },
  starter:  { label: "Starter",  bg: "bg-blue-50",    text: "text-blue-700" },
  business: { label: "Business", bg: "bg-emerald-50", text: "text-emerald-700" },
};

const STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  live:      { label: "Live",    bg: "bg-green-50",  text: "text-green-700" },
  draft:     { label: "Draft",   bg: "bg-gray-100",  text: "text-gray-600" },
  paused:    { label: "Paused",  bg: "bg-amber-50",  text: "text-amber-700" },
};

function Badge({ config }: { config: { label: string; bg: string; text: string } }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

export default function QuoteQuickPage() {
  usePageTitle("QuoteQuick");

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading } = useQuery<{ calculators: QQCalculator[] }>({
    queryKey: ["/api/admin/crm/quotequick/overview"],
    queryFn: () => apiRequest("GET", "/api/admin/crm/quotequick/overview").then((r) => r.json()),
  });

  const calculators = data?.calculators ?? [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let items = calculators;

    if (q) {
      items = items.filter(
        (c) =>
          c.business_name.toLowerCase().includes(q) ||
          (c.owner_email ?? "").toLowerCase().includes(q) ||
          c.trade_type.toLowerCase().includes(q) ||
          c.slug.toLowerCase().includes(q)
      );
    }

    items = [...items].sort((a, b) => {
      let av: string | number = (a as any)[sortField] ?? "";
      let bv: string | number = (b as any)[sortField] ?? "";
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return items;
  }, [calculators, search, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const totalLive = calculators.filter((c) => c.status === "live").length;
  const totalLeads = calculators.reduce((s, c) => s + c.total_leads, 0);
  const totalViews = calculators.reduce((s, c) => s + c.total_views, 0);
  const paidCount = calculators.filter((c) => c.plan_tier !== "free").length;

  function SortHeader({ field, label }: { field: SortField; label: string }) {
    const active = sortField === field;
    return (
      <button
        onClick={() => toggleSort(field)}
        className={`flex items-center gap-1 text-xs font-medium uppercase tracking-wider ${
          active ? "text-gray-900" : "text-gray-500"
        } hover:text-gray-900 transition-colors`}
      >
        {label}
        <ArrowUpDown className="w-3 h-3" />
      </button>
    );
  }

  return (
    <AdminLayout pageContext={{ page: "QuoteQuick" }}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">QuoteQuick</h1>
          <p className="text-sm text-gray-500 mt-1">All calculator instances across the platform</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Calculator className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{calculators.length}</p>
                <p className="text-xs text-gray-500">Total calculators</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                <Eye className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{totalLive}</p>
                <p className="text-xs text-gray-500">Live</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
                <Users className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{totalLeads.toLocaleString()}</p>
                <p className="text-xs text-gray-500">Total leads</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Calculator className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{paidCount}</p>
                <p className="text-xs text-gray-500">Paid plans</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name, email, trade, slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm">
              {search ? "No calculators match your search." : "No QuoteQuick calculators yet."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/50">
                    <th className="text-left px-4 py-3"><SortHeader field="business_name" label="Business" /></th>
                    <th className="text-left px-4 py-3"><SortHeader field="plan_tier" label="Plan" /></th>
                    <th className="text-left px-4 py-3"><SortHeader field="status" label="Status" /></th>
                    <th className="text-right px-4 py-3"><SortHeader field="total_views" label="Views" /></th>
                    <th className="text-right px-4 py-3"><SortHeader field="total_leads" label="Leads" /></th>
                    <th className="text-left px-4 py-3"><SortHeader field="created_at" label="Created" /></th>
                    <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">Owner</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((c) => {
                    const tier = TIER_BADGE[c.plan_tier] ?? TIER_BADGE.free;
                    const st = STATUS_BADGE[c.status] ?? STATUS_BADGE.draft;
                    return (
                      <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{c.business_name}</div>
                          <div className="text-xs text-gray-400">{c.trade_type}</div>
                        </td>
                        <td className="px-4 py-3"><Badge config={tier} /></td>
                        <td className="px-4 py-3"><Badge config={st} /></td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                          {c.total_views.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                          {c.total_leads.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {c.created_at
                            ? new Date(c.created_at).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "--"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[180px] truncate">
                          {c.owner_email ?? "--"}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/EditCalculator?token=admin&slug=${c.slug}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Edit
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
