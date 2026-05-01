/**
 * /portal/articles — Sprint 6 client article review.
 *
 * Lists RankFlow article drafts the admin has approved (or that have
 * since been published / rejected) for the authenticated client.
 * Click a card → opens a Sheet with the full body and three action
 * buttons (Approve / Request Changes / Reject), each with an optional
 * note. Decisions write to metadata.client_review (no schema migration)
 * and to the content_approvals audit trail; admin sees them in the
 * existing /admin/contentflow drawer.
 *
 * Card statuses surfaced:
 *   approved   = admin approved, client decision pending or noted
 *   published  = on WordPress (post URL shown when present)
 *   rejected   = decision recorded, no further action
 *
 * Note: this page does not display drafts in 'draft' status — those
 * are still being worked on by the admin and showing them would
 * confuse clients.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, MessageSquareWarning, XCircle, FileText, ExternalLink, Clock } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ArticleListItem {
  id: number;
  title: string | null;
  excerpt: string | null;
  status: string;
  target_url: string | null;
  metadata: any;
  client_approved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ArticleListResponse {
  articles: ArticleListItem[];
  count: number;
}

interface ArticleDetail {
  article: ArticleListItem & { body: string | null; metadata: any };
}

/* ─── Helpers ─────────────────────────────────────────────────────── */

type ReviewState = "approved" | "changes_requested" | "rejected";

function reviewStateOf(item: ArticleListItem): ReviewState | null {
  return (item.metadata?.client_review?.state as ReviewState | undefined) ?? null;
}

function badgeForArticle(item: ArticleListItem): { label: string; tone: "neutral" | "good" | "warn" | "bad" | "info" } {
  if (item.status === "published") return { label: "Live on Site", tone: "info" };
  if (item.status === "rejected") return { label: "Rejected", tone: "bad" };
  const review = reviewStateOf(item);
  if (review === "approved") return { label: "You Approved", tone: "good" };
  if (review === "changes_requested") return { label: "Changes Requested", tone: "warn" };
  if (review === "rejected") return { label: "You Rejected", tone: "bad" };
  return { label: "Awaiting Your Review", tone: "warn" };
}

const TONE_CLASSES: Record<string, string> = {
  good: "bg-emerald-100 text-emerald-800 border-emerald-200",
  warn: "bg-amber-100 text-amber-800 border-amber-200",
  bad: "bg-red-100 text-red-800 border-red-200",
  info: "bg-blue-100 text-blue-800 border-blue-200",
  neutral: "bg-gray-100 text-gray-700 border-gray-200",
};

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

/* ─── Page ────────────────────────────────────────────────────────── */

export default function PortalArticles() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isError, error } = useQuery<ArticleListResponse>({
    queryKey: ["/api/portal/articles"],
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [note, setNote] = useState<string>("");

  function openArticle(id: number) {
    setSelectedId(id);
    setDrawerOpen(true);
    setNote("");
  }

  const detailQuery = useQuery<ArticleDetail>({
    queryKey: ["/api/portal/articles", selectedId],
    enabled: drawerOpen && selectedId !== null,
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/portal/articles/${selectedId}/approve`, { note: note.trim() || undefined });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Approved", description: "Thanks — we'll get this out the door." });
      setDrawerOpen(false);
      setNote("");
      qc.invalidateQueries({ queryKey: ["/api/portal/articles"] });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Approve failed", description: e?.message || "Unknown error" }),
  });

  const changesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/portal/articles/${selectedId}/request-changes`, { note: note.trim() || undefined });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Change request sent", description: "Your team will revise and notify you." });
      setDrawerOpen(false);
      setNote("");
      qc.invalidateQueries({ queryKey: ["/api/portal/articles"] });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Request failed", description: e?.message || "Unknown error" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/portal/articles/${selectedId}/reject`, { note: note.trim() || undefined });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rejected", description: "We won't publish this article." });
      setDrawerOpen(false);
      setNote("");
      qc.invalidateQueries({ queryKey: ["/api/portal/articles"] });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Reject failed", description: e?.message || "Unknown error" }),
  });

  const articles = data?.articles ?? [];
  const detail = detailQuery.data?.article;
  const detailReview = detail ? reviewStateOf(detail) : null;
  const detailBadge = detail ? badgeForArticle(detail) : null;
  const detailIsActionable =
    detail?.status === "approved" && detailReview !== "approved" && detailReview !== "rejected";
  const busy = approveMutation.isPending || changesMutation.isPending || rejectMutation.isPending;

  const stats = useMemo(() => {
    const counts = { pending: 0, approved: 0, changes: 0, rejected: 0, published: 0 };
    for (const a of articles) {
      if (a.status === "published") counts.published++;
      else if (a.status === "rejected") counts.rejected++;
      else {
        const r = reviewStateOf(a);
        if (r === "approved") counts.approved++;
        else if (r === "changes_requested") counts.changes++;
        else if (r === "rejected") counts.rejected++;
        else counts.pending++;
      }
    }
    return counts;
  }, [articles]);

  return (
    <PortalLayout>
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Article Drafts</h1>
          <p className="text-sm text-muted-foreground">
            Review the SEO articles your team has prepared. Approve to publish, request changes, or reject.
          </p>
        </header>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" /> {stats.pending} awaiting your review
          </Badge>
          <Badge variant="outline" className="gap-1 border-emerald-200 text-emerald-800">
            <CheckCircle2 className="h-3 w-3" /> {stats.approved} approved
          </Badge>
          {stats.changes > 0 && (
            <Badge variant="outline" className="gap-1 border-amber-200 text-amber-800">
              <MessageSquareWarning className="h-3 w-3" /> {stats.changes} changes requested
            </Badge>
          )}
          {stats.published > 0 && (
            <Badge variant="outline" className="gap-1 border-blue-200 text-blue-800">
              <FileText className="h-3 w-3" /> {stats.published} live on site
            </Badge>
          )}
        </div>

        {/* Article cards */}
        {isLoading && (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="p-4 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </Card>
            ))}
          </div>
        )}

        {isError && (
          <Card className="p-6 text-sm text-red-700">
            Failed to load articles: {(error as any)?.message || "unknown error"}
          </Card>
        )}

        {!isLoading && !isError && articles.length === 0 && (
          <Card className="p-12 text-center text-sm text-muted-foreground" data-testid="articles-empty-state">
            <FileText className="mx-auto h-8 w-8 opacity-50 mb-2" />
            No articles to review yet. We'll let you know when your first one is ready.
          </Card>
        )}

        {!isLoading && articles.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {articles.map((a) => {
              const badge = badgeForArticle(a);
              return (
                <Card
                  key={a.id}
                  className="p-4 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => openArticle(a.id)}
                  data-testid={`article-card-${a.id}`}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <Badge variant="outline" className={TONE_CLASSES[badge.tone]}>{badge.label}</Badge>
                    <span className="text-xs text-muted-foreground ml-auto">{formatRelative(a.created_at)}</span>
                  </div>
                  <h3 className="text-sm font-medium leading-tight mb-1 line-clamp-2">
                    {a.title || "Untitled article"}
                  </h3>
                  {a.excerpt && (
                    <p className="text-xs text-muted-foreground line-clamp-3">{a.excerpt}</p>
                  )}
                  {a.status === "published" && a.target_url && (
                    <a
                      href={a.target_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 text-xs text-blue-700 hover:underline inline-flex items-center gap-1 break-all"
                    >
                      View live <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <Button variant="ghost" size="sm" className="mt-2 px-0 h-auto" data-testid={`article-card-open-${a.id}`}>
                    View Full Draft →
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <Sheet open={drawerOpen} onOpenChange={(o) => { if (!busy) setDrawerOpen(o); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="pr-10">
            <SheetTitle className="text-lg">{detail?.title || "Article"}</SheetTitle>
            <SheetDescription>
              {detail ? formatRelative(detail.created_at) : ""}
              {detailBadge && (
                <Badge variant="outline" className={`ml-2 ${TONE_CLASSES[detailBadge.tone]}`}>
                  {detailBadge.label}
                </Badge>
              )}
            </SheetDescription>
          </SheetHeader>

          {detailQuery.isLoading && (
            <div className="py-6 space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          )}

          {detail && (
            <div className="space-y-4 py-4">
              {detail.excerpt && (
                <p className="text-sm italic text-muted-foreground border-l-2 pl-3">{detail.excerpt}</p>
              )}
              <div className="prose prose-sm max-w-none whitespace-pre-wrap" data-testid="article-body">
                {detail.body || <em className="text-muted-foreground">No body yet.</em>}
              </div>

              {detail.metadata?.client_review?.note && (
                <div className="rounded border bg-muted/40 p-3 text-xs">
                  <div className="font-medium mb-1">Your note</div>
                  <div className="whitespace-pre-wrap">{detail.metadata.client_review.note}</div>
                </div>
              )}

              {detailIsActionable && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Add a note (optional)</div>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Anything you'd like to mention?"
                    rows={3}
                    data-testid="article-review-note"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => approveMutation.mutate()}
                      disabled={busy}
                      className="bg-emerald-600 hover:bg-emerald-700"
                      data-testid="article-approve-btn"
                    >
                      {approveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => changesMutation.mutate()}
                      disabled={busy}
                      className="border-amber-300 text-amber-800 hover:bg-amber-50"
                      data-testid="article-changes-btn"
                    >
                      {changesMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MessageSquareWarning className="h-4 w-4 mr-1" />}
                      Request Changes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => rejectMutation.mutate()}
                      disabled={busy}
                      className="border-red-300 text-red-700 hover:bg-red-50"
                      data-testid="article-reject-btn"
                    >
                      {rejectMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
                      Reject
                    </Button>
                  </div>
                </div>
              )}

              {!detailIsActionable && (
                <div className="rounded border bg-muted/30 p-3 text-xs text-muted-foreground">
                  {detail.status === "published"
                    ? "This article is live on your website."
                    : detail.status === "rejected"
                    ? "This article has been rejected."
                    : detailReview === "approved"
                    ? "You approved this article — your team will publish it shortly."
                    : "No further action needed."}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </PortalLayout>
  );
}
