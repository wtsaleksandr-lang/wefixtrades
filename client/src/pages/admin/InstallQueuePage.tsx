/**
 * Admin queue for the chat widget install service.
 *
 * Mounted at /admin/install-queue.
 *
 * Lists all install requests, filterable by status. Click row → modal with
 * full form responses + status/assign/notes controls.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/usePageTitle";
import AdminLayout from "@/components/admin/AdminLayout";
import BackButton from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ExternalLink, Wrench, Sparkles } from "lucide-react";

const STATUSES = [
  "awaiting_payment",
  "awaiting_form",
  "form_submitted",
  "in_progress",
  "completed",
  "cancelled",
];

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  awaiting_payment: { label: "Awaiting payment", tone: "amber" },
  awaiting_form: { label: "Awaiting form", tone: "amber" },
  form_submitted: { label: "Form submitted", tone: "indigo" },
  in_progress: { label: "In progress", tone: "blue" },
  completed: { label: "Completed", tone: "emerald" },
  cancelled: { label: "Cancelled", tone: "gray" },
};

const TONE_STYLES: Record<string, string> = {
  amber: "bg-amber-50 border-amber-200 text-amber-800",
  indigo: "bg-brand-blue-50 border-brand-blue-200 text-brand-blue-800",
  blue: "bg-blue-50 border-blue-200 text-blue-800",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
  gray: "bg-gray-50 border-gray-200 text-gray-700",
};

interface QueueRow {
  request: {
    id: number;
    status: string;
    website_url: string | null;
    website_platform: string | null;
    paid_at: string | null;
    is_pro_at_request: number;
    created_at: string;
    form_submitted_at: string | null;
  };
  client: { id: number; business_name: string; contact_email: string | null } | null;
}

export default function InstallQueuePage() {
  usePageTitle("Install queue");
  const [statusFilter, setStatusFilter] = useState<string | "all">("all");
  const [openId, setOpenId] = useState<number | null>(null);

  const query = useQuery<{ rows: QueueRow[] }>({
    queryKey: ["/api/admin/install-queue", statusFilter],
    queryFn: () => {
      const url = statusFilter === "all"
        ? "/api/admin/install-queue"
        : `/api/admin/install-queue?status=${statusFilter}`;
      return fetch(url, { credentials: "include" }).then((r) => r.json());
    },
  });

  return (
    <AdminLayout>
      <div className="space-y-5">
        <BackButton to="/admin/crm" label="Back to admin" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chat widget install queue</h1>
          <p className="text-sm text-gray-600 mt-1">
            Service-delivery queue for the $79 chat-widget install (free for Pro tier).
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${statusFilter === "all" ? "bg-brand-blue-600 border-brand-blue-600 text-white" : "border-gray-200 text-gray-700"}`}
          >
            All
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${statusFilter === s ? "bg-brand-blue-600 border-brand-blue-600 text-white" : "border-gray-200 text-gray-700"}`}
            >
              {STATUS_LABELS[s]?.label ?? s}
            </button>
          ))}
        </div>

        {query.isLoading ? (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {Array.from({ length: 5 }).map((_, r) => (
                  <tr key={r} className="border-t border-gray-100">
                    {Array.from({ length: 6 }).map((_, c) => (
                      <td key={c} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider">Business</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider">Site</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider">Platform</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider">Tier</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider">Created</th>
                </tr>
              </thead>
              <tbody>
                {(query.data?.rows ?? []).map(({ request, client }) => {
                  const tone = STATUS_LABELS[request.status]?.tone ?? "gray";
                  return (
                    <tr
                      key={request.id}
                      onClick={() => setOpenId(request.id)}
                      className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{client?.business_name ?? "—"}</div>
                        <div className="text-xs text-gray-500">{client?.contact_email}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {request.website_url ? (
                          <a href={request.website_url} target="_blank" rel="noopener noreferrer" className="text-brand-blue-600 inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {request.website_url} <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs capitalize">{request.website_platform ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-[10px] ${TONE_STYLES[tone]}`}>
                          {STATUS_LABELS[request.status]?.label ?? request.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {request.is_pro_at_request === 1 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700"><Sparkles className="w-3 h-3" /> Pro</span>
                        ) : request.paid_at ? (
                          "Starter (paid)"
                        ) : (
                          "Starter"
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(request.created_at).toLocaleString()}</td>
                    </tr>
                  );
                })}
                {(query.data?.rows ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">
                      <Wrench className="w-5 h-5 mx-auto mb-2 text-gray-300" />
                      No install requests match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {openId && <InstallDetailDialog id={openId} onClose={() => setOpenId(null)} />}
    </AdminLayout>
  );
}

function InstallDetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const detail = useQuery<{ request: any; client: any }>({
    queryKey: [`/api/admin/install-queue/${id}`],
    queryFn: () => fetch(`/api/admin/install-queue/${id}`, { credentials: "include" }).then((r) => r.json()),
  });

  const [adminNotes, setAdminNotes] = useState<string>("");

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/install-queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Patch failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/install-queue"] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/install-queue/${id}`] });
    },
  });

  const r = detail.data?.request;
  const c = detail.data?.client;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Install request #{id}</DialogTitle>
        </DialogHeader>
        {!detail.data && <Skeleton className="h-64" />}
        {r && (
          <div className="space-y-4 text-sm">
            <div>
              <div className="font-semibold text-gray-900">{c?.business_name}</div>
              <div className="text-xs text-gray-500">{c?.contact_email} {c?.contact_phone ? `· ${c.contact_phone}` : ""}</div>
            </div>
            <Field label="Website URL" value={r.website_url} />
            <Field label="Platform" value={r.website_platform} />
            <Field label="Access method" value={r.access_method} />
            {r.access_method === "credentials" && <Field label="Credentials (encrypted)" value={r.access_credentials_encrypted ? "Provided" : "Not provided"} />}
            <Field label="Widget position" value={r.widget_position} />
            <Field label="Greeting" value={r.greeting_message} />
            <Field label="Excluded pages" value={r.excluded_pages?.join("\n")} multiline />
            <Field label="Customer notes" value={r.customer_notes} multiline />
            {r.paid_at && <Field label="Paid at" value={new Date(r.paid_at).toLocaleString()} />}
            <Field label="Form submitted" value={r.form_submitted_at ? new Date(r.form_submitted_at).toLocaleString() : "—"} />
            <Field label="Started" value={r.started_at ? new Date(r.started_at).toLocaleString() : "—"} />
            <Field label="Completed" value={r.completed_at ? new Date(r.completed_at).toLocaleString() : "—"} />

            <div className="border-t border-gray-100 pt-4">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1 block">Admin notes</label>
              <Textarea
                value={adminNotes || r.admin_notes || ""}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => patch.mutate({ status: "in_progress", admin_notes: adminNotes || undefined })}
            disabled={patch.isPending || r?.status === "in_progress" || r?.status === "completed"}
          >
            Mark in progress
          </Button>
          <Button
            size="sm"
            onClick={() => patch.mutate({ status: "completed", admin_notes: adminNotes || undefined })}
            disabled={patch.isPending || r?.status === "completed"}
          >
            Mark completed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, multiline }: { label: string; value: any; multiline?: boolean }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">{label}</div>
      {multiline ? (
        <pre className="text-sm whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded px-2 py-1 font-mono">{String(value)}</pre>
      ) : (
        <div className="text-sm text-gray-900">{String(value)}</div>
      )}
    </div>
  );
}
