import { usePageTitle } from "@/hooks/usePageTitle";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Plus, ArrowLeft, Mail, Globe, ShoppingBag, Hand,
  Clock, CheckCircle2, ListTodo, Pencil, Trash2, Download,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { csvDownload, todayIso } from "@/lib/csvDownload";

/* ─── Types ─── */

interface Supplier {
  id: number;
  name: string;
  type: string;
  supplier_type: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  platform_url: string | null;
  fiverr_profile_url: string | null;
  api_endpoint: string | null;
  api_key_set?: boolean;
  supported_services: string[] | null;
  cost_rate: number | null;
  cost_type: string | null;
  currency: string | null;
  notes: string | null;
  status: string;
  is_active: boolean;
  metadata: any;
  /* W-AM-3: external-marketplace vetting metadata. */
  specialties: string[] | null;
  avg_turnaround_days: number | null;
  quality_rating: string | number | null; // numeric returns as string
  external_completed_jobs: number | null;
  last_vetted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SupplierDetail extends Supplier {
  stats: {
    total_tasks: number;
    completed_tasks: number;
    avg_completion_time_hours: number | null;
  };
  tasks: TaskRow[];
}

interface TaskRow {
  id: number;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  completed_at: string | null;
}

interface ServiceCatalogItem {
  id: string;
  name: string;
  is_active: boolean;
}

/* ─── Constants ─── */

const SUPPLIER_TYPE_ICON: Record<string, typeof Mail> = {
  email: Mail,
  api: Globe,
  fiverr: ShoppingBag,
  manual: Hand,
};

const SUPPLIER_TYPE_COLORS: Record<string, string> = {
  email: "bg-blue-50 text-blue-700 border-blue-200",
  api: "bg-brand-blue-50 text-brand-blue-700 border-brand-blue-200",
  fiverr: "bg-green-50 text-green-700 border-green-200",
  manual: "bg-amber-50 text-amber-700 border-amber-200",
};

const TYPE_COLORS: Record<string, string> = {
  fiverr: "bg-green-50 text-green-700",
  freelancer: "bg-blue-50 text-blue-700",
  white_label: "bg-brand-blue-50 text-brand-blue-700",
  automation: "bg-cyan-50 text-cyan-700",
  internal: "bg-muted text-foreground",
};

const COST_TYPE_LABELS: Record<string, string> = {
  per_task: "Per Task",
  monthly: "Monthly",
  hourly: "Hourly",
  per_project: "Per Project",
};

const TASK_STATUS_COLORS: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  submitted: "bg-blue-50 text-blue-700",
  in_progress: "bg-yellow-50 text-yellow-700",
  waiting: "bg-orange-50 text-orange-700",
  blocked: "bg-red-50 text-red-700",
  qa_review: "bg-brand-blue-50 text-brand-blue-700",
  revision_required: "bg-pink-50 text-pink-700",
  delivered: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-muted text-muted-foreground",
};

/* W-AM-3: canonical specialty tag suggestions for the multi-select pills.
   Free-form additions are still allowed via the "add" input. */
const SPECIALTY_SUGGESTIONS = [
  "WordPress", "Shopify", "Wix", "Squarespace", "Webflow", "Elementor",
  "WooCommerce", "CSS", "mobile-responsive", "speed-optimization",
  "security", "malware-removal", "snippet-install", "analytics-install",
  "pixel-install",
];

const EMPTY_FORM = {
  name: "",
  type: "freelancer",
  supplier_type: "email",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  platform_url: "",
  fiverr_profile_url: "",
  api_endpoint: "",
  api_key: "",
  supported_services: [] as string[],
  cost_rate_dollars: "",
  cost_type: "per_task",
  notes: "",
  status: "active",
  // W-AM-3 fields
  specialties: [] as string[],
  avg_turnaround_days: "",
  quality_rating: "",
  external_completed_jobs: "",
  last_vetted_at: "", // YYYY-MM-DD; converted to ISO timestamp on submit
};

/* W-AM-3: derive vetting status from last_vetted_at timestamp.
   - never vetted -> "unverified" (amber)
   - vetted within 90 days -> "verified" (emerald)
   - vetted > 90 days ago -> "stale" (gray) */
function getVettingStatus(lastVettedAt: string | null): "verified" | "stale" | "unverified" {
  if (!lastVettedAt) return "unverified";
  const vetted = new Date(lastVettedAt).getTime();
  if (!Number.isFinite(vetted)) return "unverified";
  const ageDays = (Date.now() - vetted) / (1000 * 60 * 60 * 24);
  return ageDays <= 90 ? "verified" : "stale";
}

function VettingBadge({ lastVettedAt }: { lastVettedAt: string | null }) {
  const status = getVettingStatus(lastVettedAt);
  const cls = {
    verified: "bg-emerald-50 text-emerald-700 border-emerald-200",
    stale: "bg-muted text-muted-foreground border-border",
    unverified: "bg-amber-50 text-amber-700 border-amber-200",
  }[status];
  const label = { verified: "Verified", stale: "Stale", unverified: "Unverified" }[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cls}`}>
      {label}
    </span>
  );
}

/* ─── Component ─── */

export default function SuppliersPage() {
  usePageTitle("Supplier Management");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  /** Supplier pending deactivation — drives the shared <ConfirmDialog>. */
  const [pendingDeactivate, setPendingDeactivate] = useState<Supplier | null>(null);

  // ─── Queries ───

  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/admin/suppliers"],
  });

  const { data: services = [] } = useQuery<ServiceCatalogItem[]>({
    queryKey: ["/api/admin/crm/services"],
  });

  const { data: supplierDetail, isLoading: detailLoading } = useQuery<SupplierDetail>({
    queryKey: ["/api/admin/suppliers", detailId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/suppliers/${detailId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load supplier");
      return res.json();
    },
    enabled: detailId !== null,
  });

  // ─── Mutations ───

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/admin/suppliers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suppliers"] });
      closeForm();
      toast({ title: "Supplier created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/admin/suppliers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suppliers"] });
      if (detailId) queryClient.invalidateQueries({ queryKey: ["/api/admin/suppliers", detailId] });
      closeForm();
      toast({ title: "Supplier updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/suppliers/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suppliers"] });
      toast({ title: "Supplier deactivated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // ─── Helpers ───

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  function openAddForm() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  }

  function openEditForm(supplier: Supplier) {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name,
      type: supplier.type,
      supplier_type: supplier.supplier_type || "email",
      contact_name: supplier.contact_name || "",
      contact_email: supplier.contact_email || "",
      contact_phone: supplier.contact_phone || "",
      platform_url: supplier.platform_url || "",
      fiverr_profile_url: supplier.fiverr_profile_url || "",
      api_endpoint: supplier.api_endpoint || "",
      // api_key is never sent to the client (masked) — leave blank; a blank
      // value on save keeps the existing key.
      api_key: "",
      supported_services: (supplier.supported_services as string[]) || [],
      cost_rate_dollars: supplier.cost_rate ? (supplier.cost_rate / 100).toFixed(2) : "",
      cost_type: supplier.cost_type || "per_task",
      notes: supplier.notes || "",
      status: supplier.status || (supplier.is_active ? "active" : "inactive"),
      // W-AM-3
      specialties: (supplier.specialties as string[]) || [],
      avg_turnaround_days: supplier.avg_turnaround_days != null ? String(supplier.avg_turnaround_days) : "",
      quality_rating: supplier.quality_rating != null ? String(supplier.quality_rating) : "",
      external_completed_jobs: supplier.external_completed_jobs != null ? String(supplier.external_completed_jobs) : "",
      last_vetted_at: supplier.last_vetted_at ? supplier.last_vetted_at.slice(0, 10) : "",
    });
    setShowForm(true);
  }

  function handleSubmit() {
    const costCents = form.cost_rate_dollars
      ? Math.round(parseFloat(form.cost_rate_dollars) * 100)
      : null;
    const payload: Record<string, any> = {
      name: form.name,
      type: form.type,
      supplier_type: form.supplier_type,
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      platform_url: form.platform_url || null,
      fiverr_profile_url: form.supplier_type === "fiverr" ? (form.fiverr_profile_url || null) : null,
      api_endpoint: form.supplier_type === "api" ? (form.api_endpoint || null) : null,
      api_key: form.supplier_type === "api" ? (form.api_key || null) : null,
      supported_services: form.supported_services.length > 0 ? form.supported_services : null,
      cost_rate: costCents,
      cost_type: form.cost_type,
      notes: form.notes || null,
      status: form.status,
      is_active: form.status === "active",
      // W-AM-3
      specialties: form.specialties,
      avg_turnaround_days: form.avg_turnaround_days ? parseInt(form.avg_turnaround_days, 10) : null,
      quality_rating: form.quality_rating ? form.quality_rating : null,
      external_completed_jobs: form.external_completed_jobs ? parseInt(form.external_completed_jobs, 10) : null,
      last_vetted_at: form.last_vetted_at ? new Date(form.last_vetted_at).toISOString() : null,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function toggleService(serviceId: string) {
    setForm((prev) => {
      const current = prev.supported_services;
      if (current.includes(serviceId)) {
        return { ...prev, supported_services: current.filter((s) => s !== serviceId) };
      }
      return { ...prev, supported_services: [...current, serviceId] };
    });
  }

  function toggleSpecialty(tag: string) {
    const t = tag.trim();
    if (!t) return;
    setForm((prev) => {
      const current = prev.specialties;
      if (current.includes(t)) {
        return { ...prev, specialties: current.filter((s) => s !== t) };
      }
      return { ...prev, specialties: [...current, t] };
    });
  }

  function formatCost(rate: number | null, costType: string | null): string {
    if (rate === null) return "-";
    const dollars = (rate / 100).toFixed(2);
    const label = COST_TYPE_LABELS[costType || "per_task"] || costType;
    return `$${dollars} / ${label}`;
  }

  const VALID_TYPE = ["fiverr", "freelancer", "white_label", "automation", "internal"];
  const VALID_SUP_TYPE = ["email", "api", "fiverr", "manual"];
  const VALID_COST_TYPE = ["per_task", "monthly", "hourly", "per_project"];
  const VALID_STATUS = ["active", "inactive"];

  /* Q30c expansion / Phase 1b: register the add/edit supplier form with the
   * copilot form registry. Only enabled while the form is open (showForm) so
   * the AI doesn't propose fills when the operator isn't editing anything. */
  useCopilotForm({
    formLabel: "Supplier",
    fields: [
      { key: "name", label: "Supplier name", required: true },
      { key: "type", label: "Type (fiverr | freelancer | white_label | automation | internal)" },
      { key: "supplier_type", label: "Channel (email | api | fiverr | manual)" },
      { key: "contact_name", label: "Contact name" },
      { key: "contact_email", label: "Contact email" },
      { key: "contact_phone", label: "Contact phone" },
      { key: "platform_url", label: "Platform URL" },
      { key: "fiverr_profile_url", label: "Fiverr profile URL" },
      { key: "cost_rate_dollars", label: "Cost rate (dollars, numeric string)" },
      { key: "cost_type", label: "Cost type (per_task | monthly | hourly | per_project)" },
      { key: "notes", label: "Notes" },
      { key: "status", label: "Status (active | inactive)" },
    ],
    values: {
      name: form.name,
      type: form.type,
      supplier_type: form.supplier_type,
      contact_name: form.contact_name,
      contact_email: form.contact_email,
      contact_phone: form.contact_phone,
      platform_url: form.platform_url,
      fiverr_profile_url: form.fiverr_profile_url,
      cost_rate_dollars: form.cost_rate_dollars,
      cost_type: form.cost_type,
      notes: form.notes,
      status: form.status,
    },
    onApply: (fills) => {
      if (!showForm) return; // safety — only mutate when the form is open
      setForm((f) => {
        const next = { ...f };
        for (const fill of fills) {
          switch (fill.field_key) {
            case "name": next.name = fill.value; break;
            case "type": if (VALID_TYPE.includes(fill.value)) next.type = fill.value; break;
            case "supplier_type": if (VALID_SUP_TYPE.includes(fill.value)) next.supplier_type = fill.value; break;
            case "contact_name": next.contact_name = fill.value; break;
            case "contact_email": next.contact_email = fill.value; break;
            case "contact_phone": next.contact_phone = fill.value; break;
            case "platform_url": next.platform_url = fill.value; break;
            case "fiverr_profile_url": next.fiverr_profile_url = fill.value; break;
            case "cost_rate_dollars": next.cost_rate_dollars = fill.value; break;
            case "cost_type": if (VALID_COST_TYPE.includes(fill.value)) next.cost_type = fill.value; break;
            case "notes": next.notes = fill.value; break;
            case "status": if (VALID_STATUS.includes(fill.value)) next.status = fill.value; break;
          }
        }
        return next;
      });
    },
    enabled: showForm,
  });

  // ─── Detail View ───

  if (detailId !== null) {
    return (
      <AdminLayout pageContext={{ page: "suppliers" }}>
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setDetailId(null)} className="gap-1 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> Back to Suppliers
          </Button>

          {detailLoading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground/70">Loading supplier...</CardContent></Card>
          ) : supplierDetail ? (
            <>
              {/* Header */}
              <Card>
                <CardContent className="py-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-xl font-semibold text-foreground">{supplierDetail.name}</h2>
                        <VettingBadge lastVettedAt={supplierDetail.last_vetted_at} />
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <SupplierTypeBadge type={supplierDetail.supplier_type} />
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TYPE_COLORS[supplierDetail.type] || "bg-muted text-muted-foreground"}`}>
                          {supplierDetail.type.replace(/_/g, " ")}
                        </span>
                        {supplierDetail.is_active ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Active</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">Inactive</span>
                        )}
                        {((supplierDetail.specialties as string[]) || []).map((tag) => (
                          <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditForm(supplierDetail)} className="gap-1">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">Contact</span>
                      <div className="text-foreground">{supplierDetail.contact_name || "-"}</div>
                      <div className="text-muted-foreground text-xs">{supplierDetail.contact_email || ""}</div>
                      {supplierDetail.contact_phone && <div className="text-muted-foreground text-xs">{supplierDetail.contact_phone}</div>}
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Cost Rate</span>
                      <div className="text-foreground">{formatCost(supplierDetail.cost_rate, supplierDetail.cost_type)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Services</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {(supplierDetail.supported_services || []).length > 0
                          ? (supplierDetail.supported_services as string[]).map((s) => (
                              <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                            ))
                          : <span className="text-muted-foreground/70">None assigned</span>
                        }
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Links</span>
                      <div className="flex flex-col gap-0.5">
                        {supplierDetail.fiverr_profile_url && (
                          <a href={supplierDetail.fiverr_profile_url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-blue hover:underline">Fiverr Profile</a>
                        )}
                        {supplierDetail.platform_url && (
                          <a href={supplierDetail.platform_url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-blue hover:underline">Platform URL</a>
                        )}
                        {!supplierDetail.fiverr_profile_url && !supplierDetail.platform_url && <span className="text-muted-foreground/70 text-xs">-</span>}
                      </div>
                    </div>
                  </div>
                  {supplierDetail.notes && (
                    <div className="mt-3 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">{supplierDetail.notes}</div>
                  )}
                </CardContent>
              </Card>

              {/* Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 auto-rows-fr">
                <Card>
                  <CardContent className="py-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-50">
                      <ListTodo className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-foreground">{supplierDetail.stats.total_tasks}</div>
                      <div className="text-xs text-muted-foreground">Total Tasks</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-50">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-foreground">{supplierDetail.stats.completed_tasks}</div>
                      <div className="text-xs text-muted-foreground">Completed</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-50">
                      <Clock className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-foreground">
                        {supplierDetail.stats.avg_completion_time_hours !== null
                          ? `${supplierDetail.stats.avg_completion_time_hours}h`
                          : "-"}
                      </div>
                      <div className="text-xs text-muted-foreground">Avg Delivery</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Tasks Table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Assigned Tasks</CardTitle>
                </CardHeader>
                <CardContent>
                  {supplierDetail.tasks.length === 0 ? (
                    <div className="text-center py-8 px-4">
                      <p className="text-sm text-muted-foreground mb-1">No tasks assigned to this supplier yet.</p>
                      <p className="text-xs text-muted-foreground/70">
                        Tasks appear here as soon as a client orders a service this supplier covers,
                        or after you manually assign one from a
                        {" "}<a href="/admin/crm/clients" className="text-brand-blue hover:underline font-medium">client's fulfillment tab</a>.
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Task</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Completed</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supplierDetail.tasks.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                              <ListTodo className="w-6 h-6 text-muted-foreground/50 mx-auto mb-2" />
                              <p className="text-sm font-medium text-foreground mb-0.5">No tasks assigned</p>
                              <p className="text-xs text-muted-foreground">Tasks assigned to this supplier will appear here.</p>
                            </TableCell>
                          </TableRow>
                        ) : (
                          supplierDetail.tasks.map((t) => (
                            <TableRow key={t.id}>
                              <TableCell className="font-medium text-sm">{t.title}</TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TASK_STATUS_COLORS[t.status] || "bg-muted text-muted-foreground"}`}>
                                  {t.status.replace(/_/g, " ")}
                                </span>
                              </TableCell>
                              <TableCell className="text-sm capitalize">{t.priority}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {new Date(t.created_at).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {t.completed_at ? new Date(t.completed_at).toLocaleDateString() : "-"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground/70">Supplier not found.</CardContent></Card>
          )}
        </div>

        {/* Edit form dialog also available from detail view */}
        <SupplierFormDialog
          open={showForm}
          onOpenChange={(open) => { if (!open) closeForm(); }}
          form={form}
          setForm={setForm}
          editingId={editingId}
          services={services}
          onSubmit={handleSubmit}
          onToggleService={toggleService}
          onToggleSpecialty={toggleSpecialty}
          isPending={createMutation.isPending || updateMutation.isPending}
        />
      </AdminLayout>
    );
  }

  // ─── Main List View ───

  const activeSuppliers = suppliers.filter((s) => s.is_active);

  return (
    <AdminLayout pageContext={{
      page: "suppliers",
      supplierCount: suppliers.length,
      activeSupplierCount: activeSuppliers.length,
      supplierNames: activeSuppliers.map((s) => s.name),
    }}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">Supplier Management</h2>
            <p className="text-sm text-muted-foreground">
              {activeSuppliers.length} active of {suppliers.length} total suppliers
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!suppliers.length) return;
                csvDownload<Supplier>({
                  filename: `suppliers-${todayIso()}.csv`,
                  columns: [
                    { header: "id", value: (s) => s.id },
                    { header: "name", value: (s) => s.name },
                    { header: "type", value: (s) => s.type },
                    { header: "supplier_type", value: (s) => s.supplier_type },
                    { header: "contact_name", value: (s) => s.contact_name },
                    { header: "contact_email", value: (s) => s.contact_email },
                    { header: "contact_phone", value: (s) => s.contact_phone },
                    { header: "supported_services", value: (s) => ((s.supported_services as string[]) || []).join("; ") },
                    { header: "cost_rate", value: (s) => s.cost_rate },
                    { header: "cost_type", value: (s) => s.cost_type },
                    { header: "is_active", value: (s) => s.is_active },
                  ],
                  rows: suppliers,
                });
              }}
              disabled={!suppliers.length}
              className="min-h-[36px]"
            >
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
            <Button size="sm" onClick={openAddForm} className="bg-brand-blue hover:bg-brand-blue-600 min-h-[36px]">
              <Plus className="w-4 h-4 mr-1" /> Add Supplier
            </Button>
          </div>
        </div>

        {/* Table — hides Type and Cost columns under md so the layout
            stays readable on phones. Wrapped in overflow-x-auto as
            a safety net in case content still overflows. */}
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell">Services</TableHead>
                <TableHead className="hidden md:table-cell">Cost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  </TableRow>
                ))
              ) : suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No suppliers yet. Click "Add Supplier" to register your first one.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailId(s.id)}>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium text-sm text-foreground">{s.name}</div>
                        <VettingBadge lastVettedAt={s.last_vetted_at} />
                      </div>
                      <div className="text-xs text-muted-foreground">{s.contact_email || ""}</div>
                      {((s.specialties as string[]) || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {((s.specialties as string[]) || []).slice(0, 4).map((tag) => (
                            <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                          {((s.specialties as string[]) || []).length > 4 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                              +{((s.specialties as string[]) || []).length - 4}
                            </span>
                          )}
                        </div>
                      )}
                      {/* Mobile: surface type inline below name since we hid the column */}
                      <div className="md:hidden mt-1 text-[11px] text-muted-foreground capitalize">
                        {s.type.replace(/_/g, " ")} · {formatCost(s.cost_rate, s.cost_type)}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-1.5">
                        <SupplierTypeBadge type={s.supplier_type} />
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TYPE_COLORS[s.type] || "bg-muted text-muted-foreground"}`}>
                          {s.type.replace(/_/g, " ")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {((s.supported_services as string[]) || []).slice(0, 3).map((svc) => (
                          <Badge key={svc} variant="secondary" className="text-xs">{svc}</Badge>
                        ))}
                        {((s.supported_services as string[]) || []).length > 3 && (
                          <Badge variant="secondary" className="text-xs">+{(s.supported_services as string[]).length - 3}</Badge>
                        )}
                        {((s.supported_services as string[]) || []).length === 0 && (
                          <span className="text-xs text-muted-foreground/70">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-foreground">
                      {formatCost(s.cost_rate, s.cost_type)}
                    </TableCell>
                    <TableCell>
                      {s.is_active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Active</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">Inactive</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => openEditForm(s)} className="h-8 w-8 p-0" aria-label={`Edit ${s.name}`}>
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                        {s.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingDeactivate(s)}
                            className="h-8 w-8 p-0"
                            aria-label={`Deactivate ${s.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <SupplierFormDialog
        open={showForm}
        onOpenChange={(open) => { if (!open) closeForm(); }}
        form={form}
        setForm={setForm}
        editingId={editingId}
        services={services}
        onSubmit={handleSubmit}
        onToggleService={toggleService}
        onToggleSpecialty={toggleSpecialty}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      {/* Shared deactivate-supplier confirmation. */}
      <ConfirmDialog
        open={pendingDeactivate !== null}
        onOpenChange={(o) => { if (!o) setPendingDeactivate(null); }}
        title={pendingDeactivate ? `Deactivate "${pendingDeactivate.name}"?` : "Deactivate supplier?"}
        description="Active tasks stay assigned to this supplier — they just won't be picked for any new work."
        confirmLabel="Deactivate"
        destructive
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (pendingDeactivate) {
            deleteMutation.mutate(pendingDeactivate.id);
            setPendingDeactivate(null);
          }
        }}
      />
    </AdminLayout>
  );
}

/* ─── Supplier Type Badge ─── */

function SupplierTypeBadge({ type }: { type: string }) {
  const Icon = SUPPLIER_TYPE_ICON[type] || Mail;
  const colors = SUPPLIER_TYPE_COLORS[type] || "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${colors}`}>
      <Icon className="w-3 h-3" />
      {type}
    </span>
  );
}

/* ─── Form Dialog ─── */

function SupplierFormDialog({
  open,
  onOpenChange,
  form,
  setForm,
  editingId,
  services,
  onSubmit,
  onToggleService,
  onToggleSpecialty,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: typeof EMPTY_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>;
  editingId: number | null;
  services: ServiceCatalogItem[];
  onSubmit: () => void;
  onToggleService: (serviceId: string) => void;
  onToggleSpecialty: (tag: string) => void;
  isPending: boolean;
}) {
  const activeServices = services.filter((s) => s.is_active);
  const [specialtyDraft, setSpecialtyDraft] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="integration">Integration</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="space-y-3 mt-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name *</label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Supplier name" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Contact Email *</label>
              <Input type="email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} placeholder="supplier@example.com" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Contact Name</label>
                <Input value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Contact Phone</label>
                <Input value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Category</label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fiverr">Fiverr</SelectItem>
                    <SelectItem value="freelancer">Freelancer</SelectItem>
                    <SelectItem value="white_label">White Label</SelectItem>
                    <SelectItem value="automation">Automation</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Supplier Type</label>
                <Select value={form.supplier_type} onValueChange={(v) => setForm((f) => ({ ...f, supplier_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="api">API</SelectItem>
                    <SelectItem value="fiverr">Fiverr</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Cost Rate ($)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.cost_rate_dollars}
                  onChange={(e) => setForm((f) => ({ ...f, cost_rate_dollars: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Cost Type</label>
                <Select value={form.cost_type} onValueChange={(v) => setForm((f) => ({ ...f, cost_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_task">Per Task</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="per_project">Per Project</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* W-AM-3: external-marketplace vetting metadata */}
            <div className="pt-2 border-t">
              <div className="text-xs font-semibold text-foreground mb-2">Vetting (Fiverr / external marketplace)</div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Specialties</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {SPECIALTY_SUGGESTIONS.map((tag) => {
                    const selected = form.specialties.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => onToggleSpecialty(tag)}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                          selected
                            ? "bg-brand-blue/10 text-brand-blue border-brand-blue/30"
                            : "bg-card text-muted-foreground border-border hover:bg-muted/50"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                  {form.specialties
                    .filter((t) => !SPECIALTY_SUGGESTIONS.includes(t))
                    .map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => onToggleSpecialty(tag)}
                        className="px-2 py-0.5 rounded-full text-xs font-medium border bg-brand-blue/10 text-brand-blue border-brand-blue/30"
                      >
                        {tag} ×
                      </button>
                    ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Add custom specialty..."
                    value={specialtyDraft}
                    onChange={(e) => setSpecialtyDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (specialtyDraft.trim()) {
                          onToggleSpecialty(specialtyDraft);
                          setSpecialtyDraft("");
                        }
                      }
                    }}
                    className="h-8 text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (specialtyDraft.trim()) {
                        onToggleSpecialty(specialtyDraft);
                        setSpecialtyDraft("");
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Avg turnaround (days)</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={form.avg_turnaround_days}
                    onChange={(e) => setForm((f) => ({ ...f, avg_turnaround_days: e.target.value }))}
                    placeholder="3"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Quality rating (0-5)</label>
                  <Input
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={form.quality_rating}
                    onChange={(e) => setForm((f) => ({ ...f, quality_rating: e.target.value }))}
                    placeholder="4.9"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">External completed jobs</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={form.external_completed_jobs}
                    onChange={(e) => setForm((f) => ({ ...f, external_completed_jobs: e.target.value }))}
                    placeholder="500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Last vetted at</label>
                  <div className="flex gap-1">
                    <Input
                      type="date"
                      value={form.last_vetted_at}
                      onChange={(e) => setForm((f) => ({ ...f, last_vetted_at: e.target.value }))}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setForm((f) => ({ ...f, last_vetted_at: new Date().toISOString().slice(0, 10) }))}
                      title="Set to today"
                    >
                      Today
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Internal notes about this supplier..."
                rows={3}
              />
            </div>
          </TabsContent>

          {/* Integration Tab */}
          <TabsContent value="integration" className="space-y-3 mt-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Platform URL</label>
              <Input value={form.platform_url} onChange={(e) => setForm((f) => ({ ...f, platform_url: e.target.value }))} placeholder="https://..." />
            </div>

            {form.supplier_type === "fiverr" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Fiverr Profile URL</label>
                <Input value={form.fiverr_profile_url} onChange={(e) => setForm((f) => ({ ...f, fiverr_profile_url: e.target.value }))} placeholder="https://fiverr.com/seller" />
              </div>
            )}

            {form.supplier_type === "api" && (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">API Endpoint</label>
                  <Input value={form.api_endpoint} onChange={(e) => setForm((f) => ({ ...f, api_endpoint: e.target.value }))} placeholder="https://api.example.com/tasks" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">API Key</label>
                  <Input
                    type="password"
                    value={form.api_key}
                    onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                    placeholder="Leave blank to keep current key"
                  />
                </div>
              </>
            )}

            {form.supplier_type !== "fiverr" && form.supplier_type !== "api" && (
              <div className="text-sm text-muted-foreground/70 py-4 text-center">
                Select "Fiverr" or "API" as supplier type to configure integration-specific fields.
              </div>
            )}
          </TabsContent>

          {/* Services Tab */}
          <TabsContent value="services" className="mt-3">
            <p className="text-xs text-muted-foreground mb-3">Select the services this supplier can handle:</p>
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {activeServices.length === 0 ? (
                <div className="text-sm text-muted-foreground/70 py-4 text-center">No active services found.</div>
              ) : (
                activeServices.map((svc) => (
                  <label
                    key={svc.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                      form.supported_services.includes(svc.id)
                        ? "bg-brand-blue/10 border border-brand-blue/30"
                        : "hover:bg-muted/50 border border-transparent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.supported_services.includes(svc.id)}
                      onChange={() => onToggleService(svc.id)}
                      className="rounded border-input text-brand-blue focus:ring-brand-blue"
                    />
                    <span className="text-sm text-foreground">{svc.name}</span>
                    <span className="text-xs text-muted-foreground/70 ml-auto">{svc.id}</span>
                  </label>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={onSubmit}
            disabled={!form.name || !form.contact_email || isPending}
            className="bg-brand-blue hover:bg-brand-blue-600"
          >
            {isPending ? "Saving..." : editingId ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
