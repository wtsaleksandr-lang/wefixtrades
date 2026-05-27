import { usePageTitle } from "@/hooks/usePageTitle";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { Loader2, Check, RefreshCw, KeyRound, AlertTriangle, Palette, X, Bell, Mail, MessageSquare, Image as ImageIcon, ShieldCheck, Smartphone } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { HelpCueRow } from "@/components/primitives/HelpCueRow";
import InfoCue from "@/components/wizard/elfsight/InfoCue";
import { FirstVisitTooltip } from "@/components/portal/FirstVisitTooltip";
import { resetFirstVisits } from "@/hooks/useFirstVisit";
import { useDisplayPreferences } from "@/hooks/useDisplayPreferences";
import {
  type AdvancedProductKey,
  ADVANCED_PRODUCT_KEYS,
} from "@shared/userPreferences/displayMode";
import {
  DISPLAY_ELEMENTS,
  elementsByProduct,
  type DisplayElement,
} from "@shared/userPreferences/elementRegistry";
import {
  NOTIFICATION_CATEGORY_KEYS,
  NOTIFICATION_CATEGORY_LABELS,
  type NotificationPreferences,
  type NotificationCategoryKey,
} from "@shared/schema";

const PRODUCT_LABEL_BY_KEY: Record<AdvancedProductKey, string> = {
  portal: "Home dashboard",
  contentflow: "ContentFlow",
  rankflow: "RankFlow",
  socialsync: "SocialSync",
  tradeline: "TradeLine",
  mapguard: "MapGuard",
  reputationshield: "ReputationShield",
  quotequick: "QuoteQuick",
  adflow: "AdFlow",
  webcare: "WebCare",
};

interface SettingsData {
  business_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  logo_url: string | null;
  trade_type: string | null;
  account_email: string | null;
}

type TabKey = "account" | "notifications" | "display" | "ai" | "security";
const VALID_TABS: TabKey[] = ["account", "notifications", "display", "ai", "security"];

function parseTabFromHash(): TabKey {
  if (typeof window === "undefined") return "account";
  // wouter's useLocation doesn't include query/hash. Read directly.
  const search = window.location.search || "";
  const params = new URLSearchParams(search);
  const t = params.get("tab");
  if (t && VALID_TABS.includes(t as TabKey)) return t as TabKey;
  return "account";
}

export default function PortalSettings() {
  usePageTitle("Settings");
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>(() => parseTabFromHash());

  // Keep the URL ?tab=... param in sync so direct links work and refresh
  // preserves the selected tab. Uses replaceState so we don't pollute
  // browser history with every tab click.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === activeTab) return;
    if (activeTab === "account") {
      params.delete("tab");
    } else {
      params.set("tab", activeTab);
    }
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    window.history.replaceState(null, "", next);
  }, [activeTab]);

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
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to save");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/overview"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: Error) => {
      // Q4: previously a failed PATCH gave the user no feedback. Surface
      // the server error (or a generic fallback) via the toast system.
      toast({
        title: "Couldn't save contact info",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  const labelClass = "block text-xs font-medium text-gray-600 mb-1";
  const inputClass =
    "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors";

  // Q23b: opt this page into the chat-driven form-fill flow. The assistant
  // can propose values for these contact-info fields; on Apply they patch
  // straight into `form` state (same fields the customer types into above).
  useCopilotForm({
    formLabel: "Account settings",
    fields: [
      { key: "contact_name", label: "Contact Name", required: false },
      { key: "contact_email", label: "Contact Email", required: false },
      { key: "contact_phone", label: "Phone", required: false },
      { key: "website_url", label: "Website", required: false },
    ],
    values: form as unknown as Record<string, unknown>,
    onApply: (fills) => {
      const allowed = new Set(["contact_name", "contact_email", "contact_phone", "website_url"]);
      const patch: Partial<typeof form> = {};
      for (const f of fills) {
        if (!allowed.has(f.field_key)) continue;
        (patch as any)[f.field_key] = f.value;
      }
      if (Object.keys(patch).length > 0) {
        setForm((prev) => ({ ...prev, ...patch }));
      }
    },
    enabled: !!data,
  });

  return (
    <PortalLayout>
      {/* PortalSettings is light-theme locked — see CONTRAST-2. */}
      <div data-theme="light" className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your account, notifications, AI behaviour, and security.</p>
        </div>

        {isLoading && (
          <div className="space-y-6" data-testid="settings-skeleton">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <Skeleton className="h-4 w-24 mb-3" />
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i}>
                    <Skeleton className="h-3 w-20 mb-1.5" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <Skeleton className="h-4 w-40 mb-4" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i}>
                    <Skeleton className="h-3 w-20 mb-1.5" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))}
              </div>
            </div>
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
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
            {/* Mobile: horizontal scroll if tabs overflow. */}
            <div className="overflow-x-auto -mx-1 px-1">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="account" data-testid="tab-trigger-account">Account</TabsTrigger>
                <TabsTrigger value="notifications" data-testid="tab-trigger-notifications">Notifications</TabsTrigger>
                <TabsTrigger value="display" data-testid="tab-trigger-display">Display</TabsTrigger>
                <TabsTrigger value="ai" data-testid="tab-trigger-ai">AI</TabsTrigger>
                <FirstVisitTooltip
                  storageKey="portal-settings-security-tab"
                  title="Enable 2FA in under a minute"
                  position="bottom"
                  anchor={
                    <TabsTrigger value="security" data-testid="tab-trigger-security">Security</TabsTrigger>
                  }
                >
                  Add 2FA in under a minute — strongly recommended for accounts handling customer data.
                </FirstVisitTooltip>
              </TabsList>
            </div>

            {/* ─── Account ─── */}
            <TabsContent value="account" className="space-y-6">
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
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-sm font-semibold text-gray-900 pb-3 mb-3 border-b border-gray-200 dark:border-gray-700">Contact Information</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Contact Name</label>
                      <input
                        className={inputClass}
                        placeholder="John's Plumbing"
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
                        placeholder="+1 555 0123"
                        value={form.contact_phone}
                        onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Website</label>
                      <input
                        className={inputClass}
                        placeholder="https://example.com"
                        value={form.website_url}
                        onChange={(e) => setForm({ ...form, website_url: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-3 mt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      type="submit"
                      disabled={saveMutation.isPending}
                      className="px-4 py-2 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue-600 transition-colors disabled:opacity-60"
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

              {/* Business Logo (Q15) */}
              <LogoSection initialLogoUrl={data.logo_url} labelClass={labelClass} inputClass={inputClass} />

              {/* Brand Voice (AI tone lives in the AI tab; brand identity in Account) */}
              <BrandProfileSection inputClass={inputClass} labelClass={labelClass} />

              {/* Reset onboarding tips — clears localStorage flags so the
                  light progressive-disclosure tooltips re-appear on each
                  page. Useful for customers who want a refresher tour. */}
              <ResetOnboardingTipsCard />
            </TabsContent>

            {/* ─── Notifications ─── */}
            <TabsContent value="notifications" className="space-y-6">
              <NotificationPreferencesSection />
            </TabsContent>

            {/* ─── AI ─── */}
            <TabsContent value="ai" className="space-y-6">
              {/* Pause All Automation (kill-switch for every AI-driven service) */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 pb-3 mb-3 border-b border-gray-200 dark:border-gray-700">
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
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                      <p className="text-sm text-amber-800">
                        All automated content creation and posting is paused. Your existing services remain active but no new content will be generated or published.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ─── Display (Wave 36 — Tesla Simplification) ─── */}
            <TabsContent value="display" className="space-y-3">
              <DisplayPreferencesSection />
            </TabsContent>

            {/* ─── Security ─── */}
            <TabsContent value="security" className="space-y-3">
              <TwoFactorSection />
              <ActiveSessionsSection />
              <ChangePasswordSection inputClass={inputClass} labelClass={labelClass} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </PortalLayout>
  );
}

/* ─── Reset Onboarding Tips Section ─── */

function ResetOnboardingTipsCard() {
  const { toast } = useToast();
  const [resetting, setResetting] = useState(false);

  const handleReset = () => {
    setResetting(true);
    resetFirstVisits();
    toast({
      title: "Onboarding tips reset",
      description: "First-visit hints will show again as you navigate the portal.",
    });
    // Tiny stall so the button feedback registers visually.
    setTimeout(() => setResetting(false), 600);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Onboarding tips</h2>
      <p className="text-xs text-gray-500 mb-3">
        Show the first-visit hints across the portal again — useful if you want a refresher or are training a teammate.
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={handleReset}
        disabled={resetting}
        data-testid="reset-onboarding-tips"
        className="text-xs"
      >
        {resetting ? "Resetting…" : "Reset onboarding tips"}
      </Button>
    </div>
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
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-2">
        <Palette className="w-4 h-4 text-brand-blue" />
        <h2 className="text-sm font-semibold text-gray-900">Brand Voice</h2>
      </div>
      <p className="text-xs text-gray-500 pb-3 mb-3 border-b border-gray-200 dark:border-gray-700">
        Shape how AI generates content for your business. These preferences guide the tone, style, and focus of articles, social posts, and emails.
      </p>

      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {/* Tone selector */}
        <div className="pb-3">
          <label className={labelClass}>Tone</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TONE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBrandForm({ ...brandForm, tone: opt.value })}
                className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  brandForm.tone === opt.value
                    ? "bg-brand-blue text-white border-brand-blue"
                    : "bg-white text-gray-700 border-gray-200 hover:border-brand-blue/40"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Style keywords */}
        <div className="py-3">
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
        <div className="py-3">
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
        <div className="py-3">
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
        <div className="pt-3">
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

      <div className="flex items-center gap-3 pt-3 mt-3 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => brandSaveMutation.mutate()}
          disabled={brandSaveMutation.isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue-600 transition-colors disabled:opacity-60"
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
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <HelpCueRow
          cue={<InfoCue text="Set a strong, unique password — at least 8 characters." testid="security-password" />}
          title="Change Password"
        />
        <div className="space-y-[2px] pt-2 border-t border-gray-200 dark:border-gray-700">
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
        <div className="flex items-center gap-3 pt-3 mt-3 border-t border-gray-200 dark:border-gray-700">
          <button
            type="submit"
            disabled={pwMutation.isPending || !pw.current || !pw.new_password || !pw.confirm}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue-600 transition-colors disabled:opacity-60"
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

/* ─── Two-factor authentication section (Security tab) ─── */

interface TfaStatus {
  enabled: boolean;
  method: string | null;
}

function TwoFactorSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: status } = useQuery<TfaStatus>({
    queryKey: ["/api/portal/security/tfa-status"],
    queryFn: async () => {
      const res = await fetch("/api/portal/security/tfa-status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load 2FA status");
      return res.json();
    },
  });

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  // Enable flow state
  const [enrollSecret, setEnrollSecret] = useState<string | null>(null);
  const [enrollOtpUrl, setEnrollOtpUrl] = useState<string | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [enrollError, setEnrollError] = useState("");

  // Disable flow state
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [disableError, setDisableError] = useState("");

  // POST /api/user/2fa/setup → returns { secret, otpauthUrl }
  const startEnable = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/user/2fa/setup", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start 2FA setup");
      return data as { secret: string; otpauthUrl: string };
    },
    onSuccess: (data) => {
      setEnrollSecret(data.secret);
      setEnrollOtpUrl(data.otpauthUrl);
      setEnrollError("");
      setEnrollCode("");
      setEnrollOpen(true);
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't start 2FA setup", description: err.message, variant: "destructive" });
    },
  });

  const confirmEnable = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/user/2fa/verify-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: enrollCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to verify code");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/security/tfa-status"] });
      setEnrollOpen(false);
      setEnrollSecret(null);
      setEnrollOtpUrl(null);
      setEnrollCode("");
      toast({ title: "Two-factor authentication enabled" });
    },
    onError: (err: Error) => {
      setEnrollError(err.message);
    },
  });

  const disable = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/user/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: disablePassword, code: disableCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to disable 2FA");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/security/tfa-status"] });
      setDisableOpen(false);
      setDisablePassword("");
      setDisableCode("");
      toast({ title: "Two-factor authentication disabled" });
    },
    onError: (err: Error) => {
      setDisableError(err.message);
    },
  });

  const enabled = !!status?.enabled;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <HelpCueRow
        cue={<InfoCue text="Adds a second authentication step using a TOTP app (1Password, Authy, Google Authenticator)." testid="security-tfa" />}
        title="Two-factor authentication"
      />
      <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
        {enabled ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-gray-800">Enabled · Authenticator app</p>
                <p className="text-xs text-gray-500 mt-0.5">Use your TOTP app to sign in.</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setDisableError(""); setDisableOpen(true); }} data-testid="button-disable-2fa">
              Disable 2FA
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-600">Add a TOTP code on top of your password.</p>
            <button
              type="button"
              onClick={() => startEnable.mutate()}
              disabled={startEnable.isPending}
              className="btn-primary-premium px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-60"
              data-testid="button-enable-2fa"
            >
              {startEnable.isPending ? "Starting…" : "Enable 2FA"}
            </button>
          </div>
        )}
      </div>

      {/* Enable dialog — show QR / secret + ask for first code */}
      <AlertDialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable two-factor authentication</AlertDialogTitle>
            <AlertDialogDescription>
              Scan this setup link with your authenticator app, then enter the 6-digit code it shows.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            {enrollOtpUrl && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs break-all font-mono text-gray-700">
                {enrollOtpUrl}
              </div>
            )}
            {enrollSecret && (
              <div className="text-xs text-gray-600">
                Manual entry secret: <span className="font-mono text-gray-900">{enrollSecret}</span>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">6-digit code</label>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={enrollCode}
                onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, ""))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
                placeholder="123456"
                data-testid="input-enroll-code"
              />
            </div>
            {enrollError && <p className="text-xs text-red-600">{enrollError}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmEnable.mutate(); }}
              disabled={confirmEnable.isPending || enrollCode.length !== 6}
              data-testid="button-confirm-enable-2fa"
            >
              {confirmEnable.isPending ? "Verifying…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disable dialog */}
      <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable 2FA?</AlertDialogTitle>
            <AlertDialogDescription>
              Your account will be less secure. Enter your password and a current 2FA code to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Current password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
                data-testid="input-disable-password"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">6-digit code</label>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
                placeholder="123456"
                data-testid="input-disable-code"
              />
            </div>
            {disableError && <p className="text-xs text-red-600">{disableError}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); disable.mutate(); }}
              disabled={disable.isPending || !disablePassword || disableCode.length !== 6}
              data-testid="button-confirm-disable-2fa"
            >
              {disable.isPending ? "Disabling…" : "Disable 2FA"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─── Active sessions section (Security tab) ─── */

interface PortalSession {
  id: string;
  is_current: boolean;
  user_agent_summary: string;
  ip_city: string | null;
  last_active_at: string;
}

function ActiveSessionsSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [confirmRevokeOthers, setConfirmRevokeOthers] = useState(false);

  const { data, isLoading } = useQuery<{ sessions: PortalSession[]; current_sid: string }>({
    queryKey: ["/api/portal/security/sessions"],
    queryFn: async () => {
      const res = await fetch("/api/portal/security/sessions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load sessions");
      return res.json();
    },
  });

  const revokeOne = useMutation({
    mutationFn: async (sid: string) => {
      const res = await fetch(`/api/portal/security/sessions/${encodeURIComponent(sid)}/revoke`, {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to revoke session");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/security/sessions"] });
      setConfirmRevokeId(null);
      toast({ title: "Session revoked" });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't revoke session", description: err.message, variant: "destructive" });
    },
  });

  const revokeOthers = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal/security/sessions/revoke-others", {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to revoke other devices");
      return body as { ok: boolean; revoked: number };
    },
    onSuccess: (body) => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/security/sessions"] });
      setConfirmRevokeOthers(false);
      toast({ title: `Signed out ${body.revoked} other device${body.revoked === 1 ? "" : "s"}` });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't sign out other devices", description: err.message, variant: "destructive" });
    },
  });

  const sessions = data?.sessions ?? [];
  const otherCount = useMemo(() => sessions.filter((s) => !s.is_current).length, [sessions]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <HelpCueRow
        cue={<InfoCue text="Devices currently signed in to your account. Revoke any you don't recognise." testid="security-sessions" />}
        title="Active sessions"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmRevokeOthers(true)}
            disabled={otherCount === 0 || revokeOthers.isPending}
            data-testid="button-revoke-others"
          >
            Log out other devices
          </Button>
        }
      />
      <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-xs text-gray-500 py-3">No active sessions found.</p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700" data-testid="sessions-list">
            {sessions.map((s) => (
              <li key={s.id} className="py-2 flex items-center justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <Smartphone className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {s.is_current && (
                        <span className="inline-block mr-2 px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                          This device
                        </span>
                      )}
                      {s.user_agent_summary}
                    </p>
                    <p className="text-xs text-gray-500">
                      {s.ip_city ? `${s.ip_city} · ` : ""}expires {formatRelative(s.last_active_at)}
                    </p>
                  </div>
                </div>
                {!s.is_current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmRevokeId(s.id)}
                    aria-label={`Revoke session ${s.user_agent_summary}`}
                    data-testid={`button-revoke-session-${s.id}`}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Confirm revoke-others */}
      <AlertDialog open={confirmRevokeOthers} onOpenChange={setConfirmRevokeOthers}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out other devices?</AlertDialogTitle>
            <AlertDialogDescription>
              This signs you out everywhere except this device. {otherCount} other session{otherCount === 1 ? "" : "s"} will end immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); revokeOthers.mutate(); }}
              disabled={revokeOthers.isPending}
              data-testid="button-confirm-revoke-others"
            >
              {revokeOthers.isPending ? "Signing out…" : "Sign out others"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm single revoke */}
      <AlertDialog open={!!confirmRevokeId} onOpenChange={(open) => !open && setConfirmRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this session?</AlertDialogTitle>
            <AlertDialogDescription>
              Sign out that device immediately?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (confirmRevokeId) revokeOne.mutate(confirmRevokeId); }}
              disabled={revokeOne.isPending}
              data-testid="button-confirm-revoke-session"
            >
              {revokeOne.isPending ? "Revoking…" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Tiny formatter so we don't need to add date-fns. */
function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "unknown";
    return d.toLocaleString();
  } catch {
    return "unknown";
  }
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
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 pb-3 mb-4 border-b border-gray-200 dark:border-gray-700">
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
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
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
        <div className="flex items-center gap-3 pt-3 mt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => saveMutation.mutate(draft)}
            disabled={saveMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue-600 transition-colors disabled:opacity-60"
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

/* ─── Logo Section (Q15) ─── */

const LOGO_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml";
const LOGO_MAX_BYTES = 5 * 1024 * 1024;

/** Read a File into a bare base64 string (no `data:` prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      // result is a data URL: "data:<mime>;base64,<payload>"
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function LogoSection({
  initialLogoUrl,
  labelClass,
  inputClass,
}: {
  initialLogoUrl: string | null;
  labelClass: string;
  inputClass: string;
}) {
  const queryClient = useQueryClient();
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl ?? "");
  const [logoSaved, setLogoSaved] = useState(false);
  const [logoError, setLogoError] = useState("");

  useEffect(() => {
    setLogoUrl(initialLogoUrl ?? "");
  }, [initialLogoUrl]);

  const onLogoPersisted = (nextUrl: string | null) => {
    queryClient.invalidateQueries({ queryKey: ["/api/portal/settings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/portal/overview"] });
    setLogoUrl(nextUrl ?? "");
    setLogoError("");
    setLogoSaved(true);
    setTimeout(() => setLogoSaved(false), 2500);
  };

  // Path A — paste a public URL.
  const saveLogo = useMutation({
    mutationFn: async () => {
      const trimmed = logoUrl.trim();
      const payload = { logo_url: trimmed.length > 0 ? trimmed : null };
      const res = await fetch("/api/portal/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save logo");
      return data as { logo_url: string | null };
    },
    onSuccess: (data) => onLogoPersisted(data.logo_url),
    onError: (err: Error) => setLogoError(err.message),
  });

  // Path B — upload an image file directly.
  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/portal/logo/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ file: base64, filename: file.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upload logo");
      return data as { logo_url: string | null };
    },
    onSuccess: (data) => onLogoPersisted(data.logo_url),
    onError: (err: Error) => setLogoError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLogoError("");
    const trimmed = logoUrl.trim();
    if (trimmed.length > 0 && !/^https?:\/\//i.test(trimmed)) {
      setLogoError("Logo URL must start with http:// or https://");
      return;
    }
    saveLogo.mutate();
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogoError("");
    const file = e.target.files?.[0];
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError("Logo file exceeds the 5 MB limit.");
      return;
    }
    if (!LOGO_ACCEPT.split(",").includes(file.type)) {
      setLogoError("Unsupported image type — use PNG, JPG, GIF, WEBP or SVG.");
      return;
    }
    uploadLogo.mutate(file);
  };

  const busy = saveLogo.isPending || uploadLogo.isPending;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <ImageIcon className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-900">Business Logo</h2>
      </div>
      <p className="text-xs text-gray-500 pb-3 mb-3 border-b border-gray-200 dark:border-gray-700">
        Used on your portal sidebar and on invoices. Upload an image file, or paste a public URL.
      </p>

      <div className="flex items-start gap-4">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Logo preview"
            className="w-16 h-16 rounded-lg border border-gray-200 object-contain bg-gray-50 shrink-0"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }}
            data-testid="logo-preview"
          />
        ) : (
          <div className="w-16 h-16 rounded-lg border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center shrink-0">
            <ImageIcon className="w-5 h-5 text-gray-300" />
          </div>
        )}

        <div className="flex-1 min-w-0 divide-y divide-gray-200 dark:divide-gray-700">
          {/* Path B — file upload */}
          <div className="pb-3">
            <label className={labelClass}>Upload a file</label>
            <label
              className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white hover:border-brand-blue/40 cursor-pointer transition-colors ${
                busy ? "opacity-60 pointer-events-none" : ""
              }`}
              data-testid="label-logo-upload"
            >
              {uploadLogo.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ImageIcon className="w-4 h-4 text-gray-500" />
              )}
              {uploadLogo.isPending ? "Uploading…" : "Choose image"}
              <input
                type="file"
                accept={LOGO_ACCEPT}
                className="hidden"
                onChange={handleFilePick}
                disabled={busy}
                data-testid="input-logo-file"
              />
            </label>
            <p className="text-[10px] text-gray-400 mt-1">PNG, JPG, GIF, WEBP or SVG — up to 5 MB.</p>
          </div>

          {/* Path A — paste URL */}
          <form onSubmit={handleSubmit} className="pt-3">
            <label className={labelClass}>Or paste a logo URL</label>
            <div className="flex items-center gap-2">
              <input
                type="url"
                placeholder="https://example.com/logo.png"
                className={inputClass}
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                disabled={busy}
                data-testid="input-logo-url"
              />
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue-600 transition-colors disabled:opacity-60 shrink-0"
                data-testid="button-save-logo"
              >
                {saveLogo.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {logoError && <p className="text-xs text-red-600" data-testid="logo-error">{logoError}</p>}
      {logoSaved && (
        <span className="flex items-center gap-1 text-xs text-emerald-600" data-testid="logo-saved">
          <Check className="w-3.5 h-3.5" /> Saved
        </span>
      )}
    </div>
  );
}

/* ─── Wave 36 — Display Preferences (Tesla Simplification) ─── */

function DisplayPreferencesSection() {
  const { preferences, isLoading, updateAsync, isSaving } = useDisplayPreferences();
  const { toast } = useToast();
  const isAdvanced = preferences.mode === "advanced";

  const productToggles: Array<{ key: keyof typeof preferences; label: string; description: string }> = [
    { key: "portal_show_advanced", label: "Home dashboard", description: "Active services, recent activity feed, secondary KPI cards." },
    { key: "contentflow_show_advanced", label: "ContentFlow", description: "AI-detection score, distribution reach, recent creations grid, template gallery." },
    { key: "rankflow_show_advanced", label: "RankFlow", description: "Keyword opportunity heatmap, competitor cards, activity feed." },
    { key: "socialsync_show_advanced", label: "SocialSync", description: "Per-platform engagement breakdowns, best-time heatmap, secondary KPIs." },
    { key: "tradeline_show_advanced", label: "TradeLine", description: "Cost-per-booking gauge, sentiment heatmap, transcript list." },
    { key: "mapguard_show_advanced", label: "MapGuard", description: "Competitor alert timeline, citation health letter grade, alert settings." },
    { key: "reputationshield_show_advanced", label: "ReputationShield", description: "Sentiment heatmap, request funnel, platform scorecard, velocity counter." },
    { key: "quotequick_show_advanced", label: "QuoteQuick", description: "Per-template conversion grid, A/B testing surface, brand settings link." },
    { key: "adflow_show_advanced", label: "AdFlow", description: "Profitable-trade heatmap, day-parting heatmap, campaign factor chips." },
    { key: "webcare_show_advanced", label: "WebCare", description: "Site inventory, backup timeline, performance gauge." },
  ];

  const handleModeChange = async (next: "simple" | "advanced") => {
    try {
      await updateAsync({ mode: next });
      toast({
        title: next === "advanced" ? "Advanced mode enabled" : "Simple mode enabled",
        description:
          next === "advanced"
            ? "Toggle each product below to reveal its power-user sections."
            : "Dashboards now show only the essentials. Ask the AI Copilot for anything hidden.",
      });
    } catch {
      toast({ title: "Couldn't update display mode", variant: "destructive" });
    }
  };

  const handleToggle = async (key: keyof typeof preferences, value: boolean) => {
    try {
      await updateAsync({ [key]: value } as any);
    } catch {
      toast({ title: "Couldn't update preference", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5" data-testid="display-prefs-loading">
        <Skeleton className="h-4 w-32 mb-3" />
        <Skeleton className="h-9 w-full max-w-xs" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="display-prefs-root">
      {/* Mode toggle card */}
      <div data-theme="light" className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Dashboard layout</h2>
        <p className="text-xs text-gray-500 mb-4">
          Simple mode shows only the essentials. Advanced unlocks deep analytics and configuration. Your AI Copilot can surface anything hidden — just ask.
        </p>

        <div
          role="radiogroup"
          aria-label="Dashboard layout mode"
          className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!isAdvanced}
            disabled={isSaving}
            onClick={() => !isAdvanced || handleModeChange("simple")}
            className={
              "px-4 py-1.5 text-sm font-medium rounded-md transition-colors " +
              (!isAdvanced ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900")
            }
            data-testid="display-mode-simple"
          >
            Simple
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={isAdvanced}
            disabled={isSaving}
            onClick={() => isAdvanced || handleModeChange("advanced")}
            className={
              "px-4 py-1.5 text-sm font-medium rounded-md transition-colors " +
              (isAdvanced ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900")
            }
            data-testid="display-mode-advanced"
          >
            Advanced
          </button>
        </div>
      </div>

      {/* Wave 36.5 — per-element overrides. Always visible (no global mode gate)
          so the user can opt-in to a specific element without flipping Advanced on. */}
      <ElementOverridesSection />

      {/* Per-product toggles — only visible when Advanced is on. */}
      {isAdvanced && (
        <div data-theme="light" className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Show advanced sections by product</h2>
          <p className="text-xs text-gray-500 mb-4">
            Turn on the products where you want the deeper analytics, heatmaps, and configuration surfaces revealed.
          </p>

          <div className="divide-y divide-gray-200">
            {productToggles.map((toggle) => {
              const checked = Boolean(preferences[toggle.key]);
              return (
                <div
                  key={String(toggle.key)}
                  className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  data-testid={`display-toggle-${String(toggle.key)}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{toggle.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{toggle.description}</p>
                  </div>
                  <Switch
                    checked={checked}
                    disabled={isSaving}
                    onCheckedChange={(value) => handleToggle(toggle.key, value)}
                    aria-label={`Show advanced ${toggle.label}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Wave 36.5 — per-element overrides section.
 *
 * Groups elements by product into accordions. Each row gets a Switch that
 * flips the explicit override on/off; "use default" link removes the override
 * key so the product/mode logic takes over again. Mobile-responsive: stacks
 * to full-width rows under 640px.
 *
 * UI rules (from MEMORY):
 *   • Help cue top-left (the description text under the title).
 *   • 2px gaps between rows (space-y-0.5).
 *   • Selected = outline accent only, NEVER bright fill (Switch primitive default).
 *   • Theme-aware contrast via semantic classes (bg-white / text-gray-*).
 */
function ElementOverridesSection() {
  const { preferences, isLoading, updateAsync, isSaving } = useDisplayPreferences();
  const { toast } = useToast();
  const overrides = preferences.element_overrides ?? {};
  const grouped = useMemo(() => elementsByProduct(), []);

  // Auto-open accordions for any product that already has at least one override.
  const initialOpen = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const product of ADVANCED_PRODUCT_KEYS) {
      const elements = grouped[product] ?? [];
      out[product] = elements.some((e) => typeof overrides[e.id] === "boolean");
    }
    return out;
  }, [grouped, overrides]);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(initialOpen);

  // Re-sync: if an external mutation adds an override, expand that accordion.
  useEffect(() => {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const product of ADVANCED_PRODUCT_KEYS) {
        const elements = grouped[product] ?? [];
        if (elements.some((e) => typeof overrides[e.id] === "boolean")) next[product] = true;
      }
      return next;
    });
  }, [grouped, overrides]);

  const persistOverrides = useCallback(
    async (nextMap: Record<string, boolean>) => {
      try {
        await updateAsync({ element_overrides: nextMap });
      } catch {
        toast({ title: "Couldn't update element preference", variant: "destructive" });
      }
    },
    [updateAsync, toast],
  );

  const setElement = useCallback(
    (elementId: string, value: boolean) => {
      const next = { ...overrides, [elementId]: value };
      void persistOverrides(next);
    },
    [overrides, persistOverrides],
  );

  const clearElement = useCallback(
    (elementId: string) => {
      const next = { ...overrides };
      delete next[elementId];
      void persistOverrides(next);
    },
    [overrides, persistOverrides],
  );

  const resetProduct = useCallback(
    (product: AdvancedProductKey) => {
      const productIds = (grouped[product] ?? []).map((e) => e.id);
      const next: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(overrides)) {
        if (!productIds.includes(k)) next[k] = v;
      }
      void persistOverrides(next);
    },
    [grouped, overrides, persistOverrides],
  );

  const setsForProduct = useCallback(
    (product: AdvancedProductKey) =>
      (grouped[product] ?? []).filter((e) => typeof overrides[e.id] === "boolean").length,
    [grouped, overrides],
  );

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5" data-testid="element-overrides-loading">
        <Skeleton className="h-4 w-48 mb-3" />
        <Skeleton className="h-9 w-full max-w-md" />
      </div>
    );
  }

  return (
    <div
      data-theme="light"
      className="bg-white rounded-xl border border-gray-200 p-5"
      data-testid="display-element-overrides-root"
    >
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Show individual elements</h2>
      <p className="text-xs text-gray-500 mb-4 max-w-2xl">
        Want one specific tile, heatmap, or feed visible without flipping the whole product to
        Advanced? Toggle it on below. Element overrides win against the product-level switch —
        leave them off (or click "use default") to fall back to your product preferences.
      </p>

      <div className="space-y-0.5">
        {ADVANCED_PRODUCT_KEYS.map((product) => {
          const elements = grouped[product] ?? [];
          if (elements.length === 0) return null;
          const open = Boolean(openMap[product]);
          const overrideCount = setsForProduct(product);
          return (
            <div
              key={product}
              className="border border-gray-100 rounded-md"
              data-testid={`element-overrides-product-${product}`}
            >
              <button
                type="button"
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-gray-50 rounded-md"
                onClick={() => setOpenMap((p) => ({ ...p, [product]: !open }))}
                aria-expanded={open}
                data-testid={`element-overrides-toggle-${product}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-gray-900">
                    {PRODUCT_LABEL_BY_KEY[product]}
                  </span>
                  {overrideCount > 0 && (
                    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full border border-gray-300 text-gray-700">
                      {overrideCount} set
                    </span>
                  )}
                  <span className="text-[11px] text-gray-500">
                    {elements.length} element{elements.length === 1 ? "" : "s"}
                  </span>
                </div>
                <span className="text-gray-400 text-xs" aria-hidden="true">
                  {open ? "▾" : "▸"}
                </span>
              </button>
              {open && (
                <div className="border-t border-gray-100 px-3 py-2">
                  {overrideCount > 0 && (
                    <div className="flex justify-end mb-1">
                      <button
                        type="button"
                        className="text-[11px] text-gray-600 hover:text-gray-900 underline"
                        onClick={() => resetProduct(product)}
                        disabled={isSaving}
                        data-testid={`element-overrides-reset-${product}`}
                      >
                        Reset to defaults
                      </button>
                    </div>
                  )}
                  <ul className="space-y-0.5">
                    {elements.map((el: DisplayElement) => {
                      const override = overrides[el.id];
                      const isSet = typeof override === "boolean";
                      const checked = override === true;
                      return (
                        <li
                          key={el.id}
                          className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4 py-2"
                          data-testid={`element-override-row-${el.id}`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900">{el.label}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{el.description}</p>
                            <p className="text-[10px] uppercase tracking-wide text-gray-400 mt-0.5">
                              {el.category}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 self-start sm:self-center">
                            <Switch
                              checked={checked}
                              disabled={isSaving}
                              onCheckedChange={(value) => setElement(el.id, value)}
                              aria-label={`Show ${el.label}`}
                              data-testid={`element-override-switch-${el.id}`}
                            />
                            {isSet && (
                              <button
                                type="button"
                                className="text-[11px] text-gray-500 hover:text-gray-900 underline"
                                onClick={() => clearElement(el.id)}
                                disabled={isSaving}
                                aria-label={`Use product default for ${el.label}`}
                                data-testid={`element-override-clear-${el.id}`}
                              >
                                use default
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] text-gray-500">
        Showing {DISPLAY_ELEMENTS.length} elements across {ADVANCED_PRODUCT_KEYS.length} products.
      </p>
    </div>
  );
}
