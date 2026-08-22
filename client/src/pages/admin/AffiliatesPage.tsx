/**
 * Affiliates admin.
 *
 * The operator surface for the affiliate program. Self-serve affiliates
 * register as status='pending' (schema default) and attribution only credits
 * 'active' ones — this page is where an admin activates / suspends them, sets
 * the commission tier, and overrides the commission rate. Reads
 * GET /api/admin/affiliates and writes PATCH /api/admin/affiliates/:id
 * (see server/routes/adminAffiliatesRoutes.ts).
 *
 * Linked from the admin sidebar (Finance) at /admin/crm/affiliates.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Share2, RotateCw, HelpCircle, CheckCircle2, Ban, SlidersHorizontal } from "lucide-react";

type AffiliateStatus = "pending" | "active" | "suspended";
type AffiliateTier = "base" | "pro" | "partner";

interface AffiliateRow {
  id: number;
  email: string;
  name: string | null;
  code: string;
  tier: AffiliateTier;
  status: AffiliateStatus;
  commission_rate: number;
  payout_method: string | null;
  owner_client_id: number | null;
  created_at: string;
  stats: { clicks: number; signups: number; pendingCents: number; paidCents: number };
}

interface AffiliatesResponse {
  data: AffiliateRow[];
  total: number;
}

const PAGE_SIZE = 50;
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];
const TIER_OPTIONS: AffiliateTier[] = ["base", "pro", "partner"];

/** Status pill styling — tinted palette (theme-safe, no white/black). */
function statusBadge(status: AffiliateStatus) {
  switch (status) {
    case "active":
      return <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Active</Badge>;
    case "suspended":
      return <Badge className="bg-red-50 text-red-700 hover:bg-red-50">Suspended</Badge>;
    case "pending":
    default:
      return <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50">Pending</Badge>;
  }
}

function pct(rate: number): string {
  return `${Math.round((Number(rate) || 0) * 1000) / 10}%`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AffiliatesPage() {
  usePageTitle("Affiliates");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<AffiliateRow | null>(null);

  const queryKey = ["/api/admin/affiliates", { status, page }] as const;

  const { data, isLoading, isError, refetch, isFetching } = useQuery<AffiliatesResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      if (status !== "all") params.set("status", status);
      const res = await fetch(`/api/admin/affiliates?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(`affiliates ${res.status}`);
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<Pick<AffiliateRow, "status" | "tier" | "commission_rate">> }) => {
      const res = await apiRequest("PATCH", `/api/admin/affiliates/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/affiliates"] });
      toast({ title: "Affiliate updated" });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err?.message ?? "Please try again.", variant: "destructive" });
    },
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const hasNext = (page + 1) * PAGE_SIZE < total;

  const setAffiliateStatus = (row: AffiliateRow, next: AffiliateStatus) =>
    mutation.mutate({ id: row.id, patch: { status: next } });
  const setAffiliateTier = (row: AffiliateRow, next: AffiliateTier) =>
    mutation.mutate({ id: row.id, patch: { tier: next } });

  return (
    <AdminLayout pageContext={{ page: "affiliates" }}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <span title="Public affiliates who earn recurring commission on referred customers. Activate a pending affiliate to start crediting their referrals." className="inline-flex"><HelpCircle className="w-3 h-3 text-gray-400 cursor-help" /></span>
              <Share2 className="w-5 h-5" />
              Affiliates
            </h2>
            <p className="text-sm text-gray-500">
              Manage affiliate status, tier &amp; commission · {total} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
              <SelectTrigger className="w-[160px]" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RotateCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
            Couldn't load affiliates.{" "}
            <button onClick={() => refetch()} className="underline font-medium">Retry</button>
          </div>
        )}

        {/* Table */}
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Affiliate</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="hidden md:table-cell">Tier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Rate</TableHead>
                <TableHead className="hidden lg:table-cell">Clicks / Signups</TableHead>
                <TableHead className="hidden xl:table-cell">Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-gray-500">
                    {status === "all" ? "No affiliates yet." : `No ${status} affiliates.`}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium text-gray-900">{r.name || "-"}</div>
                      <a href={`mailto:${r.email}`} className="text-xs text-brand-blue hover:underline">{r.email}</a>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs font-mono text-gray-700 bg-muted/60 rounded px-1.5 py-0.5">{r.code}</code>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Select value={r.tier} onValueChange={(v) => setAffiliateTier(r, v as AffiliateTier)} disabled={mutation.isPending}>
                        <SelectTrigger className="w-[110px] h-8 capitalize" aria-label={`Tier for ${r.code}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIER_OPTIONS.map((t) => (
                            <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-sm text-gray-700">{pct(r.commission_rate)}</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-gray-600">{r.stats.clicks} / {r.stats.signups}</span>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <span className="text-xs text-gray-500">{formatTimestamp(r.created_at)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        {r.status !== "active" && (
                          <Button size="sm" variant="outline" onClick={() => setAffiliateStatus(r, "active")} disabled={mutation.isPending} className="text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            Activate
                          </Button>
                        )}
                        {r.status !== "suspended" && (
                          <Button size="sm" variant="outline" onClick={() => setAffiliateStatus(r, "suspended")} disabled={mutation.isPending} className="text-red-700 border-red-200 hover:bg-red-50">
                            <Ban className="w-3.5 h-3.5 mr-1" />
                            Suspend
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setEditing(r)} aria-label={`Edit ${r.code}`}>
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Pagination */}
        {!isLoading && total > PAGE_SIZE && (
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              ← Newer
            </Button>
            <span className="text-xs text-gray-500">Page {page + 1}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!hasNext}>
              Older →
            </Button>
          </div>
        )}
      </div>

      <EditAffiliateDialog
        affiliate={editing}
        onClose={() => setEditing(null)}
        onSave={(patch) => {
          if (!editing) return;
          mutation.mutate(
            { id: editing.id, patch },
            { onSuccess: () => setEditing(null) },
          );
        }}
        saving={mutation.isPending}
      />
    </AdminLayout>
  );
}

/* ─── Edit dialog — status + tier + commission rate in one place ─── */
function EditAffiliateDialog({
  affiliate,
  onClose,
  onSave,
  saving,
}: {
  affiliate: AffiliateRow | null;
  onClose: () => void;
  onSave: (patch: Partial<Pick<AffiliateRow, "status" | "tier" | "commission_rate">>) => void;
  saving: boolean;
}) {
  const [status, setStatus] = useState<AffiliateStatus>("pending");
  const [tier, setTier] = useState<AffiliateTier>("base");
  const [ratePct, setRatePct] = useState("25");

  // Re-seed the form whenever a new affiliate opens the dialog.
  const [seededId, setSeededId] = useState<number | null>(null);
  if (affiliate && affiliate.id !== seededId) {
    setSeededId(affiliate.id);
    setStatus(affiliate.status);
    setTier(affiliate.tier);
    setRatePct(String(Math.round((affiliate.commission_rate || 0) * 1000) / 10));
  }

  const rateNum = parseFloat(ratePct);
  const rateValid = Number.isFinite(rateNum) && rateNum >= 0 && rateNum <= 100;

  const submit = () => {
    if (!affiliate) return;
    const patch: Partial<Pick<AffiliateRow, "status" | "tier" | "commission_rate">> = {};
    if (status !== affiliate.status) patch.status = status;
    if (tier !== affiliate.tier) patch.tier = tier;
    if (rateValid) {
      const asFraction = Math.round((rateNum / 100) * 10000) / 10000;
      if (asFraction !== affiliate.commission_rate) patch.commission_rate = asFraction;
    }
    onSave(patch);
  };

  return (
    <Dialog open={!!affiliate} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit affiliate {affiliate?.code}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={status} onValueChange={(v) => setStatus(v as AffiliateStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tier</label>
              <Select value={tier} onValueChange={(v) => setTier(v as AffiliateTier)}>
                <SelectTrigger className="capitalize"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIER_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Commission rate (%)</label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={ratePct}
                onChange={(e) => setRatePct(e.target.value)}
              />
            </div>
          </div>
          {!rateValid && (
            <p className="text-xs text-red-600">Rate must be a number between 0 and 100.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !rateValid} className="bg-brand-blue hover:bg-brand-blue-600">
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
