import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Wrench,
  CreditCard,
  Share2,
  Settings,
  HelpCircle,
  ChevronLeft,
  Menu,
  LogOut,
  ArrowLeft,
  TrendingUp,
  Star,
  FileText,
  Code,
  Calendar,
  Receipt,
  MapPin,
  Plus,
  Sparkles,
  Key,
  Palette,
  Phone,
  PhoneCall,
  Calculator,
  Gift,
  FileCode2,
  Image as ImageIcon,
  Layout as LayoutIcon,
  Hammer,
  ShieldCheck,
  Zap,
  ClipboardList,
  User,
  Users,
  Moon,
  Sun,
  Rocket,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PortalChatWidget, { type PortalChatContext } from "./PortalChatWidget";
import { useTheme } from "@/context/ThemeContext";
import { useHoverIntent } from "@/hooks/useHoverIntent";
import { FirstVisitTooltip } from "./FirstVisitTooltip";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { OnboardingProvider } from "@/context/OnboardingContext";
import { loadPortalOpenState, savePortalOpenState } from "@/lib/chatHelpers";
import { extractPageContext, pushPageContext } from "@/lib/chat/pageContext";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  /** If set to false, this item is hidden from the sidebar */
  visible?: boolean;
  /** If true, renders indented as a sub-item */
  indent?: boolean;
  /** Q17: only show this item if the client is subscribed to a service whose id starts with this prefix */
  requires?: string;
}

function useActiveServicePrefixes(): Set<string> {
  const { data } = useQuery<{ services: { service_id: string; status: string }[] }>({
    queryKey: ["/api/portal/services"],
    queryFn: async () => {
      const res = await fetch("/api/portal/services", { credentials: "include" });
      if (!res.ok) return { services: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  // Defensive: this query key is shared with PortalDashboard, whose queryFn
  // may have stored the raw array in cache. Handle both shapes.
  const raw: unknown = Array.isArray(data) ? data : (data as { services?: unknown })?.services;
  const services: { service_id: string; status: string }[] = Array.isArray(raw) ? raw : [];
  const prefixes = new Set<string>();
  for (const s of services) {
    if (!s.service_id || s.status === "cancelled" || s.status === "completed") continue;
    // service_id like "mapguard-setup" / "mapguard-ongoing" / "rankflow" — take first dash-separated segment
    const prefix = s.service_id.split("-")[0];
    if (prefix) prefixes.add(prefix);
  }
  return prefixes;
}

function useHasRankFlow(): boolean {
  // Kept for any callers outside this file; thin wrapper over useActiveServicePrefixes.
  const { data } = useQuery<{ services: { service_id: string; status: string }[] }>({
    queryKey: ["/api/portal/services"],
    queryFn: async () => {
      const res = await fetch("/api/portal/services", { credentials: "include" });
      if (!res.ok) return { services: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const raw: unknown = Array.isArray(data) ? data : (data as { services?: unknown })?.services;
  const services: { service_id: string; status: string }[] = Array.isArray(raw) ? raw : [];
  return services.some(
    (s) => s.service_id?.startsWith("rankflow") && s.status !== "cancelled"
  );
}

function buildNavItems(active: Set<string>): NavItem[] {
  const items: NavItem[] = [
    { label: "Overview", href: "/portal", icon: LayoutDashboard },
    { label: "Services", href: "/portal/services", icon: Wrench },
    /* Unified owner-facing AI control — ONE assistant across every placement
       (calculator / website / phone). Top-level + ungated: it explains the
       placements and shows "Build one" / "Set up" when nothing is configured,
       so it's useful to every account, not just those who already own a
       calculator or TradeLine. */
    { label: "Your AI assistant", href: "/portal/ai-assistant", icon: Sparkles },
    /* Marketing Hub — the "growth engine" front door. Always visible (ungated):
       the hub itself shows owned products as "Open" and the rest as add-ons, so
       it's useful to every account as a discovery surface. */
    { label: "Marketing", href: "/portal/marketing", icon: Rocket },
    /* Service-gated product tabs — only shown when the client has the matching
       subscription (Q17). Labels use the canonical product brand name (premium
       SaaS brand consistency) — customers see these brand names in billing,
       catalog, and marketing surfaces. */
    { label: "TradeLine", href: "/portal/tradeline/setup", icon: Phone, requires: "tradeline" },
    { label: "AI Receptionists", href: "/portal/tradeline/receptionists", icon: Sparkles, indent: true, requires: "tradeline" },
    { label: "QuoteQuick", href: "/dashboard", icon: Calculator, requires: "quotequick" },
    { label: "Lead Analytics", href: "/portal/quotequick/leads", icon: TrendingUp, indent: true, requires: "quotequick" },
    { label: "Calculator Templates", href: "/portal/quotequick/templates", icon: Sparkles, indent: true, requires: "quotequick" },
    { label: "ReputationShield", href: "/portal/reviews", icon: Star, requires: "reputationshield" },
    { label: "Review Widget", href: "/portal/reviews/widget", icon: Code, indent: true, requires: "reputationshield" },
    { label: "SocialSync", href: "/portal/socialsync", icon: Share2, requires: "socialsync" },
    { label: "RankFlow", href: "/portal/rankflow", icon: TrendingUp, requires: "rankflow" },
    /* "ContentFlow" (formerly "Content"/"Articles") shows for every customer — the page renders empty states
       for customers without RankFlow/SocialSync content. Matches the always-visible pattern
       of "Today's jobs", "Invoices", "Billing", "Add Services". ContentFlow Phase B7. */
    { label: "ContentFlow", href: "/portal/articles", icon: FileText },
    { label: "Content Style", href: "/portal/content-preferences", icon: Sparkles, indent: true },
    { label: "Content Examples", href: "/portal/contentflow/examples", icon: ImageIcon, indent: true },
    { label: "MapGuard", href: "/portal/mapguard", icon: MapPin, requires: "mapguard" },
    /* Wave 43 — SiteLaunch + WebFix product tabs. Service-gated like
       every other product entry. Without these the only way for a
       sitelaunch/webfix subscriber to reach their project was via the
       Services list, and the marketing catalog correctly reported
       "subscribed to every service" — but the sidebar didn't show it. */
    { label: "SiteLaunch", href: "/portal/sitelaunch", icon: LayoutIcon, requires: "sitelaunch" },
    { label: "WebFix", href: "/portal/webfix", icon: Hammer, requires: "webfix" },
    /* 2026-05-30: WebCare, AdFlow and Citation Builder are active products
     * with portal dashboards, but had no sidebar entry — a subscribed client
     * had no way to reach them. Gated by `requires` like every other product. */
    { label: "WebCare", href: "/portal/webcare/dashboard", icon: ShieldCheck, requires: "webcare" },
    { label: "AdFlow", href: "/portal/adflow/dashboard", icon: Zap, requires: "adflow" },
    { label: "CiteFlow", href: "/portal/citation-builder", icon: ClipboardList, requires: "citationbuilder" },
    /* Wave 36 — AI Insights nav entry removed. The Action Stack is now inline
       on /portal and every product dashboard; the standalone page redirects
       there. Discovery is now via the AI Copilot. */
    /* BookFlow tabs are always visible — every customer has a job
       calendar and an invoice ledger, even if they're empty. The
       child pages render their own empty states. */
    { label: "Today's jobs", href: "/portal/dispatch", icon: Calendar },
    { label: "BookFlow Setup", href: "/portal/bookflow-setup", icon: Settings, indent: true },
    { label: "Invoices", href: "/portal/invoices", icon: Receipt },
    { label: "Billing", href: "/portal/billing", icon: CreditCard },
    /* AJ-5 portal API access — developer portal entry for the public API platform */
    { label: "API Access", href: "/portal/api-access", icon: Key },
    /* W-AO-6d — QuoteQuick Brand Kits (Pro $29 tier upsell). Always visible
       in the sidebar; the page itself shows the Pro upsell when the user
       doesn't have a Pro+ calculator. */
    { label: "Brand Kits", href: "/portal/brand-kits", icon: Palette },
    /* Q16: dedicated entry-point to the in-portal service catalog */
    { label: "Add Services", href: "/portal/catalog", icon: Plus },
    /* Free Tools — foundation wave (Local Business Schema generator + future
       widgets). Top-level entry routes to the index; sub-items mirror the
       existing nested-section pattern (e.g. ContentFlow → Content Style). */
    { label: "Free Tools", href: "/portal/free-tools", icon: Gift },
    { label: "Schema Generator", href: "/portal/free-tools/schema", icon: FileCode2, indent: true },
    { label: "Review Link", href: "/portal/free-tools/review-link", icon: Star, indent: true },
    { label: "Callback Form", href: "/portal/free-tools/callback", icon: PhoneCall, indent: true },
    { label: "Service Area Map", href: "/portal/free-tools/service-area", icon: MapPin, indent: true },
    { label: "Help", href: "/portal/help", icon: HelpCircle },
    { label: "Settings", href: "/portal/settings", icon: Settings },
  ];
  return items.filter((item) => {
    if (item.visible === false) return false;
    if (item.requires && !active.has(item.requires)) return false;
    return true;
  });
}

function isActive(location: string, href: string): boolean {
  if (href === "/portal") return location === "/portal";
  return location.startsWith(href);
}

export default function PortalLayout({
  children,
  chatContext,
  breadcrumb,
  compact = false,
}: {
  children: React.ReactNode;
  /** Optional page-specific context for the global assistant (e.g. onboarding form fields) */
  chatContext?: PortalChatContext;
  /** Optional breadcrumb slot rendered in the top bar instead of the static nav-item label.
   *  Pages that want a deeper trail (e.g. "Services › Connect Calendar") pass a fragment here. */
  breadcrumb?: React.ReactNode;
  /**
   * Compact mode — hides the sidebar on mobile and removes content padding
   * so the page surface reads as a "field-worker mobile app" (large tap
   * targets, single-column content, minimal chrome). On desktop, the
   * sidebar still renders normally. Used by /portal/dispatch.
   */
  compact?: boolean;
}) {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  /* AI Copilot panel open/close — the trigger lives in the top navbar
   * (mirrors the admin AdminLayout → AdminCopilot pattern).
   *
   * PortalLayout re-mounts on every portal route change, so a plain
   * useState(false) would slam the panel closed on every navigation.
   * Hydrate from localStorage on mount and persist on every toggle so
   * the copilot stays open as the customer clicks through the portal. */
  const [copilotOpen, setCopilotOpenState] = useState<boolean>(() => loadPortalOpenState());
  const setCopilotOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    setCopilotOpenState((prev) => {
      const resolved = typeof next === "function" ? (next as (p: boolean) => boolean)(prev) : next;
      savePortalOpenState(resolved);
      return resolved;
    });
  };

  /* Page-context sync — every portal route change pushes a fresh snapshot
   * onto the shared ring buffer so the next chat turn carries the user's
   * recent navigation trail (route + title + visible entities + DOM
   * excerpt). Delayed one tick so document.title has time to update. */
  useEffect(() => {
    const t = window.setTimeout(() => {
      pushPageContext(extractPageContext(location));
    }, 0);
    return () => window.clearTimeout(t);
  }, [location]);

  const activePrefixes = useActiveServicePrefixes();
  const NAV_ITEMS = buildNavItems(activePrefixes);
  const breadcrumbItems = useBreadcrumbs();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // Server unreachable — still clear local state
    }
    queryClient.setQueryData(["auth", "me"], null);
    queryClient.clear();
    navigate("/login");
  };

  const initials = (user?.name || user?.email || "C").charAt(0).toUpperCase();

  /* Enriched account menu — open-on-hover (with intent), still click- +
   * keyboard-accessible. Dark-mode toggle now lives inside the menu. */
  const accountMenu = useHoverIntent();
  const { resolved: resolvedTheme, setTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";

  /* Plan/trial row: the portal has no trial flag, but the billing endpoint
   * exposes the next scheduled payment — a useful "your plan" cue. Reuses the
   * same query key as PortalBilling so it's served from cache when available.
   * Omitted gracefully (no row) when there's no upcoming charge. */
  const { data: billingSummary } = useQuery<{
    summary?: { next_due_at: string | null; next_due_amount_cents: number | null };
  }>({
    queryKey: ["/api/portal/billing"],
    queryFn: async () => {
      const res = await fetch("/api/portal/billing", { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: !!user,
  });
  const nextDueAt = billingSummary?.summary?.next_due_at ?? null;
  const nextDueAmountCents = billingSummary?.summary?.next_due_amount_cents ?? null;
  const nextDueLabel =
    nextDueAt && nextDueAmountCents != null
      ? `$${(nextDueAmountCents / 100).toFixed(2)} due ${new Date(nextDueAt).toLocaleDateString("en-US", { day: "numeric", month: "short" })}`
      : null;

  return (
    <OnboardingProvider>
    {/* Portal shell is theme-aware — the previous hardcoded data-theme="light"
        wrapper here was removed so the customer's day/night choice (per
        wft_theme_preference) applies to the entire portal surface. */}
    <div style={{ display: "contents" }}>
    {/* Skip-to-content — visible only when keyboard-focused. Lets
        screen-reader / keyboard users bypass the sidebar nav and jump
        straight to the page body. */}
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:rounded-md focus:bg-brand-blue focus:text-white focus:text-sm focus:font-medium focus:shadow-lg"
    >
      Skip to main content
    </a>
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Mobile overlay — semantically a button (it's clickable to
          dismiss). Keyboard users get the same dismissal via the
          ChevronLeft button inside the sidebar. */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — full chrome on desktop. In compact mode the sidebar
          still mounts so a field worker can tap menu and slide it in for
          navigation; it just doesn't occupy layout space on small screens. */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-56 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-border">
          <Link href="/portal" className="flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" width={24} height={24} fill="none" aria-label="WeFixTrades">
              {/* Open checkbox — top-right corner open, check exits through it */}
              <path d="M12 7 H4 V20 H17 V12.5" stroke="#1E1E1E" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 13 11.5 16.5 21 5" stroke="#0d3cfc" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="leading-tight">
              <span className="text-sm font-bold text-foreground">
                We<span className="text-brand-blue">Fix</span>Trades
              </span>
              <span className="text-[10px] text-muted-foreground/70 block -mt-0.5">Client Portal</span>
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

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <div className="space-y-0.5">
            {NAV_ITEMS.filter((item) => item.visible !== false).map((item) => {
              const active = isActive(location, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  data-testid={
                    item.href === "/portal/free-tools"
                      ? "nav-free-tools"
                      : item.href === "/portal/free-tools/schema"
                      ? "nav-free-tools-schema"
                      : undefined
                  }
                  className={cn(
                    // Wave 104 — font-medium on EVERY state so navigating
                    // doesn't widen the row text. Active state still
                    // distinguished via the tint background + 3px brand
                    // bar (before:) + brand color. Previously the active
                    // state alone bolded the label and the row reflowed
                    // on navigation — Alex reported this as "hover shift".
                    "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors min-h-[44px]",
                    item.indent ? "pl-9 pr-3 py-2" : "px-3 py-2.5",
                    active
                      ? "relative bg-[#EEF3FF]/60 dark:bg-brand-blue/15 text-brand-blue before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-5 before:bg-brand-blue before:rounded-r-sm"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-brand-blue" : "text-muted-foreground/70")} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-border px-4 py-3">
          <p className="text-[11px] text-muted-foreground/70">WeFixTrades Client Portal</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between h-14 px-4 bg-card text-card-foreground border-b border-border shrink-0">
          <div className="flex items-center min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden mr-2 min-h-[44px] min-w-[44px]"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </Button>
            {/* Wave 12B Bug #1 — quick exit back to marketing site. Sits
             *  immediately after the mobile menu button so it reads as
             *  part of the top-bar nav. Border-highlight on hover (not a
             *  shift) per Wave 11A rule. Session is preserved — clicking
             *  doesn't log the user out, the marketing site just opens. */}
            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1.5 mr-3 px-2 py-1 text-xs text-muted-foreground rounded-md border border-transparent hover:border-border hover:text-foreground transition-colors"
              data-testid="portal-back-to-website"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back to website
            </Link>
            <h1 className="text-sm font-medium text-foreground flex items-center gap-1.5 min-w-0 truncate">
              {breadcrumb ?? (NAV_ITEMS.find((item) => isActive(location, item.href))?.label ?? "Portal")}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* AI Copilot trigger — icon + label so users immediately
                recognise it as the AI assistant, not a plain chat bubble.
                Wrapped in FirstVisitTooltip so new portal users discover the
                assistant on their first visit. Label is visible at every
                breakpoint so the affordance is obvious on mobile too.
                `enabled` scopes the auto-show to the dashboard only — the
                trigger mounts on every portal route, so without this gate the
                coachmark re-appeared page-after-page (it's only marked visited
                on dismiss) and, on mobile, stacked over page-level coachmarks
                (e.g. /services), burying the H1 + primary CTA. */}
            <FirstVisitTooltip
              storageKey="portal-topnav-ai-copilot"
              enabled={location === "/portal" || location === "/portal/dashboard"}
              title="Meet your WeFixTrades assistant"
              position="bottom"
              align="end"
              anchor={
                <button
                  type="button"
                  onClick={() => setCopilotOpen((v) => !v)}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-colors",
                    copilotOpen
                      ? "bg-brand-blue/10 text-brand-blue"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                  title="WeFixTrades assistant"
                  aria-pressed={copilotOpen}
                  data-testid="portal-copilot-trigger"
                >
                  <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Assistant</span>
                </button>
              }
            >
              Ask questions, get help filling out forms, and navigate the portal hands-free.
            </FirstVisitTooltip>
            {/* Enriched account / settings menu — opens on hover (with
             *  intent) and stays click- + keyboard-accessible. The day/night
             *  toggle now lives INSIDE this menu rather than as a separate
             *  top-bar button. */}
            <div
              className="relative"
              onMouseEnter={accountMenu.onMouseEnter}
              onMouseLeave={accountMenu.onMouseLeave}
            >
              <DropdownMenu open={accountMenu.open} onOpenChange={accountMenu.setOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    className="w-8 h-8 min-w-[44px] min-h-[44px] rounded-full bg-brand-blue flex items-center justify-center hover:ring-2 hover:ring-brand-blue/20 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40"
                    aria-label="Account and settings menu"
                    data-testid="portal-account-menu-trigger"
                  >
                    <span className="text-white text-[10px] font-bold">{initials}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-64"
                  onMouseEnter={accountMenu.onMouseEnter}
                  onMouseLeave={accountMenu.onMouseLeave}
                >
                  {/* Header — avatar + name + email */}
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <div className="w-8 h-8 rounded-full bg-brand-blue flex items-center justify-center shrink-0">
                      <span className="text-white text-xs font-bold">{initials}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{user?.name || "Client"}</p>
                      <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    </div>
                  </div>
                  {/* Plan / next-payment row — only when the billing endpoint
                   *  returns an upcoming charge; omitted gracefully otherwise. */}
                  {nextDueLabel && (
                    <div className="mx-2 mb-1 flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground truncate">
                        <CreditCard className="w-3.5 h-3.5 text-brand-blue shrink-0" aria-hidden="true" />
                        <span className="truncate">{nextDueLabel}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate("/portal/billing")}
                        className="text-xs font-medium text-brand-blue hover:underline shrink-0"
                        data-testid="portal-account-manage-plan"
                      >
                        Manage
                      </button>
                    </div>
                  )}
                  <DropdownMenuSeparator />
                  {/* Portal CRM — customer database. Intentionally lives HERE
                   *  under the account menu (not a primary sidebar item) so it
                   *  doesn't overclutter the portal for clients who don't use
                   *  it. See /portal/customers. */}
                  <DropdownMenuItem onClick={() => navigate("/portal/customers")} data-testid="portal-account-customers">
                    <Users className="w-4 h-4 mr-2 text-muted-foreground" /> Customers
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/portal/settings")}>
                    <User className="w-4 h-4 mr-2 text-muted-foreground" /> Profile &amp; Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/portal/billing")}>
                    <CreditCard className="w-4 h-4 mr-2 text-muted-foreground" /> Account &amp; Billing
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/portal/help")}>
                    <HelpCircle className="w-4 h-4 mr-2 text-muted-foreground" /> Help &amp; Support
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {/* Dark-mode toggle — moved INSIDE the menu (reuses
                   *  ThemeContext). Stays open on click. */}
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setTheme(isDarkTheme ? "light" : "dark");
                    }}
                    data-testid="portal-account-dark-mode-toggle"
                  >
                    {isDarkTheme ? (
                      <Moon className="w-4 h-4 mr-2 text-muted-foreground" />
                    ) : (
                      <Sun className="w-4 h-4 mr-2 text-muted-foreground" />
                    )}
                    <span className="flex-1">Dark Mode</span>
                    <span
                      className={cn(
                        "ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                        isDarkTheme ? "bg-brand-blue/10 text-brand-blue" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {isDarkTheme ? "On" : "Off"}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                    <LogOut className="w-4 h-4 mr-2" /> Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Q20: admin-preview banner — only shown when an admin user is
            viewing the customer portal. Lets them exit cleanly back to
            /admin/crm so they don't accidentally stay in customer view. */}
        {user?.role === "admin" && (
          <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 flex items-center justify-between gap-3" data-testid="admin-preview-banner">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-600 text-white shrink-0">
                Admin Preview
              </span>
              <span className="text-xs text-amber-900 truncate">
                You're viewing the customer portal. Test as a regular user — your admin session is untouched.
              </span>
            </div>
            <a
              href="/admin/crm"
              className="text-xs font-medium text-amber-900 hover:text-amber-950 underline whitespace-nowrap shrink-0"
              data-testid="exit-admin-preview"
            >
              Exit to Admin →
            </a>
          </div>
        )}

        {/* Page content.
         *
         * Canonical portal container shape (single source of truth — pages
         * must NOT add their own max-w / mx-auto / px-*):
         *   - flex-1 min-w-0 lets <main> shrink correctly inside the flex
         *     parent so wide tables never push the page past the viewport
         *   - overflow-y-auto for vertical scroll
         *   - overflow-x-hidden contains accidental child overflow inside
         *     the portal chrome (the page never grows a horizontal scrollbar
         *     at the document level)
         *
         * Inner wrapper centres + caps the content:
         *   - max-w-screen-2xl (1536px) — generous for tables, narrow
         *     enough that lines don't stretch uncomfortably on ultrawides
         *   - mx-auto w-full to centre when shorter than the cap
         *   - px-4 sm:px-6 lg:px-8 + py-6 — consistent gutters & rhythm
         *
         * Compact mode (PR #590, used by /portal/dispatch): drops the
         * horizontal gutter on mobile so the dispatch surface reads
         * full-bleed as a "field-worker mobile app". Desktop keeps the
         * canonical gutters so the page sits inside the same shell as
         * every other portal page.
         */}
        <main
          id="main-content"
          className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden"
          tabIndex={-1}
        >
          <div
            className={cn(
              "max-w-screen-2xl mx-auto w-full py-6",
              compact ? "px-0 lg:px-8" : "px-4 sm:px-6 lg:px-8"
            )}
          >
            {breadcrumbItems.length > 0 && !compact && (
              <Breadcrumbs items={breadcrumbItems} className="mb-4" />
            )}
            {children}
          </div>
        </main>
      </div>

      {/* Global portal AI Copilot — opened from the top-navbar trigger */}
      <PortalChatWidget
        chatContext={chatContext}
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
      />
    </div>
    </div>
    </OnboardingProvider>
  );
}
