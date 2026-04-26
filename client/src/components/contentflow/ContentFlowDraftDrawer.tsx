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
import { CheckCircle2, XCircle, ExternalLink, Loader2 } from "lucide-react";
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

  const draft = data?.draft;
  const isTerminal = draft ? ["published", "delivered", "failed"].includes(draft.status) : false;
  const busy = approveMutation.isPending || rejectMutation.isPending;

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
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy} className="ml-auto">
                Close
              </Button>
            </div>

            {isTerminal && (
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
