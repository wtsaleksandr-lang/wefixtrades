/**
 * BookFlow Setup page — /portal/bookflow-setup
 *
 * Lets a tradesperson configure their public online-booking page:
 * working hours, services, booking-page address (slug), slot length,
 * buffer, accent colour, confirmation message, auto-confirm, and the
 * active toggle. Wires to GET/PATCH /api/portal/bookflow/setup, which
 * drives the public /book/:slug page.
 */

import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
  Copy,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { FieldHelpCue, TitleInField, TitleInFieldTextarea } from "./FreeTools/_shared";

/* ─── Types ─── */

interface WorkingDay {
  enabled: boolean;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

interface ServiceDef {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  description?: string;
}

interface SetupData {
  configured?: boolean;
  is_active?: boolean;
  business_name?: string;
  slug?: string | null;
  timezone?: string;
  slot_duration_minutes?: number;
  buffer_minutes?: number;
  working_hours?: Record<string, WorkingDay> | null;
  services?: ServiceDef[] | null;
  confirmation_message?: string | null;
  auto_confirm?: boolean;
  accent_color?: string;
}

const DAYS: { key: string; label: string }[] = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

function defaultWorkingHours(): Record<string, WorkingDay> {
  const wh: Record<string, WorkingDay> = {};
  for (const d of DAYS) {
    const weekend = d.key === "saturday" || d.key === "sunday";
    wh[d.key] = { enabled: !weekend, start: "08:00", end: "17:00" };
  }
  return wh;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function newServiceId(): string {
  return `svc_${Math.random().toString(36).slice(2, 9)}`;
}

/* ─── Component ─── */

export default function BookFlowSetupPage() {
  usePageTitle("Booking Page Setup");
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: setup, isLoading } = useQuery<SetupData>({
    queryKey: ["/api/portal/bookflow/setup"],
    queryFn: async () => {
      const res = await fetch("/api/portal/bookflow/setup", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load BookFlow setup");
      return res.json();
    },
  });

  const [form, setForm] = useState<SetupData>({
    is_active: false,
    business_name: "",
    slug: "",
    timezone: "America/New_York",
    slot_duration_minutes: 60,
    buffer_minutes: 15,
    working_hours: defaultWorkingHours(),
    services: [],
    confirmation_message: "",
    auto_confirm: true,
    accent_color: "#3B82F6",
  });
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (!setup) return;
    setForm({
      is_active: setup.is_active ?? false,
      business_name: setup.business_name ?? "",
      slug: setup.slug ?? "",
      timezone: setup.timezone ?? "America/New_York",
      slot_duration_minutes: setup.slot_duration_minutes ?? 60,
      buffer_minutes: setup.buffer_minutes ?? 15,
      working_hours: setup.working_hours ?? defaultWorkingHours(),
      services: setup.services ?? [],
      confirmation_message: setup.confirmation_message ?? "",
      auto_confirm: setup.auto_confirm ?? true,
      accent_color: setup.accent_color ?? "#3B82F6",
    });
    if (setup.slug) setSlugTouched(true);
  }, [setup]);

  const saveMutation = useMutation({
    mutationFn: async (data: SetupData) => {
      const payload: Record<string, unknown> = {
        is_active: data.is_active,
        timezone: data.timezone,
        slot_duration_minutes: data.slot_duration_minutes,
        buffer_minutes: data.buffer_minutes,
        working_hours: data.working_hours,
        services: data.services ?? [],
        auto_confirm: data.auto_confirm,
        accent_color: data.accent_color,
      };
      if (data.business_name?.trim()) payload.business_name = data.business_name.trim();
      if (data.slug?.trim()) payload.slug = data.slug.trim();
      if (data.confirmation_message?.trim()) {
        payload.confirmation_message = data.confirmation_message.trim();
      }

      const res = await fetch("/api/portal/bookflow/setup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: (data: SetupData) => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/bookflow/setup"] });
      if (data.slug) setForm((p) => ({ ...p, slug: data.slug }));
      setSaved(true);
      setFormError(null);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const bookingUrl = useMemo(() => {
    if (!form.slug?.trim()) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/book/${form.slug.trim()}`;
  }, [form.slug]);

  /* Register the booking-page fields with the AI copilot. Applied fills
     land in local form state; the tradesperson still clicks Save. */
  useCopilotForm({
    formLabel: "BookFlow booking-page setup",
    fields: [
      { key: "business_name", label: "Business name shown on the public booking page", required: true },
      { key: "slug", label: "Booking page address (lowercase letters, numbers and hyphens only)", required: true },
      { key: "accent_color", label: "Accent colour as a hex code (e.g. #3B82F6)" },
      { key: "slot_duration_minutes", label: "Default slot length in minutes (5–480)" },
      { key: "buffer_minutes", label: "Buffer between jobs in minutes (0–240)" },
      { key: "confirmation_message", label: "Confirmation message shown to customers after they book" },
    ],
    values: {
      business_name: form.business_name ?? "",
      slug: form.slug ?? "",
      accent_color: form.accent_color ?? "",
      slot_duration_minutes: form.slot_duration_minutes ?? 60,
      buffer_minutes: form.buffer_minutes ?? 15,
      confirmation_message: form.confirmation_message ?? "",
    },
    onApply: (fills) => {
      for (const f of fills) {
        switch (f.field_key) {
          case "business_name":
            setForm((p) => ({ ...p, business_name: f.value }));
            break;
          case "slug":
            setSlugTouched(true);
            setForm((p) => ({ ...p, slug: slugify(f.value) }));
            break;
          case "accent_color":
            setForm((p) => ({ ...p, accent_color: f.value }));
            break;
          case "slot_duration_minutes": {
            const n = parseInt(f.value, 10);
            if (!Number.isNaN(n)) setForm((p) => ({ ...p, slot_duration_minutes: n }));
            break;
          }
          case "buffer_minutes": {
            const n = parseInt(f.value, 10);
            if (!Number.isNaN(n)) setForm((p) => ({ ...p, buffer_minutes: n }));
            break;
          }
          case "confirmation_message":
            setForm((p) => ({ ...p, confirmation_message: f.value }));
            break;
        }
      }
    },
  });

  const validate = (): string | null => {
    if (!form.business_name?.trim()) return "Business name is required.";
    if (!form.slug?.trim()) return "Booking page address is required.";
    if (!/^[a-z0-9-]+$/.test(form.slug.trim())) {
      return "Booking page address may only use lowercase letters, numbers and hyphens.";
    }
    const anyDay = DAYS.some((d) => form.working_hours?.[d.key]?.enabled);
    if (!anyDay) return "Enable at least one working day.";
    for (const d of DAYS) {
      const wd = form.working_hours?.[d.key];
      if (wd?.enabled && wd.start >= wd.end) {
        return `${d.label}: start time must be before end time.`;
      }
    }
    for (const s of form.services ?? []) {
      if (!s.name.trim()) return "Every service needs a name.";
      if (s.duration_minutes <= 0) return "Service duration must be greater than zero.";
    }
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    saveMutation.mutate(form);
  };

  const updateDay = (key: string, patch: Partial<WorkingDay>) => {
    setForm((p) => ({
      ...p,
      working_hours: {
        ...(p.working_hours ?? defaultWorkingHours()),
        [key]: { ...(p.working_hours?.[key] ?? { enabled: false, start: "08:00", end: "17:00" }), ...patch },
      },
    }));
  };

  const updateService = (id: string, patch: Partial<ServiceDef>) => {
    setForm((p) => ({
      ...p,
      services: (p.services ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  };

  const addService = () => {
    setForm((p) => ({
      ...p,
      services: [
        ...(p.services ?? []),
        { id: newServiceId(), name: "", duration_minutes: 60, price_cents: 0, description: "" },
      ],
    }));
  };

  const removeService = (id: string) => {
    setForm((p) => ({ ...p, services: (p.services ?? []).filter((s) => s.id !== id) }));
  };

  const copyUrl = () => {
    if (!bookingUrl) return;
    navigator.clipboard?.writeText(bookingUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const inputClass =
    "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors";
  const cardClass = "bg-white rounded-xl border border-gray-200 p-5";

  return (
    <PortalLayout>
      {/* data-cue-allowed-multiple: each FieldHelpCue below belongs to a
          different input (one cue per field, locked input rules). */}
      <div data-theme="light" className="max-w-2xl space-y-6" data-cue-allowed-multiple>
        <div>
          <Link href="/portal/dispatch">
            <a
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-brand-blue transition-colors mb-2"
              data-testid="link-back-to-dispatch"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Back to Today's jobs
            </a>
          </Link>
          <h2 className="text-xl font-semibold text-foreground">Booking Page Setup</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure the online booking page customers use to schedule appointments with you.
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {!isLoading && (
          <form onSubmit={handleSubmit} className="space-y-4" data-cue-allowed-multiple>
            {/* Activation + public URL */}
            <div className={cardClass}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Booking Page Active</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    When off, your public booking page shows "not found".
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active ?? false}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="sr-only peer"
                    data-testid="toggle-bookflow-active"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-brand-blue/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-blue"></div>
                </label>
              </div>

              {bookingUrl && (
                <div className="mt-3 flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-600 truncate flex-1">{bookingUrl}</span>
                  <button
                    type="button"
                    onClick={copyUrl}
                    className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-brand-blue"
                  >
                    <Copy className="w-3 h-3" />
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <a
                    href={bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-brand-blue"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open
                  </a>
                </div>
              )}
            </div>

            {/* Business + slug */}
            <div className={`${cardClass} space-y-4`} data-cue-allowed-multiple>
              <h2 className="text-sm font-semibold text-gray-900">Page Details</h2>

              {/* Title-in-field inputs (locked input rules) — labels float
                  inside the fields, help cues top-left, 2px stack gap. */}
              <div className="space-y-0.5" data-cue-allowed-multiple>
                <TitleInField
                  id="bookflow-business-name"
                  label="Business Name"
                  value={form.business_name || ""}
                  onChange={(name) => {
                    setForm((p) => ({
                      ...p,
                      business_name: name,
                      slug: slugTouched ? p.slug : slugify(name),
                    }));
                  }}
                  placeholder="Acme Plumbing"
                  help="Shown at the top of your public booking page."
                  testid="input-business-name"
                />

                <div className="relative pl-5">
                  <span className="absolute top-1 left-0">
                    <FieldHelpCue
                      label="Booking Page Address"
                      help="The public link customers visit. Lowercase letters, numbers and hyphens only."
                    />
                  </span>
                  <div className="flex items-stretch">
                    <span className="px-3 text-sm text-gray-500 bg-gray-50 border border-r-0 border-gray-200 rounded-l-lg whitespace-nowrap flex items-center">
                      /book/
                    </span>
                    <TitleInField
                      id="bookflow-slug"
                      label="Booking Page Address"
                      className="flex-1 pl-0"
                      inputClassName="rounded-l-none"
                      value={form.slug || ""}
                      onChange={(v) => {
                        setSlugTouched(true);
                        setForm({ ...form, slug: slugify(v) });
                      }}
                      placeholder="acme-plumbing"
                      testid="input-slug"
                    />
                  </div>
                </div>

                <div className="relative pl-5">
                  <span className="absolute top-1 left-0">
                    <FieldHelpCue
                      label="Accent Colour"
                      help="The highlight colour on your booking page — pick with the swatch or paste a hex code like #3B82F6."
                    />
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.accent_color || "#3B82F6"}
                      onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                      className="w-10 h-[46px] rounded border border-gray-200 cursor-pointer"
                      data-testid="input-accent-color"
                      aria-label="Accent colour swatch"
                    />
                    <TitleInField
                      id="bookflow-accent-hex"
                      label="Accent Colour"
                      className="w-40 pl-0"
                      value={form.accent_color || ""}
                      onChange={(v) => setForm({ ...form, accent_color: v })}
                      placeholder="#3B82F6"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Working hours */}
            <div className={`${cardClass} space-y-3`}>
              <h2 className="text-sm font-semibold text-gray-900">Working Hours</h2>
              <p className="text-xs text-gray-500 -mt-2">
                Booking slots are generated within these hours for each enabled day.
              </p>
              {DAYS.map((d) => {
                const wd = form.working_hours?.[d.key] ?? { enabled: false, start: "08:00", end: "17:00" };
                return (
                  <div key={d.key} className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={wd.enabled}
                        onChange={(e) => updateDay(d.key, { enabled: e.target.checked })}
                        className="sr-only peer"
                        data-testid={`toggle-day-${d.key}`}
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-brand-blue/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-blue"></div>
                    </label>
                    <span className="text-xs font-medium text-gray-700 w-20 shrink-0">{d.label}</span>
                    <input
                      type="time"
                      value={wd.start}
                      disabled={!wd.enabled}
                      onChange={(e) => updateDay(d.key, { start: e.target.value })}
                      className={`${inputClass} w-28 disabled:opacity-40`}
                    />
                    <span className="text-xs text-gray-400">to</span>
                    <input
                      type="time"
                      value={wd.end}
                      disabled={!wd.enabled}
                      onChange={(e) => updateDay(d.key, { end: e.target.value })}
                      className={`${inputClass} w-28 disabled:opacity-40`}
                    />
                  </div>
                );
              })}
            </div>

            {/* Slot config */}
            <div className={`${cardClass} space-y-4`}>
              <h2 className="text-sm font-semibold text-gray-900">Scheduling</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5">
                <TitleInField
                  id="bookflow-slot-duration"
                  label="Default Slot Length (minutes)"
                  type="number"
                  min={5}
                  max={480}
                  value={String(form.slot_duration_minutes ?? 60)}
                  onChange={(v) =>
                    setForm({ ...form, slot_duration_minutes: parseInt(v) || 60 })
                  }
                  help="How long one booking takes by default — customers see openings this size."
                  testid="input-slot-duration"
                />
                <TitleInField
                  id="bookflow-buffer"
                  label="Buffer Between Jobs (minutes)"
                  type="number"
                  min={0}
                  max={240}
                  value={String(form.buffer_minutes ?? 15)}
                  onChange={(v) => setForm({ ...form, buffer_minutes: parseInt(v) || 0 })}
                  help="Breathing room added after each job for travel and cleanup before the next slot opens."
                  testid="input-buffer"
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-xs font-medium text-gray-600">Auto-confirm bookings</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    On: bookings are confirmed instantly. Off: they arrive as "pending".
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.auto_confirm ?? true}
                    onChange={(e) => setForm({ ...form, auto_confirm: e.target.checked })}
                    className="sr-only peer"
                    data-testid="toggle-auto-confirm"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-brand-blue/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-blue"></div>
                </label>
              </div>
            </div>

            {/* Services */}
            <div className={`${cardClass} space-y-3`}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Services</h2>
                <button
                  type="button"
                  onClick={addService}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:text-brand-blue-600"
                  data-testid="button-add-service"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Service
                </button>
              </div>
              <p className="text-xs text-gray-500 -mt-1">
                Optional. If you add services, customers pick one first. Leave empty for a single
                generic booking flow.
              </p>

              {(form.services ?? []).length === 0 && (
                <p className="text-xs text-gray-400 py-2">No services yet.</p>
              )}

              {(form.services ?? []).map((svc) => (
                <div
                  key={svc.id}
                  className="border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50/60"
                >
                  <div className="flex items-center gap-2">
                    <input
                      className={`${inputClass} flex-1`}
                      value={svc.name}
                      onChange={(e) => updateService(svc.id, { name: e.target.value })}
                      placeholder="Service name (e.g. Drain Cleaning)"
                      data-testid={`input-service-name-${svc.id}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeService(svc.id)}
                      className="p-2 text-gray-400 hover:text-red-600"
                      aria-label="Remove service"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5">
                    <TitleInField
                      id={`svc-${svc.id}-duration`}
                      label="Duration (min)"
                      type="number"
                      min={5}
                      value={String(svc.duration_minutes)}
                      onChange={(v) =>
                        updateService(svc.id, { duration_minutes: parseInt(v) || 0 })
                      }
                      help="How long this service takes — its bookings use this instead of the default slot length."
                    />
                    <TitleInField
                      id={`svc-${svc.id}-price`}
                      label="Price ($)"
                      type="number"
                      min={0}
                      step="0.01"
                      value={(svc.price_cents / 100).toString()}
                      onChange={(v) =>
                        updateService(svc.id, {
                          price_cents: Math.round((parseFloat(v) || 0) * 100),
                        })
                      }
                      help="Shown to customers while they pick a service. Leave 0 to hide pricing."
                    />
                  </div>
                  <input
                    className={inputClass}
                    value={svc.description || ""}
                    onChange={(e) => updateService(svc.id, { description: e.target.value })}
                    placeholder="Short description (optional)"
                  />
                </div>
              ))}
            </div>

            {/* Confirmation message */}
            <div className={cardClass}>
              <TitleInFieldTextarea
                id="bookflow-confirmation-message"
                label="Confirmation Message"
                rows={3}
                value={form.confirmation_message || ""}
                onChange={(v) => setForm({ ...form, confirmation_message: v })}
                help="Shown to customers right after they book — e.g. 'We'll text you the morning of your appointment.'"
                testid="input-confirmation-message"
              />
            </div>

            {/* Save */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="px-5 py-2.5 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue-600 transition-colors disabled:opacity-60"
                data-testid="button-save-setup"
              >
                {saveMutation.isPending ? "Saving..." : "Save Booking Page"}
              </button>
              {saved && (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <Check className="w-3.5 h-3.5" /> Saved
                </span>
              )}
              {formError && <span className="text-xs text-red-600">{formError}</span>}
            </div>
          </form>
        )}
      </div>
    </PortalLayout>
  );
}
