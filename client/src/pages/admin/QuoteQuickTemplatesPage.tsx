/**
 * Wave W-AI-3b — QuoteQuick Templates index.
 *
 * Lists all merged templates (code-default + admin overrides + admin-authored).
 * Card grid grouped by `category`. Each card opens the detail/editor at
 * `/admin/quotequick/templates/:id`. New template scaffolding uses POST
 * `/api/admin/quotequick/templates`.
 *
 * Mirrors `TradelineTemplatesPage.tsx` for TanStack Query + apiRequest +
 * shadcn primitives + AdminLayout. Backend contracts land in PR #393.
 */

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Archive } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  TEMPLATE_LAYOUTS,
  type TemplateConfig,
  type TemplateLayout,
} from "@shared/templatePresets";
import { TRADES } from "@/data/trades";
import { WIDGET_THEME_LIST } from "@/components/quote-widget/widgetThemes";

interface TemplateRow {
  templateId: string;
  effective: TemplateConfig;
  is_overridden: boolean;
  is_archived: boolean;
  is_user_created: boolean;
  updatedAt: string | null;
  updatedBy: number | null;
}

interface ListResponse {
  templates: TemplateRow[];
}

type FilterChip = "all" | "edited" | "archived" | "user_created";

export default function QuoteQuickTemplatesPage() {
  usePageTitle("QuoteQuick Templates");
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterChip>("all");
  const [newOpen, setNewOpen] = useState(false);

  const list = useQuery<ListResponse>({
    queryKey: ["/api/admin/quotequick/templates"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/quotequick/templates");
      return res.json();
    },
  });

  const filtered = useMemo(() => {
    const rows = list.data?.templates ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "edited" && !r.is_overridden) return false;
      if (filter === "archived" && !r.is_archived) return false;
      if (filter === "user_created" && !r.is_user_created) return false;
      if (filter === "all" && r.is_archived) return false; // hide archived by default
      if (!q) return true;
      const t = r.effective;
      const hay = `${t?.id ?? r.templateId} ${t?.name ?? ""} ${t?.description ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [list.data, search, filter]);

  const grouped = useMemo(() => {
    const by = new Map<string, TemplateRow[]>();
    for (const r of filtered) {
      const cat = r.effective?.category || "Uncategorised";
      if (!by.has(cat)) by.set(cat, []);
      by.get(cat)!.push(r);
    }
    return Array.from(by.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const counts = useMemo(() => {
    const rows = list.data?.templates ?? [];
    return {
      all: rows.filter((r) => !r.is_archived).length,
      edited: rows.filter((r) => r.is_overridden).length,
      archived: rows.filter((r) => r.is_archived).length,
      user_created: rows.filter((r) => r.is_user_created).length,
    };
  }, [list.data]);

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">QuoteQuick Templates</h1>
            <p className="text-sm text-gray-600 mt-1 max-w-2xl">
              Every QuoteQuick template — the code-default catalogue plus any
              admin-edited or admin-authored entries. Click a card to edit the
              full TemplateConfig with a live preview.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                type="search"
                placeholder="Search name / id / description…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64 pl-8"
                data-testid="template-search"
              />
            </div>
            <Button size="sm" onClick={() => setNewOpen(true)} data-testid="new-template">
              <Plus className="w-3.5 h-3.5 mr-1" /> New template
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          {(
            [
              ["all", `All (${counts.all})`],
              ["edited", `Edited (${counts.edited})`],
              ["archived", `Archived (${counts.archived})`],
              ["user_created", `User-created (${counts.user_created})`],
            ] as Array<[FilterChip, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`px-2.5 py-1 rounded-full border transition-colors ${
                filter === id
                  ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
              data-testid={`filter-${id}`}
            >
              {label}
            </button>
          ))}
        </div>

        {list.isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        )}

        {!list.isLoading && filtered.length === 0 && (
          <div className="text-sm text-gray-500 py-10 text-center">
            No templates match the current filters.
          </div>
        )}

        {grouped.map(([category, rows]) => (
          <section key={category} className="space-y-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {category} <span className="text-gray-400">({rows.length})</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 auto-rows-fr">
              {rows.map((r) => (
                <TemplateCard
                  key={r.templateId}
                  row={r}
                  onOpen={() => navigate(`/admin/quotequick/templates/${r.templateId}`)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {newOpen && (
        <NewTemplateDialog
          onClose={() => setNewOpen(false)}
          onCreated={(id) => {
            setNewOpen(false);
            navigate(`/admin/quotequick/templates/${id}`);
          }}
        />
      )}
    </AdminLayout>
  );
}

/* ─── Card ─── */

function TemplateCard({ row, onOpen }: { row: TemplateRow; onOpen: () => void }) {
  const t = row.effective;
  const themeId = t?.theme ?? "light";
  const theme = WIDGET_THEME_LIST.find((w) => w.id === themeId) ?? WIDGET_THEME_LIST[0];

  return (
    <Card
      className="p-4 cursor-pointer hover:border-indigo-300 transition-colors flex flex-col gap-3"
      onClick={onOpen}
      data-testid={`template-card-${row.templateId}`}
    >
      <div className="flex items-start gap-3">
        <Thumbnail theme={theme} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 truncate">{t?.name || row.templateId}</div>
          <div className="text-[11px] text-gray-500 font-mono truncate mt-0.5">{row.templateId}</div>
          {t?.description && (
            <div className="text-xs text-gray-600 line-clamp-2 mt-1">{t.description}</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mt-auto">
        {row.is_overridden && !row.is_user_created && (
          <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-800 text-[10px]">
            Edited
          </Badge>
        )}
        {row.is_user_created && (
          <Badge variant="outline" className="bg-indigo-50 border-indigo-200 text-indigo-800 text-[10px]">
            User-created
          </Badge>
        )}
        {row.is_archived && (
          <Badge variant="outline" className="bg-gray-100 border-gray-300 text-gray-600 text-[10px]">
            <Archive className="w-2.5 h-2.5 mr-1" /> Archived
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-gray-500">
          <span
            className="inline-block w-3 h-3 rounded-full border border-gray-200"
            style={{ background: theme.accent }}
            title={`Theme: ${theme.name}`}
          />
          <span>{theme.name}</span>
        </div>
      </div>
    </Card>
  );
}

function Thumbnail({ theme }: { theme: { surface: string; border: string; accent: string; result: string } }) {
  // 60x40 inline mockup — bg surface, accent stripe top, two row bars, result chip.
  return (
    <div
      aria-hidden="true"
      style={{
        width: 60, height: 40, borderRadius: 6, overflow: "hidden",
        background: theme.surface, border: `1px solid ${theme.border}`,
        display: "flex", flexDirection: "column",
        flexShrink: 0,
      }}
    >
      <div style={{ height: 6, background: theme.accent }} />
      <div style={{ padding: 4, flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ height: 3, background: theme.border, borderRadius: 1 }} />
        <div style={{ height: 3, background: theme.border, borderRadius: 1, width: "70%" }} />
        <div style={{ height: 8, background: theme.result, borderRadius: 2, marginTop: "auto" }} />
      </div>
    </div>
  );
}

/* ─── New template dialog ─── */

function NewTemplateDialog({
  onClose, onCreated,
}: { onClose: () => void; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Construction");
  const [layout, setLayout] = useState<TemplateLayout>("two-column");
  const [theme, setTheme] = useState("light");
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const slug = (id.trim() || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"))
        .replace(/^_+|_+$/g, "");
      if (!slug) throw new Error("Provide an id or name");
      // Minimal scaffold — admin fills out the rest in the detail editor.
      const template: Partial<TemplateConfig> = {
        id: slug,
        name: name.trim() || slug,
        description: description.trim(),
        category,
        trades: selectedTrades,
        layout,
        theme,
        fields: [],
        calculations: [],
        result_calc: "",
        header: { title: name.trim() || slug, align: "left" },
        results: { show_breakdown: true },
      };
      const res = await apiRequest("POST", "/api/admin/quotequick/templates", {
        id: slug,
        template,
      });
      return res.json() as Promise<{ templateId: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotequick/templates"] });
      onCreated(data.templateId);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New QuoteQuick template</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Template id (lowercase, snake_case)">
            <Input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="custom_pricing_tool"
              data-testid="new-template-id"
            />
          </Field>
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Custom Pricing Tool"
              data-testid="new-template-name"
            />
          </Field>
          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short one-liner shown on the template card."
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Construction"
              />
            </Field>
            <Field label="Base theme">
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WIDGET_THEME_LIST.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Layout">
            <Select value={layout} onValueChange={(v) => setLayout(v as TemplateLayout)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TEMPLATE_LAYOUTS.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={`Trades (${selectedTrades.length} selected)`}>
            <div className="max-h-32 overflow-y-auto border rounded p-2 space-y-1">
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
                      onChange={(e) =>
                        setSelectedTrades((p) =>
                          e.target.checked ? [...p, tr.id] : p.filter((x) => x !== tr.id),
                        )
                      }
                    />
                    <span>{tr.label}</span>
                    <span className="text-gray-400 ml-auto font-mono">{tr.id}</span>
                  </label>
                );
              })}
            </div>
          </Field>
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => { setError(null); create.mutate(); }}
            disabled={create.isPending}
            data-testid="create-template"
          >
            {create.isPending ? "Creating…" : "Create & edit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide block mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
