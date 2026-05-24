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

import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ChevronLeft, Check, AlertTriangle, FileEdit, History, Plus, Trash2, ArrowUp, ArrowDown, Star, Factory, X, Users, Ban, DollarSign, Pencil, ExternalLink } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useAuth } from "@/hooks/useAuth";
import type { Tier } from "@shared/tiers";
import type { AutomationConfig } from "@shared/automationConfig";
import { emptyAutomationConfig } from "@shared/automationConfig";

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
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  stripe_yearly_price_id: string | null;
  automation_config: AutomationConfig | null;
}

interface DraftApprover {
  user_id: number;
  email: string | null;
  approved_at: string;
}

interface ProductDraft {
  id: number;
  service_id: string;
  status: "draft" | "published" | "rejected";
  draft_data: Record<string, any>;
  notes: string | null;
  created_by: number | null;
  created_by_email: string | null;
  approvers: DraftApprover[] | null;
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
  stripe_product_id: string;
  stripe_price_id: string;
  stripe_yearly_price_id: string;
  automation_config: AutomationConfig;
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

/* ── Price helpers ──────────────────────────────────────────────────
 * The API contract is cents (integer). Admins shouldn't have to think
 * in cents — the field accepts dollars (`1197.00`, `1,197`, `$1,197.00`)
 * and we round-trip to an integer cents string for the wire payload.
 */
function centsToDollarsInput(cents: string): string {
  if (cents === "" || cents == null) return "";
  const n = Number(cents);
  if (!Number.isFinite(n)) return "";
  // 11970000 cents → "119700.00"; trim trailing zeros via toFixed(2) for tidiness
  return (n / 100).toFixed(2);
}

function dollarsInputToCents(raw: string): string {
  // Strip $, commas, whitespace. Allow empty → empty (null on wire).
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "") return "";
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return "";
  return String(Math.round(n * 100));
}

function formatUsd(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ProductDetailPage() {
  const [, params] = useRoute("/admin/products/:id");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const svcId = params?.id ?? "";
  usePageTitle(`Edit Product · ${svcId}`);
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery<{ live: ServiceCatalogRow; draft: ProductDraft | null; publish_approval_threshold: number }>({
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
    if (!live) return { name: "", tagline: "", description: "", default_price_cents: "", billing_period: "monthly", category: "visibility", tiers: [], features: [], stripe_product_id: "", stripe_price_id: "", stripe_yearly_price_id: "", automation_config: emptyAutomationConfig() };
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
      stripe_product_id: (d.stripe_product_id ?? live.stripe_product_id) ?? "",
      stripe_price_id: (d.stripe_price_id ?? live.stripe_price_id) ?? "",
      stripe_yearly_price_id: (d.stripe_yearly_price_id ?? live.stripe_yearly_price_id) ?? "",
      automation_config: { ...emptyAutomationConfig(), ...(live.automation_config ?? {}), ...(d.automation_config ?? {}) },
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
    // Q28c: Stripe IDs. Empty input maps to null on the wire.
    const stripeFields = ["stripe_product_id", "stripe_price_id", "stripe_yearly_price_id"] as const;
    for (const k of stripeFields) {
      const formVal = (form[k] ?? "").trim();
      const liveVal = live[k] ?? "";
      if (formVal !== liveVal) out[k] = formVal === "" ? null : formVal;
    }
    // Q28f: automation_config — JSON-equal compare. Send the whole object on change.
    const baselineConfig = { ...emptyAutomationConfig(), ...(live.automation_config ?? {}) };
    if (JSON.stringify(form.automation_config) !== JSON.stringify(baselineConfig)) {
      out.automation_config = form.automation_config;
    }
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
      if (!res.ok) {
        const err = new Error(json.error || "Failed to publish") as Error & { code?: string };
        if (json.code) err.code = json.code;
        throw err;
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/products/${svcId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/services"] });
      toast({ title: "Published", description: "Live everywhere — website, pricing page, customer portal." });
    },
    onError: (err: Error & { code?: string }) => {
      // Approvals-pending 409 returns with a clearer hint via the message,
      // but also refresh the draft so the UI shows the new approver count.
      if (err.code === "approvals_pending") {
        queryClient.invalidateQueries({ queryKey: [`/api/admin/products/${svcId}`] });
        toast({ title: "More approvals needed", description: err.message });
      } else {
        toast({ title: "Publish failed", description: err.message, variant: "destructive" });
      }
    },
  });

  const approve = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/products/${svcId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to approve");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/products/${svcId}`] });
      toast({ title: "Approval recorded" });
    },
    onError: (err: Error) => toast({ title: "Approve failed", description: err.message, variant: "destructive" }),
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

  /* Q30c: opt this page into AI form-fill. Fields mirror the EditableForm
   * shape so the AI can propose values for name / tagline / description /
   * price / billing / category. _onApplyFormFill coerces value strings back
   * into typed form state. */
  const onApplyAiFormFill = (fills: { field_key: string; value: string }[]) => {
    setForm((f) => {
      const next = { ...f };
      for (const fill of fills) {
        switch (fill.field_key) {
          case "name": next.name = fill.value; break;
          case "tagline": next.tagline = fill.value; break;
          case "description": next.description = fill.value; break;
          case "default_price_cents": next.default_price_cents = fill.value; break;
          case "billing_period":
            if (fill.value === "monthly" || fill.value === "one-time") next.billing_period = fill.value;
            break;
          case "category":
            if (CATEGORIES.includes(fill.value)) next.category = fill.value;
            break;
        }
      }
      return next;
    });
  };

  // Q30c / Phase 1b: register the product editor form with the copilot
  // form registry. Only enabled once the live product has loaded.
  useCopilotForm({
    formLabel: "Product details",
    fields: [
      { key: "name", label: "Product name", required: true },
      { key: "tagline", label: "Tagline" },
      { key: "description", label: "Description" },
      { key: "default_price_cents", label: "Default price (cents)" },
      { key: "billing_period", label: "Billing period (monthly | one-time)" },
      { key: "category", label: `Category (one of: ${CATEGORIES.join(", ")})` },
    ],
    values: {
      name: form.name,
      tagline: form.tagline,
      description: form.description,
      default_price_cents: form.default_price_cents,
      billing_period: form.billing_period,
      category: form.category,
    },
    onApply: onApplyAiFormFill,
    enabled: !!live,
  });

  return (
    <AdminLayout
      pageContext={{
        page: "product_detail",
      }}
    >
      {/* CONTRAST-2 — admin pages are light-theme locked. */}
      <div data-theme="light" className="space-y-4">
        {/* Smart back nav — honors ?returnTo, else history.back(), else catalog */}
        <SmartBackNav productName={live?.name ?? svcId} />

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
            {/* Title row stays full-width so it spans both columns */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-gray-900 truncate">{live.name}</h1>
                <p className="text-xs text-gray-500 mt-0.5 font-mono">ID: {live.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide ${live.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                  {live.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>

            {/* Two-column desktop layout: form on the left (8/12), sidebar on the right (4/12).
                On <lg, sidebar drops below the form. */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <div className="lg:col-span-8 space-y-4 min-w-0">

            {hasPendingDraft && (() => {
              const threshold = data?.publish_approval_threshold ?? 1;
              const approvers = (draft?.approvers ?? []) as DraftApprover[];
              const approvalsCount = approvers.length;
              const remaining = Math.max(0, threshold - approvalsCount);
              const userId = (user as any)?.id ?? null;
              const currentUserApproved = userId != null && approvers.some((a) => a.user_id === userId);
              const requiresMultiApprove = threshold > 1;
              return (
              <Card className="p-4 border-amber-200 bg-amber-50 space-y-2">
                <div className="flex items-center gap-2">
                  <FileEdit className="w-4 h-4 text-amber-600" />
                  <p className="text-sm font-medium text-amber-900">Pending draft</p>
                  {requiresMultiApprove && (
                    <span
                      className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase tracking-wide"
                      data-testid="approval-count"
                    >
                      {approvalsCount}/{threshold} approvals
                    </span>
                  )}
                </div>
                <p className="text-xs text-amber-800">
                  {requiresMultiApprove ? (
                    remaining > 0 ? (
                      <>This draft needs <strong>{remaining}</strong> more approval(s) before it can publish. Distinct admins must each click <strong>Approve</strong>.</>
                    ) : (
                      <>All {threshold} required approvals collected. Any admin can now click <strong>Publish</strong>.</>
                    )
                  ) : (
                    <>This product has unpublished changes. Review the form below and click <strong>Approve & Publish</strong> to push live, or <strong>Reject</strong> to discard.</>
                  )}
                </p>
                <p className="text-[10px] text-amber-700">
                  Last edited by {draft?.created_by_email ?? "unknown"} · {draft?.updated_at ? new Date(draft.updated_at).toLocaleString() : "—"}
                </p>
                {approvers.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5" data-testid="approver-chips">
                    {approvers.map((a) => (
                      <span
                        key={a.user_id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px]"
                        title={`Approved ${new Date(a.approved_at).toLocaleString()}`}
                      >
                        <Check className="w-3 h-3" />
                        {a.email ?? `user#${a.user_id}`}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  {requiresMultiApprove && !currentUserApproved && (
                    <Button
                      size="sm"
                      onClick={() => approve.mutate()}
                      disabled={approve.isPending}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      data-testid="button-approve"
                    >
                      {approve.isPending ? "Approving..." : "Approve"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => publish.mutate()}
                    disabled={publish.isPending || (requiresMultiApprove && remaining > 0 && !currentUserApproved)}
                    className="bg-brand-blue hover:bg-brand-blue-600"
                    data-testid="button-publish"
                  >
                    {publish.isPending
                      ? "Publishing..."
                      : requiresMultiApprove
                        ? (remaining > 0 ? `Approve & try to Publish (still ${remaining} more needed)` : "Publish")
                        : "Approve & Publish"}
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
              );
            })()}

            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-brand-blue" />
                <h2 className="text-sm font-semibold text-gray-900">Edit product</h2>
              </div>
              <p className="text-[11px] text-gray-500 -mt-2">
                Customer-visible content. Changes go live on the website, /pricing, and the customer portal once published.
              </p>

              {/* Name + Tagline side-by-side on md+ to use the wider column */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Name" testid="input-name">
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-name" />
                </Field>
                <Field label="Tagline" testid="input-tagline">
                  <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} data-testid="input-tagline" />
                </Field>
              </div>

              <Field label="Description" testid="input-description">
                <Textarea
                  rows={5}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  data-testid="input-description"
                />
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Price">
                  {/* Dollar-formatted input — API still receives cents. */}
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-sm text-gray-500 pointer-events-none">$</span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={centsToDollarsInput(form.default_price_cents)}
                      onChange={(e) => {
                        // Accept anything the user types; convert to cents string on the way to state.
                        const cents = dollarsInputToCents(e.target.value);
                        // Preserve empty so the field can be cleared.
                        setForm({ ...form, default_price_cents: e.target.value.trim() === "" ? "" : cents });
                      }}
                      placeholder="0.00"
                      className="pl-6 tabular-nums"
                      data-testid="input-price"
                    />
                  </div>
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

            {/* Q28b — Product-level features ("what's included" bullets).
                BUG FIX: the previous version called .trim().filter(Boolean) on
                every keystroke and stored the resulting array as the source of
                truth. That stripped trailing whitespace mid-edit and dropped
                empty lines, so typing Enter at the end "did nothing" and the
                caret kept jumping back. We now use <FeaturesEditor>, which
                holds the raw textarea string as local state and auto-grows. */}
            <Card className="p-5 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">What's included</h2>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Product-level bullets shown on marketing/portal cards and audit recommendations.
                  One bullet per line. Leave empty to fall back to the hardcoded list.
                </p>
              </div>
              <FeaturesEditor
                features={form.features}
                onChange={(features) => setForm((f) => ({ ...f, features }))}
                placeholder={"Mobile-optimised website\nContact form + QuoteQuick embed\nBasic SEO setup\n14-day TradeLine trial"}
                testid="input-features"
              />
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
                    <FeaturesEditor
                      features={tier.features}
                      onChange={(features) => updateTier(idx, { features })}
                      placeholder={"200 minutes included\nSMS auto-reply\nMissed-call recovery"}
                      testid={`tier-features-${idx}`}
                      minRows={3}
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

            {/* Q28d — Suppliers panel */}
            <SuppliersPanel serviceId={live.id} serviceName={live.name} />

            {/* Q28e — Subscribers roster */}
            <SubscribersPanel serviceId={live.id} serviceName={live.name} />

            {/* Q28c — Stripe linkage */}
            <Card className="p-5 space-y-3 border-amber-200/60">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Stripe linkage</h2>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  ⚠ Changing these IDs affects billing. Tier-level Stripe price IDs above take
                  precedence for tier purchases — these product-level IDs are used for
                  single-price products and yearly upgrades. Leave empty to clear.
                </p>
              </div>
              <Field label="stripe_product_id">
                <Input
                  value={form.stripe_product_id}
                  onChange={(e) => setForm({ ...form, stripe_product_id: e.target.value })}
                  placeholder="prod_..."
                  className="font-mono text-xs"
                  data-testid="input-stripe-product"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="stripe_price_id (default / monthly)">
                  <Input
                    value={form.stripe_price_id}
                    onChange={(e) => setForm({ ...form, stripe_price_id: e.target.value })}
                    placeholder="price_..."
                    className="font-mono text-xs"
                    data-testid="input-stripe-price"
                  />
                </Field>
                <Field label="stripe_yearly_price_id">
                  <Input
                    value={form.stripe_yearly_price_id}
                    onChange={(e) => setForm({ ...form, stripe_yearly_price_id: e.target.value })}
                    placeholder="price_..."
                    className="font-mono text-xs"
                    data-testid="input-stripe-yearly"
                  />
                </Field>
              </div>
            </Card>

            {/* Q28f — AI workflow / cron config */}
            <Card className="p-5 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">AI workflow & cron</h2>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Defaults applied when a client first subscribes. The product's own scheduled
                  job reads cron_schedule + ai_agent_system_prompt at boot.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Automation enabled by default">
                  <label className="inline-flex items-center gap-2 h-9 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.automation_config.automation_enabled_default ?? true}
                      onChange={(e) => setForm({
                        ...form,
                        automation_config: { ...form.automation_config, automation_enabled_default: e.target.checked },
                      })}
                      className="h-4 w-4"
                      data-testid="auto-enabled"
                    />
                    On for new subscribers
                  </label>
                </Field>
                <Field label="Human review required by default">
                  <label className="inline-flex items-center gap-2 h-9 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.automation_config.human_review_required_default ?? false}
                      onChange={(e) => setForm({
                        ...form,
                        automation_config: { ...form.automation_config, human_review_required_default: e.target.checked },
                      })}
                      className="h-4 w-4"
                      data-testid="auto-review"
                    />
                    Pause for review before outputs go live
                  </label>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Cron schedule (UTC, 5-field)">
                  <Input
                    value={form.automation_config.cron_schedule ?? ""}
                    onChange={(e) => setForm({
                      ...form,
                      automation_config: { ...form.automation_config, cron_schedule: e.target.value || null },
                    })}
                    placeholder="0 9 * * *"
                    className="font-mono text-xs"
                    data-testid="auto-cron"
                  />
                </Field>
                <Field label="Max retries on failure">
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={form.automation_config.max_retries ?? 3}
                    onChange={(e) => setForm({
                      ...form,
                      automation_config: { ...form.automation_config, max_retries: Number(e.target.value) || 0 },
                    })}
                    data-testid="auto-retries"
                  />
                </Field>
              </div>

              <Field label="AI agent role (short label)">
                <Input
                  value={form.automation_config.ai_agent_role ?? ""}
                  onChange={(e) => setForm({
                    ...form,
                    automation_config: { ...form.automation_config, ai_agent_role: e.target.value || null },
                  })}
                  placeholder="e.g. Local SEO auditor"
                  data-testid="auto-role"
                />
              </Field>

              <Field label="AI agent system prompt">
                <Textarea
                  rows={5}
                  value={form.automation_config.ai_agent_system_prompt ?? ""}
                  onChange={(e) => setForm({
                    ...form,
                    automation_config: { ...form.automation_config, ai_agent_system_prompt: e.target.value || null },
                  })}
                  placeholder={"You are an expert at… Your job is to…"}
                  data-testid="auto-prompt"
                />
              </Field>

              <Field label="Alert admins on automation failure">
                <label className="inline-flex items-center gap-2 h-9 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.automation_config.alert_on_failure ?? true}
                    onChange={(e) => setForm({
                      ...form,
                      automation_config: { ...form.automation_config, alert_on_failure: e.target.checked },
                    })}
                    className="h-4 w-4"
                    data-testid="auto-alert"
                  />
                  Send an alert when an automation run errors out
                </label>
              </Field>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2 pt-1">
                <Button
                  onClick={() => {
                    // Q28c: confirm before saving Stripe ID changes — these affect billing.
                    const stripeChanged =
                      "stripe_product_id" in dirty ||
                      "stripe_price_id" in dirty ||
                      "stripe_yearly_price_id" in dirty;
                    if (stripeChanged && !window.confirm("You're changing Stripe IDs. New customer charges will use these IDs. Continue?")) {
                      return;
                    }
                    saveDraft.mutate();
                  }}
                  disabled={!hasChanges || saveDraft.isPending}
                  className="bg-brand-blue hover:bg-brand-blue-600"
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
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <p className="text-xs font-medium text-gray-700">Q28 product editor — full scope shipped</p>
              </div>
              <p className="text-[11px] text-gray-500">
                Pricing tiers, features, Stripe IDs, suppliers, subscribers, and AI workflow are all
                editable above. Remaining nice-to-haves: per-supplier cost overrides for this product,
                and a multi-approver workflow (today any admin can publish their own draft).
              </p>
            </Card>
              </div>

              {/* ── Sidebar (lg ≥) — sticky context card ─────────────── */}
              <aside className="lg:col-span-4 space-y-4 lg:sticky lg:top-4 self-start">
                <Card className="p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Preview</h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">How this product reads on customer surfaces.</p>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-1.5">
                    <p className="text-sm font-semibold text-gray-900 leading-tight">{form.name || live.name}</p>
                    {form.tagline && (
                      <p className="text-[12px] text-gray-600 leading-snug">{form.tagline}</p>
                    )}
                    <p className="text-lg font-bold text-brand-blue tabular-nums">
                      {(() => {
                        const cents = form.default_price_cents.trim() === "" ? null : Number(form.default_price_cents);
                        return formatUsd(cents);
                      })()}
                      <span className="text-[11px] font-normal text-gray-500 ml-1">
                        {form.billing_period === "monthly" ? "/mo" : " one-time"}
                      </span>
                    </p>
                    {form.features.length > 0 && (
                      <ul className="text-[11px] text-gray-700 space-y-0.5 pt-1">
                        {form.features.slice(0, 4).map((b, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <Check className="w-3 h-3 text-emerald-600 mt-0.5 shrink-0" />
                            <span className="truncate">{b}</span>
                          </li>
                        ))}
                        {form.features.length > 4 && (
                          <li className="text-gray-400 italic">+ {form.features.length - 4} more…</li>
                        )}
                      </ul>
                    )}
                  </div>
                </Card>

                <Card className="p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-gray-900">Where this shows</h3>
                  <ul className="text-[11px] text-gray-600 space-y-1">
                    <li className="flex items-center gap-1.5">
                      <ExternalLink className="w-3 h-3 text-gray-400" />
                      <a href="/pricing" target="_blank" rel="noreferrer" className="hover:text-brand-blue underline">/pricing page</a>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <ExternalLink className="w-3 h-3 text-gray-400" />
                      <a href="/portal/catalog" target="_blank" rel="noreferrer" className="hover:text-brand-blue underline">Customer portal catalog</a>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <ExternalLink className="w-3 h-3 text-gray-400" />
                      <a href="/" target="_blank" rel="noreferrer" className="hover:text-brand-blue underline">Marketing / audit recommendations</a>
                    </li>
                  </ul>
                </Card>

                <Card className="p-4 space-y-1.5">
                  <h3 className="text-sm font-semibold text-gray-900">Last edited</h3>
                  {hasPendingDraft ? (
                    <>
                      <p className="text-[11px] text-gray-600">
                        Draft by <span className="font-medium">{draft?.created_by_email ?? "—"}</span>
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {draft?.updated_at ? new Date(draft.updated_at).toLocaleString() : "—"}
                      </p>
                    </>
                  ) : (
                    <p className="text-[11px] text-gray-500 italic">No pending draft.</p>
                  )}
                </Card>
              </aside>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

/* ── SmartBackNav ──────────────────────────────────────────────────
 * Breadcrumb + smart back button. Reads `?returnTo=` first, then falls
 * back to history.back() when there's history, else /admin/crm/services.
 */
function SmartBackNav({ productName }: { productName: string }) {
  const [, navigate] = useLocation();
  const returnTo = (() => {
    if (typeof window === "undefined") return null;
    const sp = new URLSearchParams(window.location.search);
    const r = sp.get("returnTo");
    // Allow only same-origin relative paths to avoid open-redirect surface.
    if (r && r.startsWith("/")) return r;
    return null;
  })();

  const handleBack = () => {
    if (returnTo) {
      navigate(returnTo);
    } else if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      navigate("/admin/crm/services");
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
        data-testid="back-button"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>Back</span>
      </button>
      <nav aria-label="Breadcrumb" className="text-xs text-gray-500">
        <ol className="flex items-center gap-1 flex-wrap">
          <li>
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="hover:text-brand-blue hover:underline"
              data-testid="breadcrumb-admin"
            >
              Admin
            </button>
          </li>
          <li aria-hidden="true" className="text-gray-300">/</li>
          <li>
            <button
              type="button"
              onClick={() => navigate("/admin/crm/services")}
              className="hover:text-brand-blue hover:underline"
              data-testid="breadcrumb-catalog"
            >
              Catalog
            </button>
          </li>
          <li aria-hidden="true" className="text-gray-300">/</li>
          <li className="text-gray-700 font-medium truncate max-w-[200px]" aria-current="page">
            {productName}
          </li>
        </ol>
      </nav>
    </div>
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

/* ── FeaturesEditor ─────────────────────────────────────────────────
 * One-bullet-per-line textarea that auto-grows with content and holds
 * raw text in local state so trailing spaces / blank trailing lines
 * don't get stripped mid-edit. The parent only sees the cleaned bullet
 * array (split on \n, trimmed, blanks dropped).
 *
 * Caps: 40 lines, 400 chars per line — enforced on input by truncating
 * over-long lines and refusing to add a 41st line. The previous version
 * surfaced the same limit only in the helper text.
 */
const FEATURE_MAX_LINES = 40;
const FEATURE_MAX_CHARS_PER_LINE = 400;

function cleanFeatures(raw: string): string[] {
  return raw.split("\n").map((s) => s.trim()).filter(Boolean);
}

function normaliseFeatureInput(raw: string): string {
  const lines = raw.split("\n").slice(0, FEATURE_MAX_LINES);
  return lines.map((l) => l.slice(0, FEATURE_MAX_CHARS_PER_LINE)).join("\n");
}

interface FeaturesEditorProps {
  features: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  testid?: string;
  minRows?: number;
}

function FeaturesEditor({ features, onChange, placeholder, testid, minRows = 6 }: FeaturesEditorProps) {
  // Raw textarea string is the source of truth while focused.
  const [raw, setRaw] = useState<string>(() => features.join("\n"));
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Keep raw in sync if the parent rewrites features from outside the editor
  // (e.g. AI form-fill or initial load) — but skip if the cleaned output
  // already matches, to avoid clobbering an in-progress edit.
  useEffect(() => {
    const incoming = features.join("\n");
    const currentCleaned = cleanFeatures(raw).join("\n");
    if (incoming !== currentCleaned) {
      setRaw(incoming);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features.join("")]);

  // Auto-grow: set height to scrollHeight after every change.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [raw]);

  const lineCount = raw === "" ? 0 : raw.split("\n").length;
  const bulletCount = cleanFeatures(raw).length;
  const atLineCap = lineCount >= FEATURE_MAX_LINES;

  return (
    <div className="space-y-1">
      <Textarea
        ref={ref}
        rows={minRows}
        value={raw}
        onChange={(e) => {
          const next = normaliseFeatureInput(e.target.value);
          setRaw(next);
          onChange(cleanFeatures(next));
        }}
        placeholder={placeholder}
        className="resize-none overflow-hidden"
        data-testid={testid}
      />
      <p className="text-[10px] text-gray-400 flex items-center gap-2">
        <span>
          {bulletCount} bullet{bulletCount === 1 ? "" : "s"} · {lineCount}/{FEATURE_MAX_LINES} lines · {FEATURE_MAX_CHARS_PER_LINE} chars/line
        </span>
        {atLineCap && (
          <span className="text-amber-600">Line limit reached</span>
        )}
      </p>
    </div>
  );
}

/* Q28d — Suppliers panel sub-component. Lists suppliers fulfilling this
   product plus a dropdown to assign any active supplier. Removal is
   one-click (no draft flow — supplier assignment is operational, not
   customer-visible). */
interface SupplierRow {
  id: number;
  name: string;
  type: string;
  cost_rate: number | null;
  currency: string | null;
  status: string;
  is_active: boolean;
  /* Q28h: per-service cost overrides. Server returns the full map; UI uses the
     entry keyed by the current serviceId to compute effective cost. */
  service_cost_overrides: Record<string, { cost_cents: number; cost_type?: string }> | null;
}

function SuppliersPanel({ serviceId, serviceName }: { serviceId: string; serviceName: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ assigned: SupplierRow[]; available: SupplierRow[] }>({
    queryKey: [`/api/admin/products/${serviceId}/suppliers`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/products/${serviceId}/suppliers`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load suppliers (${res.status})`);
      return res.json();
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ supplierId, assigned }: { supplierId: number; assigned: boolean }) => {
      const res = await fetch(`/api/admin/products/${serviceId}/suppliers/${supplierId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ assigned }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update supplier");
      return json;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/products/${serviceId}/suppliers`] });
      toast({ title: vars.assigned ? "Supplier assigned" : "Supplier unassigned" });
    },
    onError: (err: Error) => toast({ title: "Couldn't update supplier", description: err.message, variant: "destructive" }),
  });

  // Q28h: per-service cost override mutation
  const setCost = useMutation({
    mutationFn: async ({ supplierId, costCents }: { supplierId: number; costCents: number | null }) => {
      const res = await fetch(`/api/admin/products/${serviceId}/suppliers/${supplierId}/cost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cost_cents: costCents }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update cost");
      return json;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/products/${serviceId}/suppliers`] });
      toast({ title: vars.costCents === null ? "Override cleared" : "Cost override saved" });
    },
    onError: (err: Error) => toast({ title: "Couldn't update cost", description: err.message, variant: "destructive" }),
  });

  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [editingCost, setEditingCost] = useState<number | null>(null);
  const [costInput, setCostInput] = useState("");

  return (
    <Card className="p-5 space-y-3" data-testid="suppliers-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Factory className="w-4 h-4 text-gray-500" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Suppliers</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Who fulfills this product. Changes take effect immediately.
              Manage supplier records on <a href="/admin/crm/suppliers" className="text-brand-blue underline">Suppliers</a>.
            </p>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading suppliers...
        </div>
      )}

      {data && data.assigned.length === 0 && (
        <p className="text-xs text-gray-400 italic">No suppliers assigned to {serviceName} yet.</p>
      )}

      {data && data.assigned.length > 0 && (
        <ul className="space-y-1.5">
          {data.assigned.map((s) => {
            const overrideEntry = s.service_cost_overrides?.[serviceId];
            const effectiveCostCents = overrideEntry?.cost_cents ?? s.cost_rate;
            const currency = (s.currency || "usd").toUpperCase();
            return (
            <li
              key={s.id}
              className="px-3 py-2 rounded-md border border-gray-200 bg-white"
              data-testid={`supplier-row-${s.id}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                  <p className="text-[11px] text-gray-500">
                    {s.type}
                    {effectiveCostCents != null && (
                      <> · {(effectiveCostCents / 100).toFixed(2)} {currency}
                        {overrideEntry ? <span className="ml-1 text-amber-600">(override)</span> : null}
                      </>
                    )}
                    {!s.is_active && " · inactive"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCost(editingCost === s.id ? null : s.id);
                      setCostInput(overrideEntry ? String(overrideEntry.cost_cents) : "");
                    }}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                    aria-label="Edit per-service cost"
                    title="Edit per-service cost"
                    data-testid={`supplier-edit-cost-${s.id}`}
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Remove "${s.name}" from ${serviceName}?`)) {
                        toggle.mutate({ supplierId: s.id, assigned: false });
                      }
                    }}
                    disabled={toggle.isPending}
                    className="p-1.5 rounded hover:bg-red-50 text-red-500 disabled:opacity-40"
                    aria-label="Remove supplier"
                    data-testid={`supplier-remove-${s.id}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Q28h: inline cost override editor */}
              {editingCost === s.id && (
                <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2" data-testid={`supplier-cost-editor-${s.id}`}>
                  <span className="text-[11px] text-gray-500 shrink-0">Cost ({currency}, cents):</span>
                  <Input
                    type="number"
                    min={0}
                    value={costInput}
                    onChange={(e) => setCostInput(e.target.value)}
                    placeholder={s.cost_rate != null ? String(s.cost_rate) : "0"}
                    className="h-7 text-xs flex-1"
                    data-testid={`supplier-cost-input-${s.id}`}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      const v = costInput.trim();
                      if (v === "") return;
                      const n = Number(v);
                      if (!Number.isFinite(n) || n < 0) return;
                      setCost.mutate({ supplierId: s.id, costCents: Math.round(n) });
                      setEditingCost(null);
                    }}
                    disabled={setCost.isPending || costInput.trim() === ""}
                    className="h-7 text-[11px] bg-brand-blue hover:bg-brand-blue-600"
                    data-testid={`supplier-cost-save-${s.id}`}
                  >
                    Save
                  </Button>
                  {overrideEntry && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCost.mutate({ supplierId: s.id, costCents: null });
                        setEditingCost(null);
                      }}
                      disabled={setCost.isPending}
                      className="h-7 text-[11px]"
                      data-testid={`supplier-cost-clear-${s.id}`}
                    >
                      Clear
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingCost(null)}
                    className="h-7 text-[11px]"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </li>
            );
          })}
        </ul>
      )}

      {data && data.available.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <select
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
            className="h-9 flex-1 px-2 text-sm border border-gray-200 rounded-md bg-white"
            data-testid="supplier-select"
          >
            <option value="">Assign existing supplier…</option>
            {data.available.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.type})</option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={() => {
              if (!selectedSupplier) return;
              toggle.mutate({ supplierId: parseInt(selectedSupplier, 10), assigned: true });
              setSelectedSupplier("");
            }}
            disabled={!selectedSupplier || toggle.isPending}
            className="bg-brand-blue hover:bg-brand-blue-600"
            data-testid="supplier-assign-btn"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Assign
          </Button>
        </div>
      )}
    </Card>
  );
}

/* Q28e — Subscriber roster. Lists every client_service row for this
   product with status, enabled toggle, and cancel-with-reason button.
   Operational — no draft flow (customer billing state is live data). */
interface SubscriberRow {
  id: number;
  client_id: number;
  client_name: string;
  contact_email: string | null;
  status: string;
  enabled: boolean;
  price_cents: number | null;
  billing_period: string | null;
  started_at: string | null;
  cancelled_at: string | null;
  created_at: string | null;
}

function SubscribersPanel({ serviceId, serviceName }: { serviceId: string; serviceName: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ subscribers: SubscriberRow[] }>({
    queryKey: [`/api/admin/products/${serviceId}/subscribers`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/products/${serviceId}/subscribers`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load subscribers (${res.status})`);
      return res.json();
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ clientServiceId, enabled }: { clientServiceId: number; enabled: boolean }) => {
      const res = await fetch(`/api/admin/products/${serviceId}/subscribers/${clientServiceId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to toggle");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/products/${serviceId}/subscribers`] });
      toast({ title: "Subscription updated" });
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const cancel = useMutation({
    mutationFn: async ({ clientServiceId, reason }: { clientServiceId: number; reason: string }) => {
      const res = await fetch(`/api/admin/products/${serviceId}/subscribers/${clientServiceId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to cancel");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/products/${serviceId}/subscribers`] });
      toast({ title: "Subscription cancelled" });
    },
    onError: (err: Error) => toast({ title: "Cancel failed", description: err.message, variant: "destructive" }),
  });

  const subs = data?.subscribers ?? [];
  const active = subs.filter((s) => s.status !== "cancelled");
  const cancelled = subs.filter((s) => s.status === "cancelled");

  return (
    <Card className="p-5 space-y-3" data-testid="subscribers-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-500" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Subscribers <span className="text-gray-400 font-normal">({active.length} active{cancelled.length ? ` · ${cancelled.length} cancelled` : ""})</span>
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Clients with this product. Toggle enabled to pause without cancelling.
            </p>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading subscribers...
        </div>
      )}

      {!isLoading && subs.length === 0 && (
        <p className="text-xs text-gray-400 italic">No subscribers yet for {serviceName}.</p>
      )}

      {active.length > 0 && (
        <ul className="space-y-1.5">
          {active.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-gray-200 bg-white"
              data-testid={`subscriber-row-${s.id}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  <a href={`/admin/crm/clients/${s.client_id}`} className="hover:text-brand-blue hover:underline">
                    {s.client_name}
                  </a>
                </p>
                <p className="text-[11px] text-gray-500">
                  {s.status}
                  {!s.enabled && " · paused"}
                  {s.price_cents != null && ` · $${(s.price_cents / 100).toFixed(2)}${s.billing_period === "monthly" ? "/mo" : ""}`}
                  {s.started_at && ` · since ${new Date(s.started_at).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggle.mutate({ clientServiceId: s.id, enabled: !s.enabled })}
                  disabled={toggle.isPending}
                  className="h-7 text-[11px]"
                  data-testid={`subscriber-toggle-${s.id}`}
                >
                  {s.enabled ? "Pause" : "Resume"}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    const reason = window.prompt(`Cancel ${s.client_name}'s ${serviceName}? Optional reason:`) ?? null;
                    if (reason === null) return;
                    cancel.mutate({ clientServiceId: s.id, reason });
                  }}
                  disabled={cancel.isPending}
                  className="p-1.5 rounded hover:bg-red-50 text-red-500 disabled:opacity-40"
                  aria-label="Cancel subscription"
                  data-testid={`subscriber-cancel-${s.id}`}
                >
                  <Ban className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {cancelled.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
            {cancelled.length} cancelled subscription{cancelled.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1">
            {cancelled.map((s) => (
              <li key={s.id} className="px-3 py-1.5 text-[11px] text-gray-500 bg-gray-50 rounded">
                <a href={`/admin/crm/clients/${s.client_id}`} className="hover:text-brand-blue hover:underline">
                  {s.client_name}
                </a>
                {s.cancelled_at && ` · cancelled ${new Date(s.cancelled_at).toLocaleDateString()}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
