/**
 * Audit Leads viewer.
 *
 * Lists `audit_submissions` — every email captured by the free
 * website-audit tool's email gate. These rows were previously surfaced
 * by no route, so audit leads never reached the operator. Reads
 * GET /api/admin/crm/audit-submissions (see adminCrmRoutes.ts).
 *
 * Read-only — no editable form, so the copilot-form CI guard does not
 * apply. Linked from the admin sidebar at /admin/crm/audit-leads.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardList, RotateCw, Download, HelpCircle } from "lucide-react";
import { csvDownload, todayIso } from "@/lib/csvDownload";

interface AuditSubmission {
  id: number;
  business_name: string | null;
  email: string;
  phone: string | null;
  name: string | null;
  wants_help: boolean;
  local_visibility_score: number | null;
  mobile_speed_score: number | null;
  desktop_speed_score: number | null;
  issue_count: number;
  source_tool: string | null;
  source_page: string | null;
  created_at: string;
}

interface AuditSubmissionsResponse {
  data: AuditSubmission[];
  total: number;
}

const PAGE_SIZE = 50;

function scoreClass(score: number | null): string {
  if (score == null) return "text-gray-400";
  if (score >= 70) return "text-emerald-600";
  if (score >= 45) return "text-amber-600";
  return "text-red-600";
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

export default function AuditLeadsPage() {
  usePageTitle("Audit Leads");

  const [page, setPage] = useState(0);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<AuditSubmissionsResponse>({
    queryKey: ["/api/admin/crm/audit-submissions", { page }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      const res = await fetch(`/api/admin/crm/audit-submissions?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(`audit-submissions ${res.status}`);
      return res.json();
    },
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const hasNext = (page + 1) * PAGE_SIZE < total;

  const exportCsv = () => {
    if (!rows.length) return;
    csvDownload<AuditSubmission>({
      filename: `audit-leads-${todayIso()}.csv`,
      columns: [
        { header: "id", value: (r) => r.id },
        { header: "created_at", value: (r) => r.created_at },
        { header: "business_name", value: (r) => r.business_name },
        { header: "name", value: (r) => r.name },
        { header: "email", value: (r) => r.email },
        { header: "phone", value: (r) => r.phone },
        { header: "wants_help", value: (r) => (r.wants_help ? "yes" : "no") },
        { header: "local_visibility_score", value: (r) => r.local_visibility_score },
        { header: "mobile_speed_score", value: (r) => r.mobile_speed_score },
        { header: "desktop_speed_score", value: (r) => r.desktop_speed_score },
        { header: "issue_count", value: (r) => r.issue_count },
        { header: "source_tool", value: (r) => r.source_tool },
        { header: "source_page", value: (r) => r.source_page },
      ],
      rows,
    });
  };

  return (
    <AdminLayout pageContext={{ page: "audit-leads" }}>
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <span title="Emails captured by the free website-audit tool — your highest-intent inbound prospects." className="inline-flex"><HelpCircle className="w-3 h-3 text-gray-400 cursor-help" /></span>
              <ClipboardList className="w-5 h-5" />
              Audit Leads
            </h2>
            <p className="text-sm text-gray-500">
              Emails captured by the free website-audit tool · {total} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RotateCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
            Couldn't load audit leads.{" "}
            <button onClick={() => refetch()} className="underline font-medium">Retry</button>
          </div>
        )}

        {/* Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="hidden md:table-cell">Visibility</TableHead>
                <TableHead className="hidden md:table-cell">Speed (M/D)</TableHead>
                <TableHead className="hidden lg:table-cell">Issues</TableHead>
                <TableHead>Wants help</TableHead>
                <TableHead className="hidden sm:table-cell">Captured</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-gray-500">
                    No audit leads captured yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <span className="font-medium text-gray-900">{r.business_name || "-"}</span>
                      {r.source_tool && (
                        <p className="text-[11px] text-gray-400">{r.source_tool}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-700">{r.name || "-"}</div>
                      <a href={`mailto:${r.email}`} className="text-xs text-brand-blue hover:underline">{r.email}</a>
                      {r.phone && <div className="text-xs text-gray-500">{r.phone}</div>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className={`text-sm font-semibold ${scoreClass(r.local_visibility_score)}`}>
                        {r.local_visibility_score ?? "-"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-gray-600">
                        <span className={scoreClass(r.mobile_speed_score)}>{r.mobile_speed_score ?? "-"}</span>
                        {" / "}
                        <span className={scoreClass(r.desktop_speed_score)}>{r.desktop_speed_score ?? "-"}</span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-gray-600">{r.issue_count}</span>
                    </TableCell>
                    <TableCell>
                      {r.wants_help ? (
                        <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Yes</Badge>
                      ) : (
                        <span className="text-xs text-gray-400">No</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-xs text-gray-500">{formatTimestamp(r.created_at)}</span>
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
    </AdminLayout>
  );
}
