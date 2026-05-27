/**
 * Admin view of all TradeLine + Portal Concierge niche templates.
 * Lists all 80 templates (40 TradeLine receptionist + 40 Concierge), surfaces
 * which have admin overrides applied, and lets admin edit any field on
 * either kind.
 *
 * Mounted at /admin/tradeline/templates (admin-only).
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/usePageTitle";
import AdminLayout from "@/components/admin/AdminLayout";
import { ProductSettingsMenu } from "@/components/admin/AdminProductPageShell";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Phone,
  Sparkles,
  RotateCcw,
  Save,
  Search,
  X,
  CheckCircle2,
  Play,
  Copy,
  Plus,
} from "lucide-react";
import VoicePreviewButton from "@/components/tradeline/VoicePreviewButton";

type TemplateKind = "tradeline" | "concierge";

interface TemplateSummary {
  kind: TemplateKind;
  templateId: string;
  name: string;
  defaultTone: string;
  hasOverride: boolean;
  isCustom?: boolean;
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
  const queryClient = useQueryClient();
  const [activeKind, setActiveKind] = useState<TemplateKind>("tradeline");
  const [search, setSearch] = useState("");
  const [openTemplate, setOpenTemplate] = useState<{ kind: TemplateKind; templateId: string } | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateSummary | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const list = useQuery<ListResponse>({
    queryKey: ["/api/admin/tradeline/templates"],
    queryFn: () => fetch("/api/admin/tradeline/templates", { credentials: "include" }).then((r) => r.json()),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (vars: { kind: TemplateKind; templateId: string }) => {
      const res = await fetch("/api/admin/tradeline/templates/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(vars),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Duplicate failed");
      return res.json() as Promise<{ kind: TemplateKind; templateId: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tradeline/templates"] });
      setActiveKind(data.kind);
      setOpenTemplate({ kind: data.kind, templateId: data.templateId });
    },
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
      <div className="space-y-5">
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
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              data-testid="create-template-btn"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Create template
            </Button>
            <ProductSettingsMenu productId="tradeline" productName="TradeLine" />
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
            <TemplateGrid
              templates={filtered}
              loading={list.isLoading}
              onOpen={(t) => setOpenTemplate({ kind: t.kind, templateId: t.templateId })}
              onPreview={(t) => setPreviewTemplate(t)}
              onDuplicate={(t) => duplicateMutation.mutate({ kind: t.kind, templateId: t.templateId })}
              duplicatingId={
                duplicateMutation.isPending ? duplicateMutation.variables?.templateId ?? null : null
              }
            />
          </TabsContent>
          <TabsContent value="concierge" className="mt-4">
            <TemplateGrid
              templates={filtered}
              loading={list.isLoading}
              onOpen={(t) => setOpenTemplate({ kind: t.kind, templateId: t.templateId })}
              onPreview={(t) => setPreviewTemplate(t)}
              onDuplicate={(t) => duplicateMutation.mutate({ kind: t.kind, templateId: t.templateId })}
              duplicatingId={
                duplicateMutation.isPending ? duplicateMutation.variables?.templateId ?? null : null
              }
            />
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

      {previewTemplate && (
        <PlayPreviewDialog template={previewTemplate} onClose={() => setPreviewTemplate(null)} />
      )}

      {createOpen && (
        <CreateTemplateDialog
          initialKind={activeKind}
          tradelineOptions={list.data?.tradeline ?? []}
          conciergeOptions={list.data?.concierge ?? []}
          onClose={() => setCreateOpen(false)}
          onCreated={(kind, templateId) => {
            setCreateOpen(false);
            setActiveKind(kind);
            setOpenTemplate({ kind, templateId });
          }}
        />
      )}
    </AdminLayout>
  );
}

function TemplateGrid({
  templates,
  loading,
  onOpen,
  onPreview,
  onDuplicate,
  duplicatingId,
}: {
  templates: TemplateSummary[];
  loading: boolean;
  onOpen: (t: TemplateSummary) => void;
  onPreview: (t: TemplateSummary) => void;
  onDuplicate: (t: TemplateSummary) => void;
  duplicatingId: string | null;
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
          className="relative p-4 cursor-pointer hover:border-brand-blue-300 transition-colors flex flex-col group"
          onClick={() => onOpen(t)}
          data-testid={`template-card-${t.kind}-${t.templateId}`}
        >
          {/* Top-right action cluster — stop propagation so card click still opens edit dialog */}
          <div
            className="absolute top-2 right-2 flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-gray-500 hover:text-brand-blue-700"
              onClick={(e) => {
                e.stopPropagation();
                onPreview(t);
              }}
              title="Play preview (chat script)"
              aria-label="Play preview"
              data-testid={`template-preview-${t.kind}-${t.templateId}`}
            >
              <Play className="w-3.5 h-3.5" />
            </Button>
            {/* Voice preview — direct audible cue without opening dialog */}
            <VoicePreviewButton
              url={`/api/admin/tradeline/templates/${t.kind}/${t.templateId}/voice-sample`}
              iconOnly
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-gray-500 hover:text-brand-blue-700"
              title="Hear voice"
              testId={`template-voice-${t.kind}-${t.templateId}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-gray-500 hover:text-brand-blue-700"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(t);
              }}
              disabled={duplicatingId === t.templateId}
              title="Duplicate template"
              aria-label="Duplicate template"
              data-testid={`template-duplicate-${t.kind}-${t.templateId}`}
            >
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="flex items-start justify-between gap-2 mb-2 pr-16">
            <div>
              <div className="font-semibold text-gray-900">{t.name || <span className="italic text-gray-500">Untitled</span>}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">id: {t.templateId}</div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 mt-auto">
            <div className="text-xs text-gray-600">
              Tone: <span className="font-medium">{t.defaultTone}</span>
            </div>
            <div className="flex items-center gap-1">
              {t.isCustom && (
                <Badge variant="outline" className="bg-brand-blue-50 border-brand-blue-200 text-brand-blue-800 text-[10px]">
                  Custom
                </Badge>
              )}
              {t.hasOverride && !t.isCustom && (
                <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-800 text-[10px]">
                  Edited
                </Badge>
              )}
            </div>
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
      <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] sm:w-auto max-h-[90vh] overflow-y-auto">
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

/* ════════════════════════════════════════════════════════════════
   PLAY-PREVIEW DIALOG — mini animated chat/voice script based on the
   template's name + match patterns + booking/coaching fields. Keeps
   the look-and-feel of TradeLineHeroPhone but lives self-contained
   inside this admin page (no shared deps, no marketing imports).
   ════════════════════════════════════════════════════════════════ */

interface PreviewTurn {
  who: "caller" | "ai";
  text: string;
}

function buildPreviewTurns(t: TemplateSummary): PreviewTurn[] {
  const eff = t.effective ?? {};
  const name = String(eff.name ?? t.name ?? "this trade");
  const tone = String(eff.defaultTone ?? t.defaultTone ?? "professional");
  const services: string[] = Array.isArray((eff as any).fallbackServices)
    ? (((eff as any).fallbackServices as unknown[]).slice(0, 3).map(String))
    : [];
  const patterns: string[] = Array.isArray((eff as any).matchPatterns)
    ? (((eff as any).matchPatterns as unknown[]).slice(0, 3).map(String))
    : [];
  const sampleSymptom = patterns[0] ?? "an issue today";
  const greet = tone === "casual"
    ? `Hey — you've reached the ${name} line. What's going on?`
    : tone === "friendly"
      ? `Hi there, you've reached ${name}. How can I help?`
      : `Hello, this is the ${name} line — how can I help today?`;
  const serviceLine = services.length
    ? `We cover ${services.join(", ")}. `
    : "";

  if (t.kind === "tradeline") {
    return [
      { who: "ai", text: greet },
      { who: "caller", text: `Hi — I think I've got ${sampleSymptom}. Can someone take a look?` },
      { who: "ai", text: `Got it. ${serviceLine}I can get a tech to you — what's the address and a good callback number?` },
      { who: "caller", text: "123 Main St, 555-0142." },
      { who: "ai", text: "Booked. Confirmation text is on the way with the tech's name + ETA." },
    ];
  }
  // concierge — trade-facing coach
  const focus = String((eff as any).coachingFocus ?? "");
  const focusSnippet = focus.split(".")[0]?.slice(0, 120) ?? "your day-to-day workflow";
  return [
    { who: "ai", text: `Concierge here for ${name}. What can I help you think through?` },
    { who: "caller", text: "I'm trying to figure out pricing on a tricky job — got a minute?" },
    { who: "ai", text: `Yep. For ${name}, the lens I'd start with: ${focusSnippet}.` },
    { who: "caller", text: "That helps. Walk me through how you'd price it." },
    { who: "ai", text: "Sure — I'll lay out the three biggest variables, then we can plug in your numbers." },
  ];
}

function PlayPreviewDialog({ template, onClose }: { template: TemplateSummary; onClose: () => void }) {
  const turns = useMemo(() => buildPreviewTurns(template), [template]);
  const [shown, setShown] = useState(0);
  const [aiTyping, setAiTyping] = useState(false);
  const timersRef = useRef<number[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Replay button: reset and restart.
  function start() {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    setShown(0);
    setAiTyping(false);

    let acc = 400;
    turns.forEach((turn, idx) => {
      if (turn.who === "ai") {
        const typingDelay = acc;
        timersRef.current.push(
          window.setTimeout(() => setAiTyping(true), typingDelay),
        );
        acc += 700;
      }
      const showDelay = acc;
      timersRef.current.push(
        window.setTimeout(() => {
          setAiTyping(false);
          setShown(idx + 1);
        }, showDelay),
      );
      acc += Math.min(900 + turn.text.length * 18, 3200);
    });
  }

  useEffect(() => {
    start();
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.kind, template.templateId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [shown, aiTyping]);

  const isVoice = template.kind === "tradeline"; // hero shows mixed; we render single visual
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* data-theme="light" — this dialog simulates the trade's installed
          TradeLine voice/concierge widget exactly as the end-customer sees
          it (light-mode chrome on a white transcript). The bg-white +
          text-white-on-brand-blue chat bubbles below are part of that
          emulation, not theme-naive surfaces. */}
      <DialogContent className="max-w-md" data-theme="light">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {template.kind === "tradeline" ? <Phone className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            Preview · {template.name || template.templateId}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center justify-between text-[11px] text-gray-500 mb-2">
            <span className="uppercase tracking-wide font-semibold">
              {isVoice ? "Voice call · sample" : "Concierge chat · sample"}
            </span>
            <span>{template.defaultTone}</span>
          </div>
          <div
            ref={scrollRef}
            className="h-72 overflow-y-auto space-y-2 rounded-lg bg-white p-3 border border-gray-200"
            data-testid="preview-transcript"
          >
            {turns.slice(0, shown).map((turn, i) => (
              <div
                key={i}
                className={`flex ${turn.who === "ai" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-snug ${
                    turn.who === "ai"
                      ? "bg-brand-blue-600 text-white rounded-bl-sm"
                      : "bg-gray-100 text-gray-900 rounded-br-sm"
                  }`}
                >
                  {turn.text}
                </div>
              </div>
            ))}
            {aiTyping && shown < turns.length && (
              <div className="flex justify-start">
                <div className="bg-brand-blue-600 text-white rounded-2xl rounded-bl-sm px-3 py-2 text-xs">
                  <span className="inline-flex gap-0.5 items-center" aria-label="AI typing">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce" />
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-wrap items-center gap-2">
          {/* Hear-voice preview — Wave 44: now streams via the same
              ElevenLabs voice (Rachel) used on real production calls,
              with OpenAI tts-1 as graceful fallback. */}
          <div className="mr-auto flex flex-col gap-1">
            <VoicePreviewButton
              url={`/api/admin/tradeline/templates/${template.kind}/${template.templateId}/voice-sample`}
              label="Hear voice"
              testId={`preview-voice-${template.kind}-${template.templateId}`}
            />
            <p
              className="text-[10px] text-muted-foreground"
              data-testid="voice-preview-trust-note"
            >
              Same voice your customers will hear on real calls.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => start()} data-testid="preview-replay">
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Replay
          </Button>
          <Button size="sm" onClick={onClose}>
            <X className="w-3.5 h-3.5 mr-1" /> Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ════════════════════════════════════════════════════════════════
   CREATE-TEMPLATE DIALOG — name + kind + "from scratch | from existing"
   ════════════════════════════════════════════════════════════════ */

function CreateTemplateDialog({
  initialKind,
  tradelineOptions,
  conciergeOptions,
  onClose,
  onCreated,
}: {
  initialKind: TemplateKind;
  tradelineOptions: TemplateSummary[];
  conciergeOptions: TemplateSummary[];
  onClose: () => void;
  onCreated: (kind: TemplateKind, templateId: string) => void;
}) {
  const [kind, setKind] = useState<TemplateKind>(initialKind);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"scratch" | "existing">("scratch");
  const [sourceId, setSourceId] = useState<string>("");

  const sourceOptions = kind === "tradeline" ? tradelineOptions : conciergeOptions;

  // Reset source when kind changes (cross-kind sourcing isn't supported).
  useEffect(() => {
    setSourceId("");
  }, [kind]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: { kind: TemplateKind; name: string; fromTemplateId?: string } = {
        kind,
        name: name.trim(),
      };
      if (mode === "existing" && sourceId) body.fromTemplateId = sourceId;
      const res = await fetch("/api/admin/tradeline/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Create failed");
      return res.json() as Promise<{ kind: TemplateKind; templateId: string }>;
    },
    onSuccess: (data) => {
      onCreated(data.kind, data.templateId);
    },
  });

  const canSubmit =
    name.trim().length > 0 &&
    !(mode === "existing" && !sourceId) &&
    !createMutation.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> New template
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1">
              Name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pool service"
              autoFocus
              data-testid="new-template-name"
            />
          </div>

          <div>
            <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1">
              Kind
            </Label>
            <Select value={kind} onValueChange={(v) => setKind(v as TemplateKind)}>
              <SelectTrigger data-testid="new-template-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tradeline">TradeLine receptionist (customer-facing)</SelectItem>
                <SelectItem value="concierge">Portal Concierge (trade-facing)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-2">
              Start from
            </Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as "scratch" | "existing")} className="gap-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="scratch" id="mode-scratch" />
                <Label htmlFor="mode-scratch" className="text-sm font-normal cursor-pointer">
                  Start from scratch
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="existing" id="mode-existing" />
                <Label htmlFor="mode-existing" className="text-sm font-normal cursor-pointer">
                  Start from existing template
                </Label>
              </div>
            </RadioGroup>
          </div>

          {mode === "existing" && (
            <div>
              <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1">
                Source template
              </Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger data-testid="new-template-source">
                  <SelectValue placeholder="Pick a template to copy from…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {sourceOptions.map((opt) => (
                    <SelectItem key={opt.templateId} value={opt.templateId}>
                      {opt.name || opt.templateId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {createMutation.isError && (
            <div className="text-xs text-red-600">
              {(createMutation.error as Error)?.message ?? "Create failed"}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="w-3.5 h-3.5 mr-1" /> Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit}
            data-testid="new-template-submit"
          >
            {createMutation.isPending ? "Creating…" : "Create + edit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
