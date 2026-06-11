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
 *
 * Phase 2 video pipeline (WP6) — the panel now has a MODE switch
 * (Image | Video) as outline pills. Video mode keeps the SAME description
 * box + SAME Generate button (the 3-decision contract holds: mode,
 * description, generate); Advanced gains scene-count / aspect / narration.
 * Because video costs real dollars, submit shows ONE deliberate
 * pre-confirm step ("≈$X · ~N min") from the 202 estimate, then a
 * progress strip polling GET /videos/:id every 4s with per-scene tiles,
 * per-scene Retry on needs_attention, cancel while planned/rendering,
 * and the final player on ready. Video 402s reuse the same upgrade-card
 * path (server returns {code:"tier_too_low", upgrade_required:true}).
 */
import { useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronDown,
  Clapperboard,
  Download,
  FolderOpen,
  Image as ImageIcon,
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
import { getVideoSceneCapsForTier } from "@shared/contentflow/quotas";
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

/* ─── Video pipeline shapes (server/routes/portal/contentflowVideo.ts) ─── */

type CreateMode = "image" | "video";

const VIDEO_ASPECTS = ["16:9", "9:16", "1:1"] as const;
type VideoAspect = (typeof VIDEO_ASPECTS)[number];

interface VideoCreateResponse {
  ok: boolean;
  projectId?: number;
  created?: boolean;
  scenePlan?: { title: string; totalDurationSec: number; scenes: Array<{ index: number; durationSec: number }> };
  estimateUsd?: number;
  estimatedMinutes?: number;
  quota?: { tier: string; videosUsed: number; videosLimit: number };
  /* error shape */
  error?: string;
  code?: string;
  tier?: string;
  upgrade_required?: boolean;
}

interface VideoPollScene {
  index: number;
  status: "planned" | "rendering" | "rendered" | "failed";
  durationSec?: number;
  thumb?: string;
  error?: string;
}

interface VideoPollResponse {
  id: number;
  title: string | null;
  status: "planned" | "rendering" | "stitching" | "ready" | "needs_attention" | "failed" | "canceled";
  stitch_status: string | null;
  progressPct: number;
  scenes: VideoPollScene[];
  videoUrl?: string;
  costUsd: number;
  error?: string;
}

interface QuotaStateResponse {
  tier: string;
}

const VIDEO_TERMINAL_STATES = new Set(["ready", "failed", "canceled"]);
const VIDEO_CANCELABLE_STATES = new Set(["planned", "rendering"]);

const SCENE_TILE_LABEL: Record<VideoPollScene["status"], string> = {
  planned: "Queued",
  rendering: "Rendering…",
  rendered: "Done",
  failed: "Failed",
};

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

  /* Mode — Image | Video (outline pills). Video = Phase 2 pipeline. */
  const [mode, setMode] = useState<CreateMode>("image");

  /* Video advanced (collapsed by default, like the image options). */
  const [sceneCount, setSceneCount] = useState<number | "auto">("auto");
  const [videoAspect, setVideoAspect] = useState<VideoAspect>("16:9");
  const [narration, setNarration] = useState(true);

  /* Video flow: idle → preconfirm (the ONE deliberate dollars step) →
   * progress (4s polling). */
  const [videoPhase, setVideoPhase] = useState<"idle" | "preconfirm" | "progress">("idle");
  const [videoCreate, setVideoCreate] = useState<VideoCreateResponse | null>(null);
  /* One idempotency key per deliberate Generate click — a double-submit
   * (network retry / double tap) reuses it and the server dedupes. */
  const idemKeyRef = useRef<string>("");

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

  /* ─── Video pipeline wiring ─────────────────────────────────── */

  /* Tier → scene caps for the Advanced scene-count pills. */
  const quotaQuery = useQuery<QuotaStateResponse>({
    queryKey: ["/api/portal/contentflow/quota"],
    enabled: mode === "video",
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/portal/contentflow/quota");
      return res.json();
    },
  });
  const videoCaps = getVideoSceneCapsForTier(quotaQuery.data?.tier ?? "contentflow-creator");

  const createVideoMutation = useMutation<VideoCreateResponse, Error, void>({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        description: prompt.trim(),
        idempotencyKey: idemKeyRef.current,
        advanced: {
          ...(sceneCount !== "auto" ? { sceneCount } : {}),
          aspectRatio: videoAspect,
          narration,
        },
      };
      /* Raw fetch for the same reason as the image path: 402 bodies
       * (tier_too_low / quota / cost-cap) must reach toPanelError. */
      const res = await fetch("/api/portal/contentflow/videos", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as VideoCreateResponse;
      if (!res.ok) {
        throw Object.assign(new Error(json.error || "Video planning failed"), {
          panelError: toPanelError(json as GenerateResponse, res.status),
        });
      }
      return json;
    },
    onSuccess: (data) => {
      setVideoCreate(data);
      setVideoPhase("preconfirm");
      setPanelError(null);
    },
    onError: (err: Error & { panelError?: PanelError }) => {
      setVideoCreate(null);
      setVideoPhase("idle");
      setPanelError(
        err.panelError ?? {
          title: "Video planning failed",
          message: err.message || "Something went wrong. Try again.",
          upgradeRequired: false,
        },
      );
    },
  });

  const videoProjectId = videoCreate?.projectId ?? null;
  const pollQuery = useQuery<VideoPollResponse>({
    queryKey: ["/api/portal/contentflow/videos", videoProjectId],
    enabled: videoPhase === "progress" && videoProjectId != null,
    refetchInterval: (query) =>
      query.state.data && VIDEO_TERMINAL_STATES.has(query.state.data.status) ? false : 4000,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/portal/contentflow/videos/${videoProjectId}`);
      return res.json();
    },
  });
  const videoStatus = pollQuery.data;

  const cancelVideoMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => apiRequest("POST", `/api/portal/contentflow/videos/${videoProjectId}/cancel`),
    onSettled: () => {
      void pollQuery.refetch();
    },
  });

  const retrySceneMutation = useMutation<unknown, Error, number>({
    mutationFn: async (sceneIndex: number) =>
      apiRequest("POST", `/api/portal/contentflow/videos/${videoProjectId}/scenes/${sceneIndex}/retry`),
    onSettled: () => {
      void pollQuery.refetch();
    },
  });

  const pending = generateMutation.isPending || createVideoMutation.isPending;
  const canGenerate =
    !pending &&
    (mode === "video"
      ? prompt.trim().length > 0 && videoPhase === "idle"
      : prompt.trim().length > 0 || !!savedPromptId || !!reference);

  function handleGenerate() {
    setPanelError(null);
    setResult(null);
    if (mode === "video") {
      /* crypto.randomUUID needs a secure context — same fallback as
       * useCalculatorAnalytics. */
      idemKeyRef.current =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      createVideoMutation.mutate();
      return;
    }
    generateMutation.mutate();
  }

  function switchMode(next: CreateMode) {
    if (next === mode) return;
    setMode(next);
    setPanelError(null);
    setResult(null);
    /* Leaving video mid-flow keeps the project server-side (it shows in
     * the library); the panel itself resets to a clean slate. */
    setVideoPhase("idle");
    setVideoCreate(null);
  }

  function confirmVideo() {
    setVideoPhase("progress");
  }

  function declineVideo() {
    /* Decline the dollars step → cancel server-side so unsubmitted
     * scenes never render, then reset. */
    if (videoProjectId != null) cancelVideoMutation.mutate();
    setVideoPhase("idle");
    setVideoCreate(null);
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
    setVideoPhase("idle");
    setVideoCreate(null);
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

        {/* ── Mode switch (Image | Video) — selected = outline, never bright fill. ── */}
        <div className="mb-3 flex items-center gap-2">
          <FieldHelpCue
            label="What to create"
            help="Image makes a single branded picture. Video plans a short multi-scene clip — you'll see the estimated cost before anything renders."
          />
          {(
            [
              { id: "image" as CreateMode, label: "Image", Icon: ImageIcon },
              { id: "video" as CreateMode, label: "Video", Icon: Clapperboard },
            ]
          ).map(({ id, label, Icon }) => {
            const isActive = mode === id;
            return (
              <button
                type="button"
                key={id}
                onClick={() => switchMode(id)}
                aria-pressed={isActive}
                data-testid={`cf-create-mode-${id}`}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-foreground hover:border-primary/60",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
              </button>
            );
          })}
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

          {mode === "image" && selectedSaved && (
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

          {/* Inline reference attach (image-only — vision→generate). */}
          {mode === "image" && !reference && !refOpen && (
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

          {mode === "image" && refOpen && !reference && (
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

          {mode === "image" && reference && (
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

          {mode === "image" && refError && <p className="pl-5 text-xs text-destructive">{refError}</p>}
        </div>

        {/* ── Decisions 2 + 3: realistic toggle (image) + Generate ── */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {mode === "image" ? (
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
          ) : (
            <span className="text-xs text-muted-foreground">
              You'll see the cost estimate before anything renders.
            </span>
          )}
          <Button onClick={handleGenerate} disabled={!canGenerate} data-testid="cf-create-generate">
            {pending ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> {mode === "video" ? "Planning…" : "Generating…"}
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

          {advancedOpen && mode === "video" && (
            /* Video advanced — scene count / format / narration, each
             * with its own top-left cue — allowed. */
            <div className="mt-3 space-y-4" data-cue-allowed-multiple>
              {/* Scene count (within the tier cap) — selected = outline. */}
              <div>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <FieldHelpCue
                    label="Scenes"
                    help={`How many shots your video is built from — each scene is 4–8 seconds. Your plan allows up to ${videoCaps.maxScenes}. Auto lets us pick.`}
                  />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scenes</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["auto", ...Array.from({ length: Math.max(0, videoCaps.maxScenes) }, (_, i) => i + 1)] as Array<number | "auto">).map(
                    (n) => {
                      const isActive = sceneCount === n;
                      return (
                        <button
                          type="button"
                          key={String(n)}
                          onClick={() => setSceneCount(n)}
                          data-testid={`cf-create-scenes-${n}`}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium transition",
                            isActive
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-foreground hover:border-primary/60",
                          )}
                        >
                          {n === "auto" ? "Auto" : n}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              {/* Aspect — video providers support 16:9 / 9:16 / 1:1. */}
              <div>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <FieldHelpCue
                    label="Format"
                    help="16:9 for YouTube and websites, 9:16 for stories and reels, 1:1 for feeds."
                  />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Format</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {VIDEO_ASPECTS.map((r) => {
                    const isActive = videoAspect === r;
                    return (
                      <button
                        type="button"
                        key={r}
                        onClick={() => setVideoAspect(r)}
                        data-testid={`cf-create-video-ratio-${r.replace(":", "x")}`}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition",
                          isActive
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-foreground hover:border-primary/60",
                        )}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Narration toggle. */}
              <div className="flex items-center gap-2">
                <FieldHelpCue
                  label="Narration"
                  help="Adds a spoken voiceover that matches each scene. Turn off for a silent, music-friendly clip."
                />
                <Switch
                  id="cf-create-narration"
                  checked={narration}
                  onCheckedChange={setNarration}
                  data-testid="cf-create-narration"
                />
                <label htmlFor="cf-create-narration" className="cursor-pointer text-sm text-foreground">
                  Narration
                </label>
              </div>
            </div>
          )}

          {advancedOpen && mode === "image" && (
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
        {pending && mode === "image" && (
          <div className="mt-4" data-testid="cf-create-skeleton">
            <div
              className="max-w-xs animate-pulse rounded-lg bg-muted"
              style={{ aspectRatio: RATIO_CSS[aspectRatio] }}
              aria-hidden
            />
            <p className="mt-2 text-xs text-muted-foreground">Creating your image — usually under 30 seconds…</p>
          </div>
        )}
        {pending && mode === "video" && (
          <p className="mt-4 text-xs text-muted-foreground" data-testid="cf-create-video-planning">
            Planning your scenes — a few seconds…
          </p>
        )}

        {/* ── Video pre-confirm — the ONE deliberate dollars step ── */}
        {mode === "video" && videoPhase === "preconfirm" && videoCreate && !pending && (
          <div
            className="mt-4 rounded-lg border border-border bg-muted/20 p-3"
            data-testid="cf-create-video-preconfirm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  ≈${(videoCreate.estimateUsd ?? 0).toFixed(2)} · ~{videoCreate.estimatedMinutes ?? 5} min
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {videoCreate.scenePlan?.scenes.length ?? 0} scenes · {videoCreate.scenePlan?.totalDurationSec ?? 0}s total
                  {videoCreate.created === false ? " · already planned (no double charge)" : ""}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={confirmVideo} data-testid="cf-create-video-confirm">
                  Start rendering
                </Button>
                <Button
                  variant="ghost"
                  onClick={declineVideo}
                  disabled={cancelVideoMutation.isPending}
                  data-testid="cf-create-video-decline"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Video progress strip (4s polling) ── */}
        {mode === "video" && videoPhase === "progress" && (
          <div className="mt-4 space-y-3" data-testid="cf-create-video-progress">
            {/* Progress bar — theme tokens only. */}
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {videoStatus?.status === "ready"
                    ? "Done"
                    : videoStatus?.status === "stitching"
                      ? "Stitching scenes together…"
                      : videoStatus?.status === "needs_attention"
                        ? "A scene needs your attention"
                        : videoStatus?.status === "failed"
                          ? "This video failed"
                          : videoStatus?.status === "canceled"
                            ? "Canceled"
                            : "Rendering scenes…"}
                </span>
                <span>{videoStatus?.progressPct ?? 5}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${videoStatus?.progressPct ?? 5}%` }}
                />
              </div>
            </div>

            {/* Per-scene tiles. */}
            <div className="flex flex-wrap gap-2">
              {(videoStatus?.scenes ?? videoCreate?.scenePlan?.scenes.map((s) => ({
                index: s.index,
                status: "planned" as const,
                durationSec: s.durationSec,
              })) ?? []).map((s) => (
                <div
                  key={s.index}
                  data-testid={`cf-create-scene-tile-${s.index}`}
                  className={cn(
                    "flex min-w-[88px] flex-col gap-0.5 rounded-lg border p-2 text-xs",
                    s.status === "rendered" && "border-primary/60 text-foreground",
                    s.status === "rendering" && "animate-pulse border-border text-foreground",
                    s.status === "planned" && "border-border text-muted-foreground",
                    s.status === "failed" && "border-destructive/60 text-destructive",
                  )}
                >
                  <span className="font-medium">Scene {s.index + 1}</span>
                  <span className={s.status === "failed" ? "" : "text-muted-foreground"}>
                    {SCENE_TILE_LABEL[s.status]}
                    {s.durationSec ? ` · ${s.durationSec}s` : ""}
                  </span>
                  {s.status === "failed" && videoStatus?.status === "needs_attention" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 h-6 px-2 text-xs"
                      onClick={() => retrySceneMutation.mutate(s.index)}
                      disabled={retrySceneMutation.isPending}
                      data-testid={`cf-create-scene-retry-${s.index}`}
                    >
                      <RefreshCw className="mr-1 h-3 w-3" /> Retry
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Ready → player + library link. */}
            {videoStatus?.status === "ready" && videoStatus.videoUrl && (
              <div className="space-y-2">
                <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    src={videoStatus.videoUrl}
                    controls
                    playsInline
                    className="block max-h-[420px] w-full"
                    data-testid="cf-create-video-player"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                  <span>
                    Saved to your library —{" "}
                    <Link
                      href="/portal/contentflow/library"
                      className="underline underline-offset-2 hover:text-foreground"
                      data-testid="cf-create-video-open-library"
                    >
                      open My library
                    </Link>
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={resetAll} data-testid="cf-create-video-new">
                  Start new
                </Button>
              </div>
            )}

            {/* Terminal failure / canceled. */}
            {(videoStatus?.status === "failed" || videoStatus?.status === "canceled") && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-hidden />
                <span>{videoStatus.error || (videoStatus.status === "canceled" ? "This video was canceled." : "This video failed to render.")}</span>
                <Button variant="ghost" size="sm" onClick={resetAll} data-testid="cf-create-video-reset">
                  Start new
                </Button>
              </div>
            )}

            {/* Cancel affordance while planned/rendering. */}
            {videoStatus && VIDEO_CANCELABLE_STATES.has(videoStatus.status) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => cancelVideoMutation.mutate()}
                disabled={cancelVideoMutation.isPending}
                data-testid="cf-create-video-cancel"
              >
                <X className="mr-1 h-3.5 w-3.5" /> Cancel video
              </Button>
            )}
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
