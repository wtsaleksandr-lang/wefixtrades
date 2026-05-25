/**
 * Portal — ContentFlow content-preferences questionnaire.
 *
 * A guided, button-based wizard (no large free-text — every answer is a
 * choice or a single short input) that lets a customer tell ContentFlow
 * how their AI-generated content should look and sound. Answers are saved
 * to the ContentFlow brand profile and consumed by the generation pipeline
 * (buildBrandLayerText) — so the content actually aligns to what the
 * customer picked here.
 *
 * Writes via PATCH /api/portal/contentflow/brand-profile.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useCopilotForm } from "@/context/CopilotFormContext";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Check,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Camera,
  Film,
  Square,
  Aperture,
  Newspaper,
  Users,
  Package,
  PaintBucket,
  Brush,
  Box,
} from "lucide-react";

type StepField =
  | "tone"
  | "style_keywords"
  | "visual_style"
  | "preferred_topics"
  | "target_audience"
  | "unique_selling_points"
  | "avoid"
  | "location_cue"
  | "image_style_preset";

/* Sprint 19 — image-style preset catalog (must mirror server
 * imageStylePresets.IMAGE_STYLE_PRESET_IDS). Icons are lucide placeholders
 * until thumbnail assets ship. */
type PresetId =
  | "photoreal"
  | "cinematic"
  | "minimalist"
  | "vintage"
  | "editorial"
  | "lifestyle"
  | "product-hero"
  | "flat-illustration"
  | "hand-drawn"
  | "3d-render";

const PRESET_OPTIONS: Array<{
  id: PresetId;
  label: string;
  short: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "photoreal", label: "Photorealistic", short: "Real photography, natural lighting", Icon: Camera },
  { id: "cinematic", label: "Cinematic", short: "Film-style, dramatic lighting", Icon: Film },
  { id: "minimalist", label: "Minimalist", short: "Single subject, clean background", Icon: Square },
  { id: "vintage", label: "Vintage", short: "Retro film tones, warm grain", Icon: Aperture },
  { id: "editorial", label: "Editorial", short: "Magazine photography, sharp focus", Icon: Newspaper },
  { id: "lifestyle", label: "Lifestyle", short: "Candid, real people in setting", Icon: Users },
  { id: "product-hero", label: "Product hero", short: "Studio shot, dramatic shadow", Icon: Package },
  { id: "flat-illustration", label: "Flat illustration", short: "Modern flat graphic style", Icon: PaintBucket },
  { id: "hand-drawn", label: "Hand-drawn", short: "Sketch / watercolor illustration", Icon: Brush },
  { id: "3d-render", label: "3D render", short: "Stylized 3D, isometric framing", Icon: Box },
];
const PRESET_IDS: ReadonlySet<string> = new Set(PRESET_OPTIONS.map((p) => p.id));

interface Opt {
  value: string;
  label: string;
  hint?: string;
}

interface Step {
  field: StepField;
  kind: "single" | "multi" | "text" | "preset";
  title: string;
  subtitle: string;
  options?: Opt[];
  placeholder?: string;
  optional?: boolean;
}

/* The questionnaire. Each step is one question; every answer is a button,
 * a chip, or (for the service area only) a single short input. */
const STEPS: Step[] = [
  {
    field: "tone",
    kind: "single",
    title: "What tone should your content have?",
    subtitle: "This shapes how every article and post is written.",
    options: [
      { value: "professional", label: "Professional", hint: "Polished and credible" },
      { value: "friendly", label: "Friendly", hint: "Warm and approachable" },
      { value: "premium", label: "Premium", hint: "Upscale and refined" },
      { value: "casual", label: "Casual", hint: "Relaxed and conversational" },
    ],
  },
  {
    field: "style_keywords",
    kind: "multi",
    title: "How should your articles read?",
    subtitle: "Pick the writing styles that fit your business. Choose any.",
    options: [
      { value: "clear and simple", label: "Clear & simple" },
      { value: "detailed and thorough", label: "Detailed & thorough" },
      { value: "conversational", label: "Conversational" },
      { value: "authoritative and expert", label: "Authoritative & expert" },
      { value: "educational", label: "Educational" },
      { value: "locally focused", label: "Locally focused" },
      { value: "warm and personal", label: "Warm & personal" },
      { value: "action-oriented", label: "Action-oriented" },
    ],
  },
  {
    field: "visual_style",
    kind: "single",
    title: "What should your images look like?",
    subtitle: "Sets the look of AI-generated photos for posts.",
    options: [
      { value: "realistic job-site photography", label: "Realistic job-site photos", hint: "Real work, real settings" },
      { value: "bright, clean and professional", label: "Bright, clean & professional", hint: "Crisp and polished" },
      { value: "warm, friendly lifestyle imagery", label: "Warm lifestyle imagery", hint: "People-focused and inviting" },
      { value: "bold, modern graphic style", label: "Bold, modern graphics", hint: "Eye-catching and contemporary" },
    ],
  },
  {
    field: "preferred_topics",
    kind: "multi",
    title: "What should your content focus on?",
    subtitle: "ContentFlow will lean toward these topics. Choose any.",
    options: [
      { value: "maintenance tips", label: "Maintenance tips" },
      { value: "how-to guides", label: "How-to guides" },
      { value: "seasonal advice", label: "Seasonal advice" },
      { value: "pricing and cost transparency", label: "Pricing & cost transparency" },
      { value: "emergency preparedness", label: "Emergency preparedness" },
      { value: "customer success stories", label: "Customer success stories" },
      { value: "behind-the-scenes", label: "Behind-the-scenes" },
      { value: "safety advice", label: "Safety advice" },
      { value: "common mistakes to avoid", label: "Common mistakes to avoid" },
    ],
  },
  {
    field: "target_audience",
    kind: "single",
    title: "Who is your content for?",
    subtitle: "Helps the AI pitch the content at the right reader.",
    options: [
      { value: "homeowners", label: "Homeowners" },
      { value: "property managers and landlords", label: "Property managers & landlords" },
      { value: "commercial and business clients", label: "Commercial & business clients" },
      { value: "a mix of residential and commercial customers", label: "A mix of both" },
    ],
  },
  {
    field: "unique_selling_points",
    kind: "multi",
    title: "What makes your business stand out?",
    subtitle: "ContentFlow will work these into your content. Choose any.",
    options: [
      { value: "licensed and insured", label: "Licensed & insured" },
      { value: "family-owned and operated", label: "Family-owned" },
      { value: "fast, same-day service", label: "Fast / same-day service" },
      { value: "24/7 emergency availability", label: "24/7 emergency availability" },
      { value: "upfront, transparent pricing", label: "Upfront, transparent pricing" },
      { value: "workmanship warranty", label: "Workmanship warranty" },
      { value: "locally owned", label: "Locally owned" },
      { value: "eco-friendly options", label: "Eco-friendly options" },
      { value: "experienced, certified technicians", label: "Experienced, certified team" },
    ],
  },
  {
    field: "avoid",
    kind: "multi",
    title: "Anything the AI should avoid?",
    subtitle: "Optional — pick anything you never want in your content.",
    optional: true,
    options: [
      { value: "slang", label: "Slang" },
      { value: "hype and exaggeration", label: "Hype & exaggeration" },
      { value: "technical jargon", label: "Technical jargon" },
      { value: "hard-sell language", label: "Hard-sell language" },
      { value: "jokes and humor", label: "Jokes & humor" },
      { value: "emojis", label: "Emojis" },
      { value: "negative talk about competitors", label: "Knocking competitors" },
    ],
  },
  {
    field: "location_cue",
    kind: "text",
    title: "What's your service area?",
    subtitle: "Optional — used to keep content locally relevant.",
    optional: true,
    placeholder: "e.g. Portland, Oregon and nearby suburbs",
  },
  {
    field: "image_style_preset",
    kind: "preset",
    title: "Pick a default image style",
    subtitle:
      "Optional — sets the visual direction for every AI-generated image. You can still override per post.",
    optional: true,
  },
];

type Answers = Record<StepField, string | string[]>;

function emptyAnswers(): Answers {
  return {
    tone: "",
    style_keywords: [],
    visual_style: "",
    preferred_topics: [],
    target_audience: "",
    unique_selling_points: [],
    avoid: [],
    location_cue: "",
    image_style_preset: "",
  };
}

export default function PortalContentPreferences() {
  usePageTitle("Content Style");
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<Answers>(emptyAnswers());
  const [done, setDone] = useState(false);

  const { data, isLoading } = useQuery<{ brand_profile: Record<string, any> }>({
    queryKey: ["/api/portal/contentflow/brand-profile"],
    queryFn: async () => {
      const res = await fetch("/api/portal/contentflow/brand-profile", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load preferences: ${res.status}`);
      return res.json();
    },
  });

  // Prefill the questionnaire from the saved brand profile.
  useEffect(() => {
    if (!data?.brand_profile) return;
    const bp = data.brand_profile;
    const usp = typeof bp.unique_selling_points === "string"
      ? bp.unique_selling_points.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];
    setAnswers({
      tone: typeof bp.tone === "string" ? bp.tone : "",
      style_keywords: Array.isArray(bp.style_keywords) ? bp.style_keywords : [],
      visual_style: typeof bp.visual_style === "string" ? bp.visual_style : "",
      preferred_topics: Array.isArray(bp.preferred_topics) ? bp.preferred_topics : [],
      target_audience: typeof bp.target_audience === "string" ? bp.target_audience : "",
      unique_selling_points: usp,
      avoid: Array.isArray(bp.avoid) ? bp.avoid : [],
      location_cue: typeof bp.location_cue === "string" ? bp.location_cue : "",
      image_style_preset:
        typeof bp.image_style_preset === "string" && PRESET_IDS.has(bp.image_style_preset)
          ? bp.image_style_preset
          : "",
    });
  }, [data]);

  /* Industry-default suggestion for the preset step (Sprint 19). */
  const { data: presetMeta } = useQuery<{ industry_default: PresetId; trade_type: string | null }>({
    queryKey: ["/api/portal/contentflow/image-style-presets"],
    queryFn: async () => {
      const res = await fetch("/api/portal/contentflow/image-style-presets", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load presets: ${res.status}`);
      return res.json();
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        tone: answers.tone || undefined,
        style_keywords: answers.style_keywords,
        visual_style: answers.visual_style || undefined,
        preferred_topics: answers.preferred_topics,
        target_audience: answers.target_audience || undefined,
        // Stored as a single string on the brand profile.
        unique_selling_points: (answers.unique_selling_points as string[]).join(", ") || undefined,
        avoid: answers.avoid,
        location_cue: (answers.location_cue as string).trim() || undefined,
        image_style_preset: (answers.image_style_preset as string) || undefined,
      };
      const res = await apiRequest("PATCH", "/api/portal/contentflow/brand-profile", payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/portal/contentflow/brand-profile"] });
      setDone(true);
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Couldn't save", description: e?.message || "Please try again." });
    },
  });

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  function setSingle(value: string) {
    setAnswers((a) => ({ ...a, [step.field]: value }));
  }
  function toggleMulti(value: string) {
    setAnswers((a) => {
      const cur = (a[step.field] as string[]) || [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...a, [step.field]: next };
    });
  }

  function stepAnswered(s: Step): boolean {
    const v = answers[s.field];
    if (s.optional) return true;
    if (s.kind === "multi") return Array.isArray(v) && v.length > 0;
    return typeof v === "string" && v.trim().length > 0;
  }

  /* Phase 1c: register the content-preferences questionnaire with the
   * copilot form registry. The AI proposes answers for every step at once;
   * single/multi values are validated against each step's option set, and
   * comma-separated strings drive the multi-select fields. */
  useCopilotForm({
    formLabel: "Content style",
    fields: STEPS.map((s) => ({
      key: s.field,
      label:
        s.kind === "multi"
          ? `${s.title} (comma-separated; allowed: ${(s.options ?? []).map((o) => o.value).join(", ")})`
          : s.kind === "single"
            ? `${s.title} (one of: ${(s.options ?? []).map((o) => o.value).join(", ")})`
            : s.kind === "preset"
              ? `${s.title} (one of: ${PRESET_OPTIONS.map((p) => p.id).join(", ")})`
              : s.title,
      required: !s.optional,
    })),
    values: answers as unknown as Record<string, unknown>,
    onApply: (fills) => {
      setAnswers((prev) => {
        const next = { ...prev };
        for (const fill of fills) {
          const s = STEPS.find((st) => st.field === fill.field_key);
          if (!s) continue;
          if (s.kind === "text") {
            next[s.field] = fill.value;
          } else if (s.kind === "preset") {
            if (PRESET_IDS.has(fill.value)) next[s.field] = fill.value;
          } else if (s.kind === "single") {
            const allowed = new Set((s.options ?? []).map((o) => o.value));
            if (allowed.has(fill.value)) next[s.field] = fill.value;
          } else {
            const allowed = new Set((s.options ?? []).map((o) => o.value));
            const picked = fill.value
              .split(",")
              .map((v) => v.trim())
              .filter((v) => allowed.has(v));
            if (picked.length > 0) next[s.field] = Array.from(new Set(picked));
          }
        }
        return next;
      });
    },
  });

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PortalLayout>
    );
  }

  if (done) {
    return (
      <PortalLayout>
        <div className="max-w-xl text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-6 w-6 text-emerald-600" />
          </div>
          <h1 className="text-xl font-semibold">Your content style is set</h1>
          <p className="text-sm text-muted-foreground mt-2">
            ContentFlow will use these preferences for every article, post, and image it
            creates for you. You can change them anytime from this page.
          </p>
          <div className="flex justify-center gap-2 mt-6">
            <Button variant="outline" onClick={() => { setDone(false); setStepIdx(0); }}>
              Review answers
            </Button>
            <Button onClick={() => navigate("/portal/articles")}>Go to Content</Button>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="max-w-xl">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-4 w-4 text-brand-blue-500" />
          <h1 className="text-lg font-semibold">Content style</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Tell ContentFlow how your content should look and sound. Takes about a minute.
        </p>

        {/* Progress */}
        <div className="mb-5">
          <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-brand-blue-500 transition-all"
              style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            Step {stepIdx + 1} of {STEPS.length}
          </p>
        </div>

        <Card className="p-5">
          <h2 className="text-base font-semibold">{step.title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5 mb-4">{step.subtitle}</p>

          {step.kind === "single" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {step.options!.map((o) => {
                const selected = answers[step.field] === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setSingle(o.value)}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      selected
                        ? "border-brand-blue-500 bg-brand-blue-50 ring-1 ring-brand-blue-500"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="text-sm font-medium">{o.label}</div>
                    {o.hint && <div className="text-xs text-muted-foreground mt-0.5">{o.hint}</div>}
                  </button>
                );
              })}
            </div>
          )}

          {step.kind === "multi" && (
            <div className="flex flex-wrap gap-2">
              {step.options!.map((o) => {
                const selected = (answers[step.field] as string[]).includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggleMulti(o.value)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      selected
                        ? "border-brand-blue-500 bg-brand-blue-500 text-white"
                        : "border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          )}

          {step.kind === "text" && (
            <Input
              value={answers[step.field] as string}
              placeholder={step.placeholder}
              maxLength={200}
              onChange={(e) => setAnswers((a) => ({ ...a, [step.field]: e.target.value }))}
            />
          )}

          {step.kind === "preset" && (
            <>
              {presetMeta?.industry_default && !(answers.image_style_preset as string) && (
                <p className="text-xs text-muted-foreground mb-3">
                  Suggested for your business:{" "}
                  <span className="font-medium text-foreground">
                    {PRESET_OPTIONS.find((p) => p.id === presetMeta.industry_default)?.label}
                  </span>
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PRESET_OPTIONS.map((p) => {
                  const selected = (answers.image_style_preset as string) === p.id;
                  const isSuggested =
                    !(answers.image_style_preset as string) &&
                    presetMeta?.industry_default === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setAnswers((a) => ({
                          ...a,
                          image_style_preset: selected ? "" : p.id,
                        }))
                      }
                      className={`text-left rounded-lg border p-3 transition-colors ${
                        selected
                          ? "border-brand-blue-500 bg-brand-blue-50 ring-1 ring-brand-blue-500"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                      data-testid={`button-image-style-${p.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <p.Icon className="h-4 w-4 text-muted-foreground" />
                        <div className="text-sm font-medium">{p.label}</div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{p.short}</div>
                      {isSuggested && (
                        <div className="text-[10px] uppercase tracking-wide text-brand-blue-500 mt-1">
                          Suggested
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        {/* Nav */}
        <div className="flex items-center justify-between mt-4">
          <Button
            variant="ghost"
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            disabled={stepIdx === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>

          {isLast ? (
            <Button onClick={() => save.mutate()} disabled={!stepAnswered(step) || save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Save preferences
            </Button>
          ) : (
            <Button
              onClick={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}
              disabled={!stepAnswered(step)}
            >
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}
