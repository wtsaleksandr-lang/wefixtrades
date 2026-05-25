/**
 * Portal — ContentFlow Phase 1 prompt library picker.
 *
 * Route: /portal/contentflow
 *
 * Browse the 60-prompt library with a 3-axis filter (Goal × Asset ×
 * Style) plus a free-text search and a popular-tag chip row. Click
 * a card → opens a modal showing the prompt interpolated against
 * the customer's BrandProfile via POST /prompts/:id/preview. The
 * customer can edit the prompt body in the modal; the Generate
 * button is stubbed for Phase 3 — it toasts that the generation
 * pipeline lands later.
 *
 * Phase-1 stubs in this file:
 *  - Generate button — Phase 3 wiring (image / article / video workers).
 *  - "Save as my own" button — Phase 3 custom-prompt save.
 *  - Tier-gated cap UI — Phase 4.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2,
  Search,
  Sparkles,
  Image as ImageIcon,
  FileText,
  Video,
  Layers,
  Edit2,
  Wand2,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/usePageTitle";

/* The filter axis enums duplicated client-side so the picker can
 * render without a server round-trip. The /api/portal/contentflow/prompts
 * endpoint is the source of truth for the prompts themselves; these
 * are just the 3 axes. */
const GOAL_OPTIONS = [
  { id: "all", label: "All goals" },
  { id: "awareness", label: "Awareness" },
  { id: "lead_gen", label: "Lead-gen" },
  { id: "trust", label: "Trust" },
  { id: "conversion", label: "Conversion" },
  { id: "re_engagement", label: "Re-engagement" },
] as const;

const ASSET_OPTIONS = [
  { id: "all", label: "All assets" },
  { id: "image", label: "Image" },
  { id: "article", label: "Article" },
  { id: "video", label: "Video" },
  { id: "multi", label: "Multi-asset" },
] as const;

const STYLE_OPTIONS = [
  { id: "all", label: "All styles" },
  { id: "photoreal", label: "Photoreal" },
  { id: "cinematic", label: "Cinematic" },
  { id: "minimalist", label: "Minimalist" },
  { id: "vintage", label: "Vintage" },
  { id: "editorial", label: "Editorial" },
  { id: "lifestyle", label: "Lifestyle" },
  { id: "product-hero", label: "Product hero" },
  { id: "flat-illustration", label: "Flat illustration" },
  { id: "hand-drawn", label: "Hand-drawn" },
  { id: "3d-render", label: "3D render" },
] as const;

interface PromptListItem {
  id: string;
  patternId: string;
  trade: string;
  goal: string;
  asset: "image" | "article" | "video" | "multi";
  title: string;
  description: string;
  styleHints: string[];
  popularity: number;
  tags: string[];
  previewImageUrl: string | null;
}

interface PromptListResponse {
  prompts: PromptListItem[];
  total: number;
  filtered_count: number;
  top_tags: string[];
}

interface PromptPreviewResponse {
  prompt_id: string;
  template: string;
  preview: string;
  variables_used: Record<string, string | number | undefined>;
}

const ASSET_ICON: Record<PromptListItem["asset"], React.ComponentType<{ className?: string }>> = {
  image: ImageIcon,
  article: FileText,
  video: Video,
  multi: Layers,
};

export default function PortalContentFlow() {
  usePageTitle("ContentFlow — Prompt Library");
  const { toast } = useToast();

  const [goal, setGoal] = useState<string>("all");
  const [asset, setAsset] = useState<string>("all");
  const [style, setStyle] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewEdit, setPreviewEdit] = useState<string>("");

  /* Build the query string. Empty / "all" values are omitted so the
   * cache key stays tight. */
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (goal !== "all") params.set("goal", goal);
    if (asset !== "all") params.set("asset", asset);
    if (style !== "all") params.set("style", style);
    const effectiveSearch = activeTag ?? search.trim();
    if (effectiveSearch) params.set("search", effectiveSearch);
    return params.toString();
  }, [goal, asset, style, search, activeTag]);

  const listQuery = useQuery<PromptListResponse>({
    queryKey: ["/api/portal/contentflow/prompts", queryString],
    queryFn: async () => {
      const url = queryString
        ? `/api/portal/contentflow/prompts?${queryString}`
        : "/api/portal/contentflow/prompts";
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/portal/contentflow/prompts/${id}/preview`, {});
      return (await res.json()) as PromptPreviewResponse;
    },
    onSuccess: (data) => {
      setPreviewEdit(data.preview);
    },
    onError: (err: any) => {
      toast({
        title: "Could not load prompt preview",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    },
  });

  function openPrompt(id: string) {
    setSelectedId(id);
    setPreviewEdit("");
    previewMutation.mutate(id);
  }

  function closePrompt() {
    setSelectedId(null);
    setPreviewEdit("");
  }

  const selected = useMemo(
    () => listQuery.data?.prompts.find((p) => p.id === selectedId) ?? null,
    [listQuery.data, selectedId],
  );

  function handleGenerateStub() {
    /* Phase 3 wiring lives in server/services/contentflow/imageGenerationService
     * + videoGenerationService + articleService. For Phase 1 we just
     * tell the customer when it's coming. */
    // eslint-disable-next-line no-console
    console.log("[contentflow][phase1] Generate clicked", { selectedId, previewEdit });
    toast({
      title: "Generation pipeline lands in Phase 3",
      description: "Your prompt is ready — generation wires up to the existing image / video / article workers in the next release.",
    });
  }

  return (
    <PortalLayout>
      <div className="px-4 py-6 sm:px-6 lg:px-8" data-testid="portal-contentflow">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">ContentFlow — Prompt Library</h1>
          <p className="text-sm text-muted-foreground">
            60 trade-adapted prompts across 12 named patterns. Pick one, preview it filled with your brand details, then generate.
          </p>
        </div>

        {/* ─── 3-axis filter row ──────────────────────────────────── */}
        <Card className="mb-5 p-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                placeholder="Search prompts, tags, or descriptions…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (activeTag) setActiveTag(null);
                }}
                data-testid="prompt-library-search"
              />
            </div>

            <FilterChipRow
              label="Goal"
              options={GOAL_OPTIONS as unknown as { id: string; label: string }[]}
              value={goal}
              onChange={setGoal}
              testIdPrefix="prompt-filter-goal"
            />
            <FilterChipRow
              label="Asset"
              options={ASSET_OPTIONS as unknown as { id: string; label: string }[]}
              value={asset}
              onChange={setAsset}
              testIdPrefix="prompt-filter-asset"
            />
            <FilterChipRow
              label="Style"
              options={STYLE_OPTIONS as unknown as { id: string; label: string }[]}
              value={style}
              onChange={setStyle}
              testIdPrefix="prompt-filter-style"
            />

            {/* Tag chips for the currently-filtered set. */}
            {listQuery.data && listQuery.data.top_tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</span>
                {listQuery.data.top_tags.map((tag) => {
                  const isActive = activeTag === tag;
                  return (
                    <button
                      type="button"
                      key={tag}
                      data-testid={`prompt-tag-${tag}`}
                      onClick={() => {
                        setActiveTag(isActive ? null : tag);
                        if (!isActive) setSearch("");
                      }}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        isActive
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:border-primary/60"
                      }`}
                    >
                      #{tag}
                    </button>
                  );
                })}
                {activeTag && (
                  <Button variant="ghost" size="sm" onClick={() => setActiveTag(null)}>
                    Clear tag
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* ─── Result count ──────────────────────────────────────── */}
        <div className="mb-3 text-xs text-muted-foreground" data-testid="prompt-library-result-count">
          {listQuery.data
            ? `${listQuery.data.filtered_count} of ${listQuery.data.total} prompts`
            : "Loading…"}
        </div>

        {/* ─── Prompt grid ───────────────────────────────────────── */}
        {listQuery.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : listQuery.isError ? (
          <Card className="p-6 text-sm text-destructive">Could not load the prompt library. Try again.</Card>
        ) : (listQuery.data?.prompts.length ?? 0) === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">No prompts match those filters. Try clearing one.</Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listQuery.data!.prompts.map((p) => {
              const Icon = ASSET_ICON[p.asset];
              return (
                <Card key={p.id} className="flex h-full flex-col p-4" data-testid={`prompt-card-${p.id}`}>
                  <div className="mb-3 flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                      {p.asset}
                    </Badge>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{p.goal.replace("_", "-")}</span>
                  </div>
                  <div className="mb-3 flex aspect-video items-center justify-center rounded-md bg-muted/40 text-muted-foreground">
                    {p.previewImageUrl ? (
                      // eslint-disable-next-line jsx-a11y/img-redundant-alt
                      <img src={p.previewImageUrl} alt={`${p.title} preview`} className="h-full w-full rounded-md object-cover" />
                    ) : (
                      <Icon className="h-8 w-8 opacity-60" />
                    )}
                  </div>
                  <h3 className="mb-1 text-sm font-semibold leading-snug">{p.title}</h3>
                  <p className="mb-3 flex-1 text-xs text-muted-foreground leading-relaxed">{p.description}</p>
                  <div className="mb-3 flex flex-wrap gap-1">
                    {p.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <Button
                    onClick={() => openPrompt(p.id)}
                    size="sm"
                    className="w-full"
                    data-testid={`prompt-card-use-${p.id}`}
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" /> Use this
                  </Button>
                </Card>
              );
            })}
          </div>
        )}

        {/* ─── Preview modal ─────────────────────────────────────── */}
        <Dialog open={!!selectedId} onOpenChange={(open) => { if (!open) closePrompt(); }}>
          <DialogContent className="max-w-2xl" data-testid="prompt-preview-dialog">
            <DialogHeader>
              <DialogTitle>{selected?.title ?? "Loading…"}</DialogTitle>
              <DialogDescription>{selected?.description ?? ""}</DialogDescription>
            </DialogHeader>

            {previewMutation.isPending ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-3">
                <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Edit2 className="h-3 w-3" aria-hidden /> Your prompt — edit if you want
                </label>
                <Textarea
                  rows={10}
                  value={previewEdit}
                  onChange={(e) => setPreviewEdit(e.target.value)}
                  data-testid="prompt-preview-textarea"
                  className="font-mono text-xs leading-relaxed"
                />
                {selected && selected.styleHints.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold uppercase tracking-wider text-muted-foreground">Suggested styles</span>
                    {selected.styleHints.map((s) => (
                      <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={closePrompt} data-testid="prompt-preview-cancel">Cancel</Button>
              <Button
                onClick={handleGenerateStub}
                disabled={previewMutation.isPending || !previewEdit.trim()}
                data-testid="prompt-preview-generate"
              >
                <Wand2 className="mr-1 h-3.5 w-3.5" /> Generate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PortalLayout>
  );
}

/* ─── Filter chip row helper ───────────────────────────────────── */

interface FilterChipRowProps {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  testIdPrefix: string;
}

function FilterChipRow({ label, options, value, onChange, testIdPrefix }: FilterChipRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-[52px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {options.map((opt) => {
        const isActive = value === opt.id;
        return (
          <button
            type="button"
            key={opt.id}
            data-testid={`${testIdPrefix}-${opt.id}`}
            onClick={() => onChange(opt.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:border-primary/60"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
