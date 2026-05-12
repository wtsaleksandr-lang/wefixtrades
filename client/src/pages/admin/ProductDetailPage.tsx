/**
 * Admin product editor — /admin/products/:id (Q28 v1)
 *
 * Lets admin edit a product's customer-visible copy (name, tagline,
 * description, price, billing period, category) through a draft →
 * approve & publish flow.
 *
 * Customer-facing surfaces (website, /portal/catalog, /pricing,
 * etc.) read serviceCatalog directly — drafts are admin-only until
 * published. "Publish" copies draft_data into the matching
 * serviceCatalog row so changes go live everywhere at once.
 *
 * Out of scope for v1 (Q28 follow-ups in CARRYOVER):
 * - Pricing TIERS editor (currently only default_price)
 * - Features array editor
 * - Stripe price-ID linkage editor
 * - Supplier panel
 * - Subscriber roster
 * - AI workflow config
 * - Multi-approver workflow (any admin can publish their own draft today)
 */

import { useEffect, useMemo, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ChevronLeft, Check, AlertTriangle, FileEdit, History } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";

interface ServiceCatalogRow {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: string;
  default_price: number | null;
  billing_period: string;
  is_active: boolean;
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
};

const CATEGORIES = ["visibility", "leads", "reputation", "automation", "website"];

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
    if (!live) return { name: "", tagline: "", description: "", default_price_cents: "", billing_period: "monthly", category: "visibility" };
    const d = hasPendingDraft ? draft!.draft_data : {};
    return {
      name: (d.name ?? live.name) ?? "",
      tagline: (d.tagline ?? live.tagline) ?? "",
      description: (d.description ?? live.description) ?? "",
      default_price_cents: String(d.default_price ?? live.default_price ?? ""),
      billing_period: (d.billing_period ?? live.billing_period) ?? "monthly",
      category: (d.category ?? live.category) ?? "visibility",
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
    return out;
  }, [form, live]);
  const hasChanges = Object.keys(dirty).length > 0;

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
                <li>Pricing tiers (currently only one default price)</li>
                <li>Feature list / "what's included" bullets</li>
                <li>Stripe price IDs (use direct DB edit for now)</li>
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
