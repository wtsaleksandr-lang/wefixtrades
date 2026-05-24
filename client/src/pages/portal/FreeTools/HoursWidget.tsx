import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Plus,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Save,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { cn } from "@/lib/utils";
import {
  FieldGroupHeader,
  TitleInField,
  TitleInFieldSelect,
} from "./_shared";

/**
 * Business Hours Widget — free-tools batch 1.
 *
 * Per-day open/close toggle + opens/closes time, plus holiday/special-day
 * overrides. Saves into clients.business_hours / clients.special_hours.
 * Variant attribute (badge | table | both) is set on the embed snippet.
 *
 * DS compliance (PR #692 audit): title-in-field + top-left help cue + 2px
 * input-cluster gaps + single .btn-primary-premium (Save hours).
 */

type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

interface DaySpec { open: boolean; opens?: string; closes?: string }
interface HoursMap { tz?: string; sun?: DaySpec; mon?: DaySpec; tue?: DaySpec; wed?: DaySpec; thu?: DaySpec; fri?: DaySpec; sat?: DaySpec }
interface SpecialDay { date: string; closed?: boolean; opens?: string; closes?: string }

interface HoursResponse {
  hours: HoursMap | null;
  special: SpecialDay[];
  widgetToken: string;
}

type Variant = "badge" | "table" | "both";

const DEFAULT_HOURS: HoursMap = {
  tz: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
  mon: { open: true, opens: "09:00", closes: "17:00" },
  tue: { open: true, opens: "09:00", closes: "17:00" },
  wed: { open: true, opens: "09:00", closes: "17:00" },
  thu: { open: true, opens: "09:00", closes: "17:00" },
  fri: { open: true, opens: "09:00", closes: "17:00" },
  sat: { open: false },
  sun: { open: false },
};

const timeInputClass =
  "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors";

export default function HoursWidget() {
  usePageTitle("Business Hours Widget");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data } = useQuery<HoursResponse>({
    queryKey: ["/api/portal/free-tools/hours"],
    queryFn: async () => {
      const r = await fetch("/api/portal/free-tools/hours", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load hours");
      return r.json();
    },
  });

  const widgetToken = data?.widgetToken ?? "";

  const [hours, setHours] = useState<HoursMap>(DEFAULT_HOURS);
  const [special, setSpecial] = useState<SpecialDay[]>([]);
  const [variant, setVariant] = useState<Variant>("both");
  const [newSpecialDate, setNewSpecialDate] = useState("");
  const [previewKey, setPreviewKey] = useState(0);
  const [howOpen, setHowOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!data) return;
    if (data.hours && Object.keys(data.hours).length) setHours({ ...DEFAULT_HOURS, ...data.hours });
    if (Array.isArray(data.special)) setSpecial(data.special);
  }, [data]);

  useCopilotForm({
    formLabel: "Business Hours",
    fields: [{ key: "tz", label: "Timezone (IANA like America/Toronto)", required: false }],
    values: { tz: hours.tz ?? "" },
    onApply: (fills) => {
      for (const f of fills) {
        if (f.field_key === "tz") setHours({ ...hours, tz: String(f.value ?? "") });
      }
    },
    enabled: true,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/portal/free-tools/hours", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours, special }),
      });
      if (!r.ok) throw new Error("Save failed");
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Hours updated." });
      qc.invalidateQueries({ queryKey: ["/api/portal/free-tools/hours"] });
      setPreviewKey((k) => k + 1);
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  const setDay = (k: DayKey, patch: Partial<DaySpec>) => {
    setHours({ ...hours, [k]: { ...(hours[k] ?? { open: false }), ...patch } });
  };

  const snippet = widgetToken
    ? `<script src="https://wefixtrades.com/widget/v1.js" data-site-key="${widgetToken}" data-tool="hours" data-variant="${variant}" async></script>`
    : "Loading…";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast({ title: "Copied", description: "Embed snippet copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Select the snippet and copy manually.", variant: "destructive" });
    }
  };

  const addSpecial = () => {
    if (!newSpecialDate || special.some((s) => s.date === newSpecialDate)) return;
    setSpecial([...special, { date: newSpecialDate, closed: true }]);
    setNewSpecialDate("");
  };

  return (
    <PortalLayout
      breadcrumb={
        <span className="flex items-center gap-1.5">
          <Link href="/portal/free-tools" className="hover:text-brand-blue">Free Tools</Link>
          <span className="text-gray-400">/</span>
          <span>Business Hours Widget</span>
        </span>
      }
    >
      <div data-theme="light" className="space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-gray-900">Business Hours Widget</h1>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            A drop-in "Open now / Closed" badge plus the full weekly table.
            Customers see live status in your timezone — the widget refreshes
            every 60 seconds.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Editor column */}
          <div className="lg:col-span-2 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Weekly hours"
                  help="Tick the days you're open and pick opening + closing times. The widget shows your live status using the timezone below."
                />
                <div className="space-y-0.5">
                  <TitleInField
                    id="hours-tz"
                    label="Timezone"
                    value={hours.tz ?? ""}
                    onChange={(v) => setHours({ ...hours, tz: v })}
                    placeholder="America/Toronto"
                    help="IANA timezone string, e.g. America/Toronto or Europe/London."
                  />

                  {DAYS.map(({ key, label }) => {
                    const d = hours[key] ?? { open: false };
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <label className="flex items-center gap-2 w-32 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            checked={!!d.open}
                            onChange={(e) => setDay(key, { open: e.target.checked, opens: d.opens ?? "09:00", closes: d.closes ?? "17:00" })}
                            className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/20"
                          />
                          {label}
                        </label>
                        <input
                          type="time"
                          aria-label={`${label} opens`}
                          disabled={!d.open}
                          value={d.opens ?? "09:00"}
                          onChange={(e) => setDay(key, { opens: e.target.value })}
                          className={cn(timeInputClass, "flex-1 disabled:opacity-50")}
                        />
                        <input
                          type="time"
                          aria-label={`${label} closes`}
                          disabled={!d.open}
                          value={d.closes ?? "17:00"}
                          onChange={(e) => setDay(key, { closes: e.target.value })}
                          className={cn(timeInputClass, "flex-1 disabled:opacity-50")}
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Special hours (holidays)"
                  help="Override a specific date — mark it closed, or set custom open/close times. The widget will show the special hours on that day only."
                />
                <div className="flex gap-1.5">
                  <input
                    type="date"
                    aria-label="New special day date"
                    className={timeInputClass}
                    value={newSpecialDate}
                    onChange={(e) => setNewSpecialDate(e.target.value)}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addSpecial} aria-label="Add special day">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {special.length > 0 && (
                  <ul className="space-y-0.5">
                    {special.map((s, i) => (
                      <li key={s.date} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-50 text-xs">
                        <span className="font-medium text-gray-700 w-24">{s.date}</span>
                        <label className="flex items-center gap-1 text-gray-600">
                          <input
                            type="checkbox"
                            checked={!!s.closed}
                            onChange={(e) => {
                              const copy = [...special];
                              copy[i] = { ...s, closed: e.target.checked };
                              setSpecial(copy);
                            }}
                            className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/20"
                          />
                          Closed
                        </label>
                        {!s.closed && (
                          <>
                            <input
                              type="time"
                              aria-label={`${s.date} opens`}
                              value={s.opens ?? "09:00"}
                              onChange={(e) => {
                                const copy = [...special];
                                copy[i] = { ...s, opens: e.target.value };
                                setSpecial(copy);
                              }}
                              className="px-2 py-1 text-xs border border-gray-200 rounded-md flex-1"
                            />
                            <input
                              type="time"
                              aria-label={`${s.date} closes`}
                              value={s.closes ?? "17:00"}
                              onChange={(e) => {
                                const copy = [...special];
                                copy[i] = { ...s, closes: e.target.value };
                                setSpecial(copy);
                              }}
                              className="px-2 py-1 text-xs border border-gray-200 rounded-md flex-1"
                            />
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => setSpecial(special.filter((x) => x.date !== s.date))}
                          className="text-gray-400 hover:text-red-600 ml-auto"
                          aria-label={`Remove ${s.date}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              {/* DS rule 4 — single .btn-primary-premium per page: the
                  primary action is persisting the hours edit. */}
              <Button
                type="button"
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
                className="btn-primary-premium"
                data-testid="hours-save-button"
              >
                <Save className="w-4 h-4 mr-1.5" />
                {saveMut.isPending ? "Saving…" : "Save hours"}
              </Button>
            </div>
          </div>

          {/* Snippet + preview */}
          <div className="lg:col-span-1 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Live preview"
                  help="Real render of the chosen display variant. Use the picker below to switch between badge, table, or both."
                />
                <TitleInFieldSelect
                  id="hours-variant"
                  label="Display variant"
                  value={variant}
                  onChange={(v) => setVariant(v as Variant)}
                  help="Badge = compact 'Open now' chip. Table = full weekly schedule. Both stacks them."
                >
                  <option value="badge">Badge only ("Open now")</option>
                  <option value="table">Weekly table only</option>
                  <option value="both">Both (badge + table)</option>
                </TitleInFieldSelect>
                {widgetToken && (
                  <iframe
                    key={previewKey}
                    title="Hours widget preview"
                    src={`/widget/preview/hours?token=${encodeURIComponent(widgetToken)}`}
                    className="w-full h-[300px] border border-gray-200 rounded-lg bg-slate-50"
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Embed snippet"
                  help="Paste this once anywhere in your site. The variant attribute matches the picker above."
                  right={
                    /* Secondary CTA — Save hours owns the premium accent. */
                    <Button
                      type="button"
                      onClick={handleCopy}
                      variant="outline"
                      size="sm"
                      disabled={!widgetToken}
                      data-testid="hours-copy-snippet"
                    >
                      {copied ? <><Check className="w-4 h-4 mr-1.5" />Copied</> : <><Copy className="w-4 h-4 mr-1.5" />Copy</>}
                    </Button>
                  }
                />
                <pre className="text-xs bg-slate-50 text-gray-800 p-3 rounded-md overflow-x-auto border border-gray-200">
                  <code>{snippet}</code>
                </pre>
                <p className="text-xs text-gray-500">
                  Free tier shows a "Powered by WeFixTrades" link. Auto-removed when you upgrade to any paid product.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <button
                  type="button"
                  onClick={() => setHowOpen((v) => !v)}
                  className="flex items-center justify-between w-full text-left"
                  aria-expanded={howOpen}
                >
                  <h2 className="text-sm font-semibold text-gray-900">How to install</h2>
                  {howOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                {howOpen && (
                  <ul className="mt-3 space-y-2 text-xs text-gray-700">
                    <li><strong>WordPress:</strong> paste snippet via a header/footer plugin or directly into a widget block.</li>
                    <li><strong>Wix:</strong> Add → Embed Code → paste the snippet.</li>
                    <li><strong>Squarespace:</strong> Add Block → Code → paste.</li>
                    <li><strong>Shopify:</strong> drop into <code>theme.liquid</code> or a sidebar section.</li>
                    <li><strong>Plain HTML:</strong> paste anywhere in <code>&lt;body&gt;</code>.</li>
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
