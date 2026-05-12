/**
 * Admin product editor — /admin/products/:id (Q28 v1 + Q28a tiers)
 *
 * Lets admin edit a product's customer-visible copy (name, tagline,
 * description, price, billing period, category, pricing tiers) through
 * a draft → approve & publish flow.
 *
 * Customer-facing surfaces (website, /portal/catalog, /pricing,
 * etc.) read serviceCatalog directly — drafts are admin-only until
 * published. "Publish" copies draft_data into the matching
 * serviceCatalog row so changes go live everywhere at once.
 *
 * Out of scope (Q28 follow-ups in CARRYOVER):
 * - Features array editor (Q28b)
 * - Stripe price-ID linkage editor (Q28c)
 * - Supplier panel (Q28d)
 * - Subscriber roster (Q28e)
 * - AI workflow config (Q28f)
 * - Multi-approver workflow (any admin can publish their own draft today)
 */

import { useEffect, useMemo, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ChevronLeft, Check, AlertTriangle, FileEdit, History, Plus, Trash2, ArrowUp, ArrowDown, Star } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import type { Tier } from "@shared/tiers";

interface ServiceCatalogRow {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: string;
  default_price: number | null;
  billing_period: string;
  is_active: boolean;
  tiers: Tier[] | null;
  features: string[] | null;
}

interface ProductDraft {
  id: number;
  service_id: string;
  status: "draft" | "published" | "rejected";
  draft_data: Record<string, any>;
  notes: string | null;
  created_by_email: string | null;
  created_at: string | null;
  updated_at: string | null;
}

type EditableForm = {
  name: string;
  tagline: string;
  description: string;
  default_price_cents: string; // store as string so empty input doesn't NaN
  billing_period: string;
  category: string;
  tiers: Tier[];
  features: string[];
};

const CATEGORIES = ["visibility", "leads", "reputation", "automation", "website"];

function emptyTier(): Tier {
  return {
    id: "",
    name: "",
    price_cents: 0,
    billing_period: "monthly",
    features: [],
    badge: null,
    highlighted: false,
    included_mins: null,
    stripe_price_id: null,
  };
}

function tiersEqual(a: Tier[], b: Tier[]): boolean {
  if (a.length !== b.length) return false;
  // Stable JSON comparison — fine for editor-level dirty tracking
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function ProductDetailPage() {
  const [, params] = useRoute("/admin/products/:id");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const svcId = params?.id ?? "";
  usePageTitle(`Edit Product · ${svcId}`);

  const { data, isLoading, error } = useQuery<{ live: ServiceCatalogRow; draft: ProductDraft | null }>({
    queryKey: [`/api/admin/products/${svcId}`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/products/${svcId}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load product (${res.status})`);
      return res.json();
    },
    enabled: !!svcId,
  });

  const live = data?.live;
  const draft = data?.draft;
  const hasPendingDraft = draft && draft.status === "draft";

  // Pre-populate the form from draft if pending, otherwise from live values
  const initial = useMemo<EditableForm>(() => {
    if (!live) return { name: "", tagline: "", description: "", default_price_cents: "", billing_period: "monthly", category: "visibility", tiers: [], features: [] };
    const d = hasPendingDraft ? draft!.draft_data : {};
    return {
      name: (d.name ?? live.name) ?? "",
      tagline: (d.tagline ?? live.tagline) ?? "",
      description: (d.description ?? live.description) ?? "",
      default_price_cents: String(d.default_price ?? live.default_price ?? ""),
      billing_period: (d.billing_period ?? live.billing_period) ?? "monthly",
      category: (d.category ?? live.category) ?? "visibility",
      tiers: (d.tiers ?? live.tiers ?? []) as Tier[],
      features: (d.features ?? live.features ?? []) as string[],
    };
  }, [live, draft, hasPendingDraft]);

  const [form, setForm] = useState<EditableForm>(initial);
  useEffect(() => { setForm(initial); }, [initial]);

  // Compute which fields differ from the LIVE row (i.e., would be part of a new draft)
  const dirty = useMemo(() => {
    if (!live) return {} as Record<string, any>;
    const out: Record<string, any> = {};
    if (form.name !== (live.name ?? "")) out.name = form.name;
    if (form.tagline !== (live.tagline ?? "")) out.tagline = form.tagline;
    if (form.description !== (live.description ?? "")) out.description = form.description;
    const formPrice = form.default_price_cents.trim() === "" ? null : Number(form.default_price_cents);
    if (formPrice !== live.default_price) out.default_price = formPrice;
    if (form.billing_period !== live.billing_period) out.billing_period = form.billing_period;
    if (form.category !== live.category) out.category = form.category;
    const liveTiers = (live.tiers ?? []) as Tier[];
    if (!tiersEqual(form.tiers, liveTiers)) out.tiers = form.tiers;
    const liveFeatures = (live.features ?? []) as string[];
    if (JSON.stringify(form.features) !== JSON.stringify(liveFeatures)) out.features = form.features;
    return out;
  }, [form, live]);
  const hasChanges = Object.keys(dirty).length > 0;

  // Tier editor handlers
  const updateTier = (idx: number, patch: Partial<Tier>) => {
    setForm((f) => ({ ...f, tiers: f.tiers.map((t, i) => i === idx ? { ...t, ...patch } : t) }));
  };
  const addTier = () => {
    setForm((f) => ({ ...f, tiers: [...f.tiers, emptyTier()] }));
  };
  const removeTier = (idx: number) => {
    setForm((f) => ({ ...f, tiers: f.tiers.filter((_, i) => i !== idx) }));
  };
  const moveTier = (idx: number, direction: -1 | 1) => {
    setForm((f) => {
      const next = [...f.tiers];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return f;
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...f, tiers: next };
    });
  };

  const saveDraft = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/products/${svcId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(dirty),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save draft");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/products/${svcId}`] });
      toast({ title: "Draft saved", description: "Changes not yet live. Click Approve & Publish to push to customers." });
    },
    onError: (err: Error) => toast({ title: "Couldn't save draft", description: err.message, variant: "destructive" }),
  });

  const publish = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/products/${svcId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to publish");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/products/${svcId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/services"] });
      toast({ title: "Published", description: "Live everywhere — website, pricing page, customer portal." });
    },
    onError: (err: Error) => toast({ title: "Publish failed", description: err.message, variant: "destructive" }),
  });

  const reject = useMutation({
    mutationFn: async (reason: string) => {
      const res = await fetch(`/api/admin/products/${svcId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to reject");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/products/${svcId}`] });
      toast({ title: "Draft rejected" });
    },
    onError: (err: Error) => toast({ title: "Reject failed", description: err.message, variant: "destructive" }),
  });

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto space-y-5">
        <button
          onClick={() => navigate("/admin/crm/services")}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          data-testid="back-to-catalog"
        >
          <ChevronLeft className="w-4 h-4" /> Back to catalog
        </button>

        {isLoading && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <Card className="p-4 border-red-200 bg-red-50 text-red-700 text-sm">
            Failed to load product. {String((error as Error).message)}
          </Card>
        )}

        {live && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{live.name}</h1>
                <p className="text-xs text-gray-500 mt-0.5">ID: {live.id}</p>
              </div>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide ${live.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                {live.is_active ? "Active" : "Inactive"}
              </span>
            </div>

            {hasPendingDraft && (
              <Card className="p-4 border-amber-200 bg-amber-50 space-y-2">
                <div className="flex items-center gap-2">
                  <FileEdit className="w-4 h-4 text-amber-600" />
                  <p className="text-sm font-medium text-amber-900">Pending draft</p>
                </div>
                <p className="text-xs text-amber-800">
                  This product has unpublished changes. Review the form below and click <strong>Approve & Publish</strong> to push live, or <strong>Reject</strong> to discard.
                </p>
                <p className="text-[10px] text-amber-700">
                  Last edited by {draft?.created_by_email ?? "unknown"} · {draft?.updated_at ? new Date(draft.updated_at).toLocaleString() : "—"}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => publish.mutate()}
                    disabled={publish.isPending}
                    className="bg-[#2D6A4F] hover:bg-[#1B4332]"
                    data-testid="button-publish"
                  >
                    {publish.isPending ? "Publishing..." : "Approve & Publish"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const reason = window.prompt("Reason for rejecting this draft? (optional)") ?? "";
                      reject.mutate(reason);
                    }}
                    disabled={reject.isPending}
                    data-testid="button-reject"
                  >
                    Reject
                  </Button>
                </div>
              </Card>
            )}

            <Card className="p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">Customer-visible content</h2>
              <p className="text-[11px] text-gray-500 -mt-2">
                Changes here go live on the website, /pricing, and the customer portal once published.
              </p>

              <Field label="Name" testid="input-name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-name" />
              </Field>
              <Field label="Tagline" testid="input-tagline">
                <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} data-testid="input-tagline" />
              </Field>
              <Field label="Description" testid="input-description">
                <Textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  data-testid="input-description"
                />
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Price (cents)" testid="input-price">
                  <Input
                    type="number"
                    min={0}
                    value={form.default_price_cents}
                    onChange={(e) => setForm({ ...form, default_price_cents: e.target.value })}
                    data-testid="input-price"
                  />
                </Field>
                <Field label="Billing">
                  <select
                    className="h-9 w-full px-2 text-sm border border-gray-200 rounded-md bg-white"
                    value={form.billing_period}
                    onChange={(e) => setForm({ ...form, billing_period: e.target.value })}
                    data-testid="input-billing"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="one-time">One-time</option>
                  </select>
                </Field>
                <Field label="Category">
                  <select
                    className="h-9 w-full px-2 text-sm border border-gray-200 rounded-md bg-white"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    data-testid="input-category"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>

            </Card>

            {/* Q28b — Product-level features ("what's included" bullets) */}
            <Card className="p-5 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">What's included</h2>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Product-level bullets shown on marketing/portal cards and audit recommendations.
                  One bullet per line. Leave empty to fall back to the hardcoded list.
                </p>
              </div>
              <Textarea
                rows={6}
                value={form.features.join("\n")}
                onChange={(e) => setForm({
                  ...form,
                  features: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                })}
                placeholder={"Mobile-optimised website\nContact form + QuoteQuick embed\nBasic SEO setup\n14-day TradeLine trial"}
                data-testid="input-features"
              />
              <p className="text-[10px] text-gray-400">
                {form.features.length} bullet{form.features.length === 1 ? "" : "s"} · max 40 lines, 400 chars each
              </p>
            </Card>

            {/* Q28a — Pricing tiers editor */}
            <Card className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Pricing tiers</h2>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Optional. Use tiers for products with Starter/Growth/Pro packaging. Single-price
                    products can leave this empty and rely on the price above.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addTier}
                  className="shrink-0"
                  data-testid="button-add-tier"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add tier
                </Button>
              </div>

              {form.tiers.length === 0 && (
                <p className="text-xs text-gray-400 italic">No tiers configured.</p>
              )}

              {form.tiers.map((tier, idx) => (
                <div
                  key={idx}
                  className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50"
                  data-testid={`tier-card-${idx}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                        Tier #{idx + 1}
                      </span>
                      {tier.highlighted && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                          <Star className="w-2.5 h-2.5" /> Featured
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveTier(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 rounded hover:bg-white disabled:opacity-30"
                        aria-label="Move up"
                        data-testid={`tier-up-${idx}`}
                      >
                        <ArrowUp className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveTier(idx, 1)}
                        disabled={idx === form.tiers.length - 1}
                        className="p-1 rounded hover:bg-white disabled:opacity-30"
                        aria-label="Move down"
                        data-testid={`tier-down-${idx}`}
                      >
                        <ArrowDown className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Remove tier "${tier.name || `#${idx + 1}`}"?`)) removeTier(idx);
                        }}
                        className="p-1 rounded hover:bg-red-50"
                        aria-label="Remove tier"
                        data-testid={`tier-remove-${idx}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Name (e.g. Starter)">
                      <Input
                        value={tier.name}
                        onChange={(e) => updateTier(idx, { name: e.target.value })}
                        data-testid={`tier-name-${idx}`}
                      />
                    </Field>
                    <Field label="ID slug (e.g. tradeline-starter)">
                      <Input
                        value={tier.id}
                        onChange={(e) => updateTier(idx, { id: e.target.value })}
                        placeholder={`${live.id}-${tier.name.toLowerCase() || "tier"}`}
                        data-testid={`tier-id-${idx}`}
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Price (cents)">
                      <Input
                        type="number"
                        min={0}
                        value={tier.price_cents}
                        onChange={(e) => updateTier(idx, { price_cents: Number(e.target.value) || 0 })}
                        data-testid={`tier-price-${idx}`}
                      />
                    </Field>
                    <Field label="Billing">
                      <select
                        className="h-9 w-full px-2 text-sm border border-gray-200 rounded-md bg-white"
                        value={tier.billing_period}
                        onChange={(e) => updateTier(idx, { billing_period: e.target.value as "monthly" | "one-time" })}
                        data-testid={`tier-billing-${idx}`}
                      >
                        <option value="monthly">Monthly</option>
                        <option value="one-time">One-time</option>
                      </select>
                    </Field>
                    <Field label="Included mins (TradeLine)">
                      <Input
                        type="number"
                        min={0}
                        value={tier.included_mins ?? ""}
                        onChange={(e) => updateTier(idx, { included_mins: e.target.value === "" ? null : Number(e.target.value) })}
                        placeholder="—"
                        data-testid={`tier-mins-${idx}`}
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Badge (optional)">
                      <Input
                        value={tier.badge ?? ""}
                        onChange={(e) => updateTier(idx, { badge: e.target.value || null })}
                        placeholder="e.g. Most Popular"
                        data-testid={`tier-badge-${idx}`}
                      />
                    </Field>
                    <Field label="Featured">
                      <label className="inline-flex items-center gap-2 h-9 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={!!tier.highlighted}
                          onChange={(e) => updateTier(idx, { highlighted: e.target.checked })}
                          className="h-4 w-4"
                          data-testid={`tier-highlighted-${idx}`}
                        />
                        Highlight this tier on the pricing page
                      </label>
                    </Field>
                  </div>

                  <Field label="Features (one per line)">
                    <Textarea
                      rows={4}
                      value={tier.features.join("\n")}
                      onChange={(e) => updateTier(idx, { features: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
                      placeholder={"200 minutes included\nSMS auto-reply\nMissed-call recovery"}
                      data-testid={`tier-features-${idx}`}
                    />
                  </Field>

                  <Field label="Stripe price ID (optional)">
                    <Input
                      value={tier.stripe_price_id ?? ""}
                      onChange={(e) => updateTier(idx, { stripe_price_id: e.target.value || null })}
                      placeholder="price_..."
                      className="font-mono text-xs"
                      data-testid={`tier-stripe-${idx}`}
                    />
                  </Field>
                </div>
              ))}
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2 pt-1">
                <Button
                  onClick={() => saveDraft.mutate()}
                  disabled={!hasChanges || saveDraft.isPending}
                  className="bg-[#2D6A4F] hover:bg-[#1B4332]"
                  data-testid="button-save-draft"
                >
                  {saveDraft.isPending ? "Saving..." : hasPendingDraft ? "Update Draft" : "Save as Draft"}
                </Button>
                {!hasChanges && <span className="text-xs text-gray-400">No changes yet</span>}
                {hasChanges && <span className="text-xs text-gray-500">{Object.keys(dirty).length} field(s) edited</span>}
              </div>
            </Card>

            <Card className="p-4 border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-xs font-medium text-gray-700">Not in this editor yet</p>
              </div>
              <ul className="text-[11px] text-gray-500 list-disc pl-5 space-y-0.5">
                <li>Stripe product ID (tier-level Stripe price IDs ✓ supported above)</li>
                <li>Suppliers / costs / fulfillment workflow</li>
                <li>Subscriber roster + cancel toggle</li>
                <li>AI agent / cron job config</li>
              </ul>
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function Field({ label, children, testid }: { label: string; children: React.ReactNode; testid?: string }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
