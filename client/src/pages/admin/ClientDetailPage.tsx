import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
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
  ArrowLeft, Mail, Phone, Globe, MapPin, Plus, ChevronDown, ChevronUp,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

/* ─── Types ─── */
interface Client {
  id: number;
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

interface FulfillmentTaskRow {
  id: number;
  title: string;
  status: string;
  priority: string;
  supplier_id: number | null;
  cost_cents: number | null;
  due_at: string | null;
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

  // Queries
  const { data: client, isLoading } = useQuery<Client>({
    queryKey: [`/api/admin/crm/clients/${clientId}`],
    enabled: !!clientId,
  });

  const { data: services } = useQuery<ClientServiceRow[]>({
    queryKey: [`/api/admin/crm/clients/${clientId}/services`],
    enabled: !!clientId,
  });

  const { data: fulfillment } = useQuery<FulfillmentTaskRow[]>({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/clients"] });
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
      const catalogItem = catalog?.find((s) => s.id === newServiceId);
      const res = await apiRequest("POST", `/api/admin/crm/clients/${clientId}/services`, {
        service_id: newServiceId,
        price_cents: catalogItem?.default_price ?? 0,
        billing_period: catalogItem?.billing_period ?? "monthly",
        status: "pending",
      });
      return res.json();
    },
    onSuccess: () => {
      setShowAddService(false);
      setNewServiceId("");
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/clients/${clientId}/services`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/overview"] });
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
    <AdminLayout>
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
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-gray-900">{client.business_name}</h2>
                <StatusBadge status={client.status} />
              </div>
              <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
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
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
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
                      <TableHead>Cost</TableHead>
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
                          <TableCell className="text-sm">{fmt(s.cost_cents)}{s.billing_period === "monthly" ? "/mo" : ""}</TableCell>
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
                    <div key={s.id} className="flex items-center justify-between p-4 gap-3">
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
                  ))
                )}
              </div>
            </Card>
          </TabsContent>

          {/* ─── Tasks Tab (Fulfillment + Onboarding) ─── */}
          <TabsContent value="tasks" className="mt-4">
            <Card>
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Tasks ({fulfillment?.length ?? 0})</h3>
              </div>

              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fulfillment?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6 text-gray-500 text-sm">No tasks yet.</TableCell>
                      </TableRow>
                    ) : (
                      fulfillment?.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium text-sm">{t.title}</TableCell>
                          <TableCell><StatusBadge status={t.status} /></TableCell>
                          <TableCell><StatusBadge status={t.priority} /></TableCell>
                          <TableCell className="text-sm">{fmt(t.cost_cents)}</TableCell>
                          <TableCell className="text-sm">{fmtDate(t.due_at)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden divide-y divide-gray-100">
                {fulfillment?.length === 0 ? (
                  <p className="text-center py-6 text-gray-500 text-sm">No tasks yet.</p>
                ) : (
                  fulfillment?.map((t) => (
                    <div key={t.id} className="p-4">
                      <p className="text-sm font-medium text-gray-900">{t.title}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <StatusBadge status={t.status} />
                        <StatusBadge status={t.priority} />
                        {t.due_at && <span className="text-xs text-gray-500">Due {fmtDate(t.due_at)}</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
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
                          <TableCell><StatusBadge status={p.status} /></TableCell>
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
                    <div key={p.id} className="flex items-center justify-between p-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900 capitalize">{p.type} &middot; {fmt(p.amount_cents)}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{p.description || fmtDate(p.paid_at || p.created_at)}</p>
                      </div>
                      <StatusBadge status={p.status} />
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
      </div>
    </AdminLayout>
  );
}
