import { usePageTitle } from "@/hooks/usePageTitle";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import { Loader2, Check, RefreshCw, KeyRound, AlertTriangle, Palette, X, Plus, Bell, Mail, MessageSquare } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  NOTIFICATION_CATEGORY_KEYS,
  NOTIFICATION_CATEGORY_LABELS,
  type NotificationPreferences,
  type NotificationCategoryKey,
} from "@shared/schema";

interface SettingsData {
  business_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  trade_type: string | null;
  account_email: string | null;
}

export default function PortalSettings() {
  usePageTitle("Settings");
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useQuery<SettingsData>({
    queryKey: ["/api/portal/settings"],
    queryFn: async () => {
      const res = await fetch("/api/portal/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
  });

  const { data: automationStatus } = useQuery<{ all_automation_paused: boolean }>({
    queryKey: ["/api/portal/automation-status"],
  });

  const pauseAllMutation = useMutation({
    mutationFn: async (paused: boolean) => {
      const res = await apiRequest("PATCH", "/api/portal/settings/automation", { all_automation_paused: paused });
      return res.json();
    },
    onSuccess: (_data, paused) => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/automation-status"] });
      toast({ title: paused ? "All automation paused" : "All automation resumed" });
    },
    onError: () => {
      toast({ title: "Failed to update automation setting", variant: "destructive" });
    },
  });

  const allPaused = automationStatus?.all_automation_paused || false;

  const [form, setForm] = useState({
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    website_url: "",
  });

  useEffect(() => {
    if (data) {
      setForm({
        contact_name: data.contact_name || "",
        contact_email: data.contact_email || "",
        contact_phone: data.contact_phone || "",
        website_url: data.website_url || "",
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (updates: typeof form) => {
      const res = await fetch("/api/portal/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/overview"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  const labelClass = "block text-xs font-medium text-gray-600 mb-1";
  const inputClass =
    "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/20 focus:border-[#2D6A4F] transition-colors";

  return (
    <PortalLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your contact information.</p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-4 text-sm flex items-center justify-between">
            <span>Failed to load settings.</span>
            <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}

        {data && (
          <>
            {/* Account info (read-only) */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Account</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Business Name</p>
                  <p className="text-gray-900 font-medium">{data.business_name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Login Email</p>
                  <p className="text-gray-900">{data.account_email || "-"}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Used to sign in — contact us to change</p>
                </div>
                {data.trade_type && (
                  <div>
                    <p className="text-xs text-gray-500">Trade</p>
                    <p className="text-gray-900 capitalize">{data.trade_type}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Contact info (editable) */}
            <form onSubmit={handleSubmit}>
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <h2 className="text-sm font-semibold text-gray-900">Contact Information</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Contact Name</label>
                    <input
                      className={inputClass}
                      value={form.contact_name}
                      onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Contact Email</label>
                    <input
                      type="email"
                      className={inputClass}
                      value={form.contact_email}
                      onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Phone</label>
                    <input
                      className={inputClass}
                      value={form.contact_phone}
                      onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Website</label>
                    <input
                      className={inputClass}
                      value={form.website_url}
                      onChange={(e) => setForm({ ...form, website_url: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="px-4 py-2 text-sm font-medium text-white bg-[#2D6A4F] rounded-lg hover:bg-[#1B4332] transition-colors disabled:opacity-60"
                  >
                    {saveMutation.isPending ? "Saving..." : "Save Changes"}
                  </button>
                  {saved && (
                    <span className="flex items-center gap-1 text-xs text-emerald-600">
                      <Check className="w-3.5 h-3.5" /> Saved
                    </span>
                  )}
                  {saveMutation.error && (
                    <span className="text-xs text-red-600">Failed to save. Try again.</span>
                  )}
                </div>
              </div>
            </form>

            {/* Pause All Automation */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-gray-900">Pause All Automation</h2>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex-1 pr-4">
                  <p className="text-sm text-gray-700">Emergency stop for all automated services</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Pauses SocialSync posting, ReputationShield auto-replies, and RankFlow article generation.
                  </p>
                </div>
                <Switch
                  checked={allPaused}
                  onCheckedChange={(checked) => pauseAllMutation.mutate(checked)}
                  disabled={pauseAllMutation.isPending}
                  className="data-[state=checked]:bg-amber-500"
                />
              </div>
              {allPaused && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <p className="text-sm text-amber-800">
                    All automated content creation and posting is paused. Your existing services remain active but no new content will be generated or published.
                  </p>
                </div>
              )}
            </div>

            {/* Notification Preferences */}
            <NotificationPreferencesSection />

            {/* Brand Voice */}
            <BrandProfileSection inputClass={inputClass} labelClass={labelClass} />

            {/* Change Password */}
            <ChangePasswordSection inputClass={inputClass} labelClass={labelClass} />
          </>
        )}
      </div>
    </PortalLayout>
  );
}

/* ─── Brand Profile Section ─── */

interface BrandProfile {
  tone?: string;
  style_keywords?: string[];
  avoid?: string[];
  location_cue?: string;
  service_focus?: string;
  visual_style?: string;
}

const TONE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "casual", label: "Casual" },
  { value: "premium", label: "Authoritative" },
];

function TagInput({
  tags,
  onAdd,
  onRemove,
  placeholder,
  inputClass,
}: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (index: number) => void;
  placeholder: string;
  inputClass: string;
}) {
  const [inputVal, setInputVal] = useState("");

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && inputVal.trim()) {
      e.preventDefault();
      const cleaned = inputVal.trim().replace(/,$/g, "");
      if (cleaned && !tags.includes(cleaned)) {
        onAdd(cleaned);
      }
      setInputVal("");
    }
    if (e.key === "Backspace" && !inputVal && tags.length > 0) {
      onRemove(tags.length - 1);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {tags.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full border border-gray-200"
          >
            {tag}
            <button type="button" onClick={() => onRemove(i)} className="hover:text-red-500 ml-0.5">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        className={inputClass}
        placeholder={placeholder}
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

function BrandProfileSection({ inputClass, labelClass }: { inputClass: string; labelClass: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [brandSaved, setBrandSaved] = useState(false);

  const { data: brandData, isLoading: brandLoading } = useQuery<{ brand_profile: BrandProfile }>({
    queryKey: ["/api/portal/contentflow/brand-profile"],
    queryFn: async () => {
      const res = await fetch("/api/portal/contentflow/brand-profile", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load brand profile");
      return res.json();
    },
  });

  const [brandForm, setBrandForm] = useState<{
    tone: string;
    style_keywords: string[];
    avoid: string[];
    service_focus: string;
    location_cue: string;
  }>({
    tone: "professional",
    style_keywords: [],
    avoid: [],
    service_focus: "",
    location_cue: "",
  });

  useEffect(() => {
    if (brandData?.brand_profile) {
      const bp = brandData.brand_profile;
      setBrandForm({
        tone: bp.tone || "professional",
        style_keywords: bp.style_keywords || [],
        avoid: bp.avoid || [],
        service_focus: Array.isArray(bp.service_focus)
          ? (bp.service_focus as unknown as string[]).join(", ")
          : bp.service_focus || "",
        location_cue: bp.location_cue || "",
      });
    }
  }, [brandData]);

  const brandSaveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = {
        tone: brandForm.tone,
        style_keywords: brandForm.style_keywords,
        avoid: brandForm.avoid,
        location_cue: brandForm.location_cue || undefined,
      };
      // Parse service_focus as a comma-separated list
      if (brandForm.service_focus.trim()) {
        payload.service_focus = brandForm.service_focus
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        payload.service_focus = [];
      }
      const res = await apiRequest("PATCH", "/api/portal/contentflow/brand-profile", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/contentflow/brand-profile"] });
      setBrandSaved(true);
      toast({ title: "Brand profile saved" });
      setTimeout(() => setBrandSaved(false), 2000);
    },
    onError: () => {
      toast({ title: "Failed to save brand profile", variant: "destructive" });
    },
  });

  const addStyleKeyword = useCallback((tag: string) => {
    setBrandForm((prev) => ({ ...prev, style_keywords: [...prev.style_keywords, tag] }));
  }, []);

  const removeStyleKeyword = useCallback((index: number) => {
    setBrandForm((prev) => ({
      ...prev,
      style_keywords: prev.style_keywords.filter((_, i) => i !== index),
    }));
  }, []);

  const addAvoidWord = useCallback((tag: string) => {
    setBrandForm((prev) => ({ ...prev, avoid: [...prev.avoid, tag] }));
  }, []);

  const removeAvoidWord = useCallback((index: number) => {
    setBrandForm((prev) => ({
      ...prev,
      avoid: prev.avoid.filter((_, i) => i !== index),
    }));
  }, []);

  if (brandLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Palette className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">Brand Voice</h2>
        </div>
        <div className="flex items-center justify-center h-24">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Palette className="w-4 h-4 text-[#2D6A4F]" />
        <h2 className="text-sm font-semibold text-gray-900">Brand Voice</h2>
      </div>
      <p className="text-xs text-gray-500">
        Shape how AI generates content for your business. These preferences guide the tone, style, and focus of articles, social posts, and emails.
      </p>

      <div className="space-y-4">
        {/* Tone selector */}
        <div>
          <label className={labelClass}>Tone</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TONE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBrandForm({ ...brandForm, tone: opt.value })}
                className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  brandForm.tone === opt.value
                    ? "bg-[#2D6A4F] text-white border-[#2D6A4F]"
                    : "bg-white text-gray-700 border-gray-200 hover:border-[#2D6A4F]/40"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Style keywords */}
        <div>
          <label className={labelClass}>Style Keywords</label>
          <p className="text-[10px] text-gray-400 mb-1">
            Words that describe your brand (e.g. "reliable", "family-owned", "modern"). Press Enter or comma to add.
          </p>
          <TagInput
            tags={brandForm.style_keywords}
            onAdd={addStyleKeyword}
            onRemove={removeStyleKeyword}
            placeholder="Add a keyword..."
            inputClass={inputClass}
          />
        </div>

        {/* Avoid list */}
        <div>
          <label className={labelClass}>Avoid List</label>
          <p className="text-[10px] text-gray-400 mb-1">
            Words or phrases AI should never use in your content.
          </p>
          <TagInput
            tags={brandForm.avoid}
            onAdd={addAvoidWord}
            onRemove={removeAvoidWord}
            placeholder="Add a word to avoid..."
            inputClass={inputClass}
          />
        </div>

        {/* Service focus */}
        <div>
          <label className={labelClass}>Service Focus</label>
          <p className="text-[10px] text-gray-400 mb-1">
            Comma-separated list of your primary services (e.g. "drain cleaning, water heater repair").
          </p>
          <input
            className={inputClass}
            value={brandForm.service_focus}
            onChange={(e) => setBrandForm({ ...brandForm, service_focus: e.target.value })}
            placeholder="drain cleaning, water heater repair, pipe relining"
          />
        </div>

        {/* Location cue */}
        <div>
          <label className={labelClass}>Location Cue</label>
          <p className="text-[10px] text-gray-400 mb-1">
            Your service area for local SEO (e.g. "Hamilton, Ontario suburbs").
          </p>
          <input
            className={inputClass}
            value={brandForm.location_cue}
            onChange={(e) => setBrandForm({ ...brandForm, location_cue: e.target.value })}
            placeholder="e.g. Hamilton, Ontario suburbs"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => brandSaveMutation.mutate()}
          disabled={brandSaveMutation.isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-[#2D6A4F] rounded-lg hover:bg-[#1B4332] transition-colors disabled:opacity-60"
        >
          {brandSaveMutation.isPending ? "Saving..." : "Save Brand Profile"}
        </button>
        {brandSaved && (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <Check className="w-3.5 h-3.5" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Change Password Section ─── */
function ChangePasswordSection({ inputClass, labelClass }: { inputClass: string; labelClass: string }) {
  const [pw, setPw] = useState({ current: "", new_password: "", confirm: "" });
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");

  const pwMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          current_password: pw.current,
          new_password: pw.new_password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change password");
      return data;
    },
    onSuccess: () => {
      setPw({ current: "", new_password: "", confirm: "" });
      setPwError("");
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 3000);
    },
    onError: (err: Error) => {
      setPwError(err.message);
    },
  });

  function handlePwSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");

    if (pw.new_password.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    if (pw.new_password !== pw.confirm) {
      setPwError("New passwords don't match.");
      return;
    }

    pwMutation.mutate();
  }

  return (
    <form onSubmit={handlePwSubmit}>
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">Change Password</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Current Password</label>
            <input
              type="password"
              autoComplete="current-password"
              className={inputClass}
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={labelClass}>New Password</label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className={inputClass}
              value={pw.new_password}
              onChange={(e) => setPw({ ...pw, new_password: e.target.value })}
              required
              minLength={8}
            />
          </div>
          <div>
            <label className={labelClass}>Confirm New Password</label>
            <input
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              required
            />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={pwMutation.isPending || !pw.current || !pw.new_password || !pw.confirm}
            className="px-4 py-2 text-sm font-medium text-white bg-[#2D6A4F] rounded-lg hover:bg-[#1B4332] transition-colors disabled:opacity-60"
          >
            {pwMutation.isPending ? "Updating..." : "Update Password"}
          </button>
          {pwSaved && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <Check className="w-3.5 h-3.5" /> Password updated
            </span>
          )}
          {pwError && (
            <span className="text-xs text-red-600">{pwError}</span>
          )}
        </div>
      </div>
    </form>
  );
}

/* ─── Notification Preferences ──────────────────────────────────────
   Two-section card: top half is channel toggles (email + SMS), bottom
   half is per-category toggles. Saving sends the full preferences
   blob to /api/portal/notification-preferences. The backend always
   accepts the full shape so we don't have to reason about partial
   updates client-side. */

interface PrefsResponse {
  preferences: NotificationPreferences;
  defaults: NotificationPreferences;
}

function NotificationPreferencesSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<PrefsResponse>({
    queryKey: ["/api/portal/notification-preferences"],
  });

  /* Local draft state — only synced to the server when the user clicks
   * Save, so toggling without saving is reversible by reloading. */
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);

  useEffect(() => {
    if (data?.preferences && !draft) setDraft(data.preferences);
  }, [data, draft]);

  const dirty = !!draft && !!data && JSON.stringify(draft) !== JSON.stringify(data.preferences);

  const saveMutation = useMutation({
    mutationFn: async (next: NotificationPreferences) => {
      const res = await apiRequest("PUT", "/api/portal/notification-preferences", next);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Notification preferences saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/notification-preferences"] });
    },
    onError: () => {
      toast({ title: "Couldn't save preferences", description: "Try again in a moment.", variant: "destructive" });
    },
  });

  if (isLoading || !draft) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
        <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
        <div className="h-3 w-3/4 bg-gray-100 rounded" />
      </div>
    );
  }

  const setChannel = (channel: "email" | "sms", value: boolean) =>
    setDraft((d) => (d ? { ...d, channels: { ...d.channels, [channel]: value } } : d));

  const setCategory = (key: NotificationCategoryKey, value: boolean) =>
    setDraft((d) => (d ? { ...d, categories: { ...d.categories, [key]: value } } : d));

  const noChannelOn = !draft.channels.email && !draft.channels.sms;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-gray-700" />
        <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
      </div>

      {/* Channels */}
      <div>
        <p className="text-xs text-gray-500 mb-3">
          How should we reach you? Turning a channel off mutes every notification on that channel.
        </p>
        <div className="space-y-2">
          <ChannelRow
            icon={<Mail className="w-3.5 h-3.5 text-gray-500" />}
            label="Email"
            description="Sent to your account email."
            checked={draft.channels.email}
            onChange={(v) => setChannel("email", v)}
          />
          <ChannelRow
            icon={<MessageSquare className="w-3.5 h-3.5 text-gray-500" />}
            label="SMS"
            description="Sent to your account phone."
            checked={draft.channels.sms}
            onChange={(v) => setChannel("sms", v)}
          />
        </div>
        {noChannelOn && (
          <p className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
            Both channels are off — you won't receive any notifications. Critical billing alerts will still be sent regardless.
          </p>
        )}
      </div>

      {/* Categories */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Categories</p>
        <div className="space-y-2">
          {NOTIFICATION_CATEGORY_KEYS.map((key) => {
            const meta = NOTIFICATION_CATEGORY_LABELS[key];
            return (
              <div
                key={key}
                className="flex items-start justify-between gap-3 py-1.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{meta.label}</p>
                  <p className="text-xs text-gray-500">{meta.description}</p>
                </div>
                <Switch
                  checked={draft.categories[key]}
                  onCheckedChange={(v) => setCategory(key, v)}
                  aria-label={`${meta.label} notifications`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Save */}
      {dirty && (
        <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
          <button
            type="button"
            onClick={() => saveMutation.mutate(draft)}
            disabled={saveMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-[#2D6A4F] rounded-lg hover:bg-[#1B4332] transition-colors disabled:opacity-60"
          >
            {saveMutation.isPending ? "Saving…" : "Save preferences"}
          </button>
          <button
            type="button"
            onClick={() => data && setDraft(data.preferences)}
            disabled={saveMutation.isPending}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Discard changes
          </button>
        </div>
      )}
    </div>
  );
}

function ChannelRow({
  icon, label, description, checked, onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="flex items-start gap-2 min-w-0">
        <span className="mt-0.5 flex-shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800">{label}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={`${label} channel`} />
    </div>
  );
}
