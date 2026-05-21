/**
 * Admin → API Platform (Wave AJ-4).
 *
 * Index dashboard for the public API platform. Mirrors QuoteQuickPage /
 * TradelineTemplatesPage style: TanStack Query + apiRequest + shadcn
 * primitives + AdminLayout. Consumes the admin endpoints landed in PR #394
 * (Wave AJ-2): /api/admin/api-platform/{users,keys,metrics,...}.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  KeyRound,
  Users as UsersIcon,
  DollarSign,
  Activity,
  Search,
  Ban,
  Power,
  Trash2,
  Plug,
} from "lucide-react";

/* ─── Tier badge palette (shared with portal) ─────────────────────────── */
/* IDs come from shared/pricing/apiTiers.ts: free, starter, growth, scale. */

const TIER_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  free:    { label: "Dev",      bg: "bg-gray-100",   text: "text-gray-600" },
  starter: { label: "Starter",  bg: "bg-blue-50",    text: "text-blue-700" },
  growth:  { label: "Growth",   bg: "bg-purple-50",  text: "text-purple-700" },
  pro:     { label: "Pro",      bg: "bg-purple-50",  text: "text-purple-700" },
  scale:   { label: "Scale",    bg: "bg-amber-50",   text: "text-amber-700" },
  business:{ label: "Business", bg: "bg-amber-50",   text: "text-amber-700" },
  agency:  { label: "Agency",   bg: "bg-slate-100",  text: "text-slate-700" },
};

const SUB_STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  active:    { label: "Active",    bg: "bg-emerald-50", text: "text-emerald-700" },
  trialing:  { label: "Trialing",  bg: "bg-blue-50",    text: "text-blue-700" },
  past_due:  { label: "Past due",  bg: "bg-amber-50",   text: "text-amber-700" },
  paused:    { label: "Paused",    bg: "bg-amber-50",   text: "text-amber-700" },
  cancelled: { label: "Cancelled", bg: "bg-gray-100",   text: "text-gray-500" },
  canceled:  { label: "Cancelled", bg: "bg-gray-100",   text: "text-gray-500" },
};

const KEY_STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  active:   { label: "Active",   bg: "bg-emerald-50", text: "text-emerald-700" },
  disabled: { label: "Disabled", bg: "bg-amber-50",   text: "text-amber-700" },
  revoked:  { label: "Revoked",  bg: "bg-gray-100",   text: "text-gray-500" },
};

function Badge({ config }: { config: { label: string; bg: string; text: string } }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

function tierBadge(id: string) {
  return TIER_BADGE[id] ?? { label: id, bg: "bg-gray-100", text: "text-gray-600" };
}
function subStatusBadge(s: string) {
  return SUB_STATUS_BADGE[s] ?? { label: s, bg: "bg-gray-100", text: "text-gray-500" };
}
function keyStatusBadge(s: string) {
  return KEY_STATUS_BADGE[s] ?? { label: s, bg: "bg-gray-100", text: "text-gray-500" };
}

/* ─── Types — must mirror server/routes/adminApiPlatformRoutes.ts ─────── */

interface ApiTierDef {
  id: string;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  monthlyCallQuota: number;
  rateLimitPerMinute: number;
}

interface MetricsResponse {
  active_keys: number;
  calls_today: number;
  calls_this_month: number;
  top_users_this_month: { user_id: number; calls: number }[];
  subscriptions_by_tier: Record<string, number>;
  estimated_monthly_revenue_usd: number;
  tier_catalog: ApiTierDef[];
}

interface ApiUserRow {
  user_id: number;
  tier: string;
  status: string;
  monthly_call_quota: number;
  monthly_calls_used: number;
  reset_at: string | null;
  current_period_end: string | null;
  email: string | null;
  name: string | null;
  key_count: number;
  last_activity_at: string | null;
}

interface ApiKeyRow {
  id: string;
  user_id: number;
  name: string | null;
  prefix: string;
  tier: string;
  status: string;
  total_calls: number;
  last_used_at: string | null;
  created_at: string | null;
  user_email: string | null;
}

/* ─── Mini data-viz primitives ────────────────────────────────────────── */

const ACCENT = "#0d3cfc";
const ACCENT_TRACK = "#E2E7EE";
const SEG = ["#0d3cfc", "#4f6dfd", "#9DB0FE", "#C9D2FE", "#E5EAFD"];

function TierMixBar({ counts, catalog }: { counts: Record<string, number>; catalog: ApiTierDef[] }) {
  const rows = catalog.map((t) => ({ id: t.id, label: t.name, count: counts[t.id] ?? 0 }));
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div>
      <div className="flex gap-0.5 h-2.5 rounded-full overflow-hidden" style={{ background: ACCENT_TRACK }}>
        {total > 0 &&
          rows.map((r, i) =>
            r.count > 0 ? (
              <div key={r.id} style={{ flexGrow: r.count, flexBasis: 0, background: SEG[i % SEG.length] }} />
            ) : null,
          )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: SEG[i % SEG.length] }} />
            <span className="text-xs text-gray-500">{r.label}</span>
            <span className="text-xs font-mono font-semibold text-gray-900">{r.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Simple MRR bar chart — 6 evenly-spaced bars. We don't have historical MRR
 *  in the metrics endpoint yet (AJ-2 only returns current), so each bar
 *  shows the current month's MRR replicated as a placeholder series. The
 *  shape is correct so when historical data lands the swap is one-liner. */
function MrrBars({ current }: { current: number }) {
  // Until /metrics returns history, project current as flat 6-month line.
  const series = Array.from({ length: 6 }, () => current);
  const max = Math.max(1, ...series);
  return (
    <div className="flex items-end gap-2 h-24">
      {series.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-sm"
            style={{ height: `${(v / max) * 100}%`, background: i === series.length - 1 ? ACCENT : "#A9B7FE" }}
            title={`$${v.toLocaleString()}`}
          />
        </div>
      ))}
    </div>
  );
}

/* ─── Confirmation dialog ─────────────────────────────────────────────── */

type ConfirmState =
  | null
  | {
      action: "disable" | "enable" | "revoke";
      keyId: string;
      prefix: string;
      owner: string;
    };

function actionCopy(a: NonNullable<ConfirmState>["action"]) {
  switch (a) {
    case "disable":
      return {
        title: "Disable this API key?",
        body: "The key will stop accepting new requests immediately. You can re-enable it any time — historical usage is preserved.",
        button: "Disable key",
        destructive: false as const,
      };
    case "enable":
      return {
        title: "Re-enable this API key?",
        body: "The key will resume accepting requests using the owner's current tier limits.",
        button: "Enable key",
        destructive: false as const,
      };
    case "revoke":
      return {
        title: "Permanently revoke this key?",
        body: "Revoke is irreversible. The key string is invalidated forever and cannot be reactivated. The customer will need to generate a new key from their portal.",
        button: "Revoke forever",
        destructive: true as const,
      };
  }
}

/* ─── Page ────────────────────────────────────────────────────────────── */

export default function ApiPlatformPage() {
  usePageTitle("API Platform");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [userSearch, setUserSearch] = useState("");
  const [userTierFilter, setUserTierFilter] = useState<string>("all");
  const [userStatusFilter, setUserStatusFilter] = useState<string>("all");
  const [keyStatusFilter, setKeyStatusFilter] = useState<string>("all");
  const [keyTierFilter, setKeyTierFilter] = useState<string>("all");
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  /* ── Queries ────────────────────────────────────────────────── */

  const metricsQuery = useQuery<MetricsResponse>({
    queryKey: ["/api/admin/api-platform/metrics"],
    queryFn: () => apiRequest("GET", "/api/admin/api-platform/metrics").then((r) => r.json()),
  });

  const usersQuery = useQuery<{ users: ApiUserRow[] }>({
    queryKey: ["/api/admin/api-platform/users"],
    queryFn: () => apiRequest("GET", "/api/admin/api-platform/users").then((r) => r.json()),
  });

  const keysQuery = useQuery<{ keys: ApiKeyRow[] }>({
    queryKey: ["/api/admin/api-platform/keys"],
    queryFn: () => apiRequest("GET", "/api/admin/api-platform/keys").then((r) => r.json()),
  });

  /* ── Mutations ─────────────────────────────────────────────── */

  const keyMutation = useMutation({
    mutationFn: async ({ keyId, action }: { keyId: string; action: "disable" | "enable" | "revoke" }) => {
      const res = await apiRequest("POST", `/api/admin/api-platform/keys/${keyId}/${action}`);
      return res.json();
    },
    onSuccess: (_d, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/api-platform/keys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/api-platform/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/api-platform/metrics"] });
      toast({
        title:
          action === "disable" ? "Key disabled" :
          action === "enable" ? "Key re-enabled" :
          "Key revoked",
      });
    },
    onError: (err: any) => {
      toast({ title: "Key update failed", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  /* ── Derived ────────────────────────────────────────────────── */

  const metrics = metricsQuery.data;
  const tierCatalog: ApiTierDef[] = metrics?.tier_catalog ?? [];
  const tierPriceById = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tierCatalog) m.set(t.id, t.priceMonthly);
    return m;
  }, [tierCatalog]);

  const users = usersQuery.data?.users ?? [];
  const keys = keysQuery.data?.keys ?? [];

  const activeCustomerCount = users.filter((u) => u.status === "active").length;

  // MRR — sum across active subs using the tier catalog from /metrics.
  const computedMrr = useMemo(() => {
    let total = 0;
    for (const u of users) {
      if (u.status === "active") total += tierPriceById.get(u.tier) ?? 0;
    }
    return total;
  }, [users, tierPriceById]);

  // Top tier by customer count (active + trialing).
  const topTier = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) {
      if (u.status === "active" || u.status === "trialing") {
        counts[u.tier] = (counts[u.tier] ?? 0) + 1;
      }
    }
    let best: { id: string; count: number } | null = null;
    for (const [id, count] of Object.entries(counts)) {
      if (!best || count > best.count) best = { id, count };
    }
    if (!best) return null;
    const def = tierCatalog.find((t) => t.id === best!.id);
    return { id: best.id, name: def?.name ?? best.id, count: best.count };
  }, [users, tierCatalog]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase().trim();
    return users.filter((u) => {
      if (userTierFilter !== "all" && u.tier !== userTierFilter) return false;
      if (userStatusFilter !== "all" && u.status !== userStatusFilter) return false;
      if (q) {
        const hay = `${u.name ?? ""} ${u.email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, userSearch, userTierFilter, userStatusFilter]);

  const filteredKeys = useMemo(() => {
    return keys.filter((k) => {
      if (keyStatusFilter !== "all" && k.status !== keyStatusFilter) return false;
      if (keyTierFilter !== "all" && k.tier !== keyTierFilter) return false;
      return true;
    });
  }, [keys, keyStatusFilter, keyTierFilter]);

  const knownTierIds = tierCatalog.length
    ? tierCatalog.map((t) => t.id)
    : ["free", "starter", "growth", "scale"];

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <AdminLayout pageContext={{ page: "API Platform" }}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Platform</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage API customers, keys, and revenue across all tiers.
          </p>
        </div>

        {/* 4-tile metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 auto-rows-fr">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <UsersIcon className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-gray-900">
                  {metricsQuery.isLoading ? <Skeleton className="h-6 w-12" /> : activeCustomerCount.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">API customers</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
                <Activity className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-gray-900">
                  {metricsQuery.isLoading ? <Skeleton className="h-6 w-16" /> : (metrics?.calls_today ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">
                  Calls today / {(metrics?.calls_this_month ?? 0).toLocaleString()} MTD
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-gray-900">
                  {metricsQuery.isLoading ? <Skeleton className="h-6 w-16" /> : `$${computedMrr.toLocaleString()}`}
                </p>
                <p className="text-xs text-gray-500">MRR</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                <KeyRound className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-gray-900">
                  {metricsQuery.isLoading ? <Skeleton className="h-6 w-20" /> :
                    topTier ? topTier.name : "--"}
                </p>
                <p className="text-xs text-gray-500">
                  Top tier {topTier ? `(${topTier.count} customers)` : ""}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="users" className="w-full">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="keys">Keys</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
          </TabsList>

          {/* ─── Users tab ──────────────────────────────────────── */}
          <TabsContent value="users" className="mt-4 space-y-4">
            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search by name or email..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={userTierFilter} onValueChange={setUserTierFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Tier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tiers</SelectItem>
                  {knownTierIds.map((id) => (
                    <SelectItem key={id} value={id}>{tierBadge(id).label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={userStatusFilter} onValueChange={setUserStatusFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="trialing">Trialing</SelectItem>
                  <SelectItem value="past_due">Past due</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card className="overflow-hidden">
              {usersQuery.isLoading ? (
                <div className="p-6 space-y-3">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : users.length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-500">
                  <Plug className="w-8 h-8 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium text-gray-700 mb-1">No API customers yet</p>
                  <p className="max-w-md mx-auto">
                    API customers are developers who've subscribed to the public API platform.
                    They consume <span className="font-mono text-gray-700">api.wefixtrades.com</span> endpoints under
                    a monthly call quota. Customer signups will appear here automatically.
                  </p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-500">
                  No customers match your filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50/50 text-xs font-medium uppercase tracking-wider text-gray-500">
                        <th className="text-left px-4 py-3">User</th>
                        <th className="text-left px-4 py-3">Tier</th>
                        <th className="text-left px-4 py-3">Status</th>
                        <th className="text-right px-4 py-3">Keys</th>
                        <th className="text-right px-4 py-3">Calls (period)</th>
                        <th className="text-left px-4 py-3">Last activity</th>
                        <th className="text-right px-4 py-3">MRR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredUsers.map((u) => {
                        const tier = tierBadge(u.tier);
                        const st = subStatusBadge(u.status);
                        const mrr = u.status === "active" ? (tierPriceById.get(u.tier) ?? 0) : 0;
                        return (
                          <tr key={u.user_id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3">
                              <Link
                                href={`/admin/api-platform/users/${u.user_id}`}
                                className="text-blue-600 hover:text-blue-800 font-medium"
                              >
                                {u.name ?? u.email ?? `User #${u.user_id}`}
                              </Link>
                              {u.email && (
                                <div className="text-xs text-gray-400">{u.email}</div>
                              )}
                            </td>
                            <td className="px-4 py-3"><Badge config={tier} /></td>
                            <td className="px-4 py-3"><Badge config={st} /></td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-700">{u.key_count}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                              {u.monthly_calls_used.toLocaleString()}
                              <span className="text-gray-400">
                                {" "}/ {u.monthly_call_quota.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs">
                              {u.last_activity_at
                                ? new Date(u.last_activity_at).toLocaleDateString("en-US", {
                                    month: "short", day: "numeric", year: "numeric",
                                  })
                                : "--"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-gray-700">
                              ${mrr.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ─── Keys tab ───────────────────────────────────────── */}
          <TabsContent value="keys" className="mt-4 space-y-4">
            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <Select value={keyStatusFilter} onValueChange={setKeyStatusFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                </SelectContent>
              </Select>
              <Select value={keyTierFilter} onValueChange={setKeyTierFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Tier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tiers</SelectItem>
                  {knownTierIds.map((id) => (
                    <SelectItem key={id} value={id}>{tierBadge(id).label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 md:ml-auto">
                Audit-logged via <code className="font-mono">admin_activity_log</code>.
              </p>
            </div>

            <Card className="overflow-hidden">
              {keysQuery.isLoading ? (
                <div className="p-6 space-y-3">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : keys.length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-500">
                  <KeyRound className="w-8 h-8 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium text-gray-700 mb-1">No API keys issued</p>
                  <p>Customers haven't generated any keys yet.</p>
                </div>
              ) : filteredKeys.length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-500">
                  No keys match your filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50/50 text-xs font-medium uppercase tracking-wider text-gray-500">
                        <th className="text-left px-4 py-3">Prefix</th>
                        <th className="text-left px-4 py-3">Owner</th>
                        <th className="text-left px-4 py-3">Tier</th>
                        <th className="text-left px-4 py-3">Status</th>
                        <th className="text-left px-4 py-3">Created</th>
                        <th className="text-left px-4 py-3">Last used</th>
                        <th className="text-right px-4 py-3">Calls</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredKeys.map((k) => {
                        const tier = tierBadge(k.tier);
                        const st = keyStatusBadge(k.status);
                        return (
                          <tr key={k.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-gray-700">{k.prefix}…</td>
                            <td className="px-4 py-3 text-xs">
                              <Link
                                href={`/admin/api-platform/users/${k.user_id}`}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                {k.user_email ?? `User #${k.user_id}`}
                              </Link>
                            </td>
                            <td className="px-4 py-3"><Badge config={tier} /></td>
                            <td className="px-4 py-3"><Badge config={st} /></td>
                            <td className="px-4 py-3 text-gray-500 text-xs">
                              {k.created_at ? new Date(k.created_at).toLocaleDateString() : "--"}
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs">
                              {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "--"}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                              {k.total_calls.toLocaleString()}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3 justify-end">
                                {k.status === "active" ? (
                                  <button
                                    onClick={() => setConfirm({ action: "disable", keyId: k.id, prefix: k.prefix, owner: k.user_email ?? `User #${k.user_id}` })}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-800 disabled:opacity-50"
                                    disabled={keyMutation.isPending}
                                  >
                                    <Ban className="w-3 h-3" />Disable
                                  </button>
                                ) : k.status === "disabled" ? (
                                  <button
                                    onClick={() => setConfirm({ action: "enable", keyId: k.id, prefix: k.prefix, owner: k.user_email ?? `User #${k.user_id}` })}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-800 disabled:opacity-50"
                                    disabled={keyMutation.isPending}
                                  >
                                    <Power className="w-3 h-3" />Enable
                                  </button>
                                ) : null}
                                {k.status !== "revoked" && (
                                  <button
                                    onClick={() => setConfirm({ action: "revoke", keyId: k.id, prefix: k.prefix, owner: k.user_email ?? `User #${k.user_id}` })}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
                                    disabled={keyMutation.isPending}
                                  >
                                    <Trash2 className="w-3 h-3" />Revoke
                                  </button>
                                )}
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
          </TabsContent>

          {/* ─── Revenue tab ────────────────────────────────────── */}
          <TabsContent value="revenue" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                    MRR — last 6 months
                  </p>
                  <p className="text-sm font-mono font-semibold text-gray-900">
                    ${computedMrr.toLocaleString()}
                  </p>
                </div>
                {metricsQuery.isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : (
                  <MrrBars current={computedMrr} />
                )}
                <p className="text-xs text-gray-400 mt-3">
                  Historical MRR series lands once <code className="font-mono">api_subscription_events</code> backfill completes.
                </p>
              </Card>
              <Card className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">Tier mix</p>
                {metricsQuery.isLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : tierCatalog.length === 0 ? (
                  <p className="text-sm text-gray-500">Tier catalog unavailable.</p>
                ) : (
                  <TierMixBar counts={metrics?.subscriptions_by_tier ?? {}} catalog={tierCatalog} />
                )}
              </Card>
            </div>

            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-3">Tier pricing</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-medium uppercase tracking-wider text-gray-500 border-b">
                      <th className="text-left px-3 py-2">Tier</th>
                      <th className="text-right px-3 py-2">Monthly</th>
                      <th className="text-right px-3 py-2">Annual</th>
                      <th className="text-right px-3 py-2">Quota / mo</th>
                      <th className="text-right px-3 py-2">Rate / min</th>
                      <th className="text-right px-3 py-2">Active subs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tierCatalog.map((t) => (
                      <tr key={t.id}>
                        <td className="px-3 py-2"><Badge config={tierBadge(t.id)} /></td>
                        <td className="px-3 py-2 text-right font-mono">${t.priceMonthly.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-mono">${t.priceAnnual.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-mono">{t.monthlyCallQuota.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-mono">{t.rateLimitPerMinute.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-mono">{metrics?.subscriptions_by_tier?.[t.id] ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Confirmation modal ─────────────────────────────────── */}
      <AlertDialog open={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          {confirm && (() => {
            const copy = actionCopy(confirm.action);
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>{copy.title}</AlertDialogTitle>
                  <AlertDialogDescription>
                    <span className="block mb-2">
                      Key <span className="font-mono">{confirm.prefix}…</span> belongs to{" "}
                      <span className="font-medium text-gray-900">{confirm.owner}</span>.
                    </span>
                    {copy.body}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className={copy.destructive ? "bg-rose-600 hover:bg-rose-700" : ""}
                    onClick={() => {
                      keyMutation.mutate({ keyId: confirm.keyId, action: confirm.action });
                      setConfirm(null);
                    }}
                  >
                    {copy.button}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
