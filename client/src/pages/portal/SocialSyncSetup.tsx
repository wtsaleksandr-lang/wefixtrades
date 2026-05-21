import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowRight, ArrowLeft, CheckCircle, Link2, AlertTriangle } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import BackButton from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";

const STEPS = ["Business", "Services", "Preferences", "Connect", "Review"];

const TONES = [
  { value: "professional", label: "Professional — clean and trustworthy" },
  { value: "friendly", label: "Friendly — warm and approachable" },
  { value: "casual", label: "Casual — relaxed and conversational" },
  { value: "authoritative", label: "Authoritative — expert and confident" },
];

const FREQUENCIES = [
  { value: "daily", label: "Daily (7 posts/week)" },
  { value: "3_per_week", label: "3x per week (recommended)" },
  { value: "2_per_week", label: "2x per week" },
  { value: "weekly", label: "Weekly (1 post/week)" },
];

export default function SocialSyncSetup() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = useState(0);

  const [form, setForm] = useState({
    niche: "",
    location: "",
    services: "",
    service_focus: "",
    tone: "professional",
    frequency: "3_per_week",
    platform_preferences: ["facebook", "instagram"],
  });

  // Check if profile already exists — pre-fill if editing
  const { data: existingProfile } = useQuery<any>({
    queryKey: ["/api/portal/socialsync-profile"],
    retry: false,
  });

  // Pre-fill form when existing profile loads
  const [prefilled, setPrefilled] = useState(false);
  if (existingProfile && existingProfile.niche && !prefilled) {
    setForm({
      niche: existingProfile.niche || "",
      location: existingProfile.location || "",
      services: Array.isArray(existingProfile.services) ? existingProfile.services.join(", ") : "",
      service_focus: Array.isArray(existingProfile.service_focus) ? existingProfile.service_focus.join(", ") : "",
      tone: existingProfile.tone || "professional",
      frequency: existingProfile.frequency || "3_per_week",
      platform_preferences: Array.isArray(existingProfile.platform_preferences) ? existingProfile.platform_preferences : ["facebook", "instagram"],
    });
    setPrefilled(true);
  }

  const isEditing = !!(existingProfile && existingProfile.niche);

  // Check platform connections
  const { data: fbStatus } = useQuery<any>({ queryKey: ["/api/portal/socialsync-connections/facebook"], retry: false });
  const { data: igStatus } = useQuery<any>({ queryKey: ["/api/portal/socialsync-connections/instagram"], retry: false });
  const { data: gbpStatus } = useQuery<any>({ queryKey: ["/api/portal/socialsync-connections/google_business"], retry: false });

  const saveProfile = useMutation({
    mutationFn: async () => {
      // Use admin endpoint if available, otherwise portal endpoint
      const res = await apiRequest("POST", "/api/portal/socialsync-setup", {
        niche: form.niche,
        location: form.location,
        services: form.services.split(",").map(s => s.trim()).filter(Boolean),
        service_focus: form.service_focus ? form.service_focus.split(",").map(s => s.trim()).filter(Boolean) : null,
        tone: form.tone,
        frequency: form.frequency,
        platform_preferences: form.platform_preferences,
        enabled: true,
        autopilot: false,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/socialsync-profile"] });
      toast({ title: isEditing ? "Settings updated!" : "SocialSync setup complete!" });
      navigate("/portal/socialsync");
    },
    onError: () => toast({ title: "Setup failed", variant: "destructive" }),
  });

  const canProceed = () => {
    switch (step) {
      case 0: return form.niche.trim().length > 0 && form.location.trim().length > 0;
      case 1: return form.services.trim().length > 0;
      case 2: return form.platform_preferences.length > 0; // Must select at least 1 platform
      case 3: return true; // Connections are optional
      case 4: return true; // Review step
      default: return false;
    }
  };

  const platformsConnected = [
    fbStatus?.connected && "Facebook",
    igStatus?.connected && "Instagram",
    gbpStatus?.connected && "Google Business",
  ].filter(Boolean);

  /* Phase 1c: register the whole SocialSync setup wizard with the copilot.
   * The wizard is multi-step but state is one `form` object, so we register
   * every field at once regardless of the current step. */
  const VALID_TONES = TONES.map((t) => t.value);
  const VALID_FREQUENCIES = FREQUENCIES.map((f) => f.value);
  const VALID_PLATFORMS = ["facebook", "instagram", "google_business"];
  useCopilotForm({
    formLabel: "SocialSync setup",
    fields: [
      { key: "niche", label: "Business type / niche", required: true },
      { key: "location", label: "Service area / location", required: true },
      { key: "services", label: "Services offered (comma-separated)", required: true },
      { key: "service_focus", label: "Services to emphasize (comma-separated, optional)" },
      { key: "tone", label: `Tone (one of: ${VALID_TONES.join(", ")})` },
      { key: "frequency", label: `Posting frequency (one of: ${VALID_FREQUENCIES.join(", ")})` },
      {
        key: "platform_preferences",
        label: `Platforms (comma-separated; allowed: ${VALID_PLATFORMS.join(", ")})`,
      },
    ],
    values: {
      niche: form.niche,
      location: form.location,
      services: form.services,
      service_focus: form.service_focus,
      tone: form.tone,
      frequency: form.frequency,
      platform_preferences: form.platform_preferences.join(", "),
    },
    onApply: (fills) => {
      setForm((f) => {
        const next = { ...f };
        for (const fill of fills) {
          switch (fill.field_key) {
            case "niche": next.niche = fill.value; break;
            case "location": next.location = fill.value; break;
            case "services": next.services = fill.value; break;
            case "service_focus": next.service_focus = fill.value; break;
            case "tone":
              if (VALID_TONES.includes(fill.value)) next.tone = fill.value;
              break;
            case "frequency":
              if (VALID_FREQUENCIES.includes(fill.value)) next.frequency = fill.value;
              break;
            case "platform_preferences": {
              const picked = fill.value
                .split(",")
                .map((p) => p.trim())
                .filter((p) => VALID_PLATFORMS.includes(p));
              if (picked.length > 0) next.platform_preferences = Array.from(new Set(picked));
              break;
            }
          }
        }
        return next;
      });
    },
  });

  return (
    <PortalLayout>
      <div className="max-w-xl mx-auto p-4 space-y-5">
        <BackButton to="/portal/socialsync" label="Back to Social Media" />
        {/* Header */}
        <div>
          <h1 className="text-lg font-bold text-gray-900">{isEditing ? "Edit SocialSync Settings" : "Set Up SocialSync"}</h1>
          <p className="text-sm text-gray-500">{isEditing ? "Update your preferences and we'll adjust your content." : "Tell us about your business so we can create the right content for you."}</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-[#0d3cfc]" : "bg-gray-200"}`} />
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 text-center">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>

        {/* Step content */}
        <Card className="p-5">
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">About your business</h2>
              <p className="text-xs text-gray-500">This helps us write content that sounds like you, not generic AI.</p>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">What type of business are you?</label>
                <Input value={form.niche} onChange={e => setForm({ ...form, niche: e.target.value })} placeholder="e.g. Residential plumber, HVAC technician, Roofer" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Where do you operate?</label>
                <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Denver, CO or Greater Austin area" />
                <p className="text-[10px] text-gray-400 mt-1">We'll mention your service area naturally in posts to build local trust.</p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">Your services</h2>
              <p className="text-xs text-gray-500">List the services you offer. We'll create content around these.</p>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Services you offer (comma-separated)</label>
                <Input value={form.services} onChange={e => setForm({ ...form, services: e.target.value })} placeholder="e.g. Drain cleaning, Water heater repair, Pipe replacement" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Services to emphasize (optional)</label>
                <Input value={form.service_focus} onChange={e => setForm({ ...form, service_focus: e.target.value })} placeholder="e.g. Emergency plumbing, Leak repair" />
                <p className="text-[10px] text-gray-400 mt-1">If some services are more important to promote, list them here.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">Content preferences</h2>
              <p className="text-xs text-gray-500">Set the tone and frequency for your posts.</p>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Tone of voice</label>
                <Select value={form.tone} onValueChange={v => setForm({ ...form, tone: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TONES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Posting frequency</label>
                <Select value={form.frequency} onValueChange={v => setForm({ ...form, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Platforms</label>
                <div className="flex gap-2 flex-wrap">
                  {["facebook", "instagram", "google_business"].map(p => {
                    const selected = form.platform_preferences.includes(p);
                    const label = p === "google_business" ? "Google Business" : p.charAt(0).toUpperCase() + p.slice(1);
                    return (
                      <button key={p} type="button"
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${selected ? "bg-[#0d3cfc] text-white border-[#0d3cfc]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}
                        onClick={() => setForm({
                          ...form,
                          platform_preferences: selected
                            ? form.platform_preferences.filter(x => x !== p)
                            : [...form.platform_preferences, p],
                        })}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {form.platform_preferences.length === 0 && (
                  <p className="text-xs text-red-500 mt-1">Please select at least one platform to continue.</p>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">Connect your accounts</h2>
              <p className="text-xs text-gray-500">We need access to post on your behalf. You can connect these now or later.</p>

              {[
                { platform: "Facebook", status: fbStatus, key: "facebook" },
                { platform: "Instagram", status: igStatus, key: "instagram" },
                { platform: "Google Business", status: gbpStatus, key: "google_business" },
              ].map(({ platform, status, key }) => (
                <div key={key} className={`flex items-center justify-between p-3 rounded-lg border ${status?.connected ? "border-emerald-200 bg-emerald-50" : "border-gray-200"}`}>
                  <div className="flex items-center gap-2">
                    {status?.connected
                      ? <CheckCircle className="w-4 h-4 text-emerald-500" />
                      : <Link2 className="w-4 h-4 text-gray-400" />
                    }
                    <span className="text-sm font-medium">{platform}</span>
                    {status?.connected && <span className="text-[10px] text-emerald-600">Connected</span>}
                  </div>
                  {!status?.connected && (
                    <span className="text-xs text-gray-400">Your team will connect this</span>
                  )}
                </div>
              ))}

              {platformsConnected.length === 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>No platforms connected yet. Your admin team will connect your accounts. You can complete setup now and connect later.</span>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">Review your setup</h2>
              <p className="text-xs text-gray-500">Here's what SocialSync will do for your business.</p>

              <div className="space-y-2">
                <ReviewRow label="Business" value={form.niche} />
                <ReviewRow label="Location" value={form.location} />
                <ReviewRow label="Services" value={form.services} />
                {form.service_focus && <ReviewRow label="Focus" value={form.service_focus} />}
                <ReviewRow label="Tone" value={form.tone} />
                <ReviewRow label="Frequency" value={form.frequency.replace(/_/g, " ")} />
                <ReviewRow label="Platforms" value={form.platform_preferences.map(p => p === "google_business" ? "Google Business" : p.charAt(0).toUpperCase() + p.slice(1)).join(", ")} />
                <ReviewRow label="Connected" value={platformsConnected.length > 0 ? platformsConnected.join(", ") : "None yet (admin will connect)"} />
              </div>

              <div className="p-3 bg-[#EEF3FF] rounded-lg text-xs text-gray-700 space-y-1">
                <p className="font-medium text-[#0d3cfc]">What happens next:</p>
                <p>• AI will generate content tailored to your {form.niche} business in {form.location}</p>
                <p>• Posts will be scheduled and published automatically to your connected platforms</p>
                <p>• Every post is quality-checked for tone, relevance, and repetition before going live</p>
                <p>• We don't manage DMs, comments, or ads — just consistent, quality posting</p>
              </div>
            </div>
          )}
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button size="sm" className="bg-[#0d3cfc] hover:bg-[#0b34d6]" onClick={() => setStep(step + 1)} disabled={!canProceed()}>
              Next <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" className="bg-[#0d3cfc] hover:bg-[#0b34d6]" onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
              {saveProfile.isPending ? "Saving..." : isEditing ? "Save Changes" : "Complete Setup"}
            </Button>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-800 text-right max-w-[60%]">{value}</span>
    </div>
  );
}
