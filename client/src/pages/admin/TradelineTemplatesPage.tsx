/**
 * Admin view of all TradeLine + Portal Concierge niche templates.
 * Lists all 80 templates (40 TradeLine receptionist + 40 Concierge), surfaces
 * which have admin overrides applied, and lets admin edit any field on
 * either kind.
 *
 * Mounted at /admin/tradeline/templates (admin-only).
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/usePageTitle";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Phone, Sparkles, RotateCcw, Save, Search, X, CheckCircle2 } from "lucide-react";

type TemplateKind = "tradeline" | "concierge";

interface TemplateSummary {
  kind: TemplateKind;
  templateId: string;
  name: string;
  defaultTone: string;
  hasOverride: boolean;
  effective: Record<string, unknown>;
}

interface ListResponse {
  tradeline: TemplateSummary[];
  concierge: TemplateSummary[];
}

interface DetailResponse {
  kind: TemplateKind;
  templateId: string;
  codeDefault: Record<string, unknown>;
  overrides: Record<string, unknown> | null;
  effective: Record<string, unknown>;
  updatedAt: string | null;
  updatedBy: number | null;
}

const TRADELINE_FIELDS: Array<{ key: string; label: string; multiline: boolean; isArray?: boolean }> = [
  { key: "name", label: "Name", multiline: false },
  { key: "matchPatterns", label: "Match patterns (one per line)", multiline: true, isArray: true },
  { key: "systemPromptBase", label: "System prompt base", multiline: true },
  { key: "defaultTone", label: "Default tone (professional | friendly | casual)", multiline: false },
  { key: "callFlowNotes", label: "Call flow notes", multiline: true },
  { key: "fallbackBehavior", label: "Fallback behavior (when AI can't answer)", multiline: true },
  { key: "bookingBehavior", label: "Booking behavior", multiline: true },
  { key: "escalationRules", label: "Escalation rules", multiline: true },
  { key: "fallbackServices", label: "Fallback services (one per line)", multiline: true, isArray: true },
];

const CONCIERGE_FIELDS: Array<{ key: string; label: string; multiline: boolean; isArray?: boolean }> = [
  { key: "name", label: "Name", multiline: false },
  { key: "matchPatterns", label: "Match patterns (one per line)", multiline: true, isArray: true },
  { key: "systemPromptBase", label: "System prompt base", multiline: true },
  { key: "defaultTone", label: "Default tone (professional | friendly | casual)", multiline: false },
  { key: "coachingFocus", label: "Coaching focus (what AI helps with)", multiline: true },
  { key: "industryNorms", label: "Industry norms", multiline: true },
  { key: "commonChallenges", label: "Common challenges this trade faces", multiline: true },
  { key: "toolingHints", label: "Tooling / software hints", multiline: true },
  { key: "escalationToHuman", label: "When to escalate to a real expert", multiline: true },
];

export default function TradelineTemplatesPage() {
  usePageTitle("TradeLine Templates");
  const [activeKind, setActiveKind] = useState<TemplateKind>("tradeline");
  const [search, setSearch] = useState("");
  const [openTemplate, setOpenTemplate] = useState<{ kind: TemplateKind; templateId: string } | null>(null);

  const list = useQuery<ListResponse>({
    queryKey: ["/api/admin/tradeline/templates"],
    queryFn: () => fetch("/api/admin/tradeline/templates", { credentials: "include" }).then((r) => r.json()),
  });

  const filtered = useMemo(() => {
    const items = activeKind === "tradeline" ? (list.data?.tradeline ?? []) : (list.data?.concierge ?? []);
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter(
      (t) => t.templateId.toLowerCase().includes(q) || t.name.toLowerCase().includes(q),
    );
  }, [list.data, activeKind, search]);

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">TradeLine Templates</h1>
            <p className="text-sm text-gray-600 mt-1 max-w-2xl">
              40 customer-facing receptionist personas + 40 trade-facing Concierge personas. Edit any field; overrides
              persist to the database and merge over the code defaults at runtime. Reset returns a template to its code default.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Search niches…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56"
              data-testid="template-search"
            />
          </div>
        </div>

        <Tabs value={activeKind} onValueChange={(v) => setActiveKind(v as TemplateKind)}>
          <TabsList>
            <TabsTrigger value="tradeline">
              <Phone className="w-3.5 h-3.5 mr-1.5" />
              TradeLine receptionists ({list.data?.tradeline?.length ?? "…"})
            </TabsTrigger>
            <TabsTrigger value="concierge">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Portal Concierge ({list.data?.concierge?.length ?? "…"})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tradeline" className="mt-4">
            <TemplateGrid templates={filtered} loading={list.isLoading} onOpen={(t) => setOpenTemplate({ kind: t.kind, templateId: t.templateId })} />
          </TabsContent>
          <TabsContent value="concierge" className="mt-4">
            <TemplateGrid templates={filtered} loading={list.isLoading} onOpen={(t) => setOpenTemplate({ kind: t.kind, templateId: t.templateId })} />
          </TabsContent>
        </Tabs>
      </div>

      {openTemplate && (
        <TemplateDetailDialog
          kind={openTemplate.kind}
          templateId={openTemplate.templateId}
          onClose={() => setOpenTemplate(null)}
        />
      )}
    </AdminLayout>
  );
}

function TemplateGrid({
  templates,
  loading,
  onOpen,
}: {
  templates: TemplateSummary[];
  loading: boolean;
  onOpen: (t: TemplateSummary) => void;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }
  if (templates.length === 0) {
    return <div className="text-sm text-gray-500 py-10 text-center">No templates match your search.</div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 auto-rows-fr">
      {templates.map((t) => (
        <Card
          key={`${t.kind}:${t.templateId}`}
          className="p-4 cursor-pointer hover:border-indigo-300 transition-colors flex flex-col"
          onClick={() => onOpen(t)}
          data-testid={`template-card-${t.kind}-${t.templateId}`}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <div className="font-semibold text-gray-900">{t.name}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">id: {t.templateId}</div>
            </div>
            {t.hasOverride && (
              <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-800 text-[10px]">
                Edited
              </Badge>
            )}
          </div>
          <div className="text-xs text-gray-600 mt-auto">
            Tone: <span className="font-medium">{t.defaultTone}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

function TemplateDetailDialog({
  kind,
  templateId,
  onClose,
}: {
  kind: TemplateKind;
  templateId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const detail = useQuery<DetailResponse>({
    queryKey: [`/api/admin/tradeline/templates/${kind}/${templateId}`],
    queryFn: () => fetch(`/api/admin/tradeline/templates/${kind}/${templateId}`, { credentials: "include" }).then((r) => r.json()),
  });

  const [dirty, setDirty] = useState<Record<string, unknown>>({});
  const [showCodeDefault, setShowCodeDefault] = useState(false);

  const effective: Record<string, unknown> | undefined = detail.data?.effective as any;
  const codeDefault: Record<string, unknown> | undefined = detail.data?.codeDefault as any;
  const fields = kind === "tradeline" ? TRADELINE_FIELDS : CONCIERGE_FIELDS;

  function fieldValue(key: string): string {
    if (key in dirty) return formatForInput(dirty[key]);
    if (!effective) return "";
    return formatForInput(effective[key]);
  }

  function setField(key: string, raw: string, isArray?: boolean) {
    setDirty((d) => ({ ...d, [key]: isArray ? raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : raw }));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const merged: Record<string, unknown> = {};
      // Build full overrides blob from dirty fields only (other fields keep code default).
      for (const f of fields) {
        if (f.key in dirty) merged[f.key] = dirty[f.key];
      }
      // Also preserve any existing overrides that aren't in dirty (the admin may have edited fewer fields this session)
      if (detail.data?.overrides) {
        for (const [k, v] of Object.entries(detail.data.overrides)) {
          if (!(k in merged)) merged[k] = v;
        }
      }
      const res = await fetch(`/api/admin/tradeline/templates/${kind}/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ overrides: merged }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Save failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tradeline/templates"] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/tradeline/templates/${kind}/${templateId}`] });
      setDirty({});
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/tradeline/templates/${kind}/${templateId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Reset failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tradeline/templates"] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/tradeline/templates/${kind}/${templateId}`] });
      setDirty({});
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {kind === "tradeline" ? <Phone className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            {kind === "tradeline" ? "TradeLine receptionist" : "Portal Concierge"} — {detail.data?.codeDefault && (detail.data.codeDefault as any).name}
            <Badge variant="outline" className="text-[10px] ml-2">{templateId}</Badge>
            {detail.data?.overrides && (
              <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-800 text-[10px]">
                Has admin overrides
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {detail.isLoading && <Skeleton className="h-96" />}
        {detail.data && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 text-xs text-gray-600">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCodeDefault}
                  onChange={(e) => setShowCodeDefault(e.target.checked)}
                />
                Show code default alongside (read-only)
              </label>
              {detail.data.updatedAt && (
                <span>Last edited: {new Date(detail.data.updatedAt).toLocaleString()}</span>
              )}
            </div>

            {fields.map((f) => {
              const codeDefaultRaw = codeDefault?.[f.key];
              return (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1">
                    {f.label}
                  </label>
                  {f.multiline ? (
                    <Textarea
                      value={fieldValue(f.key)}
                      onChange={(e) => setField(f.key, e.target.value, f.isArray)}
                      rows={f.isArray ? 5 : 4}
                      className="text-sm font-mono"
                      data-testid={`field-${f.key}`}
                    />
                  ) : (
                    <Input
                      value={fieldValue(f.key)}
                      onChange={(e) => setField(f.key, e.target.value, f.isArray)}
                      className="text-sm"
                      data-testid={`field-${f.key}`}
                    />
                  )}
                  {showCodeDefault && codeDefaultRaw != null && (
                    <details className="mt-1.5 text-[11px] text-gray-500">
                      <summary className="cursor-pointer">Code default</summary>
                      <pre className="whitespace-pre-wrap mt-1 p-2 rounded bg-gray-50 border border-gray-200 font-mono">
                        {formatForInput(codeDefaultRaw)}
                      </pre>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="w-3.5 h-3.5 mr-1" /> Close
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending || !detail.data?.overrides}
            title="Delete this template's admin overrides — returns it to the code default"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            {resetMutation.isPending ? "Resetting…" : "Reset to code default"}
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || Object.keys(dirty).length === 0}
            data-testid="save-template"
          >
            {saveMutation.isPending ? (
              <>Saving…</>
            ) : saveMutation.isSuccess && Object.keys(dirty).length === 0 ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Saved
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 mr-1" /> Save overrides
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatForInput(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => String(x)).join("\n");
  return String(v);
}
