/**
 * Portal — ContentFlow content library.
 *
 * Route: /portal/contentflow/library
 *
 * A real home for the assets the customer generates in the prompt-library
 * picker. Every generation persists a content_drafts row
 * (surface='contentflow_portal'); this page lists them newest-first and
 * lets the customer open / download / edit / delete / schedule-to-SocialSync
 * each one.
 *
 * Data: GET /api/portal/contentflow/drafts?surface=contentflow_portal
 * Mutations:
 *   PATCH  /drafts/:id                         — edit body/title
 *   DELETE /drafts/:id                         — remove
 *   POST   /drafts/:id/schedule-to-socialsync  — hand off to SocialSync
 *
 * This page has no user-fillable lead form (edits happen in a modal), so it
 * is listed in scripts/copilot-form-exempt.txt — matching the precedent for
 * the other read-mostly portal dashboards/lists.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Image as ImageIcon,
  FileText,
  Video,
  Layers,
  Edit2,
  Download,
  Trash2,
  Send,
  Save,
  ArrowLeft,
  Inbox,
  AlertCircle,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/usePageTitle";

interface LibraryDraft {
  id: number;
  kind: string;
  title: string | null;
  body: string | null;
  excerpt: string | null;
  status: string;
  surface: string;
  target_platform: string | null;
  image_url: string | null;
  rendered_prompt: string | null;
  template_id: string | null;
  style_preset: string | null;
  generation_status: string | null;
  linked_social_post_id: number | null;
  created_at: string | null;
  updated_at: string | null;
}

interface LibraryResponse {
  drafts: LibraryDraft[];
}

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  image: ImageIcon,
  article: FileText,
  video: Video,
  multi: Layers,
};

function kindIcon(kind: string) {
  return KIND_ICON[kind] ?? FileText;
}

export default function ContentFlowLibrary() {
  usePageTitle("ContentFlow — Library");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<LibraryDraft | null>(null);
  const [editBody, setEditBody] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<LibraryDraft | null>(null);

  const libraryQuery = useQuery<LibraryResponse>({
    queryKey: ["/api/portal/contentflow/drafts", "contentflow_portal"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/portal/contentflow/drafts?surface=contentflow_portal");
      return res.json();
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/portal/contentflow/drafts", "contentflow_portal"] });

  const saveEditMutation = useMutation<{ ok: boolean }, Error, void>({
    mutationFn: async () => {
      if (!editing) throw new Error("no draft");
      const res = await apiRequest("PATCH", `/api/portal/contentflow/drafts/${editing.id}`, { body: editBody });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      return json;
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Your changes are stored." });
      setEditing(null);
      invalidate();
    },
    onError: (err) => {
      toast({ title: "Could not save", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation<{ ok: boolean }, Error, number>({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/portal/contentflow/drafts/${id}`, undefined);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");
      return json;
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Removed from your library." });
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => {
      toast({ title: "Could not delete", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  const scheduleMutation = useMutation<{ ok: boolean; reused?: boolean }, Error, number>({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/portal/contentflow/drafts/${id}/schedule-to-socialsync`, {});
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Schedule failed");
      return json;
    },
    onSuccess: (data) => {
      toast({
        title: data.reused ? "Already in SocialSync" : "Sent to SocialSync",
        description: "Open SocialSync to schedule and publish this post.",
      });
      invalidate();
    },
    onError: (err) => {
      toast({ title: "Could not send to SocialSync", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  function downloadText(d: LibraryDraft) {
    const blob = new Blob([d.body ?? ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contentflow-${d.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const drafts = libraryQuery.data?.drafts ?? [];

  return (
    <PortalLayout>
      <div className="px-4 py-6 sm:px-6 lg:px-8" data-testid="portal-contentflow-library">
        <div className="mb-6 flex flex-col gap-1">
          <Link href="/portal/contentflow" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Back to prompt library
          </Link>
          <h2 className="text-2xl font-bold tracking-tight">Your content library</h2>
          <p className="text-sm text-muted-foreground">
            Every image, article, and asset you generate lands here. Open, edit, download, delete, or send it to SocialSync to schedule.
          </p>
        </div>

        {/* ── Loading skeleton ── */}
        {libraryQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="library-loading">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="flex h-64 animate-pulse flex-col p-4">
                <div className="mb-3 h-32 rounded-md bg-muted/50" />
                <div className="mb-2 h-4 w-2/3 rounded bg-muted/50" />
                <div className="h-3 w-full rounded bg-muted/40" />
              </Card>
            ))}
          </div>
        ) : libraryQuery.isError ? (
          /* ── Typed error state ── */
          <Card className="flex flex-col items-center gap-3 p-8 text-center" data-testid="library-error">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div className="text-sm font-medium text-destructive">Could not load your library.</div>
            <Button variant="outline" size="sm" onClick={() => libraryQuery.refetch()}>
              Try again
            </Button>
          </Card>
        ) : drafts.length === 0 ? (
          /* ── Empty state ── */
          <Card className="flex flex-col items-center gap-3 p-10 text-center" data-testid="library-empty">
            <Inbox className="h-8 w-8 text-muted-foreground/60" />
            <div className="text-sm font-medium">Nothing here yet</div>
            <p className="max-w-sm text-xs text-muted-foreground">
              Generate your first image or article from the prompt library, then keep it here to edit, download, or schedule.
            </p>
            <Link href="/portal/contentflow">
              <Button size="sm" data-testid="library-empty-cta">Browse the prompt library</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {drafts.map((d) => {
              const Icon = kindIcon(d.kind);
              return (
                <Card key={d.id} className="flex h-full flex-col p-4" data-testid={`library-card-${d.id}`}>
                  <div className="mb-3 flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{d.kind}</Badge>
                    {d.linked_social_post_id ? (
                      <Badge variant="secondary" className="text-[10px]">In SocialSync</Badge>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{d.status}</span>
                    )}
                  </div>
                  <div className="mb-3 flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted/40 text-muted-foreground">
                    {d.image_url ? (
                      // eslint-disable-next-line jsx-a11y/img-redundant-alt
                      <img src={d.image_url} alt={`${d.title ?? "Generated asset"} preview`} className="h-full w-full object-cover" />
                    ) : (
                      <Icon className="h-8 w-8 opacity-60" />
                    )}
                  </div>
                  <h3 className="mb-1 line-clamp-1 text-sm font-semibold leading-snug">{d.title ?? "Untitled"}</h3>
                  {d.body && (
                    <p className="mb-3 line-clamp-2 flex-1 text-xs text-muted-foreground leading-relaxed">{d.body}</p>
                  )}
                  {!d.body && <div className="flex-1" />}

                  <div className="flex flex-wrap gap-1.5">
                    {d.image_url && (
                      <a href={d.image_url} download={`contentflow-${d.id}.png`} data-testid={`library-download-image-${d.id}`}>
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                          <Download className="mr-1 h-3 w-3" /> Image
                        </Button>
                      </a>
                    )}
                    {d.body && (
                      <>
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => downloadText(d)} data-testid={`library-download-text-${d.id}`}>
                          <Download className="mr-1 h-3 w-3" /> Text
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => { setEditing(d); setEditBody(d.body ?? ""); }}
                          data-testid={`library-edit-${d.id}`}
                        >
                          <Edit2 className="mr-1 h-3 w-3" /> Edit
                        </Button>
                      </>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => scheduleMutation.mutate(d.id)}
                      disabled={scheduleMutation.isPending}
                      data-testid={`library-schedule-${d.id}`}
                    >
                      <Send className="mr-1 h-3 w-3" /> SocialSync
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(d)}
                      data-testid={`library-delete-${d.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── Edit modal ── */}
        <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
          <DialogContent className="max-w-2xl" data-testid="library-edit-dialog">
            <DialogHeader>
              <DialogTitle>{editing?.title ?? "Edit content"}</DialogTitle>
              <DialogDescription>Edit the body, then save it back to your library.</DialogDescription>
            </DialogHeader>
            <Textarea
              rows={14}
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="text-sm leading-relaxed"
              data-testid="library-edit-textarea"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button
                onClick={() => saveEditMutation.mutate()}
                disabled={saveEditMutation.isPending || !editBody.trim()}
                data-testid="library-edit-save"
              >
                {saveEditMutation.isPending ? (
                  <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Saving…</>
                ) : (
                  <><Save className="mr-1 h-3.5 w-3.5" /> Save</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Delete confirm ── */}
        <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <DialogContent className="max-w-md" data-testid="library-delete-dialog">
            <DialogHeader>
              <DialogTitle>Delete this asset?</DialogTitle>
              <DialogDescription>
                This removes "{deleteTarget?.title ?? "the asset"}" from your library. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                data-testid="library-delete-confirm"
              >
                {deleteMutation.isPending ? (
                  <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Deleting…</>
                ) : (
                  <><Trash2 className="mr-1 h-3.5 w-3.5" /> Delete</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PortalLayout>
  );
}
