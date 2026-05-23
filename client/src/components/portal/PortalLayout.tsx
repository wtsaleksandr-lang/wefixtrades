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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PortalChatWidget, { type PortalChatContext } from "./PortalChatWidget";
import { OnboardingProvider } from "@/context/OnboardingContext";

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
    /* Service-gated tabs — only shown when the client has the matching subscription (Q17) */
    { label: "Reviews", href: "/portal/reviews", icon: Star, requires: "reputationshield" },
    { label: "Review Widget", href: "/portal/reviews/widget", icon: Code, indent: true, requires: "reputationshield" },
    { label: "Social Media", href: "/portal/socialsync", icon: Share2, requires: "socialsync" },
    { label: "SEO", href: "/portal/rankflow", icon: TrendingUp, requires: "rankflow" },
    /* "Content" (formerly "Articles") shows for every customer — the page renders empty states
       for customers without RankFlow/SocialSync content. Matches the always-visible pattern
       of "Today's jobs", "Invoices", "Billing", "Add Services". ContentFlow Phase B7. */
    { label: "Content", href: "/portal/articles", icon: FileText },
    { label: "Content Style", href: "/portal/content-preferences", icon: Sparkles, indent: true },
    { label: "MapGuard", href: "/portal/mapguard", icon: MapPin, requires: "mapguard" },
    /* BookFlow tabs are always visible — every customer has a job
       calendar and an invoice ledger, even if they're empty. The
       child pages render their own empty states. */
    { label: "Today's jobs", href: "/portal/dispatch", icon: Calendar },
    { label: "Booking page", href: "/portal/bookflow-setup", icon: Settings, indent: true },
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
  // AI Copilot panel open/close — the trigger lives in the top navbar
  // (mirrors the admin AdminLayout → AdminCopilot pattern).
  const [copilotOpen, setCopilotOpen] = useState(false);
  const activePrefixes = useActiveServicePrefixes();
  const NAV_ITEMS = buildNavItems(activePrefixes);

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

  return (
    <OnboardingProvider>
    <div data-theme="light" style={{ display: "contents" }}>
    {/* Skip-to-content — visible only when keyboard-focused. Lets
        screen-reader / keyboard users bypass the sidebar nav and jump
        straight to the page body. */}
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:rounded-md focus:bg-[#0d3cfc] focus:text-white focus:text-sm focus:font-medium focus:shadow-lg"
    >
      Skip to main content
    </a>
    <div className="flex h-screen bg-[#F6F7F9] overflow-hidden">
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
          "fixed inset-y-0 left-0 z-40 flex w-56 flex-col bg-white border-r border-gray-200 transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100">
          <Link href="/portal" className="flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" width={24} height={24} fill="none" aria-label="WeFixTrades">
              {/* Open checkbox — top-right corner open, check exits through it */}
              <path d="M12 7 H4 V20 H17 V12.5" stroke="#1E1E1E" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 13 11.5 16.5 21 5" stroke="#0d3cfc" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="leading-tight">
              <span className="text-sm font-bold text-gray-900">
                We<span className="text-[#0d3cfc]">Fix</span>Trades
              </span>
              <span className="text-[10px] text-gray-400 block -mt-0.5">Client Portal</span>
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
                  className={cn(
                    "flex items-center gap-3 rounded-lg text-sm transition-colors min-h-[44px]",
                    item.indent ? "pl-9 pr-3 py-2" : "px-3 py-2.5",
                    active
                      // Premium polish — whisper-light tint + 3px left-edge brand bar
                      // (via ::before) so the active row reads as "pinned" not "filled".
                      ? "relative bg-[#EEF3FF]/60 text-[#0d3cfc] font-medium before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-5 before:bg-[#0d3cfc] before:rounded-r-sm"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-[#0d3cfc]" : "text-gray-400")} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-100 px-4 py-3">
          <p className="text-[11px] text-gray-400">WeFixTrades Client Portal</p>
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
            <h1 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              {breadcrumb ?? (NAV_ITEMS.find((item) => isActive(location, item.href))?.label ?? "Portal")}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* AI Copilot trigger — icon + label so users immediately
                recognise it as the AI assistant, not a plain chat bubble. */}
            <button
              type="button"
              onClick={() => setCopilotOpen((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium transition-colors",
                copilotOpen
                  ? "bg-[#0d3cfc]/10 text-[#0d3cfc]"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
              title="AI Copilot — your assistant"
              aria-pressed={copilotOpen}
              data-testid="portal-copilot-trigger"
            >
              <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">AI Copilot</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-8 h-8 min-w-[44px] min-h-[44px] rounded-full bg-[#0d3cfc] flex items-center justify-center hover:ring-2 hover:ring-[#0d3cfc]/20 transition-shadow">
                  <span className="text-white text-[10px] font-bold">{initials}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900 truncate">{user?.name || "Client"}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
                <DropdownMenuItem onClick={() => navigate("/portal/settings")}>
                  <Settings className="w-4 h-4 mr-2 text-gray-500" /> Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="w-4 h-4 mr-2" /> Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

        {/* Page content — in compact mode, drop padding on mobile so field
            surfaces (Dispatch) can render full-bleed; padding returns at lg. */}
        <main
          id="main-content"
          className={cn(
            "flex-1 overflow-y-auto",
            compact ? "p-0 lg:p-6" : "p-4 md:p-6"
          )}
          tabIndex={-1}
        >
          {children}
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
