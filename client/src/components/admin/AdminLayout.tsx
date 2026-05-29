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
  Hammer,
  Rocket,
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
  ArrowLeft,
} from "lucide-react";
import AdminCopilot, { type AdminPageContext } from "./AdminCopilot";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { loadCopilotOpenState, saveCopilotOpenState } from "@/lib/chatHelpers";
import { extractPageContext, pushPageContext } from "@/lib/chat/pageContext";
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
  /** Wave 138 — catalog product id (from @shared/pricing ALL_PRODUCTS) for
   *  the product rows in PRODUCTS_ITEMS. Lets the sidebar split products
   *  into the "live" (active) simple set vs the Advanced reveal using the
   *  /api/admin/products active-state map. Non-product rows omit this. */
  productId?: string;
};

/* Wave 138 — Health-dot integration slot.
 * Design-in only: a placeholder per-product health indicator that renders
 * NOTHING today. The health wave will replace the body with a real signal
 * (e.g. green/amber/red dot fed by a /api/admin/products/health query).
 * Kept tiny + side-effect-free so it's a clean drop-in target. Do NOT
 * fabricate health data here. */
function ProductHealthDot({ productId }: { productId?: string }) {
  // TODO(health-wave): wire a per-product health signal keyed by productId
  // and render a small status dot here. Intentionally renders null for now.
  void productId;
  return null;
}

/* Wave 138 — each product row carries its catalog `productId` (from
 * @shared/pricing ALL_PRODUCTS ids) so the sidebar can split active vs
 * inactive products using the /api/admin/products map. Labels are display
 * names; the explicit productId is the robust match (no fragile
 * label→id string munging). */
const PRODUCTS_ITEMS: NavItem[] = [
  {
    label: "QuoteQuick",
    href: "/admin/crm/quotequick",
    icon: Sparkles,
    productId: "quotequick",
    children: [
      { label: "Templates", href: "/admin/quotequick/templates", icon: Sparkles },
      { label: "Trades", href: "/admin/quotequick/trades", icon: Sparkles },
    ],
  },
  {
    label: "TradeLine",
    href: "/admin/crm/tradeline-ops",
    icon: Phone,
    productId: "tradeline",
    children: [
      { label: "Setups", href: "/admin/crm/tradeline-setups", icon: Phone },
      { label: "Templates", href: "/admin/tradeline/templates", icon: Sparkles },
    ],
  },
  { label: "MapGuard", href: "/admin/crm/mapguard", icon: Shield, productId: "mapguard" },
  { label: "WebCare", href: "/admin/crm/webcare/ops", icon: ShieldCheck, productId: "webcare" },
  { label: "RankFlow", href: "/admin/crm/rankflow", icon: TrendingUp, productId: "rankflow" },
  { label: "ReputationShield", href: "/admin/crm/reviews", icon: Star, productId: "reputationshield" },
  { label: "SocialSync", href: "/admin/crm/socialsync", icon: Share2, productId: "socialsync" },
  { label: "ContentFlow", href: "/admin/crm/contentflow", icon: Layers, productId: "contentflow" },
  { label: "AdFlow", href: "/admin/crm/adflow", icon: Zap, productId: "adflow" },
  /* 2026-05-23: SiteLaunch + WebFix — only reachable today via the
   * Services catalogue editor pages. No dedicated CRM ops surface yet,
   * so the parent row points at the catalog editor per PR #569's
   * "parent path = most useful entry point" convention. */
  { label: "SiteLaunch", href: "/admin/products/sitelaunch", icon: Rocket, productId: "sitelaunch" },
  { label: "WebFix", href: "/admin/products/webfix", icon: Hammer, productId: "webfix" },
];

/* Cross-product admin tooling — not a customer product itself.
 * Wave 36 — Mobile Preview moved out of the sidebar (internal QA tool); still
 * reachable via direct URL `/admin/mobile-preview`. */
const OPERATIONS_ITEMS: NavItem[] = [
  { label: "BookFlow", href: "/admin/booking", icon: CalendarDays },
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
  { label: "Sequences", href: "/admin/outbound/sequences", icon: Layers },
  { label: "Pipeline", href: "/admin/outbound/pipeline", icon: CreditCard },
];

const SYSTEM_ITEMS: NavItem[] = [
  { label: "Job Logs", href: "/admin/system/jobs", icon: Activity },
  { label: "Workers", href: "/admin/system/workers", icon: Server },
  { label: "Integrations", href: "/admin/system/integrations", icon: ServerCog },
  /* Wave 36 — two audit logs merged into one nav row (canonical = CRM audit
   * log). The general-purpose /admin/audit-log route still exists, but the
   * sidebar now has a single destination per audit's "merge to one" verdict. */
  { label: "Audit Log", href: "/admin/crm/audit-log", icon: FileText },
];

/* 2026-05-23: AI consolidation — every AI admin surface lives under a
 * single "AI Dashboard" parent (the comprehensive overview at /admin/ai),
 * with the per-surface admin tools nested as children. Mirrors the
 * PR #569 parent-child pattern (QuoteQuick / TradeLine). Order:
 * most-used first — Activity → Gates → Channels → Chat History → Budget. */
/* Wave 36 — Tesla Simplification. The 5 AI children (Activity / Gates /
 * Channels / Chat History / Budget) are tabs on /admin/ai already; the
 * audit flagged the sidebar children as a duplicated nav footprint. They
 * remain reachable via direct URL + via the AI Dashboard tabs. */
const AI_ITEMS: NavItem[] = [
  { label: "AI Dashboard", href: "/admin/ai", icon: BrainCircuit },
];

const SECONDARY_ITEMS = [
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
  ...AI_ITEMS,
  ...AI_ITEMS.flatMap((p) => p.children ?? []).map((c) => ({ ...c })),
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

/* Wave 138 — Tesla-simple sidebar. The default view shows only Core +
 * live (active) products + Billing. Everything else (inactive products,
 * the rest of Finance, Operations, Outbound, AI, System) hides behind a
 * single "Show all · Advanced" toggle, persisted under this key so the
 * admin's choice survives reloads. Mirrors readExpanded/writeExpanded. */
const NAV_ADVANCED_KEY = "admin-nav-advanced";
function readAdvanced(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(NAV_ADVANCED_KEY) === "1";
  } catch {
    return false;
  }
}
function writeAdvanced(open: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAV_ADVANCED_KEY, open ? "1" : "0");
  } catch {
    /* quota / disabled — non-fatal */
  }
}

function isActive(location: string, href: string): boolean {
  if (href === "/admin/crm") return location === "/admin/crm";
  return location.startsWith(href);
}

/* Subtle theme-aware hairline divider between top-level nav rows.
 * Light: rgba(15,23,42,0.06); dark consumers can override via the
 * --qq-nav-divider CSS variable on a parent. Applied only to rows
 * that are NOT the last in their section so section breaks read as
 * group boundaries, not just another divider. */
const NAV_ROW_DIVIDER_STYLE: React.CSSProperties = {
  borderBottom: "1px solid var(--qq-nav-divider, rgba(15, 23, 42, 0.06))",
};

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
  showDivider,
}: {
  item: NavItem;
  location: string;
  onNavigate: () => void;
  expandedMap: Record<string, boolean>;
  setExpandedMap: (next: Record<string, boolean>) => void;
  /** Render a subtle bottom hairline. False on the last row of a section. */
  showDivider?: boolean;
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

  // Wave 104 — font-medium is now on EVERY state (active, has-active-child,
  // default). Previously only the active states bolded the label, so
  // navigating to a section visibly widened the row text by ~3-5px — Alex
  // reported this as "text shifts on hover". Uniform weight = no reflow.
  // Active/hover still differ via color + background tint + border accent.
  // Dark-mode tokens: text-gray-* → text-foreground / text-muted-foreground.
  const parentClass = cn(
    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px] flex-1",
    directActive
      ? "bg-[#EEF3FF] dark:bg-brand-blue/15 text-brand-blue border border-brand-blue/30"
      : hasActiveChild
        ? "text-foreground border-l-2 border-brand-blue pl-[10px]"
        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
  );

  return (
    <div style={showDivider ? NAV_ROW_DIVIDER_STYLE : undefined}>
      <div className="flex items-center gap-0.5">
        <Link href={item.href} onClick={onNavigate} className={parentClass}>
          <item.icon
            className={cn(
              "w-4 h-4 shrink-0",
              directActive || hasActiveChild ? "text-brand-blue" : "text-muted-foreground/70"
            )}
          />
          <span className="flex-1">{item.label}</span>
          {/* Wave 138 — per-product health-dot slot (renders null today). */}
          {item.productId && <ProductHealthDot productId={item.productId} />}
        </Link>
        {item.children && item.children.length > 0 && (
          <button
            type="button"
            onClick={toggle}
            aria-label={open ? `Collapse ${item.label}` : `Expand ${item.label}`}
            aria-expanded={open}
            className="p-1.5 rounded hover:bg-muted shrink-0"
            data-testid={`nav-expand-${item.label.toLowerCase()}`}
          >
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 text-muted-foreground motion-safe:transition-transform",
                open && "rotate-180"
              )}
            />
          </button>
        )}
      </div>
      {open && item.children && item.children.length > 0 && (
        <div className="ml-4 mt-0.5 mb-1 space-y-0.5 border-l border-border pl-2">
          {item.children.map((child) => {
            const active = isActive(location, child.href);
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                className={cn(
                  // Wave 104 — font-medium on every state so the active
                  // nav child doesn't widen the row text. Dark-mode tokens
                  // for the rest.
                  "flex items-center gap-3 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors min-h-[34px]",
                  active
                    ? "bg-[#EEF3FF] dark:bg-brand-blue/15 text-brand-blue border border-brand-blue/30"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                )}
              >
                <child.icon
                  className={cn(
                    "w-3.5 h-3.5 shrink-0",
                    active ? "text-brand-blue" : "text-muted-foreground/70"
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
                ? "bg-[#EEF3FF] text-brand-blue"
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
          {items.map((item, idx) => {
            const isLastInSection = idx === items.length - 1;
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
                  showDivider={!isLastInSection}
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
                style={!isLastInSection ? NAV_ROW_DIVIDER_STYLE : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors min-h-[40px]",
                  active
                    ? "bg-[#EEF3FF] text-brand-blue font-medium border border-brand-blue/30"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent"
                )}
              >
                <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-brand-blue" : "text-gray-400")} />
                <span className="flex-1">{item.label}</span>
                {/* Wave 138 — per-product health-dot slot (renders null today). */}
                {item.productId && <ProductHealthDot productId={item.productId} />}
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

  /* Wave 138 — single "Advanced" reveal. When OFF (default) the nav shows
   * only Core + live products + Billing. When ON it renders the full
   * grouped layout (inactive products + Finance/Operations/Outbound/AI/
   * System). Persisted in localStorage under NAV_ADVANCED_KEY. */
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(() => readAdvanced());
  const toggleAdvanced = () => {
    const next = !advancedOpen;
    setAdvancedOpen(next);
    writeAdvanced(next);
  };

  /* Active-state map for every catalog product, keyed by ProductDef.id.
   * Drives which PRODUCTS_ITEMS land in the "live" simple set vs behind
   * Advanced. While the query is loading we treat ALL products as active
   * so the nav never flickers to an empty "live" section on first paint. */
  const { data: productStates } = useQuery<{ id: string; name: string; is_active: boolean; hidden: boolean }[]>({
    queryKey: ["/api/admin/products"],
    queryFn: async () => {
      const res = await fetch("/api/admin/products", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load products");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const activeById = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const p of productStates ?? []) m[p.id] = p.is_active;
    return m;
  }, [productStates]);
  // Loading (no data yet) → treat every product as active so we never
  // render an empty "Products · live" section.
  const isProductActive = (productId?: string): boolean => {
    if (!productStates) return true;
    if (!productId) return true;
    return activeById[productId] ?? false;
  };
  const activeProducts = PRODUCTS_ITEMS.filter((p) => isProductActive(p.productId));
  const inactiveProducts = PRODUCTS_ITEMS.filter((p) => !isProductActive(p.productId));

  // Finance split: Billing always shows in the simple view; the rest
  // (Suppliers, Sales, Audit Leads) move behind Advanced.
  const billingItems = FINANCE_ITEMS.filter((i) => i.href === "/admin/crm/billing");
  const financeAdvancedItems = FINANCE_ITEMS.filter((i) => i.href !== "/admin/crm/billing");

  /* If the admin lands (e.g. via direct URL or breadcrumb) on a page that
   * only exists behind Advanced — an inactive product, or any Operations /
   * Outbound / AI / System / non-Billing Finance row — auto-reveal Advanced
   * so the active row is visible & highlighted. We never auto-close it. */
  const advancedHrefs = useMemo(() => {
    const collect = (items: NavItem[]) =>
      items.flatMap((i) => [i.href, ...(i.children?.map((c) => c.href) ?? [])]);
    return [
      ...collect(inactiveProducts),
      ...collect(OPERATIONS_ITEMS),
      ...collect(financeAdvancedItems),
      ...collect(OUTBOUND_ITEMS),
      ...collect(AI_ITEMS),
      ...collect(SYSTEM_ITEMS),
    ];
  }, [inactiveProducts, financeAdvancedItems]);
  useEffect(() => {
    if (advancedOpen) return;
    if (advancedHrefs.some((h) => isActive(location, h))) {
      setAdvancedOpen(true);
      writeAdvanced(true);
    }
  }, [location, advancedHrefs, advancedOpen]);

  /* Persist + restore the sidebar's scroll position across route
   * changes. Each admin page mounts its own <AdminLayout>, so the
   * <nav> here re-mounts on every navigation and naturally scrolls
   * back to top. We stash scrollTop in sessionStorage on every scroll
   * and restore it synchronously in useLayoutEffect on mount, so the
   * user never sees a flash to zero. */
  const navRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const saved = sessionStorage.getItem("admin-nav-scroll-top");
    if (saved && navRef.current) {
      navRef.current.scrollTop = Number(saved) || 0;
    }
  }, []);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const onScroll = () => {
      sessionStorage.setItem("admin-nav-scroll-top", String(el.scrollTop));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav ref={navRef} className="flex-1 overflow-y-auto py-3 px-2">
      {/* Core — always expanded */}
      <div className="space-y-0.5">
        {CORE_ITEMS.map((item, idx) => {
          const active = isActive(location, item.href);
          const countKey = (item as any).countKey;
          const badgeCount = countKey === "support" ? supportUnresolved : countKey === "alerts" ? alertCount : 0;
          const isLastInSection = idx === CORE_ITEMS.length - 1;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              style={!isLastInSection ? NAV_ROW_DIVIDER_STYLE : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[44px]",
                active
                  ? "bg-[#EEF3FF] text-brand-blue font-medium border border-brand-blue/30"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
              )}
            >
              <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-brand-blue" : "text-muted-foreground/70")} />
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

      {/* Wave 138 — Tesla-simple default view: only the live (active)
          products + Billing show up front. The header still clicks through
          to the catalog (headerHref) and the per-product children still
          nest under their parent. */}
      <NavGroup label="Products · live" items={activeProducts} location={location} onNavigate={onNavigate} defaultOpen={true} headerHref="/admin/crm/services" expandedMap={expandedMap} setExpandedMap={setExpandedMap} />

      {/* Billing — the one Finance row that stays in the simple view. */}
      <div className="space-y-0.5 mt-3">
        {billingItems.map((item) => {
          const active = isActive(location, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors min-h-[40px]",
                active
                  ? "bg-[#EEF3FF] text-brand-blue font-medium border border-brand-blue/30"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
              )}
            >
              <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-brand-blue" : "text-muted-foreground/70")} />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Wave 138 — single "Show all · Advanced" reveal toggle. Collapsed by
          default; state persisted in localStorage (NAV_ADVANCED_KEY). When
          open it renders the inactive products + the full Finance /
          Operations / Outbound / AI / System grouped layout. */}
      <div className="mt-3">
        <button
          type="button"
          onClick={toggleAdvanced}
          aria-expanded={advancedOpen}
          aria-label={advancedOpen ? "Hide advanced navigation" : "Show all advanced navigation"}
          data-testid="nav-advanced-toggle"
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px] border",
            advancedOpen
              ? "text-foreground border-border bg-muted/40"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border-transparent"
          )}
        >
          <ChevronDown className={cn("w-4 h-4 shrink-0 text-muted-foreground motion-safe:transition-transform", advancedOpen ? "" : "-rotate-90")} />
          <span className="flex-1 text-left">{advancedOpen ? "Hide advanced" : "Show all · Advanced"}</span>
          {!advancedOpen && inactiveProducts.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">
              {inactiveProducts.length}
            </span>
          )}
        </button>
      </div>

      {advancedOpen && (
        <>
          {/* Inactive / not-yet-live products. Reuses the same NavGroup so
              children still nest and the catalog header still links out. */}
          {inactiveProducts.length > 0 && (
            <NavGroup label="Products · inactive" items={inactiveProducts} location={location} onNavigate={onNavigate} defaultOpen={true} headerHref="/admin/crm/services" expandedMap={expandedMap} setExpandedMap={setExpandedMap} />
          )}
          <NavGroup label="Operations" items={OPERATIONS_ITEMS} location={location} onNavigate={onNavigate} defaultOpen={true} />
          {/* Finance minus Billing (Billing is shown in the simple view above). */}
          <NavGroup label="Finance" items={financeAdvancedItems} location={location} onNavigate={onNavigate} defaultOpen={true} />
          <NavGroup label="Outbound" items={OUTBOUND_ITEMS} location={location} onNavigate={onNavigate} defaultOpen={false} />
          <NavGroup label="AI" items={AI_ITEMS} location={location} onNavigate={onNavigate} defaultOpen={false} expandedMap={expandedMap} setExpandedMap={setExpandedMap} />
          <NavGroup label="System" items={SYSTEM_ITEMS} location={location} onNavigate={onNavigate} defaultOpen={false} />
        </>
      )}

      {/* Other */}
      <div className="mt-4 pt-2 border-t border-border">
        <div className="space-y-0.5">
          {SECONDARY_ITEMS.map((item, idx) => {
            const active = isActive(location, item.href);
            const isPreview = (item as any).isViewAsCustomer;
            const isLastInSection = idx === SECONDARY_ITEMS.length - 1;
            const rowStyle = !isLastInSection ? NAV_ROW_DIVIDER_STYLE : undefined;
            const className = cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors min-h-[40px]",
              active
                ? "bg-[#EEF3FF] text-brand-blue font-medium"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
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
                  style={rowStyle}
                  className={className}
                  data-testid="view-as-customer"
                >
                  <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-brand-blue" : "text-muted-foreground/70")} />
                  {item.label}
                </a>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                style={rowStyle}
                className={className}
              >
                <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-brand-blue" : "text-muted-foreground/70")} />
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
            <label className="text-xs font-medium text-muted-foreground">Business Name *</label>
            <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Contact Name</label>
              <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <Input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Trade</label>
              <Input value={form.trade_type} onChange={(e) => setForm({ ...form, trade_type: e.target.value })} placeholder="e.g. plumber" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
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
          <Button onClick={() => mutation.mutate(form)} disabled={!form.business_name || mutation.isPending} className="bg-brand-blue hover:bg-brand-blue-600">
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
            <label className="text-xs font-medium text-muted-foreground">Client *</label>
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
              <label className="text-xs font-medium text-muted-foreground">Service</label>
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
            <label className="text-xs font-medium text-muted-foreground">Task Title *</label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Set up Google Business Profile" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
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
              <label className="text-xs font-medium text-muted-foreground">Due Date</label>
              <Input type="date" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Waiting On</label>
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
          <Button onClick={() => mutation.mutate()} disabled={!form.client_id || !form.title || mutation.isPending} className="bg-brand-blue hover:bg-brand-blue-600">
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
            <label className="text-xs font-medium text-muted-foreground">Client *</label>
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
              <label className="text-xs font-medium text-muted-foreground">Amount ($) *</label>
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Type</label>
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
            <label className="text-xs font-medium text-muted-foreground">Status</label>
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
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Due Date</label>
            <Input type="date" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.client_id || !form.amount || mutation.isPending} className="bg-brand-blue hover:bg-brand-blue-600">
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
  /* Persistent across route changes: AdminLayout re-mounts on every admin
   * page, so a plain useState(false) would slam the copilot closed on every
   * navigation. We hydrate from localStorage on mount and write back on
   * every toggle so the panel stays open as the admin clicks through. */
  const [copilotOpen, setCopilotOpenState] = useState<boolean>(() => loadCopilotOpenState());
  const setCopilotOpen = (next: boolean) => {
    setCopilotOpenState(next);
    saveCopilotOpenState(next);
  };

  /* Wave 12D — Allow other admin pages (notably SystemAlertsPage) to open
   * the AI Copilot programmatically by dispatching a "copilot:open" event.
   * Optional `detail.seedText` is forwarded to a follow-up
   * "copilot:seed-and-send" event after a tick — the AdminCopilot is
   * already mounted (always renders, just hidden when closed) and listens
   * for the second event to auto-send the message. */
  useEffect(() => {
    function onOpen(ev: Event) {
      const detail = (ev as CustomEvent).detail;
      setCopilotOpen(true);
      if (detail && typeof detail.seedText === "string" && detail.seedText.trim()) {
        // Slight delay so the panel mount + open transition completes
        // before the message is injected. 80ms is enough to clear React's
        // commit + the existing open-handler focus timer (100ms in
        // AdminCopilot, but the seed-and-send handler is independent).
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("copilot:seed-and-send", { detail: { text: detail.seedText } }));
        }, 80);
      }
    }
    window.addEventListener("copilot:open", onOpen as EventListener);
    return () => window.removeEventListener("copilot:open", onOpen as EventListener);
  }, []);
  const breadcrumbItems = useBreadcrumbs();

  /* Page-context sync — every route change pushes a fresh snapshot onto
   * the shared ring buffer so the next chat turn carries the user's
   * recent navigation trail. The chat widget itself listens to the
   * dispatched CustomEvent for inline UI hints. We capture document.title
   * one tick after the route change so the new page's <title> has a chance
   * to render before we snapshot it. */
  useEffect(() => {
    const t = window.setTimeout(() => {
      pushPageContext(extractPageContext(location));
    }, 0);
    return () => window.clearTimeout(t);
  }, [location]);

  /* Mobile-only "Admin works best on desktop" banner. The admin surface
   * is intentionally desktop-first (dense tables, multi-column forms,
   * keyboard shortcuts). On phones it still works but feels cramped, so
   * we warn explicitly. Dismissal persists for the current browser tab
   * only (sessionStorage) — a fresh tab gets a fresh nudge. The banner
   * itself is hidden at md and above via `md:hidden`. */
  const [mobileBannerDismissed, setMobileBannerDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem("admin-mobile-banner-dismissed") === "1";
    } catch {
      return false;
    }
  });
  const dismissMobileBanner = () => {
    try {
      window.sessionStorage.setItem("admin-mobile-banner-dismissed", "1");
    } catch {
      /* private mode / quota — non-fatal */
    }
    setMobileBannerDismissed(true);
  };

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
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:rounded-md focus:bg-brand-blue focus:text-white focus:text-sm focus:font-medium focus:shadow-lg"
    >
      Skip to main content
    </a>
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
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
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo area */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-border">
          <Link href="/admin/crm" className="flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" width={24} height={24} fill="none" aria-label="WeFixTrades">
              {/* Open checkbox — top-right corner open, check exits through it */}
              <path d="M12 7 H4 V20 H17 V12.5" stroke="#1E1E1E" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 13 11.5 16.5 21 5" stroke="#0d3cfc" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="leading-tight">
              <span className="text-sm font-bold text-foreground">We<span className="text-brand-blue">Fix</span>Trades</span>
              <span className="text-[10px] text-muted-foreground/70 block -mt-0.5">Admin</span>
            </div>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 rounded hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
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
        <div className="border-t border-border px-4 py-3">
          <p className="text-[11px] text-muted-foreground/70">WeFixTrades Admin v1.0</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile-only "best on desktop" guidance banner.
         *  Renders under md (≤767px) only — desktop never sees it. Sits
         *  above the chrome header so it's the first thing a mobile
         *  user notices. Dismissible per-tab via sessionStorage. */}
        {!mobileBannerDismissed && (
          <div
            data-theme="light"
            className="md:hidden bg-yellow-50 border-b border-yellow-200 px-3 py-2 text-xs text-yellow-900 flex items-center justify-between shrink-0"
            data-testid="admin-mobile-banner"
            role="note"
          >
            <span className="leading-snug pr-2">
              <strong>Admin works best on desktop.</strong> Mobile is supported but feature-limited.
            </span>
            <button
              type="button"
              onClick={dismissMobileBanner}
              aria-label="Dismiss desktop-recommendation banner"
              className="ml-2 shrink-0 text-yellow-900/60 hover:text-yellow-900 p-1 -mr-1"
              data-testid="admin-mobile-banner-dismiss"
            >
              ✕
            </button>
          </div>
        )}
        {/* Top bar */}
        <header className="flex items-center justify-between h-14 px-4 bg-card text-card-foreground border-b border-border shrink-0">
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
            {/* Wave 12B Bug #1 — quick exit back to marketing site. Admin
             *  session is preserved (clicking just navigates to /). Hidden
             *  on the smallest mobile breakpoint to leave room for the
             *  page title + Quick Add CTA on tiny screens. */}
            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1.5 mr-3 px-2 py-1 text-xs text-muted-foreground rounded-md border border-transparent hover:border-border hover:text-foreground transition-colors"
              data-testid="admin-back-to-website"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back to website
            </Link>
            <h1 className="text-sm font-medium text-foreground">
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
                <Button size="sm" className="bg-brand-blue hover:bg-brand-blue-600 h-8 px-3 gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-xs">Quick Add</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => setQuickAdd("client")}>
                  <UserPlus className="w-4 h-4 mr-2 text-muted-foreground" /> Add Client
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setQuickAdd("task")}>
                  <ClipboardPlus className="w-4 h-4 mr-2 text-muted-foreground" /> Add Task
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setQuickAdd("payment")}>
                  <DollarSign className="w-4 h-4 mr-2 text-muted-foreground" /> Add Payment
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${copilotOpen ? "bg-brand-blue/10 text-brand-blue" : "text-muted-foreground"}`}
              onClick={() => setCopilotOpen(!copilotOpen)}
              data-testid="admin-copilot-trigger"
              title="AI Copilot"
            >
              <Sparkles className="w-4 h-4" />
            </Button>
            {/* Day / night / system theme toggle — sits next to the
             *  user menu so the affordance is discoverable but doesn't
             *  compete with the Quick Add primary CTA. */}
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-7 h-7 rounded-full bg-brand-blue flex items-center justify-center hover:ring-2 hover:ring-brand-blue/20 transition-shadow">
                  <span className="text-white text-[10px] font-bold">{initials}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-sm font-medium text-foreground truncate">{user?.name || "Admin"}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
                <DropdownMenuItem onClick={() => navigate("/admin/crm/profile")}>
                  <User className="w-4 h-4 mr-2 text-muted-foreground" /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/admin/crm/settings")}>
                  <Settings className="w-4 h-4 mr-2 text-muted-foreground" /> Account Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/admin/crm/change-password")}>
                  <KeyRound className="w-4 h-4 mr-2 text-muted-foreground" /> Change Password
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
                  <Eye className="w-4 h-4 mr-2 text-muted-foreground" />
                  <span className="flex-1">Preview as Pro</span>
                  <span
                    className={cn(
                      "ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                      adminProPreview
                        ? "bg-amber-100 text-amber-900"
                        : "bg-muted text-muted-foreground"
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

        {/* Page content.
         *
         * Canonical admin container shape (single source of truth — pages
         * must NOT add their own max-w / mx-auto / px-*):
         *   - flex-1 min-w-0 lets <main> shrink correctly inside the flex
         *     parent so wide tables never push the page past the viewport
         *   - overflow-y-auto for vertical scroll
         *   - overflow-x-hidden contains accidental child overflow inside
         *     the admin chrome (the page never grows a horizontal scrollbar
         *     at the document level)
         *
         * Inner wrapper centres + caps the content:
         *   - max-w-screen-2xl (1536px) — generous for tables, narrow
         *     enough that lines don't stretch uncomfortably on ultrawides
         *   - mx-auto w-full to centre when shorter than the cap
         *   - px-4 sm:px-6 lg:px-8 + py-6 — consistent gutters & rhythm
         */}
        <main
          id="main-content"
          className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden"
          tabIndex={-1}
        >
          <div className="max-w-screen-2xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
            {breadcrumbItems.length > 0 && (
              <Breadcrumbs items={breadcrumbItems} className="mb-4" />
            )}
            {children}
          </div>
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
