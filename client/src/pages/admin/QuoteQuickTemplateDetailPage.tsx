/**
 * Wave W-AI-3b — QuoteQuick Template detail / editor.
 *
 * The heart of the QuoteQuick admin: edit every field on a `TemplateConfig`
 * and watch the live preview update on the right. Wire-up:
 *
 *   - TanStack Query fetch of GET /api/admin/quotequick/templates/:id
 *   - Local "draft" config the editor mutates (kept independent of the
 *     server copy so the preview can debounce without refetching)
 *   - PATCH /api/admin/quotequick/templates/:id sends the diff against the
 *     code default (or the full draft for user-created templates)
 *   - DELETE /api/admin/quotequick/templates/:id/overrides resets all
 *   - POST /:id/archive | /unarchive toggles archival
 *
 * Live preview is a thin wrapper around `AdvancedCalculator` rendered with
 * `toAdvancedConfig(draft)`. Read-only via `pointer-events: none`. Debounced
 * 250ms so typing in a formula doesn't thrash the renderer.
 */

import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/usePageTitle";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Plus, Trash2, RotateCcw, Save, Archive, ArchiveRestore,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  TEMPLATE_LAYOUTS,
  toAdvancedConfig,
  type FieldType,
  type TemplateCalculation,
  type TemplateConfig,
  type TemplateField,
  type TemplateLayout,
  type TemplateOption,
} from "@shared/templatePresets";
import { TRADES } from "@/data/trades";
import { WIDGET_THEME_LIST } from "@/components/quote-widget/widgetThemes";
import AdvancedCalculator from "@/components/quote-widget/AdvancedCalculator";
import LucideIconPicker from "@/components/admin/LucideIconPicker";

interface DetailResponse {
  templateId: string;
  codeDefault: TemplateConfig | null;
  overrides: Record<string, unknown> | null;
  effective: TemplateConfig;
  is_archived: boolean;
  is_user_created: boolean;
  updatedAt: string | null;
  updatedBy: number | null;
}

interface Props {
  templateId: string;
}

const FIELD_TYPES: FieldType[] = [
  "number", "slider", "select", "radio", "multi_select", "toggle", "text", "image_choice", "heading",
];

const FORMAT_OPTIONS: Array<TemplateCalculation["format"]> = ["currency", "number", "percent"];

export default function QuoteQuickTemplateDetailPage({ templateId }: Props) {
  usePageTitle("QuoteQuick Template");
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const detail = useQuery<DetailResponse>({
    queryKey: [`/api/admin/quotequick/templates/${templateId}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/quotequick/templates/${templateId}`);
      return res.json();
    },
  });

  const [draft, setDraft] = useState<TemplateConfig | null>(null);
  const [tab, setTab] = useState<"content" | "fields" | "calculations" | "theme" | "meta">("content");

  // Seed draft from the server response (or after a save/refresh).
  useEffect(() => {
    if (detail.data?.effective) setDraft(deepClone(detail.data.effective));
  }, [detail.data?.effective]);

  // Debounce the preview config so typing in formulas doesn't thrash the renderer.
  const debouncedDraft = useDebounced(draft, 250);

  const dirty = useMemo(() => {
    if (!draft || !detail.data?.effective) return false;
    return JSON.stringify(draft) !== JSON.stringify(detail.data.effective);
  }, [draft, detail.data?.effective]);

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const res = await apiRequest("PATCH", `/api/admin/quotequick/templates/${templateId}`, {
        overrides: draft as unknown as Record<string, unknown>,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotequick/templates"] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/quotequick/templates/${templateId}`] });
    },
  });

  const reset = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/admin/quotequick/templates/${templateId}/overrides`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotequick/templates"] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/quotequick/templates/${templateId}`] });
    },
  });

  const archive = useMutation({
    mutationFn: async (next: boolean) => {
      const path = next ? "archive" : "unarchive";
      const res = await apiRequest("POST", `/api/admin/quotequick/templates/${templateId}/${path}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotequick/templates"] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/quotequick/templates/${templateId}`] });
    },
  });

  function patch<K extends keyof TemplateConfig>(key: K, value: TemplateConfig[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }
  function patchHeader(value: Partial<TemplateConfig["header"]>) {
    setDraft((d) => (d ? { ...d, header: { ...d.header, ...value } } : d));
  }
  function patchResults(value: Partial<NonNullable<TemplateConfig["results"]>>) {
    setDraft((d) => (d ? { ...d, results: { ...(d.results ?? {}), ...value } } : d));
  }

  if (detail.isLoading || !draft) {
    return (
      <AdminLayout>
        <div className="p-6 max-w-7xl mx-auto"><Skeleton className="h-96" /></div>
      </AdminLayout>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <AdminLayout>
        <div className="p-6 max-w-7xl mx-auto text-sm text-red-600">
          Failed to load template.{" "}
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/quotequick/templates")}>Back to list</Button>
        </div>
      </AdminLayout>
    );
  }

  const d = detail.data;

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        {/* Breadcrumb */}
        <div className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
          <Link href="/admin/crm"><a className="hover:underline">Admin</a></Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/admin/crm/quotequick"><a className="hover:underline">QuoteQuick</a></Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/admin/quotequick/templates"><a className="hover:underline">Templates</a></Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-700">{draft.name || templateId}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <Input
              value={draft.name ?? ""}
              onChange={(e) => patch("name", e.target.value)}
              className="text-xl font-bold h-10 border-transparent hover:border-gray-200 focus:border-gray-300 px-2 -ml-2"
              data-testid="template-name"
            />
            <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
              <span className="font-mono text-gray-500">{templateId}</span>
              {d.is_user_created && (
                <Badge variant="outline" className="bg-indigo-50 border-indigo-200 text-indigo-800 text-[10px]">User-created</Badge>
              )}
              {d.overrides && Object.keys(d.overrides).length > 0 && !d.is_user_created && (
                <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-800 text-[10px]">Has overrides</Badge>
              )}
              {d.is_archived && (
                <Badge variant="outline" className="bg-gray-100 border-gray-300 text-gray-600 text-[10px]">Archived</Badge>
              )}
              {d.updatedAt && (
                <span className="text-gray-400">edited {new Date(d.updatedAt).toLocaleString()}</span>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/quotequick/templates")}>
            <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Back
          </Button>
        </div>

        {/* Two-pane layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
          {/* Editor */}
          <div>
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="fields">Fields ({draft.fields?.length ?? 0})</TabsTrigger>
                <TabsTrigger value="calculations">Calculations ({draft.calculations?.length ?? 0})</TabsTrigger>
                <TabsTrigger value="theme">Theme & Layout</TabsTrigger>
                <TabsTrigger value="meta">Meta</TabsTrigger>
              </TabsList>

              <TabsContent value="content" className="mt-4 space-y-4">
                <ContentTab draft={draft} patchHeader={patchHeader} patchResults={patchResults} patch={patch} />
              </TabsContent>

              <TabsContent value="fields" className="mt-4">
                <FieldsTab
                  fields={draft.fields ?? []}
                  onChange={(next) => patch("fields", next)}
                />
              </TabsContent>

              <TabsContent value="calculations" className="mt-4">
                <CalculationsTab
                  calculations={draft.calculations ?? []}
                  result_calc={draft.result_calc}
                  onChange={(next) => patch("calculations", next)}
                  onChangeResult={(name) => patch("result_calc", name)}
                />
              </TabsContent>

              <TabsContent value="theme" className="mt-4 space-y-4">
                <ThemeTab draft={draft} patch={patch} />
              </TabsContent>

              <TabsContent value="meta" className="mt-4 space-y-4">
                <MetaTab draft={draft} patch={patch} />
              </TabsContent>
            </Tabs>
          </div>

          {/* Live preview */}
          <div>
            <div className="sticky top-4">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Live preview
              </div>
              <LivePreview config={debouncedDraft ?? draft} />
            </div>
          </div>
        </div>

        {/* Save bar */}
        <Card className="sticky bottom-3 p-3 flex items-center justify-between gap-2 shadow-md bg-white">
          <div className="text-xs text-gray-500">
            {dirty ? "Unsaved changes" : save.isSuccess ? "Saved" : "Up to date"}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => archive.mutate(!d.is_archived)}
              disabled={archive.isPending}
              data-testid="toggle-archive"
            >
              {d.is_archived ? (
                <><ArchiveRestore className="w-3.5 h-3.5 mr-1" /> Unarchive</>
              ) : (
                <><Archive className="w-3.5 h-3.5 mr-1" /> Archive</>
              )}
            </Button>
            {d.codeDefault && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => reset.mutate()}
                disabled={reset.isPending || !d.overrides}
                title="Delete every admin override on this template — restores the code default."
                data-testid="reset-all"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                {reset.isPending ? "Resetting…" : "Reset all overrides"}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending || !dirty}
              data-testid="save-template"
            >
              <Save className="w-3.5 h-3.5 mr-1" />
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}

/* ─── Content tab ─── */

function ContentTab({
  draft, patchHeader, patchResults, patch,
}: {
  draft: TemplateConfig;
  patchHeader: (v: Partial<TemplateConfig["header"]>) => void;
  patchResults: (v: Partial<NonNullable<TemplateConfig["results"]>>) => void;
  patch: <K extends keyof TemplateConfig>(k: K, v: TemplateConfig[K]) => void;
}) {
  const r = draft.results ?? {};
  return (
    <div className="space-y-4">
      <Section title="Header">
        <Field label="Title">
          <Input
            value={draft.header?.title ?? ""}
            onChange={(e) => patchHeader({ title: e.target.value })}
          />
        </Field>
        <Field label="Subtitle">
          <Input
            value={draft.header?.subtitle ?? ""}
            onChange={(e) => patchHeader({ subtitle: e.target.value })}
          />
        </Field>
        <Field label="Align">
          <Select
            value={draft.header?.align ?? "left"}
            onValueChange={(v) => patchHeader({ align: v as "left" | "center" | "right" })}
          >
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title="Result panel">
        <Field label="Heading">
          <Input value={r.heading ?? ""} onChange={(e) => patchResults({ heading: e.target.value })} />
        </Field>
        <Field label="CTA label (empty hides the button)">
          <Input value={r.cta_label ?? ""} onChange={(e) => patchResults({ cta_label: e.target.value })} />
        </Field>
        <Field label="Footnote">
          <Textarea
            value={r.footnote ?? ""}
            onChange={(e) => patchResults({ footnote: e.target.value })}
            rows={2}
          />
        </Field>
        <Field label="Show breakdown rows" inline>
          <Switch
            checked={r.show_breakdown !== false}
            onCheckedChange={(c) => patchResults({ show_breakdown: c })}
          />
        </Field>
        <Field label="Result calculation (must match a calc name)">
          <Input
            value={draft.result_calc ?? ""}
            onChange={(e) => patch("result_calc", e.target.value)}
            className="font-mono text-sm"
          />
        </Field>
      </Section>
    </div>
  );
}

/* ─── Fields tab ─── */

function FieldsTab({
  fields, onChange,
}: { fields: TemplateField[]; onChange: (next: TemplateField[]) => void }) {
  function add() {
    onChange([
      ...fields,
      {
        id: `field_${fields.length + 1}`,
        name: `Field ${fields.length + 1}`,
        label: "New field",
        type: "number",
      },
    ]);
  }
  function update(i: number, next: TemplateField) {
    const copy = fields.slice();
    copy[i] = next;
    onChange(copy);
  }
  function remove(i: number) {
    onChange(fields.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const copy = fields.slice();
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-600">{fields.length} field(s)</div>
        <Button size="sm" variant="outline" onClick={add} data-testid="add-field">
          <Plus className="w-3.5 h-3.5 mr-1" /> Add field
        </Button>
      </div>

      <Accordion type="multiple" className="border rounded-md divide-y">
        {fields.map((f, i) => (
          <AccordionItem key={`${f.id}-${i}`} value={`field-${i}`} className="border-0">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50/60">
              <button onClick={() => move(i, -1)} className="text-gray-400 hover:text-gray-700 p-0.5" title="Move up">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => move(i, 1)} className="text-gray-400 hover:text-gray-700 p-0.5" title="Move down">
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <AccordionTrigger className="flex-1 text-sm hover:no-underline py-1">
                <span className="font-semibold">{f.name}</span>
                <span className="text-[11px] text-gray-500 ml-2 font-mono">{f.type}</span>
                <span className="text-[11px] text-gray-400 ml-2 font-mono">[{f.id}]</span>
              </AccordionTrigger>
              <button
                onClick={() => remove(i)}
                className="text-red-500 hover:text-red-700 p-1"
                title="Delete field"
                data-testid={`delete-field-${i}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <AccordionContent className="px-3 pb-3 pt-1 space-y-3">
              <FieldEditor field={f} onChange={(next) => update(i, next)} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

function FieldEditor({
  field, onChange,
}: { field: TemplateField; onChange: (next: TemplateField) => void }) {
  function set<K extends keyof TemplateField>(k: K, v: TemplateField[K]) {
    onChange({ ...field, [k]: v });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Field label="id (slug)">
          <Input value={field.id} onChange={(e) => set("id", e.target.value)} className="font-mono text-sm" />
        </Field>
        <Field label="name (formula key)">
          <Input value={field.name} onChange={(e) => set("name", e.target.value)} className="text-sm" />
        </Field>
        <Field label="type">
          <Select value={field.type} onValueChange={(v) => set("type", v as FieldType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Label (shown to customer)">
        <Input value={field.label} onChange={(e) => set("label", e.target.value)} />
      </Field>

      {(field.type === "number" || field.type === "slider") && (
        <div className="grid grid-cols-4 gap-2">
          <Field label="min">
            <Input
              type="number"
              value={field.min ?? ""}
              onChange={(e) => set("min", e.target.value === "" ? undefined : Number(e.target.value))}
            />
          </Field>
          <Field label="max">
            <Input
              type="number"
              value={field.max ?? ""}
              onChange={(e) => set("max", e.target.value === "" ? undefined : Number(e.target.value))}
            />
          </Field>
          <Field label="step">
            <Input
              type="number"
              value={field.step ?? ""}
              onChange={(e) => set("step", e.target.value === "" ? undefined : Number(e.target.value))}
            />
          </Field>
          <Field label="default">
            <Input
              type="number"
              value={field.default_value ?? ""}
              onChange={(e) => set("default_value", e.target.value === "" ? undefined : Number(e.target.value))}
            />
          </Field>
        </div>
      )}

      {(field.type === "number" || field.type === "slider") && (
        <Field label="Unit (e.g. sqm, miles)">
          <Input value={field.unit ?? ""} onChange={(e) => set("unit", e.target.value || undefined)} />
        </Field>
      )}

      {field.type === "toggle" && (
        <Field label="On value (added to formula when toggled on)">
          <Input
            type="number"
            value={field.on_value ?? ""}
            onChange={(e) => set("on_value", e.target.value === "" ? undefined : Number(e.target.value))}
          />
        </Field>
      )}

      {(field.type === "select" || field.type === "radio" || field.type === "multi_select" || field.type === "image_choice") && (
        <OptionsEditor
          options={field.options ?? []}
          onChange={(opts) => set("options", opts)}
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Required" inline>
          <Switch checked={!!field.required} onCheckedChange={(c) => set("required", c)} />
        </Field>
        <Field label="Column span">
          <Select
            value={String(field.colSpan ?? 1)}
            onValueChange={(v) => set("colSpan", (v === "2" ? 2 : 1))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 column</SelectItem>
              <SelectItem value="2">2 columns (full row)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  );
}

function OptionsEditor({
  options, onChange,
}: { options: TemplateOption[]; onChange: (next: TemplateOption[]) => void }) {
  function add() {
    const idx = options.length + 1;
    onChange([...options, { id: `option_${idx}`, label: `Option ${idx}`, value: 0 }]);
  }
  function update(i: number, next: TemplateOption) {
    const copy = options.slice();
    copy[i] = next;
    onChange(copy);
  }
  function remove(i: number) {
    onChange(options.filter((_, idx) => idx !== i));
  }
  return (
    <Section title={`Options (${options.length})`}>
      <div className="space-y-2">
        {options.map((o, i) => (
          <div key={`${o.id}-${i}`} className="grid grid-cols-[1fr_1fr_100px_auto] gap-2 items-center">
            <Input
              value={o.label}
              onChange={(e) => update(i, { ...o, label: e.target.value })}
              placeholder="Label"
            />
            <Input
              value={o.id}
              onChange={(e) => update(i, { ...o, id: e.target.value })}
              className="font-mono text-sm"
              placeholder="id"
            />
            <Input
              type="number"
              value={o.value}
              onChange={(e) => update(i, { ...o, value: Number(e.target.value || 0) })}
              placeholder="value"
            />
            <button
              onClick={() => remove(i)}
              className="text-red-500 hover:text-red-700 p-1"
              title="Remove option"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={add}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add option
        </Button>
      </div>
    </Section>
  );
}

/* ─── Calculations tab ─── */

function CalculationsTab({
  calculations, result_calc, onChange, onChangeResult,
}: {
  calculations: TemplateCalculation[];
  result_calc: string;
  onChange: (next: TemplateCalculation[]) => void;
  onChangeResult: (name: string) => void;
}) {
  function add() {
    const idx = calculations.length + 1;
    onChange([
      ...calculations,
      {
        id: `calc_${idx}`,
        name: `Calc ${idx}`,
        formula: "0",
        format: "currency",
      },
    ]);
  }
  function update(i: number, next: TemplateCalculation) {
    const copy = calculations.slice();
    copy[i] = next;
    onChange(copy);
  }
  function remove(i: number) {
    onChange(calculations.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= calculations.length) return;
    const copy = calculations.slice();
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-600">
          {calculations.length} calc(s). Headline (result_calc):{" "}
          <span className="font-mono text-gray-800">{result_calc || "—"}</span>
        </div>
        <Button size="sm" variant="outline" onClick={add} data-testid="add-calc">
          <Plus className="w-3.5 h-3.5 mr-1" /> Add calculation
        </Button>
      </div>

      <Accordion type="multiple" className="border rounded-md divide-y">
        {calculations.map((c, i) => (
          <AccordionItem key={`${c.id}-${i}`} value={`calc-${i}`} className="border-0">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50/60">
              <button onClick={() => move(i, -1)} className="text-gray-400 hover:text-gray-700 p-0.5">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => move(i, 1)} className="text-gray-400 hover:text-gray-700 p-0.5">
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <AccordionTrigger className="flex-1 text-sm hover:no-underline py-1">
                <span className="font-semibold">{c.name}</span>
                <span className="text-[11px] text-gray-500 ml-2 font-mono">{c.format}</span>
                {c.name === result_calc && (
                  <Badge variant="outline" className="ml-2 text-[10px] border-indigo-300 text-indigo-700 bg-indigo-50">
                    headline
                  </Badge>
                )}
              </AccordionTrigger>
              <button
                onClick={() => onChangeResult(c.name)}
                className="text-[10px] text-indigo-600 hover:underline px-1"
                title="Mark as the headline result"
              >
                make headline
              </button>
              <button
                onClick={() => remove(i)}
                className="text-red-500 hover:text-red-700 p-1"
                data-testid={`delete-calc-${i}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <AccordionContent className="px-3 pb-3 pt-1 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <Field label="id">
                  <Input value={c.id} onChange={(e) => update(i, { ...c, id: e.target.value })} className="font-mono text-sm" />
                </Field>
                <Field label="name">
                  <Input value={c.name} onChange={(e) => update(i, { ...c, name: e.target.value })} />
                </Field>
                <Field label="format">
                  <Select
                    value={c.format}
                    onValueChange={(v) => update(i, { ...c, format: v as TemplateCalculation["format"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FORMAT_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Formula (reference fields with [Field Name])">
                <FormulaTextarea
                  value={c.formula}
                  onChange={(v) => update(i, { ...c, formula: v })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Result mode">
                  <Select
                    value={c.resultMode ?? "secondary"}
                    onValueChange={(v) => update(i, { ...c, resultMode: v as "primary" | "secondary" })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="primary">primary</SelectItem>
                      <SelectItem value="secondary">secondary</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Caption">
                  <Input
                    value={c.caption ?? ""}
                    onChange={(e) => update(i, { ...c, caption: e.target.value || undefined })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Show in results" inline>
                  <Switch
                    checked={c.showInResults !== false}
                    onCheckedChange={(v) => update(i, { ...c, showInResults: v })}
                  />
                </Field>
                <Field label="Divider above row" inline>
                  <Switch
                    checked={!!c.divider}
                    onCheckedChange={(v) => update(i, { ...c, divider: v })}
                  />
                </Field>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

/**
 * Tiny formula textarea — monospace + a bracket-highlight helper line below
 * showing the `[Field Name]` references currently resolved by the formula.
 * Not a parser; just a readable preview so the admin can spot a typo.
 */
function FormulaTextarea({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const refs = useMemo(() => {
    const out: string[] = [];
    const re = /\[([^\]]+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(value)) !== null) out.push(m[1]);
    return Array.from(new Set(out));
  }, [value]);
  return (
    <div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="font-mono text-sm"
      />
      {refs.length > 0 && (
        <div className="text-[11px] text-gray-500 mt-1">
          References:{" "}
          {refs.map((r) => (
            <span key={r} className="font-mono bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-1 mr-1">
              [{r}]
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Theme + Layout tab ─── */

function ThemeTab({
  draft, patch,
}: {
  draft: TemplateConfig;
  patch: <K extends keyof TemplateConfig>(k: K, v: TemplateConfig[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <Section title="Theme">
        <Field label="Widget theme">
          <Select value={draft.theme ?? "light"} onValueChange={(v) => patch("theme", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WIDGET_THEME_LIST.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title="Layout">
        <Field label="Layout">
          <Select
            value={draft.layout ?? "two-column"}
            onValueChange={(v) => patch("layout", v as TemplateLayout)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TEMPLATE_LAYOUTS.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title="Default icon">
        <Field label="Default Lucide icon (shown when no merchant logo)">
          <LucideIconPicker
            value={draft.defaultIcon}
            onChange={(next) => patch("defaultIcon", next)}
            compact
          />
        </Field>
      </Section>
    </div>
  );
}

/* ─── Meta tab ─── */

function MetaTab({
  draft, patch,
}: {
  draft: TemplateConfig;
  patch: <K extends keyof TemplateConfig>(k: K, v: TemplateConfig[K]) => void;
}) {
  const selectedTrades = draft.trades ?? [];
  return (
    <div className="space-y-4">
      <Section title="Description">
        <Field label="One-line description shown on the template card">
          <Textarea
            value={draft.description ?? ""}
            onChange={(e) => patch("description", e.target.value)}
            rows={2}
          />
        </Field>
      </Section>

      <Section title="Category">
        <Field label="Category bucket (drives the gallery grouping)">
          <Input
            value={draft.category ?? ""}
            onChange={(e) => patch("category", e.target.value)}
            placeholder="Construction / Cleaning / Outdoor…"
          />
        </Field>
      </Section>

      <Section title={`Trades (${selectedTrades.length})`}>
        <div className="max-h-64 overflow-y-auto border rounded p-2 space-y-1">
          {TRADES.map((tr) => {
            const on = selectedTrades.includes(tr.id);
            return (
              <label
                key={tr.id}
                className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 rounded"
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selectedTrades, tr.id]
                      : selectedTrades.filter((x) => x !== tr.id);
                    patch("trades", next);
                  }}
                />
                <span>{tr.label}</span>
                <span className="text-gray-400 ml-auto font-mono">{tr.id}</span>
              </label>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

/* ─── Live preview ─── */

function LivePreview({ config }: { config: TemplateConfig }) {
  // Build the AdvancedConfigShape and shield the renderer behind a try/catch
  // so a half-typed formula doesn't blank the whole page.
  let advanced;
  try {
    advanced = toAdvancedConfig(config);
  } catch (err) {
    return (
      <Card className="p-3 text-xs text-red-600">
        Preview unavailable: {(err as Error).message}
      </Card>
    );
  }

  return (
    <Card className="p-2 overflow-hidden">
      <PreviewBoundary>
        <div
          style={{
            width: 380, maxWidth: "100%", height: 500,
            overflow: "auto", pointerEvents: "none",
            transformOrigin: "top left",
          }}
          aria-label="Template preview (read-only)"
        >
          <AdvancedCalculator
            businessName="Preview"
            advanced={advanced}
          />
        </div>
      </PreviewBoundary>
    </Card>
  );
}

/* ─── Small helpers ─── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 space-y-3">
      <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</div>
      {children}
    </Card>
  );
}

function Field({
  label, children, inline,
}: { label: string; children: React.ReactNode; inline?: boolean }) {
  if (inline) {
    return (
      <div className="flex items-center justify-between gap-2 py-1">
        <label className="text-xs text-gray-700">{label}</label>
        {children}
      </div>
    );
  }
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide block mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Minimal error boundary — a half-typed formula or invalid config should not
 * crash the whole editor. We log + render a fallback.
 */
class PreviewBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state: { err: Error | null } = { err: null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidUpdate(prev: { children: ReactNode }) {
    if (prev.children !== this.props.children && this.state.err) this.setState({ err: null });
  }
  render() {
    if (this.state.err) {
      return (
        <div className="p-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded">
          Preview paused while config is being edited: {this.state.err.message}
        </div>
      );
    }
    return this.props.children;
  }
}
