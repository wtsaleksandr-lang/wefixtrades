/**
 * Citation Builder — admin fulfilment queue.
 *
 * Mounted at /admin/crm/citation-builder.
 *
 * This is where the human operator actually does the work the customer paid
 * for. Before it existed the product took $79-$299 and had no surface capable
 * of moving an order off "pending".
 *
 * The screen is deliberately built around the per-directory checklist rather
 * than around the order's status field. There is no progress input and no
 * "mark completed" shortcut: the customer's progress bar, the progress email
 * and the completion report are all consequences of the rows recorded here.
 * `live` needs the listing URL, `rejected` and `not applicable` need a
 * reason, and the Complete button stays disabled — with the server's reason
 * shown next to it — until every directory has an outcome.
 *
 * Mirrors InstallQueuePage.tsx (list + pill filters + detail dialog).
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin/AdminLayout";
import BackButton from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ClipboardList, ExternalLink, Info } from "lucide-react";

const STATUSES = ["pending", "in_progress", "awaiting_info", "completed"];

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Pending", tone: "amber" },
  in_progress: { label: "In progress", tone: "blue" },
  awaiting_info: { label: "Awaiting info", tone: "rose" },
  completed: { label: "Completed", tone: "emerald" },
};

const TASK_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  not_started: { label: "Not started", tone: "gray" },
  submitted: { label: "Submitted", tone: "blue" },
  live: { label: "Live", tone: "emerald" },
  rejected: { label: "Rejected", tone: "rose" },
  not_applicable: { label: "Not applicable", tone: "gray" },
};

const TONE_STYLES: Record<string, string> = {
  amber: "bg-amber-50 border-amber-200 text-amber-800",
  blue: "bg-blue-50 border-blue-200 text-blue-800",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
  rose: "bg-rose-50 border-rose-200 text-rose-800",
  gray: "bg-gray-50 border-gray-200 text-gray-700",
};

const TIER_LABELS: Record<string, string> = {
  starter: "Starter · $79",
  pro: "Pro · $179",
  premium: "Premium · $299",
};

interface BusinessInfo {
  name?: string;
  address?: string;
  phone?: string;
  website?: string;
  categories?: string[];
}

interface QueueRow {
  id: string;
  tier: string;
  status: string;
  business_info: BusinessInfo;
  customer_email: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  directories_total: number;
  directories_submitted_count: number;
  directories_live_count: number;
}

interface DirectoryTask {
  id: string;
  directory_id: string;
  directory_name: string;
  status: string;
  listing_url: string | null;
  note: string | null;
  submit_url: string | null;
  evidence: string | null;
  markets: string[];
  category: string | null;
}

function fmt(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

export default function CitationBuilderQueuePage() {
  usePageTitle("Citation Builder queue");
  const [statusFilter, setStatusFilter] = useState<string | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const query = useQuery<{ submissions: QueueRow[]; total: number }>({
    queryKey: ["/api/admin/citation-builder", statusFilter],
    queryFn: async () => {
      const url =
        statusFilter === "all"
          ? "/api/admin/citation-builder"
          : `/api/admin/citation-builder?status=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load the Citation Builder queue (${res.status})`);
      return res.json();
    },
  });

  const rows = query.data?.submissions ?? [];

  return (
    <AdminLayout>
      <div className="space-y-5" data-testid="page-admin-citation-builder-queue">
        <BackButton to="/admin/crm" label="Back to admin" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Citation Builder queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Paid one-time orders. Open an order to work its directory checklist — the customer's
            progress, their progress email and the completion report all come from what you record
            here, and from nothing else.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap" data-testid="select-status-filter">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${statusFilter === "all" ? "bg-brand-blue-50 border-brand-blue-600 text-brand-blue-700" : "border-border text-foreground"}`}
            data-testid="filter-all"
          >
            All
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${statusFilter === s ? "bg-brand-blue-50 border-brand-blue-600 text-brand-blue-700" : "border-border text-foreground"}`}
              data-testid={`filter-${s}`}
            >
              {STATUS_LABELS[s]?.label ?? s}
            </button>
          ))}
        </div>

        {query.isError && (
          <Card className="p-4 border-rose-200 bg-rose-50">
            <div className="text-sm text-rose-800">
              Couldn't load the queue. Refresh to retry.
            </div>
          </Card>
        )}

        {query.isLoading ? (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {Array.from({ length: 5 }).map((_, r) => (
                  <tr key={r} className="border-t border-border">
                    {Array.from({ length: 6 }).map((_, c) => (
                      <td key={c} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Business</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tier</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ordered</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Completed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const tone = STATUS_LABELS[row.status]?.tone ?? "gray";
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setOpenId(row.id)}
                      className="border-t border-border hover:bg-muted/50 cursor-pointer"
                      data-testid={`row-submission-${row.id}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{row.business_info?.name || "Untitled order"}</div>
                        <div className="text-xs text-muted-foreground">{row.customer_email ?? "no email on file"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">{TIER_LABELS[row.tier] ?? row.tier}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-[10px] ${TONE_STYLES[tone]}`}>
                          {STATUS_LABELS[row.status]?.label ?? row.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {row.directories_total > 0
                          ? `${row.directories_live_count} / ${row.directories_total}`
                          : "not started"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(row.created_at)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(row.completed_at)}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      <ClipboardList className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                      No Citation Builder orders match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {openId && <SubmissionDetailDialog id={openId} onClose={() => setOpenId(null)} />}
    </AdminLayout>
  );
}

function SubmissionDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const detail = useQuery<{
    submission: any;
    tasks: DirectoryTask[];
    counts: { total: number; submitted: number; live: number; rejected: number; notApplicable: number; outstanding: number };
    tier_directory_count: number;
    completable: boolean;
    completable_reason: string | null;
  }>({
    queryKey: [`/api/admin/citation-builder/${id}`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/citation-builder/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load order (${res.status})`);
      return res.json();
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/citation-builder"] });
    queryClient.invalidateQueries({ queryKey: [`/api/admin/citation-builder/${id}`] });
  };

  const onError = (err: Error) => {
    toast({ title: "Update failed", description: err.message, variant: "destructive" });
  };

  const start = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/citation-builder/${id}/start`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not start this order");
      return res.json();
    },
    onSuccess: (d: any) => {
      invalidate();
      toast({ title: "Checklist ready", description: `${d.total} directories assigned.` });
    },
    onError,
  });

  const complete = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/citation-builder/${id}/complete`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not complete this order");
      return res.json();
    },
    onSuccess: (d: any) => {
      invalidate();
      toast({
        title: "Order completed",
        description: d.completion_email_sent
          ? `${d.directories_live} live listings — completion report emailed.`
          : `${d.directories_live} live listings. No email address on file, so no report was sent.`,
      });
    },
    onError,
  });

  const s = detail.data?.submission;
  const tasks = detail.data?.tasks ?? [];
  const counts = detail.data?.counts;
  const info: BusinessInfo = s?.business_info ?? {};
  const isCompleted = s?.status === "completed";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] sm:w-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{info.name || "Citation Builder order"}</DialogTitle>
        </DialogHeader>

        {!detail.data && <Skeleton className="h-64" />}

        {s && (
          <div className="space-y-4 text-sm">
            {/* ── The NAP the operator types into every directory form ── */}
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Business details to submit
              </div>
              <Field label="Name" value={info.name} />
              <Field label="Address" value={info.address} />
              <Field label="Phone" value={info.phone} />
              <Field label="Website" value={info.website} />
              <Field label="Categories" value={info.categories?.join(", ")} />
              <Field label="Customer email" value={s.customer_email} />
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>Tier: <strong className="text-foreground">{TIER_LABELS[s.tier] ?? s.tier}</strong></span>
              <span>Ordered: <strong className="text-foreground">{fmt(s.created_at)}</strong></span>
              <span>Started: <strong className="text-foreground">{fmt(s.started_at)}</strong></span>
              {counts && (
                <span>
                  Recorded:{" "}
                  <strong className="text-foreground">
                    {counts.live} live · {counts.submitted - counts.live} awaiting ·{" "}
                    {counts.rejected + counts.notApplicable} closed · {counts.outstanding} to do
                  </strong>
                </span>
              )}
            </div>

            {tasks.length === 0 ? (
              <Card className="p-6 text-center">
                <div className="text-sm font-semibold text-foreground mb-1">No checklist yet</div>
                <div className="text-xs text-muted-foreground mb-4">
                  This order covers {detail.data?.tier_directory_count ?? 0} listings. Starting it cuts
                  the checklist and moves the order to in progress. Nothing is emailed to the customer
                  until you record the first real submission.
                </div>
                <Button
                  size="sm"
                  onClick={() => start.mutate()}
                  disabled={start.isPending || isCompleted}
                  data-testid="button-start-order"
                >
                  Start this order
                </Button>
              </Card>
            ) : (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Directory checklist
                </div>
                {tasks.map((t) => (
                  <TaskRow key={t.id} submissionId={id} task={t} disabled={isCompleted} onSaved={invalidate} onError={onError} />
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap items-center">
          {detail.data && !detail.data.completable && detail.data.completable_reason && !isCompleted && (
            <div className="text-xs text-muted-foreground mr-auto max-w-md text-left flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{detail.data.completable_reason}</span>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          <Button
            size="sm"
            onClick={() => complete.mutate()}
            disabled={complete.isPending || isCompleted || !detail.data?.completable}
            data-testid="button-complete-order"
          >
            Complete + send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One directory. The URL and note inputs are always visible rather than
 * revealed by status, because the operator collects them while working the
 * form — and the save is refused server-side without them.
 */
function TaskRow({
  submissionId,
  task,
  disabled,
  onSaved,
  onError,
}: {
  submissionId: string;
  task: DirectoryTask;
  disabled: boolean;
  onSaved: () => void;
  onError: (err: Error) => void;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState(task.status);
  const [listingUrl, setListingUrl] = useState(task.listing_url ?? "");
  const [note, setNote] = useState(task.note ?? "");

  // Re-sync when the parent query refetches after a save elsewhere.
  useEffect(() => {
    setStatus(task.status);
    setListingUrl(task.listing_url ?? "");
    setNote(task.note ?? "");
  }, [task.status, task.listing_url, task.note]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/citation-builder/${submissionId}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, listing_url: listingUrl || null, note: note || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      return res.json();
    },
    onSuccess: (d: any) => {
      onSaved();
      if (d.progress_email_sent) {
        toast({
          title: "Progress email sent",
          description: "The customer has been told submissions have started.",
        });
      }
    },
    onError,
  });

  const dirty =
    status !== task.status ||
    listingUrl !== (task.listing_url ?? "") ||
    note !== (task.note ?? "");
  const tone = TASK_STATUS_LABELS[task.status]?.tone ?? "gray";

  return (
    <Card className="p-3 space-y-2" data-testid={`task-${task.directory_id}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-semibold text-foreground flex items-center gap-2 flex-wrap">
            {task.directory_name}
            <Badge variant="outline" className={`text-[10px] ${TONE_STYLES[tone]}`}>
              {TASK_STATUS_LABELS[task.status]?.label ?? task.status}
            </Badge>
            {task.markets?.length === 1 && (
              <Badge variant="outline" className="text-[10px] bg-gray-50 border-gray-200 text-gray-700">
                {task.markets[0]} only
              </Badge>
            )}
          </div>
          {task.submit_url && (
            <a
              href={task.submit_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand-blue-600 inline-flex items-center gap-1 mt-0.5"
            >
              {task.submit_url} <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={disabled}
          className="h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground"
          data-testid={`select-status-${task.directory_id}`}
          aria-label={`Outcome for ${task.directory_name}`}
        >
          {Object.entries(TASK_STATUS_LABELS).map(([value, meta]) => (
            <option key={value} value={value}>{meta.label}</option>
          ))}
        </select>
      </div>

      {task.evidence && (
        <p className="text-xs text-muted-foreground leading-relaxed">{task.evidence}</p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5"
            htmlFor={`url-${task.id}`}
          >
            Listing URL — required to mark live
          </label>
          <Input
            id={`url-${task.id}`}
            value={listingUrl}
            onChange={(e) => setListingUrl(e.target.value)}
            placeholder="https://…"
            disabled={disabled}
            data-testid={`input-url-${task.directory_id}`}
          />
        </div>
        <div>
          <label
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5"
            htmlFor={`note-${task.id}`}
          >
            Note — required to reject or skip
          </label>
          <Textarea
            id={`note-${task.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={1}
            placeholder="What happened?"
            disabled={disabled}
            data-testid={`input-note-${task.directory_id}`}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => save.mutate()}
          disabled={disabled || !dirty || save.isPending}
          data-testid={`button-save-${task.directory_id}`}
        >
          Record outcome
        </Button>
      </div>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-foreground break-words min-w-0">{String(value)}</span>
    </div>
  );
}
