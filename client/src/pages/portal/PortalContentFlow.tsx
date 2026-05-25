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
import { Link } from "wouter";
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
  Download,
  Save,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/usePageTitle";
import TokenChip from "@/components/forms/TokenChip";
import BusinessProfileEditor, { type ExtractedBusinessProfile } from "@/components/portal/BusinessProfileEditor";
import QuotaBanner from "@/components/portal/QuotaBanner";

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

/* Phase 2: AI-prefill response shapes. Mirrors
 * server/services/contentflow/profilePrefill.ts. */
type PrefillPlaceholder =
  | "businessName"
  | "city"
  | "serviceUSP"
  | "serviceFocus"
  | "customerQuote"
  | "brandPrimary"
  | "brandSecondary"
  | "tone"
  | "audience"
  | "yearFounded";

interface PrefilledToken {
  placeholder: PrefillPlaceholder;
  selected: string;
  alternatives: string[];
}

interface PrefilledPrompt {
  templateId: string;
  tokens: PrefilledToken[];
  rendered: string;
}

interface PrefillResponse {
  ok: boolean;
  template: string;
  prefilled: PrefilledPrompt;
  defaults: Record<PrefillPlaceholder, string>;
}

const PLACEHOLDER_LABEL: Record<PrefillPlaceholder, string> = {
  businessName: "Business name",
  city: "City",
  serviceUSP: "USP",
  serviceFocus: "Service focus",
  customerQuote: "Customer quote",
  brandPrimary: "Primary color",
  brandSecondary: "Secondary color",
  tone: "Tone",
  audience: "Audience",
  yearFounded: "Year founded",
};

function isColorPlaceholder(p: PrefillPlaceholder): boolean {
  return p === "brandPrimary" || p === "brandSecondary";
}

/* Render the template client-side after a chip swap so the preview
 * updates without a server round-trip. Mirrors interpolatePromptTemplate
 * in shared/contentflow/promptLibrary.ts (placeholder defaults match). */
const CLIENT_PLACEHOLDER_DEFAULTS: Record<PrefillPlaceholder, string> = {
  businessName: "[Your business name]",
  city: "your service area",
  serviceUSP: "fast, fair, no-surprise pricing",
  serviceFocus: "service call",
  customerQuote: "They showed up fast and fixed it right.",
  brandPrimary: "your brand color",
  brandSecondary: "your accent color",
  tone: "friendly",
  audience: "homeowners in your area",
  yearFounded: "2019",
};

function clientRender(template: string, tokens: PrefilledToken[]): string {
  const map = new Map<string, string>();
  for (const t of tokens) map.set(t.placeholder, t.selected);
  return template.replace(/{{\s*(\w+)\s*}}/g, (_m, k: string) => {
    const v = map.get(k);
    if (v && v.trim().length > 0) return v;
    return CLIENT_PLACEHOLDER_DEFAULTS[k as PrefillPlaceholder] ?? `[${k}]`;
  });
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

  /* Phase 2 state. */
  const [tab, setTab] = useState<"library" | "profile">("library");
  const [businessProfile, setBusinessProfile] = useState<ExtractedBusinessProfile | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string>("");
  const [prefilled, setPrefilled] = useState<PrefilledPrompt | null>(null);
  const [templateBody, setTemplateBody] = useState<string>("");
  /* When the user taps the textarea Edit button we hand them the
   * rendered prompt as a freeform string; chips become read-only. */
  const [freeformMode, setFreeformMode] = useState<boolean>(false);

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

  /* Phase 2 — per-prompt AI prefill. */
  const prefillMutation = useMutation({
    mutationFn: async (id: string) => {
      const body: Record<string, unknown> = {};
      if (businessProfile) body.profile = businessProfile;
      const res = await apiRequest("POST", `/api/portal/contentflow/prompts/${id}/prefill`, body);
      return (await res.json()) as PrefillResponse;
    },
    onSuccess: (data) => {
      setPrefilled(data.prefilled);
      setTemplateBody(data.template);
      setPreviewEdit(data.prefilled.rendered);
      setFreeformMode(false);
    },
    onError: (err: any) => {
      toast({
        title: "Could not prefill prompt",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    },
  });

  const draftMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("no prompt selected");
      const res = await apiRequest("POST", `/api/portal/contentflow/prompts/${selectedId}/draft`, {
        tokens: prefilled?.tokens ?? [],
        finalPrompt: previewEdit,
      });
      return await res.json();
    },
  });

  /* Phase 3: generation + custom-prompt save state + mutations. */
  type GenerateResult = {
    ok: boolean;
    draftId?: number;
    tier?: string;
    assetUrl?: string;
    content?: string;
    stylePreset?: string;
    code?: string;
    error?: string;
    upgrade_required?: boolean;
  };
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [generateError, setGenerateError] = useState<GenerateResult | null>(null);

  const generateMutation = useMutation<GenerateResult, Error, void>({
    mutationFn: async () => {
      if (!selected || !selectedId) throw new Error("no prompt selected");
      const body = {
        templateId: selectedId,
        tokens: prefilled?.tokens ?? [],
        rendered: previewEdit,
        assetType: selected.asset,
      };
      const res = await apiRequest("POST", "/api/portal/contentflow/generate", body);
      const json = (await res.json()) as GenerateResult;
      if (!res.ok) {
        /* surface 402 / 503 / 502 with our friendlier UI rather than
         * throwing into the toast — react-query treats non-2xx as
         * errors only when apiRequest does, which it doesn't here. */
        const err: GenerateResult = { ...json, ok: false };
        throw Object.assign(new Error(json.error || "Generation failed"), { result: err, status: res.status });
      }
      return json;
    },
    onSuccess: (data) => {
      setGenerateResult(data);
      setGenerateError(null);
    },
    onError: (err: any) => {
      const r: GenerateResult = err?.result || { ok: false, error: err?.message };
      setGenerateError(r);
      setGenerateResult(null);
      toast({
        title: r.code === "tier_too_low" ? "Upgrade required"
          : r.code === "video_early_access" ? "Coming soon"
          : "Generation failed",
        description: r.error || "Try again",
        variant: r.code === "video_early_access" ? "default" : "destructive",
      });
    },
  });

  const saveCustomMutation = useMutation<{ ok: boolean; tier: string; custom_prompt?: { id: string } }, Error, void>({
    mutationFn: async () => {
      if (!selected || !selectedId) throw new Error("no prompt selected");
      const body = {
        baseTemplateId: selectedId,
        customizedRendered: previewEdit,
        customizedTokens: prefilled?.tokens ?? [],
        title: selected.title,
      };
      const res = await apiRequest("POST", "/api/portal/contentflow/custom-prompts", body);
      const json = await res.json();
      if (!res.ok) {
        throw Object.assign(new Error(json.error || "Save failed"), { result: json, status: res.status });
      }
      return json;
    },
    onSuccess: () => {
      toast({
        title: "Saved to your library",
        description: "You can re-use this customized prompt from the library tab.",
      });
    },
    onError: (err: any) => {
      const r = err?.result || {};
      toast({
        title: r.code === "tier_no_save" || r.code === "tier_cap_reached"
          ? "Upgrade required"
          : "Could not save prompt",
        description: r.error || err?.message || "Try again",
        variant: "destructive",
      });
    },
  });

  function openPrompt(id: string) {
    setSelectedId(id);
    setPreviewEdit("");
    setPrefilled(null);
    setTemplateBody("");
    setFreeformMode(false);
    /* Phase 2: if the customer has populated a business profile we ask
     * the prefill endpoint for chip-editable tokens. Otherwise we fall
     * back to the Phase 1 plain preview so the UI never blocks on a
     * missing profile. */
    if (businessProfile) {
      prefillMutation.mutate(id);
    } else {
      previewMutation.mutate(id);
    }
  }

  function closePrompt() {
    setSelectedId(null);
    setPreviewEdit("");
    setPrefilled(null);
    setTemplateBody("");
    setFreeformMode(false);
  }

  /* Swap one token's selection, then re-render the preview. */
  function setTokenSelection(placeholder: PrefillPlaceholder, next: string) {
    if (!prefilled) return;
    const nextTokens = prefilled.tokens.map((t) =>
      t.placeholder === placeholder ? { ...t, selected: next } : t,
    );
    /* Make sure the new value is also in the alternatives list so the
     * popover's radio set is consistent. */
    const nextPrefilled: PrefilledPrompt = {
      ...prefilled,
      tokens: nextTokens.map((t) =>
        t.placeholder === placeholder && !t.alternatives.includes(next)
          ? { ...t, alternatives: [next, ...t.alternatives].slice(0, 6) }
          : t,
      ),
      rendered: clientRender(templateBody, nextTokens),
    };
    setPrefilled(nextPrefilled);
    setPreviewEdit(nextPrefilled.rendered);
  }

  async function regenerateAlternativesForToken(placeholder: PrefillPlaceholder) {
    if (!selectedId) return;
    /* Re-call the prefill endpoint with the current selections so the
     * AI returns a fresh set of alternatives. We replace only the
     * targeted token's alternatives — selections stay sticky. */
    const body: Record<string, unknown> = {};
    if (businessProfile) body.profile = businessProfile;
    if (prefilled) {
      body.current = Object.fromEntries(prefilled.tokens.map((t) => [t.placeholder, t.selected]));
    }
    try {
      const res = await apiRequest("POST", `/api/portal/contentflow/prompts/${selectedId}/prefill`, body);
      const data = (await res.json()) as PrefillResponse;
      const fresh = data.prefilled.tokens.find((t) => t.placeholder === placeholder);
      if (!prefilled || !fresh) return;
      const nextTokens = prefilled.tokens.map((t) =>
        t.placeholder === placeholder ? { ...t, alternatives: fresh.alternatives } : t,
      );
      setPrefilled({ ...prefilled, tokens: nextTokens });
    } catch (err: any) {
      toast({
        title: "Could not regenerate alternatives",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    }
  }

  const selected = useMemo(
    () => listQuery.data?.prompts.find((p) => p.id === selectedId) ?? null,
    [listQuery.data, selectedId],
  );

  function handleGenerate() {
    /* Phase 3: persist the prompt draft (best-effort, no toast) then
     * fire the real generation pipeline. The draft mutation is kept
     * for analytics — it stamps clients.metadata.last_draft so the
     * customer's prompt isn't lost if the generate call fails. */
    setGenerateError(null);
    setGenerateResult(null);
    draftMutation.mutate(undefined);
    generateMutation.mutate();
  }

  function closeResult() {
    setGenerateResult(null);
    setGenerateError(null);
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

        {/* Phase 4 wire-up: monthly usage bars (images / articles / videos).
         * QuotaBanner self-fetches GET /api/portal/contentflow/quota and
         * renders its own loading skeleton + graceful error card, so we
         * just mount it here. Sits above the tabs (which include the
         * prompt picker + business-profile editor). */}
        <QuotaBanner />

        <Tabs value={tab} onValueChange={(v) => setTab(v as "library" | "profile")}>
          <TabsList className="mb-5">
            <TabsTrigger value="library" data-testid="tab-library">
              Prompt library
            </TabsTrigger>
            <TabsTrigger value="profile" data-testid="tab-profile">
              Business profile
              {businessProfile && <span className="ml-1 inline-block h-3 w-3 rounded-full bg-brand-blue" aria-hidden />}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <BusinessProfileEditor
              profile={businessProfile}
              onProfileChange={setBusinessProfile}
              sourceUrl={sourceUrl}
              onSourceUrlChange={setSourceUrl}
            />
          </TabsContent>

          <TabsContent value="library">
        {!businessProfile && (
          <Card className="mb-5 border-dashed bg-muted/30 p-4 text-xs text-muted-foreground" data-testid="profile-hint">
            Tip: fill in your{" "}
            <button type="button" className="underline" onClick={() => setTab("profile")}>
              Business profile
            </button>{" "}
            first — then every prompt prefills with click-to-swap chips for business name, city, services, tone, and more.
          </Card>
        )}

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

          </TabsContent>
        </Tabs>

        {/* ─── Prefilled-prompt modal (Phase 2) ──────────────────── */}
        <Dialog open={!!selectedId} onOpenChange={(open) => { if (!open) closePrompt(); }}>
          <DialogContent className="max-w-3xl" data-testid="prompt-preview-dialog">
            <DialogHeader>
              <DialogTitle>{selected?.title ?? "Loading…"}</DialogTitle>
              <DialogDescription>{selected?.description ?? ""}</DialogDescription>
            </DialogHeader>

            {(previewMutation.isPending || prefillMutation.isPending) ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Chip row — only when prefill ran successfully. */}
                {prefilled && !freeformMode && (
                  <div className="rounded-md border border-border bg-muted/20 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Click any chip to swap a value
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setFreeformMode(true)}
                        data-testid="prompt-preview-edit-freeform"
                      >
                        <Edit2 className="mr-1 h-3 w-3" /> Edit as text
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {prefilled.tokens.map((t) => (
                        <TokenChip
                          key={t.placeholder}
                          label={PLACEHOLDER_LABEL[t.placeholder]}
                          value={t.selected}
                          alternatives={t.alternatives}
                          onChange={(next) => setTokenSelection(t.placeholder, next)}
                          onRegenerate={() => regenerateAlternativesForToken(t.placeholder)}
                          variant={isColorPlaceholder(t.placeholder) ? "color" : "default"}
                          testId={`chip-${t.placeholder}`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Edit2 className="h-3 w-3" aria-hidden />{" "}
                    {prefilled && !freeformMode ? "Live preview" : "Your prompt — edit if you want"}
                  </label>
                  <Textarea
                    rows={10}
                    value={previewEdit}
                    onChange={(e) => {
                      setPreviewEdit(e.target.value);
                      /* If the user types into the textarea while chips
                       * are still rendered, drop into freeform mode so
                       * the chips don't keep overwriting their edits. */
                      if (prefilled && !freeformMode) setFreeformMode(true);
                    }}
                    data-testid="prompt-preview-textarea"
                    className="font-mono text-xs leading-relaxed"
                    readOnly={prefilled !== null && !freeformMode}
                  />
                  {prefilled && freeformMode && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        setFreeformMode(false);
                        setPreviewEdit(prefilled.rendered);
                      }}
                    >
                      Back to chips
                    </Button>
                  )}
                </div>

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
                onClick={handleGenerate}
                disabled={
                  previewMutation.isPending
                  || prefillMutation.isPending
                  || generateMutation.isPending
                  || !previewEdit.trim()
                }
                data-testid="prompt-preview-generate"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-1 h-3.5 w-3.5" /> Generate
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Phase 3: Generation result modal ──────────────────── */}
        <Dialog open={!!generateResult || !!generateError} onOpenChange={(open) => { if (!open) closeResult(); }}>
          <DialogContent className="max-w-3xl" data-testid="generate-result-dialog">
            <DialogHeader>
              <DialogTitle>
                {generateError ? (
                  generateError.code === "tier_too_low" || generateError.code === "tier_no_save" || generateError.code === "tier_cap_reached"
                    ? "Upgrade required"
                    : generateError.code === "video_early_access"
                      ? "Video — early access"
                      : "Generation failed"
                ) : (
                  selected?.asset === "article" ? "Your article" : selected?.asset === "image" ? "Your image" : "Your content"
                )}
              </DialogTitle>
              <DialogDescription>
                {generateError ? (generateError.error || "Try again or contact support.") : "Save it to your library, download it, or generate a variation."}
              </DialogDescription>
            </DialogHeader>

            {/* ── Error state ───────────────────────────────────── */}
            {generateError && (
              <div className="flex flex-col gap-3 py-2">
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                  <div className="flex-1">
                    <div className="font-medium text-destructive">{generateError.error}</div>
                    {generateError.tier && (
                      <div className="mt-1 text-xs text-muted-foreground">Your tier: {generateError.tier}</div>
                    )}
                  </div>
                </div>
                {generateError.upgrade_required && (
                  <Link href="/contentflow#pricing">
                    <Button className="w-full" data-testid="generate-result-upgrade">
                      See ContentFlow plans
                    </Button>
                  </Link>
                )}
              </div>
            )}

            {/* ── Success state ─────────────────────────────────── */}
            {generateResult && (
              <div className="flex flex-col gap-4 py-2">
                {generateResult.assetUrl && (
                  <div className="overflow-hidden rounded-md border border-border bg-muted/20">
                    {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
                    <img
                      src={generateResult.assetUrl}
                      alt={`Generated image for ${selected?.title ?? "prompt"}`}
                      className="block max-h-[500px] w-full object-contain"
                      data-testid="generate-result-image"
                    />
                  </div>
                )}
                {generateResult.content && (
                  <div className="max-h-[400px] overflow-auto rounded-md border border-border bg-muted/10 p-3 text-sm leading-relaxed">
                    <pre className="whitespace-pre-wrap font-sans" data-testid="generate-result-article">{generateResult.content}</pre>
                  </div>
                )}
                {generateResult.stylePreset && (
                  <div className="text-xs text-muted-foreground">
                    Style preset: <span className="font-medium">{generateResult.stylePreset}</span>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {generateResult.assetUrl && (
                    <a
                      href={generateResult.assetUrl}
                      download={`contentflow-${selectedId ?? "image"}.png`}
                      data-testid="generate-result-download-image"
                    >
                      <Button variant="outline" size="sm">
                        <Download className="mr-1 h-3.5 w-3.5" /> Download image
                      </Button>
                    </a>
                  )}
                  {generateResult.content && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const blob = new Blob([generateResult.content ?? ""], { type: "text/plain;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `contentflow-${selectedId ?? "article"}.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      data-testid="generate-result-download-article"
                    >
                      <Download className="mr-1 h-3.5 w-3.5" /> Download text
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => saveCustomMutation.mutate()}
                    disabled={saveCustomMutation.isPending}
                    data-testid="generate-result-save-library"
                  >
                    {saveCustomMutation.isPending ? (
                      <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Saving…</>
                    ) : (
                      <><Save className="mr-1 h-3.5 w-3.5" /> Save to library</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => generateMutation.mutate()}
                    disabled={generateMutation.isPending}
                    data-testid="generate-result-variation"
                  >
                    {generateMutation.isPending ? (
                      <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Generating…</>
                    ) : (
                      <><RefreshCw className="mr-1 h-3.5 w-3.5" /> Generate variation</>
                    )}
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={closeResult} data-testid="generate-result-close">Close</Button>
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
