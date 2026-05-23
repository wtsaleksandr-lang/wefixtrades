/**
 * Right-side drawer that surfaces the full picture for a ContentFlow draft:
 *   - body / metadata / quality score / linked SocialSync post
 *   - append-only approval audit
 *   - Approve / Reject actions
 *
 * Used by /admin/contentflow (ContentFlowQueuePage). All endpoints are
 * admin-gated (requireAdmin); no portal exposure.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, ExternalLink, Loader2, RefreshCw, Pause, Play } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  CONTENT_DRAFT_STATUS_LABELS,
  CONTENT_DRAFT_STATUS_STYLES,
  statusLabel,
} from "@/config/portalLabels";

interface ContentDraft {
  id: number;
  client_id: number;
  client_service_id: number | null;
  kind: string;
  surface: string;
  title: string | null;
  body: string | null;
  excerpt: string | null;
  target_platform: string | null;
  target_url: string | null;
  metadata: Record<string, unknown> | null;
  quality_score: number | null;
  quality_notes: Record<string, unknown> | null;
  status: string;
  auto_approved: boolean;
  requires_admin_review: boolean;
  requires_client_review: boolean;
  admin_approved_at: string | null;
  admin_approved_by: number | null;
  client_approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  linked_social_post_id: number | null;
  linked_task_id: number | null;
  generation_cost_micro_usd: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ContentApproval {
  id: number;
  draft_id: number;
  actor_type: string;
  actor_id: number | null;
  action: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface LinkedSocialPost {
  id: number;
  client_id: number;
  platform: string;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
}

interface DraftDetail {
  draft: ContentDraft;
  approvals: ContentApproval[];
  linkedSocialPost: LinkedSocialPost | null;
  linkedTask: unknown | null;
}

interface Props {
  draftId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ContentFlowDraftDrawer({ draftId, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const { data, isLoading, isError, error } = useQuery<DraftDetail>({
    queryKey: ["/api/admin/contentflow/drafts", draftId],
    enabled: open && draftId !== null,
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (draftId === null) throw new Error("no draftId");
      const res = await apiRequest("POST", `/api/admin/contentflow/drafts/${draftId}/approve`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Approved", description: "Draft marked as approved." });
      qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/drafts", draftId] });
      qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/queue"] });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Approve failed", description: e?.message || "Unknown error" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (draftId === null) throw new Error("no draftId");
      const res = await apiRequest("POST", `/api/admin/contentflow/drafts/${draftId}/reject`, {
        reason: reason.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rejected", description: "Draft marked as rejected." });
      setShowRejectForm(false);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/drafts", draftId] });
      qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/queue"] });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Reject failed", description: e?.message || "Unknown error" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (draftId === null) throw new Error("no draftId");
      // Default WordPress status is "draft" — admin reviews on the WP side
      // before going live. Sprint 4 does not expose a one-click "publish" path.
      const res = await apiRequest("POST", `/api/admin/contentflow/drafts/${draftId}/publish`, {
        status: "draft",
      });
      return res.json();
    },
    onSuccess: (body: any) => {
      toast({
        title: "Published to WordPress",
        description: body?.post_url ? `Saved as WP draft: ${body.post_url}` : "Saved as WP draft",
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/drafts", draftId] });
      qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/queue"] });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Publish failed", description: e?.message || "Unknown error" });
    },
  });

  // Sprint 5: queue actions (queue / schedule / retry).
  const [scheduledFor, setScheduledFor] = useState<string>("");

  const queueMutation = useMutation({
    mutationFn: async (opts: { scheduled_for: string | null }) => {
      if (draftId === null) throw new Error("no draftId");
      const res = await apiRequest("POST", `/api/admin/contentflow/drafts/${draftId}/queue-publish`, {
        scheduled_for: opts.scheduled_for,
        status: "draft",
      });
      return res.json();
    },
    onSuccess: (body: any) => {
      const when = body?.scheduled_for
        ? `scheduled for ${new Date(body.scheduled_for).toLocaleString()}`
        : "queued for next worker tick";
      toast({ title: "Queued for WordPress", description: when });
      setScheduledFor("");
      qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/drafts", draftId] });
      qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/queue"] });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Queue failed", description: e?.message || "Unknown error" });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      if (draftId === null) throw new Error("no draftId");
      const res = await apiRequest("POST", `/api/admin/contentflow/drafts/${draftId}/retry-publish`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Retry queued", description: "Draft will publish on the next worker tick." });
      qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/drafts", draftId] });
      qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/queue"] });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Retry failed", description: e?.message || "Unknown error" });
    },
  });

  /* Admin controls: force-regenerate the article body, and pause/resume
   * the draft's publish-queue eligibility. All three endpoints already
   * exist server-side (regenerate-article / pause / resume) — this just
   * surfaces them in the drawer. */
  const regenerateMutation = useMutation({
    mutationFn: async () => {
      if (draftId === null) throw new Error("no draftId");
      const res = await apiRequest("POST", `/api/admin/contentflow/drafts/${draftId}/regenerate-article`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Regenerated", description: "Article re-generated with a fresh AI pass." });
      qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/drafts", draftId] });
      qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/queue"] });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Regenerate failed", description: e?.message || "Unknown error" });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async (paused: boolean) => {
      if (draftId === null) throw new Error("no draftId");
      const action = paused ? "pause" : "resume";
      const res = await apiRequest("POST", `/api/admin/contentflow/drafts/${draftId}/${action}`, {});
      return res.json();
    },
    onSuccess: (_body: any, paused: boolean) => {
      toast({
        title: paused ? "Paused" : "Resumed",
        description: paused
          ? "Draft will be skipped by the publish queue until resumed."
          : "Draft is eligible for the publish queue again.",
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/drafts", draftId] });
      qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/queue"] });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Action failed", description: e?.message || "Unknown error" });
    },
  });

  /**
   * "Tomorrow morning" preset = next 9:00 AM in the server's timezone.
   * Per Sprint 5 brief: server timezone unless an existing user-tz system
   * exists (none does at this layer).
   */
  function tomorrowMorningIso(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }

  const draft = data?.draft;
  const isTerminal = draft ? ["published", "delivered", "failed"].includes(draft.status) : false;
  const busy =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    publishMutation.isPending ||
    queueMutation.isPending ||
    retryMutation.isPending ||
    regenerateMutation.isPending ||
    pauseMutation.isPending;

  // Admin-control visibility. Regenerate is article-only (re-runs the
  // AI body generation). Pause/resume reads metadata.calendar.paused.
  const isPaused = ((draft?.metadata as any)?.calendar?.paused) === true;
  const canRegenerate =
    !!draft && draft.kind === "article" && draft.surface === "rankflow" && !isTerminal;

  // Publish-to-WordPress visibility: only for approved RankFlow articles.
  // Read state from draft.metadata.wordpress (populated by the publisher
  // and the Sprint 5 queue worker).
  const wpMeta = (draft?.metadata as any)?.wordpress as
    | {
        // Sprint 4 keys
        post_id?: number;
        post_url?: string;
        published_at?: string;
        wp_status?: string;
        error?: string;
        // Sprint 5 keys
        queue_status?: "queued" | "publishing" | "published" | "failed";
        scheduled_for?: string | null;
        attempts?: number;
        last_error?: string | null;
      }
    | undefined;
  const canShowPublishUI = !!draft && draft.kind === "article" && draft.surface === "rankflow";
  const isPublished = !!wpMeta?.post_url && !!wpMeta?.post_id;
  const lastPublishError = wpMeta?.error || wpMeta?.last_error;
  const canTriggerPublish = canShowPublishUI && draft?.status === "approved" && !isPublished;

  // Sprint 5 derived state.
  const queueStatus = wpMeta?.queue_status ?? null;
  const isScheduled =
    queueStatus === "queued" &&
    !!wpMeta?.scheduled_for &&
    new Date(wpMeta.scheduled_for).getTime() > Date.now();
  const isQueueFailed = queueStatus === "failed";
  const isQueued = queueStatus === "queued" || queueStatus === "publishing";
  const queueBadgeLabel = isPublished
    ? "Published"
    : queueStatus === "publishing"
    ? "Publishing"
    : isScheduled
    ? "Scheduled"
    : queueStatus === "queued"
    ? "Queued"
    : queueStatus === "failed"
    ? "Failed"
    : null;
  const canTriggerQueue = canShowPublishUI && draft?.status === "approved" && !isPublished && !isQueued;
  const canTriggerRetry = canShowPublishUI && isQueueFailed && !isPublished;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setShowRejectForm(false);
          setRejectReason("");
        }
        onOpenChange(o);
      }}
    >
      <SheetContent
        side="right"
        data-theme="light"
        className="w-full sm:max-w-xl md:max-w-2xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>
            {draft ? `Draft #${draft.id}` : draftId !== null ? `Draft #${draftId}` : "Draft"}
          </SheetTitle>
          <SheetDescription>
            {draft ? `${draft.surface} · ${draft.kind}${draft.target_platform ? ` · ${draft.target_platform}` : ""}` : ""}
          </SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="space-y-3 mt-6">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        )}

        {isError && (
          <div className="mt-6 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Failed to load draft: {(error as any)?.message || "unknown error"}
          </div>
        )}

        {draft && (
          <div className="mt-6 space-y-6 text-sm">
            {/* Status row */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={CONTENT_DRAFT_STATUS_STYLES[draft.status] || "bg-gray-100 text-gray-600"} variant="outline">
                {statusLabel(CONTENT_DRAFT_STATUS_LABELS, draft.status)}
              </Badge>
              {draft.auto_approved && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700">auto-approved</Badge>
              )}
              {draft.requires_admin_review && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700">admin review required</Badge>
              )}
              {draft.requires_client_review && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700">client review required</Badge>
              )}
              {typeof draft.quality_score === "number" && (
                <Badge variant="outline" className="bg-gray-100 text-gray-700">quality {draft.quality_score}/100</Badge>
              )}
            </div>

            {/* Title (if present) */}
            {draft.title && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Title</div>
                <div className="font-medium">{draft.title}</div>
              </div>
            )}

            {/* Body */}
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Body</div>
              <div className="rounded border bg-muted/30 p-3 whitespace-pre-wrap font-mono text-[13px] leading-relaxed">
                {draft.body || <span className="text-muted-foreground italic">(empty)</span>}
              </div>
            </div>

            {/* Linked artefacts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded border p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Linked SocialSync Post</div>
                {data?.linkedSocialPost ? (
                  <div>
                    <div className="font-mono text-xs">#{data.linkedSocialPost.id}</div>
                    <div className="text-xs mt-1 text-muted-foreground">
                      {data.linkedSocialPost.platform} · status: {data.linkedSocialPost.status}
                    </div>
                    {data.linkedSocialPost.scheduled_for && (
                      <div className="text-xs mt-1 text-muted-foreground">
                        scheduled: {new Date(data.linkedSocialPost.scheduled_for).toLocaleString()}
                      </div>
                    )}
                  </div>
                ) : draft.linked_social_post_id ? (
                  <div className="text-xs text-muted-foreground">#{draft.linked_social_post_id} (not loaded)</div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">none</div>
                )}
              </div>
              <div className="rounded border p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Linked RankFlow Task</div>
                {draft.linked_task_id ? (
                  <div className="font-mono text-xs">#{draft.linked_task_id}</div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">none</div>
                )}
              </div>
            </div>

            {/* Target URL */}
            {draft.target_url && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Target URL</div>
                <a href={draft.target_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline inline-flex items-center gap-1 break-all">
                  {draft.target_url} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            {/* Metadata + quality_notes (raw JSON) */}
            <details className="rounded border p-3">
              <summary className="text-xs uppercase tracking-wide text-muted-foreground cursor-pointer">Metadata</summary>
              <pre className="mt-2 overflow-x-auto text-[11px] leading-snug bg-muted/40 p-2 rounded">
{JSON.stringify(draft.metadata ?? {}, null, 2)}
              </pre>
            </details>
            {draft.quality_notes && (
              <details className="rounded border p-3">
                <summary className="text-xs uppercase tracking-wide text-muted-foreground cursor-pointer">Quality notes</summary>
                <pre className="mt-2 overflow-x-auto text-[11px] leading-snug bg-muted/40 p-2 rounded">
{JSON.stringify(draft.quality_notes, null, 2)}
                </pre>
              </details>
            )}

            {/* Approval audit trail */}
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Approval trail</div>
              {data?.approvals && data.approvals.length > 0 ? (
                <ol className="space-y-2">
                  {data.approvals.map((a) => (
                    <li key={a.id} className="rounded border p-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">{a.action}</Badge>
                        <span className="text-muted-foreground">{a.actor_type}</span>
                        {a.actor_id !== null && (
                          <span className="text-muted-foreground font-mono">#{a.actor_id}</span>
                        )}
                        <span className="text-muted-foreground ml-auto">
                          {new Date(a.created_at).toLocaleString()}
                        </span>
                      </div>
                      {a.notes && <div className="mt-1 text-muted-foreground">{a.notes}</div>}
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="text-xs text-muted-foreground italic">No approval events yet.</div>
              )}
            </div>

            {/* Reject form (toggle) */}
            {showRejectForm && !isTerminal && (
              <div className="rounded border border-red-200 bg-red-50 p-3 space-y-2">
                <div className="text-xs uppercase tracking-wide text-red-700">Rejection reason (optional)</div>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Why is this draft being rejected?"
                  className="bg-white"
                  rows={3}
                />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setShowRejectForm(false)} disabled={busy}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => rejectMutation.mutate(rejectReason)}
                    disabled={busy}
                  >
                    {rejectMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    Confirm reject
                  </Button>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 sticky bottom-0 bg-background pt-3 border-t -mx-6 px-6 -mb-6 pb-6">
              <Button
                onClick={() => approveMutation.mutate()}
                disabled={busy || isTerminal || draft.status === "approved"}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {approveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Approve
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowRejectForm((s) => !s)}
                disabled={busy || isTerminal || draft.status === "rejected"}
                className="border-red-200 text-red-700 hover:bg-red-50"
              >
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
              {canTriggerPublish && (
                <Button
                  data-testid="publish-wordpress-btn"
                  onClick={() => publishMutation.mutate()}
                  disabled={busy}
                  variant="outline"
                  className="border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                  {publishMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {lastPublishError ? "Retry Publish" : "Publish to WordPress"}
                </Button>
              )}
              {canTriggerQueue && (
                <Button
                  data-testid="queue-wordpress-btn"
                  onClick={() => queueMutation.mutate({ scheduled_for: scheduledFor || null })}
                  disabled={busy}
                  variant="outline"
                  className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                >
                  {queueMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {scheduledFor ? "Schedule Publish" : "Queue for Publish"}
                </Button>
              )}
              {canTriggerRetry && (
                <Button
                  data-testid="retry-publish-btn"
                  onClick={() => retryMutation.mutate()}
                  disabled={busy}
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                >
                  {retryMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Retry Publish
                </Button>
              )}
              {canRegenerate && (
                <Button
                  data-testid="regenerate-article-btn"
                  onClick={() => regenerateMutation.mutate()}
                  disabled={busy}
                  variant="outline"
                  className="border-purple-300 text-purple-700 hover:bg-purple-50"
                >
                  {regenerateMutation.isPending
                    ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    : <RefreshCw className="h-4 w-4 mr-1" />}
                  Regenerate
                </Button>
              )}
              {!isTerminal && (
                <Button
                  data-testid="pause-resume-btn"
                  onClick={() => pauseMutation.mutate(!isPaused)}
                  disabled={busy}
                  variant="outline"
                  className={isPaused
                    ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"}
                >
                  {pauseMutation.isPending
                    ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    : isPaused
                      ? <Play className="h-4 w-4 mr-1" />
                      : <Pause className="h-4 w-4 mr-1" />}
                  {isPaused ? "Resume" : "Pause"}
                </Button>
              )}
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy} className="ml-auto">
                Close
              </Button>
            </div>

            {/* Sprint 5: scheduling + queue badge — visible for approved RankFlow articles */}
            {canShowPublishUI && draft?.status === "approved" && !isPublished && !isQueued && (
              <div className="rounded border bg-muted/40 p-3 text-xs space-y-2" data-testid="schedule-publish-row">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Schedule publish (optional)</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    className="rounded border bg-background px-2 py-1 text-xs"
                    data-testid="schedule-publish-input"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      // "Tomorrow morning" preset = 9:00 AM next day in browser-local time
                      // (then sent as UTC ISO to the server). Server timezone is UTC on Replit.
                      const d = new Date();
                      d.setDate(d.getDate() + 1);
                      d.setHours(9, 0, 0, 0);
                      // datetime-local wants YYYY-MM-DDTHH:mm without seconds.
                      const pad = (n: number) => String(n).padStart(2, "0");
                      setScheduledFor(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
                    }}
                    disabled={busy}
                  >
                    Tomorrow 9 AM
                  </Button>
                  {scheduledFor && (
                    <Button size="sm" variant="ghost" onClick={() => setScheduledFor("")} disabled={busy}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            )}

            {canShowPublishUI && queueBadgeLabel && (
              <div
                className="rounded border bg-muted/30 p-2 text-xs flex items-center gap-2"
                data-testid={`queue-badge-${queueBadgeLabel.toLowerCase()}`}
              >
                <Badge
                  variant="outline"
                  className={
                    queueBadgeLabel === "Published" ? "border-blue-300 text-blue-700"
                    : queueBadgeLabel === "Publishing" ? "border-indigo-300 text-indigo-700 animate-pulse"
                    : queueBadgeLabel === "Scheduled" ? "border-violet-300 text-violet-700"
                    : queueBadgeLabel === "Queued" ? "border-emerald-300 text-emerald-700"
                    : "border-red-300 text-red-700"
                  }
                >
                  {queueBadgeLabel}
                </Badge>
                {isScheduled && wpMeta?.scheduled_for && (
                  <span className="text-muted-foreground">runs at {new Date(wpMeta.scheduled_for).toLocaleString()}</span>
                )}
                {isQueueFailed && (
                  <span className="text-muted-foreground">attempt {wpMeta?.attempts ?? 0}/3</span>
                )}
              </div>
            )}

            {/* WordPress publish status — visible only for RankFlow articles */}
            {canShowPublishUI && isPublished && wpMeta?.post_url && (
              <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs space-y-1" data-testid="wp-published-banner">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-600">Published</Badge>
                  <span className="text-blue-900">WordPress {wpMeta.wp_status ?? "draft"}</span>
                  {wpMeta.published_at && (
                    <span className="text-muted-foreground ml-auto">
                      {new Date(wpMeta.published_at).toLocaleString()}
                    </span>
                  )}
                </div>
                <a
                  href={wpMeta.post_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 hover:underline inline-flex items-center gap-1 break-all"
                >
                  {wpMeta.post_url} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            {canShowPublishUI && lastPublishError && !isPublished && (
              <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900" data-testid="wp-publish-error">
                <div className="font-medium">Last publish attempt failed</div>
                <div className="mt-1 break-words">{lastPublishError}</div>
              </div>
            )}

            {isTerminal && draft.status !== "published" && (
              <div className="text-xs text-muted-foreground italic">
                Draft is in a terminal state ({draft.status}) — approve/reject are disabled.
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
