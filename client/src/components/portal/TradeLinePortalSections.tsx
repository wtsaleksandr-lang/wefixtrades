/**
 * TradeLine portal sub-sections.
 *
 * Four small cards used inside `PortalServiceDetail.tsx` to give
 * customers visibility + control over their TradeLine deployment:
 *
 *   <TradeLineStatusBanner />     — assistant build state at the top
 *   <BusinessHoursCard />         — timezone + per-day open/close
 *   <NotificationSettingsCard />  — recipient lists for SMS / email
 *   <TradeLineCallList />         — recent calls with drill-down
 *
 * All four hit real backend endpoints under /api/portal/tradeline/:csId
 * (settings POST extended in this PR to accept businessHours +
 * notifications). The components are intentionally self-contained —
 * each handles its own dirty-tracking, loading state, and post-save
 * cache invalidation.
 */

import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, Clock, Save, Phone, PhoneIncoming,
  PhoneMissed, ChevronRight, Mail, MessageSquare, Loader2, Plus, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

/* ─── Status banner ──────────────────────────────────────────────── */

export function TradeLineStatusBanner({
  mode,
  assistantStatus,
}: {
  mode: string;
  assistantStatus?: "not_built" | "building" | "built" | "failed";
}) {
  const config = (() => {
    if (assistantStatus === "built") {
      return {
        bg: "#ECFDF5",
        border: "#A7F3D0",
        ink: "#065F46",
        Icon: CheckCircle2,
        title: `TradeLine is live · mode: ${prettyMode(mode)}`,
        body: "Your assistant is built and answering calls.",
      };
    }
    if (assistantStatus === "building") {
      return {
        bg: "#FEF3C7",
        border: "#FCD34D",
        ink: "#92400E",
        Icon: Loader2,
        title: "TradeLine is building",
        body: "We're provisioning your assistant — usually a couple of minutes. This page will live-update.",
        spin: true,
      };
    }
    if (assistantStatus === "failed") {
      return {
        bg: "#FEF2F2",
        border: "#FECACA",
        ink: "#991B1B",
        Icon: AlertTriangle,
        title: "TradeLine build failed",
        body: "Something went wrong provisioning your assistant. Our team has been alerted — you don't need to do anything.",
      };
    }
    return {
      bg: "#F3F4F6",
      border: "#E5E7EB",
      ink: "#374151",
      Icon: Clock,
      title: "TradeLine setup in progress",
      body: "Finish onboarding to activate your TradeLine assistant.",
    };
  })();

  const { Icon, spin } = config;

  return (
    <div
      data-theme="light"
      role="status"
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        padding: "14px 16px",
        borderRadius: 12,
        background: config.bg,
        border: `1px solid ${config.border}`,
      }}
    >
      <Icon
        size={18}
        strokeWidth={1.8}
        style={{ color: config.ink, flexShrink: 0, marginTop: 2 }}
        className={spin ? "animate-spin" : undefined}
        aria-hidden
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: config.ink }}>{config.title}</p>
        <p style={{ margin: "3px 0 0", fontSize: 12, lineHeight: 1.5, color: config.ink, opacity: 0.85 }}>
          {config.body}
        </p>
      </div>
    </div>
  );
}

function prettyMode(mode: string): string {
  if (mode === "available") return "available";
  if (mode === "on_the_job") return "on the job";
  if (mode === "after_hours") return "after hours";
  return mode || "unknown";
}

/* ─── Business hours card ────────────────────────────────────────── */

const DAYS: Array<{ key: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"; label: string }> = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const TIMEZONES = [
  "America/Toronto",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Halifax",
];

export interface BusinessHoursValue {
  timezone: string;
  schedule: Partial<Record<typeof DAYS[number]["key"], { open: string; close: string; closed?: boolean }>>;
}

export function BusinessHoursCard({
  clientServiceId,
  businessHours,
  onSaved,
}: {
  clientServiceId: number;
  businessHours: BusinessHoursValue | undefined;
  onSaved?: () => void;
}) {
  const initial: BusinessHoursValue = {
    timezone: businessHours?.timezone || "America/Toronto",
    schedule: businessHours?.schedule || defaultSchedule(),
  };

  const [tz, setTz] = useState(initial.timezone);
  const [schedule, setSchedule] = useState(initial.schedule);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const dirty = useMemo(
    () => tz !== initial.timezone || JSON.stringify(schedule) !== JSON.stringify(initial.schedule),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tz, schedule],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/portal/tradeline/${clientServiceId}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ businessHours: { timezone: tz, schedule } }),
      });
      if (!res.ok) throw new Error(`save ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Business hours saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline", String(clientServiceId)] });
      onSaved?.();
    },
    onError: () => {
      toast({ title: "Couldn't save", description: "Try again in a moment.", variant: "destructive" });
    },
  });

  const updateDay = (
    key: typeof DAYS[number]["key"],
    patch: Partial<{ open: string; close: string; closed: boolean }>,
  ) => {
    setSchedule((prev) => ({
      ...prev,
      [key]: { open: "09:00", close: "17:00", ...prev[key], ...patch },
    }));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Business Hours</h2>
      <p className="text-xs text-gray-500 mb-4">
        Outside these hours TradeLine answers as your after-hours assistant — captures the lead and texts you in the morning.
      </p>

      <div className="space-y-[2px]">
        <label className="flex flex-col gap-1.5 pb-3 border-b border-gray-200 dark:border-gray-700">
          <span className="text-xs font-medium text-gray-700">Timezone</span>
          <select
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:border-gray-900 focus:outline-none"
          >
            {TIMEZONES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-2 pt-3">
          {DAYS.map(({ key, label }) => {
            const day = schedule[key];
            const closed = !day || day.closed;
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs font-medium text-gray-700 w-20 flex-shrink-0">{label}</span>
                <Switch
                  checked={!closed}
                  onCheckedChange={(v) =>
                    updateDay(key, v ? { closed: false } : { closed: true })
                  }
                  aria-label={`${label} open`}
                />
                {!closed && (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      type="time"
                      value={day?.open || "09:00"}
                      onChange={(e) => updateDay(key, { open: e.target.value })}
                      className="h-8 text-xs flex-1 max-w-[110px]"
                    />
                    <span className="text-xs text-gray-400">to</span>
                    <Input
                      type="time"
                      value={day?.close || "17:00"}
                      onChange={(e) => updateDay(key, { close: e.target.value })}
                      className="h-8 text-xs flex-1 max-w-[110px]"
                    />
                  </div>
                )}
                {closed && <span className="text-xs text-gray-400 italic">Closed</span>}
              </div>
            );
          })}
        </div>

        {dirty && (
          <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-700">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full"
              size="sm"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 mr-1.5" /> Save business hours
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function defaultSchedule(): BusinessHoursValue["schedule"] {
  return {
    mon: { open: "09:00", close: "17:00" },
    tue: { open: "09:00", close: "17:00" },
    wed: { open: "09:00", close: "17:00" },
    thu: { open: "09:00", close: "17:00" },
    fri: { open: "09:00", close: "17:00" },
    sat: { open: "09:00", close: "13:00", closed: true },
    sun: { open: "09:00", close: "13:00", closed: true },
  };
}

/* ─── Notification settings ──────────────────────────────────────── */

export function NotificationSettingsCard({
  clientServiceId,
  notifications,
  onSaved,
}: {
  clientServiceId: number;
  notifications: { sms: string[]; email: string[] } | undefined;
  onSaved?: () => void;
}) {
  const initial = {
    sms: notifications?.sms ?? [],
    email: notifications?.email ?? [],
  };

  const [sms, setSms] = useState<string[]>(initial.sms);
  const [email, setEmail] = useState<string[]>(initial.email);
  const [smsDraft, setSmsDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const dirty =
    JSON.stringify(sms) !== JSON.stringify(initial.sms) ||
    JSON.stringify(email) !== JSON.stringify(initial.email);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/portal/tradeline/${clientServiceId}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notifications: { sms, email } }),
      });
      if (!res.ok) throw new Error(`save ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Notification settings saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline", String(clientServiceId)] });
      onSaved?.();
    },
    onError: () => {
      toast({ title: "Couldn't save", description: "Try again in a moment.", variant: "destructive" });
    },
  });

  const addSms = () => {
    const v = smsDraft.trim();
    if (!v || sms.includes(v)) return;
    setSms([...sms, v]);
    setSmsDraft("");
  };
  const addEmail = () => {
    const v = emailDraft.trim();
    if (!v || !/^\S+@\S+\.\S+$/.test(v) || email.includes(v)) return;
    setEmail([...email, v]);
    setEmailDraft("");
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Notifications</h2>
      <p className="text-xs text-gray-500 mb-4">
        Where TradeLine sends you call summaries, lead notifications, and after-hours captures.
      </p>

      <div>
        <div className="pb-3 border-b border-gray-200 dark:border-gray-700">
          <Recipients
            label="SMS recipients"
            icon={<MessageSquare size={14} className="text-gray-500" />}
            values={sms}
            draft={smsDraft}
            setDraft={setSmsDraft}
            onAdd={addSms}
            onRemove={(v) => setSms(sms.filter((x) => x !== v))}
            placeholder="+1 555 123 4567"
            inputType="tel"
          />
        </div>
        <div className="pt-3 pb-3 border-b border-gray-200 dark:border-gray-700">
          <Recipients
            label="Email recipients"
            icon={<Mail size={14} className="text-gray-500" />}
            values={email}
            draft={emailDraft}
            setDraft={setEmailDraft}
            onAdd={addEmail}
            onRemove={(v) => setEmail(email.filter((x) => x !== v))}
            placeholder="alerts@yourbusiness.com"
            inputType="email"
          />
        </div>

        {dirty && (
          <div className="pt-3">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full"
              size="sm"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 mr-1.5" /> Save notifications
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Recipients({
  label, icon, values, draft, setDraft, onAdd, onRemove, placeholder, inputType,
}: {
  label: string;
  icon: React.ReactNode;
  values: string[];
  draft: string;
  setDraft: (v: string) => void;
  onAdd: () => void;
  onRemove: (v: string) => void;
  placeholder: string;
  inputType: "tel" | "email";
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-2">
        {icon} {label}
      </p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.length === 0 && (
          <span className="text-xs text-gray-400 italic">None — add at least one to get alerts</span>
        )}
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-md text-xs font-medium text-gray-700"
          >
            {v}
            <button
              type="button"
              onClick={() => onRemove(v)}
              aria-label={`Remove ${v}`}
              className="text-gray-400 hover:text-gray-700"
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          type={inputType}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder={placeholder}
          className="h-8 text-xs flex-1"
        />
        <Button type="button" size="sm" variant="outline" onClick={onAdd} className="h-8 px-2">
          <Plus size={14} />
        </Button>
      </div>
    </div>
  );
}

/* ─── Recent calls list ──────────────────────────────────────────── */

export interface TradeLineCallRow {
  id: number;
  caller_name?: string | null;
  caller_number?: string | null;
  outcome?: string | null;
  duration_seconds?: number | null;
  created_at?: string | null;
  intent?: string | null;
  summary?: string | null;
}

export function TradeLineCallList({
  clientServiceId,
  calls,
}: {
  clientServiceId: number;
  calls: TradeLineCallRow[];
}) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (!calls || calls.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Recent Calls</h2>
        <p className="text-xs text-gray-500">
          No calls yet. The first call to your TradeLine number will appear here within seconds.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-5 pb-3">
        <h2 className="text-sm font-semibold text-gray-900">Recent Calls</h2>
        <p className="text-xs text-gray-500 mt-0.5">Last {calls.length} — click to expand</p>
      </div>
      <ul className="divide-y divide-gray-100">
        {calls.map((c) => {
          const isOpen = openId === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : c.id)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 text-left transition-colors"
                aria-expanded={isOpen}
              >
                <CallOutcomeIcon outcome={c.outcome} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">
                    {c.caller_name || c.caller_number || "Unknown caller"}
                  </p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {c.intent || c.outcome || "—"}
                    {c.duration_seconds ? ` · ${formatDuration(c.duration_seconds)}` : ""}
                  </p>
                </div>
                <span className="text-[11px] text-gray-400 flex-shrink-0">{formatRelative(c.created_at)}</span>
                <ChevronRight
                  size={14}
                  className={`text-gray-300 flex-shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                />
              </button>
              {isOpen && c.summary && (
                <div className="px-5 py-3 bg-gray-50 text-xs text-gray-600 leading-relaxed border-t border-gray-100">
                  {c.summary}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {/* Suppress unused-prop warning for clientServiceId — reserved for
          a future "View all calls" deep link to /portal/tradeline/calls. */}
      <input type="hidden" data-cs={clientServiceId} />
    </div>
  );
}

function CallOutcomeIcon({ outcome }: { outcome?: string | null }) {
  const o = (outcome || "").toLowerCase();
  if (o.includes("missed") || o.includes("no_answer")) {
    return <PhoneMissed size={14} className="text-amber-600 flex-shrink-0" />;
  }
  if (o.includes("booked") || o.includes("converted")) {
    return <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0" />;
  }
  if (o.includes("voicemail")) {
    return <PhoneIncoming size={14} className="text-blue-600 flex-shrink-0" />;
  }
  return <Phone size={14} className="text-gray-400 flex-shrink-0" />;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatRelative(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}
