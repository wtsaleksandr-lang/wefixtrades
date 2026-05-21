/**
 * Admin → API Platform → User detail (Wave AJ-4).
 *
 * Consumes GET /api/admin/api-platform/users/:userId from PR #394 (AJ-2).
 * Sections: user header, subscription card, keys table, 30-day usage chart,
 * recent usage logs, optional audit history (feature-detected).
 */

import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  ChevronLeft,
  Pause,
  Play,
  DollarSign,
  Ban,
  Power,
  Trash2,
  KeyRound,
  AlertTriangle,
  RotateCcw,
  Webhook,
} from "lucide-react";

/* ─── Shared badges (kept local — index page has its own copy) ────────── */

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

const tierBadge = (id: string) => TIER_BADGE[id] ?? { label: id, bg: "bg-gray-100", text: "text-gray-600" };
const subStatusBadge = (s: string) => SUB_STATUS_BADGE[s] ?? { label: s, bg: "bg-gray-100", text: "text-gray-500" };
const keyStatusBadge = (s: string) => KEY_STATUS_BADGE[s] ?? { label: s, bg: "bg-gray-100", text: "text-gray-500" };

/* ─── Types — must mirror server response ─────────────────────────────── */

interface UserDetailResponse {
  user: { id: number; email: string | null; name: string | null; role: string } | null;
  subscription: {
    user_id: number;
    tier: string;
    status: string;
    monthly_call_quota: number;
    monthly_calls_used: number;
    reset_at: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    created_at: string | null;
  } | null;
  keys: {
    id: string;
    name: string | null;
    prefix: string;
    tier: string;
    status: string;
    total_calls: number;
    last_used_at: string | null;
    created_at: string | null;
    expires_at: string | null;
  }[];
  recent_usage: {
    id: number;
    created_at: string;
    endpoint: string;
    method: string;
    status_code: number;
    response_ms: number;
  }[];
  daily_calls: { day: string; calls: number }[];
  /** Wave AQ-3 — last 20 webhook deliveries across the user's subscriptions. */
  webhook_deliveries?: {
    id: number;
    webhook_id: string;
    event_id: string;
    event_type: string;
    status: "pending" | "succeeded" | "failed" | "dead" | string;
    attempt_count: number;
    next_attempt_at: string | null;
    last_response_status: number | null;
    last_error: string | null;
    succeeded_at: string | null;
    created_at: string;
  }[];
}

/* ─── Mini usage sparkline ────────────────────────────────────────────── */

function UsageChart({ data }: { data: { day: string; calls: number }[] }) {
  if (data.length < 2) {
    return (
      <div className="h-32 flex items-center justify-center text-xs text-gray-400">
        Not enough data yet — usage will appear here once this customer starts hitting the API.
      </div>
    );
  }
  const w = 600, h = 120, pad = 6;
  const max = Math.max(1, ...data.map((d) => d.calls));
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
    const y = pad + (1 - d.calls / max) * (h - 2 * pad);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-32">
      <defs>
        <linearGradient id="api-usage-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0d3cfc" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#0d3cfc" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#api-usage-fill)" />
      <path d={line} fill="none" stroke="#0d3cfc" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ─── Confirmation states ─────────────────────────────────────────────── */

type KeyConfirm =
  | null
  | { action: "disable" | "enable" | "revoke"; keyId: string; prefix: string };

type SubConfirm =
  | null
  | { action: "suspend" | "resume" | "refund" };

function keyActionCopy(a: NonNullable<KeyConfirm>["action"]) {
  switch (a) {
    case "disable": return { title: "Disable this API key?", body: "Stops accepting new requests. Re-enable any time.", button: "Disable key", destructive: false };
    case "enable":  return { title: "Re-enable this API key?", body: "Resume accepting requests with the customer's current tier limits.", button: "Enable key", destructive: false };
    case "revoke":  return { title: "Permanently revoke this key?", body: "Revoke is irreversible. The customer must generate a new key.", button: "Revoke forever", destructive: true };
  }
}

/* ─── Page ────────────────────────────────────────────────────────────── */

export default function ApiPlatformUserDetailPage({ userId }: { userId: string }) {
  usePageTitle("API Platform — User");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const userIdNum = Number.parseInt(userId, 10);

  const [keyConfirm, setKeyConfirm] = useState<KeyConfirm>(null);
  const [subConfirm, setSubConfirm] = useState<SubConfirm>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");

  /* ── Queries ────────────────────────────────────────────────── */

  const detailQuery = useQuery<UserDetailResponse>({
    queryKey: [`/api/admin/api-platform/users/${userIdNum}`],
    queryFn: () => apiRequest("GET", `/api/admin/api-platform/users/${userIdNum}`).then((r) => r.json()),
    enabled: Number.isFinite(userIdNum),
  });

  // Feature-detect AI-3c's audit log endpoint. Returns [] on 404 so the
  // section renders an "audit history not yet enabled" stub gracefully.
  const auditQuery = useQuery<{ entries: { id: number; created_at: string; action: string; summary: string; actor_name: string | null }[] } | null>({
    queryKey: [`/api/admin/api-platform/users/${userIdNum}/audit`],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/admin/api-platform/users/${userIdNum}/audit`, { credentials: "include" });
        if (res.status === 404) return null;
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    enabled: Number.isFinite(userIdNum),
    retry: false,
  });

  /* ── Mutations ─────────────────────────────────────────────── */

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/admin/api-platform/users/${userIdNum}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/api-platform/users"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/api-platform/keys"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/api-platform/metrics"] });
  };

  const keyMutation = useMutation({
    mutationFn: async ({ keyId, action }: { keyId: string; action: "disable" | "enable" | "revoke" }) => {
      const res = await apiRequest("POST", `/api/admin/api-platform/keys/${keyId}/${action}`);
      return res.json();
    },
    onSuccess: (_d, { action }) => {
      invalidate();
      toast({
        title:
          action === "disable" ? "Key disabled" :
          action === "enable"  ? "Key re-enabled" :
                                 "Key revoked",
      });
    },
    onError: (err: any) => {
      toast({ title: "Key update failed", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/api-platform/subscriptions/${userIdNum}/suspend`);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Subscription paused" });
    },
    onError: (err: any) => {
      toast({ title: "Suspend failed", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  const refundMutation = useMutation({
    mutationFn: async (payload: { reason: string | null; amount_cents: number | null }) => {
      const res = await apiRequest("POST", `/api/admin/api-platform/subscriptions/${userIdNum}/refund`, payload);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Refund intent recorded", description: "Process the Stripe refund out-of-band." });
      setRefundAmount("");
      setRefundReason("");
    },
    onError: (err: any) => {
      toast({ title: "Refund intent failed", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  /* ── Derived ────────────────────────────────────────────────── */

  const detail = detailQuery.data;
  const user = detail?.user ?? null;
  const sub = detail?.subscription ?? null;
  const keys = detail?.keys ?? [];
  const recent = detail?.recent_usage ?? [];
  const daily = detail?.daily_calls ?? [];
  const webhookDeliveries = detail?.webhook_deliveries ?? [];

  /* Wave AQ-3 — replay a failed/dead delivery. Server resets attempt
   * count and rewinds status='pending' so the next worker tick picks
   * the row up. */
  const replayMutation = useMutation({
    mutationFn: async (deliveryId: number) => {
      const res = await apiRequest(
        "POST",
        `/api/admin/api-platform/webhook-deliveries/${deliveryId}/replay`,
      );
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Delivery replayed", description: "Will fire on the next worker tick." });
    },
    onError: (err: any) => {
      toast({
        title: "Replay failed",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    },
  });

  const initials = useMemo(() => {
    const src = user?.name || user?.email || "";
    return src
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";
  }, [user]);

  const quotaPct = sub && sub.monthly_call_quota > 0
    ? Math.min(100, Math.round((sub.monthly_calls_used / sub.monthly_call_quota) * 100))
    : 0;
  const quotaBarColor = quotaPct >= 90 ? "bg-rose-500" : quotaPct >= 70 ? "bg-amber-500" : "bg-emerald-500";

  /* ── Loading / not found ────────────────────────────────────── */

  if (!Number.isFinite(userIdNum)) {
    return (
      <AdminLayout pageContext={{ page: "API Platform — User" }}>
        <div className="p-12 text-center text-sm text-gray-500">
          <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-amber-500" />
          Invalid user id.
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout pageContext={{ page: "API Platform — User" }}>
      <div className="space-y-6">
        {/* Back link */}
        <Link
          href="/admin/api-platform"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
        >
          <ChevronLeft className="w-4 h-4" />
          API Platform
        </Link>

        {/* User header */}
        <Card className="p-5">
          {detailQuery.isLoading ? (
            <div className="flex items-center gap-4">
              <Skeleton className="w-12 h-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
          ) : !user ? (
            <p className="text-sm text-gray-500">User not found.</p>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">
                {initials}
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-gray-900">
                  {user.name ?? user.email ?? `User #${user.id}`}
                </h1>
                {user.email && (
                  <p className="text-sm text-gray-500">{user.email}</p>
                )}
              </div>
              <Link
                href={`/admin/crm/clients?user=${user.id}`}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                CRM record →
              </Link>
            </div>
          )}
        </Card>

        {/* Subscription card */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium uppercase tracking-wider text-gray-500">Subscription</h2>
            {sub && (
              <div className="flex items-center gap-2">
                <Badge config={tierBadge(sub.tier)} />
                <Badge config={subStatusBadge(sub.status)} />
              </div>
            )}
          </div>
          {detailQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !sub ? (
            <p className="text-sm text-gray-500">No active subscription.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-500">Period start</p>
                  <p className="text-sm text-gray-900">
                    {sub.current_period_start
                      ? new Date(sub.current_period_start).toLocaleDateString()
                      : "--"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Period end</p>
                  <p className="text-sm text-gray-900">
                    {sub.current_period_end
                      ? new Date(sub.current_period_end).toLocaleDateString()
                      : "--"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Quota</p>
                  <p className="text-sm font-mono text-gray-900">{sub.monthly_call_quota.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Used</p>
                  <p className="text-sm font-mono text-gray-900">{sub.monthly_calls_used.toLocaleString()}</p>
                </div>
              </div>
              {/* Quota progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Quota usage</span>
                  <span className="font-mono">{quotaPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full ${quotaBarColor}`} style={{ width: `${quotaPct}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                {sub.status !== "paused" && sub.status !== "cancelled" && sub.status !== "canceled" && (
                  <button
                    onClick={() => setSubConfirm({ action: "suspend" })}
                    disabled={suspendMutation.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-amber-200 bg-amber-50 text-amber-700 text-sm hover:bg-amber-100 disabled:opacity-50"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    Suspend
                  </button>
                )}
                {sub.status === "paused" && (
                  <button
                    onClick={() => setSubConfirm({ action: "resume" })}
                    disabled={suspendMutation.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm hover:bg-emerald-100 disabled:opacity-50"
                    title="Resume by clearing the paused state — currently sends the same suspend endpoint (toggle); will route to dedicated /resume once AJ-2 adds it."
                  >
                    <Play className="w-3.5 h-3.5" />
                    Resume
                  </button>
                )}
                <button
                  onClick={() => setSubConfirm({ action: "refund" })}
                  disabled={refundMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-rose-200 bg-rose-50 text-rose-700 text-sm hover:bg-rose-100 disabled:opacity-50"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  Refund
                </button>
              </div>
            </>
          )}
        </Card>

        {/* Keys */}
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-gray-500">Keys</h2>
            <p className="text-xs text-gray-400">{keys.length} total</p>
          </div>
          {detailQuery.isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : keys.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">
              <KeyRound className="w-8 h-8 mx-auto mb-3 text-gray-300" />
              No keys issued yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/50 text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="text-left px-4 py-3">Prefix</th>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Tier</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Created</th>
                    <th className="text-left px-4 py-3">Last used</th>
                    <th className="text-right px-4 py-3">Calls</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {keys.map((k) => (
                    <tr key={k.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{k.prefix}…</td>
                      <td className="px-4 py-3 text-gray-700">{k.name ?? "--"}</td>
                      <td className="px-4 py-3"><Badge config={tierBadge(k.tier)} /></td>
                      <td className="px-4 py-3"><Badge config={keyStatusBadge(k.status)} /></td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {k.created_at ? new Date(k.created_at).toLocaleDateString() : "--"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "--"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {k.total_calls.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 justify-end">
                          {k.status === "active" && (
                            <button
                              onClick={() => setKeyConfirm({ action: "disable", keyId: k.id, prefix: k.prefix })}
                              disabled={keyMutation.isPending}
                              className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-800 disabled:opacity-50"
                            >
                              <Ban className="w-3 h-3" />Disable
                            </button>
                          )}
                          {k.status === "disabled" && (
                            <button
                              onClick={() => setKeyConfirm({ action: "enable", keyId: k.id, prefix: k.prefix })}
                              disabled={keyMutation.isPending}
                              className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-800 disabled:opacity-50"
                            >
                              <Power className="w-3 h-3" />Enable
                            </button>
                          )}
                          {k.status !== "revoked" && (
                            <button
                              onClick={() => setKeyConfirm({ action: "revoke", keyId: k.id, prefix: k.prefix })}
                              disabled={keyMutation.isPending}
                              className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
                            >
                              <Trash2 className="w-3 h-3" />Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Usage chart */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-gray-500">Calls — last 30 days</h2>
            <p className="text-sm font-mono font-semibold text-gray-900">
              {daily.reduce((s, d) => s + d.calls, 0).toLocaleString()}
            </p>
          </div>
          {detailQuery.isLoading ? <Skeleton className="h-32 w-full" /> : <UsageChart data={daily} />}
        </Card>

        {/* Recent usage logs */}
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h2 className="text-sm font-medium uppercase tracking-wider text-gray-500">Recent calls</h2>
          </div>
          {detailQuery.isLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : recent.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">No recent API calls.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/50 text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="text-left px-4 py-2">Time</th>
                    <th className="text-left px-4 py-2">Method</th>
                    <th className="text-left px-4 py-2">Endpoint</th>
                    <th className="text-right px-4 py-2">Status</th>
                    <th className="text-right px-4 py-2">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recent.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-700">{r.method}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-700 max-w-[280px] truncate">{r.endpoint}</td>
                      <td className={`px-4 py-2 text-right font-mono text-xs ${
                        r.status_code >= 500 ? "text-rose-600" :
                        r.status_code >= 400 ? "text-amber-600" :
                        "text-emerald-600"
                      }`}>
                        {r.status_code}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-gray-600">{r.response_ms}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Webhook deliveries (Wave AQ-3) */}
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Webhook className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-medium uppercase tracking-wider text-gray-500">
                Webhook deliveries
              </h2>
            </div>
            <p className="text-xs text-gray-400">last {webhookDeliveries.length}</p>
          </div>
          {detailQuery.isLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : webhookDeliveries.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">
              <Webhook className="w-8 h-8 mx-auto mb-3 text-gray-300" />
              No webhook deliveries yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/50 text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="text-left px-4 py-2">Time</th>
                    <th className="text-left px-4 py-2">Event</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-right px-4 py-2">HTTP</th>
                    <th className="text-right px-4 py-2">Attempts</th>
                    <th className="text-left px-4 py-2">Error</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {webhookDeliveries.map((d) => {
                    const statusColor =
                      d.status === "succeeded"
                        ? "text-emerald-700 bg-emerald-50"
                        : d.status === "failed"
                        ? "text-amber-700 bg-amber-50"
                        : d.status === "dead"
                        ? "text-rose-700 bg-rose-50"
                        : "text-gray-700 bg-gray-100";
                    const httpColor =
                      d.last_response_status == null
                        ? "text-gray-400"
                        : d.last_response_status >= 500
                        ? "text-rose-600"
                        : d.last_response_status >= 400
                        ? "text-amber-600"
                        : "text-emerald-600";
                    const replayable = d.status === "failed" || d.status === "dead";
                    return (
                      <tr key={d.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(d.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-700">{d.event_type}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}
                          >
                            {d.status}
                          </span>
                        </td>
                        <td className={`px-4 py-2 text-right font-mono text-xs ${httpColor}`}>
                          {d.last_response_status ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-gray-600">
                          {d.attempt_count}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500 max-w-[260px] truncate">
                          {d.last_error ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {replayable && (
                            <button
                              onClick={() => replayMutation.mutate(d.id)}
                              disabled={replayMutation.isPending}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Replay
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Audit history (feature-detected) */}
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h2 className="text-sm font-medium uppercase tracking-wider text-gray-500">Audit history</h2>
          </div>
          {auditQuery.isLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          ) : !auditQuery.data ? (
            <div className="p-6 text-xs text-gray-400">
              Audit history endpoint not yet available — will appear here once Wave AI-3c lands.
            </div>
          ) : auditQuery.data.entries.length === 0 ? (
            <div className="p-6 text-xs text-gray-400">No admin actions recorded for this user yet.</div>
          ) : (
            <div className="divide-y">
              {auditQuery.data.entries.map((a) => (
                <div key={a.id} className="px-5 py-3 flex items-center justify-between text-sm">
                  <div>
                    <p className="text-gray-900">{a.summary}</p>
                    <p className="text-xs text-gray-500">
                      {a.actor_name ?? "system"} · {a.action}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 whitespace-nowrap">
                    {new Date(a.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ─── Key confirmation modal ─────────────────────────────── */}
      <AlertDialog open={keyConfirm !== null} onOpenChange={(o) => { if (!o) setKeyConfirm(null); }}>
        <AlertDialogContent>
          {keyConfirm && (() => {
            const copy = keyActionCopy(keyConfirm.action);
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>{copy.title}</AlertDialogTitle>
                  <AlertDialogDescription>
                    <span className="block mb-2">
                      Key <span className="font-mono">{keyConfirm.prefix}…</span>
                    </span>
                    {copy.body}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className={copy.destructive ? "bg-rose-600 hover:bg-rose-700" : ""}
                    onClick={() => {
                      keyMutation.mutate({ keyId: keyConfirm.keyId, action: keyConfirm.action });
                      setKeyConfirm(null);
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

      {/* ─── Subscription confirmation modal ────────────────────── */}
      <AlertDialog open={subConfirm !== null} onOpenChange={(o) => { if (!o) setSubConfirm(null); }}>
        <AlertDialogContent>
          {subConfirm?.action === "suspend" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Suspend this subscription?</AlertDialogTitle>
                <AlertDialogDescription>
                  The customer's API access stops immediately. All keys keep their status, but every request returns
                  402 until you re-activate the subscription. Stripe billing is not cancelled.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-amber-600 hover:bg-amber-700"
                  onClick={() => { suspendMutation.mutate(); setSubConfirm(null); }}
                >
                  Suspend
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {subConfirm?.action === "resume" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Resume this subscription?</AlertDialogTitle>
                <AlertDialogDescription>
                  Re-activate the customer's API access. They'll begin accepting requests again under their current
                  tier quotas. (Currently routes through the suspend endpoint as a toggle — dedicated resume
                  endpoint pending in a follow-up.)
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => { suspendMutation.mutate(); setSubConfirm(null); }}
                >
                  Resume
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {subConfirm?.action === "refund" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Record a refund intent?</AlertDialogTitle>
                <AlertDialogDescription>
                  This logs the refund decision in <code className="font-mono">admin_activity_log</code>. The actual
                  Stripe refund is processed out-of-band (Wave AJ-2 only records intent — Stripe API integration is
                  pending).
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label htmlFor="refund-amount" className="text-xs">Amount (USD)</Label>
                  <Input
                    id="refund-amount"
                    type="number"
                    placeholder="e.g. 29"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="refund-reason" className="text-xs">Reason</Label>
                  <Textarea
                    id="refund-reason"
                    placeholder="Customer-facing reason or internal note"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                  />
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-rose-600 hover:bg-rose-700"
                  onClick={() => {
                    const cents = refundAmount ? Math.round(parseFloat(refundAmount) * 100) : null;
                    refundMutation.mutate({
                      reason: refundReason || null,
                      amount_cents: Number.isFinite(cents as number) ? cents : null,
                    });
                    setSubConfirm(null);
                  }}
                >
                  Record refund intent
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
