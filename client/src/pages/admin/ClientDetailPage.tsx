import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link, useLocation, useSearch } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Mail, Phone, Globe, MapPin, Plus, ChevronDown, ChevronUp, Pencil, RefreshCw, CreditCard, Copy, ExternalLink, ClipboardCheck, UserPlus, ShieldCheck,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TaskCard, ClientTasksEmptyState, isOverdue, type TaskItem } from "@/components/admin/TaskCard";

/* ─── Types ─── */
interface Client {
  id: number;
  user_id: number | null;
  business_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  trade_type: string | null;
  status: string;
  source: string | null;
  automation_enabled: boolean;
  human_override: boolean;
  created_at: string;
}

interface ClientServiceRow {
  id: number;
  service_id: string;
  service_name: string | null;
  status: string;
  enabled: boolean;
  fulfillment_mode: string | null;
  price_cents: number | null;
  cost_cents: number | null;
  billing_period: string | null;
  created_at: string;
}

interface PaymentRow {
  id: number;
  type: string;
  amount_cents: number;
  status: string;
  description: string | null;
  paid_at: string | null;
  created_at: string;
}

interface OnboardingRow {
  id: number;
  access_token: string | null;
  status: string;
  responses: Record<string, { value: any; completed_at?: string }> | null;
  submitted_at: string | null;
  created_at: string;
}

interface NoteRow {
  id: number;
  content: string;
  actor_type: string;
  pinned: boolean;
  created_at: string;
}

interface ServiceCatalogItem {
  id: string;
  name: string;
  default_price: number | null;
  billing_period: string;
}

/* ─── Helpers ─── */
const STATUS_COLORS: Record<string, string> = {
  lead: "bg-gray-100 text-gray-700",
  onboarding: "bg-amber-50 text-amber-700",
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-blue-50 text-blue-700",
  churned: "bg-red-50 text-red-700",
  pending: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-50 text-red-700",
  completed: "bg-emerald-50 text-emerald-700",
  not_started: "bg-gray-100 text-gray-600",
  submitted: "bg-blue-50 text-blue-700",
  in_progress: "bg-indigo-50 text-indigo-700",
  waiting: "bg-amber-50 text-amber-700",
  blocked: "bg-red-50 text-red-700",
  delivered: "bg-emerald-50 text-emerald-700",
  paid: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[status] || "bg-gray-100 text-gray-600"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function fmt(cents: number | null) {
  if (cents == null) return "-";
  return `$${(cents / 100).toFixed(0)}`;
}

function fmtDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ─── Activity Section (collapsed) ─── */
function ActivitySection({ clientId }: { clientId: number }) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full p-4 text-left min-h-[44px]"
      >
        <span className="text-sm font-medium text-gray-500">Activity Log</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          <p className="text-sm text-gray-500">Activity log will show all actions taken on this client — by humans and AI agents. Coming in the next iteration.</p>
        </div>
      )}
    </Card>
  );
}

/* ─── Main Component ─── */
export default function ClientDetailPage() {
  const [, params] = useRoute("/admin/crm/clients/:id");
  const clientId = parseInt(params?.id || "0");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const searchString = useSearch();

  // Detect checkout return from Stripe
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const checkout = params.get("checkout");
    if (checkout === "success") {
      toast({ title: "Payment successful", description: "Service will be provisioned shortly" });
      // Clean up query param
      navigate(`/admin/crm/clients/${clientId}`, { replace: true });
      // Refresh all data
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}/services`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}/fulfillment`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}/payments`] });
    } else if (checkout === "cancelled") {
      toast({ title: "Checkout cancelled", description: "No payment was made" });
      navigate(`/admin/crm/clients/${clientId}`, { replace: true });
    }
  }, [searchString]); // eslint-disable-line react-hooks/exhaustive-deps

  // Queries
  const { data: client, isLoading } = useQuery<Client>({
    queryKey: [`/api/admin/crm/clients/${clientId}`],
    enabled: !!clientId,
  });

  const { data: services } = useQuery<ClientServiceRow[]>({
    queryKey: [`/api/admin/crm/clients/${clientId}/services`],
    enabled: !!clientId,
  });

  const { data: fulfillment } = useQuery<TaskItem[]>({
    queryKey: [`/api/admin/crm/clients/${clientId}/fulfillment`],
    enabled: !!clientId,
  });

  const { data: payments } = useQuery<PaymentRow[]>({
    queryKey: [`/api/admin/crm/clients/${clientId}/payments`],
    enabled: !!clientId,
  });

  const { data: notes } = useQuery<NoteRow[]>({
    queryKey: [`/api/admin/crm/clients/${clientId}/notes`],
    enabled: !!clientId,
  });

  const { data: onboarding } = useQuery<OnboardingRow[]>({
    queryKey: [`/api/admin/crm/clients/${clientId}/onboarding`],
    enabled: !!clientId,
  });

  const { data: catalog } = useQuery<ServiceCatalogItem[]>({
    queryKey: ["/api/admin/crm/services"],
  });

  // Mutations
  const toggleService = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/crm/client-services/${id}`, { enabled });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}/services`] }),
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiRequest("PATCH", `/api/admin/crm/clients/${clientId}`, { status });
      return res.json();
    },
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/clients"] });
      toast({ title: "Client updated", description: `Status changed to ${status}` });
    },
  });

  // Edit client
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    business_name: "", contact_name: "", contact_email: "", contact_phone: "",
    website_url: "", trade_type: "", source: "",
  });

  function openEdit() {
    setEditForm({
      business_name: client?.business_name || "",
      contact_name: client?.contact_name || "",
      contact_email: client?.contact_email || "",
      contact_phone: client?.contact_phone || "",
      website_url: client?.website_url || "",
      trade_type: client?.trade_type || "",
      source: client?.source || "",
    });
    setShowEdit(true);
  }

  const saveClient = useMutation({
    mutationFn: async (data: typeof editForm) => {
      const res = await apiRequest("PATCH", `/api/admin/crm/clients/${clientId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/clients"] });
      setShowEdit(false);
      toast({ title: "Client updated", description: "Details saved" });
    },
  });

  const updateTaskStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/crm/fulfillment/${id}`, { status });
      return res.json();
    },
    onSuccess: (_data, { status }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}/fulfillment`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/fulfillment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/overview"] });
      toast({ title: "Task updated", description: `Moved to ${status.replace(/_/g, " ")}` });
    },
  });

  // Add note
  const [noteText, setNoteText] = useState("");
  const addNote = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/crm/notes", {
        client_id: clientId,
        content: noteText,
        actor_type: "human",
      });
      return res.json();
    },
    onSuccess: () => {
      setNoteText("");
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}/notes`] });
    },
  });

  // Add service dialog
  const [showAddService, setShowAddService] = useState(false);
  const [newServiceId, setNewServiceId] = useState("");
  const addService = useMutation({
    mutationFn: async () => {
      // Use provision endpoint — creates service + invoice + onboarding + tasks in one call
      const res = await apiRequest("POST", `/api/admin/crm/clients/${clientId}/provision`, {
        service_id: newServiceId,
      });
      return res.json();
    },
    onSuccess: (data: { tasksCreated: number }) => {
      setShowAddService(false);
      setNewServiceId("");
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}/services`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}/fulfillment`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}/payments`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/fulfillment"] });
      toast({ title: "Service provisioned", description: `${data.tasksCreated} tasks created` });
    },
  });

  // Generate monthly tasks for recurring services
  const generateTasks = useMutation({
    mutationFn: async (clientServiceId: number) => {
      const res = await apiRequest("POST", `/api/admin/crm/client-services/${clientServiceId}/generate-tasks`, {});
      return res.json();
    },
    onSuccess: (data: { tasksCreated: number; month: string }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}/fulfillment`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/fulfillment"] });
      toast({ title: "Tasks generated", description: `${data.tasksCreated} tasks for ${data.month}` });
    },
  });

  // Stripe checkout
  const startCheckout = useMutation({
    mutationFn: async ({ serviceId }: { serviceId: string }) => {
      const res = await apiRequest("POST", "/api/billing/checkout", {
        client_id: clientId,
        service_id: serviceId,
      });
      return res.json();
    },
    onSuccess: (data: { checkout_url: string }) => {
      if (data.checkout_url) {
        window.open(data.checkout_url, "_blank");
        toast({ title: "Checkout opened", description: "Complete payment in the new tab" });
      }
    },
    onError: () => {
      toast({ title: "Checkout failed", description: "Could not create checkout session. Check Stripe config." });
    },
  });

  // Portal access
  const [portalResult, setPortalResult] = useState<{ email: string; temporary_password?: string } | null>(null);
  const createPortalAccess = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/crm/clients/${clientId}/create-account`, {});
      return res.json();
    },
    onSuccess: (data: { already_exists: boolean; email: string; temporary_password?: string }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}`] });
      if (data.already_exists) {
        toast({ title: "Portal access already exists", description: `Account: ${data.email}` });
      } else {
        setPortalResult({ email: data.email, temporary_password: data.temporary_password });
      }
    },
  });

  // Update payment status
  const updatePaymentStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/crm/payments/${id}`, { status });
      return res.json();
    },
    onSuccess: (_data, { status }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}/payments`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/payments"] });
      toast({ title: "Payment updated", description: `Marked as ${status}` });
    },
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="max-w-5xl mx-auto space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!client) {
    return (
      <AdminLayout>
        <div className="max-w-5xl mx-auto text-center py-20">
          <p className="text-gray-500">Client not found.</p>
          <Link href="/admin/crm/clients"><span className="text-sm text-[#2D6A4F]">Back to clients</span></Link>
        </div>
      </AdminLayout>
    );
  }

  const totalRevenue = (services ?? []).reduce((acc, s) => acc + (s.price_cents ?? 0), 0);
  const totalCost = (services ?? []).reduce((acc, s) => acc + (s.cost_cents ?? 0), 0);

  return (
    <AdminLayout pageContext={{
      page: "client_detail",
      clientId: client.id,
      clientName: client.business_name,
      clientStatus: client.status,
      tradeType: client.trade_type ?? undefined,
      activeServicesCount: services?.filter(s => s.status === "active").length,
      serviceNames: services?.filter(s => s.status === "active").map(s => s.service_name || s.service_id),
      openTasksCount: fulfillment?.filter(t => !["delivered","cancelled"].includes(t.status)).length,
      overdueTasksCount: fulfillment?.filter(t => isOverdue(t.due_at, t.status)).length,
      unpaidAmount: payments?.filter(p => p.status === "pending").reduce((a, p) => a + p.amount_cents, 0),
      onboardingStatus: onboarding?.[0]?.status,
      pinnedNotes: notes?.filter(n => n.pinned).slice(0, 3).map(n => ({
        content: n.content,
        actor_type: n.actor_type,
      })),
      topTasks: fulfillment?.filter(t => !["delivered","cancelled"].includes(t.status)).slice(0, 8).map(t => ({
        title: t.title, status: t.status, priority: t.priority, waiting_on: t.waiting_on,
        handled_by: t.handled_by, automation_status: t.automation_status, next_action: t.next_action,
      })),
      latestPayment: payments?.[0] ? {
        status: payments[0].status,
        amount_cents: payments[0].amount_cents,
        date: payments[0].paid_at || payments[0].created_at,
      } : undefined,
      supplierNames: Array.from(new Set(
        (fulfillment ?? []).map(t => t.supplier_name).filter((n): n is string => !!n)
      )),
    }}>
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Back link */}
        <Link href="/admin/crm/clients">
          <span className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 min-h-[44px] py-2">
            <ArrowLeft className="w-4 h-4" /> All Clients
          </span>
        </Link>

        {/* Client header */}
        <Card className="p-5">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{client.business_name}</h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-500">
                {client.contact_name && <span>{client.contact_name}</span>}
                {client.contact_email && (
                  <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {client.contact_email}</span>
                )}
                {client.contact_phone && (
                  <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {client.contact_phone}</span>
                )}
                {client.website_url && (
                  <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> {client.website_url}</span>
                )}
                {client.trade_type && (
                  <span className="flex items-center gap-1 capitalize"><MapPin className="w-3.5 h-3.5" /> {client.trade_type}</span>
                )}
                {client.created_at && (
                  <span className="text-gray-400">Since {new Date(client.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {client.user_id ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                  <ShieldCheck className="w-3 h-3" /> Portal Active
                </span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={createPortalAccess.isPending || !client.contact_email}
                  onClick={() => createPortalAccess.mutate()}
                  title={!client.contact_email ? "Add a contact email first" : undefined}
                >
                  <UserPlus className="w-3 h-3 mr-1" />
                  {createPortalAccess.isPending ? "Creating..." : "Create Portal Access"}
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={openEdit}>
                <Pencil className="w-3 h-3 mr-1" /> Edit
              </Button>
              <Select value={client.status} onValueChange={(v) => updateStatus.mutate(v)}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="churned">Churned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
            <div>
              <p className="text-xs text-gray-500">Monthly Revenue</p>
              <p className="text-lg font-semibold text-gray-900">{fmt(totalRevenue)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Monthly Cost</p>
              <p className="text-lg font-semibold text-gray-900">{fmt(totalCost)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Profit</p>
              <p className="text-lg font-semibold text-emerald-700">{fmt(totalRevenue - totalCost)}</p>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="services">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          {/* ─── Services Tab ─── */}
          <TabsContent value="services" className="mt-4">
            <Card>
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Services ({services?.length ?? 0})</h3>
                <Button size="sm" variant="outline" className="min-h-[36px]" onClick={() => setShowAddService(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Service
                </Button>
              </div>

              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead></TableHead>
                      <TableHead className="text-right">Enabled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-gray-500 text-sm">
                          No services assigned yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      services?.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium text-sm">{s.service_name || s.service_id}</TableCell>
                          <TableCell><StatusBadge status={s.status} /></TableCell>
                          <TableCell className="text-xs text-gray-500 capitalize">{s.fulfillment_mode || "-"}</TableCell>
                          <TableCell className="text-sm">{fmt(s.price_cents)}{s.billing_period === "monthly" ? "/mo" : ""}</TableCell>
                          <TableCell className="text-sm">
                            <div className="flex gap-1">
                              {s.status === "pending" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-[#2D6A4F] hover:bg-[#F0F7F4]"
                                  onClick={() => startCheckout.mutate({ serviceId: s.service_id })}
                                  disabled={startCheckout.isPending}
                                >
                                  <CreditCard className="w-3 h-3 mr-1" /> Charge
                                </Button>
                              )}
                              {s.billing_period === "monthly" && s.status === "active" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-gray-500 hover:text-[#2D6A4F]"
                                  onClick={() => generateTasks.mutate(s.id)}
                                  disabled={generateTasks.isPending}
                                >
                                  <RefreshCw className="w-3 h-3 mr-1" /> Generate
                                </Button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Switch
                              checked={s.enabled}
                              onCheckedChange={(checked) => toggleService.mutate({ id: s.id, enabled: checked })}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden divide-y divide-gray-100">
                {services?.length === 0 ? (
                  <p className="text-center py-6 text-gray-500 text-sm">No services assigned yet.</p>
                ) : (
                  services?.map((s) => (
                    <div key={s.id} className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{s.service_name || s.service_id}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <StatusBadge status={s.status} />
                            <span className="text-xs text-gray-500">{fmt(s.price_cents)}{s.billing_period === "monthly" ? "/mo" : ""}</span>
                          </div>
                        </div>
                        <Switch
                          checked={s.enabled}
                          onCheckedChange={(checked) => toggleService.mutate({ id: s.id, enabled: checked })}
                        />
                      </div>
                      <div className="flex gap-2 mt-2">
                        {s.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-[#2D6A4F] hover:bg-[#F0F7F4]"
                            onClick={() => startCheckout.mutate({ serviceId: s.service_id })}
                            disabled={startCheckout.isPending}
                          >
                            <CreditCard className="w-3 h-3 mr-1" /> Charge
                          </Button>
                        )}
                        {s.billing_period === "monthly" && s.status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-gray-500 hover:text-[#2D6A4F]"
                            onClick={() => generateTasks.mutate(s.id)}
                            disabled={generateTasks.isPending}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" /> Generate Monthly Tasks
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </TabsContent>

          {/* ─── Tasks Tab ─── */}
          <TabsContent value="tasks" className="mt-4 space-y-3">
            {/* Onboarding cards */}
            {onboarding?.map((ob) => (
              <Card key={ob.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-sm font-medium text-gray-900">Onboarding Form</span>
                      <StatusBadge status={ob.status} />
                    </div>
                    {ob.submitted_at && (
                      <p className="text-xs text-gray-500 mt-1 ml-6">
                        Submitted {new Date(ob.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {ob.access_token && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-gray-500 hover:text-[#2D6A4F]"
                          onClick={async () => {
                            const url = `${window.location.origin}/onboarding/${ob.access_token}`;
                            navigator.clipboard.writeText(url);
                            toast({ title: "Link copied", description: "Onboarding form link copied to clipboard" });
                            // Mark as sent if still not_sent
                            if (ob.status === "not_sent") {
                              await apiRequest("PATCH", `/api/admin/crm/onboarding/${ob.id}`, { status: "sent", sent_at: new Date().toISOString() });
                              queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}/onboarding`] });
                            }
                          }}
                        >
                          <Copy className="w-3 h-3 mr-1" /> Copy Link
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-gray-500 hover:text-[#2D6A4F]"
                          onClick={() => window.open(`/onboarding/${ob.access_token}`, "_blank")}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" /> Open
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {/* Show responses if submitted */}
                {ob.responses && ob.status !== "not_sent" && ob.status !== "sent" && (
                  <div className="mt-3 ml-6 space-y-1.5 border-t border-gray-50 pt-3">
                    {Object.entries(ob.responses).map(([key, val]) => (
                      <div key={key} className="flex gap-2 text-xs">
                        <span className="text-gray-400 shrink-0 w-28 truncate">{key.replace(/_/g, " ")}</span>
                        <span className="text-gray-700">
                          {typeof (val as any)?.value === "boolean" ? ((val as any).value ? "Yes" : "No") : String((val as any)?.value || "-")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}

            {/* Progress bar */}
            {fulfillment && fulfillment.length > 0 && (() => {
              const done = fulfillment.filter(t => t.status === "delivered" || t.status === "cancelled").length;
              const total = fulfillment.length;
              return (
                <div className="flex items-center gap-2 mb-2 px-0.5">
                  <span className="text-xs font-medium text-gray-500">{done}/{total} complete</span>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
                    <div className="h-full bg-[#2D6A4F] rounded-full transition-all" style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }} />
                  </div>
                </div>
              );
            })()}
            {fulfillment?.length === 0 ? (
              <ClientTasksEmptyState />
            ) : (
              fulfillment?.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  showClient={false}
                  onStatusChange={(id, status) => updateTaskStatus.mutate({ id, status })}
                />
              ))
            )}
          </TabsContent>

          {/* ─── Billing Tab ─── */}
          <TabsContent value="billing" className="mt-4">
            <Card>
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Payments ({payments?.length ?? 0})</h3>
              </div>

              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6 text-gray-500 text-sm">No payment records.</TableCell>
                      </TableRow>
                    ) : (
                      payments?.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm capitalize">{p.type}</TableCell>
                          <TableCell className="font-medium text-sm">{fmt(p.amount_cents)}</TableCell>
                          <TableCell>
                            <Select value={p.status} onValueChange={(v) => updatePaymentStatus.mutate({ id: p.id, status: v })}>
                              <SelectTrigger className="h-7 w-auto min-w-[90px] text-[11px] px-2">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending" className="text-xs">Pending</SelectItem>
                                <SelectItem value="paid" className="text-xs">Paid</SelectItem>
                                <SelectItem value="failed" className="text-xs">Failed</SelectItem>
                                <SelectItem value="refunded" className="text-xs">Refunded</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">{p.description || "-"}</TableCell>
                          <TableCell className="text-sm">{fmtDate(p.paid_at || p.created_at)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden divide-y divide-gray-100">
                {payments?.length === 0 ? (
                  <p className="text-center py-6 text-gray-500 text-sm">No payment records.</p>
                ) : (
                  payments?.map((p) => (
                    <div key={p.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900 capitalize">{p.type} &middot; {fmt(p.amount_cents)}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{p.description || fmtDate(p.paid_at || p.created_at)}</p>
                        </div>
                        <Select value={p.status} onValueChange={(v) => updatePaymentStatus.mutate({ id: p.id, status: v })}>
                          <SelectTrigger className="h-7 w-auto min-w-[80px] text-[11px] px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending" className="text-xs">Pending</SelectItem>
                            <SelectItem value="paid" className="text-xs">Paid</SelectItem>
                            <SelectItem value="failed" className="text-xs">Failed</SelectItem>
                            <SelectItem value="refunded" className="text-xs">Refunded</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </TabsContent>

          {/* ─── Notes Tab ─── */}
          <TabsContent value="notes" className="mt-4 space-y-3">
            <Card className="p-4">
              <div className="flex gap-2">
                <Textarea
                  placeholder="Add a note..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  className="resize-none h-20"
                />
              </div>
              <div className="flex justify-end mt-2">
                <Button
                  size="sm"
                  onClick={() => addNote.mutate()}
                  disabled={!noteText.trim() || addNote.isPending}
                  className="bg-[#2D6A4F] hover:bg-[#1B4332]"
                >
                  {addNote.isPending ? "Saving..." : "Add Note"}
                </Button>
              </div>
            </Card>
            {notes?.map((n) => (
              <Card key={n.id} className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-gray-500 capitalize">{n.actor_type}</span>
                  <span className="text-xs text-gray-400">{fmtDate(n.created_at)}</span>
                  {n.pinned && <Badge variant="outline" className="text-[10px]">Pinned</Badge>}
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{n.content}</p>
              </Card>
            ))}
            {notes?.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No notes yet.</p>
            )}
          </TabsContent>

        </Tabs>

        {/* ─── Collapsed Activity Section ─── */}
        <ActivitySection clientId={clientId} />

        {/* Add service dialog */}
        <Dialog open={showAddService} onOpenChange={setShowAddService}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Add Service</DialogTitle>
            </DialogHeader>
            <div>
              <label className="text-xs font-medium text-gray-600">Service</label>
              <Select value={newServiceId} onValueChange={setNewServiceId}>
                <SelectTrigger><SelectValue placeholder="Select a service..." /></SelectTrigger>
                <SelectContent>
                  {catalog?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} {s.default_price ? `($${(s.default_price / 100).toFixed(0)}/${s.billing_period === "monthly" ? "mo" : "once"})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddService(false)}>Cancel</Button>
              <Button
                onClick={() => addService.mutate()}
                disabled={!newServiceId || addService.isPending}
                className="bg-[#2D6A4F] hover:bg-[#1B4332]"
              >
                {addService.isPending ? "Adding..." : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Edit client dialog */}
        <Dialog open={showEdit} onOpenChange={setShowEdit}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Edit Client</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Business Name *</label>
                <Input value={editForm.business_name} onChange={(e) => setEditForm({ ...editForm, business_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Contact Name</label>
                  <Input value={editForm.contact_name} onChange={(e) => setEditForm({ ...editForm, contact_name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Phone</label>
                  <Input value={editForm.contact_phone} onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Email</label>
                <Input value={editForm.contact_email} onChange={(e) => setEditForm({ ...editForm, contact_email: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Trade</label>
                  <Input value={editForm.trade_type} onChange={(e) => setEditForm({ ...editForm, trade_type: e.target.value })} placeholder="e.g. plumber" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Website</label>
                  <Input value={editForm.website_url} onChange={(e) => setEditForm({ ...editForm, website_url: e.target.value })} placeholder="https://..." />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Source</label>
                <Select value={editForm.source || "manual"} onValueChange={(v) => setEditForm({ ...editForm, source: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="audit">Audit</SelectItem>
                    <SelectItem value="referral">Referral</SelectItem>
                    <SelectItem value="inbound">Inbound</SelectItem>
                    <SelectItem value="website">Website</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
              <Button
                onClick={() => saveClient.mutate(editForm)}
                disabled={!editForm.business_name || saveClient.isPending}
                className="bg-[#2D6A4F] hover:bg-[#1B4332]"
              >
                {saveClient.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Portal credentials dialog */}
        <Dialog open={!!portalResult} onOpenChange={(v) => !v && setPortalResult(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Portal Access Created</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-gray-600">
                Share these credentials with the client. They can sign in at <span className="font-medium">/login</span>.
              </p>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3 border border-gray-200">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Email</p>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-medium text-gray-900">{portalResult?.email}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(portalResult?.email || ""); toast({ title: "Copied email" }); }}
                      className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {portalResult?.temporary_password && (
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Temporary Password</p>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-medium text-gray-900">{portalResult.temporary_password}</code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(portalResult?.temporary_password || ""); toast({ title: "Copied password" }); }}
                        className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-amber-600">
                This password is shown once and cannot be retrieved later.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => setPortalResult(null)} className="bg-[#2D6A4F] hover:bg-[#1B4332]">
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
