import { Link, useLocation, useRoute } from "wouter";
import {
  LayoutDashboard,
  Users,
  Inbox,
  CreditCard,
  Factory,
  ChevronLeft,
  Menu,
  BrainCircuit,
  Plus,
  UserPlus,
  ClipboardPlus,
  DollarSign,
  Sparkles,
  Wrench,
  TrendingUp,
  Share2,
  Target,
  User,
  Settings,
  KeyRound,
  LogOut,
  ExternalLink,
  Megaphone,
  LifeBuoy,
  Star,
  Shield,
  ChevronDown,
} from "lucide-react";
import AdminCopilot, { type AdminPageContext } from "./AdminCopilot";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/* ─── Core nav — always visible ─── */
const CORE_ITEMS = [
  { label: "Overview", href: "/admin/crm", icon: LayoutDashboard },
  { label: "Clients", href: "/admin/crm/clients", icon: Users },
  { label: "Inbox", href: "/admin/crm/inbox", icon: Inbox },
  { label: "Support", href: "/admin/crm/support", icon: LifeBuoy, countKey: "support" as const },
];

/* ─── Collapsible groups ─── */
const PRODUCTS_ITEMS = [
  { label: "Services", href: "/admin/crm/services", icon: Wrench },
  { label: "MapGuard", href: "/admin/crm/mapguard", icon: Shield },
  { label: "RankFlow", href: "/admin/crm/rankflow", icon: TrendingUp },
  { label: "Reviews", href: "/admin/crm/reviews", icon: Star },
  { label: "SocialSync", href: "/admin/crm/socialsync", icon: Share2 },
];

const FINANCE_ITEMS = [
  { label: "Billing", href: "/admin/crm/billing", icon: CreditCard },
  { label: "Suppliers", href: "/admin/crm/suppliers", icon: Factory },
  { label: "Sales", href: "/admin/crm/sales", icon: Target },
];

const OUTBOUND_ITEMS = [
  { label: "Prospects", href: "/admin/outbound/prospects", icon: Users },
  { label: "Campaigns", href: "/admin/outbound/campaigns", icon: Megaphone },
  { label: "Pipeline", href: "/admin/outbound/pipeline", icon: CreditCard },
];

const SECONDARY_ITEMS = [
  { label: "AI Dashboard", href: "/admin/ai", icon: BrainCircuit },
  { label: "Client Portal", href: "/portal", icon: ExternalLink },
];

/* Unified list for page title detection and other lookups */
const NAV_ITEMS = [...CORE_ITEMS, ...PRODUCTS_ITEMS, ...FINANCE_ITEMS];

function isActive(location: string, href: string): boolean {
  if (href === "/admin/crm") return location === "/admin/crm";
  return location.startsWith(href);
}

/* ─── Collapsible nav group ─── */
function NavGroup({
  label,
  items,
  location,
  supportUnresolved,
  onNavigate,
  defaultOpen,
}: {
  label: string;
  items: typeof CORE_ITEMS;
  location: string;
  supportUnresolved?: number;
  onNavigate: () => void;
  defaultOpen: boolean;
}) {
  const hasActiveChild = items.some((item) => isActive(location, item.href));
  const [open, setOpen] = useState(defaultOpen || hasActiveChild);

  // Auto-open when navigating into the group
  useEffect(() => {
    if (hasActiveChild && !open) setOpen(true);
  }, [hasActiveChild]);

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-1.5 mb-0.5 group"
      >
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400 group-hover:text-gray-500 transition-colors">
          {label}
        </span>
        <ChevronDown className={cn("w-3 h-3 text-gray-300 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-0.5">
          {items.map((item) => {
            const active = isActive(location, item.href);
            const countKey = (item as any).countKey;
            const badgeCount = countKey === "support" ? (supportUnresolved ?? 0) : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors min-h-[40px]",
                  active
                    ? "bg-[#F0F7F4] text-[#2D6A4F] font-medium"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-[#2D6A4F]" : "text-gray-400")} />
                <span className="flex-1">{item.label}</span>
                {badgeCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-red-500 text-white">
                    {badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Full sidebar nav ─── */
function SidebarNav({
  location,
  supportUnresolved,
  onNavigate,
}: {
  location: string;
  supportUnresolved: number;
  onNavigate: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto py-3 px-2">
      {/* Core — always expanded */}
      <div className="space-y-0.5">
        {CORE_ITEMS.map((item) => {
          const active = isActive(location, item.href);
          const countKey = (item as any).countKey;
          const badgeCount = countKey === "support" ? supportUnresolved : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[44px]",
                active
                  ? "bg-[#F0F7F4] text-[#2D6A4F] font-medium"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-[#2D6A4F]" : "text-gray-400")} />
              <span className="flex-1">{item.label}</span>
              {badgeCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-red-500 text-white">
                  {badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <NavGroup label="Products" items={PRODUCTS_ITEMS} location={location} onNavigate={onNavigate} defaultOpen={true} />
      <NavGroup label="Finance" items={FINANCE_ITEMS} location={location} onNavigate={onNavigate} defaultOpen={true} />
      <NavGroup label="Outbound" items={OUTBOUND_ITEMS} location={location} onNavigate={onNavigate} defaultOpen={false} />

      {/* Other */}
      <div className="mt-4 pt-2 border-t border-gray-100">
        <div className="space-y-0.5">
          {SECONDARY_ITEMS.map((item) => {
            const active = isActive(location, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors min-h-[40px]",
                  active
                    ? "bg-[#F0F7F4] text-[#2D6A4F] font-medium"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                )}
              >
                <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-[#2D6A4F]" : "text-gray-400")} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/* ─── Quick Add Dialogs ─── */

function QuickAddClientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState({ business_name: "", contact_name: "", contact_email: "", contact_phone: "", trade_type: "", status: "lead" });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/admin/crm/clients", data);
      return res.json();
    },
    onSuccess: (data: { id: number; business_name: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/overview"] });
      const name = form.business_name;
      setForm({ business_name: "", contact_name: "", contact_email: "", contact_phone: "", trade_type: "", status: "lead" });
      onClose();
      toast({ title: "Client created", description: name });
      navigate(`/admin/crm/clients/${data.id}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add Client</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Business Name *</label>
            <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Contact Name</label>
              <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Phone</label>
              <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Email</label>
            <Input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Trade</label>
              <Input value={form.trade_type} onChange={(e) => setForm({ ...form, trade_type: e.target.value })} placeholder="e.g. plumber" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate(form)} disabled={!form.business_name || mutation.isPending} className="bg-[#2D6A4F] hover:bg-[#1B4332]">
            {mutation.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickAddTaskDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ client_id: "", client_service_id: "", title: "", priority: "normal", due_at: "", waiting_on: "" });

  const { data: clientList } = useQuery<{ data: { id: number; business_name: string }[]; total: number }>({
    queryKey: ["/api/admin/crm/clients", { limit: 100 }],
    queryFn: async () => {
      const res = await fetch("/api/admin/crm/clients?limit=100", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: open,
  });

  const { data: clientServices } = useQuery<{ id: number; service_name: string | null; service_id: string }[]>({
    queryKey: [`/api/admin/crm/clients/${form.client_id}/services`],
    enabled: !!form.client_id,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const clientId = parseInt(form.client_id);
      // Auto-select first service if only one exists
      const clientServiceId = parseInt(form.client_service_id) || (clientServices?.[0]?.id ?? 0);
      const res = await apiRequest("POST", "/api/admin/crm/fulfillment", {
        client_id: clientId,
        client_service_id: clientServiceId,
        title: form.title,
        priority: form.priority,
        status: "not_started",
        waiting_on: form.waiting_on && form.waiting_on !== "none" ? form.waiting_on : null,
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/fulfillment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/overview"] });
      const title = form.title;
      setForm({ client_id: "", client_service_id: "", title: "", priority: "normal", due_at: "", waiting_on: "" });
      onClose();
      toast({ title: "Task created", description: title });
    },
  });

  // Only show service selector when client has 2+ services
  const showServiceSelect = clientServices && clientServices.length > 1;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Client *</label>
            <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v, client_service_id: "" })}>
              <SelectTrigger><SelectValue placeholder="Select client..." /></SelectTrigger>
              <SelectContent>
                {clientList?.data.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.business_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {showServiceSelect && (
            <div>
              <label className="text-xs font-medium text-gray-600">Service</label>
              <Select value={form.client_service_id} onValueChange={(v) => setForm({ ...form, client_service_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select service..." /></SelectTrigger>
                <SelectContent>
                  {clientServices.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.service_name || s.service_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600">Task Title *</label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Set up Google Business Profile" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Priority</label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Due Date</label>
              <Input type="date" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Waiting On</label>
            <Select value={form.waiting_on} onValueChange={(v) => setForm({ ...form, waiting_on: v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="supplier">Supplier</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.client_id || !form.title || mutation.isPending} className="bg-[#2D6A4F] hover:bg-[#1B4332]">
            {mutation.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickAddPaymentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ client_id: "", amount: "", type: "invoice", status: "pending", description: "", due_at: "" });

  const { data: clientList } = useQuery<{ data: { id: number; business_name: string }[]; total: number }>({
    queryKey: ["/api/admin/crm/clients", { limit: 100 }],
    queryFn: async () => {
      const res = await fetch("/api/admin/crm/clients?limit=100", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/crm/payments", {
        client_id: parseInt(form.client_id),
        amount_cents: Math.round(parseFloat(form.amount) * 100),
        type: form.type,
        status: form.status,
        description: form.description || null,
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        actor_type: "human",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/overview"] });
      const amt = `$${parseFloat(form.amount).toFixed(2)}`;
      setForm({ client_id: "", amount: "", type: "invoice", status: "pending", description: "", due_at: "" });
      onClose();
      toast({ title: "Payment created", description: `${form.type} for ${amt}` });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add Payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Client *</label>
            <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select client..." /></SelectTrigger>
              <SelectContent>
                {clientList?.data.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.business_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Amount ($) *</label>
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Type</label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="refund">Refund</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Status</label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Description</label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Due Date</label>
            <Input type="date" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.client_id || !form.amount || mutation.isPending} className="bg-[#2D6A4F] hover:bg-[#1B4332]">
            {mutation.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Layout ─── */

export default function AdminLayout({
  children,
  pageContext,
}: {
  children: React.ReactNode;
  pageContext?: Omit<AdminPageContext, "route">;
}) {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);

  // Support ticket unresolved count for nav badge
  const { data: supportCounts } = useQuery<{ open: number; in_progress: number; waiting_on_customer: number }>({
    queryKey: ["/api/admin/crm/support/tickets/counts"],
    queryFn: async () => {
      const res = await fetch("/api/admin/crm/support/tickets/counts", { credentials: "include" });
      if (!res.ok) return { open: 0, in_progress: 0, waiting_on_customer: 0 };
      return res.json();
    },
    refetchInterval: 60000, // refresh every minute
  });
  const supportUnresolved = (supportCounts?.open ?? 0) + (supportCounts?.in_progress ?? 0) + (supportCounts?.waiting_on_customer ?? 0);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    navigate("/login");
  };
  const initials = (user?.name || user?.email || "A").charAt(0).toUpperCase();

  // Build full context with current route
  const fullPageContext: AdminPageContext = {
    route: location,
    page: pageContext?.page || "unknown",
    ...pageContext,
  };

  return (
    <div className="flex h-screen bg-[#F6F7F9] overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-white border-r border-gray-200 transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo area */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100">
          <Link href="/admin/crm" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#1a1f1e] border border-[rgba(102,232,250,0.15)] flex items-center justify-center">
              <svg viewBox="0 0 22 22" width={16} height={16} fill="none">
                <path d="M8 3H4C3.4 3 3 3.4 3 4V8" stroke="#66E8FA" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 3H18C18.6 3 19 3.4 19 4V8" stroke="#66E8FA" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 19H4C3.4 19 3 18.6 3 18V14" stroke="#66E8FA" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 19H18C18.6 19 19 18.6 19 18V14" stroke="#66E8FA" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7.5 11.5L10 14L14.5 9" stroke="#66E8FA" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="leading-tight">
              <span className="text-sm font-bold text-gray-900">We<span className="text-[#2D6A4F]">Fix</span>Trades</span>
              <span className="text-[10px] text-gray-400 block -mt-0.5">Admin</span>
            </div>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 rounded hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Nav items */}
        <SidebarNav
          location={location}
          supportUnresolved={supportUnresolved}
          onNavigate={() => setMobileOpen(false)}
        />


        {/* Footer */}
        <div className="border-t border-gray-100 px-4 py-3">
          <p className="text-[11px] text-gray-400">WeFixTrades Admin v1.0</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between h-14 px-4 bg-white border-b border-gray-200 shrink-0">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden mr-2 min-h-[44px] min-w-[44px]"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <h1 className="text-sm font-medium text-gray-700">
              {NAV_ITEMS.find((item) => isActive(location, item.href))?.label ??
                OUTBOUND_ITEMS.find((item) => isActive(location, item.href))?.label ??
                SECONDARY_ITEMS.find((item) => isActive(location, item.href))?.label ??
                "Admin"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="bg-[#2D6A4F] hover:bg-[#1B4332] h-8 px-3 gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-xs">Quick Add</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => setQuickAdd("client")}>
                  <UserPlus className="w-4 h-4 mr-2 text-gray-500" /> Add Client
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setQuickAdd("task")}>
                  <ClipboardPlus className="w-4 h-4 mr-2 text-gray-500" /> Add Task
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setQuickAdd("payment")}>
                  <DollarSign className="w-4 h-4 mr-2 text-gray-500" /> Add Payment
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${copilotOpen ? "bg-[#F0F7F4] text-[#2D6A4F]" : "text-gray-500"}`}
              onClick={() => setCopilotOpen(!copilotOpen)}
              title="AI Copilot"
            >
              <Sparkles className="w-4 h-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-7 h-7 rounded-full bg-[#2D6A4F] flex items-center justify-center hover:ring-2 hover:ring-[#2D6A4F]/20 transition-shadow">
                  <span className="text-white text-[10px] font-bold">{initials}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900 truncate">{user?.name || "Admin"}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
                <DropdownMenuItem onClick={() => navigate("/admin/crm/profile")}>
                  <User className="w-4 h-4 mr-2 text-gray-500" /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/admin/crm/settings")}>
                  <Settings className="w-4 h-4 mr-2 text-gray-500" /> Account Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/admin/crm/change-password")}>
                  <KeyRound className="w-4 h-4 mr-2 text-gray-500" /> Change Password
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="w-4 h-4 mr-2" /> Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>

      {/* Quick Add Dialogs */}
      <QuickAddClientDialog open={quickAdd === "client"} onClose={() => setQuickAdd(null)} />
      <QuickAddTaskDialog open={quickAdd === "task"} onClose={() => setQuickAdd(null)} />
      <QuickAddPaymentDialog open={quickAdd === "payment"} onClose={() => setQuickAdd(null)} />

      {/* AI Copilot drawer */}
      <AdminCopilot
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        pageContext={fullPageContext}
      />
    </div>
  );
}
