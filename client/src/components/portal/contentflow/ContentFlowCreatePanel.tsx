/**
 * ContentFlow — customer Create panel (Phase 3 generate surface).
 *
 * Mounted as the hero entry at the top of /portal/contentflow, above the
 * template library. Tesla/Apple simplicity contract: the DEFAULT surface is
 * exactly three decisions —
 *   1. the free-prompt box (with an optional inline reference attach),
 *   2. the "Realistic photo" toggle (maps to `photoreal`),
 *   3. the Generate button.
 * Everything else (aspect-ratio pills, saved-prompt picker, the template-
 * library hint) lives behind the collapsed "Advanced" expander.
 *
 * Backend contract — POST /api/portal/contentflow/generate (PR #1695):
 *   exactly ONE prompt source per request:
 *     free-form   → { rendered, freeForm: true }   (Starter+, moderated)
 *     saved       → { customPromptId, rendered? }  (rendered = body override)
 *     reference-only → neither (prompt derived from the vision description)
 *   orthogonal modifiers: photoreal: boolean, aspectRatio ("1:1" | "4:5" |
 *   "5:4" | "3:2" | "2:3" | "16:9" | "9:16"), reference ({ imageBase64,
 *   mediaType } | { url }). This panel is image-only (assetType: "image");
 *   articles/videos keep their template flow in the library below.
 *
 * Free-tier UX: the whole surface is visible to free users. Free-form /
 * reference / photoreal return 402 `tier_too_low` + `upgrade_required` on
 * use — rendered here with the same upgrade affordance the library's
 * generate modal uses (CTA → /contentflow#pricing). Capability is shown,
 * never hidden.
 */
import { useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronDown,
  Download,
  FolderOpen,
  ImagePlus,
  Link2,
  Loader2,
  RefreshCw,
  Wand2,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { cn } from "@/lib/utils";
import {
  FieldHelpCue,
  TitleInField,
  TitleInFieldTextarea,
} from "@/pages/portal/FreeTools/_shared";

/* ─── Backend shapes (mirrors server/routes/portal/contentflow.ts) ─── */

interface GenerateResponse {
  ok: boolean;
  draftId?: number;
  tier?: string;
  assetUrl?: string;
  content?: string;
  stylePreset?: string;
  /* error shape */
  error?: string;
  code?: string;
  upgrade_required?: boolean;
  errors?: string[];
  message?: string;
}

interface SavedPrompt {
  id: string;
  baseTemplateId: string;
  title: string;
  rendered: string;
  savedAt: string;
}

interface SavedPromptsResponse {
  ok: boolean;
  tier: string;
  cap: number | null;
  used: number;
  remaining: number | null;
  custom_prompts: SavedPrompt[];
}

type ReferenceMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

type ReferenceAttachment =
  | { kind: "upload"; base64: string; mediaType: ReferenceMediaType; name: string; previewUrl: string }
  | { kind: "url"; url: string };

interface PanelError {
  title: string;
  message: string;
  upgradeRequired: boolean;
}

/* ─── Aspect-ratio options (server: aspectRatioToDimensions) ─── */

const RATIO_OPTIONS = ["auto", "1:1", "4:5", "5:4", "3:2", "2:3", "16:9", "9:16"] as const;
type RatioOption = (typeof RATIO_OPTIONS)[number];

const RATIO_CSS: Record<RatioOption, string> = {
  auto: "1 / 1",
  "1:1": "1 / 1",
  "4:5": "4 / 5",
  "5:4": "5 / 4",
  "3:2": "3 / 2",
  "2:3": "2 / 3",
  "16:9": "16 / 9",
  "9:16": "9 / 16",
};

const ACCEPTED_TYPES: ReferenceMediaType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // keep request bodies sane

function fileToAttachment(file: File): Promise<ReferenceAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const comma = dataUrl.indexOf(",");
      resolve({
        kind: "upload",
        base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
        mediaType: file.type as ReferenceMediaType,
        name: file.name,
        previewUrl: dataUrl,
      });
    };
    reader.onerror = () => reject(new Error("Could not read that file. Try a different image."));
    reader.readAsDataURL(file);
  });
}

/** Map backend error codes to customer-friendly copy. */
function toPanelError(json: GenerateResponse, status: number): PanelError {
  if (json.code === "tier_too_low" || json.upgrade_required) {
    return {
      title: "Upgrade to unlock this",
      message:
        json.error ||
        "Custom prompts, reference images, and realistic mode are included from the Starter plan.",
      upgradeRequired: true,
    };
  }
  if (json.code === "invalid_prompt") {
    return {
      title: "That prompt can't be used",
      message:
        "Our content filter blocked it. Reword your description — keep it about your business and services — and try again.",
      upgradeRequired: false,
    };
  }
  if (json.code === "prompt_too_long") {
    return {
      title: "Prompt too long",
      message: "Keep your description under 8,000 characters.",
      upgradeRequired: false,
    };
  }
  if (status === 502) {
    return {
      title: "Generation didn't finish",
      message: json.message || "Our image providers are busy. Try again in a moment — your request was saved as a draft.",
      upgradeRequired: false,
    };
  }
  return {
    title: "Generation failed",
    message: json.error || json.message || "Something went wrong. Try again.",
    upgradeRequired: false,
  };
}

/* ─── Panel ─────────────────────────────────────────────────────── */

export default function ContentFlowCreatePanel() {
  /* Decision 1 — the prompt (plus optional inline reference). */
  const [prompt, setPrompt] = useState("");
  const [reference, setReference] = useState<ReferenceAttachment | null>(null);
  const [refOpen, setRefOpen] = useState(false);
  const [refUrl, setRefUrl] = useState("");
  const [refError, setRefError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* Decision 2 — realistic photo. */
  const [photoreal, setPhotoreal] = useState(false);

  /* Advanced (collapsed by default). */
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<RatioOption>("auto");
  const [savedPromptId, setSavedPromptId] = useState<string | null>(null);

  /* Result / error. */
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [panelError, setPanelError] = useState<PanelError | null>(null);

  /* AI copilot can fill the prompt box (Phase 1d form-fill contract). */
  useCopilotForm({
    formLabel: "Create content",
    fields: [{ key: "prompt", label: "Describe what you want to create" }],
    values: { prompt },
    onApply: (fills) => {
      for (const f of fills) {
        if (f.field_key === "prompt") setPrompt(f.value);
      }
    },
  });

  /* Saved prompts — fetched lazily when Advanced opens. */
  const savedQuery = useQuery<SavedPromptsResponse>({
    queryKey: ["/api/portal/contentflow/custom-prompts"],
    enabled: advancedOpen,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/portal/contentflow/custom-prompts");
      return res.json();
    },
  });
  const savedPrompts = savedQuery.data?.custom_prompts ?? [];
  const selectedSaved = savedPrompts.find((p) => p.id === savedPromptId) ?? null;

  const generateMutation = useMutation<GenerateResponse, Error, void>({
    mutationFn: async () => {
      /* ── Exact payloads per prompt source (live contract, PR #1695) ──
       *  saved prompt → { customPromptId, rendered? } (override allowed)
       *  free-form    → { rendered, freeForm: true }
       *  reference-only → no source fields at all                       */
      const body: Record<string, unknown> = { assetType: "image" };
      const text = prompt.trim();
      if (savedPromptId) {
        body.customPromptId = savedPromptId;
        if (text && text !== selectedSaved?.rendered) body.rendered = text;
      } else if (text) {
        body.rendered = text;
        body.freeForm = true;
      }
      if (photoreal) body.photoreal = true;
      if (aspectRatio !== "auto") body.aspectRatio = aspectRatio;
      if (reference) {
        body.reference =
          reference.kind === "upload"
            ? { imageBase64: reference.base64, mediaType: reference.mediaType }
            : { url: reference.url };
      }
      /* Raw fetch, NOT apiRequest — apiRequest throws on any non-2xx
       * before we can read the body, which would reduce 402/502 to a raw
       * "<status>: <json>" message and skip toPanelError entirely (the
       * upgrade CTA would never render). Parse the body ourselves and
       * route non-2xx through toPanelError. */
      const res = await fetch("/api/portal/contentflow/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as GenerateResponse;
      if (!res.ok) {
        throw Object.assign(new Error(json.error || "Generation failed"), {
          panelError: toPanelError(json, res.status),
        });
      }
      return json;
    },
    onSuccess: (data) => {
      setResult(data);
      setPanelError(null);
    },
    onError: (err: Error & { panelError?: PanelError }) => {
      setResult(null);
      setPanelError(
        err.panelError ?? {
          title: "Generation failed",
          message: err.message || "Something went wrong. Try again.",
          upgradeRequired: false,
        },
      );
    },
  });

  const pending = generateMutation.isPending;
  const canGenerate = !pending && (prompt.trim().length > 0 || !!savedPromptId || !!reference);

  function handleGenerate() {
    setPanelError(null);
    setResult(null);
    generateMutation.mutate();
  }

  function handlePromptChange(v: string) {
    setPrompt(v);
    /* Clearing the box fully also drops the saved-prompt link so an empty
     * box never silently generates the saved text. */
    if (savedPromptId && v.trim() === "") setSavedPromptId(null);
  }

  function selectSavedPrompt(p: SavedPrompt) {
    if (savedPromptId === p.id) {
      setSavedPromptId(null);
      return;
    }
    setSavedPromptId(p.id);
    setPrompt(p.rendered);
  }

  async function handleFile(file: File | undefined | null) {
    setRefError("");
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type as ReferenceMediaType)) {
      setRefError("Use a JPG, PNG, WebP, or GIF image.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setRefError("That image is over 8 MB — use a smaller one.");
      return;
    }
    try {
      const att = await fileToAttachment(file);
      setReference(att);
      setRefOpen(false);
      setRefUrl("");
    } catch (err: any) {
      setRefError(err?.message || "Could not read that file.");
    }
  }

  function applyRefUrl() {
    const url = refUrl.trim();
    setRefError("");
    if (!/^https?:\/\/\S+/i.test(url)) {
      setRefError("Paste a full link starting with http:// or https://");
      return;
    }
    setReference({ kind: "url", url });
    setRefOpen(false);
    setRefUrl("");
  }

  function removeReference() {
    setReference(null);
    setRefError("");
  }

  function resetAll() {
    setResult(null);
    setPanelError(null);
    setPrompt("");
    setReference(null);
    setSavedPromptId(null);
    setPhotoreal(false);
  }

  return (
    <Card className="mb-6 p-4 sm:p-5" data-testid="cf-create-panel">
      {/* Several controls in this panel legitimately carry their own
          top-left help cue (prompt box / toggle / advanced sections). */}
      <div data-cue-allowed-multiple>
        {/* ── Header ── */}
        <div className="mb-3 flex items-center gap-2">
          <FieldHelpCue
            label="Create"
            help="Type what you want and hit Generate — we create a branded image and save it to your drafts. Open Advanced for sizes and your saved prompts."
          />
          <h3 className="text-base font-semibold text-foreground">Create</h3>
          <span className="hidden text-xs text-muted-foreground sm:inline">— describe it, we make it</span>
        </div>

        {/* ── Decision 1: prompt + optional inline reference ── */}
        <div data-input-cluster className="space-y-0.5">
          <TitleInFieldTextarea
            id="cf-create-prompt"
            label="Describe what you want to create"
            help="Plain words work best — e.g. “A friendly plumber fixing a kitchen sink, bright daylight, our brand colors.”"
            value={prompt}
            onChange={handlePromptChange}
            rows={3}
            testid="cf-create-prompt"
          />

          {selectedSaved && (
            <div className="flex items-center gap-2 pl-5 text-xs">
              <span className="rounded-full border border-primary/50 bg-primary/5 px-2 py-0.5 text-primary">
                Saved prompt: {selectedSaved.title}
              </span>
              <button
                type="button"
                className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => setSavedPromptId(null)}
                data-testid="cf-create-clear-saved"
              >
                clear
              </button>
            </div>
          )}

          {/* Inline reference attach. */}
          {!reference && !refOpen && (
            <div className="pl-5">
              <button
                type="button"
                onClick={() => setRefOpen(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                data-testid="cf-create-add-reference"
              >
                <ImagePlus className="h-3.5 w-3.5" aria-hidden /> + Add reference (image or link, optional)
              </button>
            </div>
          )}

          {refOpen && !reference && (
            <div className="ml-5 rounded-lg border border-border bg-muted/20 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="cf-create-upload-reference"
                >
                  <ImagePlus className="mr-1 h-3.5 w-3.5" /> Upload image
                </Button>
                <span className="text-xs text-muted-foreground">or</span>
                <div className="min-w-[180px] flex-1">
                  <TitleInField
                    id="cf-create-ref-url"
                    label="Paste an image or page URL"
                    help="Link a photo, or any web page whose look you want this image to match."
                    value={refUrl}
                    onChange={setRefUrl}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        applyRefUrl();
                      }
                    }}
                    testid="cf-create-ref-url"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={applyRefUrl}
                  disabled={!refUrl.trim()}
                  data-testid="cf-create-use-url"
                >
                  Use URL
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setRefOpen(false); setRefError(""); }}>
                  Cancel
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                className="hidden"
                onChange={(e) => {
                  void handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {reference && (
            <div className="ml-5 flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2" data-testid="cf-create-reference-chip">
              {reference.kind === "upload" ? (
                <img src={reference.previewUrl} alt="Reference preview" className="h-8 w-8 rounded object-cover" />
              ) : (
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                {reference.kind === "upload" ? reference.name : reference.url}
              </span>
              <button
                type="button"
                onClick={removeReference}
                aria-label="Remove reference"
                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                data-testid="cf-create-remove-reference"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          )}

          {refError && <p className="pl-5 text-xs text-destructive">{refError}</p>}
        </div>

        {/* ── Decisions 2 + 3: realistic toggle + Generate ── */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FieldHelpCue
              label="Realistic photo"
              help="Generates a true-to-life photo with camera-style lighting instead of stylized artwork. Included from the Starter plan."
            />
            <Switch
              id="cf-create-photoreal"
              checked={photoreal}
              onCheckedChange={setPhotoreal}
              data-testid="cf-create-photoreal"
            />
            <label htmlFor="cf-create-photoreal" className="cursor-pointer text-sm text-foreground">
              Realistic photo
            </label>
          </div>
          <Button onClick={handleGenerate} disabled={!canGenerate} data-testid="cf-create-generate">
            {pending ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Wand2 className="mr-1 h-3.5 w-3.5" /> Generate
              </>
            )}
          </Button>
        </div>

        {/* ── Advanced expander (collapsed by default) ── */}
        <div className="mt-3 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            data-testid="cf-create-advanced-toggle"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", advancedOpen && "rotate-180")} aria-hidden />
            Advanced
          </button>

          {advancedOpen && (
            /* Two sections, each with its own top-left cue — allowed. */
            <div className="mt-3 space-y-4" data-cue-allowed-multiple>
              {/* Aspect-ratio pills — selected = outline, never bright fill. */}
              <div>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <FieldHelpCue
                    label="Size & shape"
                    help="Match where you'll post it — 1:1 or 4:5 for feeds, 9:16 for stories and reels, 16:9 for banners. Auto lets us pick."
                  />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Size &amp; shape</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {RATIO_OPTIONS.map((r) => {
                    const isActive = aspectRatio === r;
                    return (
                      <button
                        type="button"
                        key={r}
                        onClick={() => setAspectRatio(r)}
                        data-testid={`cf-create-ratio-${r.replace(":", "x")}`}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition",
                          isActive
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-foreground hover:border-primary/60",
                        )}
                      >
                        {r === "auto" ? "Auto" : r}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Saved prompts → generates via customPromptId. */}
              <div>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <FieldHelpCue
                    label="My saved prompts"
                    help="Prompts you saved from the library. Pick one to reuse it — edits in the box above are sent as a one-off tweak."
                  />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">My saved prompts</span>
                </div>
                {savedQuery.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading saved prompts" />
                ) : savedPrompts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No saved prompts yet — generate from a library template below, then tap “Save prompt”.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {savedPrompts.map((p) => {
                      const isActive = savedPromptId === p.id;
                      return (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => selectSavedPrompt(p)}
                          data-testid={`cf-create-saved-${p.id}`}
                          className={cn(
                            "max-w-full truncate rounded-full border px-3 py-1 text-xs font-medium transition",
                            isActive
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-foreground hover:border-primary/60",
                          )}
                        >
                          {p.title}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Prefer guided, fill-in-the-blank prompts? Use the <span className="font-medium text-foreground">prompt library</span> below
                — pick a template and it generates the same way. Articles and videos live there too.
              </p>
            </div>
          )}
        </div>

        {/* ── Generating skeleton ── */}
        {pending && (
          <div className="mt-4" data-testid="cf-create-skeleton">
            <div
              className="max-w-xs animate-pulse rounded-lg bg-muted"
              style={{ aspectRatio: RATIO_CSS[aspectRatio] }}
              aria-hidden
            />
            <p className="mt-2 text-xs text-muted-foreground">Creating your image — usually under 30 seconds…</p>
          </div>
        )}

        {/* ── Error (moderation / 402 upgrade / provider failure) ── */}
        {panelError && !pending && (
          <div className="mt-4 flex flex-col gap-2" data-testid="cf-create-error">
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <div className="flex-1">
                <div className="font-medium text-destructive">{panelError.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{panelError.message}</div>
              </div>
            </div>
            {panelError.upgradeRequired && (
              <Link href="/contentflow#pricing">
                <Button className="w-full sm:w-auto" data-testid="cf-create-upgrade">
                  See ContentFlow plans
                </Button>
              </Link>
            )}
          </div>
        )}

        {/* ── Success ── */}
        {result && !pending && (
          <div className="mt-4 space-y-3" data-testid="cf-create-result">
            {result.assetUrl && (
              <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
                <img
                  src={result.assetUrl}
                  alt="Your generated image"
                  className="block max-h-[420px] w-full object-contain"
                  data-testid="cf-create-result-image"
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <FolderOpen className="h-3.5 w-3.5" aria-hidden />
              <span>
                Saved to your drafts —{" "}
                <Link
                  href="/portal/contentflow/library"
                  className="underline underline-offset-2 hover:text-foreground"
                  data-testid="cf-create-open-library"
                >
                  open My library
                </Link>
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {result.assetUrl && (
                <a href={result.assetUrl} download={`contentflow-${result.draftId ?? "image"}.png`}>
                  <Button variant="outline" size="sm" data-testid="cf-create-download">
                    <Download className="mr-1 h-3.5 w-3.5" /> Download
                  </Button>
                </a>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={pending}
                data-testid="cf-create-again"
              >
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Generate again
              </Button>
              <Button variant="ghost" size="sm" onClick={resetAll} data-testid="cf-create-reset">
                Start new
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
