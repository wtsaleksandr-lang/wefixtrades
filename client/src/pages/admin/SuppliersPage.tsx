import { usePageTitle } from "@/hooks/usePageTitle";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, ArrowLeft, Mail, Globe, ShoppingBag, Hand,
  Clock, CheckCircle2, ListTodo, Pencil, Trash2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  api_key: string | null;
  supported_services: string[] | null;
  cost_rate: number | null;
  cost_type: string | null;
  currency: string | null;
  notes: string | null;
  status: string;
  is_active: boolean;
  metadata: any;
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
  api: "bg-violet-50 text-violet-700 border-violet-200",
  fiverr: "bg-green-50 text-green-700 border-green-200",
  manual: "bg-amber-50 text-amber-700 border-amber-200",
};

const TYPE_COLORS: Record<string, string> = {
  fiverr: "bg-green-50 text-green-700",
  freelancer: "bg-blue-50 text-blue-700",
  white_label: "bg-purple-50 text-purple-700",
  automation: "bg-cyan-50 text-cyan-700",
  internal: "bg-gray-100 text-gray-700",
};

const COST_TYPE_LABELS: Record<string, string> = {
  per_task: "Per Task",
  monthly: "Monthly",
  hourly: "Hourly",
  per_project: "Per Project",
};

const TASK_STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-600",
  submitted: "bg-blue-50 text-blue-700",
  in_progress: "bg-yellow-50 text-yellow-700",
  waiting: "bg-orange-50 text-orange-700",
  blocked: "bg-red-50 text-red-700",
  qa_review: "bg-indigo-50 text-indigo-700",
  revision_required: "bg-pink-50 text-pink-700",
  delivered: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-500",
};

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
};

/* ─── Component ─── */

export default function SuppliersPage() {
  usePageTitle("Supplier Management");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

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
      api_key: supplier.api_key || "",
      supported_services: (supplier.supported_services as string[]) || [],
      cost_rate_dollars: supplier.cost_rate ? (supplier.cost_rate / 100).toFixed(2) : "",
      cost_type: supplier.cost_type || "per_task",
      notes: supplier.notes || "",
      status: supplier.status || (supplier.is_active ? "active" : "inactive"),
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

  function formatCost(rate: number | null, costType: string | null): string {
    if (rate === null) return "-";
    const dollars = (rate / 100).toFixed(2);
    const label = COST_TYPE_LABELS[costType || "per_task"] || costType;
    return `$${dollars} / ${label}`;
  }

  // ─── Detail View ───

  if (detailId !== null) {
    return (
      <AdminLayout pageContext={{ page: "suppliers" }}>
        <div className="max-w-5xl mx-auto space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setDetailId(null)} className="gap-1 text-gray-600">
            <ArrowLeft className="w-4 h-4" /> Back to Suppliers
          </Button>

          {detailLoading ? (
            <Card><CardContent className="py-12 text-center text-gray-400">Loading supplier...</CardContent></Card>
          ) : supplierDetail ? (
            <>
              {/* Header */}
              <Card>
                <CardContent className="py-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">{supplierDetail.name}</h2>
                      <div className="flex items-center gap-2 mt-1.5">
                        <SupplierTypeBadge type={supplierDetail.supplier_type} />
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TYPE_COLORS[supplierDetail.type] || "bg-gray-100 text-gray-600"}`}>
                          {supplierDetail.type.replace(/_/g, " ")}
                        </span>
                        {supplierDetail.is_active ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Active</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Inactive</span>
                        )}
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
                      <span className="text-gray-500 text-xs">Contact</span>
                      <div className="text-gray-900">{supplierDetail.contact_name || "-"}</div>
                      <div className="text-gray-600 text-xs">{supplierDetail.contact_email || ""}</div>
                      {supplierDetail.contact_phone && <div className="text-gray-600 text-xs">{supplierDetail.contact_phone}</div>}
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">Cost Rate</span>
                      <div className="text-gray-900">{formatCost(supplierDetail.cost_rate, supplierDetail.cost_type)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">Services</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {(supplierDetail.supported_services || []).length > 0
                          ? (supplierDetail.supported_services as string[]).map((s) => (
                              <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                            ))
                          : <span className="text-gray-400">None assigned</span>
                        }
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">Links</span>
                      <div className="flex flex-col gap-0.5">
                        {supplierDetail.fiverr_profile_url && (
                          <a href={supplierDetail.fiverr_profile_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#2D6A4F] hover:underline">Fiverr Profile</a>
                        )}
                        {supplierDetail.platform_url && (
                          <a href={supplierDetail.platform_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#2D6A4F] hover:underline">Platform URL</a>
                        )}
                        {!supplierDetail.fiverr_profile_url && !supplierDetail.platform_url && <span className="text-gray-400 text-xs">-</span>}
                      </div>
                    </div>
                  </div>
                  {supplierDetail.notes && (
                    <div className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-md p-3">{supplierDetail.notes}</div>
                  )}
                </CardContent>
              </Card>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="py-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-50">
                      <ListTodo className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{supplierDetail.stats.total_tasks}</div>
                      <div className="text-xs text-gray-500">Total Tasks</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-50">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{supplierDetail.stats.completed_tasks}</div>
                      <div className="text-xs text-gray-500">Completed</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-50">
                      <Clock className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">
                        {supplierDetail.stats.avg_completion_time_hours !== null
                          ? `${supplierDetail.stats.avg_completion_time_hours}h`
                          : "-"}
                      </div>
                      <div className="text-xs text-gray-500">Avg Delivery</div>
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
                      <p className="text-sm text-gray-500 mb-1">No tasks assigned to this supplier yet.</p>
                      <p className="text-xs text-gray-400">
                        Tasks appear here as soon as a client orders a service this supplier covers,
                        or after you manually assign one from a
                        {" "}<a href="/admin/crm/clients" className="text-[#2D6A4F] hover:underline font-medium">client's fulfillment tab</a>.
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
                        {supplierDetail.tasks.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="font-medium text-sm">{t.title}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TASK_STATUS_COLORS[t.status] || "bg-gray-100 text-gray-600"}`}>
                                {t.status.replace(/_/g, " ")}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm capitalize">{t.priority}</TableCell>
                            <TableCell className="text-xs text-gray-500">
                              {new Date(t.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-xs text-gray-500">
                              {t.completed_at ? new Date(t.completed_at).toLocaleDateString() : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card><CardContent className="py-12 text-center text-gray-400">Supplier not found.</CardContent></Card>
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
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Supplier Management</h2>
            <p className="text-sm text-gray-500">
              {activeSuppliers.length} active of {suppliers.length} total suppliers
            </p>
          </div>
          <Button size="sm" onClick={openAddForm} className="bg-[#2D6A4F] hover:bg-[#1B4332] min-h-[36px]">
            <Plus className="w-4 h-4 mr-1" /> Add Supplier
          </Button>
        </div>

        {/* Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Services</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400">Loading...</TableCell></TableRow>
              ) : suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    No suppliers yet. Click "Add Supplier" to register your first one.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setDetailId(s.id)}>
                    <TableCell>
                      <div className="font-medium text-sm text-gray-900">{s.name}</div>
                      <div className="text-xs text-gray-500">{s.contact_email || ""}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <SupplierTypeBadge type={s.supplier_type} />
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TYPE_COLORS[s.type] || "bg-gray-100 text-gray-600"}`}>
                          {s.type.replace(/_/g, " ")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {((s.supported_services as string[]) || []).slice(0, 3).map((svc) => (
                          <Badge key={svc} variant="secondary" className="text-xs">{svc}</Badge>
                        ))}
                        {((s.supported_services as string[]) || []).length > 3 && (
                          <Badge variant="secondary" className="text-xs">+{(s.supported_services as string[]).length - 3}</Badge>
                        )}
                        {((s.supported_services as string[]) || []).length === 0 && (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-700">
                      {formatCost(s.cost_rate, s.cost_type)}
                    </TableCell>
                    <TableCell>
                      {s.is_active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Active</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Inactive</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => openEditForm(s)} className="h-8 w-8 p-0">
                          <Pencil className="w-3.5 h-3.5 text-gray-500" />
                        </Button>
                        {s.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteMutation.mutate(s.id)}
                            className="h-8 w-8 p-0"
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
        isPending={createMutation.isPending || updateMutation.isPending}
      />
    </AdminLayout>
  );
}

/* ─── Supplier Type Badge ─── */

function SupplierTypeBadge({ type }: { type: string }) {
  const Icon = SUPPLIER_TYPE_ICON[type] || Mail;
  const colors = SUPPLIER_TYPE_COLORS[type] || "bg-gray-100 text-gray-600 border-gray-200";
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
  isPending: boolean;
}) {
  const activeServices = services.filter((s) => s.is_active);

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
              <label className="text-xs font-medium text-gray-600">Name *</label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Supplier name" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Contact Email *</label>
              <Input type="email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} placeholder="supplier@example.com" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Contact Name</label>
                <Input value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Contact Phone</label>
                <Input value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Category</label>
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
                <label className="text-xs font-medium text-gray-600">Supplier Type</label>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Cost Rate ($)</label>
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
                <label className="text-xs font-medium text-gray-600">Cost Type</label>
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
              <label className="text-xs font-medium text-gray-600">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Notes</label>
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
              <label className="text-xs font-medium text-gray-600">Platform URL</label>
              <Input value={form.platform_url} onChange={(e) => setForm((f) => ({ ...f, platform_url: e.target.value }))} placeholder="https://..." />
            </div>

            {form.supplier_type === "fiverr" && (
              <div>
                <label className="text-xs font-medium text-gray-600">Fiverr Profile URL</label>
                <Input value={form.fiverr_profile_url} onChange={(e) => setForm((f) => ({ ...f, fiverr_profile_url: e.target.value }))} placeholder="https://fiverr.com/seller" />
              </div>
            )}

            {form.supplier_type === "api" && (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-600">API Endpoint</label>
                  <Input value={form.api_endpoint} onChange={(e) => setForm((f) => ({ ...f, api_endpoint: e.target.value }))} placeholder="https://api.example.com/tasks" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">API Key</label>
                  <Input
                    type="password"
                    value={form.api_key}
                    onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                    placeholder="sk-..."
                  />
                </div>
              </>
            )}

            {form.supplier_type !== "fiverr" && form.supplier_type !== "api" && (
              <div className="text-sm text-gray-400 py-4 text-center">
                Select "Fiverr" or "API" as supplier type to configure integration-specific fields.
              </div>
            )}
          </TabsContent>

          {/* Services Tab */}
          <TabsContent value="services" className="mt-3">
            <p className="text-xs text-gray-500 mb-3">Select the services this supplier can handle:</p>
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {activeServices.length === 0 ? (
                <div className="text-sm text-gray-400 py-4 text-center">No active services found.</div>
              ) : (
                activeServices.map((svc) => (
                  <label
                    key={svc.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                      form.supported_services.includes(svc.id)
                        ? "bg-[#2D6A4F]/10 border border-[#2D6A4F]/30"
                        : "hover:bg-gray-50 border border-transparent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.supported_services.includes(svc.id)}
                      onChange={() => onToggleService(svc.id)}
                      className="rounded border-gray-300 text-[#2D6A4F] focus:ring-[#2D6A4F]"
                    />
                    <span className="text-sm text-gray-800">{svc.name}</span>
                    <span className="text-xs text-gray-400 ml-auto">{svc.id}</span>
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
            className="bg-[#2D6A4F] hover:bg-[#1B4332]"
          >
            {isPending ? "Saving..." : editingId ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
