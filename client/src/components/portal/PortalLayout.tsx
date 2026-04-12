import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Wrench,
  CreditCard,
  ShieldCheck,
  Share2,
  Settings,
  HelpCircle,
  ChevronLeft,
  Menu,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useState, lazy, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PortalChatWidget = lazy(() => import("./PortalChatWidget"));
import { OnboardingProvider } from "@/context/OnboardingContext";

const NAV_ITEMS = [
  { label: "Overview", href: "/portal", icon: LayoutDashboard },
  { label: "Services", href: "/portal/services", icon: Wrench },
  { label: "Social Media", href: "/portal/socialsync", icon: Share2 },
  { label: "Reputation", href: "/portal/reputation", icon: ShieldCheck },
  { label: "Billing", href: "/portal/billing", icon: CreditCard },
  { label: "Help", href: "/portal/help", icon: HelpCircle },
  { label: "Settings", href: "/portal/settings", icon: Settings },
];

function isActive(location: string, href: string): boolean {
  if (href === "/portal") return location === "/portal";
  return location.startsWith(href);
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

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
          "fixed inset-y-0 left-0 z-40 flex w-56 flex-col bg-white border-r border-gray-200 transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100">
          <Link href="/portal" className="flex items-center gap-2.5">
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
              <span className="text-sm font-bold text-gray-900">
                We<span className="text-[#2D6A4F]">Fix</span>Trades
              </span>
              <span className="text-[10px] text-gray-400 block -mt-0.5">Client Portal</span>
            </div>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 rounded hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const active = isActive(location, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[44px]",
                    active
                      ? "bg-[#F0F7F4] text-[#2D6A4F] font-medium"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-[#2D6A4F]" : "text-gray-400")} />
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
            >
              <Menu className="w-5 h-5" />
            </Button>
            <h1 className="text-sm font-medium text-gray-700">
              {NAV_ITEMS.find((item) => isActive(location, item.href))?.label ?? "Portal"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-8 h-8 min-w-[44px] min-h-[44px] rounded-full bg-[#2D6A4F] flex items-center justify-center hover:ring-2 hover:ring-[#2D6A4F]/20 transition-shadow">
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

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>

      {/* Global portal AI assistant */}
      <Suspense fallback={null}>
        <PortalChatWidget />
      </Suspense>
    </div>
    </OnboardingProvider>
  );
}
