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

  ArrowLeft, Mail, Phone, Globe, MapPin, Plus, ChevronDown, ChevronUp, Pencil, RefreshCw, CreditCard, Copy, ExternalLink, ClipboardCheck, UserPlus, ShieldCheck, Calculator, Eye,
  PhoneCall, PhoneIncoming, PhoneMissed, PhoneOff, Loader2, Save, AlertCircle, CheckCircle2, HelpCircle,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TaskCard, ClientTasksEmptyState, isOverdue, type TaskItem } from "@/components/admin/TaskCard";
import RankFlowTab from "@/components/admin/RankFlowTab";
import { ServiceOpsCard, ServiceOpsSection, HelpCue, HelpText, type OpsStatus } from "@/components/admin/ServiceOps";
import { Star as StarIcon } from "lucide-react";
import MapguardOpsTab from "@/components/admin/MapguardOpsTab";
import ModeToggle from "@/components/portal/ModeToggle";
import SocialSyncTab from "@/components/admin/SocialSyncTab";

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

  // QuoteQuick calculator data for this client
  const { data: qqData } = useQuery<{ calculators: Array<{
    id: number; business_name: string; trade_type: string; slug: string;
    plan_tier: string; total_views: number; total_leads: number;
    status: string; created_at: string;
    calculator_url: string; edit_url: string;
    price_cents: number; cost_cents: number;
  }>; profitability?: {
    total_revenue_cents: number; total_cost_cents: number;
    profit_cents: number; margin_pct: number;
  } }>({
    queryKey: [`/api/admin/crm/clients/${clientId}/quotequick`],
    enabled: !!clientId,
  });

  // Mutations
  const toggleService = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/crm/client-services/${id}`, { enabled });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}/services`] }),
  });

  const updateServiceCost = useMutation({
    mutationFn: async ({ id, cost_cents }: { id: number; cost_cents: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/crm/client-services/${id}`, { cost_cents });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}/services`] });
      toast({ title: "Cost updated" });
    },
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
  const totalProfit = totalRevenue - totalCost;
  const marginPct = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;

  return (
    <AdminLayout pageContext={{
      page: "client_detail",
      clientId: client.id,
      clientName: client.business_name,
      clientStatus: client.status,
      activeServicesCount: services?.filter(s => s.status === "active").length,
      openTasksCount: fulfillment?.filter(t => !["delivered","cancelled"].includes(t.status)).length,
      overdueTasksCount: fulfillment?.filter(t => isOverdue(t.due_at, t.status)).length,
      unpaidAmount: payments?.filter(p => p.status === "pending").reduce((a, p) => a + p.amount_cents, 0),
      topTasks: fulfillment?.filter(t => !["delivered","cancelled"].includes(t.status)).slice(0, 5).map(t => ({
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
          <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
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
              <p className={`text-lg font-semibold ${totalProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>{fmt(totalProfit)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Margin</p>
              <p className={`text-lg font-semibold ${marginPct >= 50 ? "text-emerald-700" : marginPct >= 20 ? "text-amber-600" : "text-red-600"}`}>{marginPct}%</p>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="services">
          <TabsList className="w-full grid grid-cols-8">
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="reputation">Reputation</TabsTrigger>
            <TabsTrigger value="mapguard">MapGuard</TabsTrigger>
            <TabsTrigger value="rankflow">RankFlow</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="socialsync">SocialSync</TabsTrigger>
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
                      <TableHead>Cost</TableHead>
                      <TableHead>Margin</TableHead>
                      <TableHead></TableHead>
                      <TableHead className="text-right">Enabled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-6 text-gray-500 text-sm">
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
                            <div className="flex items-center gap-1">
                              <input
                                id={`cost-input-${s.id}`}
                                type="number"
                                className="w-20 h-7 px-2 text-xs border border-gray-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-300"
                                defaultValue={s.cost_cents ? (s.cost_cents / 100).toFixed(0) : ""}
                                placeholder="0"
                                onBlur={(e) => {
                                  const val = Math.round(parseFloat(e.target.value || "0") * 100);
                                  if (val !== (s.cost_cents ?? 0)) updateServiceCost.mutate({ id: s.id, cost_cents: val });
                                }}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              />
                              {s.service_id.startsWith("reputationshield") && (
                                <button
                                  className="text-[10px] text-blue-500 hover:underline whitespace-nowrap"
                                  title="Estimate cost from usage data"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      const res = await fetch(`/api/admin/crm/client-services/${s.id}/cost-suggestion`, { credentials: "include" });
                                      if (!res.ok) return;
                                      const data = await res.json();
                                      const input = document.getElementById(`cost-input-${s.id}`) as HTMLInputElement;
                                      if (input && data.totalEstimateCents > 0) {
                                        input.value = (data.totalEstimateCents / 100).toFixed(0);
                                        toast({
                                          title: `Suggested: $${(data.totalEstimateCents / 100).toFixed(2)}/mo`,
                                          description: data.costs.map((c: any) => `${c.label}: $${(c.estimate_cents / 100).toFixed(2)}`).join(" · "),
                                        });
                                      } else {
                                        toast({ title: "No usage data yet", description: "Cost estimate will be available after the first billing period." });
                                      }
                                    } catch { toast({ title: "Could not estimate cost" }); }
                                  }}
                                >
                                  Suggest
                                </button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {s.price_cents && s.price_cents > 0 ? (
                              <span className={`font-medium ${((s.price_cents - (s.cost_cents ?? 0)) / s.price_cents * 100) >= 50 ? "text-emerald-600" : ((s.price_cents - (s.cost_cents ?? 0)) / s.price_cents * 100) >= 20 ? "text-amber-600" : "text-red-600"}`}>
                                {Math.round(((s.price_cents - (s.cost_cents ?? 0)) / s.price_cents) * 100)}%
                              </span>
                            ) : <span className="text-gray-400">—</span>}
                          </TableCell>
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

            {/* QuoteQuick Calculator Section */}
            {qqData && qqData.calculators && qqData.calculators.length > 0 && (
              <Card className="mt-4">
                <div className="p-4 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-indigo-500" />
                      <h3 className="text-sm font-semibold text-gray-900">QuoteQuick Calculators</h3>
                    </div>
                    {qqData.profitability && (
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-gray-500">Rev: <span className="font-semibold text-gray-900">${(qqData.profitability.total_revenue_cents / 100).toFixed(0)}/mo</span></span>
                        <span className="text-gray-500">Cost: <span className="font-semibold text-gray-900">${(qqData.profitability.total_cost_cents / 100).toFixed(0)}/mo</span></span>
                        <span className="text-gray-500">Profit: <span className="font-semibold text-emerald-700">${(qqData.profitability.profit_cents / 100).toFixed(0)}/mo</span></span>
                        <span className="text-gray-400">{qqData.profitability.margin_pct}% margin</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-gray-50">
                  {qqData.calculators.map((calc) => (
                    <div key={calc.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900">{calc.business_name}</p>
                          <div className="flex items-center flex-wrap gap-2 mt-1">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              calc.status === "live" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
                            }`}>
                              {calc.status === "live" ? "Live" : "Draft"}
                            </span>
                            <span className="text-[11px] text-gray-400 capitalize">{calc.trade_type}</span>
                            <span className="text-[11px] text-gray-400 capitalize">{calc.plan_tier} plan</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
                          <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{calc.total_views}</span>
                          <span className="flex items-center gap-1"><UserPlus className="w-3 h-3" />{calc.total_leads}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-2.5">
                        <a href={calc.calculator_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors">
                          <Globe className="w-3 h-3" /> View Live
                        </a>
                        <a href={calc.edit_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-[#2D6A4F] hover:underline">
                          <Pencil className="w-3 h-3" /> Edit
                        </a>
                        <button
                          onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${calc.calculator_url}`); }}
                          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                          <Copy className="w-3 h-3" /> Copy Link
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* TradeLine panels for any TradeLine services */}
            {services?.filter(s => s.service_id.startsWith("tradeline")).map(s => (
              <TradeLineAdminPanel key={`tl-${s.id}`} clientServiceId={s.id} serviceName={s.service_name || s.service_id} />
            ))}

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

          {/* ─── RankFlow Tab ─── */}
          <TabsContent value="rankflow" className="mt-4">
            <RankFlowTab clientId={clientId!} />
          </TabsContent>

          {/* ─── MapGuard Tab ─── */}
          <TabsContent value="mapguard" className="mt-4">
            <MapguardOpsTab clientId={clientId} />
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

          {/* ─── Reputation Tab ─── */}
          <TabsContent value="reputation" className="mt-4">
            <ReputationOpsPanel clientId={client.id} />
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

          {/* ─── SocialSync Tab ─── */}
          <TabsContent value="socialsync" className="mt-4">
            <SocialSyncTab clientId={clientId} />
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

/* ─── Reputation Ops Panel (inline component) ─── */

function ReputationOpsPanel({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/admin/crm/clients", clientId, "reputation-ops"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/crm/clients/${clientId}/reputation-ops`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const disconnectGoogleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/crm/clients/${clientId}/google-disconnect`);
      return res.json();
    },
    onSuccess: () => { refetch(); toast({ title: "Google disconnected" }); },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/crm/monitored-reviews/sync", { client_id: clientId });
      return res.json();
    },
    onSuccess: () => { toast({ title: "Review sync triggered" }); setTimeout(() => refetch(), 5000); },
  });

  const toggleSettingMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/admin/crm/clients/${clientId}/reputation-config`, updates);
      return res.json();
    },
    onSuccess: () => { refetch(); toast({ title: "Setting updated" }); },
  });

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  }

  if (isLoading) {
    return <div className="flex justify-center py-8"><Skeleton className="h-40 w-full" /></div>;
  }

  if (!data?.hasService) {
    return (
      <Card className="p-6 text-center text-gray-500 text-sm">
        <ShieldCheck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        No ReputationShield service active for this client.
      </Card>
    );
  }

  const t = data.tasks;
  const s = data.stats;
  const origin = window.location.origin;

  function taskStatus(done: boolean, blocked?: boolean, optional?: boolean): OpsStatus {
    if (done) return "done";
    if (blocked) return "blocked";
    if (optional) return "optional";
    return "not_started";
  }

  const setupTasks = [
    { done: t.googlePlaceId.done },
    { done: t.facebookPageUrl.done },
    { done: t.googleConnected.done },
    { done: t.widgetEnabled.done },
  ];
  const setupDone = setupTasks.filter((x) => x.done).length;

  const opsTasks = [
    { done: t.remindersEnabled.done },
    { done: t.reportsEnabled.done },
    { done: t.lowRatingAlerts.done },
    { done: t.aiDraftsAvailable.done },
  ];
  const opsDone = opsTasks.filter((x) => x.done).length;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs bg-[#F0F7F4] text-[#2D6A4F]">
            {data.tier ? data.tier.charAt(0).toUpperCase() + data.tier.slice(1) : "—"} Plan
          </Badge>
          <Badge variant="secondary" className={`text-xs ${data.serviceStatus === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {data.serviceStatus}
          </Badge>
          {s.lowRatingNoResponse > 0 && (
            <Badge variant="secondary" className="text-xs bg-red-50 text-red-700">
              {s.lowRatingNoResponse} low-rating review{s.lowRatingNoResponse !== 1 ? "s" : ""} need response
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => navigate("/admin/crm/reviews")}
        >
          <StarIcon className="w-3 h-3 mr-1" /> Open Reviews
        </Button>
      </div>

      {/* Setup & Connection */}
      <ServiceOpsSection title="Setup & Connection" subtitle="Required for full service delivery" completedCount={setupDone} totalCount={setupTasks.length}>
        <ServiceOpsCard
          title="Google Business Profile"
          status={taskStatus(t.googlePlaceId.done)}
          description={t.googlePlaceId.done ? `Google Place ID configured (${t.googlePlaceId.value})` : "Required for review monitoring and response posting. Find it in Google Maps → Share → Place ID."}
          nextStep={!t.googlePlaceId.done ? "Add the client's Google Place ID in their profile settings." : undefined}
        >
          {t.googlePlaceId.done && (
            <button onClick={() => copyToClipboard(t.googlePlaceId.value, "Place ID")} className="text-[11px] text-blue-600 hover:underline mt-1">
              Copy Place ID
            </button>
          )}
        </ServiceOpsCard>

        <ServiceOpsCard
          title="Facebook Page URL"
          status={taskStatus(t.facebookPageUrl.done, false, true)}
          description={t.facebookPageUrl.done ? t.facebookPageUrl.value : "Optional. Enables Facebook review monitoring and routing."}
          nextStep={!t.facebookPageUrl.done ? "Ask the client for their Facebook business page URL." : undefined}
          waitingOn={!t.facebookPageUrl.done ? "client" : null}
        />

        <ServiceOpsCard
          title="Google Account Connected"
          status={taskStatus(t.googleConnected.done, false, !t.googleConnected.oauthConfigured)}
          description={t.googleConnected.done ? "Connected — can post responses directly to Google." : t.googleConnected.oauthConfigured ? "Not connected yet." : "Google OAuth not configured on this server."}
          nextStep={!t.googleConnected.done && t.googleConnected.oauthConfigured ? "Initiate the Google connection flow below." : undefined}
        >
          {t.googleConnected.oauthConfigured && (
            <div className="flex gap-2 mt-2">
              {!t.googleConnected.done ? (
                <button
                  onClick={async () => {
                    const res = await fetch(`/api/admin/crm/google/connect?clientId=${clientId}`, { credentials: "include" });
                    const data = await res.json();
                    if (data.authUrl) {
                      copyToClipboard(data.authUrl, "Google connection link");
                    }
                  }}
                  className="text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-md transition-colors"
                >
                  Copy Connection Link
                </button>
              ) : (
                <button
                  onClick={() => { if (confirm("Disconnect Google for this client?")) disconnectGoogleMutation.mutate(); }}
                  className="text-[11px] text-red-600 hover:underline"
                >
                  Disconnect
                </button>
              )}
            </div>
          )}
        </ServiceOpsCard>

        <ServiceOpsCard
          title="Review Widget"
          status={taskStatus(t.widgetEnabled.done)}
          description={t.widgetEnabled.done ? `Enabled (${t.widgetEnabled.type || "badge"} type)` : "Shows reviews on the client's website."}
          nextStep={!t.widgetEnabled.done ? "Enable the widget and install embed code on the client's site." : undefined}
          waitingOn={t.widgetEnabled.done ? null : "internal"}
        >
          {t.widgetToken.done && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => copyToClipboard(`<script src="${origin}/widget/embed.js" data-wft-widget="${t.widgetEnabled.type || "carousel"}" data-wft-token="${t.widgetToken.value}"></script>`, "Widget embed code")}
                className="text-[11px] font-medium text-white bg-[#2D6A4F] hover:bg-[#1B4332] px-2.5 py-1 rounded-md transition-colors"
              >
                Copy Embed Code
              </button>
              <HelpCue text="A unique ID that identifies this client's widget. Included in the embed code automatically.">
                <button
                  onClick={() => copyToClipboard(t.widgetToken.value, "Widget token")}
                  className="text-[11px] text-blue-600 hover:underline"
                >
                  Copy Token
                </button>
              </HelpCue>
            </div>
          )}
        </ServiceOpsCard>
      </ServiceOpsSection>

      {/* Active Features */}
      <ServiceOpsSection title="Active Features" subtitle="Automated service components" completedCount={opsDone} totalCount={opsTasks.length}>
        <ServiceOpsCard
          title="Follow-up Reminders"
          status={taskStatus(t.remindersEnabled.done)}
          description="Automatic follow-ups when customers don't respond to review requests."
          action={!t.remindersEnabled.done ? { label: "Enable", onClick: () => toggleSettingMutation.mutate({ reminders_enabled: true }) } : undefined}
        />
        <ServiceOpsCard
          title="Monthly Reports"
          status={taskStatus(t.reportsEnabled.done)}
          description="Periodic email showing review growth and reputation metrics."
          action={!t.reportsEnabled.done ? { label: "Enable", onClick: () => toggleSettingMutation.mutate({ report_enabled: true }) } : undefined}
        />
        <ServiceOpsCard
          title="Low-Rating Alerts"
          status={taskStatus(t.lowRatingAlerts.done)}
          description="Instant email alert when a 1-2 star review is detected."
          action={!t.lowRatingAlerts.done ? { label: "Enable", onClick: () => toggleSettingMutation.mutate({ low_rating_alerts: true }) } : undefined}
        />
        <ServiceOpsCard
          title="AI Response Drafts"
          status={taskStatus(t.aiDraftsAvailable.done)}
          description={t.aiDraftsAvailable.done ? "Available — AI can draft responses for this client's reviews." : "Requires Pro plan or higher."}
        />
        <ServiceOpsCard
          title="Channel Preference"
          status="done"
          description={`Requests sent via: ${t.channelPreference.value}. Auto = SMS first (higher conversion), email fallback.`}
        />
      </ServiceOpsSection>

      {/* Operational Health */}
      <ServiceOpsSection title="Operational Health">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button onClick={() => navigate("/admin/crm/reviews")} className="text-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
            <div className="text-lg font-semibold text-gray-900">{s.totalReviews}</div>
            <div className="text-[11px] text-gray-500">Reviews Tracked</div>
          </button>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-lg font-semibold text-gray-900">{s.totalRequests}</div>
            <div className="text-[11px] text-gray-500">Requests Sent</div>
          </div>
          <button
            onClick={s.lowRatingNoResponse > 0 ? () => navigate("/admin/crm/reviews") : undefined}
            className={`text-center p-3 rounded-lg transition-colors ${s.lowRatingNoResponse > 0 ? "bg-red-50 hover:bg-red-100 cursor-pointer" : "bg-gray-50"}`}
          >
            <div className={`text-lg font-semibold ${s.lowRatingNoResponse > 0 ? "text-red-700" : "text-gray-900"}`}>{s.lowRatingNoResponse}</div>
            <div className="text-[11px] text-gray-500">Low-Rating Unresponded</div>
          </button>
          <div className={`text-center p-3 rounded-lg ${s.missingGoogleName > 0 ? "bg-amber-50" : "bg-gray-50"}`}>
            <div className="text-lg font-semibold text-gray-900">{s.missingGoogleName}</div>
            <HelpCue text="Reviews without a Google API identifier cannot be posted to. Trigger a re-sync to attempt recovery.">
              <span className="text-[11px] text-gray-500">Missing Post ID</span>
            </HelpCue>
            {s.missingGoogleName > 0 && (
              <button
                onClick={() => syncMutation.mutate()}
                className="text-[10px] text-blue-600 hover:underline mt-1 block mx-auto"
              >
                Re-sync now
              </button>
            )}
          </div>
        </div>
      </ServiceOpsSection>
    </div>
  );
}

/* ─── TradeLine Admin Panel ─── */

interface TLAdminData {
  config: Record<string, any> | null;
  usage: {
    voice_minutes_used: number;
    calls_count: number;
    sms_count: number;
    included_minutes: number;
    overage_minutes: number;
  } | null;
  recentCalls: {
    id: number;
    direction: string;
    caller_number: string | null;
    duration_seconds: number;
    outcome: string;
    summary: string | null;
    ended_at: string | null;
    created_at: string | null;
  }[];
  profitability?: {
    revenue: number;
    voiceCost: number;
    smsCost: number;
    aiCost: number;
    totalCost: number;
    profit: number;
    margin: number;
  } | null;
  // Orchestration convenience fields
  setupStage?: string;
  assistantStatus?: string;
  assistantError?: string | null;
  assistantBuiltAt?: string | null;
}

function TLCallIcon({ outcome }: { outcome: string }) {
  switch (outcome) {
    case "answered": return <PhoneIncoming className="w-3.5 h-3.5 text-emerald-500" />;
    case "missed": return <PhoneMissed className="w-3.5 h-3.5 text-red-500" />;
    case "failed": return <PhoneOff className="w-3.5 h-3.5 text-gray-400" />;
    default: return <PhoneCall className="w-3.5 h-3.5 text-gray-400" />;
  }
}

/* ─── Rebuild Assistant Button ─── */
function RebuildAssistantButton({ clientServiceId, queryKey }: { clientServiceId: number; queryKey: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const rebuild = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/crm/tradeline/${clientServiceId}/build-assistant`, {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Rebuild failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast({
        title: data.skipped ? "Skipped" : "Assistant rebuilt",
        description: data.skipped ? data.skipReason : `Template: ${data.templateId}`,
      });
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast({ title: "Rebuild failed", description: err.message });
    },
  });

  return (
    <button
      onClick={() => rebuild.mutate()}
      disabled={rebuild.isPending}
      className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-white bg-[#2D6A4F] rounded-md hover:bg-[#1B4332] disabled:opacity-60 transition-colors"
    >
      {rebuild.isPending ? (
        <><Loader2 className="w-3 h-3 animate-spin" /> Rebuilding...</>
      ) : (
        <><RefreshCw className="w-3 h-3" /> Rebuild Assistant</>
      )}
    </button>
  );
}

function TradeLineAdminPanel({ clientServiceId, serviceName }: { clientServiceId: number; serviceName: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<TLAdminData>({
    queryKey: [`/api/admin/crm/tradeline/${clientServiceId}`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/crm/tradeline/${clientServiceId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load TradeLine data");
      return res.json();
    },
    enabled: open,
  });

  // Config editing state
  const [editingConfig, setEditingConfig] = useState(false);
  const [configDraft, setConfigDraft] = useState<Record<string, any>>({});

  function startEditing() {
    if (!data?.config) return;
    setConfigDraft({
      variant: data.config.variant,
      channels: { ...data.config.channels },
      phoneRouting: { ...data.config.phoneRouting },
      website: { ...data.config.website },
      voice: { ...(data.config as any).voice },
      personality: { ...(data.config as any).personality },
      widgetStyle: { ...(data.config as any).widgetStyle },
    });
    setEditingConfig(true);
  }

  const saveConfig = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/crm/tradeline/${clientServiceId}/config`, configDraft);
      return res.json();
    },
    onSuccess: () => {
      setEditingConfig(false);
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/tradeline/${clientServiceId}`] });
      toast({ title: "Config saved", description: "TradeLine configuration updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save config" });
    },
  });

  const cfg = data?.config;

  return (
    <Card className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full p-4 text-left min-h-[44px]"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <PhoneCall className="w-4 h-4 text-teal-600" />
          {serviceName} — TradeLine Config
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          )}

          {cfg && !editingConfig && (
            <>
              {/* Mode + variant */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Mode</p>
                  <ModeToggle
                    currentMode={cfg.currentMode}
                    clientServiceId={clientServiceId}
                    apiBase="/api/admin/crm/tradeline"
                    onModeChanged={() => {
                      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/tradeline/${clientServiceId}`] });
                    }}
                  />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-1">
                    Variant
                    <Tooltip><TooltipTrigger asChild><HelpCircle className="w-3 h-3 text-gray-300 cursor-help" /></TooltipTrigger><TooltipContent className="max-w-[200px] text-xs">Call Backup = voice only. Chat = website widget only. Complete = voice + chat + hosted page.</TooltipContent></Tooltip>
                  </p>
                  <p className="text-sm text-gray-900 capitalize">{(cfg.variant || "").replace(/_/g, " ")}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Channels</p>
                  <div className="flex flex-wrap gap-1">
                    {cfg.channels?.voice && <Badge variant="outline" className="text-[10px]">Voice</Badge>}
                    {cfg.channels?.websiteChat && <Badge variant="outline" className="text-[10px]">Chat</Badge>}
                    {cfg.channels?.websiteVoice && <Badge variant="outline" className="text-[10px]">Web Voice</Badge>}
                    {cfg.channels?.sms && <Badge variant="outline" className="text-[10px]">SMS</Badge>}
                    {cfg.channels?.hostedFallback && <Badge variant="outline" className="text-[10px]">Hosted</Badge>}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Phone Routing</p>
                  <p className="text-sm text-gray-900 capitalize">{(cfg.phoneRouting?.forwardingMode || "").replace(/_/g, " ")}</p>
                  {cfg.phoneRouting?.primaryBusinessNumber && (
                    <p className="text-xs text-gray-500">{cfg.phoneRouting.primaryBusinessNumber}</p>
                  )}
                </div>
              </div>

              {/* Website embed */}
              {cfg.website?.embedMode !== "none" && (
                <div className="text-sm">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Website</p>
                  <span className="capitalize">{cfg.website.embedMode?.replace(/_/g, " ")}</span>
                  {cfg.website.hostedUrl && (
                    <span className="text-xs text-gray-500 ml-2">{cfg.website.hostedUrl}</span>
                  )}
                </div>
              )}

              {/* Voice & Personality */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Voice</p>
                  <p className="text-sm text-gray-900">{(cfg as any).voice?.label || "Professional Female"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Tone</p>
                  <p className="text-sm text-gray-900 capitalize">{(cfg as any).personality?.tone || "friendly"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Language</p>
                  <p className="text-sm text-gray-900 uppercase">{(cfg as any).personality?.language || "en"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Widget Style</p>
                  <p className="text-sm text-gray-900 capitalize">{(cfg as any).widgetStyle?.preset || "clean"}</p>
                </div>
              </div>

              {/* Setup Stage + Assistant Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Setup Stage</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                    (data.setupStage || cfg.setupStage) === "live" ? "bg-emerald-50 text-emerald-700"
                    : (data.setupStage || cfg.setupStage) === "ready_for_testing" ? "bg-amber-50 text-amber-700"
                    : "bg-gray-100 text-gray-600"
                  }`}>
                    {(data.setupStage || cfg.setupStage || "not_started").replace(/_/g, " ")}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Assistant</p>
                  {(data.assistantStatus || cfg.assistant?.status) === "built" ? (
                    <div>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="w-3 h-3" /> Built
                      </span>
                      {(cfg.assistant?.templateId) && (
                        <p className="text-xs text-gray-500 mt-0.5 capitalize flex items-center gap-1">
                          Template: {cfg.assistant.templateId}
                          <Tooltip><TooltipTrigger asChild><HelpCircle className="w-3 h-3 text-gray-300 cursor-help" /></TooltipTrigger><TooltipContent className="max-w-[220px] text-xs">Trade-specific prompt template used to generate the AI assistant. Selected automatically based on the client's trade type.</TooltipContent></Tooltip>
                        </p>
                      )}
                      {data.assistantBuiltAt && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {new Date(data.assistantBuiltAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                    </div>
                  ) : (data.assistantStatus || cfg.assistant?.status) === "failed" ? (
                    <div>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                        <AlertCircle className="w-3 h-3" /> Build failed
                      </span>
                      {data.assistantError && (
                        <p className="text-[10px] text-red-500 mt-0.5 truncate max-w-[200px]" title={data.assistantError}>
                          {data.assistantError}
                        </p>
                      )}
                      <RebuildAssistantButton clientServiceId={clientServiceId} queryKey={`/api/admin/crm/tradeline/${clientServiceId}`} />
                    </div>
                  ) : (data.assistantStatus || cfg.assistant?.status) === "building" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">
                      <Loader2 className="w-3 h-3 animate-spin" /> Building...
                    </span>
                  ) : (
                    <div>
                      <span className="text-xs text-gray-500">Not built</span>
                      <RebuildAssistantButton clientServiceId={clientServiceId} queryKey={`/api/admin/crm/tradeline/${clientServiceId}`} />
                    </div>
                  )}
                </div>
              </div>

              {/* Usage */}
              {data.usage && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">Current Period Usage</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">Calls</p>
                      <p className="text-lg font-semibold">{data.usage.calls_count}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">Voice Min</p>
                      <p className="text-lg font-semibold">
                        {data.usage.voice_minutes_used}
                        <span className="text-xs font-normal text-gray-400">/{data.usage.included_minutes}</span>
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">SMS</p>
                      <p className="text-lg font-semibold">{data.usage.sms_count}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500 flex items-center gap-1">Overage <Tooltip><TooltipTrigger asChild><HelpCircle className="w-3 h-3 text-gray-300 cursor-help" /></TooltipTrigger><TooltipContent className="max-w-[180px] text-xs">Voice minutes over the included amount. Billed at the overage rate.</TooltipContent></Tooltip></p>
                      <p className={`text-lg font-semibold ${data.usage.overage_minutes > 0 ? "text-amber-600" : ""}`}>
                        {data.usage.overage_minutes}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Profitability */}
              {data.profitability && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5">Profitability</p>
                  <div className="border border-gray-100 rounded-lg p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Revenue</span>
                      <span className="font-semibold">${(data.profitability.revenue / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>Voice / SMS / AI</span>
                      <span>-${(data.profitability.voiceCost / 100).toFixed(2)} / -${(data.profitability.smsCost / 100).toFixed(2)} / -${(data.profitability.aiCost / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs border-t border-gray-100 pt-1">
                      <span className="text-gray-500">Total Cost</span>
                      <span className="font-medium text-gray-700">-${(data.profitability.totalCost / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm border-t border-gray-200 pt-1.5">
                      <span className="font-semibold text-gray-900">Profit</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">${(data.profitability.profit / 100).toFixed(2)}</span>
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                          data.profitability.margin > 60 ? "bg-emerald-50 text-emerald-700" :
                          data.profitability.margin >= 30 ? "bg-amber-50 text-amber-700" :
                          "bg-red-50 text-red-700"
                        }`}>
                          {data.profitability.margin}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent calls */}
              {data.recentCalls.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">Recent Calls</p>
                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[10px] text-gray-400 border-b border-gray-100">
                          <th className="px-3 py-2 font-medium w-6"></th>
                          <th className="px-3 py-2 font-medium">Caller</th>
                          <th className="px-3 py-2 font-medium">Outcome</th>
                          <th className="px-3 py-2 font-medium">Duration</th>
                          <th className="px-3 py-2 font-medium">Time</th>
                          <th className="px-3 py-2 font-medium">Summary</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {data.recentCalls.map((c) => (
                          <tr key={c.id}>
                            <td className="px-3 py-2"><TLCallIcon outcome={c.outcome} /></td>
                            <td className="px-3 py-2 text-gray-700">{c.caller_number || "-"}</td>
                            <td className="px-3 py-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${
                                c.outcome === "answered" ? "bg-emerald-50 text-emerald-700"
                                : c.outcome === "missed" ? "bg-red-50 text-red-700"
                                : "bg-gray-100 text-gray-600"
                              }`}>{c.outcome}</span>
                            </td>
                            <td className="px-3 py-2 text-gray-500">
                              {c.duration_seconds > 0
                                ? `${Math.floor(c.duration_seconds / 60)}:${String(c.duration_seconds % 60).padStart(2, "0")}`
                                : "-"}
                            </td>
                            <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{c.ended_at ? fmtDate(c.ended_at) : "-"}</td>
                            <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate">{c.summary || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="pt-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={startEditing}>
                  <Pencil className="w-3 h-3 mr-1" /> Edit Config
                </Button>
              </div>
            </>
          )}

          {/* Editing mode */}
          {cfg && editingConfig && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Variant</label>
                  <Select value={configDraft.variant} onValueChange={(v) => setConfigDraft({ ...configDraft, variant: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call_backup" className="text-xs">Call Backup</SelectItem>
                      <SelectItem value="chat" className="text-xs">Chat</SelectItem>
                      <SelectItem value="complete" className="text-xs">Complete</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Phone Routing</label>
                  <Select
                    value={configDraft.phoneRouting?.forwardingMode || "no_answer"}
                    onValueChange={(v) => setConfigDraft({ ...configDraft, phoneRouting: { ...configDraft.phoneRouting, forwardingMode: v } })}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no_answer" className="text-xs">No Answer</SelectItem>
                      <SelectItem value="immediate" className="text-xs">Immediate</SelectItem>
                      <SelectItem value="after_hours_only" className="text-xs">After Hours Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600">Primary Business Number</label>
                <Input
                  value={configDraft.phoneRouting?.primaryBusinessNumber || ""}
                  onChange={(e) => setConfigDraft({ ...configDraft, phoneRouting: { ...configDraft.phoneRouting, primaryBusinessNumber: e.target.value } })}
                  placeholder="+1234567890"
                  className="h-8 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Channels</label>
                <div className="flex flex-wrap gap-3">
                  {(["voice", "websiteChat", "websiteVoice", "sms", "hostedFallback"] as const).map((ch) => (
                    <label key={ch} className="flex items-center gap-1.5 text-xs text-gray-700">
                      <Switch
                        checked={configDraft.channels?.[ch] ?? false}
                        onCheckedChange={(v) => setConfigDraft({
                          ...configDraft,
                          channels: { ...configDraft.channels, [ch]: v },
                        })}
                      />
                      <span className="capitalize">{ch.replace(/([A-Z])/g, " $1").trim()}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Website Embed Mode</label>
                  <Select
                    value={configDraft.website?.embedMode || "none"}
                    onValueChange={(v) => setConfigDraft({ ...configDraft, website: { ...configDraft.website, embedMode: v } })}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">None</SelectItem>
                      <SelectItem value="direct_embed" className="text-xs">Direct Embed</SelectItem>
                      <SelectItem value="hosted_fallback" className="text-xs">Hosted Fallback</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Hosted URL</label>
                  <Input
                    value={configDraft.website?.hostedUrl || ""}
                    onChange={(e) => setConfigDraft({ ...configDraft, website: { ...configDraft.website, hostedUrl: e.target.value } })}
                    placeholder="https://..."
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Voice & Personality */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Voice Preset</label>
                  <Select
                    value={configDraft.voice?.presetId || "professional-female"}
                    onValueChange={(v) => {
                      const labels: Record<string, string> = { "professional-female": "Professional Female", "professional-male": "Professional Male", "friendly-female": "Friendly Female", "friendly-male": "Friendly Male" };
                      setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, presetId: v, label: labels[v] || v } });
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional-female" className="text-xs">Professional Female</SelectItem>
                      <SelectItem value="professional-male" className="text-xs">Professional Male</SelectItem>
                      <SelectItem value="friendly-female" className="text-xs">Friendly Female</SelectItem>
                      <SelectItem value="friendly-male" className="text-xs">Friendly Male</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Tone</label>
                  <Select
                    value={configDraft.personality?.tone || "friendly"}
                    onValueChange={(v) => setConfigDraft({ ...configDraft, personality: { ...configDraft.personality, tone: v } })}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="friendly" className="text-xs">Friendly</SelectItem>
                      <SelectItem value="professional" className="text-xs">Professional</SelectItem>
                      <SelectItem value="direct" className="text-xs">Direct</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Language</label>
                  <Select
                    value={configDraft.personality?.language || "en"}
                    onValueChange={(v) => setConfigDraft({ ...configDraft, personality: { ...configDraft.personality, language: v } })}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en" className="text-xs">English</SelectItem>
                      <SelectItem value="es" className="text-xs">Spanish</SelectItem>
                      <SelectItem value="fr" className="text-xs">French</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Humor</label>
                  <Select
                    value={configDraft.personality?.humor || "off"}
                    onValueChange={(v) => setConfigDraft({ ...configDraft, personality: { ...configDraft.personality, humor: v } })}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off" className="text-xs">Off</SelectItem>
                      <SelectItem value="light" className="text-xs">Light</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Widget Style</label>
                  <Select
                    value={configDraft.widgetStyle?.preset || "clean"}
                    onValueChange={(v) => setConfigDraft({ ...configDraft, widgetStyle: { ...configDraft.widgetStyle, preset: v } })}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="clean" className="text-xs">Clean</SelectItem>
                      <SelectItem value="bold" className="text-xs">Bold</SelectItem>
                      <SelectItem value="minimal" className="text-xs">Minimal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  className="h-7 text-xs bg-[#2D6A4F] hover:bg-[#1B4332]"
                  onClick={() => saveConfig.mutate()}
                  disabled={saveConfig.isPending}
                >
                  <Save className="w-3 h-3 mr-1" />
                  {saveConfig.isPending ? "Saving..." : "Save"}
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingConfig(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
