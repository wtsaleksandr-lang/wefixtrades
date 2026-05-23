import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  HelpCircle,
  Plus,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { cn } from "@/lib/utils";

/**
 * FAQ Widget — free-tools batch 1.
 *
 * Customers edit a list of Q&A pairs that render on their site via an
 * embeddable accordion. Free tier capped server-side at 10 published items.
 * Snippet uses the v1 loader with data-tool="faq".
 */

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  published: boolean;
  position: number;
}

interface FaqResponse {
  items: FaqItem[];
  widgetToken: string;
  freeTierCap: number;
}

const labelClass = "block text-xs font-medium text-gray-600 mb-1";
const inputClass =
  "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors";

export default function FaqWidget() {
  usePageTitle("FAQ Widget");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<FaqResponse>({
    queryKey: ["/api/portal/free-tools/faq"],
    queryFn: async () => {
      const r = await fetch("/api/portal/free-tools/faq", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load FAQ");
      return r.json();
    },
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const widgetToken = data?.widgetToken ?? "";
  const cap = data?.freeTierCap ?? 10;
  const publishedCount = items.filter((i) => i.published).length;
  const atCap = publishedCount >= cap;

  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");
  const [howOpen, setHowOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useCopilotForm({
    formLabel: "FAQ Widget — new question",
    fields: [
      { key: "newQ", label: "Question", required: false },
      { key: "newA", label: "Answer", required: false },
    ],
    values: { newQ, newA },
    onApply: (fills) => {
      for (const f of fills) {
        const v = String(f.value ?? "");
        if (f.field_key === "newQ") setNewQ(v);
        else if (f.field_key === "newA") setNewA(v);
      }
    },
    enabled: true,
  });

  const createMut = useMutation({
    mutationFn: async (body: { question: string; answer: string }) => {
      const r = await fetch("/api/portal/free-tools/faq", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err?.code === "free_tier_cap" ? `Free tier limit (${cap}) reached. Unpublish an item or upgrade.` : "Failed to add FAQ");
      }
      return r.json();
    },
    onSuccess: () => {
      setNewQ("");
      setNewA("");
      qc.invalidateQueries({ queryKey: ["/api/portal/free-tools/faq"] });
    },
    onError: (e: Error) => toast({ title: "Couldn't add", description: e.message, variant: "destructive" }),
  });

  const patchMut = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<FaqItem> }) => {
      const r = await fetch(`/api/portal/free-tools/faq/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err?.code === "free_tier_cap" ? `Free tier limit (${cap}) reached.` : "Failed to update");
      }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portal/free-tools/faq"] }),
    onError: (e: Error) => toast({ title: "Couldn't update", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/portal/free-tools/faq/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portal/free-tools/faq"] }),
    onError: (e: Error) => toast({ title: "Couldn't delete", description: e.message, variant: "destructive" }),
  });

  const reorderMut = useMutation({
    mutationFn: async (order: string[]) => {
      const r = await fetch("/api/portal/free-tools/faq/reorder", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      if (!r.ok) throw new Error("Failed to reorder");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portal/free-tools/faq"] }),
  });

  const moveItem = (id: string, dir: -1 | 1) => {
    const order = items.map((i) => i.id);
    const idx = order.indexOf(id);
    const target = idx + dir;
    if (target < 0 || target >= order.length) return;
    [order[idx], order[target]] = [order[target], order[idx]];
    reorderMut.mutate(order);
  };

  const snippet = widgetToken
    ? `<script src="https://wefixtrades.com/widget/v1.js" data-site-key="${widgetToken}" data-tool="faq" async></script>`
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

  return (
    <PortalLayout
      breadcrumb={
        <span className="flex items-center gap-1.5">
          <Link href="/portal/free-tools" className="hover:text-brand-blue">Free Tools</Link>
          <span className="text-gray-400">/</span>
          <span>FAQ Widget</span>
        </span>
      }
    >
      <div data-theme="light" className="space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <HelpCircle className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-gray-900">FAQ Widget</h1>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            Drop an FAQ accordion onto your website. We also inject the Google
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded mx-1">FAQPage</code>
            schema for rich-result eligibility — no extra work from you.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Editor column */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900">Your questions</h2>
                  <span className={cn("text-xs", atCap ? "text-amber-700" : "text-gray-500")}>
                    {publishedCount} / {cap} published
                  </span>
                </div>

                {atCap && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>Free tier cap reached. Unpublish an item before adding a new one, or upgrade for unlimited FAQs.</span>
                  </div>
                )}

                {isLoading && <div className="text-sm text-gray-500">Loading…</div>}

                {!isLoading && items.length === 0 && (
                  <div className="text-sm text-gray-500 py-3">No questions yet — add your first below.</div>
                )}

                <ul className="space-y-2">
                  {items.map((it, idx) => (
                    <li key={it.id} className="border border-gray-200 rounded-lg p-3 bg-white space-y-2" data-testid={`faq-row-${it.id}`}>
                      <div className="flex items-start gap-2">
                        <div className="flex flex-col gap-1 pt-1">
                          <button
                            type="button"
                            onClick={() => moveItem(it.id, -1)}
                            disabled={idx === 0}
                            className="text-gray-400 hover:text-brand-blue disabled:opacity-30"
                            aria-label="Move up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItem(it.id, 1)}
                            disabled={idx === items.length - 1}
                            className="text-gray-400 hover:text-brand-blue disabled:opacity-30"
                            aria-label="Move down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex-1 space-y-2">
                          <input
                            className={inputClass}
                            value={it.question}
                            onChange={(e) => patchMut.mutate({ id: it.id, body: { question: e.target.value } })}
                            placeholder="Question"
                          />
                          <textarea
                            className={cn(inputClass, "min-h-[60px] resize-y")}
                            value={it.answer}
                            onChange={(e) => patchMut.mutate({ id: it.id, body: { answer: e.target.value } })}
                            placeholder="Answer"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => patchMut.mutate({ id: it.id, body: { published: !it.published } })}
                            className={cn("text-gray-400 hover:text-brand-blue", it.published && "text-brand-blue")}
                            aria-label={it.published ? "Unpublish" : "Publish"}
                            title={it.published ? "Published" : "Draft"}
                          >
                            {it.published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteMut.mutate(it.id)}
                            className="text-gray-400 hover:text-red-600"
                            aria-label="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <h2 className="text-sm font-semibold text-gray-900">Add new question</h2>
                <div>
                  <label className={labelClass} htmlFor="faq-new-q">Question</label>
                  <input
                    id="faq-new-q"
                    className={inputClass}
                    value={newQ}
                    onChange={(e) => setNewQ(e.target.value)}
                    placeholder="What areas do you service?"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="faq-new-a">Answer</label>
                  <textarea
                    id="faq-new-a"
                    className={cn(inputClass, "min-h-[80px] resize-y")}
                    value={newA}
                    onChange={(e) => setNewA(e.target.value)}
                    placeholder="We serve the greater Toronto area, including Mississauga, Brampton, and Vaughan."
                  />
                </div>
                <Button
                  type="button"
                  className="btn-primary-premium"
                  disabled={!newQ.trim() || !newA.trim() || createMut.isPending}
                  onClick={() => createMut.mutate({ question: newQ.trim(), answer: newA.trim() })}
                  data-testid="faq-add-button"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add question
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Snippet + preview column */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900">Live preview</h2>
                </div>
                {widgetToken && (
                  <iframe
                    title="FAQ widget preview"
                    src={`/widget/preview/faq?token=${encodeURIComponent(widgetToken)}`}
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
                    data-testid="faq-copy-snippet"
                  >
                    {copied ? <><Check className="w-4 h-4 mr-1.5" />Copied</> : <><Copy className="w-4 h-4 mr-1.5" />Copy</>}
                  </Button>
                </div>
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
                    <li><strong>WordPress:</strong> use a header-injection plugin and paste the snippet wherever you want the FAQ to appear (post body or footer).</li>
                    <li><strong>Wix:</strong> Add → Embed Code → paste the snippet block.</li>
                    <li><strong>Squarespace:</strong> Add Block → Code → paste.</li>
                    <li><strong>Shopify:</strong> Edit theme code → drop the snippet anywhere in <code>theme.liquid</code> or a section template.</li>
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
