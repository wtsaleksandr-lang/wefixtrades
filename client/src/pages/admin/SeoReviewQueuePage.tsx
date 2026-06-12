/**
 * /admin/seo/review — owned-domain SEO content review queue (human gate).
 *
 * Minimal admin-only surface for the WeFixTrades SEO content engine. The
 * generator files data-backed articles as status='in_review'; this page is
 * where a reviewer reads them and decides:
 *   • Approve  → published (feeds the sitemap + Bing indexing)
 *   • Edit     → patch title/meta/excerpt/body, stays in_review
 *   • Reject   → archived
 *
 * Nothing here auto-publishes — every publish is an explicit Approve click,
 * and the server only promotes in_review rows. Read-heavy: a list on the left,
 * a preview/decision panel on the right. No fillable intake form (edit is an
 * inline reviewer action), so this page is on the copilot-form exempt list.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox, CheckCircle2, XCircle, Pencil, RefreshCw, FileText, Database } from "lucide-react";

interface QueueRow {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  status: string;
  author: string;
  uniqueDataScore: number | null;
  sampleSize: number | null;
  createdAt: string | null;
}

interface PreviewData {
  page: {
    id: number;
    slug: string;
    title: string;
    metaDescription: string;
    excerpt: string;
    content: string;
    status: string;
    author: string;
    canonical: string | null;
    originalData: Record<string, unknown> | null;
    uniqueDataScore: number | null;
  };
  jsonld: Record<string, unknown>;
  audit: { action: string; actorType: string; notes: string | null; createdAt: string | null }[];
}

export default function SeoReviewQueuePage() {
  usePageTitle("SEO Review Queue");
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const queueKey = ["/api/admin/seo/review/queue"];
  const { data, isLoading, isError, refetch, isFetching } = useQuery<{ drafts: QueueRow[]; count: number }>({
    queryKey: queueKey,
    queryFn: () => apiRequest("GET", "/api/admin/seo/review/queue").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const previewKey = ["/api/admin/seo/review", selectedId];
  const { data: preview, isLoading: previewLoading } = useQuery<PreviewData>({
    queryKey: previewKey,
    queryFn: () => apiRequest("GET", `/api/admin/seo/review/${selectedId}`).then((r) => r.json()),
    enabled: selectedId != null,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: queueKey });
    if (selectedId != null) qc.invalidateQueries({ queryKey: ["/api/admin/seo/review", selectedId] });
  };

  const approveMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/admin/seo/review/${id}/approve`, {}).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Published", description: "The article is now live and will be added to the sitemap." });
      setSelectedId(null);
      invalidateAll();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Approve failed", description: e?.message || "Unknown error" }),
  });

  const rejectMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/admin/seo/review/${id}/reject`, {}).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Rejected", description: "The draft was archived." });
      setSelectedId(null);
      invalidateAll();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Reject failed", description: e?.message || "Unknown error" }),
  });

  const editMut = useMutation({
    mutationFn: (vars: { id: number; title: string; content: string }) =>
      apiRequest("PATCH", `/api/admin/seo/review/${vars.id}`, { title: vars.title, content: vars.content }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Saved", description: "Draft updated. It stays in review until you approve." });
      setEditing(false);
      invalidateAll();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Save failed", description: e?.message || "Unknown error" }),
  });

  const drafts = data?.drafts ?? [];

  const startEditing = () => {
    if (!preview) return;
    setEditTitle(preview.page.title);
    setEditContent(preview.page.content);
    setEditing(true);
  };

  const od = preview?.page.originalData as Record<string, any> | null | undefined;

  return (
    <AdminLayout>
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">SEO Review Queue</h1>
            <p className="text-sm text-muted-foreground">
              Data-backed articles awaiting human review. Approve to publish — nothing goes live automatically.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="seo-review-refresh">
            <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          {/* ── List ── */}
          <Card className="overflow-hidden">
            <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              {isLoading ? "Loading…" : `${drafts.length} awaiting review`}
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {isLoading && (
                <div className="space-y-2 p-3">
                  {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              )}
              {isError && !isLoading && (
                <div className="p-4 text-sm text-destructive">Failed to load the review queue.</div>
              )}
              {!isLoading && !isError && drafts.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
                  <Inbox className="h-8 w-8 opacity-50" />
                  <span>No drafts awaiting review.</span>
                </div>
              )}
              {drafts.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => { setSelectedId(d.id); setEditing(false); }}
                  className={`w-full border-b px-3 py-2 text-left transition-colors hover:bg-muted/50 ${
                    selectedId === d.id ? "bg-muted" : ""
                  }`}
                  data-testid={`seo-review-row-${d.id}`}
                >
                  <div className="line-clamp-1 text-sm font-medium">{d.title}</div>
                  <div className="line-clamp-1 text-xs text-muted-foreground">{d.excerpt}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">in review</Badge>
                    {d.sampleSize != null && (
                      <span className="text-[10px] text-muted-foreground">n={String(d.sampleSize)}</span>
                    )}
                    {d.uniqueDataScore != null && (
                      <span className="text-[10px] text-muted-foreground">data score {d.uniqueDataScore}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* ── Preview / decision ── */}
          <Card className="overflow-hidden">
            {selectedId == null && (
              <div className="flex flex-col items-center gap-2 py-24 text-sm text-muted-foreground">
                <FileText className="h-8 w-8 opacity-40" />
                <span>Select a draft to review.</span>
              </div>
            )}

            {selectedId != null && previewLoading && (
              <div className="space-y-3 p-4">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-40 w-full" />
              </div>
            )}

            {selectedId != null && preview && !previewLoading && (
              <div className="flex h-full flex-col">
                {/* Action bar */}
                <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
                  <Button
                    size="sm"
                    onClick={() => approveMut.mutate(preview.page.id)}
                    disabled={approveMut.isPending || editing}
                    data-testid="seo-review-approve"
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                    Approve &amp; Publish
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={startEditing}
                    disabled={editing}
                    data-testid="seo-review-edit"
                  >
                    <Pencil className="mr-1 h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => rejectMut.mutate(preview.page.id)}
                    disabled={rejectMut.isPending || editing}
                    data-testid="seo-review-reject"
                  >
                    <XCircle className="mr-1 h-4 w-4" />
                    Reject
                  </Button>
                  <span className="ml-auto text-xs text-muted-foreground">/blog/{preview.page.slug}</span>
                </div>

                <div className="max-h-[64vh] space-y-4 overflow-y-auto p-4">
                  {/* Data-provenance summary — the moat, surfaced for the reviewer */}
                  {od && (
                    <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
                      <div className="mb-1 flex items-center gap-1 font-medium">
                        <Database className="h-3.5 w-3.5" />
                        Original data cited
                      </div>
                      <div className="text-muted-foreground">
                        {String(od.sampleSize)} real quotes · median ${String(od.median)} · range ${String(od.p25)}–${String(od.p75)}
                        {od.region ? ` · ${String(od.region)}` : ""} · unique data score {preview.page.uniqueDataScore ?? "—"}
                      </div>
                    </div>
                  )}

                  {editing ? (
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Title</label>
                        <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Body (Markdown)</label>
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="min-h-[280px] font-mono text-xs"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => editMut.mutate({ id: preview.page.id, title: editTitle, content: editContent })}
                          disabled={editMut.isPending}
                        >
                          Save changes
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <h2 className="text-base font-semibold">{preview.page.title}</h2>
                        <p className="text-xs text-muted-foreground">{preview.page.metaDescription}</p>
                      </div>
                      <pre className="whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-xs leading-relaxed">
                        {preview.page.content}
                      </pre>
                      <details className="text-xs">
                        <summary className="cursor-pointer font-medium text-muted-foreground">Article JSON-LD</summary>
                        <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px]">
                          {JSON.stringify(preview.jsonld, null, 2)}
                        </pre>
                      </details>
                      {preview.audit.length > 0 && (
                        <details className="text-xs">
                          <summary className="cursor-pointer font-medium text-muted-foreground">Review history</summary>
                          <ul className="mt-2 space-y-1">
                            {preview.audit.map((a, i) => (
                              <li key={i} className="text-muted-foreground">
                                <span className="font-medium">{a.action}</span> · {a.actorType}
                                {a.notes ? ` — ${a.notes}` : ""}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
