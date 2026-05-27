import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PhoneCall,
  Copy,
  Check,
  Save,
  Trash2,
  Sparkles,
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
  FieldHelpCue,
  TitleInField,
  TitleInFieldSelect,
} from "./_shared";

/**
 * Callback Form widget portal page — free-tools batch 2.
 * Edit widget config + view / triage incoming callback requests.
 *
 * DS compliance (PR #692 audit): title-in-field + top-left help cue + 2px
 * input-cluster gaps + single .btn-primary-premium (Save settings).
 */

interface CallbackFields {
  name: boolean;
  phone: boolean;
  message: boolean;
  best_time: boolean;
}
interface CallbackConfigResp {
  enabled: boolean;
  heading: string;
  cta_label: string;
  fields_json: CallbackFields;
  widgetToken: string;
}
interface CallbackLead {
  id: string;
  name: string;
  phone: string;
  message: string | null;
  best_time: string | null;
  source_url: string | null;
  visitor_ip: string | null;
  status: "new" | "contacted" | "spam";
  created_at: string;
}

type Mode = "inline" | "popup";

export default function CallbackForm() {
  usePageTitle("Callback Form Widget");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading: configLoading, error: configError } = useQuery<CallbackConfigResp>({
    queryKey: ["/api/portal/free-tools/callback"],
    queryFn: async () => {
      const r = await fetch("/api/portal/free-tools/callback", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
  });

  const [statusFilter, setStatusFilter] = useState<"" | "new" | "contacted" | "spam">("new");
  const leadsQuery = useQuery<{ items: CallbackLead[] }>({
    queryKey: ["/api/portal/free-tools/callback/leads", statusFilter],
    queryFn: async () => {
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      const r = await fetch("/api/portal/free-tools/callback/leads" + qs, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
  });

  // Wave 43 — safe defaults must match the CallbackFields shape exactly.
  // The earlier `setFields(data.fields_json)` blindly trusted the server
  // payload; if `fields_json` was null (older rows pre-migration) the
  // subsequent `fields[key]` reads crashed the page.
  const DEFAULT_FIELDS: CallbackFields = { name: true, phone: true, message: true, best_time: true };

  const [enabled, setEnabled] = useState(true);
  const [heading, setHeading] = useState("Request a callback");
  const [ctaLabel, setCtaLabel] = useState("Send request");
  const [fields, setFields] = useState<CallbackFields>(DEFAULT_FIELDS);
  const [mode, setMode] = useState<Mode>("inline");
  const [previewKey, setPreviewKey] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!data) return;
    setEnabled(Boolean(data.enabled));
    setHeading(typeof data.heading === "string" ? data.heading : "Request a callback");
    setCtaLabel(typeof data.cta_label === "string" ? data.cta_label : "Send request");
    // Defensive merge — `fields_json` can be null/partial on older rows.
    const raw = (data.fields_json ?? {}) as Partial<CallbackFields>;
    setFields({
      name: typeof raw.name === "boolean" ? raw.name : DEFAULT_FIELDS.name,
      phone: typeof raw.phone === "boolean" ? raw.phone : DEFAULT_FIELDS.phone,
      message: typeof raw.message === "boolean" ? raw.message : DEFAULT_FIELDS.message,
      best_time: typeof raw.best_time === "boolean" ? raw.best_time : DEFAULT_FIELDS.best_time,
    });
  }, [data]);

  useCopilotForm({
    formLabel: "Callback Widget",
    fields: [
      { key: "heading", label: "Widget heading shown above the form", required: true },
      { key: "cta_label", label: "Submit button label", required: true },
    ],
    values: { heading, cta_label: ctaLabel },
    onApply: (fills) => {
      for (const f of fills) {
        const v = String(f.value ?? "");
        if (f.field_key === "heading") setHeading(v);
        if (f.field_key === "cta_label") setCtaLabel(v);
      }
    },
    enabled: true,
  });

  const widgetToken = data?.widgetToken ?? "";

  const snippet = widgetToken
    ? `<script src="https://wefixtrades.com/widget/v1.js" data-site-key="${widgetToken}" data-tool="callback" data-mode="${mode}" async></script>`
    : "Loading…";

  const saveMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/portal/free-tools/callback", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, heading, cta_label: ctaLabel, fields_json: fields }),
      });
      if (!r.ok) throw new Error("Save failed");
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Callback widget updated." });
      qc.invalidateQueries({ queryKey: ["/api/portal/free-tools/callback"] });
      setPreviewKey((k) => k + 1);
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  const statusMut = useMutation({
    mutationFn: async (args: { id: string; status: CallbackLead["status"] }) => {
      const r = await fetch(`/api/portal/free-tools/callback/leads/${args.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: args.status }),
      });
      if (!r.ok) throw new Error("Update failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portal/free-tools/callback/leads"] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/portal/free-tools/callback/leads/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portal/free-tools/callback/leads"] }),
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast({ title: "Copied", description: "Embed snippet copied." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Select the snippet and copy manually.", variant: "destructive" });
    }
  };

  const showUpsell = useMemo(() => {
    const items = Array.isArray(leadsQuery.data?.items) ? leadsQuery.data.items : [];
    const count = items.filter((l) => {
      if (!l?.created_at) return false;
      const ts = new Date(l.created_at).getTime();
      if (!Number.isFinite(ts)) return false;
      const ageDays = (Date.now() - ts) / 86_400_000;
      return ageDays <= 7;
    }).length;
    return count >= 5;
  }, [leadsQuery.data]);

  return (
    <PortalLayout
      breadcrumb={
        <span className="flex items-center gap-1.5">
          <Link href="/portal/free-tools" className="hover:text-brand-blue">Free Tools</Link>
          <span className="text-gray-400">/</span>
          <span>Callback Form</span>
        </span>
      }
    >
      <div data-theme="light" className="space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <PhoneCall className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-gray-900">Callback Form Widget</h1>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            A simple drop-in form so site visitors can request a call back when
            you're busy on the truck. Anti-spam built in (honeypot + per-IP
            rate-limit). Replies land in your inbox below.
          </p>
        </header>

        {configLoading && !data && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-xs text-gray-500" data-testid="callback-config-loading">
            Loading your callback widget settings…
          </div>
        )}
        {configError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-700" data-testid="callback-config-error">
            Couldn't load your widget settings. Refresh the page in a moment — your previous settings are safe.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Editor */}
          <div className="lg:col-span-2 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Widget settings"
                  help="Edit how the callback form looks and which optional fields it asks for. Phone is always required — it's the lead."
                />

                <label className="flex items-center gap-2 pl-5">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/20"
                  />
                  <span className="text-sm text-gray-700">Widget is enabled</span>
                </label>

                <div className="space-y-0.5">
                  <TitleInField
                    id="cb-heading"
                    label="Heading"
                    value={heading}
                    onChange={setHeading}
                    help="The bold heading shown above the form on your site."
                  />
                  <TitleInField
                    id="cb-cta"
                    label="Submit button label"
                    value={ctaLabel}
                    onChange={setCtaLabel}
                    help="Text on the submit button — keep it short and action-y."
                  />
                </div>

                <div className="relative pl-5">
                  <span className="absolute top-1 left-0">
                    <FieldHelpCue label="Fields to show" help="Choose which optional fields the form asks for. Phone is always required." />
                  </span>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Fields to show</div>
                  <div className="space-y-0.5">
                    {(["name", "best_time", "message"] as Array<keyof CallbackFields>).map((key) => (
                      <label key={key} className="flex items-center gap-2 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={fields[key]}
                          onChange={(e) => setFields({ ...fields, [key]: e.target.checked })}
                          className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/20"
                        />
                        {key === "best_time" ? "Best time to call" : key.charAt(0).toUpperCase() + key.slice(1)}
                      </label>
                    ))}
                    <p className="text-[11px] text-gray-500">Phone is always required — it's the lead.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              {/* DS rule 4 — single .btn-primary-premium per page: Save. */}
              <Button
                type="button"
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
                className="btn-primary-premium"
                data-testid="callback-save"
              >
                <Save className="w-4 h-4 mr-1.5" />
                {saveMut.isPending ? "Saving…" : "Save settings"}
              </Button>
            </div>

            {/* Lead inbox */}
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Incoming callbacks"
                  help="Triage callbacks by status. Mark contacted once you've returned the call; spam removes obvious junk from the active view."
                  right={
                    <select
                      aria-label="Filter by status"
                      className="text-xs border border-gray-200 rounded-md px-2 py-1"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as "" | "new" | "contacted" | "spam")}
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="spam">Spam</option>
                      <option value="">All</option>
                    </select>
                  }
                />
                {leadsQuery.isLoading ? (
                  <p className="text-xs text-gray-500">Loading…</p>
                ) : leadsQuery.error ? (
                  <p className="text-xs text-gray-500">Couldn't load callbacks. Refresh in a moment.</p>
                ) : !Array.isArray(leadsQuery.data?.items) || leadsQuery.data.items.length === 0 ? (
                  <p className="text-xs text-gray-500">No callbacks in this view yet.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {leadsQuery.data.items.map((row) => (
                      <li key={row.id} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-sm font-semibold text-gray-900">{row.name}</span>
                              <a
                                href={`tel:${row.phone}`}
                                className="text-sm text-brand-blue underline-offset-2 hover:underline"
                              >
                                {row.phone}
                              </a>
                              <span className={cn(
                                "text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide",
                                row.status === "new" && "bg-blue-100 text-blue-700",
                                row.status === "contacted" && "bg-green-100 text-green-700",
                                row.status === "spam" && "bg-red-100 text-red-700",
                              )}>
                                {row.status}
                              </span>
                              <span className="text-[11px] text-gray-500">
                                {new Date(row.created_at).toLocaleString()}
                              </span>
                            </div>
                            {row.best_time && (
                              <p className="text-xs text-gray-600"><span className="font-medium">Best time:</span> {row.best_time}</p>
                            )}
                            {row.message && (
                              <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{row.message}</p>
                            )}
                            {row.source_url && (
                              <p className="text-[11px] text-gray-500 mt-1 truncate">From: {row.source_url}</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {row.status !== "contacted" && (
                              <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: row.id, status: "contacted" })}>
                                Contacted
                              </Button>
                            )}
                            {row.status !== "spam" && (
                              <button
                                type="button"
                                onClick={() => statusMut.mutate({ id: row.id, status: "spam" })}
                                className="text-[11px] text-gray-500 hover:text-red-600"
                              >
                                Mark spam
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => deleteMut.mutate(row.id)}
                              className="text-gray-400 hover:text-red-600"
                              aria-label="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Preview + snippet */}
          <div className="lg:col-span-1 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Live preview"
                  help="Real render of the chosen display mode. Inline = rendered where the snippet is pasted, Popup = bottom-right launcher."
                />
                <TitleInFieldSelect
                  id="cb-mode"
                  label="Display mode"
                  value={mode}
                  onChange={(v) => setMode(v as Mode)}
                  help="Inline drops the form into the page; Popup floats a launcher button in the bottom-right corner."
                >
                  <option value="inline">Inline (rendered where you paste)</option>
                  <option value="popup">Popup launcher (bottom-right)</option>
                </TitleInFieldSelect>
                {widgetToken && (
                  <iframe
                    key={previewKey}
                    title="Callback widget preview"
                    src={`/widget/preview/callback?token=${encodeURIComponent(widgetToken)}`}
                    className="w-full h-[360px] border border-gray-200 rounded-lg bg-slate-50"
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Embed snippet"
                  help="Paste this once anywhere in your site to drop in the callback form."
                  right={
                    <Button
                      type="button"
                      onClick={handleCopy}
                      variant="outline"
                      size="sm"
                      disabled={!widgetToken}
                      data-testid="callback-copy-snippet"
                    >
                      {copied ? <><Check className="w-4 h-4 mr-1.5" />Copied</> : <><Copy className="w-4 h-4 mr-1.5" />Copy</>}
                    </Button>
                  }
                />
                <pre className="text-xs bg-slate-50 text-gray-800 p-3 rounded-md overflow-x-auto border border-gray-200">
                  <code>{snippet}</code>
                </pre>
                <p className="text-xs text-gray-500">
                  Free tier shows a "Powered by WeFixTrades" link. Auto-removed when you upgrade.
                </p>
              </CardContent>
            </Card>

            {showUpsell && (
              <Card className="border-brand-blue/30 bg-brand-blue/5">
                <CardContent className="p-5">
                  <div className="flex items-start gap-2 mb-1.5">
                    <Sparkles className="w-4 h-4 text-brand-blue mt-0.5" aria-hidden="true" />
                    <h2 className="text-sm font-semibold text-gray-900">5+ callbacks this week — go AI?</h2>
                  </div>
                  <p className="text-xs text-gray-700 mb-3">
                    TradeLine auto-qualifies and replies to callbacks within
                    seconds in your voice. Never miss a job because you were on
                    a roof.
                  </p>
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href="/products/tradeline">Try TradeLine</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
