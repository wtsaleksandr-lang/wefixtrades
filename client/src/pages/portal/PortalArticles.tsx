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
 * Each tab (Articles / Social Posts / Videos) has a search + filter +
 * date-range toolbar so a customer can quickly find a specific piece.
 *
 * Card statuses surfaced:
 *   approved   = admin approved, client decision pending or noted
 *   published  = on WordPress (post URL shown when present)
 *   rejected   = decision recorded, no further action
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, MessageSquareWarning, XCircle, FileText, ExternalLink, Clock, Share2, Instagram, Facebook, Globe, Mail, Calendar, Video } from "lucide-react";
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
import { useCopilotForm } from "@/context/CopilotFormContext";
import { FilterToolbar, dateRangeCutoff, type DateRange } from "@/components/datatable/FilterToolbar";

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

function uniqueSorted(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean))).sort();
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

  /* Phase 1c: register the article-decision note with the copilot. Only
   * enabled while the detail drawer is open on an actionable article —
   * the same condition that renders the note textarea. */
  useCopilotForm({
    formLabel: "Article review note",
    fields: [{ key: "note", label: "Review note (optional)" }],
    values: { note },
    onApply: (fills) => {
      for (const f of fills) {
        if (f.field_key === "note") setNote(f.value);
      }
    },
    enabled: drawerOpen && !!detailIsActionable,
  });

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

  const [activeTab, setActiveTab] = useState<"articles" | "social" | "videos">("articles");

  /* W-AM-2: pull the global video gen flag here so we can hide the Videos
   * tab entirely when VIDEO_GENERATION_ENABLED is false. While disabled the
   * 5-sec B-roll output does not match the 3-5 min script, so the customer-
   * facing surface stays hidden until script/output alignment is fixed. */
  const { data: videoSettings } = useQuery<VideoSettings>({
    queryKey: ["/api/portal/contentflow/video-settings"],
    queryFn: async () => {
      const res = await fetch("/api/portal/contentflow/video-settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load video settings");
      return res.json();
    },
  });
  const videoFeatureVisible = videoSettings?.global_enabled === true;

  // If video tab was selected but flag is now off, fall back to articles.
  useEffect(() => {
    if (activeTab === "videos" && videoSettings && !videoFeatureVisible) {
      setActiveTab("articles");
    }
  }, [activeTab, videoSettings, videoFeatureVisible]);

  /* Article tab filters (client-side). */
  const [articleSearch, setArticleSearch] = useState("");
  const [articleStatus, setArticleStatus] = useState<Set<string>>(new Set());
  const [articleRange, setArticleRange] = useState<DateRange>("all");

  const filteredArticles = useMemo(() => {
    let rows = articles;
    const q = articleSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter((a) =>
        (a.title || "").toLowerCase().includes(q) ||
        (a.excerpt || "").toLowerCase().includes(q),
      );
    }
    if (articleStatus.size) rows = rows.filter((a) => articleStatus.has(badgeForArticle(a).label));
    const cutoff = dateRangeCutoff(articleRange);
    if (cutoff != null) rows = rows.filter((a) => new Date(a.created_at).getTime() >= cutoff);
    return rows;
  }, [articles, articleSearch, articleStatus, articleRange]);

  const articleStatusOptions = useMemo(
    () => uniqueSorted(articles.map((a) => badgeForArticle(a).label)).map((s) => ({ value: s, label: s })),
    [articles],
  );

  return (
    <PortalLayout>
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
          <p className="text-sm text-muted-foreground">
            {videoFeatureVisible
              ? "Review articles and see what social posts and videos are going out on your channels."
              : "Review articles and see what social posts are going out on your channels."}
          </p>
        </header>

        {/* Tab bar */}
        <div className="flex border-b">
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "articles"
                ? "border-[#0d3cfc] text-[#0d3cfc]"
                : "border-transparent text-muted-foreground hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("articles")}
          >
            <FileText className="h-3.5 w-3.5 inline mr-1.5" />
            Article Drafts
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "social"
                ? "border-[#0d3cfc] text-[#0d3cfc]"
                : "border-transparent text-muted-foreground hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("social")}
          >
            <Share2 className="h-3.5 w-3.5 inline mr-1.5" />
            Social Posts
          </button>
          {videoFeatureVisible && (
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "videos"
                  ? "border-[#0d3cfc] text-[#0d3cfc]"
                  : "border-transparent text-muted-foreground hover:text-gray-700"
              }`}
              onClick={() => setActiveTab("videos")}
            >
              <Video className="h-3.5 w-3.5 inline mr-1.5" />
              Videos
            </button>
          )}
        </div>

        {activeTab === "social" && <SocialPostsSection />}
        {activeTab === "videos" && videoFeatureVisible && <VideoContentSection />}

        {activeTab === "articles" && <>
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

        {/* Filter toolbar */}
        {!isLoading && !isError && articles.length > 0 && (
          <FilterToolbar
            search={articleSearch}
            onSearch={setArticleSearch}
            searchPlaceholder="Search articles…"
            filters={[
              { label: "Status", options: articleStatusOptions, selected: articleStatus, onChange: setArticleStatus },
            ]}
            dateRange={articleRange}
            onDateRange={setArticleRange}
          />
        )}

        {/* Article cards */}
        {isLoading && (
          <div className="grid gap-3 md:grid-cols-2 auto-rows-fr">
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

        {!isLoading && !isError && articles.length > 0 && filteredArticles.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            No articles match your filters.
          </Card>
        )}

        {!isLoading && filteredArticles.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 auto-rows-fr">
            {filteredArticles.map((a) => {
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 px-0 h-auto"
                    onClick={(e) => { e.stopPropagation(); openArticle(a.id); }}
                    data-testid={`article-card-open-${a.id}`}
                  >
                    View Full Draft →
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
        </>}
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

/* ─── Social Posts Section ───────────────────────────────────────── */

interface SocialPostItem {
  id: number;
  platform: string;
  post_text: string | null;
  status: string;
  media_plan: any;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
}

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  facebook: <Facebook className="h-4 w-4 text-blue-600" />,
  instagram: <Instagram className="h-4 w-4 text-pink-600" />,
  google_business: <Globe className="h-4 w-4 text-green-600" />,
  email: <Mail className="h-4 w-4 text-gray-600" />,
  linkedin: <Globe className="h-4 w-4 text-blue-700" />,
  pinterest: <Globe className="h-4 w-4 text-red-600" />,
};

const STATUS_STYLE: Record<string, string> = {
  published: "bg-emerald-100 text-emerald-800 border-emerald-200",
  ready: "bg-blue-100 text-blue-800 border-blue-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  queued: "bg-blue-100 text-blue-800 border-blue-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  draft: "bg-gray-100 text-gray-700 border-gray-200",
};

function SocialPostsSection() {
  const { data, isLoading, isError } = useQuery<{ posts: SocialPostItem[] }>({
    queryKey: ["/api/portal/socialsync/posts"],
    queryFn: async () => {
      const res = await fetch("/api/portal/socialsync/posts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load social posts");
      return res.json();
    },
  });

  const allPosts = data?.posts ?? [];
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<DateRange>("all");

  const posts = useMemo(() => {
    let rows = allPosts;
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((p) => (p.post_text || "").toLowerCase().includes(q));
    if (platformFilter.size) rows = rows.filter((p) => platformFilter.has(p.platform));
    if (statusFilter.size) rows = rows.filter((p) => statusFilter.has(p.status));
    const cutoff = dateRangeCutoff(range);
    if (cutoff != null) rows = rows.filter((p) => new Date(p.created_at).getTime() >= cutoff);
    return rows;
  }, [allPosts, search, platformFilter, statusFilter, range]);

  const platformOptions = useMemo(
    () => uniqueSorted(allPosts.map((p) => p.platform)).map((p) => ({ value: p, label: p.replace(/_/g, " ") })),
    [allPosts],
  );
  const statusOptions = useMemo(
    () => uniqueSorted(allPosts.map((p) => p.status)).map((s) => ({ value: s, label: s })),
    [allPosts],
  );

  if (isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 auto-rows-fr">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-4 space-y-3">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="p-6 text-sm text-red-700">
        Failed to load social posts. Please try again later.
      </Card>
    );
  }

  if (allPosts.length === 0) {
    return (
      <Card className="p-12 text-center text-sm text-muted-foreground">
        <Share2 className="mx-auto h-8 w-8 opacity-50 mb-2" />
        No social posts yet. When articles are repurposed for social channels, they will appear here.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <FilterToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search posts…"
        filters={[
          { label: "Platform", options: platformOptions, selected: platformFilter, onChange: setPlatformFilter },
          { label: "Status", options: statusOptions, selected: statusFilter, onChange: setStatusFilter },
        ]}
        dateRange={range}
        onDateRange={setRange}
      />

      {posts.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No posts match your filters.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 auto-rows-fr">
          {posts.map((post) => (
            <Card key={post.id} className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                {PLATFORM_ICON[post.platform] || <Globe className="h-4 w-4 text-gray-500" />}
                <span className="text-xs font-medium capitalize">{post.platform.replace(/_/g, " ")}</span>
                <Badge variant="outline" className={`ml-auto text-[10px] ${STATUS_STYLE[post.status] || STATUS_STYLE.draft}`}>
                  {post.status === "ready" ? "Pending" : post.status}
                </Badge>
              </div>

              {post.post_text && (
                <p className="text-sm text-gray-700 line-clamp-4 whitespace-pre-wrap">
                  {post.post_text}
                </p>
              )}

              {post.media_plan?.prompt && (
                <div className="text-[10px] text-gray-400 italic">
                  Image: {post.media_plan.prompt}
                </div>
              )}

              <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1">
                {post.scheduled_at && (
                  <span className="flex items-center gap-0.5">
                    <Calendar className="h-3 w-3" />
                    Scheduled: {new Date(post.scheduled_at).toLocaleDateString()}
                  </span>
                )}
                {post.published_at && (
                  <span className="flex items-center gap-0.5">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    Published: {formatRelative(post.published_at)}
                  </span>
                )}
                {!post.scheduled_at && !post.published_at && (
                  <span>{formatRelative(post.created_at)}</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Video Content Section ───────────────────────────────────────── */

interface VideoItem {
  id: number;
  kind: string;
  title: string | null;
  status: string;
  excerpt: string | null;
  target_url: string | null;
  video_url: string | null;
  youtube_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
}

interface VideoSettings {
  video_generation_enabled: boolean;
  video_scripts_enabled: boolean;
  // W-AM-2: global VIDEO_GENERATION_ENABLED env flag. When false the entire
  // video feature is hidden — script/output mismatch is unresolved.
  global_enabled?: boolean;
}

function VideoContentSection() {
  const queryClient = useQueryClient();

  const { data: videosData, isLoading: videosLoading, isError: videosError } = useQuery<{ videos: VideoItem[] }>({
    queryKey: ["/api/portal/contentflow/videos"],
    queryFn: async () => {
      const res = await fetch("/api/portal/contentflow/videos", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load videos");
      return res.json();
    },
  });

  const { data: settings } = useQuery<VideoSettings>({
    queryKey: ["/api/portal/contentflow/video-settings"],
    queryFn: async () => {
      const res = await fetch("/api/portal/contentflow/video-settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load video settings");
      return res.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch("/api/portal/contentflow/video-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ video_generation_enabled: enabled }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/contentflow/video-settings"] });
    },
  });

  const allVideos = videosData?.videos ?? [];
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<DateRange>("all");

  const videos = useMemo(() => {
    let rows = allVideos;
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((v) => (v.title || "").toLowerCase().includes(q) || (v.excerpt || "").toLowerCase().includes(q));
    if (statusFilter.size) rows = rows.filter((v) => statusFilter.has(v.status));
    const cutoff = dateRangeCutoff(range);
    if (cutoff != null) rows = rows.filter((v) => new Date(v.created_at).getTime() >= cutoff);
    return rows;
  }, [allVideos, search, statusFilter, range]);

  const statusOptions = useMemo(
    () => uniqueSorted(allVideos.map((v) => v.status)).map((s) => ({ value: s, label: s })),
    [allVideos],
  );

  const actualVideos = videos.filter((v) => v.kind === "video");
  const scripts = videos.filter((v) => v.kind === "video_script");

  return (
    <div data-theme="light" className="space-y-4">
      {/* Info banner */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <Video className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-900">Video Content</p>
            <p className="text-xs text-blue-700 mt-1">
              Videos use AI to create short clips from your articles. When enabled, we automatically generate
              video scripts, create AI-generated video content, and can upload directly to your YouTube channel.
            </p>
          </div>
        </div>
      </Card>

      {/* Toggle */}
      {settings && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">AI Video Generation</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {settings.video_generation_enabled
                  ? "AI videos are being created from your articles"
                  : "Enable to start generating AI video content"}
              </p>
            </div>
            <button
              onClick={() => toggleMutation.mutate(!settings.video_generation_enabled)}
              disabled={toggleMutation.isPending}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.video_generation_enabled ? "bg-[#0d3cfc]" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.video_generation_enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </Card>
      )}

      {/* Filter toolbar */}
      {!videosLoading && !videosError && allVideos.length > 0 && (
        <FilterToolbar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search videos…"
          filters={[
            { label: "Status", options: statusOptions, selected: statusFilter, onChange: setStatusFilter },
          ]}
          dateRange={range}
          onDateRange={setRange}
        />
      )}

      {/* Videos list */}
      {videosLoading && (
        <div className="grid gap-3 md:grid-cols-2 auto-rows-fr">
          {[0, 1].map((i) => (
            <Card key={i} className="p-4 space-y-3">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </Card>
          ))}
        </div>
      )}

      {videosError && (
        <Card className="p-6 text-sm text-red-700">
          Failed to load videos. Please try again later.
        </Card>
      )}

      {!videosLoading && !videosError && allVideos.length === 0 && (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          <Video className="mx-auto h-8 w-8 opacity-50 mb-2" />
          No videos yet. When articles are repurposed with video generation enabled, they will appear here.
        </Card>
      )}

      {!videosLoading && !videosError && allVideos.length > 0 && videos.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No videos match your filters.
        </Card>
      )}

      {!videosLoading && actualVideos.length > 0 && (
        <>
          <h3 className="text-sm font-medium text-gray-700">Generated Videos</h3>
          <div className="grid gap-3 md:grid-cols-2 auto-rows-fr">
            {actualVideos.map((video) => (
              <Card key={video.id} className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-red-600" />
                  <span className="text-xs font-medium">Video</span>
                  <Badge variant="outline" className={`ml-auto text-[10px] ${
                    video.status === "published" ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                    : video.status === "approved" ? "bg-blue-100 text-blue-800 border-blue-200"
                    : "bg-gray-100 text-gray-700 border-gray-200"
                  }`}>
                    {video.status}
                  </Badge>
                </div>

                <h4 className="text-sm font-medium text-gray-900 line-clamp-2">
                  {video.title || `Video #${video.id}`}
                </h4>

                {video.excerpt && (
                  <p className="text-xs text-gray-500 line-clamp-2">{video.excerpt}</p>
                )}

                <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1">
                  {video.youtube_url && (
                    <a
                      href={video.youtube_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-red-600 hover:underline flex items-center gap-0.5"
                    >
                      Watch on YouTube <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {video.video_url && !video.youtube_url && (
                    <a
                      href={video.video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-0.5"
                    >
                      View Video <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <span>{formatRelative(video.created_at)}</span>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {!videosLoading && scripts.length > 0 && (
        <>
          <h3 className="text-sm font-medium text-gray-700 mt-4">Video Scripts</h3>
          <div className="grid gap-3 md:grid-cols-2 auto-rows-fr">
            {scripts.map((script) => (
              <Card key={script.id} className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-500" />
                  <span className="text-xs font-medium">Script</span>
                  <Badge variant="outline" className="ml-auto text-[10px] bg-gray-100 text-gray-700 border-gray-200">
                    {script.status}
                  </Badge>
                </div>
                <h4 className="text-sm font-medium text-gray-900 line-clamp-2">
                  {script.title || `Script #${script.id}`}
                </h4>
                {script.excerpt && (
                  <p className="text-xs text-gray-500 line-clamp-2">{script.excerpt}</p>
                )}
                <span className="text-[10px] text-muted-foreground">{formatRelative(script.created_at)}</span>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
