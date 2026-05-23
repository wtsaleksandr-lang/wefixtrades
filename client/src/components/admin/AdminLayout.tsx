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
  Zap,
  LifeBuoy,
  Star,
  Shield,
  ShieldCheck,
  ChevronDown,
  Layers,
  CalendarDays,
  Server,
  Activity,
  AlertTriangle,
  Phone,
  FileText,
  ClipboardList,
  ServerCog,
  Bell,
  Plug,
  ShieldOff,
  Radio,
  Eye,
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
import { useRealtime } from "@/lib/realtime";
import { useToast } from "@/hooks/use-toast";

/* ─── Core nav — always visible ─── */
const CORE_ITEMS = [
  { label: "Overview", href: "/admin/crm", icon: LayoutDashboard },
  { label: "Clients", href: "/admin/crm/clients", icon: Users },
  { label: "Inbox", href: "/admin/crm/inbox", icon: Inbox },
  { label: "Communications", href: "/admin/crm/communications", icon: Phone },
  { label: "Support", href: "/admin/crm/support", icon: LifeBuoy, countKey: "support" as const },
  { label: "Alerts", href: "/admin/crm/alerts", icon: AlertTriangle, countKey: "alerts" as const },
  { label: "AI Agenda", href: "/admin/notices", icon: Bell },
];

/* ─── Collapsible groups ─── */
/* Q27: dropped the standalone "Services" child — the group HEADER now
   clicks through to /admin/crm/services (the catalog) and the chevron
   expands the per-product list.
   2026-05-22: Products consolidation — each "real" customer-facing
   product is ONE row. Admin sub-pages (templates, trades, setups) nest
   under their parent product and only render when that parent is
   expanded. Cross-product admin tools (Mobile Preview, Booking) moved
   to OPERATIONS_ITEMS. API Platform hidden from nav (route preserved
   in App.tsx — it's developer tooling, not a customer product). */
type NavChild = { label: string; href: string; icon: typeof Sparkles };
type NavItem = {
  label: string;
  href: string;
  icon: typeof Sparkles;
  countKey?: "support" | "alerts";
  /** Nested admin sub-pages of this parent product. Rendered as
   *  indented rows below the parent only when the parent is expanded. */
  children?: NavChild[];
};

const PRODUCTS_ITEMS: NavItem[] = [
  {
    label: "QuoteQuick",
    href: "/admin/crm/quotequick",
    icon: Sparkles,
    children: [
      { label: "Templates", href: "/admin/quotequick/templates", icon: Sparkles },
      { label: "Trades", href: "/admin/quotequick/trades", icon: Sparkles },
    ],
  },
  {
    label: "TradeLine",
    href: "/admin/crm/tradeline-ops",
    icon: Phone,
    children: [
      { label: "Setups", href: "/admin/crm/tradeline-setups", icon: Phone },
      { label: "Templates", href: "/admin/tradeline/templates", icon: Sparkles },
    ],
  },
  { label: "MapGuard", href: "/admin/crm/mapguard", icon: Shield },
  { label: "WebCare", href: "/admin/crm/webcare/ops", icon: ShieldCheck },
  { label: "RankFlow", href: "/admin/crm/rankflow", icon: TrendingUp },
  { label: "Reviews", href: "/admin/crm/reviews", icon: Star },
  { label: "SocialSync", href: "/admin/crm/socialsync", icon: Share2 },
  { label: "ContentFlow", href: "/admin/crm/contentflow", icon: Layers },
  { label: "AdFlow", href: "/admin/crm/adflow", icon: Zap },
];

/* Cross-product admin tooling — not a customer product itself. */
const OPERATIONS_ITEMS: NavItem[] = [
  { label: "Booking", href: "/admin/booking", icon: CalendarDays },
  { label: "Mobile Preview", href: "/admin/mobile-preview", icon: Phone },
];

const FINANCE_ITEMS: NavItem[] = [
  { label: "Billing", href: "/admin/crm/billing", icon: CreditCard },
  { label: "Suppliers", href: "/admin/crm/suppliers", icon: Factory },
  { label: "Sales", href: "/admin/crm/sales", icon: Target },
  { label: "Audit Leads", href: "/admin/crm/audit-leads", icon: ClipboardList },
];

const OUTBOUND_ITEMS: NavItem[] = [
  { label: "Prospects", href: "/admin/outbound/prospects", icon: Users },
  { label: "Campaigns", href: "/admin/outbound/campaigns", icon: Megaphone },
  { label: "Pipeline", href: "/admin/outbound/pipeline", icon: CreditCard },
];

const SYSTEM_ITEMS: NavItem[] = [
  { label: "Job Logs", href: "/admin/system/jobs", icon: Activity },
  { label: "Workers", href: "/admin/system/workers", icon: Server },
  { label: "Integrations", href: "/admin/system/integrations", icon: ServerCog },
  { label: "Audit Log", href: "/admin/crm/audit-log", icon: FileText },
  /* AI-3c audit log — general-purpose audit_log table reader. */
  { label: "Activity Audit", href: "/admin/audit-log", icon: FileText },
  { label: "AI Budget", href: "/admin/crm/ai-budget", icon: BrainCircuit },
  { label: "AI Gates", href: "/admin/ai-gates", icon: ShieldOff },
  /* W-BA-1 — per-channel emergency kill switches (email/SMS/voice/chat). */
  { label: "AI Channels", href: "/admin/ai-channels", icon: Radio },
  /* W-AV-1 — Business Operator AI escalations + trust ladder + kill switch. */
  { label: "AI Activity", href: "/admin/ai-activity", icon: BrainCircuit },
];

const SECONDARY_ITEMS = [
  { label: "AI Dashboard", href: "/admin/ai", icon: BrainCircuit },
  /* Q20: relabelled from "Client Portal" + handled below as a special
     view-as-customer link (audits the entry, opens in new tab). */
  { label: "View as Customer", href: "/portal", icon: ExternalLink, isViewAsCustomer: true as const },
];

/* Unified list for page title detection. Includes parent products,
 * their children, plus operations / finance / system rows so the page
 * title resolves for every routable destination. */
const NAV_ITEMS: NavItem[] = [
  ...CORE_ITEMS as NavItem[],
  ...PRODUCTS_ITEMS,
  ...PRODUCTS_ITEMS.flatMap((p) => p.children ?? []).map((c) => ({ ...c })),
  ...OPERATIONS_ITEMS,
  ...FINANCE_ITEMS,
  ...SYSTEM_ITEMS,
];

/* localStorage key for parent-expansion state. */
const NAV_EXPANDED_KEY = "admin-nav-expanded";
function readExpanded(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NAV_EXPANDED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function writeExpanded(state: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAV_EXPANDED_KEY, JSON.stringify(state));
  } catch {
    /* quota / disabled — non-fatal */
  }
}

function isActive(location: string, href: string): boolean {
  if (href === "/admin/crm") return location === "/admin/crm";
  return location.startsWith(href);
}

/* ─── Parent-with-children row ───
 * Renders a parent product link that can be expanded to reveal indented
 * child sub-page rows. Expansion state persists per-parent in
 * localStorage so the layout survives a page reload.
 *
 * Visual rules (per DESIGN-SYSTEM.md):
 *  - Active child = strong highlight (brand-blue outline + 4-6% tinted bg).
 *  - Parent with active child = subtle indicator (left bar + slightly
 *    darker label) but NOT a bright fill.
 *  - Direct hit on the parent's own href = full strong highlight.
 *  - prefers-reduced-motion disables the chevron rotation transition.
 */
function NavParentItem({
  item,
  location,
  onNavigate,
  expandedMap,
  setExpandedMap,
}: {
  item: NavItem;
  location: string;
  onNavigate: () => void;
  expandedMap: Record<string, boolean>;
  setExpandedMap: (next: Record<string, boolean>) => void;
}) {
  const directActive = isActive(location, item.href);
  const hasActiveChild =
    item.children?.some((c) => isActive(location, c.href)) ?? false;
  // Default: open if a child is active. Otherwise honour stored choice.
  const storedKey = item.href;
  const stored = expandedMap[storedKey];
  const open = stored ?? hasActiveChild;

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = { ...expandedMap, [storedKey]: !open };
    setExpandedMap(next);
    writeExpanded(next);
  };

  const parentClass = cn(
    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors min-h-[40px] flex-1",
    directActive
      ? "bg-[#EEF3FF] text-[#0d3cfc] font-medium border border-[#0d3cfc]/30"
      : hasActiveChild
        ? "text-gray-800 font-medium border-l-2 border-[#0d3cfc] pl-[10px]"
        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent"
  );

  return (
    <div>
      <div className="flex items-center gap-0.5">
        <Link href={item.href} onClick={onNavigate} className={parentClass}>
          <item.icon
            className={cn(
              "w-4 h-4 shrink-0",
              directActive || hasActiveChild ? "text-[#0d3cfc]" : "text-gray-400"
            )}
          />
          <span className="flex-1">{item.label}</span>
        </Link>
        {item.children && item.children.length > 0 && (
          <button
            type="button"
            onClick={toggle}
            aria-label={open ? `Collapse ${item.label}` : `Expand ${item.label}`}
            aria-expanded={open}
            className="p-1.5 rounded hover:bg-gray-100 shrink-0"
            data-testid={`nav-expand-${item.label.toLowerCase()}`}
          >
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 text-gray-500 motion-safe:transition-transform",
                open && "rotate-180"
              )}
            />
          </button>
        )}
      </div>
      {open && item.children && item.children.length > 0 && (
        <div className="ml-4 mt-0.5 mb-1 space-y-0.5 border-l border-gray-100 pl-2">
          {item.children.map((child) => {
            const active = isActive(location, child.href);
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 px-3 py-1.5 rounded-lg text-[13px] transition-colors min-h-[34px]",
                  active
                    ? "bg-[#EEF3FF] text-[#0d3cfc] font-medium border border-[#0d3cfc]/30"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-800 border border-transparent"
                )}
              >
                <child.icon
                  className={cn(
                    "w-3.5 h-3.5 shrink-0",
                    active ? "text-[#0d3cfc]" : "text-gray-400"
                  )}
                />
                <span className="flex-1">{child.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Collapsible nav group ─── */
function NavGroup({
  label,
  items,
  location,
  supportUnresolved,
  alertCount,
  onNavigate,
  defaultOpen,
  headerHref,
  expandedMap,
  setExpandedMap,
}: {
  label: string;
  items: NavItem[];
  location: string;
  supportUnresolved?: number;
  alertCount?: number;
  onNavigate: () => void;
  defaultOpen: boolean;
  /** Q27: when set, clicking the label NAVIGATES to this href (e.g. a catalog page).
   *  The chevron still expands/collapses children. When unset, clicking anywhere on
   *  the header just toggles expansion (legacy behavior). */
  headerHref?: string;
  expandedMap?: Record<string, boolean>;
  setExpandedMap?: (next: Record<string, boolean>) => void;
}) {
  const [, navigate] = useLocation();
  const headerActive = headerHref ? isActive(location, headerHref) : false;
  const hasActiveChild = items.some(
    (item) =>
      isActive(location, item.href) ||
      (item.children?.some((c) => isActive(location, c.href)) ?? false)
  );
  const [open, setOpen] = useState(defaultOpen || hasActiveChild || headerActive);

  // Auto-open when navigating into the group
  useEffect(() => {
    if ((hasActiveChild || headerActive) && !open) setOpen(true);
  }, [hasActiveChild, headerActive]);

  return (
    <div data-theme="light" className="mt-3">
      <div className="w-full flex items-center mb-0.5 group">
        {headerHref ? (
          /* Q27 (final): title is a real button that programmatically
             navigates to the catalog. Uses useLocation rather than wouter's
             Link to guarantee the click handler fires before any sibling
             toggle could intercept. Separate chevron button on the right
             handles expand/collapse. */
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onNavigate();
              navigate(headerHref);
            }}
            className={cn(
              "flex-1 flex items-center justify-between gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wide rounded-lg cursor-pointer transition-colors text-left",
              headerActive
                ? "bg-[#EEF3FF] text-[#0d3cfc]"
                : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
            )}
            title={`Open ${label} catalogue`}
            data-testid={`navgroup-header-${label.toLowerCase()}`}
          >
            <span>{label}</span>
            <ExternalLink className={cn("w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0", headerActive && "opacity-60")} />
          </button>
        ) : (
          <button
            onClick={() => setOpen(!open)}
            className="flex-1 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400 group-hover:text-gray-500 transition-colors text-left"
          >
            {label}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
          className="p-1.5 mx-1 rounded hover:bg-gray-100 shrink-0"
          data-testid={`navgroup-toggle-${label.toLowerCase()}`}
        >
          <ChevronDown className={cn("w-3.5 h-3.5 text-gray-500 motion-safe:transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <div className="space-y-0.5">
          {items.map((item) => {
            // Parent-with-children rows use the dedicated component so
            // the nested sub-pages render indented + persisted.
            if (item.children && item.children.length > 0 && expandedMap && setExpandedMap) {
              return (
                <NavParentItem
                  key={item.href}
                  item={item}
                  location={location}
                  onNavigate={onNavigate}
                  expandedMap={expandedMap}
                  setExpandedMap={setExpandedMap}
                />
              );
            }
            const active = isActive(location, item.href);
            const countKey = item.countKey;
            const badgeCount = countKey === "support" ? (supportUnresolved ?? 0) : countKey === "alerts" ? (alertCount ?? 0) : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors min-h-[40px]",
                  active
                    ? "bg-[#EEF3FF] text-[#0d3cfc] font-medium border border-[#0d3cfc]/30"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent"
                )}
              >
                <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-[#0d3cfc]" : "text-gray-400")} />
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
  alertCount,
  onNavigate,
}: {
  location: string;
  supportUnresolved: number;
  alertCount: number;
  onNavigate: () => void;
}) {
  // Per-parent expansion state, persisted in localStorage so the
  // layout survives page reloads. Default: hydrate from storage.
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>(() => readExpanded());

  return (
    <nav className="flex-1 overflow-y-auto py-3 px-2">
      {/* Core — always expanded */}
      <div className="space-y-0.5">
        {CORE_ITEMS.map((item) => {
          const active = isActive(location, item.href);
          const countKey = (item as any).countKey;
          const badgeCount = countKey === "support" ? supportUnresolved : countKey === "alerts" ? alertCount : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[44px]",
                active
                  ? "bg-[#EEF3FF] text-[#0d3cfc] font-medium border border-[#0d3cfc]/30"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent"
              )}
            >
              <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-[#0d3cfc]" : "text-gray-400")} />
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

      <NavGroup label="Products" items={PRODUCTS_ITEMS} location={location} onNavigate={onNavigate} defaultOpen={true} headerHref="/admin/crm/services" expandedMap={expandedMap} setExpandedMap={setExpandedMap} />
      <NavGroup label="Operations" items={OPERATIONS_ITEMS} location={location} onNavigate={onNavigate} defaultOpen={true} />
      <NavGroup label="Finance" items={FINANCE_ITEMS} location={location} onNavigate={onNavigate} defaultOpen={true} />
      <NavGroup label="Outbound" items={OUTBOUND_ITEMS} location={location} onNavigate={onNavigate} defaultOpen={false} />
      <NavGroup label="System" items={SYSTEM_ITEMS} location={location} onNavigate={onNavigate} defaultOpen={false} />

      {/* Other */}
      <div className="mt-4 pt-2 border-t border-gray-100">
        <div className="space-y-0.5">
          {SECONDARY_ITEMS.map((item) => {
            const active = isActive(location, item.href);
            const isPreview = (item as any).isViewAsCustomer;
            const className = cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors min-h-[40px]",
              active
                ? "bg-[#EEF3FF] text-[#0d3cfc] font-medium"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            );
            // Q20: View-as-customer opens portal in NEW TAB so the admin's
            // primary admin session keeps working in the original window.
            // Audit-log the entry so we have a record of every preview.
            if (isPreview) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    fetch("/api/admin/audit/preview-portal-entry", {
                      method: "POST",
                      credentials: "include",
                    }).catch(() => { /* fire-and-forget */ });
                    onNavigate();
                  }}
                  className={className}
                  data-testid="view-as-customer"
                >
                  <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-[#0d3cfc]" : "text-gray-400")} />
                  {item.label}
                </a>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={className}
              >
                <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-[#0d3cfc]" : "text-gray-400")} />
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
          <Button onClick={() => mutation.mutate(form)} disabled={!form.business_name || mutation.isPending} className="bg-[#0d3cfc] hover:bg-[#0b34d6]">
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
          <Button onClick={() => mutation.mutate()} disabled={!form.client_id || !form.title || mutation.isPending} className="bg-[#0d3cfc] hover:bg-[#0b34d6]">
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
          <Button onClick={() => mutation.mutate()} disabled={!form.client_id || !form.amount || mutation.isPending} className="bg-[#0d3cfc] hover:bg-[#0b34d6]">
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
  const { user, adminProPreview } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);

  /* P1 fix: admin "Preview as Pro" session toggle.
   *
   * Flips a per-session boolean on the server (POST /api/admin/me/
   * preview-pro) so every Pro-tier gate resolves to TRUE for this
   * admin's session, regardless of any client's underlying subscription
   * state. Used pre-launch so Alex (admin) can exercise Pro-only UX
   * without paying for a Pro plan. Clears automatically on logout
   * (req.logout destroys the session). */
  const togglePreviewPro = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("POST", "/api/admin/me/preview-pro", { enabled });
      return res.json() as Promise<{ ok: true; enabled: boolean }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      toast({
        title: data.enabled ? "Preview as Pro: ON" : "Preview as Pro: OFF",
        description: data.enabled
          ? "Pro-tier features now visible for this session."
          : "Reverted to your real subscription tier.",
      });
    },
    onError: () => {
      toast({
        title: "Couldn't change Preview as Pro",
        description: "Try again, or refresh the page.",
        variant: "destructive",
      });
    },
  });

  /* Real-time push: when any admin or AI agent writes to the audit
   * log, the server emits 'admin.activity.new'. We invalidate every
   * query that reads from the activity log so dashboards / the audit
   * page update without a refetch interval. Mounted at the layout
   * level so the subscription is active across every admin page. */
  useRealtime("admin.activity.new", () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/activity"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/overview"] });
  });

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

  const { data: alertCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/admin/alerts/count"],
    queryFn: async () => {
      const res = await fetch("/api/admin/alerts/count", { credentials: "include" });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    refetchInterval: 60000,
  });
  const alertCount = alertCountData?.count ?? 0;

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
    <>
    {/* Skip-to-content — visible only when keyboard-focused. */}
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:rounded-md focus:bg-[#0d3cfc] focus:text-white focus:text-sm focus:font-medium focus:shadow-lg"
    >
      Skip to main content
    </a>
    <div className="flex h-screen bg-[#F6F7F9] overflow-hidden">
      {/* Mobile overlay — semantically a button. Keyboard users get
          the same dismissal via the ChevronLeft button inside the
          sidebar. */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
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
            <svg viewBox="0 0 24 24" width={24} height={24} fill="none" aria-label="WeFixTrades">
              {/* Open checkbox — top-right corner open, check exits through it */}
              <path d="M12 7 H4 V20 H17 V12.5" stroke="#1E1E1E" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 13 11.5 16.5 21 5" stroke="#0d3cfc" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="leading-tight">
              <span className="text-sm font-bold text-gray-900">We<span className="text-[#0d3cfc]">Fix</span>Trades</span>
              <span className="text-[10px] text-gray-400 block -mt-0.5">Admin</span>
            </div>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 rounded hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close navigation menu"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Nav items */}
        <SidebarNav
          location={location}
          supportUnresolved={supportUnresolved}
          alertCount={alertCount}
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
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </Button>
            <h1 className="text-sm font-medium text-gray-700">
              {NAV_ITEMS.find((item) => isActive(location, item.href))?.label ??
                OUTBOUND_ITEMS.find((item) => isActive(location, item.href))?.label ??
                SECONDARY_ITEMS.find((item) => isActive(location, item.href))?.label ??
                "Admin"}
            </h1>
            {/* P1 fix: visible "PREVIEW AS PRO" pill so an admin never
             *  forgets they're seeing the override view. Only renders
             *  when adminProPreview === true (server-validated). */}
            {adminProPreview && (
              <button
                type="button"
                onClick={() => togglePreviewPro.mutate(false)}
                disabled={togglePreviewPro.isPending}
                className="ml-3 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-bold uppercase tracking-wider hover:bg-amber-200 transition-colors"
                title="Click to turn off Preview as Pro"
                data-testid="admin-preview-pro-pill"
              >
                <Eye className="w-3 h-3" />
                Preview as Pro
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="bg-[#0d3cfc] hover:bg-[#0b34d6] h-8 px-3 gap-1.5">
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
              className={`h-8 w-8 ${copilotOpen ? "bg-[#0d3cfc]/10 text-[#0d3cfc]" : "text-gray-500"}`}
              onClick={() => setCopilotOpen(!copilotOpen)}
              title="AI Copilot"
            >
              <Sparkles className="w-4 h-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-7 h-7 rounded-full bg-[#0d3cfc] flex items-center justify-center hover:ring-2 hover:ring-[#0d3cfc]/20 transition-shadow">
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
                {/* P1 fix: admin "Preview as Pro" toggle. Stays in the
                 *  account dropdown so it's discoverable next to Profile /
                 *  Settings without taking up top-bar real estate. The
                 *  pill in the page header (above) gives a persistent
                 *  visual cue when ON. */}
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    togglePreviewPro.mutate(!adminProPreview);
                  }}
                  data-testid="admin-preview-pro-toggle"
                >
                  <Eye className="w-4 h-4 mr-2 text-gray-500" />
                  <span className="flex-1">Preview as Pro</span>
                  <span
                    className={cn(
                      "ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                      adminProPreview
                        ? "bg-amber-100 text-amber-900"
                        : "bg-gray-100 text-gray-500"
                    )}
                  >
                    {adminProPreview ? "On" : "Off"}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="w-4 h-4 mr-2" /> Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main id="main-content" className="flex-1 overflow-y-auto p-4 md:p-6" tabIndex={-1}>
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
    </>
  );
}
