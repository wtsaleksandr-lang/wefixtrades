import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
  Pause,
  Play,
  Bell,
  BellOff,
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
  notifications_enabled: boolean;
}

type SortField = "business_name" | "plan_tier" | "status" | "total_views" | "total_leads" | "created_at";
type SortDir = "asc" | "desc";

const TIER_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  free:     { label: "Free",     bg: "bg-gray-100",   text: "text-gray-600" },
  starter:  { label: "Starter",  bg: "bg-blue-50",    text: "text-blue-700" },
  business: { label: "Pro",      bg: "bg-emerald-50", text: "text-emerald-700" },
  pro:      { label: "Pro",      bg: "bg-emerald-50", text: "text-emerald-700" },
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

/* ─── Data-viz (design-lock: single-accent, no axes, mono numerals) ─── */

const QQ_ACCENT = "#0d3cfc";
const QQ_RING_TRACK = "#E2E7EE";
const QQ_SEG = ["#0d3cfc", "#4f6dfd", "#9DB0FE"];

/** Conversion-rate donut — leads ÷ views. */
function ConversionRing({ leads, views }: { leads: number; views: number }) {
  const pct = views > 0 ? Math.min(1, leads / views) : 0;
  const r = 52;
  const circ = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28 shrink-0">
      <circle cx="60" cy="60" r={r} fill="none" stroke={QQ_RING_TRACK} strokeWidth="9" />
      <circle
        cx="60" cy="60" r={r} fill="none" stroke={QQ_ACCENT} strokeWidth="9"
        strokeLinecap="round" strokeDasharray={`${circ * pct} ${circ}`}
        transform="rotate(-90 60 60)"
      />
      <text
        x="60" y="60" textAnchor="middle" dominantBaseline="central"
        style={{ fontFamily: "monospace", fontSize: "23px", fontWeight: 700, fill: "#22282A" }}
      >
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

/** Plan-mix segmented bar — share of calculators by plan tier. */
function PlanMixBar({ tiers }: { tiers: { label: string; count: number }[] }) {
  const total = tiers.reduce((s, t) => s + t.count, 0);
  return (
    <div>
      <div className="flex gap-0.5 h-2.5 rounded-full overflow-hidden" style={{ background: QQ_RING_TRACK }}>
        {total > 0 &&
          tiers.map((t, i) =>
            t.count > 0 ? (
              <div key={t.label} style={{ flexGrow: t.count, flexBasis: 0, background: QQ_SEG[i % QQ_SEG.length] }} />
            ) : null,
          )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {tiers.map((t, i) => (
          <div key={t.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: QQ_SEG[i % QQ_SEG.length] }} />
            <span className="text-xs text-gray-500">{t.label}</span>
            <span className="text-xs font-mono font-semibold text-gray-900">{t.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lead-trend area sparkline — single line + gradient fade, no axes. */
function LeadTrendSparkline({ data }: { data: { date: string; count: number }[] }) {
  if (data.length < 2) {
    return <div className="h-20 flex items-center text-xs text-gray-400">Not enough data yet.</div>;
  }
  const w = 600, h = 80, pad = 5;
  const max = Math.max(1, ...data.map((d) => d.count));
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
    const y = pad + (1 - d.count / max) * (h - 2 * pad);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-20">
      <defs>
        <linearGradient id="qq-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={QQ_ACCENT} stopOpacity="0.2" />
          <stop offset="100%" stopColor={QQ_ACCENT} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#qq-trend-fill)" />
      <path
        d={line} fill="none" stroke={QQ_ACCENT} strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function QuoteQuickPage() {
  usePageTitle("QuoteQuick");

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ calculators: QQCalculator[] }>({
    queryKey: ["/api/admin/crm/quotequick/overview"],
    queryFn: () => apiRequest("GET", "/api/admin/crm/quotequick/overview").then((r) => r.json()),
  });

  const { data: trendData } = useQuery<{ trend: { date: string; count: number }[]; total: number }>({
    queryKey: ["/api/admin/crm/quotequick/trends"],
    queryFn: () => apiRequest("GET", "/api/admin/crm/quotequick/trends").then((r) => r.json()),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "live" | "paused" }) => {
      const res = await apiRequest("PATCH", `/api/admin/crm/quotequick/${id}/status`, { status });
      return res.json();
    },
    onSuccess: (_data, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/quotequick/overview"] });
      toast({ title: status === "paused" ? "Calculator paused" : "Calculator resumed" });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  const editLinkMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/crm/quotequick/${id}/edit-link`);
      return res.json() as Promise<{ edit_url: string }>;
    },
    onSuccess: (data) => {
      if (data?.edit_url) window.location.href = data.edit_url;
    },
    onError: (err: any) => {
      toast({ title: "Could not open editor", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  const notificationsMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/crm/quotequick/${id}/notifications`, { enabled });
      return res.json();
    },
    onSuccess: (_data, { enabled }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/quotequick/overview"] });
      toast({ title: enabled ? "Lead notifications enabled" : "Lead notifications disabled" });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err?.message || "Try again", variant: "destructive" });
    },
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

  // Wave Q — three-tier ladder (Free / Pro $29 / Business $79). Legacy
  // "starter" rows roll into "Pro" so the admin admin counts stay clean
  // until any grandfathered customers migrate (none expected pre-launch).
  const tierMix = [
    { label: "Free", count: calculators.filter((c) => c.plan_tier === "free").length },
    { label: "Pro", count: calculators.filter((c) => c.plan_tier === "pro" || c.plan_tier === "starter").length },
    { label: "Business", count: calculators.filter((c) => c.plan_tier === "business").length },
  ];

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 auto-rows-fr">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Calculator className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-gray-900">{calculators.length}</p>
                <p className="text-xs text-gray-500">Total calculators</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                <Eye className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-gray-900">{totalLive}</p>
                <p className="text-xs text-gray-500">Live</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                <Users className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-gray-900">{totalLeads.toLocaleString()}</p>
                <p className="text-xs text-gray-500">Total leads</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Calculator className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-gray-900">{paidCount}</p>
                <p className="text-xs text-gray-500">Paid plans</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Lead trend */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Leads — last {trendData?.trend.length ?? 30} days
            </p>
            <p className="text-sm font-mono font-semibold text-gray-900">
              {(trendData?.total ?? 0).toLocaleString()}
            </p>
          </div>
          <LeadTrendSparkline data={trendData?.trend ?? []} />
        </Card>

        {/* Calculator analytics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-3">Lead conversion</p>
            <div className="flex items-center gap-5">
              <ConversionRing leads={totalLeads} views={totalViews} />
              <div className="space-y-1">
                <p className="text-sm text-gray-600">
                  <span className="font-mono font-semibold text-gray-900">{totalLeads.toLocaleString()}</span> leads
                </p>
                <p className="text-sm text-gray-600">
                  from <span className="font-mono font-semibold text-gray-900">{totalViews.toLocaleString()}</span> views
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">Plan mix</p>
            <PlanMixBar tiers={tierMix} />
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
                          <div className="flex items-center gap-3">
                            {c.status === "live" ? (
                              <button
                                onClick={() =>
                                  statusMutation.mutate({ id: c.id, status: "paused" })
                                }
                                disabled={statusMutation.isPending}
                                className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-800 transition-colors disabled:opacity-50"
                              >
                                <Pause className="w-3 h-3" />
                                Pause
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  statusMutation.mutate({ id: c.id, status: "live" })
                                }
                                disabled={statusMutation.isPending}
                                className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-800 transition-colors disabled:opacity-50"
                              >
                                <Play className="w-3 h-3" />
                                Resume
                              </button>
                            )}
                            <button
                              onClick={() =>
                                notificationsMutation.mutate({ id: c.id, enabled: !c.notifications_enabled })
                              }
                              disabled={notificationsMutation.isPending}
                              title={c.notifications_enabled ? "Lead notifications on — click to mute" : "Lead notifications muted — click to enable"}
                              className={`inline-flex items-center gap-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                                c.notifications_enabled
                                  ? "text-gray-600 hover:text-gray-900"
                                  : "text-amber-600 hover:text-amber-800"
                              }`}
                            >
                              {c.notifications_enabled ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                              {c.notifications_enabled ? "Notifying" : "Muted"}
                            </button>
                            <button
                              onClick={() => editLinkMutation.mutate(c.id)}
                              disabled={editLinkMutation.isPending}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Edit
                            </button>
                          </div>
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
