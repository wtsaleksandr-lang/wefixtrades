import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  FieldGroupHeader,
  TitleInField,
  TitleInFieldTextarea,
  useDebouncedCallback,
} from "./_shared";

/**
 * FAQ Widget — free-tools batch 1.
 *
 * Customers edit a list of Q&A pairs that render on their site via an
 * embeddable accordion. Free tier capped server-side at 10 published items.
 * Snippet uses the v1 loader with data-tool="faq".
 *
 * DS compliance (PR #692 audit): title-in-field + top-left help cue + 2px
 * input-cluster gaps + single .btn-primary-premium (Copy embed) + per-row
 * autosave debounced 300ms to stop the keystroke storm.
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

  /* Local edit buffers per row — keystrokes update local state instantly so
     the input stays responsive. The actual PATCH is debounced 300ms so a
     typing burst is collapsed into a single network round-trip. */
  const [drafts, setDrafts] = useState<Record<string, { question: string; answer: string }>>({});
  useEffect(() => {
    // Reset drafts when the server snapshot changes (after refetch).
    const next: Record<string, { question: string; answer: string }> = {};
    for (const it of items) next[it.id] = { question: it.question, answer: it.answer };
    setDrafts(next);
  }, [items]);

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

  /* DS rule (autosave): single debounced PATCH per row. Without this the
     widget fires N requests per second while the customer is typing — the
     audit flagged this as the "FaqWidget keystroke storm". 300ms feels
     instant on save indicators but coalesces normal typing into one POST. */
  const patchMutRef = useRef(patchMut);
  useEffect(() => { patchMutRef.current = patchMut; }, [patchMut]);
  const debouncedPatch = useDebouncedCallback(
    (id: string, body: Partial<FaqItem>) => patchMutRef.current.mutate({ id, body }),
    300,
  );

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
          <div className="lg:col-span-2 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Your questions"
                  help="Edit questions in place — changes save automatically a moment after you stop typing. Use the arrows to reorder and the eye to publish/unpublish."
                  right={
                    <span className={cn("text-xs", atCap ? "text-amber-700" : "text-gray-500")}>
                      {publishedCount} / {cap} published
                    </span>
                  }
                />

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
                  {items.map((it, idx) => {
                    const draft = drafts[it.id] ?? { question: it.question, answer: it.answer };
                    return (
                      <li key={it.id} className="border border-gray-200 rounded-lg p-3 bg-white space-y-0.5" data-testid={`faq-row-${it.id}`}>
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
                          <div className="flex-1 space-y-0.5">
                            <TitleInField
                              id={`faq-q-${it.id}`}
                              label="Question"
                              value={draft.question}
                              onChange={(v) => {
                                setDrafts((d) => ({ ...d, [it.id]: { ...draft, question: v } }));
                                debouncedPatch(it.id, { question: v });
                              }}
                              help="The question your customer is asking — keep it natural and specific."
                            />
                            <TitleInFieldTextarea
                              id={`faq-a-${it.id}`}
                              label="Answer"
                              value={draft.answer}
                              onChange={(v) => {
                                setDrafts((d) => ({ ...d, [it.id]: { ...draft, answer: v } }));
                                debouncedPatch(it.id, { answer: v });
                              }}
                              textareaClassName="min-h-[60px]"
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
                    );
                  })}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Add new question"
                  help="Write the question + answer, then click Add. The new row appears in the list above and you can keep editing it inline."
                />
                <div className="space-y-0.5">
                  <TitleInField
                    id="faq-new-q"
                    label="Question"
                    value={newQ}
                    onChange={setNewQ}
                    placeholder="What areas do you service?"
                  />
                  <TitleInFieldTextarea
                    id="faq-new-a"
                    label="Answer"
                    value={newA}
                    onChange={setNewA}
                    placeholder="We serve the greater Toronto area, including Mississauga, Brampton, and Vaughan."
                    textareaClassName="min-h-[80px]"
                  />
                </div>
                {/* DS rule 4 — secondary CTA. The premium accent is reserved
                    for the Copy-embed button (the page's primary action). */}
                <Button
                  type="button"
                  variant="outline"
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
          <div className="lg:col-span-1 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Live preview"
                  help="A real render of how the accordion looks on your site. Refresh after editing to see updates."
                />
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
                <FieldGroupHeader
                  title="Embed snippet"
                  help="Paste this once anywhere in your site's HTML. The widget pulls the latest questions on every page load."
                  right={
                    /* DS rule 4 — single .btn-primary-premium per page. */
                    <Button
                      type="button"
                      onClick={handleCopy}
                      className="btn-primary-premium"
                      disabled={!widgetToken}
                      data-testid="faq-copy-snippet"
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
