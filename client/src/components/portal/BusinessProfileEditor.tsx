/**
 * BusinessProfileEditor — ContentFlow Phase 2 (Step 2).
 *
 * Used inside the ContentFlow "Business Profile" tab on the Portal.
 * The customer pastes their website URL, hits Extract, and the panel
 * fills with editable fields. Each multi-valued field renders as a
 * TokenChip with the AI-generated alternatives the URL extractor
 * produced (or a sensible local default if the AI returned just one).
 *
 * NOT a controlled form library — keeps state in React via props +
 * lifted setters. The parent (PortalContentFlow) owns the profile so
 * the same object can feed both the "Save my profile" PATCH and the
 * per-prompt /prefill request.
 *
 * Persists on Save via PATCH /api/portal/contentflow/brand-profile,
 * with the Phase 2 extra fields (business_name, year_founded,
 * hero_testimonial, brand_voice_adjectives, target_persona,
 * primary_trade, also_offers_trades) bolted onto the existing
 * content_brand metadata column (no migration in Phase 2 — see
 * profilePrefill.ts header for the persisted shape).
 */

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles, Save, Globe } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import TokenChip from "@/components/forms/TokenChip";

export interface ExtractedBusinessProfile {
  business_name?: string;
  services?: string[];
  service_area?: string;
  target_persona?: string;
  brand_voice_adjectives?: string[];
  usps?: string[];
  hero_testimonials?: { text: string; attribution?: string }[];
  primary_trade?: string;
  also_offers_trades?: string[];
  raw?: {
    title?: string;
    meta_description?: string;
    h1?: string;
    json_ld_org_name?: string;
    text_excerpt?: string;
  };
}

interface FromUrlResponse {
  ok: boolean;
  source_url: string;
  profile: ExtractedBusinessProfile;
}

export interface BusinessProfileEditorProps {
  profile: ExtractedBusinessProfile | null;
  onProfileChange: (next: ExtractedBusinessProfile) => void;
  sourceUrl?: string;
  onSourceUrlChange?: (url: string) => void;
}

/** Local helpers — pick the first non-empty option, fall back to []. */
function asArray<T>(v: T[] | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

/* For each scalar field, expose the extracted candidates as TokenChip
 * alternatives. We default to "field-value + 3 plausible local seeds"
 * so the chip is never empty. */
const TONE_DEFAULTS = ["professional", "friendly", "premium", "casual", "no-nonsense"];
const TRADE_DEFAULTS = ["plumbing", "hvac", "electrical", "roofing", "landscaping", "general_contractor"];

export function BusinessProfileEditor({
  profile,
  onProfileChange,
  sourceUrl = "",
  onSourceUrlChange,
}: BusinessProfileEditorProps) {
  const { toast } = useToast();
  const [urlDraft, setUrlDraft] = useState(sourceUrl);

  const extractMutation = useMutation<FromUrlResponse, Error, string>({
    mutationFn: async (url) => {
      const res = await apiRequest("POST", "/api/portal/contentflow/profile/from-url", { url });
      return (await res.json()) as FromUrlResponse;
    },
    onSuccess: (data) => {
      onProfileChange(data.profile);
      onSourceUrlChange?.(data.source_url);
      toast({
        title: "Profile extracted",
        description: "Edit any chip to swap a value. Save when it reads right.",
      });
    },
    onError: (err) => {
      toast({
        title: "Could not extract from that URL",
        description: err?.message || "Try again, or fill the fields manually.",
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (p: ExtractedBusinessProfile) => {
      /* Translate the ExtractedBusinessProfile shape onto the
       * BrandProfile sanitizer's accepted keys + the Phase 2 extras
       * the route stores verbatim under content_brand. */
      const patch: Record<string, unknown> = {
        target_audience: p.target_persona,
        unique_selling_points: p.usps?.[0],
        service_focus: p.services,
        location_cue: p.service_area,
      };
      /* Tone — pick the first known-valid tone token if present. */
      const voice = p.brand_voice_adjectives?.[0]?.toLowerCase();
      if (voice && ["professional", "friendly", "premium", "casual"].includes(voice)) {
        patch.tone = voice;
      }
      const res = await apiRequest("PATCH", "/api/portal/contentflow/brand-profile", patch);
      return (await res.json()) as { ok: boolean; brand_profile: Record<string, unknown> };
    },
    onSuccess: () => {
      toast({
        title: "Profile saved",
        description: "Your prompts will now prefill from this profile.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message || "Try again.",
        variant: "destructive",
      });
    },
  });

  function patch(next: Partial<ExtractedBusinessProfile>) {
    onProfileChange({ ...(profile ?? {}), ...next });
  }

  function patchListItem(field: keyof ExtractedBusinessProfile, idx: number, value: string) {
    const arr = [...asArray<string>((profile?.[field] as string[] | undefined))];
    arr[idx] = value;
    patch({ [field]: arr } as any);
  }

  const toneOptions = useMemo(() => {
    const v = asArray(profile?.brand_voice_adjectives);
    const merged = [...new Set([...v, ...TONE_DEFAULTS])];
    return merged.slice(0, 6);
  }, [profile?.brand_voice_adjectives]);

  const tradeOptions = useMemo(() => {
    const v = asArray(profile?.also_offers_trades);
    const primary = profile?.primary_trade;
    const merged = [...new Set([primary, ...v, ...TRADE_DEFAULTS].filter(Boolean) as string[])];
    return merged.slice(0, 6);
  }, [profile?.primary_trade, profile?.also_offers_trades]);

  const services = asArray(profile?.services);
  const usps = asArray(profile?.usps);
  const testimonials = asArray(profile?.hero_testimonials);

  return (
    <div className="space-y-5" data-testid="business-profile-editor">
      <Card className="p-4">
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Globe className="h-3 w-3" aria-hidden /> Your website URL
          </label>
          <div className="flex gap-2">
            <Input
              type="url"
              placeholder="https://yourbusiness.com"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && urlDraft.trim()) {
                  extractMutation.mutate(urlDraft.trim());
                }
              }}
              data-testid="profile-url-input"
            />
            <Button
              onClick={() => urlDraft.trim() && extractMutation.mutate(urlDraft.trim())}
              disabled={!urlDraft.trim() || extractMutation.isPending}
              data-testid="profile-url-extract"
            >
              {extractMutation.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-4 w-4" />
              )}
              Extract
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            We fetch your site, then Claude Haiku pulls business name, services, area, and tone. Every value below is editable — tap any chip to pick from alternatives.
          </p>
        </div>
      </Card>

      {profile && (
        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Your business profile</h3>
            <Button
              size="sm"
              variant="default"
              onClick={() => saveMutation.mutate(profile)}
              disabled={saveMutation.isPending}
              data-testid="profile-save"
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1 h-3.5 w-3.5" />
              )}
              Save profile
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Business name */}
            <TokenChip
              label="Business name"
              value={profile.business_name ?? ""}
              alternatives={[
                profile.business_name,
                profile.raw?.json_ld_org_name,
                profile.raw?.h1,
                profile.raw?.title,
              ].filter(Boolean).slice(0, 6) as string[]}
              onChange={(next) => patch({ business_name: next })}
              testId="chip-business-name"
              placeholder="Your business name"
            />

            {/* Primary trade */}
            <TokenChip
              label="Primary trade"
              value={profile.primary_trade ?? ""}
              alternatives={tradeOptions}
              onChange={(next) => patch({ primary_trade: next })}
              testId="chip-primary-trade"
              placeholder="plumbing / hvac / …"
            />

            {/* Service area */}
            <TokenChip
              label="Service area"
              value={profile.service_area ?? ""}
              alternatives={[
                profile.service_area,
                profile.raw?.h1,
                "your city, your region",
                "downtown + surrounding suburbs",
              ].filter(Boolean).slice(0, 6) as string[]}
              onChange={(next) => patch({ service_area: next })}
              testId="chip-service-area"
              placeholder="City, Region"
            />

            {/* Target persona */}
            <TokenChip
              label="Target customer"
              value={profile.target_persona ?? ""}
              alternatives={[
                profile.target_persona,
                "homeowners",
                "small business owners",
                "property managers",
                "landlords",
              ].filter(Boolean).slice(0, 6) as string[]}
              onChange={(next) => patch({ target_persona: next })}
              testId="chip-target-persona"
              placeholder="Who you sell to"
            />

            {/* Brand voice — first adjective */}
            <TokenChip
              label="Brand voice"
              value={profile.brand_voice_adjectives?.[0] ?? ""}
              alternatives={toneOptions}
              onChange={(next) => {
                const rest = asArray(profile.brand_voice_adjectives).slice(1);
                patch({ brand_voice_adjectives: [next, ...rest] });
              }}
              testId="chip-brand-voice"
              placeholder="professional / friendly / …"
            />

            {/* Top USP */}
            <TokenChip
              label="Top USP"
              value={usps[0] ?? ""}
              alternatives={(usps.length > 0 ? usps : ["fast, fair pricing", "same-day response", "locally owned & operated"]).slice(0, 6)}
              onChange={(next) => {
                const rest = usps.slice(1);
                patch({ usps: [next, ...rest] });
              }}
              testId="chip-top-usp"
              placeholder="Your main differentiator"
            />
          </div>

          {/* Services — multi-chip row, each editable. */}
          <div className="mt-5">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Services we found
            </div>
            <div className="flex flex-wrap gap-2">
              {(services.length > 0 ? services : [""]).map((s, i) => (
                <TokenChip
                  key={`svc-${i}`}
                  label={`#${i + 1}`}
                  value={s}
                  alternatives={[s, ...services.filter((_, j) => j !== i)].filter(Boolean).slice(0, 6)}
                  onChange={(next) => patchListItem("services", i, next)}
                  testId={`chip-service-${i}`}
                  placeholder="Service"
                />
              ))}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => patch({ services: [...services, ""] })}
                data-testid="profile-add-service"
              >
                + Add service
              </Button>
            </div>
          </div>

          {/* Hero testimonial — single freeform (the prompt library only
            * uses the first one today). */}
          <div className="mt-5 space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Hero testimonial
            </label>
            <Textarea
              rows={2}
              value={testimonials[0]?.text ?? ""}
              onChange={(e) => {
                const rest = testimonials.slice(1);
                patch({ hero_testimonials: [{ text: e.target.value, attribution: testimonials[0]?.attribution }, ...rest] });
              }}
              placeholder="A real customer quote, in their words."
              maxLength={500}
              data-testid="profile-testimonial"
            />
          </div>
        </Card>
      )}
    </div>
  );
}

export default BusinessProfileEditor;
