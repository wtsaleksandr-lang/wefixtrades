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

/**
 * Callback Form widget portal page — free-tools batch 2.
 * Edit widget config + view / triage incoming callback requests.
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

const labelClass = "block text-xs font-medium text-gray-600 mb-1";
const inputClass =
  "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors";

export default function CallbackForm() {
  usePageTitle("Callback Form Widget");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data } = useQuery<CallbackConfigResp>({
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

  const [enabled, setEnabled] = useState(true);
  const [heading, setHeading] = useState("Request a callback");
  const [ctaLabel, setCtaLabel] = useState("Send request");
  const [fields, setFields] = useState<CallbackFields>({ name: true, phone: true, message: true, best_time: true });
  const [mode, setMode] = useState<Mode>("inline");
  const [previewKey, setPreviewKey] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setHeading(data.heading);
    setCtaLabel(data.cta_label);
    setFields(data.fields_json);
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
    const count = leadsQuery.data?.items.filter((l) => {
      const ageDays = (Date.now() - new Date(l.created_at).getTime()) / 86_400_000;
      return ageDays <= 7;
    }).length ?? 0;
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Editor */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardContent className="p-5 space-y-4">
                <h2 className="text-sm font-semibold text-gray-900">Widget settings</h2>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/20"
                  />
                  <span className="text-sm text-gray-700">Widget is enabled</span>
                </label>

                <div>
                  <label className={labelClass} htmlFor="cb-heading">Heading</label>
                  <input
                    id="cb-heading"
                    className={inputClass}
                    value={heading}
                    onChange={(e) => setHeading(e.target.value)}
                  />
                </div>

                <div>
                  <label className={labelClass} htmlFor="cb-cta">Submit button label</label>
                  <input
                    id="cb-cta"
                    className={inputClass}
                    value={ctaLabel}
                    onChange={(e) => setCtaLabel(e.target.value)}
                  />
                </div>

                <div>
                  <div className={labelClass}>Fields to show</div>
                  <div className="space-y-1.5">
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
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h2 className="text-sm font-semibold text-gray-900">Incoming callbacks</h2>
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
                </div>
                {leadsQuery.isLoading ? (
                  <p className="text-xs text-gray-500">Loading…</p>
                ) : !leadsQuery.data?.items.length ? (
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
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardContent className="p-5 space-y-3">
                <h2 className="text-sm font-semibold text-gray-900">Live preview</h2>
                <div>
                  <label className={labelClass} htmlFor="cb-mode">Display mode</label>
                  <select
                    id="cb-mode"
                    className={inputClass}
                    value={mode}
                    onChange={(e) => setMode(e.target.value as Mode)}
                  >
                    <option value="inline">Inline (rendered where you paste)</option>
                    <option value="popup">Popup launcher (bottom-right)</option>
                  </select>
                </div>
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
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900">Embed snippet</h2>
                  <Button
                    type="button"
                    onClick={handleCopy}
                    className="btn-primary-premium"
                    disabled={!widgetToken}
                    data-testid="callback-copy-snippet"
                  >
                    {copied ? <><Check className="w-4 h-4 mr-1.5" />Copied</> : <><Copy className="w-4 h-4 mr-1.5" />Copy</>}
                  </Button>
                </div>
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
