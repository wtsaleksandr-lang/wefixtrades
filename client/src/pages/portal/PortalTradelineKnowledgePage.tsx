/**
 * Wave W-AW-1 — Client-facing TradeLine knowledge base management.
 *
 * Mounted at /portal/tradeline/knowledge. The owner curates FAQ, service,
 * policy, pricing, and doc entries — the AI receptionist references them
 * verbatim on every call/chat. Includes a preview pane that previews how
 * the entries will appear in the system prompt.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/usePageTitle";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Save,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
  BookOpen,
  X,
  AlertCircle,
  RotateCw,
} from "lucide-react";

type Kind = "faq" | "service" | "policy" | "pricing" | "doc";

interface Entry {
  id: string;
  kind: Kind;
  title: string;
  content: string;
  priority: number;
  status: "active" | "draft" | "archived";
}

const KIND_LABEL: Record<Kind, string> = {
  faq: "FAQs",
  service: "Services",
  policy: "Policies",
  pricing: "Pricing",
  doc: "Docs",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export default function PortalTradelineKnowledgePage() {
  usePageTitle("Knowledge Base");
  const qc = useQueryClient();
  const [activeKind, setActiveKind] = useState<Kind>("faq");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [creating, setCreating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const entriesQ = useQuery<{ entries: Entry[] }>({
    queryKey: ["/api/portal/tradeline/knowledge"],
    queryFn: () => api("/api/portal/tradeline/knowledge"),
  });
  const isLoading = entriesQ.isLoading;
  const isError = entriesQ.isError;
  const totalEntries = entriesQ.data?.entries?.length ?? 0;

  const saveMut = useMutation({
    mutationFn: async (data: Partial<Entry> & { id?: string }) => {
      if (creating) {
        return api("/api/portal/tradeline/knowledge", { method: "POST", body: JSON.stringify(data) });
      }
      return api(`/api/portal/tradeline/knowledge/${data.id}`, { method: "PATCH", body: JSON.stringify(data) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/portal/tradeline/knowledge"] });
      setEditing(null);
      setCreating(false);
    },
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => api(`/api/portal/tradeline/knowledge/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portal/tradeline/knowledge"] }),
  });

  const reorderMut = useMutation({
    mutationFn: (order: { id: string; priority: number }[]) =>
      api("/api/portal/tradeline/knowledge/reorder", { method: "POST", body: JSON.stringify({ order }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portal/tradeline/knowledge"] }),
  });

  const grouped = useMemo(() => {
    const g: Record<Kind, Entry[]> = { faq: [], service: [], policy: [], pricing: [], doc: [] };
    for (const e of entriesQ.data?.entries ?? []) {
      if (g[e.kind]) g[e.kind].push(e);
    }
    return g;
  }, [entriesQ.data]);

  const allActive = useMemo(
    () => (entriesQ.data?.entries ?? []).filter((e) => e.status === "active"),
    [entriesQ.data],
  );

  const previewText = useMemo(() => {
    if (allActive.length === 0) return "(No active entries yet — your AI assistant will use its default knowledge.)";
    const lines: string[] = [
      "=== BUSINESS KNOWLEDGE ===",
      "Use these entries as your source of truth for anything about this business.",
      "",
    ];
    for (const e of allActive) {
      lines.push(`[${e.kind.toUpperCase()}] ${e.title}`);
      lines.push(e.content.length > 500 ? e.content.slice(0, 500) + "…" : e.content);
      lines.push("");
    }
    return lines.join("\n");
  }, [allActive]);

  const move = (id: string, dir: -1 | 1) => {
    const list = grouped[activeKind];
    const idx = list.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    const a = list[idx];
    const b = list[target];
    reorderMut.mutate([
      { id: a.id, priority: b.priority },
      { id: b.id, priority: a.priority },
    ]);
  };

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-brand-blue" /> Knowledge Base
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Anything you add here is read by your AI receptionist on every call and chat.
              Higher-priority entries are surfaced first.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowPreview(true)} data-testid="button-preview-kb">
              <Eye className="w-4 h-4 mr-1" /> Preview
            </Button>
            <Button
              onClick={() => {
                setCreating(true);
                setEditing({ id: "", kind: activeKind, title: "", content: "", priority: 0, status: "active" });
              }}
              data-testid="button-add-entry"
            >
              <Plus className="w-4 h-4 mr-1" /> Add entry
            </Button>
          </div>
        </div>

        {/* Help cue — top-left, muted, per design-system rule. */}
        <p className="text-xs text-gray-500">
          Tip: organize by kind (FAQ, Service, Policy…) and raise priority on entries the AI should quote verbatim.
        </p>

        {/* Loading — skeleton grid that matches the live layout so the
            page doesn't reflow when data lands. */}
        {isLoading && (
          <div className="space-y-4" aria-busy="true" aria-label="Loading knowledge entries">
            <div className="flex gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-24 rounded-md" />
              ))}
            </div>
            <div className="space-y-2 mt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-3/4" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Skeleton className="h-8 w-8" />
                      <Skeleton className="h-8 w-8" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Error — clear message + retry. */}
        {isError && !isLoading && (
          <Card className="p-6 bg-red-50 border-red-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-800">Couldn't load your knowledge base</p>
                <p className="text-xs text-red-700 mt-1">
                  {(entriesQ.error as Error | null)?.message ?? "The server didn't respond as expected."}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => entriesQ.refetch()}
                  disabled={entriesQ.isFetching}
                  data-testid="button-retry-kb"
                >
                  <RotateCw className={`w-3.5 h-3.5 mr-1.5 ${entriesQ.isFetching ? "animate-spin" : ""}`} />
                  Retry
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Empty — surfaced once, before the tab UI, when nothing has been
            created yet. Per-kind empty states still show inside each tab. */}
        {!isLoading && !isError && totalEntries === 0 && (
          <Card className="p-10 text-center">
            <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">No knowledge entries yet</p>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              Add your first entry — FAQs, services, or pricing notes the AI should know about your business.
            </p>
            <Button
              onClick={() => {
                setCreating(true);
                setEditing({ id: "", kind: activeKind, title: "", content: "", priority: 0, status: "active" });
              }}
              data-testid="button-empty-add-entry"
            >
              <Plus className="w-4 h-4 mr-1" /> Add your first entry
            </Button>
          </Card>
        )}

        {!isLoading && !isError && totalEntries > 0 && (
        <Tabs value={activeKind} onValueChange={(v) => setActiveKind(v as Kind)}>
          <TabsList>
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <TabsTrigger key={k} value={k}>
                {KIND_LABEL[k]}
                <Badge variant="secondary" className="ml-2">{grouped[k].length}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <TabsContent key={k} value={k} className="space-y-2 mt-4">
              {grouped[k].length === 0 && (
                <Card className="p-6 text-center text-gray-500 text-sm">
                  No {KIND_LABEL[k].toLowerCase()} yet. Add your first entry above.
                </Card>
              )}
              {grouped[k].map((entry, idx) => (
                <Card key={entry.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{entry.title}</span>
                        {entry.status !== "active" && (
                          <Badge variant="secondary">{entry.status}</Badge>
                        )}
                        <span className="text-xs text-gray-400">priority {entry.priority}</span>
                      </div>
                      <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap line-clamp-3">{entry.content}</div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button size="icon" variant="ghost" disabled={idx === 0} onClick={() => move(entry.id, -1)} aria-label={`Move ${entry.title} up`}>
                        <ArrowUp className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" disabled={idx === grouped[k].length - 1} onClick={() => move(entry.id, 1)} aria-label={`Move ${entry.title} down`}>
                        <ArrowDown className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditing(entry); setCreating(false); }}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => archiveMut.mutate(entry.id)} aria-label={`Archive ${entry.title}`}>
                      <Trash2 className="w-3 h-3 mr-1" /> Archive
                    </Button>
                  </div>
                </Card>
              ))}
            </TabsContent>
          ))}
        </Tabs>
        )}

        {/* Edit / Create dialog */}
        <Dialog open={!!editing} onOpenChange={(open) => { if (!open) { setEditing(null); setCreating(false); } }}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{creating ? "Add knowledge entry" : "Edit knowledge entry"}</DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="space-y-3">
                <label className="block text-sm">
                  <span className="text-gray-700 font-medium">Title</span>
                  <Input className="mt-1" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-700 font-medium">Content (markdown)</span>
                  <Textarea
                    className="mt-1"
                    rows={8}
                    value={editing.content}
                    onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                    placeholder="Write what you want the AI to know — pricing, service area, hours, special offers, etc."
                  />
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <label className="block text-sm">
                    <span className="text-gray-700 font-medium">Kind</span>
                    <select
                      className="mt-1 w-full border rounded px-2 py-1"
                      value={editing.kind}
                      onChange={(e) => setEditing({ ...editing, kind: e.target.value as Kind })}
                    >
                      {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="text-gray-700 font-medium">Priority</span>
                    <Input
                      className="mt-1"
                      type="number"
                      value={editing.priority}
                      onChange={(e) => setEditing({ ...editing, priority: Number.parseInt(e.target.value, 10) || 0 })}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-gray-700 font-medium">Status</span>
                    <select
                      className="mt-1 w-full border rounded px-2 py-1"
                      value={editing.status}
                      onChange={(e) => setEditing({ ...editing, status: e.target.value as Entry["status"] })}
                    >
                      <option value="active">Active</option>
                      <option value="draft">Draft</option>
                    </select>
                  </label>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setEditing(null); setCreating(false); }} aria-label="Cancel and close dialog"><X className="w-4 h-4 mr-1" /> Cancel</Button>
              <Button onClick={() => editing && saveMut.mutate(editing)} disabled={saveMut.isPending}>
                <Save className="w-4 h-4 mr-1" /> Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview dialog */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] sm:w-auto">
            <DialogHeader>
              <DialogTitle>How your AI sees this</DialogTitle>
            </DialogHeader>
            <pre className="text-xs bg-gray-50 border rounded p-3 max-h-[60vh] overflow-auto whitespace-pre-wrap">{previewText}</pre>
            <DialogFooter>
              <Button onClick={() => setShowPreview(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PortalLayout>
  );
}
