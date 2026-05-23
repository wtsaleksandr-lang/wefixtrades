/**
 * WaitlistPage — admin view for the Coming Soon product waitlist
 * (Wave W-AN-2). Lists signups for SocialSync / ReputationShield /
 * MapGuard (and any future product flagged comingSoon=true), grouped
 * by product, with a per-row "Mark as notified" action for when Alex
 * manually contacts an early-access user.
 */

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import BackButton from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/usePageTitle";

interface WaitlistRow {
  id: string;
  product_slug: string;
  email: string;
  phone: string | null;
  business_name: string | null;
  source: string | null;
  ip: string | null;
  user_agent: string | null;
  notified_at: string | null;
  created_at: string;
}

interface CountRow {
  product_slug: string;
  total: number;
  pending: number;
}

interface WaitlistResponse {
  rows: WaitlistRow[];
  counts: CountRow[];
}

export default function WaitlistPage() {
  usePageTitle("Product Waitlist");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<WaitlistResponse>({
    queryKey: ["/api/admin/marketing/waitlist"],
  });

  const notify = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/marketing/waitlist/${id}/notify`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/marketing/waitlist"] }),
  });

  const grouped = useMemo(() => {
    const rows = data?.rows ?? [];
    const map = new Map<string, WaitlistRow[]>();
    for (const r of rows) {
      const list = map.get(r.product_slug) ?? [];
      list.push(r);
      map.set(r.product_slug, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  const counts = data?.counts ?? [];

  return (
    <AdminLayout>
      <div data-theme="light" className="max-w-4xl mx-auto p-4 sm:p-6">
        <BackButton to="/admin/crm" label="Back to admin" className="mb-3" />
        <div className="mb-5">
          <h1 className="text-xl font-semibold text-gray-900">Product Waitlist</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Early-access signups for products in Coming Soon mode. Mark a row as notified once you've reached out.
          </p>
        </div>

        {counts.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
            {counts.map((c) => (
              <Card key={c.product_slug} className="p-3">
                <div className="text-xs text-gray-500 uppercase tracking-wide">{c.product_slug}</div>
                <div className="text-lg font-semibold text-gray-900 mt-1">
                  {c.total} total
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {c.pending} pending
                </div>
              </Card>
            ))}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : grouped.length === 0 ? (
          <Card className="p-8 text-center text-sm text-gray-500">
            No waitlist signups yet.
          </Card>
        ) : (
          <div className="space-y-6">
            {grouped.map(([slug, rows]) => (
              <div key={slug}>
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  {slug} <span className="text-gray-400 font-normal">({rows.length})</span>
                </h2>
                <div className="space-y-2">
                  {rows.map((r) => {
                    const notified = !!r.notified_at;
                    return (
                      <Card key={r.id} className={`p-4 ${notified ? "opacity-60" : ""}`}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-gray-900 break-all">{r.email}</p>
                              {notified ? (
                                <Badge variant="secondary" className="text-[10px]">Notified</Badge>
                              ) : (
                                <Badge className="text-[10px] bg-[#0d3cfc] text-white">Pending</Badge>
                              )}
                            </div>
                            {r.business_name && (
                              <p className="text-xs text-gray-600 mt-1">{r.business_name}</p>
                            )}
                            {r.phone && (
                              <p className="text-xs text-gray-500 mt-0.5">{r.phone}</p>
                            )}
                            <p className="text-[11px] text-gray-400 mt-1">
                              Signed up {new Date(r.created_at).toLocaleString()}
                              {notified && r.notified_at && (
                                <> · notified {new Date(r.notified_at).toLocaleString()}</>
                              )}
                            </p>
                          </div>
                          {!notified && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              disabled={notify.isPending}
                              onClick={() => notify.mutate(r.id)}
                            >
                              Mark as notified
                            </Button>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
