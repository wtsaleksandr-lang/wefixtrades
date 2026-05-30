import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Loader2, ArrowLeft, Check, Clock, AlertCircle, Circle, RefreshCw, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOff, Globe, Mic, ChevronDown, Save, Shield, Wrench, Activity, BarChart3, DollarSign, MousePointerClick, Eye, Users } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import ModeToggle from "@/components/portal/ModeToggle";
import TaskTimeline from "@/components/portal/TaskTimeline";
import ApprovalGate from "@/components/portal/ApprovalGate";
import DeliverableViewer from "@/components/portal/DeliverableViewer";
import type { Deliverable } from "@/components/portal/DeliverableViewer";
import { SectionErrorRetry } from "@/components/shared/SectionErrorRetry";
import {
  TradeLineStatusBanner,
  BusinessHoursCard,
  NotificationSettingsCard,
  TradeLineCallList,
} from "@/components/portal/TradeLinePortalSections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";
import {
  SERVICE_STATUS_LABELS, SERVICE_STATUS_STYLES,
  PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES,
  ONBOARDING_STATUS_LABELS,
  statusLabel,
} from "@/config/portalLabels";

interface TaskRow {
  id: number;
  title: string;
  status: string;
  waiting_on: string | null;
  due_at: string | null;
  completed_at: string | null;
  sort_order: number;
  deliverables?: Deliverable[];
}

interface PaymentRow {
  id: number;
  type: string;
  amount_cents: number;
  status: string;
  description: string | null;
  period_start: string | null;
  period_end: string | null;
  due_at: string | null;
  paid_at: string | null;
  created_at: string | null;
}

interface ServiceDetail {
  service: {
    id: number;
    service_id: string;
    service_name: string | null;
    category: string | null;
    status: string;
    billing_period: string | null;
    price_cents: number | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string | null;
  };
  tasks: TaskRow[];
  onboarding: {
    id: number;
    status: string;
    submitted_at: string | null;
    approved_at: string | null;
  } | null;
  payments: PaymentRow[];
  adflow_metrics?: {
    impressions?: number;
    clicks?: number;
    leads_generated?: number;
    cost_spent_cents?: number;
    ctr_pct?: number;
    cpc_cents?: number;
    period_start?: string;
    period_end?: string;
  };
  /** WebFix post-fix before/after audit report (from task metadata). */
  webfix_audit?: {
    audited_at?: string;
    url?: string;
    metrics?: { performance_score?: number };
    comparison?: {
      performance_delta?: number;
      fcp_delta_ms?: number;
      lcp_delta_ms?: number;
    };
    ai_report?: string;
    improvements_summary?: string;
  };
}

interface TradeLineCallRow {
  id: number;
  direction: string;
  caller_number: string | null;
  duration_seconds: number;
  outcome: string;
  summary: string | null;
  ended_at: string | null;
  created_at: string | null;
}

/** Per-day open/close window. Both fields are HH:MM strings; closed-day
 *  rows are represented by `closed: true` (the schedule object can also
 *  omit the day entirely, treated as closed). */
export interface DaySchedule {
  open: string;     // "09:00"
  close: string;    // "17:00"
  closed?: boolean;
}

export interface BusinessHours {
  timezone: string;
  schedule: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", DaySchedule>>;
}

interface TradeLineData {
  config: {
    currentMode: string;
    variant: string;
    channels: { voice: boolean; websiteChat: boolean; websiteVoice: boolean; sms: boolean; hostedFallback: boolean };
    phoneRouting: { primaryBusinessNumber: string; forwardingMode: string; ringTimeoutSeconds: number };
    website: { embedMode: string; hostedUrl: string };
    voice?: { presetId: string; label: string; provider: string; voiceId: string; language: string };
    personality?: { tone: string; humor: string; profanity: boolean; language: string };
    widgetStyle?: { preset: string; bubbleLabel: string; accentMode: string };
    businessHours?: BusinessHours;
    notifications?: { sms: string[]; email: string[] };
  } | null;
  usage: {
    voice_minutes_used: number;
    calls_count: number;
    sms_count: number;
    included_minutes: number;
    overage_minutes: number;
  } | null;
  recentCalls: TradeLineCallRow[];
  /** Assistant build status surfaced separately by the API (see
   *  /api/portal/tradeline/:csId GET handler). One of:
   *  not_built | building | built | failed */
  assistantStatus?: "not_built" | "building" | "built" | "failed";
}

function CallIcon({ outcome }: { outcome: string }) {
  switch (outcome) {
    case "answered":
      return <PhoneIncoming className="w-4 h-4 text-emerald-500" />;
    case "missed":
      return <PhoneMissed className="w-4 h-4 text-red-500" />;
    case "failed":
      return <PhoneOff className="w-4 h-4 text-muted-foreground/70" />;
    default:
      return <PhoneCall className="w-4 h-4 text-muted-foreground/70" />;
  }
}

function TaskIcon({ status }: { status: string }) {
  switch (status) {
    case "delivered":
      return <Check className="w-4 h-4 text-emerald-500" />;
    case "in_progress":
    case "submitted":
      return <Clock className="w-4 h-4 text-brand-blue-500" />;
    case "waiting":
    case "blocked":
      return <AlertCircle className="w-4 h-4 text-amber-500" />;
    case "cancelled":
      return <Circle className="w-4 h-4 text-muted-foreground/50" />;
    default:
      return <Circle className="w-4 h-4 text-muted-foreground/50" />;
  }
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ─── Voice presets (mirrors server registry) ─── */
const VOICE_PRESETS = [
  { id: "professional-female", label: "Professional Female", desc: "Clear, polished tone", provider: "11labs", voiceId: "21m00Tcm4TlvDq8ikWAM" },
  { id: "professional-male", label: "Professional Male", desc: "Confident, reassuring voice", provider: "11labs", voiceId: "TxGEqnHWrfWFTfGW9XjX" },
  { id: "friendly-female", label: "Friendly Female", desc: "Warm and approachable", provider: "11labs", voiceId: "EXAVITQu4vr4xnSDxMaL" },
  { id: "friendly-male", label: "Friendly Male", desc: "Casual and natural", provider: "11labs", voiceId: "pNInz6obpgDQGcFmaJgB" },
];

const TONE_OPTIONS = [
  { value: "friendly", label: "Friendly", desc: "Warm and conversational" },
  { value: "professional", label: "Professional", desc: "Polished and courteous" },
  { value: "direct", label: "Direct", desc: "Short and to the point" },
];

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
];

const WIDGET_PRESETS = [
  { value: "clean", label: "Clean", desc: "Minimal, modern look" },
  { value: "bold", label: "Bold", desc: "Prominent, high contrast" },
  { value: "minimal", label: "Minimal", desc: "Subtle, lightweight" },
];

function VoiceAndStyleCard({
  clientServiceId,
  config,
  onSaved,
}: {
  clientServiceId: number;
  config: TradeLineData["config"];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);

  // Draft state
  const [voicePresetId, setVoicePresetId] = useState(config?.voice?.presetId || "professional-female");
  const [tone, setTone] = useState(config?.personality?.tone || "friendly");
  const [humor, setHumor] = useState(config?.personality?.humor || "off");
  const [language, setLanguage] = useState(config?.personality?.language || "en");
  const [widgetPreset, setWidgetPreset] = useState(config?.widgetStyle?.preset || "clean");
  const [bubbleLabel, setBubbleLabel] = useState(config?.widgetStyle?.bubbleLabel || "Need help? Ask us");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const selectedVoice = VOICE_PRESETS.find(v => v.id === voicePresetId);
      const res = await fetch(`/api/portal/tradeline/${clientServiceId}/settings`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice: {
            presetId: voicePresetId,
            label: selectedVoice?.label || voicePresetId,
            provider: selectedVoice?.provider || "11labs",
            voiceId: selectedVoice?.voiceId || "21m00Tcm4TlvDq8ikWAM",
            language,
          },
          personality: { tone, humor, language },
          widgetStyle: { preset: widgetPreset, bubbleLabel },
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Settings saved", description: "Your voice & style preferences have been updated." });
      onSaved();
    },
    onError: () => {
      toast({ title: "Error", description: "Could not save settings. Please try again.", variant: "destructive" });
    },
  });

  const hasChanges =
    voicePresetId !== (config?.voice?.presetId || "professional-female") ||
    tone !== (config?.personality?.tone || "friendly") ||
    humor !== (config?.personality?.humor || "off") ||
    language !== (config?.personality?.language || "en") ||
    widgetPreset !== (config?.widgetStyle?.preset || "clean") ||
    bubbleLabel !== (config?.widgetStyle?.bubbleLabel || "Need help? Ask us");

  /* Phase 1c: register the TradeLine Voice & Style settings with the
   * copilot. This card only mounts for TradeLine services once the config
   * has loaded, so registration is gated by the card's own lifecycle. */
  useCopilotForm({
    formLabel: "Voice & Style",
    fields: [
      {
        key: "voicePresetId",
        label: `Voice preset (one of: ${VOICE_PRESETS.map((v) => v.id).join(", ")})`,
      },
      { key: "tone", label: `Tone (one of: ${TONE_OPTIONS.map((t) => t.value).join(", ")})` },
      { key: "humor", label: "Light humor (light | off)" },
      {
        key: "language",
        label: `Language (one of: ${LANGUAGE_OPTIONS.map((l) => l.value).join(", ")})`,
      },
      {
        key: "widgetPreset",
        label: `Widget style (one of: ${WIDGET_PRESETS.map((w) => w.value).join(", ")})`,
      },
      { key: "bubbleLabel", label: "Chat bubble text" },
    ],
    values: { voicePresetId, tone, humor, language, widgetPreset, bubbleLabel },
    onApply: (fills) => {
      for (const f of fills) {
        switch (f.field_key) {
          case "voicePresetId":
            if (VOICE_PRESETS.some((v) => v.id === f.value)) setVoicePresetId(f.value);
            break;
          case "tone":
            if (TONE_OPTIONS.some((t) => t.value === f.value)) setTone(f.value);
            break;
          case "humor":
            if (f.value === "light" || f.value === "off") setHumor(f.value);
            break;
          case "language":
            if (LANGUAGE_OPTIONS.some((l) => l.value === f.value)) setLanguage(f.value);
            break;
          case "widgetPreset":
            if (WIDGET_PRESETS.some((w) => w.value === f.value)) setWidgetPreset(f.value);
            break;
          case "bubbleLabel":
            setBubbleLabel(f.value);
            break;
        }
      }
    },
  });

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-semibold text-foreground">Voice & Style</h2>
          <span className="text-xs text-muted-foreground/70">
            {VOICE_PRESETS.find(v => v.id === voicePresetId)?.label} · {TONE_OPTIONS.find(t => t.value === tone)?.label}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground/70 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-3.5 border-t border-border pt-3">
          {/* Voice preset */}
          <div>
            <label className="text-xs font-medium text-foreground mb-1.5 block">Voice</label>
            <div className="grid grid-cols-2 gap-1.5">
              {VOICE_PRESETS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVoicePresetId(v.id)}
                  className={`text-left px-2.5 py-2 rounded-lg border text-sm transition-colors ${
                    voicePresetId === v.id
                      ? "border-blue-500 bg-blue-50 text-blue-900"
                      : "border-border hover:border-input text-foreground"
                  }`}
                >
                  <span className="font-medium">{v.label}</span>
                  <span className="text-[11px] text-muted-foreground/70 ml-1">{v.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tone + Language (side by side) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">Tone</label>
              <div className="flex gap-1">
                {TONE_OPTIONS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTone(t.value)}
                    className={`flex-1 text-center px-2 py-1.5 rounded-lg border text-xs transition-colors ${
                      tone === t.value
                        ? "border-blue-500 bg-blue-50 text-blue-900 font-medium"
                        : "border-border hover:border-input text-muted-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">Language</label>
              <div className="flex gap-1">
                {LANGUAGE_OPTIONS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setLanguage(l.value)}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                      language === l.value
                        ? "border-blue-500 bg-blue-50 text-blue-900 font-medium"
                        : "border-border hover:border-input text-muted-foreground"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {language !== "en" && (
            <p className="text-[11px] text-amber-600 -mt-2">Responds in {LANGUAGE_OPTIONS.find(l => l.value === language)?.label} when possible. English callers still get English.</p>
          )}

          {/* Humor + Widget style (side by side) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-medium text-foreground">Light humor</label>
                <p className="text-[10px] text-muted-foreground/70">Subtle warmth only</p>
              </div>
              <Switch
                checked={humor === "light"}
                onCheckedChange={(v) => setHumor(v ? "light" : "off")}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">Widget Style</label>
              <div className="flex gap-1">
                {WIDGET_PRESETS.map((w) => (
                  <button
                    key={w.value}
                    type="button"
                    onClick={() => setWidgetPreset(w.value)}
                    className={`flex-1 text-center px-2 py-1.5 rounded-lg border text-xs transition-colors ${
                      widgetPreset === w.value
                        ? "border-blue-500 bg-blue-50 text-blue-900 font-medium"
                        : "border-border hover:border-input text-muted-foreground"
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bubble label */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-foreground whitespace-nowrap">Bubble text</label>
            <Input
              value={bubbleLabel}
              onChange={(e) => setBubbleLabel(e.target.value)}
              placeholder="Need help? Ask us"
              className="h-7 text-xs flex-1"
              maxLength={40}
            />
          </div>

          {/* Save */}
          {hasChanges && (
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full h-9 text-sm bg-blue-600 hover:bg-blue-700"
            >
              {saveMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Saving...</>
              ) : (
                <><Save className="w-3.5 h-3.5 mr-1.5" /> Save Voice & Style</>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PortalServiceDetail() {
  const [, params] = useRoute("/portal/services/:id");
  const serviceId = params?.id;

  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<ServiceDetail>({
    queryKey: ["/api/portal/services", serviceId],
    queryFn: async () => {
      const res = await fetch(`/api/portal/services/${serviceId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load service");
      return res.json();
    },
    enabled: !!serviceId,
  });

  const isTradeLine = data?.service.service_id?.startsWith("tradeline");
  const isSiteLaunch = data?.service.service_id?.startsWith("sitelaunch");
  const isWebFix = data?.service.service_id?.startsWith("webfix");
  const isWebCare = data?.service.service_id?.startsWith("webcare");
  const isAdFlow = data?.service.service_id?.startsWith("adflow");
  const isQuoteQuick = data?.service.service_id?.startsWith("quotequick");
  const isMapguard = data?.service.service_id?.startsWith("mapguard");

  // Tasks waiting on client approval (for SiteLaunch design approval flow)
  const approvalTasks = (data?.tasks || []).filter(
    (t) => t.waiting_on === "client"
  );

  // Collect all deliverables across tasks
  const allDeliverables: Deliverable[] = (data?.tasks || []).flatMap(
    (t) => (Array.isArray(t.deliverables) ? t.deliverables : [])
  );

  // WebFix: deliverables from completed tasks
  const webFixDeliverables: Deliverable[] = (data?.tasks || [])
    .filter((t) => t.status === "delivered")
    .flatMap((t) => (Array.isArray(t.deliverables) ? t.deliverables : []));

  const {
    data: tlData,
    isError: tlError,
    refetch: refetchTl,
  } = useQuery<TradeLineData>({
    queryKey: ["/api/portal/tradeline", serviceId],
    queryFn: async () => {
      const res = await fetch(`/api/portal/tradeline/${serviceId}`, { credentials: "include" });
      if (!res.ok) throw new Error(`tradeline ${res.status}`);
      return res.json();
    },
    enabled: !!serviceId && !!isTradeLine,
  });

  const {
    data: uptimeData,
    isError: uptimeError,
    refetch: refetchUptime,
  } = useQuery<{
    uptime_percent: number;
    total_checks: number;
    up_checks: number;
    down_checks: number;
    history: Array<{ ts: string; status: "up" | "down"; http_status: number | null }>;
  }>({
    queryKey: ["/api/portal/services", serviceId, "uptime"],
    queryFn: async () => {
      const res = await fetch(`/api/portal/services/${serviceId}/uptime`, { credentials: "include" });
      if (!res.ok) throw new Error(`uptime ${res.status}`);
      return res.json();
    },
    enabled: !!serviceId && !!isWebCare,
  });

  // QuoteQuick summary (to get calculator ID)
  const {
    data: qqSummary,
    isError: qqSummaryError,
    refetch: refetchQqSummary,
  } = useQuery<{
    calculator: { id: number; business_name: string; slug: string; total_views: number; total_leads: number; status: string } | null;
  }>({
    queryKey: ["/api/portal/quotequick/summary"],
    queryFn: async () => {
      const res = await fetch("/api/portal/quotequick/summary", { credentials: "include" });
      if (!res.ok) throw new Error(`qq-summary ${res.status}`);
      return res.json();
    },
    enabled: !!isQuoteQuick,
  });

  // QuoteQuick recent leads
  const {
    data: qqLeads,
    isError: qqLeadsError,
    refetch: refetchQqLeads,
  } = useQuery<{
    leads: Array<{
      id: number;
      name: string | null;
      email: string | null;
      phone: string | null;
      quote_amount: number | null;
      status: string;
      created_date: string | null;
      utm_source: string | null;
    }>;
  }>({
    queryKey: ["/api/portal/quotequick", qqSummary?.calculator?.id, "leads"],
    queryFn: async () => {
      const res = await fetch(`/api/portal/quotequick/${qqSummary!.calculator!.id}/leads`, { credentials: "include" });
      if (!res.ok) throw new Error(`qq-leads ${res.status}`);
      return res.json();
    },
    enabled: !!isQuoteQuick && !!qqSummary?.calculator?.id,
  });

  // AdFlow past reports
  const {
    data: adflowReports,
    isError: adflowError,
    refetch: refetchAdflow,
  } = useQuery<Array<{
    id: number;
    period_label: string;
    period_start: string;
    period_end: string;
    metrics: any;
    ai_summary: string | null;
    sent_at: string | null;
  }>>({
    queryKey: ["/api/portal/adflow", serviceId, "reports"],
    queryFn: async () => {
      const res = await fetch(`/api/portal/adflow/${serviceId}/reports`, { credentials: "include" });
      if (!res.ok) throw new Error(`adflow-reports ${res.status}`);
      return res.json();
    },
    enabled: !!serviceId && !!isAdFlow,
  });

  return (
    <PortalLayout>
      {/* Portal pages are light-theme locked — see CONTRAST-2 (data-theme="light"). */}
      <div
        data-theme="light"
        className="max-w-4xl space-y-6"
      >
        {/* Back link */}
        <Link href="/portal/services" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Services
        </Link>

        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/70" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-4 text-sm flex items-center justify-between">
            <span>We couldn't load this service. It may have been removed, or there's a brief hiccup — try again.</span>
            <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-card border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              <RefreshCw className="w-3 h-3" /> Try again
            </button>
          </div>
        )}

        {data && (
          <>
            {/* Service header */}
            <div className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-foreground">
                    {data.service.service_name || data.service.service_id}
                  </h1>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    {data.service.category && (
                      <span className="capitalize">{data.service.category}</span>
                    )}
                    {data.service.billing_period && (
                      <span>{data.service.billing_period === "one-time" ? "One-time" : "Monthly"}</span>
                    )}
                    {data.service.started_at && (
                      <span>Started {formatDate(data.service.started_at)}</span>
                    )}
                  </div>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${SERVICE_STATUS_STYLES[data.service.status] || "bg-muted text-muted-foreground"}`}>
                  {statusLabel(SERVICE_STATUS_LABELS, data.service.status)}
                </span>
              </div>
            </div>

            {/* MapGuard subscribers — link prominently to the rich
                /portal/mapguard dashboard instead of leaving them on
                the generic task list (which is mostly empty for an
                ongoing-tier MapGuard subscription). */}
            {isMapguard && (
              <a
                href="/portal/mapguard"
                className="block bg-emerald-50/40 border border-emerald-200 rounded-xl p-5 hover:bg-emerald-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-brand-blue flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Open your MapGuard dashboard →</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      See your visibility score, Google ranking trends, post calendar, and the
                      improvements we've shipped this month.
                    </p>
                  </div>
                </div>
              </a>
            )}

            {/* TradeLine section */}
            {isTradeLine && tlError && (
              <SectionErrorRetry title="TradeLine status" onRetry={() => refetchTl()} />
            )}
            {isTradeLine && !tlError && tlData?.config && (
              <>
                {/* Status banner */}
                <TradeLineStatusBanner
                  mode={tlData.config.currentMode}
                  assistantStatus={tlData.assistantStatus}
                />

                {/* Mode control */}
                <div className="bg-card rounded-xl border border-border p-5">
                  <h2 className="text-sm font-semibold text-foreground mb-3">Current Mode</h2>
                  <ModeToggle
                    currentMode={tlData.config.currentMode as any}
                    clientServiceId={parseInt(serviceId!)}
                    apiBase="/api/portal/tradeline"
                    onModeChanged={() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline", serviceId] });
                    }}
                  />
                  {tlData.config.channels.voice && (
                    <p className="text-xs text-muted-foreground/70 mt-3 flex items-center gap-1.5">
                      <PhoneCall className="w-3 h-3" />
                      Your phone rings first. If you miss it, TradeLine steps in.
                    </p>
                  )}
                </div>

                {/* Voice & Style settings */}
                <VoiceAndStyleCard
                  clientServiceId={parseInt(serviceId!)}
                  config={tlData.config}
                  onSaved={() => queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline", serviceId] })}
                />

                {/* Business Hours */}
                <BusinessHoursCard
                  clientServiceId={parseInt(serviceId!)}
                  businessHours={tlData.config.businessHours}
                  onSaved={() => queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline", serviceId] })}
                />

                {/* Notification Settings */}
                <NotificationSettingsCard
                  clientServiceId={parseInt(serviceId!)}
                  notifications={tlData.config.notifications}
                  onSaved={() => queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline", serviceId] })}
                />

                {/* Usage summary */}
                {tlData.usage && (
                  <div className="bg-card rounded-xl border border-border p-5">
                    <h2 className="text-sm font-semibold text-foreground mb-3">This Month</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Calls</p>
                        <p className="text-lg font-semibold text-foreground">{tlData.usage.calls_count}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Voice Minutes</p>
                        <p className="text-lg font-semibold text-foreground">
                          {tlData.usage.voice_minutes_used}
                          <span className="text-sm font-normal text-muted-foreground/70">/{tlData.usage.included_minutes}</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">SMS</p>
                        <p className="text-lg font-semibold text-foreground">{tlData.usage.sms_count}</p>
                      </div>
                    </div>
                    {tlData.usage.overage_minutes > 0 && (
                      <p className="text-xs text-amber-600 mt-2">
                        {tlData.usage.overage_minutes} overage minutes this period
                      </p>
                    )}
                  </div>
                )}

                {/* Recent calls */}
                <TradeLineCallList
                  clientServiceId={parseInt(serviceId!)}
                  calls={tlData.recentCalls}
                />

                {/* Widget / hosted info */}
                {(tlData.config.website.embedMode !== "none" || tlData.config.website.hostedUrl) && (
                  <div className="bg-card rounded-xl border border-border p-5">
                    <h2 className="text-sm font-semibold text-foreground mb-2">Website Setup</h2>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      {tlData.config.website.embedMode !== "none" && (
                        <div className="flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 text-muted-foreground/70" />
                          <span>Install type: <span className="font-medium">{
                            tlData.config.website.embedMode === "direct_embed" ? "Installed on your website"
                            : tlData.config.website.embedMode === "hosted_fallback" ? "Hosted version"
                            : tlData.config.website.embedMode.replace(/_/g, " ")
                          }</span></span>
                        </div>
                      )}
                      {tlData.config.website.hostedUrl && (
                        <div className="flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 text-muted-foreground/70" />
                          <a href={tlData.config.website.hostedUrl} target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline text-xs truncate">
                            {tlData.config.website.hostedUrl}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Onboarding status */}
            {data.onboarding && data.onboarding.status !== "approved" && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    {data.onboarding.status === "submitted" ? "Setup form submitted" : "Setup form required"}
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    {statusLabel(ONBOARDING_STATUS_LABELS, data.onboarding.status)}
                    {data.onboarding.submitted_at && (
                      <> &middot; Submitted {formatDate(data.onboarding.submitted_at)}</>
                    )}
                  </p>
                </div>
                {data.onboarding.status !== "submitted" && (
                  <Link href={`/portal/onboarding/${data.onboarding.id}`}>
                    <button className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors whitespace-nowrap">
                      Complete setup
                    </button>
                  </Link>
                )}
              </div>
            )}

            {/* Service-specific: SiteLaunch Design Approval */}
            {isSiteLaunch && approvalTasks.length > 0 && (
              <>
                {approvalTasks.map((task) => (
                  <ApprovalGate
                    key={task.id}
                    task={task}
                    serviceQueryKey={["/api/portal/services", serviceId]}
                  />
                ))}
              </>
            )}

            {/* Service-specific: WebFix progress */}
            {isWebFix && data.tasks.length > 0 && (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-blue-600" />
                    <h2 className="text-sm font-semibold text-foreground">Fixes Progress</h2>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data.tasks.filter((t) => t.status === "delivered").length} of {data.tasks.length} fixes completed
                  </p>
                  {/* Progress bar */}
                  <div className="mt-2">
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${data.tasks.length > 0 ? Math.round((data.tasks.filter(t => t.status === "delivered").length / data.tasks.length) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
                {/* Post-fix before/after performance report. Stored in task
                    metadata (the deliverable row carries an empty url), so it
                    is surfaced via the response's webfix_audit field. */}
                {data.webfix_audit && (
                  <div className="px-5 py-4 border-b border-border">
                    <p className="text-xs font-medium text-foreground mb-2">Before / After Performance Report</p>
                    {(() => {
                      const wa = data.webfix_audit!;
                      const after = wa.metrics?.performance_score;
                      const delta = wa.comparison?.performance_delta;
                      const before =
                        after != null && delta != null ? after - delta : undefined;
                      return (
                        <>
                          {(before != null || after != null) && (
                            <div className="flex items-center gap-3 mb-3">
                              <div className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2 text-center">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Before</p>
                                <p className="text-lg font-semibold text-muted-foreground">{before ?? "-"}</p>
                              </div>
                              <div className="text-muted-foreground/50">→</div>
                              <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-center">
                                <p className="text-[10px] uppercase tracking-wide text-emerald-500">After</p>
                                <p className="text-lg font-semibold text-emerald-700">{after ?? "-"}</p>
                              </div>
                              {delta != null && delta > 0 && (
                                <div className="text-xs font-medium text-emerald-600 whitespace-nowrap">
                                  +{delta} pts
                                </div>
                              )}
                            </div>
                          )}
                          {wa.improvements_summary && (
                            <p className="text-sm font-medium text-foreground mb-1">{wa.improvements_summary}</p>
                          )}
                          {wa.ai_report && (
                            <p className="text-sm text-muted-foreground whitespace-pre-line">{wa.ai_report}</p>
                          )}
                          {wa.audited_at && (
                            <p className="text-[11px] text-muted-foreground/70 mt-2">
                              Verified {formatDate(wa.audited_at)}
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
                {/* Deliverables from completed tasks */}
                {webFixDeliverables.length > 0 && (
                  <div className="px-5 py-4">
                    <p className="text-xs font-medium text-foreground mb-2">Reports & Deliverables</p>
                    <DeliverableViewer deliverables={webFixDeliverables} showThumbnails={false} />
                  </div>
                )}
              </div>
            )}

            {/* Service-specific: WebCare monitoring */}
            {isWebCare && uptimeError && (
              <SectionErrorRetry title="uptime monitoring" onRetry={() => refetchUptime()} />
            )}
            {isWebCare && !uptimeError && (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-emerald-600" />
                      <h2 className="text-sm font-semibold text-foreground">Website Monitoring</h2>
                    </div>
                    {data.service.status === "active" && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700">
                        <Activity className="w-3 h-3" />
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your website is being monitored for uptime, security, and performance.
                  </p>
                </div>
                {/* Uptime display */}
                {uptimeData && uptimeData.total_checks > 0 && (
                  <div className="px-5 py-4 border-b border-border">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-foreground">Uptime</p>
                      <span className={`text-sm font-semibold ${
                        uptimeData.uptime_percent >= 99.5 ? "text-emerald-600"
                        : uptimeData.uptime_percent >= 95 ? "text-amber-600"
                        : "text-red-600"
                      }`}>
                        {uptimeData.uptime_percent}%
                      </span>
                    </div>
                    {/* Status dots — last 48 checks (12 hours at 15-min intervals) */}
                    <div className="flex gap-[3px] flex-wrap">
                      {uptimeData.history.slice(-48).map((entry, i) => (
                        <div
                          key={i}
                          title={`${new Date(entry.ts).toLocaleString()} — ${entry.status === "up" ? "Up" : "Down"}${entry.http_status ? ` (${entry.http_status})` : ""}`}
                          className={`w-2 h-2 rounded-full ${
                            entry.status === "up" ? "bg-emerald-400" : "bg-red-400"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 mt-1.5">
                      {uptimeData.total_checks} checks recorded
                      {uptimeData.down_checks > 0 && (
                        <> &middot; <span className="text-red-500">{uptimeData.down_checks} downtime{uptimeData.down_checks === 1 ? "" : "s"} detected</span></>
                      )}
                    </p>
                  </div>
                )}
                {/* Recent monthly tasks */}
                {data.tasks.length > 0 && (
                  <div className="px-5 py-4">
                    <p className="text-xs font-medium text-foreground mb-2">Recent Maintenance</p>
                    <ul className="space-y-2">
                      {data.tasks.slice(0, 6).map((task) => (
                        <li key={task.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <TaskIcon status={task.status} />
                            <span className={task.status === "delivered" ? "text-muted-foreground/70" : "text-foreground"}>
                              {task.title}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground/70">
                            {task.completed_at ? formatDate(task.completed_at) : task.due_at ? `Due ${formatDate(task.due_at)}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {/* Content change quota for pro tier */}
                    {data.service.service_id?.includes("pro") && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Content changes this month</span>
                          <span className="font-medium text-foreground">
                            {data.tasks.filter(t => t.title?.toLowerCase().includes("content") && t.status === "delivered").length} used
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Service-specific: AdFlow campaign metrics */}
            {isAdFlow && (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                    <h2 className="text-sm font-semibold text-foreground">Campaign Performance</h2>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your campaigns are managed by our agency partner.
                  </p>
                </div>

                {data.adflow_metrics && data.adflow_metrics.leads_generated != null ? (
                  <>
                    {/* KPI tiles */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-muted">
                      <div className="bg-card p-4">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Eye className="w-3 h-3 text-muted-foreground/70" />
                          <p className="text-[10px] text-muted-foreground">Impressions</p>
                        </div>
                        <p className="text-lg font-semibold text-foreground">
                          {data.adflow_metrics.impressions?.toLocaleString() ?? "-"}
                        </p>
                      </div>
                      <div className="bg-card p-4">
                        <div className="flex items-center gap-1.5 mb-1">
                          <MousePointerClick className="w-3 h-3 text-muted-foreground/70" />
                          <p className="text-[10px] text-muted-foreground">Clicks</p>
                        </div>
                        <p className="text-lg font-semibold text-foreground">
                          {data.adflow_metrics.clicks?.toLocaleString() ?? "-"}
                        </p>
                      </div>
                      <div className="bg-card p-4">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Users className="w-3 h-3 text-muted-foreground/70" />
                          <p className="text-[10px] text-muted-foreground">Leads</p>
                        </div>
                        <p className="text-lg font-semibold text-emerald-600">
                          {data.adflow_metrics.leads_generated?.toLocaleString() ?? "-"}
                        </p>
                      </div>
                      <div className="bg-card p-4">
                        <div className="flex items-center gap-1.5 mb-1">
                          <DollarSign className="w-3 h-3 text-muted-foreground/70" />
                          <p className="text-[10px] text-muted-foreground">Spend</p>
                        </div>
                        <p className="text-lg font-semibold text-foreground">
                          {data.adflow_metrics.cost_spent_cents != null
                            ? `$${(data.adflow_metrics.cost_spent_cents / 100).toFixed(2)}`
                            : "-"}
                        </p>
                      </div>
                      <div className="bg-card p-4">
                        <div className="flex items-center gap-1.5 mb-1">
                          <DollarSign className="w-3 h-3 text-muted-foreground/70" />
                          <p className="text-[10px] text-muted-foreground">Cost / Lead</p>
                        </div>
                        <p className="text-lg font-semibold text-foreground">
                          {data.adflow_metrics.leads_generated && data.adflow_metrics.cost_spent_cents
                            ? `$${(data.adflow_metrics.cost_spent_cents / data.adflow_metrics.leads_generated / 100).toFixed(2)}`
                            : "-"}
                        </p>
                      </div>
                    </div>

                    {/* Period info */}
                    {data.adflow_metrics.period_start && (
                      <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground/70">
                        Report period: {new Date(data.adflow_metrics.period_start).toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      Your first performance report will arrive after your campaigns have been running for a full month.
                    </p>
                  </div>
                )}

                {/* Next report note */}
                <div className="px-5 py-3 border-t border-border bg-muted/50">
                  <p className="text-xs text-muted-foreground">
                    Next report drops on the 2nd of every month. Ad spend is funded separately — you pay the ad platforms directly.
                  </p>
                </div>
              </div>
            )}

            {/* AdFlow Past Reports */}
            {isAdFlow && adflowError && (
              <SectionErrorRetry title="AdFlow reports" onRetry={() => refetchAdflow()} />
            )}
            {isAdFlow && !adflowError && adflowReports && adflowReports.length > 0 && (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">Past Reports</h2>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your monthly performance report history.
                  </p>
                </div>
                <div className="divide-y divide-gray-50">
                  {adflowReports.map((rpt) => {
                    const m = rpt.metrics || {};
                    return (
                      <div key={rpt.id} className="px-5 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
                        <div>
                          <p className="text-sm font-medium text-foreground">{rpt.period_label}</p>
                          {rpt.sent_at && (
                            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                              Sent {new Date(rpt.sent_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {m.leads_generated != null && (
                            <span>{m.leads_generated} lead{m.leads_generated === 1 ? "" : "s"}</span>
                          )}
                          {m.cost_spent_cents != null && (
                            <span>${(m.cost_spent_cents / 100).toFixed(0)} spend</span>
                          )}
                          {m.leads_generated != null && m.cost_spent_cents != null && m.leads_generated > 0 && (
                            <span>${(m.cost_spent_cents / m.leads_generated / 100).toFixed(0)}/lead</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* QuoteQuick: Recent Leads */}
            {isQuoteQuick && (qqSummaryError || qqLeadsError) && (
              <SectionErrorRetry
                title="QuoteQuick leads"
                onRetry={() => {
                  if (qqSummaryError) refetchQqSummary();
                  if (qqLeadsError) refetchQqLeads();
                }}
              />
            )}
            {isQuoteQuick && !qqSummaryError && !qqLeadsError && qqLeads && qqLeads.leads.length > 0 && (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-brand-blue-600" />
                    <h2 className="text-sm font-semibold text-foreground">Recent Leads</h2>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Last {qqLeads.leads.length} quote requests from your calculator.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b border-border">
                        <th className="px-5 py-2 font-medium">Name</th>
                        <th className="px-5 py-2 font-medium">Contact</th>
                        <th className="px-5 py-2 font-medium">Quote</th>
                        <th className="px-5 py-2 font-medium">Status</th>
                        <th className="px-5 py-2 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {qqLeads.leads.map((lead) => (
                        <tr key={lead.id}>
                          <td className="px-5 py-3 text-foreground">{lead.name || "-"}</td>
                          <td className="px-5 py-3 text-muted-foreground text-xs">
                            {lead.email && <div>{lead.email}</div>}
                            {lead.phone && <div>{lead.phone}</div>}
                          </td>
                          <td className="px-5 py-3 text-foreground font-medium whitespace-nowrap">
                            {lead.quote_amount != null ? `$${lead.quote_amount}` : "-"}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              lead.status === "won" ? "bg-emerald-50 text-emerald-700" :
                              lead.status === "contacted" ? "bg-blue-50 text-blue-700" :
                              lead.status === "lost" ? "bg-muted text-muted-foreground" :
                              "bg-brand-blue-50 text-brand-blue-700"
                            }`}>
                              {lead.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-muted-foreground text-xs whitespace-nowrap">
                            {formatDate(lead.created_date)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {qqSummary?.calculator && (
                  <div className="px-5 py-3 border-t border-border bg-muted/50 text-xs text-muted-foreground">
                    {qqSummary.calculator.total_leads} total leads &middot; {qqSummary.calculator.total_views} total views
                  </div>
                )}
              </div>
            )}

            {isQuoteQuick && !qqSummaryError && !qqLeadsError && qqLeads && qqLeads.leads.length === 0 && (
              <div className="bg-card rounded-xl border border-border p-5 text-center">
                <Users className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No leads yet. Once your calculator starts receiving quote requests, they'll appear here.</p>
              </div>
            )}

            {/* Task timeline (all services) */}
            <TaskTimeline tasks={data.tasks} />

            {/* All deliverables across tasks */}
            {allDeliverables.length > 0 && !isSiteLaunch && !isWebFix && (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="text-sm font-semibold text-foreground">Deliverables</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{allDeliverables.length} {allDeliverables.length === 1 ? "file" : "files"} attached</p>
                </div>
                <div className="px-5 py-4">
                  <DeliverableViewer deliverables={allDeliverables} />
                </div>
              </div>
            )}

            {/* Payments */}
            {data.payments.length > 0 && (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="text-sm font-semibold text-foreground">Payments</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b border-border">
                        <th className="px-5 py-2 font-medium">Date</th>
                        <th className="px-5 py-2 font-medium">Description</th>
                        <th className="px-5 py-2 font-medium">Amount</th>
                        <th className="px-5 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.payments.map((p) => (
                        <tr key={p.id}>
                          <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">{formatDate(p.created_at)}</td>
                          <td className="px-5 py-3 text-foreground">{p.description || "Invoice"}</td>
                          <td className="px-5 py-3 text-foreground font-medium whitespace-nowrap">{formatCents(p.amount_cents)}</td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${PAYMENT_STATUS_STYLES[p.status] || "bg-muted text-muted-foreground"}`}>
                              {statusLabel(PAYMENT_STATUS_LABELS, p.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PortalLayout>
  );
}
