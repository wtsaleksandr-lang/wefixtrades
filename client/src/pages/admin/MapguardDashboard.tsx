import { usePageTitle } from "@/hooks/usePageTitle";
/**
 * MapGuard Portfolio Operations Dashboard
 *
 * Cross-client view showing portfolio health, drops, improvements,
 * blocked delivery, and task state across all active MapGuard clients.
 *
 * Reuses admin CRM patterns: StatCard grid, responsive table,
 * status badges, and AdminLayout with pageContext. Wrapped with
 * <AdminProductPageShell> for unified per-product header, KPI strip,
 * and is_active / hidden toggles (PR #578 pilot pattern).
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminProductPageShell, type ProductStats } from "@/components/admin/AdminProductPageShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardGrid } from "@/components/shared/StatCard";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  MapPin, TrendingUp, TrendingDown, AlertTriangle, Factory, Eye,
  CheckCircle, Clock, Minus, Users, Zap, ArrowRight, Bell,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const PRODUCT_ID = "mapguard";

/* ─── Types ─── */
interface PortfolioMetrics {
  total_clients: number;
  significant_drops: number;
  improved: number;
  at_risk: number;
  blocked_tasks: number;
  waiting_supplier: number;
  needs_review: number;
  auto_tasks_7d: number;
  alerts_7d: number;
  avg_score: number | null;
  upgrade_opportunities: number;
  mrr_cents: number;
  basic_count: number;
  pro_count: number;
  posts_published_30d: number;
  reviews_replied_30d: number;
}

interface PortfolioClient {
  client_id: number;
  client_service_id: number;
  business_name: string;
  trade_type: string | null;
  score_total: number | null;
  score_grade: string | null;
  rating: number | null;
  review_count: number | null;
  keywords_in_local_pack: number | null;
  keywords_in_top_10: number | null;
  detected_issues: string[] | null;
  captured_at: string | null;
  score_delta: number | null;
  rating_delta: number | null;
  reviews_delta: number | null;
  local_pack_delta: number | null;
  significant: boolean;
  upgrade_recommended: boolean;
  open_tasks: number;
  blocked_tasks: number;
  waiting_supplier_tasks: number;
  needs_review_tasks: number;
  health: "healthy" | "improved" | "at_risk" | "blocked" | "waiting_delivery" | "no_recent_scan" | "new";
}

interface DashboardData {
  metrics: PortfolioMetrics;
  clients: PortfolioClient[];
}

interface ProductRecord {
  live: { id: string; name: string; is_active: boolean; hidden: boolean } | null;
}

/* ─── Health Config ─── */
const HEALTH_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; bg: string }> = {
  healthy:          { label: "Healthy",          color: "text-emerald-700", icon: CheckCircle,   bg: "bg-emerald-50" },
  improved:         { label: "Improved",         color: "text-emerald-700", icon: TrendingUp,    bg: "bg-emerald-50" },
  at_risk:          { label: "At Risk",          color: "text-red-700",     icon: AlertTriangle, bg: "bg-red-50" },
  blocked:          { label: "Blocked",          color: "text-red-700",     icon: AlertTriangle, bg: "bg-red-50" },
  waiting_delivery: { label: "Waiting Delivery", color: "text-amber-700",   icon: Factory,       bg: "bg-amber-50" },
  no_recent_scan:   { label: "No Scan",          color: "text-gray-600",    icon: Clock,         bg: "bg-gray-100" },
  new:              { label: "New",              color: "text-blue-700",    icon: MapPin,         bg: "bg-blue-50" },
};

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-700 bg-emerald-50",
  B: "text-blue-700 bg-blue-50",
  C: "text-amber-700 bg-amber-50",
  D: "text-red-700 bg-red-50",
};

/* ─── Delta Badge ─── */
function DeltaBadge({ value, suffix, invert }: { value: number | null; suffix?: string; invert?: boolean }) {
  if (value === null || value === 0) return <Minus className="w-3 h-3 text-gray-300" />;
  const positive = invert ? value < 0 : value > 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span data-theme="light" className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${positive ? "text-emerald-600" : "text-red-600"}`}>
      <Icon className="w-3 h-3" />
      {value > 0 ? "+" : ""}{value}{suffix || ""}
    </span>
  );
}

/* ─── Stat Card (reused CRM pattern) ─── */
function StatCard({ label, value, icon: Icon, color }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card className="h-full p-4 hover:shadow-sm transition-shadow cursor-default">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
    </Card>
  );
}

/* ─── Health Badge ─── */
function HealthBadge({ health }: { health: string }) {
  const config = HEALTH_CONFIG[health] || HEALTH_CONFIG.new;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${config.bg} ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

/* ─── Main Page ─── */
export default function MapguardDashboard() {
  usePageTitle("MapGuard");
  const [filter, setFilter] = useState<string>("all");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  /* AdminProductPageShell wiring — see QuoteQuickPage pilot (PR #578). */
  const productKey = ["/api/admin/products", PRODUCT_ID] as const;
  const { data: productData } = useQuery<ProductRecord>({
    queryKey: productKey,
    queryFn: () => apiRequest("GET", `/api/admin/products/${PRODUCT_ID}`).then((r) => r.json()),
  });
  const live = productData?.live ?? null;

  const statsKey = ["/api/admin/products", PRODUCT_ID, "stats"] as const;
  const { data: productStats } = useQuery<ProductStats>({
    queryKey: statsKey,
    queryFn: () => apiRequest("GET", `/api/admin/products/${PRODUCT_ID}/stats`).then((r) => r.json()),
  });

  const activeToggle = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await apiRequest("PATCH", `/api/admin/products/${PRODUCT_ID}/status`, { is_active: next });
      return res.json();
    },
    onMutate: async (next: boolean) => {
      await queryClient.cancelQueries({ queryKey: productKey });
      const prev = queryClient.getQueryData<ProductRecord>(productKey);
      if (prev?.live) {
        queryClient.setQueryData<ProductRecord>(productKey, { live: { ...prev.live, is_active: next } });
      }
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(productKey, ctx.prev);
      toast({ title: "Could not update status", description: "Try again", variant: "destructive" });
    },
    onSuccess: (_data, next) => {
      toast({ title: next ? "Product activated" : "Product deactivated" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: productKey });
    },
  });

  const hiddenToggle = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await apiRequest("PATCH", `/api/admin/products/${PRODUCT_ID}/visibility`, { hidden: next });
      return res.json();
    },
    onMutate: async (next: boolean) => {
      await queryClient.cancelQueries({ queryKey: productKey });
      const prev = queryClient.getQueryData<ProductRecord>(productKey);
      if (prev?.live) {
        queryClient.setQueryData<ProductRecord>(productKey, { live: { ...prev.live, hidden: next } });
      }
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(productKey, ctx.prev);
      toast({ title: "Could not update visibility", description: "Try again", variant: "destructive" });
    },
    onSuccess: (_data, next) => {
      toast({ title: next ? "Hidden from public catalog" : "Visible in public catalog" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: productKey });
    },
  });

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/mapguard/dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/mapguard/dashboard", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const metrics = data?.metrics;
  const allClients = data?.clients || [];

  // Filter clients
  const filteredClients = allClients.filter((c) => {
    if (filter === "all") return true;
    if (filter === "at_risk") return c.health === "at_risk";
    if (filter === "improved") return c.health === "improved";
    if (filter === "blocked") return c.blocked_tasks > 0;
    if (filter === "waiting") return c.waiting_supplier_tasks > 0;
    if (filter === "needs_review") return c.needs_review_tasks > 0;
    if (filter === "has_issues") return (c.detected_issues?.length ?? 0) > 0;
    if (filter === "significant") return c.significant;
    return true;
  });

  const filtersBar = (
    <div className="flex items-center gap-2">
      <Select value={filter} onValueChange={setFilter}>
        <SelectTrigger className="w-[180px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Clients</SelectItem>
          <SelectItem value="at_risk">At Risk</SelectItem>
          <SelectItem value="improved">Improved</SelectItem>
          <SelectItem value="blocked">Blocked</SelectItem>
          <SelectItem value="waiting">Waiting Supplier</SelectItem>
          <SelectItem value="needs_review">Needs Review</SelectItem>
          <SelectItem value="has_issues">Has Issues</SelectItem>
          <SelectItem value="significant">Significant Changes</SelectItem>
        </SelectContent>
      </Select>
      <span className="text-xs text-gray-400">
        {filteredClients.length} client{filteredClients.length !== 1 ? "s" : ""}
      </span>
    </div>
  );

  /* The legacy MapGuard body — preserved verbatim minus the standalone
   * MRR card, which is now shown in the shell's KPI strip above. */
  const overviewBody = (
    <div className="space-y-5">
      {/* Stat Cards (portfolio-instance health — separate from the shell's MRR/subs strip above) */}
      {isLoading ? (
        <StatCardGrid className="md:grid-cols-5 mb-0">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="h-full p-4"><Skeleton className="h-14 w-full" /></Card>
          ))}
        </StatCardGrid>
      ) : metrics && (
        <>
          <StatCardGrid className="md:grid-cols-5 mb-0">
            <StatCard label="Active Clients" value={metrics.total_clients} icon={Users} color="bg-brand-blue" />
            <StatCard label="At Risk" value={metrics.at_risk + metrics.significant_drops} icon={AlertTriangle} color={metrics.at_risk > 0 ? "bg-red-500" : "bg-gray-400"} />
            <StatCard label="Improved" value={metrics.improved} icon={TrendingUp} color={metrics.improved > 0 ? "bg-emerald-500" : "bg-gray-400"} />
            <StatCard
              label="Avg Score"
              value={metrics.avg_score !== null ? metrics.avg_score : "—"}
              icon={Zap}
              color="bg-blue-500"
            />
            <StatCard label="Upgrade Opps" value={metrics.upgrade_opportunities} icon={TrendingUp} color={metrics.upgrade_opportunities > 0 ? "bg-amber-500" : "bg-gray-400"} />
          </StatCardGrid>

          {/* Automation-delivery proof row. MRR is shown by the shell's KPI
              strip above; the 30d counters show whether the post + review
              automation is actually firing for paying customers. */}
          <StatCardGrid className="md:grid-cols-3 mb-0 mt-3">
            <StatCard
              label="Tier Mix"
              value={`${metrics.basic_count}B · ${metrics.pro_count}P`}
              icon={Users}
              color="bg-blue-600"
            />
            <StatCard
              label="GBP Posts (30d)"
              value={metrics.posts_published_30d}
              icon={Zap}
              color={metrics.posts_published_30d > 0 ? "bg-brand-blue" : "bg-gray-400"}
            />
            <StatCard
              label="Replies (30d)"
              value={metrics.reviews_replied_30d}
              icon={CheckCircle}
              color={metrics.reviews_replied_30d > 0 ? "bg-brand-blue" : "bg-gray-400"}
            />
          </StatCardGrid>
        </>
      )}

      {/* Secondary metrics row */}
      {metrics && (metrics.blocked_tasks > 0 || metrics.waiting_supplier > 0 || metrics.needs_review > 0 || metrics.auto_tasks_7d > 0 || metrics.alerts_7d > 0) && (
        <div className="flex flex-wrap gap-3">
          {metrics.blocked_tasks > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
              <AlertTriangle className="w-3 h-3" /> {metrics.blocked_tasks} blocked task{metrics.blocked_tasks !== 1 ? "s" : ""}
            </div>
          )}
          {metrics.waiting_supplier > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-medium text-amber-700">
              <Factory className="w-3 h-3" /> {metrics.waiting_supplier} waiting supplier{metrics.waiting_supplier !== 1 ? "s" : ""}
            </div>
          )}
          {metrics.needs_review > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 border border-purple-200 text-xs font-medium text-purple-700">
              <Eye className="w-3 h-3" /> {metrics.needs_review} need{metrics.needs_review !== 1 ? "" : "s"} review
            </div>
          )}
          {metrics.auto_tasks_7d > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-medium text-blue-700">
              <Zap className="w-3 h-3" /> {metrics.auto_tasks_7d} auto-created task{metrics.auto_tasks_7d !== 1 ? "s" : ""} this week
            </div>
          )}
          {metrics.alerts_7d > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
              <Bell className="w-3 h-3" /> {metrics.alerts_7d} alert{metrics.alerts_7d !== 1 ? "s" : ""} sent this week
            </div>
          )}
        </div>
      )}

      {/* Client Table */}
      {isLoading ? (
        <Card>
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        </Card>
      ) : filteredClients.length === 0 ? (
        <Card className="p-10 text-center">
          <MapPin className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700">
            {allClients.length === 0 ? "No active MapGuard clients" : "No clients match this filter"}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {allClients.length === 0
              ? "MapGuard clients will appear here when services are activated."
              : "Try a different filter to see other clients."}
          </p>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-center">Health</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead className="text-center">Rating</TableHead>
                  <TableHead className="text-center">Reviews</TableHead>
                  <TableHead className="text-center">Local Pack</TableHead>
                  <TableHead className="text-center">Tasks</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((c) => (
                  <TableRow key={c.client_id} className="hover:bg-gray-50">
                    <TableCell>
                      <Link href={`/admin/crm/clients/${c.client_id}`}>
                        <span className="text-sm font-medium text-gray-900 hover:text-brand-blue cursor-pointer">{c.business_name}</span>
                      </Link>
                      {c.trade_type && <p className="text-[11px] text-gray-400 capitalize">{c.trade_type}</p>}
                    </TableCell>
                    <TableCell className="text-center"><HealthBadge health={c.health} /></TableCell>
                    <TableCell className="text-center">
                      {c.score_total != null ? (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${GRADE_COLORS[c.score_grade || "D"] || "bg-gray-100 text-gray-600"}`}>
                            {c.score_grade}
                          </span>
                          <DeltaBadge value={c.score_delta} suffix="pts" />
                        </div>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {c.rating != null ? (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className="text-sm font-medium">{c.rating.toFixed(1)}</span>
                          <DeltaBadge value={c.rating_delta} />
                        </div>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {c.review_count != null ? (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className="text-sm">{c.review_count}</span>
                          <DeltaBadge value={c.reviews_delta} />
                        </div>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {c.keywords_in_local_pack != null ? (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className="text-sm">{c.keywords_in_local_pack}</span>
                          <DeltaBadge value={c.local_pack_delta} />
                        </div>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="inline-flex items-center gap-1">
                        {c.open_tasks > 0 && <span className="text-xs text-gray-600">{c.open_tasks}</span>}
                        {c.blocked_tasks > 0 && <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-red-50 text-red-600">{c.blocked_tasks} blocked</span>}
                        {c.waiting_supplier_tasks > 0 && <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-amber-50 text-amber-600">{c.waiting_supplier_tasks} waiting</span>}
                        {c.needs_review_tasks > 0 && <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-purple-50 text-purple-600">{c.needs_review_tasks} review</span>}
                        {c.upgrade_recommended && <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">Upgrade</span>}
                        {c.open_tasks === 0 && !c.upgrade_recommended && <span className="text-xs text-gray-400">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/admin/crm/clients/${c.client_id}`}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-500 hover:text-brand-blue">
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filteredClients.map((c) => (
              <Link key={c.client_id} href={`/admin/crm/clients/${c.client_id}`}>
                <Card className="p-3.5 hover:shadow-sm transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.business_name}</p>
                      {c.trade_type && <p className="text-[11px] text-gray-400 capitalize">{c.trade_type}</p>}
                    </div>
                    <HealthBadge health={c.health} />
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    {c.score_total != null && (
                      <span className="flex items-center gap-1">
                        <span className={`font-bold px-1 rounded text-[10px] ${GRADE_COLORS[c.score_grade || "D"] || "bg-gray-100"}`}>{c.score_grade}</span>
                        <DeltaBadge value={c.score_delta} suffix="pts" />
                      </span>
                    )}
                    {c.rating != null && <span>{c.rating.toFixed(1)} <DeltaBadge value={c.rating_delta} /></span>}
                    {c.review_count != null && <span>{c.review_count} reviews</span>}
                    {c.open_tasks > 0 && <span>{c.open_tasks} tasks</span>}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Supplier Performance */}
      <SupplierPerformanceSection />
    </div>
  );

  return (
    <AdminLayout pageContext={{ page: "mapguard_dashboard" }}>
      <AdminProductPageShell
        productId={PRODUCT_ID}
        productName="MapGuard"
        isActive={live?.is_active ?? true}
        hidden={live?.hidden ?? false}
        stats={productStats ?? null}
        filtersBar={filtersBar}
        tabs={[
          {
            id: "overview",
            label: "Overview",
            render: () => overviewBody,
          },
        ]}
        onToggleActive={(next) => activeToggle.mutate(next)}
        onToggleHidden={(next) => hiddenToggle.mutate(next)}
      />
    </AdminLayout>
  );
}

/* ─── Supplier Performance Section ─── */
function SupplierPerformanceSection() {
  const { data } = useQuery<Array<{ name: string; type: string; tasks_completed: number; tasks_total: number; total_cost_cents: number; avg_rating: number | null }>>({
    queryKey: ["/api/mapguard/suppliers/performance"],
    queryFn: async () => {
      const res = await fetch("/api/mapguard/suppliers/performance", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (!data || data.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Supplier Performance</h3>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Supplier</TableHead>
            <TableHead className="text-center">Type</TableHead>
            <TableHead className="text-center">Tasks</TableHead>
            <TableHead className="text-center">Completed</TableHead>
            <TableHead className="text-center">Total Cost</TableHead>
            <TableHead className="text-center">Rating</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map(s => (
            <TableRow key={s.name}>
              <TableCell className="text-sm font-medium">{s.name}</TableCell>
              <TableCell className="text-center"><span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 capitalize">{s.type}</span></TableCell>
              <TableCell className="text-center text-sm">{s.tasks_total}</TableCell>
              <TableCell className="text-center text-sm">{s.tasks_completed}</TableCell>
              <TableCell className="text-center text-sm">${(s.total_cost_cents / 100).toFixed(2)}</TableCell>
              <TableCell className="text-center">
                {s.avg_rating !== null ? (
                  <span className="text-sm font-medium">{s.avg_rating}/5</span>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
